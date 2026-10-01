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
import { admissionLimits, admitCall, releaseCall, tripBreaker } from "./admission";
import { createVoiceSocketHandler } from "./socket";
import { deleteCallState, loadCallState, saveCallState, saveTranscript, takeTicket } from "./store";
import type { TicketPayload } from "./start-call";
import { unifiedUser } from "../app-calls";
import { resolveVoiceEntitlements } from "../../entitlements/voice";

export interface VoiceGatewayOptions {
  appCalls: VoiceAppCalls;
  /** After a call ends; by default the post-call summary and facts (../post-call.ts). */
  onCallEnded?: (callId: string, identity: CallIdentity) => void;
}

const rememberCall = (callId: string) => {
  // Failures are recorded on the call and retried by the background sweep.
  void summarizeCall(callId).catch(() => undefined);
};

export function createVoiceGateway(
  options: VoiceGatewayOptions,
): (ws: WebSocket) => void {
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
      seat: {
        async hold(model, joining) {
          const settings = await getSystemSettings();
          const currentUser = await unifiedUser(identity);
          // Duration and cost were granted for this plan. A changed plan needs a fresh grant.
          if (String(currentUser.plan ?? "free") !== identity.plan) return false;
          identity.role = String(currentUser.role ?? "user");
          const entitlement = resolveVoiceEntitlements(
            currentUser,
            settings,
            { usedSecondsThisMonth: 0, spentTodayUsd: 0 },
            "",
          );
          if (entitlement.killSwitch || !entitlement.enabled) return false;
          if (
            joining &&
            model.includes("extended-thinking") &&
            !entitlement.ultra
          )
            return false;
          const seat = { pool: model, callId: identity.callId, user: { id: identity.userId, type: identity.userType } };
          return (
            await admitCall(
              seat,
              admissionLimits(settings, model),
              Date.now(),
              { live: !joining },
            )
          ).ok;
        },
        release: (model, keepUser) =>
          releaseCall(
            { pool: model, callId: identity.callId, user: { id: identity.userId, type: identity.userType } },
            { keepUser },
          ),
        quota: async (model) => void (await tripBreaker(model)),
      },
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
 * Routes a voice WebSocket upgrade to the call on exactly `/api/voice/v2` from an allowed origin; anything else is
 * refused. Both server entry points call it from their own `upgrade` listener.
 */
export function createVoiceUpgradeHandler(
  options: VoiceGatewayOptions & {
    isAllowedOrigin(origin: string | undefined): boolean;
  },
): VoiceUpgradeHandler {
  const current = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const handleVoiceV2WebSocket = createVoiceGateway(options);

  return (request, socket, head) => {
    const path = new URL(request.url || "", "http://localhost").pathname;
    const rawOrigin = request.headers.origin;
    if (path !== VOICE_SOCKET_PATH || !options.isAllowedOrigin(Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    current.handleUpgrade(request, socket, head, (ws) => handleVoiceV2WebSocket(ws));
  };
}
