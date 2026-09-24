/**
 * One live call: the app's socket on one side, a speech engine on the other, the brain (instructions, tools,
 * checks) in between, and the meter running only while both are connected.
 *
 * A dropped app does not end the call: the engine is closed (its resumption handle kept), the state goes to
 * Redis, and for VOICE_RESUME_GRACE_MS any server can pick the call up again. Billed time, tokens and cost are
 * checkpointed every 15 seconds, so a server that dies mid-call has already written what the call used.
 */
import { randomBytes, randomUUID } from "crypto";
import {
  VOICE_RESUME_GRACE_MS,
  type VoiceCallState,
  type VoiceCard,
  type VoiceClientMessage,
  type VoiceEndReason,
  type VoiceServerMessage,
  type VoiceWaitDetail,
} from "../../../../contracts/voice-protocol";
import { createLogger } from "../../../lib/log";
import type {
  EngineEvent,
  ThinkingLevel,
  ToolCallRequest,
  ToolCallResult,
  ToolDeclaration,
  ToolScheduling,
  VoiceEngine,
} from "../engine/types";
import type { CallPersistence } from "./persistence";
import { addUsage, emptyUsage, usageCostUsd, type UsageTotals } from "./pricing";
import { hashSecret, type TranscriptLine } from "./store";

const log = createLogger("voice-call");

/** This server's name in a call's state, so a server that lost a call to another does not close it. */
export const VOICE_INSTANCE_ID = randomUUID();

export interface CallIdentity {
  callId: string;
  userId: number;
  userType: "oauth" | "local";
  plan: string;
  role: string;
}

export interface CallOptions {
  model: string;
  voiceName: string;
  thinkingLevel: ThinkingLevel;
  maxSeconds: number;
  /** Provider cost this call may still spend under the user's daily cap; null means no cap. */
  costBudgetUsd: number | null;
  client: string;
}

/** The app's end of the call, whatever socket carries it. */
export interface ClientChannel {
  readonly open: boolean;
  sendJson(message: VoiceServerMessage): void;
  sendAudio(pcm: Buffer): void;
  close(code?: number): void;
}

export interface ToolRunContext {
  identity: CallIdentity;
  signal: AbortSignal;
}

export interface ToolRunOutcome {
  response: Record<string, unknown>;
  card?: VoiceCard;
  scheduling?: ToolScheduling;
}

export interface SpeechCheck {
  /** The incident's kind; a number said wrong unless given. */
  kind?: string;
  note: string | null;
  incident: Record<string, string | number | boolean | null>;
}

/** What the call asks of the brain; see api/services/voice/brain. */
export interface CallBrain {
  prepare(identity: CallIdentity, options: CallOptions): Promise<{ instruction: string; tools: ToolDeclaration[] }>;
  /** A note that makes the model open the call, or continue it after a reconnect without greeting again. */
  openingNote(resumed: boolean, recent: TranscriptLine[]): string;
  runTool(call: ToolCallRequest, context: ToolRunContext): Promise<ToolRunOutcome>;
  /** What the screen should say the assistant is doing while these tools run. */
  waitDetail?(calls: ToolCallRequest[]): VoiceWaitDetail | undefined;
  /** Called with the user's words as transcribed. */
  onUserWords?(text: string): void;
  /**
   * Called with the assistant's words as transcribed. A returned incident is recorded; a returned note is sent to the
   * model at once so it corrects itself.
   */
  onAssistantWords?(text: string): SpeechCheck | null;
  /** The model finished a turn; what it said last is checked in full. */
  onTurnEnd?(): SpeechCheck | null;
  /** A tap on a draft card. */
  onCardAction?(action: "confirm" | "cancel", draftId: string, identity: CallIdentity): Promise<{ card: VoiceCard; note: string } | null>;
  /** True while a draft waits for the user's answer: the call is not cut off in the middle of it. */
  awaitingConfirmation?(): boolean;
  /** What the end card lists. */
  summary?(): { done: string[]; notDone: string[] };
  /** Serializable brain state to carry across servers with the call. */
  snapshot?(): unknown;
  restore?(state: unknown): void;
}

