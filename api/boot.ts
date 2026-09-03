import "dotenv/config";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getClientIp } from "./lib/get-client-ip";
import { smsApp } from "./sms-router";
import { createHmac, timingSafeEqual } from "crypto";
import { grantProSubscription } from "./lib/subscription-service";
import { buildGoogleAuthorizationUrl, createOAuthState } from "./auth-router";
import { getBillingPlan, hasExactPlanAmount, isBillingPlan } from "../contracts/plans";
import { isPaymobWebhookVerificationConfigured } from "./lib/paymob";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import cron from "node-cron";
import { csrf } from "hono/csrf";
import { streamSSE } from "hono/streaming";
import { otpEvents } from "./services/whatsapp-service";
import { db } from "./queries/connection";
import { sessions, classificationLogs, authChallenges } from "../db/schema";
import { lt } from "drizzle-orm";
import { installProviderHealthReporter } from "./lib/provider-health";
import fs from "fs";
import path from "path";
import { whatsappService } from "./services/whatsapp-service";
import { processScheduledNotifications, seedDefaultTemplates, checkAndTriggerSmartActivityNotifications } from "./notification-engine";
import { warmupEmbeddingEngine } from "./lib/embedding-engine";
import { withScheduledJobLock } from "./services/scheduler-lock";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}

const cronsEnabled = env.ENABLE_CRONS === "true";

function scheduleProtectedJob(
  expression: string,
  jobName: string,
  task: () => Promise<void>,
) {
  if (!cronsEnabled) return;
  cron.schedule(expression, () =>
    withScheduledJobLock(jobName, task).catch((error) => {
      console.error(`[Cron] ${jobName} failed:`, error);
    }),
  );
}

if (cronsEnabled) {
  // A seed can write data, so it must follow the same explicit scheduler flag
  // and cross-replica lock as periodic work.
  void withScheduledJobLock("seed-default-templates", async () => {
    await seedDefaultTemplates();
  }).catch((err) => console.error("[Boot] Failed to seed notification templates:", err));
} else {
  console.info("[Boot] Background jobs disabled; set ENABLE_CRONS=true on one or more replicas.");
}

// Cron job to clean up sessions and expiring WebAuthn challenges daily.
scheduleProtectedJob("0 0 * * *", "daily-auth-cleanup", async () => {
  const now = new Date();
  await Promise.all([
    db.delete(sessions).where(lt(sessions.expiresAt, now)),
    db.delete(authChallenges).where(lt(authChallenges.expiresAt, now)),
  ]);
  console.log("[Cron] Cleaned expired sessions and WebAuthn challenges");
});

// Cron job to clean up classification logs older than 180 days (Sundays at 3 AM)
scheduleProtectedJob("0 3 * * 0", "classification-log-cleanup", async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  await db.delete(classificationLogs).where(lt(classificationLogs.createdAt, cutoff));
  console.log(`[Cron] Cleaned old classification logs, cutoff: ${cutoff.toISOString()}`);
});

// Warmup embedding engine (local index + Fireworks descriptor index)
// Non-blocking — runs in background. Prevents 10-30s delay on first classification.
warmupEmbeddingEngine(undefined, process.env.FIREWORKS_API_KEY || "");

// Cron job for processing scheduled and event-based notifications
scheduleProtectedJob("* * * * *", "scheduled-notifications", processScheduledNotifications);

// Daily smart inactivity and conversion notifications cron at 8:00 PM (20:00)
scheduleProtectedJob("0 20 * * *", "smart-activity-notifications", async () => {
  console.log("[Cron] Running daily smart activity notifications check...");
  await checkAndTriggerSmartActivityNotifications();
});

// Boot-time Redis health check (non-blocking — logs warning if unavailable)
import { getRedisClient, getCacheRuntimeStatus } from "./lib/redis-client";
(async () => {
  try {
    const client = await getRedisClient();
    const status = getCacheRuntimeStatus();
    if (client) {
      console.log(`✅ [Boot] Redis connected (backend: ${status.backend})`);
    } else if (status.memoryFallbackAllowed) {
      console.warn(`⚠️ [Boot] Redis unavailable — using in-memory cache fallback (backend: ${status.backend})`);
    } else {
      console.warn(`❌ [Boot] Redis unavailable and memory fallback disabled. Voice calls will NOT work.`);
    }
  } catch (err) {
    console.warn(`❌ [Boot] Redis health check failed:`, err instanceof Error ? err.message : err);
  }
})();

