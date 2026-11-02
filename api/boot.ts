import "dotenv/config";
import { Hono, type Context as HonoContext } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { compress } from "hono/compress";
import { HTTPException } from "hono/http-exception";
import { builtIndexScriptHashes, httpsRedirect, securityHeaders } from "./lib/security-headers";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createHmac, timingSafeEqual } from "crypto";
import { hasValidSignature, parseWebhook, subscriptionChallenge } from "./lib/whatsapp/webhook";
import { grantProSubscription } from "./lib/subscription-service";
import { buildGoogleAuthorizationUrl, createOAuthState } from "./auth-router";
import {
  getBillingPlan,
  hasExactPlanAmount,
  isBillingPlan,
} from "../contracts/plans";
import cron from "node-cron";
import { createOriginPolicy } from "./lib/origin-policy";
import { applyOriginSecurity } from "./lib/http-origin-security";
import { db } from "./queries/connection";
import { classificationLogs, authChallenges } from "../db/schema";
import { lt } from "drizzle-orm";
import { installProviderHealthReporter } from "./lib/provider-health";
import { refreshGatewayCache } from "./lib/ai-gateway";
import { purgeExpiredPhoneChallenges } from "./services/phone-challenge";
import { purgeExpiredSessions } from "./lib/access-control";
import { createLogger } from "./lib/log";
import { initErrorReporting } from "./lib/error-reporting";
import {
  processScheduledNotifications,
  seedDefaultTemplates,
  checkAndTriggerSmartActivityNotifications,
} from "./notification-engine";
import { withScheduledJobLock } from "./services/scheduler-lock";
import { syncCaptureSeed } from "./lib/capture/catalog";
import { registerCaptureRoutes } from "./capture-v1-routes";
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
const whatsappWebhookLog = createLogger("whatsapp-webhook");
const storeBillingLog = createLogger("store-billing");

const cronsEnabled = env.ENABLE_CRONS === "true";

function scheduleProtectedJob(
  expression: string,
  jobName: string,
  task: () => Promise<void>,
) {
  if (!cronsEnabled) return;
  // The hours below are Cairo business time (golden rule 6), not the server's clock: on a UTC host the 20:00
  // activity reminder reached people at 23:00 in summer.
  cron.schedule(
    expression,
    () =>
      withScheduledJobLock(jobName, task).catch((error) => {
        console.error(`[Cron] ${jobName} failed:`, error);
      }),
    { timezone: env.APP_TIMEZONE, name: jobName },
  );
}

