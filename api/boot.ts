import "dotenv/config";
import { Hono, type Context as HonoContext } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { compress } from "hono/compress";
import { HTTPException } from "hono/http-exception";
import { httpsRedirect, securityHeaders } from "./lib/security-headers";
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
import {
  getBillingPlan,
  hasExactPlanAmount,
  isBillingPlan,
} from "../contracts/plans";
import { isPaymobWebhookVerificationConfigured } from "./lib/paymob";
import cron from "node-cron";
import { createOriginPolicy } from "./lib/origin-policy";
import { applyOriginSecurity } from "./lib/http-origin-security";
import { streamSSE } from "hono/streaming";
import { otpEvents } from "./services/whatsapp-service";
import { db } from "./queries/connection";
import { classificationLogs, authChallenges } from "../db/schema";
import { lt } from "drizzle-orm";
import { installProviderHealthReporter } from "./lib/provider-health";
import { refreshGatewayCache } from "./lib/ai-gateway";
import { purgeExpiredPhoneChallenges, readPhoneChallenge } from "./services/phone-challenge";
import { createRateLimiter } from "./lib/rate-limit";
import { purgeExpiredSessions } from "./lib/access-control";
import { createLogger } from "./lib/log";
import { initErrorReporting } from "./lib/error-reporting";
import fs from "fs";
import path from "path";
import { whatsappService } from "./services/whatsapp-service";
import {
  processScheduledNotifications,
  seedDefaultTemplates,
  checkAndTriggerSmartActivityNotifications,
} from "./notification-engine";
import { warmupEmbeddingEngine } from "./lib/embedding-engine";
import { withScheduledJobLock } from "./services/scheduler-lock";
import { runMonthlyReportJob } from "./jobs/monthly-report-job";
import { runMonthlyBehaviorJob } from "./jobs/monthly-behavior-job";
import { runRollupReconciliationJob } from "./jobs/rollup-reconciliation-job";
import { runDataRetentionJob } from "./jobs/data-retention-job";
import { runSubscriptionExpiryJob, runRenewalReminders } from "./jobs/subscription-expiry-job";

function directPeerAddress(c: HonoContext): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // Non-Node adapters may not expose connection metadata. In that case
    // getClientIp refuses forwarded headers and uses its safe fallback.
    return undefined;
  }
}

initErrorReporting();

const paymobLog = createLogger("paymob-webhook");

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
  void withScheduledJobLock("seed-default-templates", async () => {
    await seedDefaultTemplates();
  }).catch((err) =>
    console.error("[Boot] Failed to seed notification templates:", err),
  );
} else {
  console.info(
    "[Boot] Background jobs disabled; set ENABLE_CRONS=true on one or more replicas.",
  );
}

// Cron job to clean up sessions and expiring WebAuthn challenges daily.
scheduleProtectedJob("0 0 * * *", "daily-auth-cleanup", async () => {
  const now = new Date();
  await Promise.all([
    purgeExpiredSessions(now),
    db.delete(authChallenges).where(lt(authChallenges.expiresAt, now)),
    purgeExpiredPhoneChallenges(now),
  ]);
  console.log("[Cron] Cleaned expired sessions, WebAuthn challenges and phone challenges");
});

// Cron job to clean up classification logs older than 180 days (Sundays at 3 AM)
scheduleProtectedJob("0 3 * * 0", "classification-log-cleanup", async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  await db
    .delete(classificationLogs)
    .where(lt(classificationLogs.createdAt, cutoff));
  console.log(
    `[Cron] Cleaned old classification logs, cutoff: ${cutoff.toISOString()}`,
  );
});

// Warmup embedding engine (local index + Fireworks descriptor index)
// Non-blocking — runs in background. Prevents 10-30s delay on first classification.
warmupEmbeddingEngine(undefined, process.env.FIREWORKS_API_KEY || "");

// Cron job for processing scheduled and event-based notifications
scheduleProtectedJob(
  "* * * * *",
  "scheduled-notifications",
  processScheduledNotifications,
);

// Stored rows move to the current category taxonomy in bounded batches; once every row is
// current a run finds nothing (docs/decisions/0008-money-movements-and-taxonomy.md).
scheduleProtectedJob("*/30 * * * *", "taxonomy-migration", async () => {
  const { runTaxonomyMigrationJob } = await import("./jobs/taxonomy-migration-job");
  await runTaxonomyMigrationJob();
});