export interface CallSessionDeps {
  createEngine(): VoiceEngine | Promise<VoiceEngine>;
  brain: CallBrain;
  persistence: CallPersistence;
  saveState(callId: string, state: StoredCall): Promise<void>;
  loadState(callId: string): Promise<StoredCall | null>;
  deleteState(callId: string): Promise<void>;
  saveTranscript(callId: string, lines: TranscriptLine[]): Promise<void>;
  onEnded?(callId: string, reason: VoiceEndReason): void;
  /** The call moved to another server; drop it from this one's registry. */
  onReleased?(callId: string): void;
  checkpointMs?: number;
  graceMs?: number;
  inactiveMs?: number;
  toolTimeoutMs?: number;
  /** How long the screen shows "thinking" after a tool answer before assuming the model will not speak. */
  replyWaitMs?: number;
}

/** What goes to Redis so another server can continue the call. */
export interface StoredCall {
  identity: CallIdentity;
  options: CallOptions;
  resumeTokenHash: string;
  handle: string | null;
  owner: string;
  epoch: number;
  billedMs: number;
  turns: number;
  toolCalls: number;
  incidents: number;
  reconnects: number;
  usage: UsageTotals;
  firstAudioMs: number[];
  transcript: TranscriptLine[];
  warned: boolean;
  brain: unknown;
}