if (cronsEnabled) {
  void withScheduledJobLock("seed-default-templates", async () => {
    await seedDefaultTemplates();
  }).catch((err) =>
    console.error("[Boot] Failed to seed notification templates:", err),
  );
  // The banks, wallets and subscriptions the capture catalog ships with; rows an admin edited stay as they are.
  void withScheduledJobLock("seed-capture-catalog", async () => {
    await syncCaptureSeed();
  }).catch((err) => createLogger("boot").error({ err, event: "capture.seed.failed" }, "Capture catalog seed failed"));
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


// Cron job for processing scheduled and event-based notifications
scheduleProtectedJob(
  "* * * * *",
  "scheduled-notifications",
  processScheduledNotifications,
);

// Coaching reminders the user asked for: each delivered once as an in-app notification, in the transaction that marks
// it sent (api/services/coach/plans.ts#deliverDueReminders), so a restart or a second replica sends nothing twice.
scheduleProtectedJob("*/5 * * * *", "coaching-reminders", async () => {
  const { deliverDueReminders } = await import("./services/coach/plans");
  await deliverDueReminders();
});

// Captured messages waiting for the model that no request's wake picked up: a restart, or a lease that ran out
// (decision 0031). The request that queued one normally reads it within seconds.
// WhatsApp messages queued in whatsapp_messages: sent, retried or given up (decision 0038). Nothing to do until the
// owner sets the Cloud API token and number.
scheduleProtectedJob("* * * * *", "whatsapp-outbox", async () => {
  const { processOutbox } = await import("./lib/whatsapp/outbox");
  await processOutbox();
});

scheduleProtectedJob("* * * * *", "capture-ai-sweep", async () => {
  const { drainCaptureModel } = await import("./lib/capture/ai-queue");
  await drainCaptureModel(100);
  const { checkModelQueue } = await import("./lib/capture/operations");
  await checkModelQueue();
});

// A phone that stopped reporting for two days: its user is told once, in the app (decision 0034).
scheduleProtectedJob("0 11 * * *", "capture-silent-devices", async () => {
  const { runSilentDevices } = await import("./lib/capture/care");
  await runSilentDevices();
});

// A bank whose recordings on their own are taken back too often is asked about again (decision 0032).
scheduleProtectedJob("*/15 * * * *", "capture-breaker", async () => {
  const { runCaptureBreaker } = await import("./lib/capture/operations");
  await runCaptureBreaker();
});

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
if (env.NODE_ENV !== "test") {
  void refreshGatewayCache();
  void import("./lib/store-billing").then(({ globalEntitlementStateMachine }) => {
    globalEntitlementStateMachine.hydrateFromDb().catch(() => {});
  });
}

const app = new Hono();

// HTTPS redirection and security headers come from api/lib/security-headers.ts, which
// tests/security/r7-security-headers.test.ts exercises. Logging and compression run between them.
const isProduction = env.NODE_ENV === "production";
app.use("*", httpsRedirect(isProduction));

app.use("*", logger());
app.use("*", compress());

// The built page's inline scripts are allowed by hash, read once: a deploy starts a new process.
app.use("*", securityHeaders(isProduction, isProduction ? builtIndexScriptHashes() : []));

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
  // Through the logger, which writes an error without the values it carries (golden rule 10).
  createLogger("http").error({ err, event: "http.unhandled_error", method: c.req.method, path: c.req.path }, "Unhandled route error");
  const isProd = env.NODE_ENV === "production";
  const message = isProd
    ? "حدث خطأ داخلي في الخادم. برجاء المحاولة لاحقاً."
    : err.message || "Internal Server Error";
  return c.json({ error: message }, 500);
});

// The built index.html does not change while the process runs (a deploy starts a new one), so it is read once.
let indexHtml: Promise<string> | null = null;

