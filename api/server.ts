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
import { WebSocketServer } from "ws";
import { handleVoiceCallWebSocket } from "./services/voice-call-service";
import { app, isAllowedWebSocketOrigin } from "./boot";
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

// Bind WebSocket Server for Live Voice Calls
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", "http://localhost");
  if (url.pathname.startsWith("/api/voice/live")) {
    const rawOrigin = request.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    if (!isAllowedWebSocketOrigin(origin)) {
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