// Live calls whose summary did not happen when they ended: tried again while their words are still in Redis.
// Memories that have no vector for the current embedding model yet (older ones, or after the admin changes the model):
// a few at a time, so a free-tier key's per-minute limit is never the one a user's search hits.
scheduleProtectedJob("*/20 * * * *", "memory-embedding-backfill", async () => {
  const { backfillMemoryEmbeddings } = await import("./services/ai-memory");
  await backfillMemoryEmbeddings({ limit: 40 });
});

scheduleProtectedJob("*/10 * * * *", "voice-call-memory", async () => {
  const { sweepCallMemories } = await import("./services/voice/post-call");
  await sweepCallMemories();
});

// Daily smart inactivity and conversion notifications cron at 8:00 PM (20:00)
scheduleProtectedJob("0 20 * * *", "smart-activity-notifications", async () => {
  console.log("[Cron] Running daily smart activity notifications check...");
  await checkAndTriggerSmartActivityNotifications();
});

// 1. Monthly report generation (1st of month at 2:00 AM) - §3.8
scheduleProtectedJob("0 2 1 * *", "monthly-report-generation", async () => {
  console.log("[Cron] Starting scheduled monthly report generation...");
  await runMonthlyReportJob();
});

// 2. Monthly behavior snapshot generation (1st of month at 1:00 AM) - §3.8
scheduleProtectedJob("0 1 1 * *", "monthly-behavior-snapshots", async () => {
  console.log(
    "[Cron] Starting scheduled monthly behavior snapshot generation...",
  );
  await runMonthlyBehaviorJob();
});

// 3. Nightly Rollup Reconciliation (Nightly at 4:00 AM) - §3.2 & §3.8
scheduleProtectedJob("0 4 * * *", "nightly-rollup-reconciliation", async () => {
  console.log("[Cron] Starting nightly rollup reconciliation...");
  await runRollupReconciliationJob();
});

// 4. Declarative Data Retention & Pruning Lifecycle (Daily at 5:00 AM) - §3.7 & §3.8
scheduleProtectedJob("0 5 * * *", "data-retention-lifecycle", async () => {
  console.log("[Cron] Starting declarative data retention job...");
  await runDataRetentionJob();
});

// 5. Subscription Expiry & Downgrade (Daily at 6:00 AM) - §3.4 & §3.8
scheduleProtectedJob("0 6 * * *", "daily-subscription-expiry", async () => {
  console.log("[Cron] Starting daily subscription expiry check...");
  await runSubscriptionExpiryJob();
  await runRenewalReminders();
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
      console.warn(
        `⚠️ [Boot] Redis unavailable — using in-memory cache fallback (backend: ${status.backend})`,
      );
    } else {
      console.warn(
        `❌ [Boot] Redis unavailable and memory fallback disabled. Voice calls will NOT work.`,
      );
    }
  } catch (err) {
    console.warn(
      `❌ [Boot] Redis health check failed:`,
      err instanceof Error ? err.message : err,
    );
  }
})();

installProviderHealthReporter();

// Loading the providers is what moves their keys to the current secret (api/lib/provider-key-crypto.ts), so
// doing it at boot makes a deploy with a new AI_GATEWAY_SECRET enough, without waiting for a model call.
// Tests that import this module never reach the database.
if (env.NODE_ENV !== "test") void refreshGatewayCache();

const app = new Hono();

// HTTPS redirection and security headers come from api/lib/security-headers.ts, which
// tests/security/r7-security-headers.test.ts exercises. Logging and compression run between them.
const isProduction = env.NODE_ENV === "production";
app.use("*", httpsRedirect(isProduction));

app.use("*", logger());
app.use("*", compress());

app.use("*", securityHeaders(isProduction));

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
    (c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      c.req.header("cf-connecting-ip"))
  ) {
    warnedAboutUntrustedProxy = true;
    console.error(
      "[Security] Forwarded client-IP headers detected while TRUST_PROXY is disabled. Configure trusted proxy forwarding before relying on per-IP limits.",
    );
  }
  await next();
});

// ─── CORS: supports monorepo mode (APP_URL) and separate-deploy mode (FRONTEND_URL) ───
const originPolicy = createOriginPolicy(env);
export const allowedOrigins = originPolicy.webOrigins;
export const isAllowedWebSocketOrigin = originPolicy.isAllowedWebSocketOrigin;
applyOriginSecurity(app, originPolicy);