// Give the classification failover a place to record what it learns. Installed here
// rather than as an import side effect so unit tests can import the router without
// opening a database connection.
installProviderHealthReporter();

const app = new Hono();

app.use("*", logger());
app.use("*", compress());

let warnedAboutUntrustedProxy = false;
if (env.NODE_ENV === "production" && env.TRUST_PROXY !== "true") {
  console.warn(
    "[Boot] TRUST_PROXY is disabled. If this deployment is behind nginx/Cloudflare, set TRUST_PROXY=true or IP rate limits will see the proxy address.",
  );
}
app.use("*", async (c, next) => {
  if (
    env.NODE_ENV === "production" &&
    env.TRUST_PROXY !== "true" &&
    !warnedAboutUntrustedProxy &&
    (c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || c.req.header("cf-connecting-ip"))
  ) {
    warnedAboutUntrustedProxy = true;
    console.error(
      "[Security] Forwarded client-IP headers detected while TRUST_PROXY is disabled. Configure trusted proxy forwarding before relying on per-IP limits.",
    );
  }
  await next();
});

// ─── CORS: supports monorepo mode (APP_URL) and separate-deploy mode (FRONTEND_URL) ───
export const allowedOrigins = Array.from(
  new Set([env.APP_URL, env.FRONTEND_URL].filter(Boolean) as string[]),
);

/**
 * Validates WebSocket upgrade request origins to prevent Cross-Site WebSocket Hijacking (CSWSH).
 */
export function isAllowedWebSocketOrigin(origin: string | undefined, hostHeader?: string): boolean {
  // If no origin header is provided (e.g. non-browser clients, native apps, cURL), allow it.
  // Browsers ALWAYS send the Origin header on cross-origin WebSocket upgrade requests.
  if (!origin) {
    return true;
  }

  // Capacitor / Native mobile origins
  if (
    origin === "capacitor://localhost" ||
    origin === "ionic://localhost" ||
    origin === "http://localhost" ||
    origin === "https://localhost" ||
    origin.startsWith("capacitor://") ||
    origin.startsWith("ionic://")
  ) {
    return true;
  }

  // Configured allowed origins
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Same-origin check against Host header
  if (hostHeader) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === hostHeader) {
        return true;
      }
    } catch {}
  }

  // Development tunnel & local dev origins
  if (env.NODE_ENV === "development") {
    if (
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.endsWith(".loca.lt") ||
      origin.endsWith(".serveousercontent.com") ||
      origin.endsWith(".lhr.life") ||
      origin.endsWith(".trycloudflare.com") ||
      origin.endsWith(".ngrok-free.dev") ||
      origin.endsWith(".ngrok-free.app") ||
      origin.endsWith(".ngrok.app") ||
      origin.endsWith(".ngrok.io")
    ) {
      return true;
    }
  }

  return false;
}

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return allowedOrigins[0];
      if (env.NODE_ENV === "development") {
        if (
          origin.includes("localhost") ||
          origin.includes("127.0.0.1") ||
          origin.endsWith(".loca.lt") ||
          origin.endsWith(".serveousercontent.com") ||
          origin.endsWith(".lhr.life") ||
          origin.endsWith(".trycloudflare.com") ||
          origin.endsWith(".ngrok-free.dev") ||
          origin.endsWith(".ngrok-free.app") ||
          origin.endsWith(".ngrok.app") ||
          origin.endsWith(".ngrok.io")
        ) {
          return origin;
        }
      }
      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    credentials: true,
  }),
);

