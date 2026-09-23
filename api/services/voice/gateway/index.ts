/**
 * The live call's server side, assembled: Gemini Live engines with the admin's keys, a fresh brain per call, the
 * call rows in MySQL, the call state in Redis, and the `/api/voice/v2` socket. `createVoiceUpgradeHandler` is how
 * both server entry points (`api/boot.ts`, `api/server.ts`) route voice WebSocket upgrades, the old call's path included.
 */
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, type WebSocket } from "ws";
import { VOICE_SOCKET_PATH } from "../../../../contracts/voice-protocol";
import { env } from "../../../lib/env";
import { logApiKeyError } from "../../../lib/error-logger";
import { getSystemSettings } from "../../../lib/settings-cache";
import { createCallBrain, type VoiceAppCalls } from "../brain";
import { GeminiLiveEngine } from "../engine/gemini-live";
import { summarizeCall } from "../post-call";
import type { CallIdentity } from "./call-session";
import { mysqlCallPersistence } from "./persistence";
import { createVoiceSocketHandler } from "./socket";
import { deleteCallState, loadCallState, saveCallState, saveTranscript, takeTicket } from "./store";
import type { TicketPayload } from "./start-call";

export interface VoiceGatewayOptions {
  appCalls: VoiceAppCalls;
  /** After a call ends; by default the post-call summary and facts (../post-call.ts). */
  onCallEnded?: (callId: string, identity: CallIdentity) => void;
}

const rememberCall = (callId: string) => {
  // Failures are recorded on the call and retried by the background sweep.
  void summarizeCall(callId).catch(() => undefined);
};

export function createVoiceGateway(options: VoiceGatewayOptions): (ws: WebSocket) => void {
  return createVoiceSocketHandler({
    sessionDeps: (identity) => ({
      createEngine: async () => {
        const settings = await getSystemSettings();
        return new GeminiLiveEngine({
          apiKeys: [settings.ai_api_key || env.GEMINI_API_KEY || "", settings.ai_api_key_2 || ""],
          onKeyFailure: (index, reason) =>
            void logApiKeyError("gemini", index === 0 ? "ai_api_key" : "ai_api_key_2", new Error(reason), identity.userId),
        });
      },
      brain: createCallBrain({ app: options.appCalls }),
      persistence: mysqlCallPersistence,
      saveState: saveCallState,
      loadState: loadCallState,
      deleteState: deleteCallState,
      saveTranscript,
      onEnded: (callId) => (options.onCallEnded ?? rememberCall)(callId, identity),
    }),
    takeTicket: (ticket) => takeTicket<TicketPayload>(ticket),
    loadState: loadCallState,
  });
}

export type VoiceUpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

/**
 * Routes a voice WebSocket upgrade: the rebuilt call on exactly `/api/voice/v2`, the old one on `/api/voice/live`
 * while it still exists. Both server entry points call it from their own `upgrade` listener for those two paths.
 */
export function createVoiceUpgradeHandler(
  options: VoiceGatewayOptions & {
    isAllowedOrigin(origin: string | undefined): boolean;
    /** The old call, served on /api/voice/live until the new one has fully replaced it. */
    legacy?: (ws: WebSocket, request: IncomingMessage) => void;
  },
): VoiceUpgradeHandler {
  const legacy = new WebSocketServer({ noServer: true });
  const current = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const handleVoiceV2WebSocket = createVoiceGateway(options);

  return (request, socket, head) => {
    const path = new URL(request.url || "", "http://localhost").pathname;
    const isCurrent = path === VOICE_SOCKET_PATH;
    const isLegacy = !isCurrent && path.startsWith("/api/voice/live") && Boolean(options.legacy);
    const rawOrigin = request.headers.origin;
    if ((!isCurrent && !isLegacy) || !options.isAllowedOrigin(Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (isCurrent) current.handleUpgrade(request, socket, head, (ws) => handleVoiceV2WebSocket(ws));
    else legacy.handleUpgrade(request, socket, head, (ws) => options.legacy!(ws, request));
  };
}
