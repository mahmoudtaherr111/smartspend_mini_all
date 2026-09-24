/**
 * One call from the app's side, loaded by call-store.ts when a call starts. The microphone goes through the
 * resampler and the speech detector to the socket; the assistant's voice goes to the player; what the server says
 * (its state, captions, cards, notices and the end) goes into the view the call screen renders.
 *
 * The user talking over the assistant lowers its voice at once and the server's `interrupted` silences it; if the
 * server decides it was not an interruption, the voice comes back up when the user stops.
 */
import { Capacitor } from "@capacitor/core";
import {
  VOICE_SOCKET_PATH,
  VOICE_TEXT_MAX_LENGTH,
  type VoiceCard,
  type VoiceClientPlatform,
  type VoiceServerMessage,
} from "@contracts/voice-protocol";
import { attachMicrophone, outputLevel, releaseCallAudio, ScreenWake, type PrimedAudio } from "./audio-io";
import { CallConnection, type ConnectionClose, type ConnectionEvents, type SocketLike } from "./call-connection";
import type { CallEnding, CallNotice, StartRequest, TimelineItem, VoiceCallView } from "./call-store";
import { Downsampler } from "./downsampler";
import { PcmPlayer } from "./pcm-player";
import { FRAME_SAMPLES, SpeechDetector } from "./speech-detector";

export function voiceSocketUrl(): string {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  let base: URL;
  try {
    base = new URL(api || window.location.href);
  } catch {
    base = new URL(window.location.href);
  }
  return `${base.protocol === "https:" ? "wss:" : "ws:"}//${base.host}${VOICE_SOCKET_PATH}`;
}

export function clientPlatform(): VoiceClientPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") return platform;
  return window.matchMedia?.("(display-mode: standalone)").matches ? "pwa" : "web";
}

const MAX_TIMELINE = 40;
const MAX_CAPTION_CHARS = 1_200;
const TRACE_EVERY_MS = 2_000;
const DUCKED_GAIN = 0.25;

const MICROPHONE_NOTICE: CallNotice = {
  kind: "microphone",
  message: "الميكروفون مش شغال. تقدر تكتب لسمارت، وهو هيرد عليك بصوته.",
};

function stopMeter(meter: VoiceCallView["meter"]): VoiceCallView["meter"] {
  return {
    accumulatedMs: meter.accumulatedMs + (meter.liveSince !== null ? Date.now() - meter.liveSince : 0),
    liveSince: null,
  };
}

function trimTimeline(items: TimelineItem[]): TimelineItem[] {
  return items.length > MAX_TIMELINE ? items.slice(items.length - MAX_TIMELINE) : items;
}

export interface ControllerOptions {
  audio: PrimedAudio;
  request: StartRequest;
  getView(): VoiceCallView;
  setView(next: VoiceCallView): void;
  /** The user hung up before the call was connected: nothing to show, back to no call. */
  reset(): void;
  createSocket?: (url: string) => SocketLike;
  attachMic?: typeof attachMicrophone;
}

export class VoiceCallController {
  private connection: CallConnection | null = null;
  private readonly player: PcmPlayer;
  private readonly detector = new SpeechDetector();
  private readonly downsampler: Downsampler;
  private frame = new Int16Array(FRAME_SAMPLES);
  private frameFill = 0;
  private outbox: Int16Array[] = [];
  private stream: MediaStream | null = null;
  private detachMic: (() => void) | null = null;
  private muted = false;
  private wasLive = false;
  private hungUpEarly = false;
  private tornDown = false;
  private disposed = false;
  private readonly wake = new ScreenWake();
  private speechEndedAt: number | null = null;
  private ducked = false;
  private openCaption: string | null = null;
  private seq = 0;
  private sentFrames = 0;
  private rttMs: number | null = null;
  private firstAudioMs: number[] = [];
  private reconnects = 0;
  private traceTimer: ReturnType<typeof setInterval> | null = null;
  private listeningTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly meterScratch: Float32Array<ArrayBuffer>;
  private readonly onVisibility = () => this.handleVisibility();
  private readonly onOnline = () => this.connection?.retryNow();
  private readonly onTrackEnded = () => {
    if (document.visibilityState === "visible") void this.reopenMicrophone();
  };

  constructor(private readonly options: ControllerOptions) {
    const { context, output, outputMeter } = options.audio;
    this.player = new PcmPlayer(context, output);
    this.downsampler = new Downsampler(context.sampleRate);
    this.meterScratch = new Float32Array(outputMeter.fftSize);
  }

  private get view(): VoiceCallView {
    return this.options.getView();
  }

  private patch(patch: Partial<VoiceCallView>): void {
    if (!this.disposed) this.options.setView({ ...this.view, ...patch });
  }

