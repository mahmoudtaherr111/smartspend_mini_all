import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getClientIp } from "./lib/get-client-ip";
import { smsApp } from "./sms-router";
import { createHmac } from "crypto";
import { grantProSubscription } from "./lib/subscription-service";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import cron from "node-cron";
import { csrf } from "hono/csrf";
import { streamSSE } from "hono/streaming";
import { otpEvents } from "./services/whatsapp-service";
import { db } from "./queries/connection";
import { sessions, classificationLogs } from "../db/schema";
import { lt } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { whatsappService } from "./services/whatsapp-service";
import { processScheduledNotifications, seedDefaultTemplates, checkAndTriggerSmartActivityNotifications } from "./notification-engine";
import { warmupEmbeddingEngine } from "./lib/embedding-engine";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}

// Cron job to clean up expired sessions daily at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    console.log(`[Cron] Cleaned up expired sessions`);
  } catch (error) {
    console.error("[Cron] Failed to clean up expired sessions:", error);
  }
});

// Cron job to clean up classification logs older than 180 days (Sundays at 3 AM)
cron.schedule("0 3 * * 0", async () => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    const result = await db.delete(classificationLogs).where(
      lt(classificationLogs.createdAt, cutoff)
    );
    console.log(`[CRON] Cleaned up old classification logs, cutoff: ${cutoff.toISOString()}`);
  } catch (err) {
    console.error("[CRON] Classification logs cleanup failed:", err);
  }
});

// Seed default templates on server boot
seedDefaultTemplates().catch((err) => {
  console.error("[Boot] Failed to seed default notification templates:", err);
});

// Warmup embedding engine (local index + Fireworks descriptor index)
// Non-blocking — runs in background. Prevents 10-30s delay on first classification.
warmupEmbeddingEngine(undefined, process.env.FIREWORKS_API_KEY || "");

// Cron job for processing scheduled and event-based notifications
cron.schedule("* * * * *", async () => {
  try {
    await processScheduledNotifications();
  } catch (error) {
    console.error("[Cron] Failed to process scheduled notifications:", error);
  }
});

// Daily smart inactivity and conversion notifications cron at 8:00 PM (20:00)
cron.schedule("0 20 * * *", async () => {
  try {
    console.log("[Cron] Running daily smart activity notifications check...");
    await checkAndTriggerSmartActivityNotifications();
  } catch (error) {
    console.error("[Cron] Failed to process smart activity notifications:", error);
  }
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

const app = new Hono();

app.use("*", logger());

// ─── CORS: supports monorepo mode (APP_URL) and separate-deploy mode (FRONTEND_URL) ───
const allowedOrigins = Array.from(
  new Set([env.APP_URL, env.FRONTEND_URL].filter(Boolean) as string[]),
);
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
          origin.endsWith(".lhr.life")
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
          origin.endsWith(".lhr.life")
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
      return c.html(html);
    } catch (e) {
      console.error("Failed to serve index.html fallback", e);
    }
  }
  console.warn("404 Not Found:", c.req.url);
  return c.json({ error: "Not Found" }, 404);
});

// Google OAuth callback (server-side redirect)
app.get("/api/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ error: "No code provided" }, 400);

  try {
    const caller = appRouter.createCaller(await createContext(c.req));
    const result = await caller.auth.googleCallback({ code });

    // Set cookie and redirect to frontend
    c.header(
      "Set-Cookie",
      `google_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return c.redirect(`${env.APP_URL}/auth/callback?token=${result.token}`);
  } catch (error) {
    return c.redirect(`${env.APP_URL}/login?error=auth_failed`);
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
    if (calculatedHmac !== hmacParam) {
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
    const plan = (extraData.plan || "pro_monthly") as
      | "pro_monthly"
      | "pro_yearly";

    const PLAN_PRICES_EGP: Record<string, number> = {
      pro_monthly: 49,
      pro_yearly: 499,
    };

    const expectedAmountCents = PLAN_PRICES_EGP[plan]
      ? PLAN_PRICES_EGP[plan] * 100
      : null;

    if (userId && (userType === "oauth" || userType === "local")) {
      if (expectedAmountCents !== null && obj.amount_cents) {
        const paidCents = Number(obj.amount_cents);
        if (paidCents < expectedAmountCents) {
          console.warn(
            `Paymob webhook: amount mismatch — expected ${expectedAmountCents} cents for ${plan}, got ${paidCents}. Rejecting.`,
          );
          return c.json({ error: "Amount mismatch" }, 400);
        }
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

  app.use("/*", serveStatic({ root: "./dist/public" }));

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
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws, request) => {
    handleVoiceCallWebSocket(ws, request);
  });
}

// Auto-start WhatsApp service if credentials exist
const sessionDir = path.join(process.cwd(), "whatsapp_auth_info");
if (fs.existsSync(path.join(sessionDir, "creds.json"))) {
  console.log("[WhatsApp] Found existing credentials, auto-starting service...");
  whatsappService.start().catch((err) => {
    console.error("[WhatsApp] Failed to auto-start WhatsApp service:", err);
  });
}

export { app };
export default {
  port: parseInt(env.PORT),
  fetch: app.fetch,
};
