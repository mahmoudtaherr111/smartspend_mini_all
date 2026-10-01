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
  type VoiceMode,
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
import { LostToolCallGuard } from "./lost-call-guard";
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
  /** The current mode's model and level; a mode switch replaces them. */
  model: string;
  voiceName: string;
  thinkingLevel: ThinkingLevel;
  /** The coach call; absent in calls stored before it existed, which are standard calls. */
  coach?: boolean;
  /** The current mode; absent in calls stored before modes existed (standard). */
  mode?: VoiceMode;
  /** What each mode runs on. Absent: the call cannot switch. */
  modes?: { standard: { model: string; thinkingLevel: ThinkingLevel }; ultra: { model: string; thinkingLevel: ThinkingLevel } | null };
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
  /** What a text model the tool asked cost at the provider, added to the call's cost and its daily cap. */
  costUsd?: number;
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
  /** The note after the user switched the call's mode: continue without greeting, in the new mode's way. */
  modeNote?(mode: VoiceMode): string;
  /**
   * Marks a note as the app's own, with the call's tag, so words the user types or says claiming to be from the app
   * are not taken for it.
   */
  appNote?(text: string): string;
  runTool(call: ToolCallRequest, context: ToolRunContext): Promise<ToolRunOutcome>;
  /**
   * True for a tool whose run may write (a confirmation). Its time limit does not report a failure: the write may
   * still land, so the model hears that it is still running and the outcome follows as a note once known.
   */
  writes?(toolName: string): boolean;
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
  /** Whether words claim a technical failure; lets the call hold back the extended model's lost-call apology. */
  claimsFailure?(text: string): boolean;
  /**
   * The note after a false apology was held back: call the tool again (none was called), answer from the results it
   * has (`afterTools`), or with no retries left say plainly that the answer cannot be reached now.
   */
  lostToolCallNote?(retry: boolean, afterTools: boolean): string;
  /** A tap on a draft card. */
  onCardAction?(action: "confirm" | "cancel", draftId: string, identity: CallIdentity): Promise<{ card: VoiceCard; note: string } | null>;
  /** True while a draft waits for the user's answer: the call is not cut off in the middle of it. */
  awaitingConfirmation?(): boolean;
  /** What the end card lists. */
  summary?(): { done: string[]; notDone: string[] };
  /** What the user asked to forget during the call, saved with the words for the post-call summary to leave out. */
  forgotten?(): string[];
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
  /**
   * The call's seat in its model's shared pool (gateway/admission.ts): taken or renewed on connecting and at every
   * checkpoint, given back when the call ends. `quota` tells the pool the provider refused this model for quota.
   * `joining` is a mode switch: a new session on that model, which a quota pause holds back like a new call.
   */
  seat?: {
    hold(model: string, joining?: boolean): Promise<boolean>;
    release(model: string): Promise<void>;
    quota(model: string): Promise<void>;
  };
  checkpointMs?: number;
  graceMs?: number;
  inactiveMs?: number;
  toolTimeoutMs?: number;
  /**
   * How long the screen shows "thinking" after the last tool answer before assuming the model will not speak (the
   * standard model; the extended-thinking one says IDLE itself, and waits twice this before the screen gives up).
   */
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
  /** Absent in calls stored before utterances were counted apart from the user's turns. */
  utterances?: number;
  toolCalls: number;
  incidents: number;
  reconnects: number;
  usage: UsageTotals;
  /** The tools' text-model cost so far; absent in calls stored before it was counted. */
  toolCostUsd?: number;
  firstAudioMs: number[];
  transcript: TranscriptLine[];
  warned: boolean;
  brain: unknown;
}

const WARNING_BEFORE_MS = 60_000;
/**
 * Added to a read's answer when the user spoke again while it ran: both Live models otherwise take an answer to the
 * old request as the answer to the new one ("مفيش التزامات" from a balance read; .agents evidence F4).
 */
