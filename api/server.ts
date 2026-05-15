/**
 * ─── SmartSpend Backend — Standalone Server ───────────────────────────────────
 *
 * Use this entry point when deploying the backend SEPARATELY from the frontend.
 * The frontend (src/) should be deployed independently and set VITE_API_URL to
 * point to this server's public URL (e.g. https://api.smartspend.app).
 *
 * This file is intentionally kept as a thin wrapper around boot.ts so that the
 * shared router / middleware logic stays in one place.
 *
 * Usage:
 *   npm run backend:dev   → development with hot-reload via tsx watch
 *   npm run backend:build → build standalone bundle
 *   npm run backend:start → run the production bundle
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono();

app.use("*", logger());

// CORS: accept both APP_URL and FRONTEND_URL (separate-deploy scenario)
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
  return c.json({ error: "Not Found" }, 404);
});

// Google OAuth callback
app.get("/api/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ error: "No code provided" }, 400);

  try {
    const caller = appRouter.createCaller(await createContext(c.req));
    const result = await caller.auth.googleCallback({ code });
    const frontendUrl = env.FRONTEND_URL || env.APP_URL;
    c.header(
      "Set-Cookie",
      `google_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${env.NODE_ENV === "production" ? "; Secure" : ""}`
    );
    return c.redirect(`${frontendUrl}/auth/callback?token=${result.token}`);
  } catch {
    const frontendUrl = env.FRONTEND_URL || env.APP_URL;
    return c.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

// tRPC endpoint
app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: async ({ req }) => createContext(req),
  })
);

// Health check
app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    mode: "standalone-backend",
    allowedOrigins,
  })
);

const port = parseInt(env.PORT);
console.log(`🚀 SmartSpend Backend running on http://localhost:${port}`);
console.log(`   Allowed origins: ${allowedOrigins.join(", ")}`);

serve({ fetch: app.fetch, port });
