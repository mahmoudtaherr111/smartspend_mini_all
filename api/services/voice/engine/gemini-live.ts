/**
 * The call's engine on Google's Live API (BidiGenerateContent over a WebSocket).
 *
 * Every session asks for input and output transcription (without them nothing of the call can be checked or
 * remembered), session resumption and a sliding context window (the context is billed again every turn), and
 * declares tools NON_BLOCKING. A GoAway or an unexpected close reconnects on the latest resumption handle
 * without the call noticing; only when that fails does the engine report `closed`.
 * Facts behind these choices: docs/systems/voice-calls.md and the Live API pages cited there.
 */
import WebSocket from "ws";
import type {
  EngineEvent,
  EngineSetup,
  EngineUsage,
  ToolCallRequest,
  ToolCallResult,
  VoiceEngine,
} from "./types";

export const GEMINI_LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

type Json = Record<string, unknown>;

const object = (value: unknown): Json =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
/** The Live API answers in camelCase; older payloads and some SDK paths use snake_case. */
const field = (value: Json, camel: string, snake: string): unknown => value[camel] ?? value[snake];

export function isThinkingModel(model: string): boolean {
  return model.includes("extended-thinking");
}

/** The first message of a session. Exported for tests. */
export function buildLiveSetup(setup: EngineSetup, handle: string | null): Json {
  const thinking = isThinkingModel(setup.model);
  return {
    setup: {
      model: `models/${setup.model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: setup.voiceName } } },
        // The thinking model rejects thinkingConfig anywhere but here; the standard model rejects it outright.
        ...(thinking ? { thinkingConfig: { thinkingLevel: (setup.thinkingLevel ?? "low").toUpperCase() } } : {}),
      },
      systemInstruction: { parts: [{ text: setup.systemInstruction }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      sessionResumption: handle ? { handle } : {},
      contextWindowCompression: {
        triggerTokens: String(setup.compression.triggerTokens),
        slidingWindow: { targetTokens: String(setup.compression.targetTokens) },
      },
      ...(setup.tools.length
        ? { tools: [{ functionDeclarations: setup.tools.map((tool) => ({ ...tool, behavior: "NON_BLOCKING" })) }] }
        : {}),
    },
  };
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function modalities(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    const entry = object(item);
    const modality = String(entry.modality ?? "").toLowerCase();
    if (!modality) continue;
    out[modality] = (out[modality] ?? 0) + count(field(entry, "tokenCount", "token_count"));
  }
  return out;
}

/** Reads `usageMetadata`; exported for tests. */
export function readLiveUsage(message: Json): EngineUsage | null {
  const raw = field(message, "usageMetadata", "usage_metadata");
  if (!raw) return null;
  const usage = object(raw);
  return {
    input: modalities(field(usage, "promptTokensDetails", "prompt_tokens_details")),
    output: modalities(field(usage, "responseTokensDetails", "response_tokens_details")),
    thoughts: count(field(usage, "thoughtsTokenCount", "thoughts_token_count")),
    promptTotal: count(field(usage, "promptTokenCount", "prompt_token_count")),
    responseTotal: count(field(usage, "responseTokenCount", "response_token_count")),
  };
}

/** "10s", "1.5s" or a number of seconds, in milliseconds. */
function durationMs(value: unknown): number {
  if (typeof value === "number") return value * 1000;
  const match = String(value ?? "").match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) * 1000 : 0;
}

export interface GeminiLiveOptions {
  /** Keys in the order to try them; the second is used when the first cannot open a session. */
  apiKeys: string[];
  url?: string;
  setupTimeoutMs?: number;
  /** A key that could not open a session (never the key itself). */
  onKeyFailure?: (keyIndex: number, reason: string) => void;
}

const MAX_BACKLOG_BYTES = 64 * 1024; // about two seconds of 16 kHz speech held while reconnecting

export class GeminiLiveEngine implements VoiceEngine {
  readonly name = "gemini_live";
  private readonly listeners: Array<(event: EngineEvent) => void> = [];
  private ws: WebSocket | null = null;
  private setup: EngineSetup | null = null;
  private handle: string | null = null;
  private keyIndex = 0;
  private closedByUs = false;
  private reconnecting = false;
  private backlog: Buffer[] = [];
  private backlogBytes = 0;
  private readonly pendingTools = new Set<string>();
  private goAwayDeadline: ReturnType<typeof setTimeout> | null = null;
  private reconnectWhenToolsSettle = false;

  constructor(private readonly options: GeminiLiveOptions) {}

  onEvent(listener: (event: EngineEvent) => void): void {
    this.listeners.push(listener);
  }

  async connect(setup: EngineSetup): Promise<void> {
    this.setup = setup;
    this.handle = setup.resumptionHandle ?? null;
    this.ws = await this.openAnyKey();
    this.emit({ type: "ready" });
  }

  sendAudio(pcm: Buffer): void {
    if (this.reconnecting) {
      if (this.backlogBytes + pcm.length <= MAX_BACKLOG_BYTES) {
        this.backlog.push(pcm);
        this.backlogBytes += pcm.length;
      }
      return;
    }
    this.send({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: pcm.toString("base64") } } });
  }

  endOfSpeech(): void {
    if (!this.reconnecting) this.send({ realtimeInput: { audioStreamEnd: true } });
  }

  sendText(text: string): void {
    this.send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } });
  }

  sendToolResults(results: ToolCallResult[]): void {
    const thinking = isThinkingModel(this.setup?.model ?? "");
    for (const result of results) this.pendingTools.delete(result.id);
    this.send({
      toolResponse: {
        functionResponses: results.map((result) => ({
          id: result.id,
          name: result.name,
          // The thinking model rejects scheduling; the standard one reads it inside the response.
          response: thinking ? result.response : { ...result.response, scheduling: result.scheduling ?? "WHEN_IDLE" },
        })),
      },
    });
    if (this.reconnectWhenToolsSettle && this.pendingTools.size === 0) void this.reconnect("go_away");
  }

  close(): void {
    this.closedByUs = true;
    if (this.goAwayDeadline) clearTimeout(this.goAwayDeadline);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.removeAllListeners();
      ws.on("error", () => undefined);
      ws.close();
    }
  }

  // ─── Connection ───────────────────────────────────────────────────

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private send(message: Json): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private async openAnyKey(): Promise<WebSocket> {
    const keys = this.options.apiKeys.filter(Boolean);
    if (keys.length === 0) throw new Error("voice_engine_no_key");
    let lastError: Error = new Error("voice_engine_unavailable");
    for (let offset = 0; offset < keys.length; offset++) {
      const index = (this.keyIndex + offset) % keys.length;
      try {
        const ws = await this.open(keys[index]);
        this.keyIndex = index;
        return ws;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.options.onKeyFailure?.(index, lastError.message);
      }
    }
    throw lastError;
  }

  private open(apiKey: string): Promise<WebSocket> {
    const setup = this.setup!;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.url ?? GEMINI_LIVE_URL, {
        headers: { "x-goog-api-key": apiKey },
        handshakeTimeout: 10_000,
        maxPayload: 8 * 1024 * 1024,
      });
      let settled = false;
      const timer = setTimeout(() => fail("setup_timeout"), this.options.setupTimeoutMs ?? 8_000);
      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.removeAllListeners();
        ws.on("error", () => undefined);
        ws.terminate();
        reject(new Error(reason));
      };
      ws.on("open", () => ws.send(JSON.stringify(buildLiveSetup(setup, this.handle))));
      ws.on("error", () => fail("transport_error"));
      ws.on("close", (code) => fail(`closed_before_setup_${code}`));
      ws.on("message", (raw) => {
        let message: Json;
        try {
          message = object(JSON.parse(raw.toString()));
        } catch {
          return;
        }
        if (!settled) {
          if (message.error) return fail("provider_error");
          if (!field(message, "setupComplete", "setup_complete")) return;
          settled = true;
          clearTimeout(timer);
          ws.removeAllListeners();
          this.bind(ws);
          resolve(ws);
        }
      });
    });
  }

  private bind(ws: WebSocket): void {
    ws.on("message", (raw) => {
      let message: Json;
      try {
        message = object(JSON.parse(raw.toString()));
      } catch {
        return;
      }
      this.handleMessage(message);
    });
    ws.on("error", () => undefined);
    ws.on("close", () => {
      if (this.ws !== ws || this.closedByUs) return;
      void this.reconnect("connection_closed");
    });
  }

  private handleMessage(message: Json): void {
    const content = object(field(message, "serverContent", "server_content"));

    const parts = object(field(content, "modelTurn", "model_turn")).parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const data = object(field(object(part), "inlineData", "inline_data"));
        const mimeType = String(field(data, "mimeType", "mime_type") ?? "");
        if (typeof data.data === "string" && mimeType.startsWith("audio/pcm")) {
          const sampleRate = Number(mimeType.match(/rate=(\d+)/)?.[1] ?? 24_000);
          this.emit({ type: "audio", pcm: Buffer.from(data.data, "base64"), sampleRate });
        }
      }
    }

    const inputText = object(field(content, "inputTranscription", "input_transcription")).text;
    if (typeof inputText === "string" && inputText) this.emit({ type: "input_transcript", text: inputText });
    const outputText = object(field(content, "outputTranscription", "output_transcription")).text;
    if (typeof outputText === "string" && outputText) this.emit({ type: "output_transcript", text: outputText });

    if (content.interrupted === true) this.emit({ type: "interrupted" });

    const thinking = isThinkingModel(this.setup?.model ?? "");
    if (field(content, "turnComplete", "turn_complete") === true) {
      this.emit({ type: "turn_complete" });
      // The standard model is idle at the end of its turn; the thinking one says so separately.
      if (!thinking) this.emit({ type: "idle" });
    }
    const status = field(message, "interactionStatus", "interaction_status")
      ?? field(content, "interactionStatus", "interaction_status");
    if (thinking && status === "IDLE") this.emit({ type: "idle" });

    const calls = field(object(field(message, "toolCall", "tool_call")), "functionCalls", "function_calls");
    if (Array.isArray(calls) && calls.length > 0) {
      const requests: ToolCallRequest[] = [];
      for (const raw of calls) {
        const call = object(raw);
        if (typeof call.id !== "string" || typeof call.name !== "string") continue;
        this.pendingTools.add(call.id);
        requests.push({ id: call.id, name: call.name, args: object(call.args) });
      }
      if (requests.length) this.emit({ type: "tool_calls", calls: requests });
    }

    const cancelled = object(field(message, "toolCallCancellation", "tool_call_cancellation")).ids;
    if (Array.isArray(cancelled) && cancelled.length) {
      const ids = cancelled.filter((id): id is string => typeof id === "string");
      for (const id of ids) this.pendingTools.delete(id);
      this.emit({ type: "tool_cancel", ids });
    }

    const usage = readLiveUsage(message);
    if (usage) this.emit({ type: "usage", usage });

    const resumption = object(field(message, "sessionResumptionUpdate", "session_resumption_update"));
    const newHandle = field(resumption, "newHandle", "new_handle");
    if (resumption.resumable === true && typeof newHandle === "string" && newHandle) {
      this.handle = newHandle;
      this.emit({ type: "resumption", handle: newHandle });
    }

    const goAway = field(message, "goAway", "go_away");
    if (goAway) this.onGoAway(durationMs(field(object(goAway), "timeLeft", "time_left")));
  }

  /**
   * The provider will drop this connection soon. Move to a new one on the latest handle — right away when no tool
   * call is waiting for its answer (its id belongs to this connection), otherwise once the answers are in or just
   * before the deadline.
   */
  private onGoAway(timeLeftMs: number): void {
    if (this.pendingTools.size === 0) {
      void this.reconnect("go_away");
      return;
    }
    this.reconnectWhenToolsSettle = true;
    if (this.goAwayDeadline) clearTimeout(this.goAwayDeadline);
    this.goAwayDeadline = setTimeout(() => void this.reconnect("go_away"), Math.max(0, timeLeftMs - 1_500));
  }

  private async reconnect(reason: string): Promise<void> {
    if (this.reconnecting || this.closedByUs) return;
    this.reconnectWhenToolsSettle = false;
    if (this.goAwayDeadline) clearTimeout(this.goAwayDeadline);
    if (!this.handle) {
      this.emit({ type: "closed", reason, resumable: false });
      return;
    }
    this.reconnecting = true;
    this.emit({ type: "reconnecting" });
    const previous = this.ws;
    for (let attempt = 0; attempt < 3 && !this.closedByUs; attempt++) {
      try {
        const next = await this.openAnyKey();
        if (this.closedByUs) {
          next.close();
          return;
        }
        this.ws = next;
        if (previous && previous !== next) {
          previous.removeAllListeners();
          previous.on("error", () => undefined);
          previous.close();
        }
        this.pendingTools.clear();
        this.reconnecting = false;
        for (const pcm of this.backlog) this.sendAudio(pcm);
        this.backlog = [];
        this.backlogBytes = 0;
        this.emit({ type: "reconnected" });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    this.reconnecting = false;
    this.emit({ type: "closed", reason: `${reason}_reconnect_failed`, resumable: Boolean(this.handle) });
  }
}