export const EARLIER_REQUEST_NOTE = "النتيجة دي لطلب قبل كلام المستخدم الأخير. استخدمها بس لو لسه بترد على اللي طلبه دلوقتي.";
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
  /** The user's requests: each time they stop speaking or send typed words. Tool answers are tied to one of them. */
  private turns = 0;
  /** The model's spoken utterances (each `turn_complete`); a thinking model says several per request. */
  private utterances = 0;
  private toolCalls = 0;
  private incidents = 0;
  private reconnects = 0;
  private usage: UsageTotals = emptyUsage();
  private toolCostUsd = 0;
  private firstAudioMs: number[] = [];
  private speechEndedAt: number | null = null;
  private transcript: TranscriptLine[] = [];
  private warned = false;
  private extended = false;
  private lastActivity = Date.now();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private lastCheckpoint = 0;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Every tool answer is in and the model's spoken answer to them has not started yet. */
  private replyOwed = false;
  private replyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tool calls still running. */
  private runningTools = 0;
  /** The model is generating or working; the app's own notes wait for it to be idle. */
  private modelBusy = false;
  /** App notes held until the model is idle, so they never cut off what it is saying. */
  private notes: string[] = [];
  private lastClientAudioAt = 0;
  private readonly cancelledTools = new Set<string>();
  /** The extended-thinking model's lost-call apology held back (lost-call-guard.ts); null on other models. */
  private guard: LostToolCallGuard | null = null;
  private guardTimer: ReturnType<typeof setTimeout> | null = null;
  private lostToolCalls = 0;
  private readonly toolAborts = new Map<string, AbortController>();
  private attachChain: Promise<void> = Promise.resolve();

  /** A mode switch is under way: a second one waits for it. */
  private switching = false;
  private modeSwitches = 0;

  constructor(
    readonly identity: CallIdentity,
    public options: CallOptions,
    private readonly deps: CallSessionDeps,
  ) {
    const claimsFailure = deps.brain.claimsFailure?.bind(deps.brain);
    if (claimsFailure && options.model.includes("extended-thinking")) this.guard = new LostToolCallGuard({ claimsFailure });
  }

  /** A call that another server (or this one, before a restart) was running. */
  static restore(stored: StoredCall, deps: CallSessionDeps): CallSession {
    const session = new CallSession(stored.identity, stored.options, deps);
    session.resumeTokenHash = stored.resumeTokenHash;
    session.handle = stored.handle;
    session.epoch = stored.epoch;
    session.billedMs = stored.billedMs;
    session.turns = stored.turns;
    session.utterances = stored.utterances ?? 0;
    session.toolCalls = stored.toolCalls;
    session.incidents = stored.incidents;
    session.reconnects = stored.reconnects;
    session.usage = stored.usage;
    session.toolCostUsd = stored.toolCostUsd ?? 0;
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

    if (this.deps.seat && !(await this.deps.seat.hold(this.options.model).catch(() => true))) {
      this.send({ type: "error", code: "provider_unavailable", message: "كل الخطوط مشغولة دلوقتي. جرب كمان دقيقة، أو كمل بالكتابة في الشات.", fallback: "chat" });
      await this.end("provider", { failed: !resumed });
      return;
    }
    const connected = await this.connectEngine(resumed);
    if (connected !== "ok") {
      this.send({
        type: "error",
        code: "provider_unavailable",
        message: connected === "quota"
          ? "المكالمات وصلت لحد الاستخدام المسموح دلوقتي. جرب بعد شوية، أو كمل بالكتابة في الشات."
          : "محرك الصوت مش متاح دلوقتي. تقدر تكمل بالكتابة في الشات.",
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
      mode: this.options.mode ?? "standard",
      ultraAvailable: Boolean(this.options.modes?.ultra),
    });
    this.setState("listening");
    this.modelBusy = true;
    this.engine?.sendText(this.tagged(this.deps.brain.openingNote(resumed, this.transcript.slice(-6))));
    this.startTicker();
    await this.persistState();
    // The app may have gone while the engine was connecting: then the call waits for it like any dropped call.
    if (!channel.open) this.detach(channel);
  }

  private async connectEngine(resumed: boolean, history?: Array<{ role: "user" | "model"; text: string }>): Promise<"ok" | "quota" | "failed"> {
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
        history,
      });
      return engine;
    };
    const failed = async (error: unknown): Promise<"quota" | "failed"> => {
      if (error instanceof Error && error.message === "provider_quota") {
        log.warn({ event: "voice.provider_quota", callId: this.callId, model: this.options.model }, "Provider refused the session for quota");
        await this.deps.seat?.quota(this.options.model).catch(() => undefined);
        return "quota";
      }
      log.warn({ event: "voice.engine_connect_failed", callId: this.callId, err: error }, "Engine unavailable");
      return "failed";
    };
    try {
      this.engine = await attempt(resumed ? this.handle : null);
      return "ok";
    } catch (error) {
      if (error instanceof Error && error.message === "provider_quota") return failed(error);
      if (resumed && this.handle) {
        // The provider no longer knows the session: start a fresh one; the opening note carries the recent turns.
        log.warn({ event: "voice.resume_handle_rejected", callId: this.callId, err: error }, "Starting a fresh provider session");
        this.handle = null;
        try {
          this.engine = await attempt(null);
          return "ok";
        } catch (retryError) {
          return failed(retryError);
        }
      }
      return failed(error);
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
    this.lastClientAudioAt = Date.now();
    if (this.state !== "listening" && this.state !== "awaiting_confirmation") this.setState("listening");
    this.engine.sendAudio(pcm);
  }

  async onClientMessage(message: VoiceClientMessage): Promise<void> {
    switch (message.type) {
      case "speech_end":
        if (this.status !== "live" || !this.engine) return;
        this.turns += 1;
        this.guard?.newRequest();
        this.speechEndedAt = Date.now();
        this.modelBusy = true;
        this.engine.endOfSpeech();
        this.setState("thinking");
        return;
      case "text":
        if (this.status !== "live" || !this.engine) return;
        this.turns += 1;
        this.guard?.newRequest();
        this.lastActivity = Date.now();
        this.speechEndedAt = Date.now();
        this.addTranscript("user", message.text);
        this.deps.brain.onUserWords?.(message.text);
        // Typed words are the user's own turn: they may cut the model off, as speaking over it does.
        this.modelBusy = true;
        this.engine.sendText(message.text);
        this.setState("thinking");
        return;
      case "mode":
        await this.switchMode(message.mode);
        return;
      case "confirm":
      case "cancel": {
        const outcome = await this.deps.brain.onCardAction?.(message.type, message.draftId, this.identity);
        if (!outcome) return;
        this.send({ type: "card", card: outcome.card });
        this.sendNote(outcome.note);
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

  // ─── Modes ────────────────────────────────────────────────────────

  /** The call's words so far, as history for a fresh session: the latest lines, within a size the context can carry. */
  private historyForNewSession(): Array<{ role: "user" | "model"; text: string }> {
    const out: Array<{ role: "user" | "model"; text: string }> = [];
    let chars = 0;
    for (const line of [...this.transcript].reverse()) {
      if (line.role === "forgotten") continue;
      const text = line.text.replace(/\s+/g, " ").trim().slice(0, 600);
      if (!text) continue;
      if (out.length >= 16 || chars + text.length > 6_000) break;
      chars += text.length;
      out.unshift({ role: line.role === "user" ? "user" : "model", text });
    }
    // History starts with the user's turn.
    while (out[0]?.role === "model") out.shift();
    return out;
  }

  /**
   * The user switched the call to the other mode. The switch waits for running tools, takes a seat in the new model's
   * pool (a quota pause refuses it), and opens a fresh session on the new model with the conversation as history; the
   * brain's state (drafts, facts, consent) is the server's and carries over. If the new model cannot connect, the call
   * says so and goes back to the mode it was in: never a silent change of model.
   */
  private async switchMode(target: VoiceMode): Promise<void> {
    const current = this.options.mode ?? "standard";
    if (this.status !== "live" || !this.engine || this.switching || target === current) return;
    const config = target === "ultra" ? this.options.modes?.ultra : this.options.modes?.standard;
    if (!config) {
      this.send({ type: "mode", mode: current, status: "refused", message: "التفكير الأعمق مش متاح في باقتك دلوقتي." });
      return;
    }
    if (this.runningTools > 0) {
      this.send({ type: "mode", mode: current, status: "refused", message: "استنى ثانية لحد ما يخلص اللي بيعمله، وجرب تاني." });
      return;
    }
    this.switching = true;
    try {
      this.send({ type: "mode", mode: target, status: "switching" });
      if (this.deps.seat && !(await this.deps.seat.hold(config.model, true).catch(() => false))) {
        this.send({ type: "mode", mode: current, status: "refused", message: "التفكير الأعمق عليه ضغط دلوقتي. كمل عادي وجرب بعد شوية." });
        return;
      }
      const previous = { mode: current, model: this.options.model, thinkingLevel: this.options.thinkingLevel };
      const history = this.historyForNewSession();
      this.closeEngine();
      this.handle = null;
      this.useModel(target, config);
      this.setState("thinking");
      let result = await this.connectEngine(false, history);
      if (result !== "ok") {
        await this.deps.seat?.release(config.model).catch(() => undefined);
        this.useModel(previous.mode, previous);
        result = await this.connectEngine(false, history);
        if (result !== "ok") {
          await this.end("provider");
          return;
        }
        this.send({ type: "mode", mode: previous.mode, status: "refused", message: "مقدرتش أشغّل التفكير الأعمق دلوقتي، فكملنا عادي." });
        this.afterModeConnected(previous.mode);
        return;
      }
      if (previous.model !== config.model) await this.deps.seat?.release(previous.model).catch(() => undefined);
      this.modeSwitches += 1;
      this.send({ type: "mode", mode: target, status: "active" });
      this.afterModeConnected(target);
    } finally {
      this.switching = false;
    }
  }

  private useModel(mode: VoiceMode, config: { model: string; thinkingLevel: ThinkingLevel }): void {
    this.options = { ...this.options, mode, model: config.model, thinkingLevel: config.thinkingLevel };
    const claimsFailure = this.deps.brain.claimsFailure?.bind(this.deps.brain);
    this.guard = claimsFailure && config.model.includes("extended-thinking") ? new LostToolCallGuard({ claimsFailure }) : null;
  }

  private afterModeConnected(mode: VoiceMode): void {
    this.lastActivity = Date.now();
    this.modelBusy = true;
    const note = this.deps.brain.modeNote?.(mode);
    if (note && this.engine) this.engine.sendText(this.tagged(note));
    this.setState("thinking");
    void this.persistState();
  }

  // ─── Engine events ────────────────────────────────────────────────

  private onEngineEvent(engine: VoiceEngine, event: EngineEvent): void {
    if (engine !== this.engine || this.status === "ended") return;
    switch (event.type) {
      case "audio": {
        this.replyStarted();
        this.modelBusy = true;
        this.lastActivity = Date.now();
        const verdict = this.guard?.audio(event.pcm, event.sampleRate, Date.now()) ?? { kind: "pass" as const };
        if (verdict.kind === "hold") this.armGuardTimer();
        if (verdict.kind === "release") this.releaseHeld(verdict);
        if (verdict.kind === "pass") this.playAudio(event.pcm);
        return;
      }
      case "input_transcript":
        this.lastActivity = Date.now();
        this.addTranscript("user", event.text);
        this.send({ type: "caption", role: "user", text: event.text });
        this.deps.brain.onUserWords?.(event.text);
        return;
      case "output_transcript": {
        const verdict = this.guard?.words(event.text, Date.now()) ?? { kind: "pass" as const };
        if (verdict.kind === "drop") this.onLostToolCall(verdict.retry, verdict.afterTools);
        else if (verdict.kind === "release") this.releaseHeld(verdict);
        else if (verdict.kind === "pass") this.assistantSaid(event.text);
        return;
      }
      case "tool_calls": {
        const held = this.guard?.toolCalled();
        if (held?.kind === "release") this.releaseHeld(held);
        this.modelBusy = true;
        this.replyStarted();
        this.setState("thinking", this.deps.brain.waitDetail?.(event.calls));
        void this.runTools(event.calls);
        return;
      }
      case "working":
        this.modelBusy = true;
        // Still working after it stopped speaking, or on what the user just said: not listening. While the user is
        // talking the screen stays on them.
        if ((this.state === "listening" || this.state === "awaiting_confirmation") && Date.now() - this.lastClientAudioAt > 700) {
          this.setState("thinking", this.stateDetail);
        }
        return;
      case "tool_cancel":
        for (const id of event.ids) {
          this.cancelledTools.add(id);
          this.toolAborts.get(id)?.abort();
        }
        return;
      case "interrupted":
        this.replyStarted();
        this.guard?.interrupted();
        this.send({ type: "interrupted" });
        return;
      case "turn_complete": {
        const held = this.guard?.utteranceEnded(event.working === true);
        if (held?.kind === "release") this.releaseHeld(held);
        this.utterances += 1;
        this.applySpeechCheck(this.deps.brain.onTurnEnd?.() ?? null);
        // The extended-thinking model may stop speaking and keep working: until it says IDLE it is thinking.
        if (this.thinkingModel && this.state === "speaking") this.setState("thinking", this.stateDetail);
        return;
      }
      case "idle":
        // A tool is still running, or (the standard model, whose turn ends with the call) its answer is still owed:
        // the call is not listening while the answer is being prepared.
        if (this.runningTools > 0) return;
        if (this.replyOwed && !this.thinkingModel) return;
        this.replyStarted();
        this.modelBusy = false;
        if (this.flushNotes()) return;
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
        if (event.reason === "provider_quota") {
          void this.deps.seat?.quota(this.options.model).catch(() => undefined);
          this.send({ type: "notice", kind: "degraded", message: "المكالمات وصلت لحد الاستخدام المسموح دلوقتي. كمل بالكتابة في الشات، أو جرب بعد شوية." });
        }
        void this.end("provider");
        return;
      default:
        return;
    }
  }

  private get thinkingModel(): boolean {
    return this.options.model.includes("extended-thinking");
  }

  private playAudio(pcm: Buffer): void {
    if (this.speechEndedAt !== null) {
      this.firstAudioMs.push(Date.now() - this.speechEndedAt);
      this.speechEndedAt = null;
    }
    this.setState("speaking");
    this.channel?.sendAudio(pcm);
  }

  private assistantSaid(text: string): void {
    this.addTranscript("assistant", text);
    this.send({ type: "caption", role: "assistant", text });
    this.applySpeechCheck(this.deps.brain.onAssistantWords?.(text) ?? null);
  }

  /** What the guard held turned out to be an answer: play and show it now, in order. */
  private releaseHeld(held: { audio: Array<{ pcm: Buffer }>; words: string[] }): void {
    if (this.guardTimer) clearTimeout(this.guardTimer);
    this.guardTimer = null;
    for (const chunk of held.audio) this.playAudio(chunk.pcm);
    for (const words of held.words) this.assistantSaid(words);
  }

  private armGuardTimer(): void {
    if (this.guardTimer) return;
    this.guardTimer = setTimeout(() => {
      this.guardTimer = null;
      const held = this.guard?.tick(Date.now() + 1);
      if (held?.kind === "release") this.releaseHeld(held);
      else if (this.guard?.holding) this.armGuardTimer();
    }, 950);
  }

  /**
   * The extended model lost its own tool call and began apologising for a failure no tool had: the apology was held
   * back and is dropped; the model is asked to call the tool again, or, with no retries left, to say plainly that it
   * cannot reach that information in this call.
   */
  private onLostToolCall(retry: boolean, afterTools: boolean): void {
    if (this.guardTimer) clearTimeout(this.guardTimer);
    this.guardTimer = null;
    this.lostToolCalls += 1;
    this.recordIncident("lost_tool_call", { retry, afterTools });
    const note = this.deps.brain.lostToolCallNote?.(retry, afterTools);
    if (note) this.sendNote(note, true);
  }

  /**
   * Every tool answer is in: the model owes its spoken answer. The wait starts now, not when the tools were called,
   * so a slow tool never sends the screen back to "listening" while it works. A model that then says nothing must
   * not leave the screen on "thinking" for ever; that silence is recorded.
   */
  private expectReply(): void {
    this.replyOwed = true;
    if (this.replyTimer) clearTimeout(this.replyTimer);
    const waitMs = (this.deps.replyWaitMs ?? 8_000) * (this.thinkingModel ? 2 : 1);
    this.replyTimer = setTimeout(() => {
      this.replyTimer = null;
      if (!this.replyOwed || this.status !== "live" || this.runningTools > 0) return;
      this.replyOwed = false;
      this.modelBusy = false;
      this.recordIncident("no_reply_after_tool", { waitedMs: waitMs });
      if (this.flushNotes()) return;
      this.setState(this.deps.brain.awaitingConfirmation?.() ? "awaiting_confirmation" : "listening");
    }, waitMs);
  }

  /**
   * A note from the app to the model. It is a complete user turn, which stops whatever the model is saying, so an
   * ordinary note (a tap on a card, the time warning, a write's late outcome) waits until the model is idle; only a
   * note that must stop what is being said (a wrong number, "done" before consent) goes at once.
   */
  private sendNote(note: string, interrupt = false): void {
    if (!this.engine) return;
    const text = this.tagged(note);
    if (interrupt || !this.modelBusy) {
      this.modelBusy = true;
      this.engine.sendText(text);
      return;
    }
    this.notes.push(text);
  }

  private tagged(note: string): string {
    return this.deps.brain.appNote ? this.deps.brain.appNote(note) : note;
  }

  /** Sends the notes held while the model was busy, as one turn. True when there were any. */
  private flushNotes(): boolean {
    if (!this.notes.length || !this.engine) return false;
    const text = this.notes.splice(0).join("\n");
    this.modelBusy = true;
    this.engine.sendText(text);
    this.setState("thinking");
    return true;
  }

  private replyStarted(): void {
    this.replyOwed = false;
    if (this.replyTimer) clearTimeout(this.replyTimer);
    this.replyTimer = null;
  }

  private applySpeechCheck(check: SpeechCheck | null): void {
    if (!check) return;
    this.recordIncident(check.kind ?? "spoken_number_mismatch", check.incident);
    // A correction must stop the wrong sentence: it is the one note that interrupts.
    if (check.note) this.sendNote(check.note, true);
  }

  /**
   * Runs the tools of one call from the model. Each answer goes back the moment it is ready: a quick read is not
   * held behind a slow one, and the model can speak about it while the other still works (Live tools are
   * NON_BLOCKING). The model only calls a tool with what it already has, so answers of one batch never depend on
   * each other.
   */
  private async runTools(calls: ToolCallRequest[]): Promise<void> {
    const engine = this.engine;
    const request = this.turns;
    this.runningTools += calls.length;
    await Promise.all(calls.map(async (call) => {
      const result = await this.runTool(call);
      // A read that answers a request the user has since replaced says so; a write's outcome is reported as it is.
      if (result && request !== this.turns && !this.deps.brain.writes?.(call.name)) {
        result.response = { ...result.response, earlier_request: EARLIER_REQUEST_NOTE };
      }
      this.runningTools = Math.max(0, this.runningTools - 1);
      if (result) this.guard?.toolAnswered(result.response.ok !== false);
      if (!result || !engine || engine !== this.engine || this.status !== "live" || this.cancelledTools.has(call.id)) return;
      engine.sendToolResults([result]);
      if (this.runningTools === 0) this.expectReply();
    }));
  }

  private async runTool(call: ToolCallRequest): Promise<ToolCallResult | null> {
    this.toolCalls += 1;
    const abort = new AbortController();
    const startedAt = Date.now();
    const writes = this.deps.brain.writes?.(call.name) ?? false;
    this.toolAborts.set(call.id, abort);
    const running = this.deps.brain.runTool(call, { identity: this.identity, signal: abort.signal });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.deps.toolTimeoutMs ?? 12_000);
    });
    const aborted = new Promise<"aborted">((resolve) => abort.signal.addEventListener("abort", () => resolve("aborted")));
    try {
      const first = await Promise.race([running, timedOut, aborted]);
      if (first === "timeout" && writes) {
        // A write that started may still land: never "failed", never "done" until it answers.
        this.recordIncident("tool_slow_write", { tool: call.name });
        void running.then((outcome) => this.lateWriteOutcome(outcome), () => this.lateWriteOutcome(null));
        return {
          id: call.id,
          name: call.name,
          response: { ok: false, error: "still_running", say: "العملية لسه بتتنفذ. قول إنك بتتأكد منها، ومتقولش إنها اتعملت ولا إنها فشلت لحد ما التطبيق يقولك." },
        };
      }
      if (first === "timeout" || first === "aborted") {
        abort.abort();
        throw new Error(first === "timeout" ? "tool_timeout" : "tool_cancelled");
      }
      const outcome = first;
      if (outcome.card) this.send({ type: "card", card: outcome.card });
      if (outcome.costUsd) {
        this.toolCostUsd += outcome.costUsd;
        this.checkCostBudget();
      }
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
      if (reason !== "tool_cancelled") this.recordIncident("tool_error", { tool: call.name, reason });
      log.warn({ event: "voice.tool_failed", callId: this.callId, tool: call.name, ms: Date.now() - startedAt, reason, err: error }, "Tool failed");
      return {
        id: call.id,
        name: call.name,
        response: { ok: false, error: reason, say: "مش قادر أجيب ده دلوقتي. قول للمستخدم كده بوضوح ومتخمنش." },
      };
    } finally {
      if (timer) clearTimeout(timer);
      this.toolAborts.delete(call.id);
    }
  }

  /** A write that outran its time limit has answered: the card shows it, and the model hears it when it is idle. */
  private lateWriteOutcome(outcome: ToolRunOutcome | null): void {
    if (this.status === "ended") return;
    if (outcome?.card) this.send({ type: "card", card: outcome.card });
    const done = outcome?.response.ok === true;
    const what = typeof outcome?.response.done === "string" ? `: ${outcome.response.done}` : "";
    this.sendNote(done
      ? `(ملاحظة من التطبيق: العملية اللي كانت لسه بتتنفذ اتعملت${what}. قول ده في جملة قصيرة.)`
      : "(ملاحظة من التطبيق: العملية اللي كانت لسه بتتنفذ ماتمتش. قول كده بوضوح واعرض تحاول تاني.)");
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
      await Promise.all([this.checkpoint(), this.persistState(), this.deps.seat?.hold(this.options.model).catch(() => true)]);
    }
  }

  private warnEnding(secondsLeft: number): void {
    this.warned = true;
    this.send({ type: "notice", kind: "time_warning", secondsLeft, message: "فاضل حوالي دقيقة على نهاية المكالمة." });
    this.sendNote(
      "(ملاحظة من التطبيق، مش من المستخدم: فاضل حوالي دقيقة على نهاية المكالمة. لو فيه حاجة مهمة مفتوحة خلّصها، " +
        "وقول للمستخدم بجملة قصيرة إن الوقت قرب يخلص. متبدأش موضوع جديد.)",
    );
  }

  private checkCostBudget(): void {
    const budget = this.options.costBudgetUsd;
    if (budget === null || this.status !== "live") return;
    const cost = this.costUsd();
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

  /** The live model's tokens at Google's rates, plus what the tools' text models cost. */
  private costUsd(): number {
    return Number((usageCostUsd(this.usage) + this.toolCostUsd).toFixed(8));
  }

  private metrics(): Record<string, unknown> {
    return {
      profile: this.options.coach ? "coach" : "standard",
      thinkingLevel: this.thinkingModel ? this.options.thinkingLevel : null,
      utterances: this.utterances,
      lostToolCalls: this.lostToolCalls,
      mode: this.options.mode ?? "standard",
      modeSwitches: this.modeSwitches,
      toolCostUsd: this.toolCostUsd,
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
      costUsd: this.costUsd(),
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
      utterances: this.utterances,
      toolCalls: this.toolCalls,
      incidents: this.incidents,
      reconnects: this.reconnects,
      usage: this.usage,
      toolCostUsd: this.toolCostUsd,
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
    if (this.guardTimer) clearTimeout(this.guardTimer);
    this.guardTimer = null;
    this.guard?.interrupted();
    this.notes = [];
    this.runningTools = 0;
    this.modelBusy = false;
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
    if (hasWords) {
      const forgotten = (this.deps.brain.forgotten?.() ?? []).filter(Boolean).map((text) => ({ role: "forgotten" as const, text }));
      await this.deps.saveTranscript(this.callId, [...this.transcript, ...forgotten]).catch(() => undefined);
    }
    await this.deps.deleteState(this.callId).catch(() => undefined);
    await this.deps.seat?.release(this.options.model).catch(() => undefined);

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
