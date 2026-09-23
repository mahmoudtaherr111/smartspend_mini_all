/**
 * The `/api/voice/v2` socket. The first frame must be `hello`: with a ticket from `voice.startCall` it opens that
 * call; with a resume token it reconnects a call that dropped, on this server or one that another server was
 * running. Audio frames are accepted only once the call is live, and only at speech rate.
 */
import WebSocket from "ws";
import {
  parseVoiceClientMessage,
  type VoiceClientMessage,
  type VoiceServerMessage,
} from "../../../../contracts/voice-protocol";
import { createLogger } from "../../../lib/log";
import { CallSession, type CallIdentity, type CallSessionDeps, type ClientChannel, type StoredCall } from "./call-session";
import type { TicketPayload } from "./start-call";

const log = createLogger("voice-socket");

/** Calls running on this server, by id. */
const sessions = new Map<string, CallSession>();

export function activeVoiceCallCount(): number {
  return sessions.size;
}

export interface VoiceSocketDeps {
  /** Everything one call needs, built fresh per call (its brain keeps that call's drafts and facts). */
  sessionDeps(identity: CallIdentity): CallSessionDeps;
  takeTicket(ticket: string): Promise<TicketPayload | null>;
  loadState(callId: string): Promise<StoredCall | null>;
  helloTimeoutMs?: number;
  /** The app pings every 10 seconds; a socket silent for this long is dead even if TCP has not noticed. */
  silenceLimitMs?: number;
}

const MAX_AUDIO_FRAME_BYTES = 16 * 1024;
/** Twice real time for 16 kHz 16-bit mono: anything faster is not speech. */
const MAX_AUDIO_BYTES_PER_SECOND = 64 * 1024;
/** Beyond this much unsent audio to a slow phone, frames are dropped rather than queued without end. */
const MAX_BUFFERED_OUT = 512 * 1024;

function channelFor(ws: WebSocket): ClientChannel {
  return {
    get open() {
      return ws.readyState === WebSocket.OPEN;
    },
    sendJson(message: VoiceServerMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    },
    sendAudio(pcm: Buffer) {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < MAX_BUFFERED_OUT) ws.send(pcm, { binary: true });
    },
    close(code = 1000) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(code);
    },
  };
}

function refuse(channel: ClientChannel, code: "ticket" | "protocol", message: string): void {
  channel.sendJson({ type: "error", code, message });
  channel.close(4401);
}

export function createVoiceSocketHandler(deps: VoiceSocketDeps) {
  const register = (session: CallSession) => {
    sessions.set(session.callId, session);
  };
  const sessionDeps = (identity: CallIdentity): CallSessionDeps => {
    const base = deps.sessionDeps(identity);
    return {
      ...base,
      onEnded: (callId, reason) => {
        sessions.delete(callId);
        base.onEnded?.(callId, reason);
      },
      onReleased: (callId) => {
        sessions.delete(callId);
        base.onReleased?.(callId);
      },
    };
  };

  /** Opens or resumes the call; `bind` learns the session before it attaches, so a socket closing mid-connect detaches it. */
  async function open(
    hello: Extract<VoiceClientMessage, { type: "hello" }>,
    channel: ClientChannel,
    bind: (session: CallSession) => void,
  ): Promise<CallSession | null> {
    if (hello.ticket) {
      const payload = await deps.takeTicket(hello.ticket);
      if (!payload) {
        refuse(channel, "ticket", "المكالمة دي انتهت صلاحيتها. ابدأ مكالمة جديدة.");
        return null;
      }
      const identity: CallIdentity = {
        callId: payload.callId,
        userId: payload.userId,
        userType: payload.userType,
        plan: payload.plan,
        role: payload.role,
      };
      const session = new CallSession(identity, {
        model: payload.model,
        voiceName: payload.voiceName,
        thinkingLevel: payload.thinkingLevel,
        maxSeconds: payload.maxSeconds,
        costBudgetUsd: payload.costBudgetUsd,
        client: payload.client,
      }, sessionDeps(identity));
      register(session);
      bind(session);
      await session.attach(channel, false);
      return session;
    }

    const resume = hello.resume!;
    const local = sessions.get(resume.callId);
    if (local && !local.ended) {
      if (!local.verifyResumeToken(resume.token)) {
        refuse(channel, "ticket", "مش قادر أرجّع المكالمة دي. ابدأ مكالمة جديدة.");
        return null;
      }
      bind(local);
      await local.attach(channel, true);
      return local;
    }
    const stored = await deps.loadState(resume.callId);
    if (!stored) {
      refuse(channel, "ticket", "المكالمة خلصت. ابدأ مكالمة جديدة.");
      return null;
    }
    const session = CallSession.restore(stored, sessionDeps(stored.identity));
    if (!session.verifyResumeToken(resume.token)) {
      refuse(channel, "ticket", "مش قادر أرجّع المكالمة دي. ابدأ مكالمة جديدة.");
      return null;
    }
    register(session);
    bind(session);
    await session.attach(channel, true);
    return session;
  }

  return function handleVoiceSocket(ws: WebSocket): void {
    ws.binaryType = "nodebuffer";
    const channel = channelFor(ws);
    let session: CallSession | null = null;
    let opening = false;
    let windowStart = Date.now();
    let windowBytes = 0;
    const helloTimer = setTimeout(() => {
      if (!session) refuse(channel, "protocol", "الاتصال ماكملش. جرب تاني.");
    }, deps.helloTimeoutMs ?? 5_000);
    // A phone that lost its network leaves a socket that looks open; ending it here stops the meter and lets the
    // call wait for the app to come back, as any dropped call does.
    const silenceLimitMs = deps.silenceLimitMs ?? 45_000;
    let lastFrameAt = Date.now();
    const liveness = setInterval(() => {
      if (Date.now() - lastFrameAt > silenceLimitMs) ws.terminate();
    }, Math.min(15_000, Math.max(50, Math.floor(silenceLimitMs / 3))));

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      lastFrameAt = Date.now();
      if (isBinary) {
        if (!session || data.length > MAX_AUDIO_FRAME_BYTES) return;
        const now = Date.now();
        if (now - windowStart >= 1_000) {
          windowStart = now;
          windowBytes = 0;
        }
        windowBytes += data.length;
        if (windowBytes > MAX_AUDIO_BYTES_PER_SECOND) return;
        session.onClientAudio(data);
        return;
      }
      const message = parseVoiceClientMessage(data.toString("utf8"));
      if (!message) return;
      if (!session) {
        if (message.type !== "hello" || opening) {
          if (!opening) refuse(channel, "protocol", "الاتصال ماكملش. جرب تاني.");
          return;
        }
        opening = true;
        clearTimeout(helloTimer);
        void open(message, channel, (bound) => {
          session = bound;
        })
          .catch((error) => {
            log.error({ event: "voice.open_failed", err: error }, "Voice call could not open");
            channel.sendJson({ type: "error", code: "internal", message: "حصلت مشكلة. جرب تاني بعد شوية.", fallback: "chat" });
            channel.close(1011);
          });
        return;
      }
      void session.onClientMessage(message).catch((error) => {
        log.error({ event: "voice.message_failed", callId: session?.callId, type: message.type, err: error }, "Voice message failed");
      });
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      clearInterval(liveness);
      session?.detach(channel);
    });
    ws.on("error", () => undefined);
  };
}