  async start(): Promise<void> {
    const { audio, request } = this.options;
    const client = clientPlatform();
    const [outcome, stream] = await Promise.all([
      request.startCall({ voice: request.voice, client }).catch(() => null),
      audio.mic.then(
        (granted) => granted,
        () => null,
      ),
    ]);
    if (this.disposed || this.hungUpEarly) {
      stream?.getTracks().forEach((track) => track.stop());
      return;
    }
    if (!outcome || outcome.kind !== "ok") {
      this.teardown(stream);
      if (!outcome) this.fail("مقدرناش نبدأ المكالمة. اتأكد من النت وجرّب تاني.", true);
      else if (outcome.kind === "legacy") this.fail("", false, true);
      else this.fail(outcome.message, true);
      return;
    }

    this.stream = stream;
    this.patch({
      callId: outcome.callId,
      maxSeconds: outcome.maxSeconds,
      micAvailable: Boolean(stream),
      notice: stream ? null : MICROPHONE_NOTICE,
      trace: { ...this.view.trace, sampleRate: audio.context.sampleRate },
    });
    if (stream) {
      try {
        this.detachMic = await (this.options.attachMic ?? attachMicrophone)(audio.context, stream, (block) =>
          this.onMicBlock(block),
        );
        stream.getAudioTracks().forEach((track) => track.addEventListener("ended", this.onTrackEnded));
      } catch {
        this.patch({ micAvailable: false, notice: MICROPHONE_NOTICE });
      }
    }
    if (this.disposed || this.hungUpEarly) return;

    this.connection = new CallConnection({
      url: voiceSocketUrl(),
      client,
      events: this.events(),
      createSocket: this.options.createSocket,
    });
    this.connection.open(outcome.ticket);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("online", this.onOnline);
    void this.wake.acquire();
    this.traceTimer = setInterval(() => this.publishTrace(), TRACE_EVERY_MS);
  }

  // ─── The server's side ────────────────────────────────────────────

  private events(): ConnectionEvents {
    return {
      ready: (message) => {
        const view = this.view;
        if (message.resumed) this.reconnects += 1;
        this.wasLive = true;
        const stale = view.notice?.kind === "reconnecting" || view.notice?.kind === "degraded";
        this.patch({
          phase: "live",
          callId: message.callId,
          maxSeconds: message.maxSeconds,
          activity: "listening",
          meter: { ...view.meter, liveSince: Date.now() },
          notice: stale ? null : view.notice,
        });
      },
      message: (message) => this.onServerMessage(message),
      audio: (pcm) => {
        if (this.speechEndedAt !== null) {
          this.firstAudioMs = [...this.firstAudioMs.slice(-9), Date.now() - this.speechEndedAt];
          this.speechEndedAt = null;
        }
        this.player.enqueue(pcm);
      },
      reconnecting: () => {
        this.player.flush();
        this.unduck();
        this.detector.flush();
        this.outbox = [];
        this.closeCaption();
        this.patch({
          phase: "reconnecting",
          activity: "reconnecting",
          meter: stopMeter(this.view.meter),
          notice: { kind: "reconnecting", message: "الخط قطع. بنرجّعه…" },
        });
      },
      closed: (outcome) => this.onClosed(outcome),
      rtt: (ms) => {
        this.rttMs = ms;
      },
    };
  }

  private onServerMessage(message: VoiceServerMessage): void {
    switch (message.type) {
      case "state":
        if (message.state === "listening" || message.state === "awaiting_confirmation") {
          this.closeCaption();
          this.showWhenPlayed(message.state);
          return;
        }
        if (this.listeningTimer) clearTimeout(this.listeningTimer);
        if (message.state === "thinking") this.closeCaption();
        this.patch({ activity: message.state, activityDetail: message.detail ?? null });
        return;
      case "caption":
        this.addCaption(message.role, message.text);
        return;
      case "card":
        this.upsertCard(message.card);
        return;
      case "interrupted":
        this.player.flush();
        this.unduck();
        this.closeCaption();
        return;
      case "notice":
        this.showNotice({ kind: message.kind, message: message.message }, message.kind === "time_warning" ? 12_000 : 6_000);
        return;
      default:
        // `ended` and `error` are read when the socket closes.
        return;
    }
  }

  /** The server says it is listening while the phone may still be playing the end of the reply. */
  private showWhenPlayed(state: "listening" | "awaiting_confirmation"): void {
    if (this.listeningTimer) clearTimeout(this.listeningTimer);
    if (this.player.playing) {
      this.listeningTimer = setTimeout(() => this.showWhenPlayed(state), this.player.bufferedMs + 30);
      return;
    }
    if (!this.detector.speaking) this.patch({ activity: state, activityDetail: null });
  }

