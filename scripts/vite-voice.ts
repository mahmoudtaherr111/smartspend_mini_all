import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Plugin } from "vite";
import { VOICE_SOCKET_PATH } from "../contracts/voice-protocol";

/** Hono's dev plugin serves HTTP only. Load voice through the same SSR graph so tickets and sessions are shared. */
export function voiceDevServer(isAllowedOrigin: (origin: string | undefined) => boolean): Plugin {
  return {
    name: "smartspend-voice",
    apply: "serve",
    configureServer(server) {
      const http = server.httpServer;
      if (!http) return;
      const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (!pathname.startsWith(VOICE_SOCKET_PATH)) return; // Leave Vite's HMR socket alone.
        socket.on("error", () => socket.destroy());
        if (pathname !== VOICE_SOCKET_PATH || !isAllowedOrigin(request.headers.origin)) {
          socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
          return;
        }
        void Promise.all([
          server.ssrLoadModule("/api/services/voice/gateway/index.ts"),
          server.ssrLoadModule("/api/services/voice/app-calls.ts"),
          server.ssrLoadModule("/api/router.ts"),
        ]).then(([gateway, calls, router]) => {
          if (socket.destroyed) return;
          const handle = gateway.createVoiceUpgradeHandler({
            isAllowedOrigin,
            appCalls: calls.createVoiceAppCalls(router.appRouter),
          });
          handle(request, socket, head);
        }).catch(() => {
          // No headers, tickets or query strings in logs, including module-load failures.
          server.config.logger.error("[voice] Could not load the voice gateway.");
          if (!socket.destroyed) socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
        });
      };
      http.on("upgrade", upgrade);
      http.once("close", () => http.off("upgrade", upgrade));
    },
  };
}