// CSRF Protection
app.use(
  "*",
  csrf({
    origin: (origin) => {
      if (!origin) return false;
      if (env.NODE_ENV === "development") {
        if (
          origin.includes("localhost") ||
          origin.includes("127.0.0.1") ||
          origin.endsWith(".loca.lt") ||
          origin.endsWith(".serveousercontent.com") ||
          origin.endsWith(".lhr.life") ||
          origin.endsWith(".trycloudflare.com") ||
          origin.endsWith(".ngrok-free.dev") ||
          origin.endsWith(".ngrok-free.app") ||
          origin.endsWith(".ngrok.app") ||
          origin.endsWith(".ngrok.io")
        ) {
          return true;
        }
      }
      return allowedOrigins.includes(origin);
    },
  }),
);

// Error handling
app.onError((err, c) => {
  console.error("Hono Error:", err);
  const isProd = env.NODE_ENV === "production";
  const message = isProd
    ? "حدث خطأ داخلي في الخادم. برجاء المحاولة لاحقاً."
    : err.message || "Internal Server Error";
  return c.json({ error: message }, 500);
});

app.notFound(async (c) => {
  if (env.NODE_ENV === "production" && !c.req.path.startsWith("/api/")) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const html = fs.readFileSync(
        path.resolve("./dist/public/index.html"),
        "utf-8",
      );
      c.header("Cache-Control", "public, max-age=0, must-revalidate");
      return c.html(html);
    } catch (e) {
      console.error("Failed to serve index.html fallback", e);
    }
  }
  console.warn("404 Not Found:", c.req.url);
  return c.json({ error: "Not Found" }, 404);
});

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function secureCookieSuffix() {
  return env.NODE_ENV === "production" ? "; Secure" : "";
}