  private showNotice(notice: CallNotice, forMs: number): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.patch({ notice });
    this.noticeTimer = setTimeout(() => {
      if (this.view.notice === notice) this.patch({ notice: null });
    }, forMs);
  }

  private closeCaption(): void {
    this.openCaption = null;
  }

  private addCaption(role: "user" | "assistant", text: string): void {
    const timeline = this.view.timeline;
    const last = timeline[timeline.length - 1];
    if (last && last.key === this.openCaption && last.kind === "caption" && last.role === role) {
      const merged: TimelineItem = { ...last, text: `${last.text}${text}`.slice(-MAX_CAPTION_CHARS) };
      this.patch({ timeline: [...timeline.slice(0, -1), merged] });
      return;
    }
    const clean = text.trimStart();
    if (!clean) return;
    const key = `c${++this.seq}`;
    this.openCaption = key;
    this.patch({ timeline: trimTimeline([...timeline, { key, kind: "caption", role, text: clean }]) });
  }

  private upsertCard(card: VoiceCard): void {
    this.closeCaption();
    const key =
      card.kind === "draft" ? `draft:${card.draftId}` : card.kind === "fact" ? `fact:${card.id}` : `${card.kind}:${++this.seq}`;
    const timeline = this.view.timeline;
    const index = timeline.findIndex((item) => item.key === key);
    const before = index >= 0 ? timeline[index] : null;
    const item: TimelineItem = { key, kind: "card", card };
    const wasExecuted = before?.kind === "card" && before.card.kind === "draft" && before.card.status === "executed";
    const executed = card.kind === "draft" && card.status === "executed" && !wasExecuted;
    this.patch({
      timeline: index >= 0 ? timeline.map((existing, i) => (i === index ? item : existing)) : trimTimeline([...timeline, item]),
      executed: this.view.executed + (executed ? 1 : 0),
    });
  }

  private localSummary(): Pick<CallEnding, "done" | "notDone"> {
    const done: string[] = [];
    const notDone: string[] = [];
    for (const item of this.view.timeline) {
      if (item.kind !== "card" || item.card.kind !== "draft") continue;
      if (item.card.status === "executed") done.push(item.card.title);
      else if (item.card.status !== "cancelled") notDone.push(item.card.title);
    }
    return { done, notDone };
  }

  private onClosed(outcome: ConnectionClose): void {
    this.teardown(this.stream);
    if (this.hungUpEarly) return;
    const view = this.view;
    const base = { minimized: false, meter: stopMeter(view.meter), notice: null };
    if (outcome.kind === "ended") {
      if (!this.wasLive) {
        this.options.reset();
        return;
      }
      const message = outcome.message;
      const ending: CallEnding = message?.summary
        ? { reason: message.reason, done: message.summary.done, notDone: message.summary.notDone, billedSeconds: message.summary.billedSeconds }
        : { reason: message?.reason ?? "user", ...this.localSummary(), billedSeconds: null };
      this.patch({ ...base, phase: "ended", ending });
      return;
    }
    if (this.wasLive) {
      // Refused or unreachable after the call was live: the server ended it while the line was down.
      this.patch({ ...base, phase: "ended", ending: { reason: "lost", ...this.localSummary(), billedSeconds: null } });
      return;
    }
    if (outcome.kind === "refused") this.fail(outcome.error.message, outcome.error.fallback === "chat");
    else this.fail("مقدرناش نوصل للمكالمة. اتأكد من النت وجرّب تاني.", true);
  }

  private fail(message: string, fallbackChat: boolean, legacy = false): void {
    this.teardown(this.stream);
    this.patch({ phase: "failed", minimized: false, notice: null, failure: { message, fallbackChat, legacy } });
  }

  // ─── The user's side ──────────────────────────────────────────────

  private onMicBlock(block: Float32Array): void {
    if (this.tornDown || this.muted) return;
    const samples = this.downsampler.process(block);
    for (let i = 0; i < samples.length; i++) {
      this.frame[this.frameFill++] = samples[i];
      if (this.frameFill === FRAME_SAMPLES) {
        const frame = this.frame;
        this.frame = new Int16Array(FRAME_SAMPLES);
        this.frameFill = 0;
        this.onFrame(frame);
      }
    }
  }

  private onFrame(frame: Int16Array): void {
    if (this.connection?.state !== "live") return;
    const step = this.detector.push(frame, this.player.playing);
    if (step.speechStart) this.onSpeechStart();
    if (step.send.length) this.outbox.push(...step.send);
    if (step.speechStart || step.speechEnd || this.outbox.length >= 2) this.flushOutbox();
    if (step.speechEnd) this.onSpeechEnd();
  }

  /** Sends what is waiting as one message: 40 ms at a time while speaking, the 300 ms before the speech at once. */
  private flushOutbox(): void {
    if (!this.outbox.length) return;
    const pcm = new Int16Array(this.outbox.length * FRAME_SAMPLES);
    this.outbox.forEach((frame, i) => pcm.set(frame, i * FRAME_SAMPLES));
    if (this.connection?.sendAudio(pcm)) this.sentFrames += this.outbox.length;
    this.outbox = [];
  }

  private onSpeechStart(): void {
    if (this.player.playing) this.duck();
    if (this.listeningTimer) clearTimeout(this.listeningTimer);
    this.closeCaption();
    this.patch({ activity: "user_speaking" });
  }

  private onSpeechEnd(): void {
    this.connection?.send({ type: "speech_end" });
    this.speechEndedAt = Date.now();
    this.unduck();
    this.patch({ activity: "thinking" });
  }

  private duck(): void {
    if (this.ducked) return;
    this.ducked = true;
    const { context, output } = this.options.audio;
    output.gain.setTargetAtTime(DUCKED_GAIN, context.currentTime, 0.03);
  }

  private unduck(): void {
    if (!this.ducked) return;
    this.ducked = false;
    const { context, output } = this.options.audio;
    output.gain.setTargetAtTime(1, context.currentTime, 0.05);
  }

  private handleVisibility(): void {
    if (document.visibilityState !== "visible") {
      this.wake.lost();
      return;
    }
    void this.options.audio.context.resume().catch(() => undefined);
    void this.wake.acquire();
    this.connection?.retryNow();
    const tracks = this.stream?.getAudioTracks() ?? [];
    if (tracks.length && tracks.every((track) => track.readyState === "ended")) void this.reopenMicrophone();
  }

  /** The system took the microphone away (the app went to the background on iOS): ask for it again. */
  private async reopenMicrophone(): Promise<void> {
    if (this.tornDown) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (this.tornDown) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.detachMic?.();
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = stream;
      this.detachMic = await (this.options.attachMic ?? attachMicrophone)(this.options.audio.context, stream, (block) =>
        this.onMicBlock(block),
      );
      stream.getAudioTracks().forEach((track) => track.addEventListener("ended", this.onTrackEnded));
      this.patch({ micAvailable: true, notice: this.view.notice?.kind === "microphone" ? null : this.view.notice });
    } catch {
      this.patch({ micAvailable: false, notice: MICROPHONE_NOTICE });
    }
  }

  private publishTrace(): void {
    this.patch({
      trace: {
        rttMs: this.rttMs,
        firstAudioMs: this.firstAudioMs,
        reconnects: this.reconnects,
        sentFrames: this.sentFrames,
        noiseFloorDb: this.detector.noiseFloorDb,
        sampleRate: this.options.audio.context.sampleRate,
        bufferedMs: Math.round(this.player.bufferedMs),
        cushionMs: Math.round(this.player.cushionMs),
      },
    });
  }

  // ─── Controls ─────────────────────────────────────────────────────

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    if (muted && this.detector.flush()) {
      this.flushOutbox();
      this.onSpeechEnd();
    }
    this.patch({ muted });
  }

  sendText(text: string): boolean {
    const clean = text.trim().slice(0, VOICE_TEXT_MAX_LENGTH);
    if (!clean || !this.connection?.send({ type: "text", text: clean })) return false;
    this.player.flush();
    this.unduck();
    this.closeCaption();
    this.addCaption("user", clean);
    this.closeCaption();
    this.speechEndedAt = Date.now();
    this.patch({ activity: "thinking" });
    return true;
  }

  cardAction(action: "confirm" | "cancel", draftId: string): void {
    this.connection?.send({ type: action, draftId });
  }

  levels(): { input: number; output: number } {
    if (this.tornDown) return { input: 0, output: 0 };
    const input = this.muted ? 0 : Math.min(1, Math.max(0, (this.detector.levelDb + 60) / 45));
    return { input, output: outputLevel(this.options.audio.outputMeter, this.meterScratch) };
  }

  /** Hangs up. Before the call is connected there is nothing on the server to end: an unused ticket expires. */
  end(): void {
    if (this.connection && this.connection.state !== "closed") {
      this.connection.end();
      return;
    }
    if (this.view.phase === "starting") {
      this.hungUpEarly = true;
      this.teardown(this.stream);
      this.options.reset();
    }
  }

  private teardown(stream: MediaStream | null): void {
    if (this.tornDown) return;
    this.tornDown = true;
    if (this.traceTimer) clearInterval(this.traceTimer);
    if (this.listeningTimer) clearTimeout(this.listeningTimer);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("online", this.onOnline);
    this.detachMic?.();
    this.detachMic = null;
    this.player.flush();
    this.wake.release();
    releaseCallAudio(this.options.audio, stream);
    this.stream = null;
  }

  /** Forgets the call without waiting for anything (the end screen was closed). */
  dispose(): void {
    this.connection?.dispose();
    this.teardown(this.stream);
    this.disposed = true;
  }
}
