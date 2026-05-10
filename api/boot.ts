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
app.use("*", cors({
  origin: env.APP_URL,
  credentials: true,
}));

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
app.use("/api/trpc", trpcServer({
  router: appRouter,
  createContext: async ({ req }) => createContext(req),
}));

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

export default {
  port: parseInt(env.PORT),
  fetch: app.fetch,
};
