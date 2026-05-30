import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { smsApp } from "./sms-router";
import { createHmac } from "crypto";
import { grantProSubscription } from "./lib/subscription-service";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import cron from "node-cron";
import { csrf } from "hono/csrf";
import { db } from "./queries/connection";
import { sessions } from "../db/schema";
import { lt } from "drizzle-orm";

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

const app = new Hono();

app.use("*", logger());

// ─── CORS: supports monorepo mode (APP_URL) and separate-deploy mode (FRONTEND_URL) ───
const allowedOrigins = Array.from(
  new Set([env.APP_URL, env.FRONTEND_URL].filter(Boolean) as string[]),
);
app.use(
  "*",
  cors({
    origin: (origin) =>
      allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    credentials: true,
  }),
);

// CSRF Protection
app.use("*", csrf({ origin: allowedOrigins }));

// Error handling
app.onError((err, c) => {
  console.error("Hono Error:", err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
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

    if (userId && (userType === "oauth" || userType === "local")) {
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
if (env.NODE_ENV === "production") {
  const { serve } = await import("@hono/node-server");
  const { serveStatic } = await import("@hono/node-server/serve-static");

  app.use("/*", serveStatic({ root: "./dist/public" }));

  const port = parseInt(env.PORT) || 3000;
  console.log(
    `🚀 SmartSpend Monorepo Server running on http://localhost:${port}`,
  );
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
}

export default {
  port: parseInt(env.PORT),
  fetch: app.fetch,
};