function stateMatches(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

// State is established in a browser navigation so its HttpOnly cookie is
// present on the callback. This prevents OAuth login-CSRF account swapping.
app.get("/api/auth/google/start", (c) => {
  const state = createOAuthState();
  const host = c.req.header("x-forwarded-host") || c.req.header("host");
  const proto = c.req.header("x-forwarded-proto") || (host?.includes("ngrok") ? "https" : "http");
  const dynamicRedirectUri = host ? `${proto}://${host}/api/auth/google/callback` : undefined;
  const googleUrl = buildGoogleAuthorizationUrl(state, dynamicRedirectUri);
  if (!googleUrl) return c.json({ error: "Google OAuth is not configured" }, 503);
  c.header(
    "Set-Cookie",
    `oauth_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${secureCookieSuffix()}`,
  );
  if (dynamicRedirectUri) {
    c.header(
      "Set-Cookie",
      `oauth_redirect_uri=${encodeURIComponent(dynamicRedirectUri)}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${secureCookieSuffix()}`,
      { append: true },
    );
  }
  return c.redirect(googleUrl);
});

// Google OAuth callback (server-side redirect)
app.get("/api/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ error: "No code provided" }, 400);
  const stateCookie = readCookie(c.req.header("cookie"), "oauth_state");
  if (!stateMatches(stateCookie, c.req.query("state"))) {
    console.warn("Google OAuth callback rejected due to invalid state");
    return c.redirect(`/login?error=auth_failed`);
  }

  const redirectUriCookie = readCookie(c.req.header("cookie"), "oauth_redirect_uri");

  try {
    const caller = appRouter.createCaller(await createContext(c.req));
    const result = await caller.auth.googleCallback({ code, redirectUri: redirectUriCookie });

    // Set cookie and redirect to frontend
    c.header(
      "Set-Cookie",
      `google_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    c.header(
      "Set-Cookie",
      `oauth_state=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0${secureCookieSuffix()}`,
      { append: true },
    );
    c.header(
      "Set-Cookie",
      `oauth_redirect_uri=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0${secureCookieSuffix()}`,
      { append: true },
    );
    return c.redirect(`/dashboard`);
  } catch (error) {
    return c.redirect(`/login?error=auth_failed`);
  }
});

// tRPC endpoint
app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: async ({ req }) => createContext(req),
  }),
);

const sseRateLimit = new Map<string, { count: number; resetAt: number }>();

// ─── SSE Endpoint for Zero-Polling OTP Verification ───
app.get("/api/sse/otp", (c) => {
  const phone = c.req.query("phone");
  if (!phone) return c.text("Phone required", 400);

  const clientIp = getClientIp(c.req.raw) || 'unknown';
  const now = Date.now();
  const sseEntry = sseRateLimit.get(clientIp);
  if (sseEntry && sseEntry.resetAt > now && sseEntry.count >= 5) {
    return c.text('Too many SSE connections', 429);
  }
  if (!sseEntry || sseEntry.resetAt <= now) {
    sseRateLimit.set(clientIp, { count: 1, resetAt: now + 5 * 60 * 1000 });
  } else {
    sseEntry.count++;
  }

  return streamSSE(c, async (stream) => {
    const MAX_SSE_DURATION = 5 * 60 * 1000; // 5 minutes max to prevent memory leaks
    const startTime = Date.now();

    const listener = async (data: any) => {
      await stream.writeSSE({ data: JSON.stringify(data) });
    };
    
    otpEvents.on(`otp:${phone}`, listener);

    c.req.raw.signal.addEventListener("abort", () => {
      otpEvents.off(`otp:${phone}`, listener);
    });

    // Keep alive with max duration guard
    while (!c.req.raw.signal.aborted && (Date.now() - startTime) < MAX_SSE_DURATION) {
      await stream.sleep(15000);
      if (!c.req.raw.signal.aborted) {
        await stream.writeSSE({ event: "ping", data: "ping" });
      }
    }

    // Clean up listener on timeout (abort handler covers client disconnect)
    otpEvents.off(`otp:${phone}`, listener);
    if (!c.req.raw.signal.aborted) {
      await stream.writeSSE({ event: "timeout", data: JSON.stringify({ message: "SSE connection timed out. Reconnect if needed." }) });
    }
  });
});

// SMS Ingestion endpoints
app.route("/api/sms", smsApp);

app.post("/api/webhooks/paymob", async (c) => {
  const hmacParam = c.req.query("hmac");
  const raw = await c.req.text();
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    parsed = { raw };
  }
  console.info("[paymob webhook]", JSON.stringify(parsed));

  const secret = env.PAYMOB_HMAC_SECRET;
  if (env.NODE_ENV === "production" && !isPaymobWebhookVerificationConfigured()) {
    console.error("Paymob webhook rejected: PAYMOB_HMAC_SECRET is not configured");
    return c.json({ error: "Webhook verification is unavailable" }, 503);
  }
  if (secret) {
    if (!hmacParam) {
      console.warn(
        "Paymob webhook verification failed: Missing hmac query parameter",
      );
      return c.json({ error: "Missing signature" }, 401);
    }
    const obj = parsed.obj;
    if (!obj) {
      return c.json({ error: "Invalid payload: obj missing" }, 400);
    }

    // Concatenate standard Paymob HMAC fields in exact order
    const fields = [
      obj.amount_cents,
      obj.created_at,
      obj.currency,
      obj.error_occured,
      obj.has_parent_transaction,
      obj.id,
      obj.integration_id,
      obj.is_3d_secure,
      obj.is_auth,
      obj.is_capture,
      obj.is_voided,
      obj.is_refunded,
      obj.owner,
      obj.pending,
      obj.source_data?.pan,
      obj.source_data?.sub_type,
      obj.source_data?.type,
      obj.success,
    ];

    // Convert values to strings matching Paymob's serialization
    const hmacSource = fields
      .map((val) => {
        if (val === undefined || val === null) return "";
        if (typeof val === "boolean") return val ? "true" : "false";
        return String(val);
      })
      .join("");

    const calculatedHmac = createHmac("sha512", secret)
      .update(hmacSource)
      .digest("hex");
    const calculatedBuffer = Buffer.from(calculatedHmac, "hex");
    const receivedBuffer = Buffer.from(hmacParam, "hex");
    if (
      calculatedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(calculatedBuffer, receivedBuffer)
    ) {
      console.warn("Paymob webhook verification failed: signature mismatch");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // Handle successful transaction
  const obj = parsed.obj;
  if (obj && obj.success === true && !obj.pending) {
    const extraData =
      obj.payment_key_claims?.extra?.extras ||
      obj.payment_key_claims?.extra ||
      obj.extra_data ||
      obj.order?.extra_data ||
      {};
    const userId = Number(extraData.userId);
    const userType = extraData.userType;
    const plan = extraData.plan;
    const expectedAmountCents = isBillingPlan(plan)
      ? getBillingPlan(plan).amountCents
      : null;
    const paidCents = Number(obj.amount_cents);

    if (userId && (userType === "oauth" || userType === "local") && isBillingPlan(plan)) {
      if (!hasExactPlanAmount(plan, obj.amount_cents)) {
          console.warn(
            `Paymob webhook: amount mismatch — expected ${expectedAmountCents} cents for ${plan}, got ${paidCents}. Rejecting.`,
          );
          return c.json({ error: "Amount mismatch" }, 400);
        }

      console.info(
        `Granting Pro subscription to user ${userId} (${userType}) via Paymob webhook`,
      );
      try {
        await grantProSubscription({
          userId,
          userType,
          plan,
          paymentMethod:
            obj.payment_key_claims?.extra?.payment_method || "paymob",
          transactionId: String(obj.id),
        });
      } catch (err) {
        console.error("Failed to grant subscription in Paymob webhook:", err);
        return c.json({ error: "Failed to update subscription" }, 500);
      }
    } else {
      console.warn(
        "Paymob webhook: missing or invalid user metadata in extra_data",
        extraData,
      );
      return c.json({ error: "Invalid payment metadata" }, 400);
    }
  }

  return c.json({ ok: true });
});

// Health check
app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// Serve frontend static assets & run server in production mode
const isDirectBootEntry = !process.argv[1] || process.argv[1].includes("boot");
if (env.NODE_ENV === "production" && isDirectBootEntry) {
  const { serve } = await import("@hono/node-server");
  const { serveStatic } = await import("@hono/node-server/serve-static");

  app.use(
    "/*",
    serveStatic({
      root: "./dist/public",
      precompressed: true,
      onFound: (filePath, c) => {
        const reqPath = c.req.path;
        const isHtmlOrWorkerOrManifest =
          filePath.endsWith(".html") ||
          filePath.endsWith(".webmanifest") ||
          filePath.endsWith("sw.js") ||
          reqPath === "/" ||
          reqPath === "/manifest.webmanifest" ||
          reqPath === "/sw.js" ||
          reqPath === "/index.html";

        const cc = reqPath.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : isHtmlOrWorkerOrManifest
          ? "public, max-age=0, must-revalidate"
          : "public, max-age=86400";

        c.header("Cache-Control", cc);
        if (c.res) {
          c.res.headers.set("Cache-Control", cc);
        }
      },
    }),
  );

  const port = parseInt(env.PORT) || 3000;
  console.log(
    `🚀 SmartSpend Monorepo Server running on http://localhost:${port}`,
  );
  const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });

  // Bind WebSocket Server for Live Voice Calls in production mode
  const { WebSocketServer } = await import("ws");
  const { handleVoiceCallWebSocket } = await import("./services/voice-call-service");
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", "http://localhost");
    if (url.pathname.startsWith("/api/voice/live")) {
      const rawOrigin = request.headers.origin;
      const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
      const rawHost = request.headers.host;
      const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;

      if (!isAllowedWebSocketOrigin(origin, host)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws, request) => {
    handleVoiceCallWebSocket(ws, request);
  });
}

// WhatsApp is explicit because a stale credential file must not create an
// outbound Baileys connection during local development or every replica boot.
const sessionDir = path.join(process.cwd(), "whatsapp_auth_info");
if (env.ENABLE_WHATSAPP === "true" && fs.existsSync(path.join(sessionDir, "creds.json"))) {
  console.log("[WhatsApp] Starting explicitly enabled service...");
  whatsappService.start().catch((err) => {
    console.error("[WhatsApp] Failed to auto-start WhatsApp service:", err);
  });
} else if (fs.existsSync(path.join(sessionDir, "creds.json"))) {
  console.info("[WhatsApp] Credentials found but service is disabled; set ENABLE_WHATSAPP=true to start it.");
}

export { app };
export default {
  port: parseInt(env.PORT),
  fetch: app.fetch,
};
