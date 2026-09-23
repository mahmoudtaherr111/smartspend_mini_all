/**
 * ─── SmartSpend Backend — Standalone Server ───────────────────────────────────
 *
 * Use this entry point when deploying the backend SEPARATELY from the frontend.
 * The frontend (src/) should be deployed independently and set VITE_API_URL to
 * point to this server's public URL (e.g. https://api.smartspend.app).
 *
 * This file is a clean standalone wrapper around the unified Hono app in boot.ts.
 * It mounts all routes, webhooks, SSE, crons, and attaches the WebSocket server
 * for live voice calls.
 *
 * Usage:
 *   npm run backend:dev   → development with hot-reload via tsx watch
 *   npm run backend:build → build standalone bundle
 *   npm run backend:start → run the production bundle
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { serve } from "@hono/node-server";
import { handleVoiceCallWebSocket } from "./services/voice-call-service";
import { createVoiceUpgradeHandler } from "./services/voice/gateway";
import { createVoiceAppCalls } from "./services/voice/app-calls";
import { app, isAllowedWebSocketOrigin } from "./boot";
import { appRouter } from "./router";
import { env } from "./lib/env";

// Prevent DoS from unhandled promise rejections / uncaught exceptions crashing the process
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const port = parseInt(env.PORT) || 3000;
console.log(`🚀 SmartSpend Standalone Server running on http://localhost:${port}`);

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });

// Live voice calls: the rebuilt call on /api/voice/v2 and, until it has replaced it, the old one on /api/voice/live.
const handleVoiceUpgrade = createVoiceUpgradeHandler({
  isAllowedOrigin: isAllowedWebSocketOrigin,
  appCalls: createVoiceAppCalls(appRouter),
  legacy: (ws, request) => void handleVoiceCallWebSocket(ws, request),
});
server.on("upgrade", (request, socket, head) => {
  const path = new URL(request.url || "", "http://localhost").pathname;
  if (path.startsWith("/api/voice/v2") || path.startsWith("/api/voice/live")) handleVoiceUpgrade(request, socket, head);
});

export { app, server };
