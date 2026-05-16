import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono();

app.use("*", logger());

// ─── CORS: supports monorepo mode (APP_URL) and separate-deploy mode (FRONTEND_URL) ───
const allowedOrigins = Array.from(
  new Set([env.APP_URL, env.FRONTEND_URL].filter(Boolean) as string[])
);
app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  })
);

// Error handling
app.onError((err, c) => {
  console.error("Hono Error:", err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});

app.notFound((c) => {
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
    c.header("Set-Cookie", `google_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return c.redirect(`${env.APP_URL}/auth/callback?token=${result.token}`);
  } catch (error) {
    return c.redirect(`${env.APP_URL}/login?error=auth_failed`);
  }
});

// tRPC endpoint
app.use("/api/trpc/*", trpcServer({
  router: appRouter,
  createContext: async ({ req }) => createContext(req),
}));

app.post("/api/webhooks/paymob", async (c) => {
  const raw = await c.req.text();
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    parsed = { raw };
  }
  console.info("[paymob webhook]", JSON.stringify(parsed));
  // TODO: verify HMAC with env.PAYMOB_HMAC_SECRET, locate pending order, call grantProSubscription / update rows.
  return c.json({ ok: true });
});

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

export default {
  port: parseInt(env.PORT),
  fetch: app.fetch,
};