app.notFound(async (c) => {
  if (env.NODE_ENV === "production" && !c.req.path.startsWith("/api/")) {
    try {
      if (!indexHtml) {
        const fs = await import("fs");
        const path = await import("path");
        indexHtml = fs.promises.readFile(path.resolve("./dist/public/index.html"), "utf-8");
        indexHtml.catch(() => {
          indexHtml = null;
        });
      }
      const html = await indexHtml;
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

// ─── Captured bank and wallet notifications from phones, with a device token (decision 0028) ───
registerCaptureRoutes(app);

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

  // A callback is believed only when this server can check its signature, in every environment: an unsigned one
  // would grant whatever plan its body names. Without the secret nothing can be checked, so nothing is accepted.
  const secret = env.PAYMOB_HMAC_SECRET;
  if (!secret) {
    paymobLog.error(
      { event: "paymob.webhook.unconfigured" },
      "Paymob callback rejected: PAYMOB_HMAC_SECRET is not configured",
    );
    return c.json({ error: "Webhook verification is unavailable" }, 503);
  }
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

  // Handle successful transaction
  if (obj.success === true && !obj.pending) {
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

// ─── WhatsApp Business Platform webhooks (decision 0038) ───
// Meta subscribes the address once with our verify token, then signs every event with the app secret.
app.get("/api/webhooks/whatsapp", (c) => {
  const challenge = subscriptionChallenge(
    { mode: c.req.query("hub.mode"), token: c.req.query("hub.verify_token"), challenge: c.req.query("hub.challenge") },
    env.WHATSAPP_CLOUD_VERIFY_TOKEN,
  );
  return challenge === null ? c.text("Forbidden", 403) : c.text(challenge, 200);
});

app.post("/api/webhooks/whatsapp", async (c) => {
  const raw = await c.req.text();
  if (!hasValidSignature(raw, c.req.header("x-hub-signature-256"), env.WHATSAPP_CLOUD_APP_SECRET)) {
    whatsappWebhookLog.warn({ event: "whatsapp.webhook.bad_signature" }, "WhatsApp webhook refused: signature");
    return c.json({ error: "Invalid signature" }, 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const { handleWebhookEvents } = await import("./lib/whatsapp/outbox");
  await handleWebhookEvents(parseWebhook(body));
  return c.json({ ok: true });
});

// ─── Store Billing Webhooks (Google Play & Apple App Store) ───
app.post("/api/webhooks/google-play", async (c) => {
  const { verifyGooglePlayWebhookAuth, parseAndVerifyGooglePlayPubSub, globalEntitlementStateMachine } = await import(
    "./lib/store-billing"
  );

  // Authenticate incoming Google Play RTDN webhook request (DEF-03)
  if (!verifyGooglePlayWebhookAuth(c.req.raw.headers)) {
    storeBillingLog.warn({ event: "google_play.webhook.unauthorized" }, "Rejected unauthenticated Google Play RTDN request");
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    const raw = await c.req.text();
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = parseAndVerifyGooglePlayPubSub(body);
  if (!parsed) {
    storeBillingLog.warn({ event: "google_play.webhook.invalid" }, "Rejected forged or malformed Google Play RTDN event");
    return c.json({ error: "Invalid or forged payload" }, 400);
  }

  const { db } = await import("./queries/connection");
  const { storePurchases } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const { setPlan } = await import("./lib/access-control");

  const existing = await db
    .select()
    .from(storePurchases)
    .where(eq(storePurchases.originalTransactionId, parsed.purchaseToken))
    .limit(1);

  // Ensure state machine is synchronized with existing purchase for restart durability (DEF-05)
  const subKey = `android:${parsed.purchaseToken}`;
  if (existing[0] && !globalEntitlementStateMachine.getSubscription(subKey)) {
    globalEntitlementStateMachine.setSubscription(subKey, {
      platform: "android",
      originalTxId: parsed.purchaseToken,
      tokenOrTxId: parsed.purchaseToken,
      productId: existing[0].storeProductId || parsed.subscriptionId,
      userId: String(existing[0].userId),
      userType: (existing[0].userType === "oauth" ? "oauth" : "local") as "local" | "oauth",
      status: (existing[0].status?.toUpperCase() || "ACTIVE") as any,
      lastEventTime: existing[0].updatedAt?.getTime() ?? Date.now(),
      expiresAt: existing[0].expiresAt?.getTime() ?? Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  }

  const userId = existing[0]?.userId ? String(existing[0].userId) : "system";
  const userType = (existing[0]?.userType as "local" | "oauth") ?? "local";

  const transition = globalEntitlementStateMachine.processStoreEvent({
    platform: "android",
    originalTxId: parsed.purchaseToken,
    tokenOrTxId: parsed.purchaseToken,
    productId: parsed.subscriptionId,
    userId,
    userType,
    eventType: parsed.eventType,
    eventTime: parsed.eventTime,
    eventId: parsed.messageId,
  });

  if (!transition.success) {
    storeBillingLog.warn(
      { event: "google_play.webhook.transition.ignored", reason: transition.reason },
      "Google Play RTDN webhook transition was not applied",
    );
    return c.json({ ok: false, reason: transition.reason }, 200);
  }

  if (existing[0]) {
    const updateData: Record<string, unknown> = {
      status: transition.state.toLowerCase(),
      rawPayload: {
        eventType: parsed.eventType,
        messageId: parsed.messageId,
        eventId: parsed.messageId,
        processedEvents: [parsed.messageId ?? `${subKey}:${parsed.eventType}:${parsed.eventTime}`],
      },
    };

    // DEF-04: Update storePurchases.expiresAt upon receiving SUBSCRIPTION_RENEWED so pro.myPlan doesn't expire
    if (parsed.eventType === "RENEWAL" || parsed.notificationType === 2 /* SUBSCRIPTION_RENEWED */) {
      const currentExpiry = existing[0].expiresAt ? new Date(existing[0].expiresAt).getTime() : Date.now();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      const updatedExpiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);
      updateData.expiresAt = updatedExpiresAt;
    }

    await db
      .update(storePurchases)
      .set(updateData)
      .where(eq(storePurchases.id, existing[0].id));

    if (existing[0].userId) {
      const uType = (existing[0].userType === "oauth" ? "oauth" : "local") as "oauth" | "local";
      await setPlan(uType, existing[0].userId, transition.effectivePlan);
    }
  }

  storeBillingLog.info(
    { event: "google_play.webhook.processed", eventType: parsed.eventType, state: transition.state },
    "Google Play RTDN webhook processed",
  );

  return c.json({ ok: true, state: transition.state, effectivePlan: transition.effectivePlan });
});

app.post("/api/webhooks/apple-asn", async (c) => {
  let body: any;
  try {
    const raw = await c.req.text();
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { parseAndVerifyAppleASN, globalEntitlementStateMachine } = await import(
    "./lib/store-billing"
  );
  const parsed = parseAndVerifyAppleASN(body);
  if (!parsed) {
    storeBillingLog.warn({ event: "apple_asn.webhook.invalid" }, "Rejected forged or malformed Apple ASN v2 event");
    return c.json({ error: "Invalid or forged payload" }, 400);
  }

  const { db } = await import("./queries/connection");
  const { storePurchases } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const { setPlan } = await import("./lib/access-control");

  const existing = await db
    .select()
    .from(storePurchases)
    .where(eq(storePurchases.originalTransactionId, parsed.originalTransactionId))
    .limit(1);

  // Sync state machine if restarted (DEF-05)
  const appleSubKey = `ios:${parsed.originalTransactionId}`;
  if (existing[0] && !globalEntitlementStateMachine.getSubscription(appleSubKey)) {
    globalEntitlementStateMachine.setSubscription(appleSubKey, {
      platform: "ios",
      originalTxId: parsed.originalTransactionId,
      tokenOrTxId: parsed.transactionId,
      productId: existing[0].storeProductId || parsed.productId,
      userId: String(existing[0].userId),
      userType: (existing[0].userType === "oauth" ? "oauth" : "local") as "local" | "oauth",
      status: (existing[0].status?.toUpperCase() || "ACTIVE") as any,
      lastEventTime: existing[0].updatedAt?.getTime() ?? Date.now(),
      expiresAt: existing[0].expiresAt?.getTime() ?? parsed.expiresDate,
    });
  }

  const userId = existing[0]?.userId ? String(existing[0].userId) : "system";
  const userType = (existing[0]?.userType as "local" | "oauth") ?? "local";

  const transition = globalEntitlementStateMachine.processStoreEvent({
    platform: "ios",
    originalTxId: parsed.originalTransactionId,
    tokenOrTxId: parsed.transactionId,
    productId: parsed.productId,
    userId,
    userType,
    eventType: parsed.eventType,
    eventTime: parsed.signedDate,
    expiresAt: parsed.expiresDate,
    eventId: parsed.notificationUUID,
  });

  if (!transition.success) {
    storeBillingLog.warn(
      { event: "apple_asn.webhook.transition.ignored", reason: transition.reason },
      "Apple ASN v2 webhook transition was not applied",
    );
    return c.json({ ok: false, reason: transition.reason }, 200);
  }

  if (existing[0]) {
    await db
      .update(storePurchases)
      .set({
        status: transition.state.toLowerCase(),
        expiresAt: new Date(parsed.expiresDate),
        rawPayload: {
          eventType: parsed.eventType,
          notificationUUID: parsed.notificationUUID,
          eventId: parsed.notificationUUID,
          processedEvents: [parsed.notificationUUID],
        },
      })
      .where(eq(storePurchases.id, existing[0].id));

    if (existing[0].userId) {
      const uType = (existing[0].userType === "oauth" ? "oauth" : "local") as "oauth" | "local";
      await setPlan(uType, existing[0].userId, transition.effectivePlan);
    }
  }

  storeBillingLog.info(
    { event: "apple_asn.webhook.processed", eventType: parsed.eventType, state: transition.state },
    "Apple ASN v2 webhook processed",
  );

  return c.json({ ok: true, state: transition.state, effectivePlan: transition.effectivePlan });
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

export { app };
export default {
  port: parseInt(env.PORT),
  fetch: app.fetch,
};
