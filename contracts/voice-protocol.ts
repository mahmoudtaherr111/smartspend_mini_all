/**
 * The live call's wire protocol between the app (web, PWA, Capacitor) and the server's `/api/voice/v2` socket.
 *
 * Text frames carry the JSON messages below. Binary frames carry audio as 16-bit little-endian mono PCM:
 * 16 kHz from the app, sent only while the user is speaking (the app's voice detection decides), and 24 kHz
 * to the app. The first message on a socket must be `hello` with a ticket from `voice.startCall`; the session
 * token never travels in the URL.
 */

export const VOICE_PROTOCOL_VERSION = 2;
export const VOICE_INPUT_SAMPLE_RATE = 16_000;
export const VOICE_OUTPUT_SAMPLE_RATE = 24_000;
export const VOICE_SOCKET_PATH = "/api/voice/v2";
/** How long the server keeps a dropped call waiting for the app to come back. */
export const VOICE_RESUME_GRACE_MS = 45_000;
/** Longest typed message accepted in a call. */
export const VOICE_TEXT_MAX_LENGTH = 500;

/** Audio encodings the app can offer; the server answers with the one it picked in `ready`. */
export type VoiceCodec = "pcm16";
export type VoiceClientPlatform = "web" | "pwa" | "android" | "ios";

// ─── App → server ───────────────────────────────────────────────────

export type VoiceClientMessage =
  | {
      type: "hello";
      v: typeof VOICE_PROTOCOL_VERSION;
      /** A new call: the single-use ticket from `voice.startCall`. */
      ticket?: string;
      /** A call that dropped: the id and resume token from its `ready`. Either this or a ticket. */
      resume?: { callId: string; token: string };
      codecs: VoiceCodec[];
      client: VoiceClientPlatform;
    }
  /** The app's voice detection heard the user stop; the server tells the model to answer now. */
  | { type: "speech_end" }
  /** Typed instead of spoken, for noisy places. */
  | { type: "text"; text: string }
  /** A tap on a draft card: an explicit confirmation or cancellation of that draft. */
  | { type: "confirm"; draftId: string }
  | { type: "cancel"; draftId: string }
  | { type: "end" }
  | { type: "ping"; t: number };

// ─── Server → app ───────────────────────────────────────────────────

export type VoiceCallState =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "awaiting_confirmation"
  | "reconnecting";

export interface VoiceFactCard {
  kind: "fact";
  id: string;
  title: string;
  period?: string;
  items: Array<{ label: string; value: number; unit?: string }>;
  /** Arabic note on what the numbers do not cover, e.g. that cash is not recorded. */
  coverage?: string;
}

export interface VoiceDraftCard {
  kind: "draft";
  draftId: string;
  title: string;
  items: Array<{ label: string; amount?: number; detail?: string }>;
  total?: number;
  status: "pending" | "executed" | "cancelled" | "expired" | "failed";
  /** Cannot be confirmed by voice: only a tap on the card executes it. */
  requiresTap?: boolean;
  expiresAt: string;
  /** Arabic outcome shown once the draft is settled. */
  message?: string;
}

export interface VoiceGuideCard {
  kind: "guide";
  title: string;
  steps: string[];
  /** An in-app route the card's button opens. */
  route?: string;
}

export interface VoicePriceCard {
  kind: "price";
  title: string;
  value: number;
  unit: string;
  source: string;
  asOf: string;
}

export type VoiceCard = VoiceFactCard | VoiceDraftCard | VoiceGuideCard | VoicePriceCard;

export interface VoiceCallSummary {
  /** What was written to the ledger or the app, verified. */
  done: string[];
  /** Drafts that were not executed. */
  notDone: string[];
  billedSeconds: number;
}

export type VoiceEndReason =
  | "user"
  | "time_limit"
  | "month_used"
  | "daily_cost_cap"
  | "inactive"
  | "provider"
  | "network"
  | "server";

export type VoiceErrorCode =
  | "ticket"
  | "not_allowed"
  | "month_used"
  | "daily_cost_cap"
  | "kill_switch"
  | "provider_unavailable"
  | "protocol"
  | "internal";

export type VoiceServerMessage =
  | {
      type: "ready";
      callId: string;
      resumeToken: string;
      codec: VoiceCodec;
      maxSeconds: number;
      /** True when this `ready` continues a call after a reconnect. */
      resumed: boolean;
    }
  | { type: "state"; state: VoiceCallState }
  /** Live captions; shown, never stored. */
  | { type: "caption"; role: "user" | "assistant"; text: string }
  | { type: "card"; card: VoiceCard }
  /** The user spoke over the assistant: drop any queued audio. */
  | { type: "interrupted" }
  | { type: "notice"; kind: "time_warning" | "reconnecting" | "degraded"; secondsLeft?: number; message: string }
  | { type: "ended"; reason: VoiceEndReason; summary: VoiceCallSummary | null }
  | { type: "error"; code: VoiceErrorCode; message: string; fallback?: "chat" }
  | { type: "pong"; t: number };

// ─── Validation of what the app sends ───────────────────────────────

const PLATFORMS: readonly VoiceClientPlatform[] = ["web", "pwa", "android", "ios"];
const ID = /^[A-Za-z0-9_-]{8,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Parses one text frame from the app; anything malformed is null, never a partial message. */
export function parseVoiceClientMessage(raw: string): VoiceClientMessage | null {
  if (raw.length > 4096) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case "hello": {
      if (value.v !== VOICE_PROTOCOL_VERSION) return null;
      const client = PLATFORMS.includes(value.client as VoiceClientPlatform) ? (value.client as VoiceClientPlatform) : "web";
      const codecs = Array.isArray(value.codecs) ? value.codecs.filter((c): c is VoiceCodec => c === "pcm16") : [];
      const base: Omit<Extract<VoiceClientMessage, { type: "hello" }>, "ticket" | "resume"> = {
        type: "hello",
        v: VOICE_PROTOCOL_VERSION,
        codecs: codecs.length ? codecs : ["pcm16"],
        client,
      };
      if (value.resume !== undefined) {
        if (!isRecord(value.resume)) return null;
        const { callId, token } = value.resume;
        if (typeof callId !== "string" || !ID.test(callId) || typeof token !== "string" || !ID.test(token)) return null;
        return { ...base, resume: { callId, token } };
      }
      return typeof value.ticket === "string" && ID.test(value.ticket) ? { ...base, ticket: value.ticket } : null;
    }
    case "speech_end":
    case "end":
      return { type: value.type };
    case "text": {
      if (typeof value.text !== "string") return null;
      const text = value.text.trim();
      return text && text.length <= VOICE_TEXT_MAX_LENGTH ? { type: "text", text } : null;
    }
    case "confirm":
    case "cancel":
      return typeof value.draftId === "string" && ID.test(value.draftId) ? { type: value.type, draftId: value.draftId } : null;
    case "ping":
      return typeof value.t === "number" && Number.isFinite(value.t) ? { type: "ping", t: value.t } : null;
    default:
      return null;
  }
}