// Error handling
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
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

function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function secureCookieSuffix(origin?: string) {
  return env.NODE_ENV === "production" || origin?.startsWith("https://")
    ? "; Secure"
    : "";
}

function stateMatches(
  expected: string | undefined,
  received: string | undefined,
): boolean {
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
  const proto =
    c.req.header("x-forwarded-proto") ||
    new URL(c.req.url).protocol.slice(0, -1);
  const requestOrigin = `${proto}://${host}`;
  if (!originPolicy.isAllowedWebOrigin(requestOrigin)) {
    return c.json({ error: "عنوان تسجيل الدخول غير مسموح به" }, 403);
  }
  const dynamicRedirectUri = `${requestOrigin}/api/auth/google/callback`;
  const googleUrl = buildGoogleAuthorizationUrl(state, dynamicRedirectUri);
  if (!googleUrl)
    return c.json({ error: "Google OAuth is not configured" }, 503);
  c.header(
    "Set-Cookie",
    `oauth_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${secureCookieSuffix(requestOrigin)}`,
  );
  if (dynamicRedirectUri) {
    c.header(
      "Set-Cookie",
      `oauth_redirect_uri=${encodeURIComponent(dynamicRedirectUri)}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${secureCookieSuffix(requestOrigin)}`,
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

  const redirectUriCookie = readCookie(
    c.req.header("cookie"),
    "oauth_redirect_uri",
  );

  try {
    const caller = appRouter.createCaller(
      await createContext({ req: c.req, directIp: directPeerAddress(c) }),
    );
    const result = await caller.auth.googleCallback({
      code,
      redirectUri: redirectUriCookie,
      state: c.req.query("state"),
    });

    // Set cookie and redirect to frontend
    c.header(
      "Set-Cookie",
      `google_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookieSuffix(redirectUriCookie)}`,
    );
    c.header(
      "Set-Cookie",
      `oauth_state=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0${secureCookieSuffix(redirectUriCookie)}`,
      { append: true },
    );
    c.header(
      "Set-Cookie",
      `oauth_redirect_uri=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0${secureCookieSuffix(redirectUriCookie)}`,
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
    createContext: async (opts, c) =>
      createContext({ ...opts, directIp: directPeerAddress(c) }),
  }),
);

// Counted in Redis across replicas; the per-address map this replaces was never pruned.
const otpStreamsPerIp = createRateLimiter(5, 5 * 60 * 1000);
const CHALLENGE_POLL_MS = 3_000;
const STREAM_PING_MS = 15_000;

// ─── The sign-up page follows its phone challenge here ───
// By challenge, never by phone number: the stream used to answer for any number and to put the sender's number
// in its "fraud" event. The watch token can follow one challenge and do nothing else; the ticket that spends it
// never appears in a URL (api/services/phone-challenge.ts). The bot's event arrives at once when this stream
// reached the process that holds WhatsApp; on any other replica the database says the same a few seconds later.
app.get("/api/sse/otp", async (c) => {
  const watch = c.req.query("challenge") ?? "";
  const challenge = watch ? await readPhoneChallenge(watch, "watch") : null;
  if (!challenge) return c.text("Unknown or expired challenge", 404);

  const clientIp = getClientIp(c.req.raw, directPeerAddress(c)) || "unknown";
  try {
    await otpStreamsPerIp.hit(`otp-sse:${clientIp}`);
  } catch {
    return c.text("Too many SSE connections", 429);
  }

  return streamSSE(c, async (stream) => {
    let finished = false;
    const finish = async (status: "verified" | "wrong_sender" | "expired") => {
      if (finished) return;
      finished = true;
      await stream.writeSSE({ data: JSON.stringify({ status }) });
    };
    const eventName = `challenge:${challenge.id}`;
    const listener = (event: { status: "verified" | "wrong_sender" }) => void finish(event.status);
    otpEvents.on(eventName, listener);

    try {
      if (challenge.verified) await finish("verified");
      let lastPing = Date.now();
      while (!finished && !c.req.raw.signal.aborted) {
        await stream.sleep(CHALLENGE_POLL_MS);
        if (finished || c.req.raw.signal.aborted) break;
        // Gone means expired or already spent; either way this page has nothing left to wait for.
        const current = await readPhoneChallenge(watch, "watch");
        if (!current) await finish("expired");
        else if (current.verified) await finish("verified");
        else if (Date.now() - lastPing >= STREAM_PING_MS) {
          lastPing = Date.now();
          await stream.writeSSE({ event: "ping", data: "ping" });
        }
      }
    } finally {
      otpEvents.off(eventName, listener);
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
  // The callback carries the payer's card metadata and billing details. Log what identifies the transaction,
  // never the object: rule 10, and a webhook log is exactly where card data should not collect.
  paymobLog.info(
    {
      event: "paymob.webhook.received",
      transactionId: parsed?.obj?.id ?? null,
      success: parsed?.obj?.success ?? null,
      pending: parsed?.obj?.pending ?? null,
      amountCents: parsed?.obj?.amount_cents ?? null,
      signed: Boolean(hmacParam),
    },
    "Paymob callback received",
  );

  const secret = env.PAYMOB_HMAC_SECRET;
  if (
    env.NODE_ENV === "production" &&
    !isPaymobWebhookVerificationConfigured()
  ) {
    paymobLog.error(
      { event: "paymob.webhook.unconfigured" },
      "Paymob callback rejected: PAYMOB_HMAC_SECRET is not configured",
    );
    return c.json({ error: "Webhook verification is unavailable" }, 503);
  }
  if (secret) {
    if (!hmacParam) {
      paymobLog.warn({ event: "paymob.webhook.unsigned" }, "Paymob callback rejected: no signature");
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
      paymobLog.warn({ event: "paymob.webhook.bad_signature" }, "Paymob callback rejected: signature mismatch");
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

    if (
      userId &&
      (userType === "oauth" || userType === "local") &&
      isBillingPlan(plan)
    ) {
      if (!hasExactPlanAmount(plan, obj.amount_cents)) {
        paymobLog.warn(
          { event: "paymob.webhook.amount_mismatch", plan, expectedAmountCents, paidCents, transactionId: obj.id },
          "Paymob callback rejected: the amount does not match the plan",
        );
        return c.json({ error: "Amount mismatch" }, 400);
      }

      paymobLog.info(
        { event: "paymob.webhook.grant", userId, userType, plan, transactionId: obj.id },
        "Granting the plan from a Paymob callback",
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
        paymobLog.error({ err, event: "paymob.webhook.grant_failed", userId, userType, plan }, "Granting the plan failed");
        return c.json({ error: "Failed to update subscription" }, 500);
      }
    } else {
      // Which fields were there, not what they said: the metadata is whatever the payment page was given.
      paymobLog.warn(
        { event: "paymob.webhook.bad_metadata", fields: Object.keys(extraData ?? {}), transactionId: obj.id },
        "Paymob callback rejected: missing or invalid user metadata",
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

  // Live voice calls in production mode, on /api/voice/v2.
  const { createVoiceUpgradeHandler } = await import("./services/voice/gateway");
  const { createVoiceAppCalls } = await import("./services/voice/app-calls");
  const handleVoiceUpgrade = createVoiceUpgradeHandler({
    isAllowedOrigin: isAllowedWebSocketOrigin,
    appCalls: createVoiceAppCalls(appRouter),
  });
  server.on("upgrade", (request, socket, head) => {
    const path = new URL(request.url || "", "http://localhost").pathname;
    if (path.startsWith("/api/voice/v2")) handleVoiceUpgrade(request, socket, head);
  });
}

// WhatsApp is explicit because a stale credential file must not create an
// outbound Baileys connection during local development or every replica boot.
const sessionDir = path.join(process.cwd(), "whatsapp_auth_info");
if (
  env.ENABLE_WHATSAPP === "true" &&
  fs.existsSync(path.join(sessionDir, "creds.json"))
) {
  console.log("[WhatsApp] Starting explicitly enabled service...");
  whatsappService.start().catch((err) => {
    console.error("[WhatsApp] Failed to auto-start WhatsApp service:", err);
  });
} else if (fs.existsSync(path.join(sessionDir, "creds.json"))) {
  console.info(
    "[WhatsApp] Credentials found but service is disabled; set ENABLE_WHATSAPP=true to start it.",
  );
}

export { app };
export default {
  port: parseInt(env.PORT),
  fetch: app.fetch,
};