const WARNING_BEFORE_MS = 60_000;
const CONFIRMATION_GRACE_MS = 30_000;
const TRANSCRIPT_MAX_CHARS = 24_000;
const COMPRESSION = { triggerTokens: 16_000, targetTokens: 8_000 };

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export class CallSession {
  private engine: VoiceEngine | null = null;
  private channel: ClientChannel | null = null;
  private state: VoiceCallState = "connecting";
  private stateDetail: VoiceWaitDetail | undefined;
  private status: "starting" | "live" | "reconnecting" | "ended" = "starting";
  private resumeToken = "";
  private resumeTokenHash = "";
  private handle: string | null = null;
  private epoch = 0;
  private billedMs = 0;
  private connectedSince: number | null = null;
  private turns = 0;
  private toolCalls = 0;
  private incidents = 0;
  private reconnects = 0;
  private usage: UsageTotals = emptyUsage();
  private firstAudioMs: number[] = [];
  private speechEndedAt: number | null = null;
  private transcript: TranscriptLine[] = [];
  private warned = false;
  private extended = false;
  private lastActivity = Date.now();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private lastCheckpoint = 0;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  /** A tool was called and the model's spoken answer to it has not started yet. */
  private replyOwed = false;
  private replyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cancelledTools = new Set<string>();
  private readonly toolAborts = new Map<string, AbortController>();
  private attachChain: Promise<void> = Promise.resolve();

  constructor(
    readonly identity: CallIdentity,
    readonly options: CallOptions,
    private readonly deps: CallSessionDeps,
  ) {}

  /** A call that another server (or this one, before a restart) was running. */
  static restore(stored: StoredCall, deps: CallSessionDeps): CallSession {
    const session = new CallSession(stored.identity, stored.options, deps);
    session.resumeTokenHash = stored.resumeTokenHash;
    session.handle = stored.handle;
    session.epoch = stored.epoch;
    session.billedMs = stored.billedMs;
    session.turns = stored.turns;
    session.toolCalls = stored.toolCalls;
    session.incidents = stored.incidents;
    session.reconnects = stored.reconnects;
    session.usage = stored.usage;
    session.firstAudioMs = stored.firstAudioMs;
    session.transcript = stored.transcript;
    session.warned = stored.warned;
    session.status = "reconnecting";
    deps.brain.restore?.(stored.brain);
    return session;
  }

  get callId(): string {
    return this.identity.callId;
  }

  get ended(): boolean {
    return this.status === "ended";
  }

  verifyResumeToken(token: string): boolean {
    return Boolean(this.resumeTokenHash) && hashSecret(token) === this.resumeTokenHash;
  }

  /** Connects (or reconnects) the app. Resolves once the engine is live or the call has ended. */
  attach(channel: ClientChannel, resumed: boolean): Promise<void> {
    this.attachChain = this.attachChain.then(() => this.doAttach(channel, resumed));
    return this.attachChain;
  }

  private async doAttach(channel: ClientChannel, resumed: boolean): Promise<void> {
    if (this.status === "ended") {
      channel.sendJson({ type: "error", code: "protocol", message: "المكالمة دي خلصت." });
      channel.close(1000);
      return;
    }
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    if (this.channel && this.channel !== channel) this.channel.close(4001);
    this.channel = channel;
    this.epoch += 1;
    // Claim the call before the engine connects, so the server that lost it sees the new owner.
    await this.persistState();
    this.send({ type: "state", state: resumed ? "reconnecting" : "connecting" });

    const connected = await this.connectEngine(resumed);
    if (!connected) {
      this.send({
        type: "error",
        code: "provider_unavailable",
        message: "محرك الصوت مش متاح دلوقتي. تقدر تكمل بالكتابة في الشات.",
        fallback: "chat",
      });
      await this.end("provider", { failed: !resumed });
      return;
    }

    this.resumeToken = `rt_${randomBytes(24).toString("base64url")}`;
    this.resumeTokenHash = hashSecret(this.resumeToken);
    if (this.status === "starting") await this.deps.persistence.markLive(this.callId).catch(() => undefined);
    if (resumed) this.reconnects += 1;
    this.status = "live";
    this.connectedSince = Date.now();
    this.lastActivity = Date.now();
    this.send({
      type: "ready",
      callId: this.callId,
      resumeToken: this.resumeToken,
      codec: "pcm16",
      maxSeconds: this.options.maxSeconds,
      resumed,
    });
    this.setState("listening");
    this.engine?.sendText(this.deps.brain.openingNote(resumed, this.transcript.slice(-6)));
    this.startTicker();
    await this.persistState();
    // The app may have gone while the engine was connecting: then the call waits for it like any dropped call.
    if (!channel.open) this.detach(channel);
  }

  private async connectEngine(resumed: boolean): Promise<boolean> {
    const { instruction, tools } = await this.deps.brain.prepare(this.identity, this.options);
    const attempt = async (handle: string | null) => {
      const engine = await this.deps.createEngine();
      engine.onEvent((event) => this.onEngineEvent(engine, event));
      await engine.connect({
        model: this.options.model,
        voiceName: this.options.voiceName,
        systemInstruction: instruction,
        tools,
        thinkingLevel: this.options.thinkingLevel,
        compression: COMPRESSION,
        resumptionHandle: handle ?? undefined,
      });
      return engine;
    };
    try {
      this.engine = await attempt(resumed ? this.handle : null);
      return true;
    } catch (error) {
      if (resumed && this.handle) {
        // The provider no longer knows the session: start a fresh one; the opening note carries the recent turns.
        log.warn({ event: "voice.resume_handle_rejected", callId: this.callId, err: error }, "Starting a fresh provider session");
        this.handle = null;
        try {
          this.engine = await attempt(null);
          return true;
        } catch (retryError) {
          log.warn({ event: "voice.engine_connect_failed", callId: this.callId, err: retryError }, "Engine unavailable");
          return false;
        }
      }
      log.warn({ event: "voice.engine_connect_failed", callId: this.callId, err: error }, "Engine unavailable");
      return false;
    }
  }

  /** The app's socket closed without saying goodbye. */
  detach(channel: ClientChannel): void {
    if (this.channel !== channel || this.status === "ended") return;
    this.channel = null;
    this.accrue();
    this.status = "reconnecting";
    this.stopTicker();
    this.closeEngine();
    void this.persistState();
    void this.checkpoint();
    const epoch = this.epoch;
    this.graceTimer = setTimeout(() => void this.onGraceExpired(epoch), this.deps.graceMs ?? VOICE_RESUME_GRACE_MS);
  }

  private async onGraceExpired(epoch: number): Promise<void> {
    if (this.status !== "reconnecting" || this.epoch !== epoch) return;
    // Another server may have picked the call up; then it is theirs to end.
    const stored = await this.deps.loadState(this.callId).catch(() => null);
    if (stored && (stored.owner !== VOICE_INSTANCE_ID || stored.epoch > this.epoch)) {
      this.releaseLocally();
      return;
    }
    await this.end("network");
  }

  /** Forgets the call on this server without ending it, after another server took it over. */
  private releaseLocally(): void {
    this.status = "ended";
    this.stopTicker();
    this.closeEngine();
    this.channel?.close(4002);
    this.channel = null;
    this.deps.onReleased?.(this.callId);
  }

  onClientAudio(pcm: Buffer): void {
    if (this.status !== "live" || !this.engine) return;
    this.lastActivity = Date.now();
    if (this.state !== "listening" && this.state !== "awaiting_confirmation") this.setState("listening");
    this.engine.sendAudio(pcm);
  }

  async onClientMessage(message: VoiceClientMessage): Promise<void> {
    switch (message.type) {
      case "speech_end":
        if (this.status !== "live" || !this.engine) return;
        this.speechEndedAt = Date.now();
        this.engine.endOfSpeech();
        this.setState("thinking");
        return;
      case "text":
        if (this.status !== "live" || !this.engine) return;
        this.lastActivity = Date.now();
        this.speechEndedAt = Date.now();
        this.addTranscript("user", message.text);
        this.deps.brain.onUserWords?.(message.text);
        this.engine.sendText(message.text);
        this.setState("thinking");
        return;
      case "confirm":
      case "cancel": {
        const outcome = await this.deps.brain.onCardAction?.(message.type, message.draftId, this.identity);
        if (!outcome) return;
        this.send({ type: "card", card: outcome.card });
        this.engine?.sendText(outcome.note);
        return;
      }
      case "end":
        await this.end("user");
        return;
      case "ping":
        this.send({ type: "pong", t: message.t });
        return;
      default:
        return;
    }
  }

  // ─── Engine events ────────────────────────────────────────────────

  private onEngineEvent(engine: VoiceEngine, event: EngineEvent): void {
    if (engine !== this.engine || this.status === "ended") return;
    switch (event.type) {
      case "audio":
        this.replyStarted();
        if (this.speechEndedAt !== null) {
          this.firstAudioMs.push(Date.now() - this.speechEndedAt);
          this.speechEndedAt = null;
        }
        this.lastActivity = Date.now();
        this.setState("speaking");
        this.channel?.sendAudio(event.pcm);
        return;
      case "input_transcript":
        this.lastActivity = Date.now();
        this.addTranscript("user", event.text);
        this.send({ type: "caption", role: "user", text: event.text });
        this.deps.brain.onUserWords?.(event.text);
        return;
      case "output_transcript": {
        this.addTranscript("assistant", event.text);
        this.send({ type: "caption", role: "assistant", text: event.text });
        this.applySpeechCheck(this.deps.brain.onAssistantWords?.(event.text) ?? null);
        return;
      }
      case "tool_calls":
        this.expectReply();
        this.setState("thinking", this.deps.brain.waitDetail?.(event.calls));
        void this.runTools(event.calls);
        return;
      case "tool_cancel":
        for (const id of event.ids) {
          this.cancelledTools.add(id);
          this.toolAborts.get(id)?.abort();
        }
        return;
      case "interrupted":
        this.replyStarted();
        this.send({ type: "interrupted" });
        return;
      case "turn_complete":
        this.turns += 1;
        this.applySpeechCheck(this.deps.brain.onTurnEnd?.() ?? null);
        return;
      case "idle":
        // The model's turn ends with a tool call; the call is not listening while the answer is being prepared.
        if (this.replyOwed) return;
        this.setState(this.deps.brain.awaitingConfirmation?.() ? "awaiting_confirmation" : "listening");
        return;
      case "usage":
        addUsage(this.usage, event.usage);
        this.checkCostBudget();
        return;
      case "resumption":
        this.handle = event.handle;
        return;
      case "reconnecting":
        this.send({ type: "notice", kind: "degraded", message: "الخط بيتظبط، ثانية واحدة." });
        return;
      case "reconnected":
        return;
      case "closed":
        void this.end("provider");
        return;
      default:
        return;
    }
  }

  private expectReply(): void {
    this.replyOwed = true;
    if (this.replyTimer) clearTimeout(this.replyTimer);
    // A model that says nothing after a tool answer must not leave the screen on "thinking".
    this.replyTimer = setTimeout(() => {
      this.replyTimer = null;
      if (!this.replyOwed || this.status !== "live") return;
      this.replyOwed = false;
      this.setState(this.deps.brain.awaitingConfirmation?.() ? "awaiting_confirmation" : "listening");
    }, this.deps.replyWaitMs ?? 8_000);
  }

  private replyStarted(): void {
    this.replyOwed = false;
    if (this.replyTimer) clearTimeout(this.replyTimer);
    this.replyTimer = null;
  }

  private applySpeechCheck(check: SpeechCheck | null): void {
    if (!check) return;
    this.recordIncident(check.kind ?? "spoken_number_mismatch", check.incident);
    if (check.note) this.engine?.sendText(check.note);
  }

  private async runTools(calls: ToolCallRequest[]): Promise<void> {
    const engine = this.engine;
    const results = await Promise.all(calls.map(async (call): Promise<ToolCallResult | null> => {
      this.toolCalls += 1;
      const abort = new AbortController();
      const startedAt = Date.now();
      this.toolAborts.set(call.id, abort);
      const timeout = setTimeout(() => abort.abort(), this.deps.toolTimeoutMs ?? 12_000);
      try {
        const outcome = await Promise.race([
          this.deps.brain.runTool(call, { identity: this.identity, signal: abort.signal }),
          new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new Error("tool_timeout")))),
        ]);
        if (outcome.card) this.send({ type: "card", card: outcome.card });
        // The tool, how long it took and whether it answered; never its arguments or its answer (golden rule 10).
        // A tool's refusal is a short code ("missing_search"), which the logger keeps; on success there is none.
        const code = typeof outcome.response.error === "string" ? { code: outcome.response.error } : {};
        log.info(
          { event: "voice.tool", callId: this.callId, tool: call.name, ms: Date.now() - startedAt, ok: outcome.response.ok !== false, ...code },
          "Tool answered",
        );
        return { id: call.id, name: call.name, response: outcome.response, scheduling: outcome.scheduling };
      } catch (error) {
        const reason = error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "tool_failed";
        this.recordIncident("tool_error", { tool: call.name, reason });
        log.warn({ event: "voice.tool_failed", callId: this.callId, tool: call.name, ms: Date.now() - startedAt, reason, err: error }, "Tool failed");
        return {
          id: call.id,
          name: call.name,
          response: { ok: false, error: reason, say: "مش قادر أجيب ده دلوقتي. قول للمستخدم كده بوضوح ومتخمنش." },
        };
      } finally {
        clearTimeout(timeout);
        this.toolAborts.delete(call.id);
      }
    }));
    if (!engine || engine !== this.engine || this.status !== "live") return;
    const answered = results.filter((result): result is ToolCallResult => Boolean(result) && !this.cancelledTools.has(result!.id));
    if (answered.length) engine.sendToolResults(answered);
  }

  // ─── Meter, limits and state ──────────────────────────────────────

  private startTicker(): void {
    this.stopTicker();
    this.lastCheckpoint = Date.now();
    this.ticker = setInterval(() => void this.tick(), 1_000);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private billedNowMs(): number {
    return this.billedMs + (this.connectedSince !== null ? Date.now() - this.connectedSince : 0);
  }

  private accrue(): void {
    if (this.connectedSince !== null) this.billedMs += Date.now() - this.connectedSince;
    this.connectedSince = null;
  }

  private async tick(): Promise<void> {
    if (this.status !== "live") return;
    const billed = this.billedNowMs();
    const limitMs = this.options.maxSeconds * 1000 + (this.extended ? CONFIRMATION_GRACE_MS : 0);
    if (!this.warned && billed >= this.options.maxSeconds * 1000 - WARNING_BEFORE_MS && this.options.maxSeconds * 1000 > WARNING_BEFORE_MS * 2) {
      this.warnEnding(Math.round((this.options.maxSeconds * 1000 - billed) / 1000));
    }
    if (billed >= limitMs) {
      if (!this.extended && this.deps.brain.awaitingConfirmation?.()) {
        this.extended = true;
      } else {
        await this.end("time_limit");
        return;
      }
    }
    if (Date.now() - this.lastActivity >= (this.deps.inactiveMs ?? 150_000)) {
      await this.end("inactive");
      return;
    }
    if (Date.now() - this.lastCheckpoint >= (this.deps.checkpointMs ?? 15_000)) {
      this.lastCheckpoint = Date.now();
      await Promise.all([this.checkpoint(), this.persistState()]);
    }
  }

  private warnEnding(secondsLeft: number): void {
    this.warned = true;
    this.send({ type: "notice", kind: "time_warning", secondsLeft, message: "فاضل حوالي دقيقة على نهاية المكالمة." });
    this.engine?.sendText(
      "(ملاحظة من التطبيق، مش من المستخدم: فاضل حوالي دقيقة على نهاية المكالمة. لو فيه حاجة مهمة مفتوحة خلّصها، " +
        "وقول للمستخدم بجملة قصيرة إن الوقت قرب يخلص. متبدأش موضوع جديد.)",
    );
  }

  private checkCostBudget(): void {
    const budget = this.options.costBudgetUsd;
    if (budget === null || this.status !== "live") return;
    const cost = usageCostUsd(this.usage);
    if (!this.warned && cost >= budget * 0.85) this.warnEnding(60);
    if (cost >= budget && !this.deps.brain.awaitingConfirmation?.()) void this.end("daily_cost_cap");
  }

  private setState(state: VoiceCallState, detail?: VoiceWaitDetail): void {
    if (this.state === state && this.stateDetail === detail) return;
    this.state = state;
    this.stateDetail = detail;
    this.send(detail ? { type: "state", state, detail } : { type: "state", state });
  }

  private send(message: VoiceServerMessage): void {
    if (this.channel?.open) this.channel.sendJson(message);
  }

  private addTranscript(role: TranscriptLine["role"], text: string): void {
    const last = this.transcript[this.transcript.length - 1];
    if (last && last.role === role) last.text = `${last.text}${text}`;
    else this.transcript.push({ role, text });
    let total = this.transcript.reduce((sum, line) => sum + line.text.length, 0);
    while (total > TRANSCRIPT_MAX_CHARS && this.transcript.length > 1) {
      total -= this.transcript.shift()!.text.length;
    }
  }

  private recordIncident(kind: string, detail: Record<string, string | number | boolean | null>): void {
    this.incidents += 1;
    void this.deps.persistence.incident(this.identity, kind, detail);
  }

  private metrics(): Record<string, unknown> {
    return {
      firstAudioMs: {
        count: this.firstAudioMs.length,
        p50: percentile(this.firstAudioMs, 0.5),
        p95: percentile(this.firstAudioMs, 0.95),
      },
    };
  }

  private progress() {
    return {
      billedSeconds: Math.ceil(this.billedNowMs() / 1000),
      turns: this.turns,
      toolCalls: this.toolCalls,
      incidents: this.incidents,
      reconnects: this.reconnects,
      tokens: this.usage,
      costUsd: usageCostUsd(this.usage),
      metrics: this.metrics(),
    };
  }

  private async checkpoint(): Promise<void> {
    if (this.status === "ended" || this.status === "starting") return;
    try {
      await this.deps.persistence.checkpoint(this.callId, { status: this.status, ...this.progress() });
    } catch (error) {
      log.warn({ event: "voice.checkpoint_failed", callId: this.callId, err: error }, "Checkpoint not written");
    }
  }

  private stored(): StoredCall {
    return {
      identity: this.identity,
      options: this.options,
      resumeTokenHash: this.resumeTokenHash,
      handle: this.handle,
      owner: VOICE_INSTANCE_ID,
      epoch: this.epoch,
      billedMs: this.billedNowMs(),
      turns: this.turns,
      toolCalls: this.toolCalls,
      incidents: this.incidents,
      reconnects: this.reconnects,
      usage: this.usage,
      firstAudioMs: this.firstAudioMs.slice(-50),
      transcript: this.transcript,
      warned: this.warned,
      brain: this.deps.brain.snapshot?.() ?? null,
    };
  }

  private async persistState(): Promise<void> {
    if (this.status === "ended" || !this.resumeTokenHash) return;
    try {
      await this.deps.saveState(this.callId, this.stored());
    } catch (error) {
      log.warn({ event: "voice.state_save_failed", callId: this.callId, err: error }, "Call state not saved");
    }
  }

  private closeEngine(): void {
    this.replyStarted();
    for (const abort of this.toolAborts.values()) abort.abort();
    this.engine?.close();
    this.engine = null;
  }

  /** Ends the call once: stops the meter, writes the final row, hands the words to the post-call summary. */
  async end(reason: VoiceEndReason, options: { failed?: boolean } = {}): Promise<void> {
    if (this.status === "ended") return;
    this.accrue();
    const wasStarted = this.status !== "starting";
    this.status = "ended";
    this.stopTicker();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.closeEngine();

    const hasWords = this.transcript.some((line) => line.role === "user" && line.text.trim().length > 0);
    const progress = this.progress();
    try {
      await this.deps.persistence.finalize(this.callId, {
        ...progress,
        endReason: reason,
        memoryStatus: hasWords ? "pending" : "empty",
        failed: Boolean(options.failed) || !wasStarted,
      });
    } catch (error) {
      log.error({ event: "voice.finalize_failed", callId: this.callId, err: error }, "Final call row not written");
    }
    if (hasWords) await this.deps.saveTranscript(this.callId, this.transcript).catch(() => undefined);
    await this.deps.deleteState(this.callId).catch(() => undefined);

    const summary = this.deps.brain.summary?.() ?? { done: [], notDone: [] };
    this.send({ type: "ended", reason, summary: { ...summary, billedSeconds: progress.billedSeconds } });
    this.channel?.close(1000);
    this.channel = null;
    log.info(
      { event: "voice.call_ended", callId: this.callId, reason, billedSeconds: progress.billedSeconds, turns: this.turns, toolCalls: this.toolCalls },
      "Call ended",
    );
    this.deps.onEnded?.(this.callId, reason);
  }
}
