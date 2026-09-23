/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceServerMessage } from "@contracts/voice-protocol";
import type { PrimedAudio } from "./audio-io";
import type { SocketLike } from "./call-connection";
import { VoiceCallController } from "./call-controller";
import type { StartCallOutcome, VoiceCallView } from "./call-store";

class FakeSocket implements SocketLike {
  binaryType = "blob";
  readyState = 0;
  bufferedAmount = 0;
  readonly sent: Array<string | ArrayBufferLike | ArrayBufferView> = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send(data: string | ArrayBufferLike | ArrayBufferView) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: VoiceServerMessage | ArrayBuffer) {
    this.onmessage?.({ data: message instanceof ArrayBuffer ? message : JSON.stringify(message) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
  json(): Array<Record<string, unknown>> {
    return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d));
  }
  audio(): Int16Array[] {
    return this.sent.filter((d): d is Int16Array => d instanceof Int16Array);
  }
}

function fakeAudio(mic: Promise<MediaStream>): PrimedAudio & { started: number[] } {
  const started: number[] = [];
  const context = {
    sampleRate: 48_000,
    currentTime: 0,
    resume: async () => undefined,
    close: async () => undefined,
    createBuffer: (_channels: number, length: number, rate: number) => {
      const data = new Float32Array(length);
      return { duration: length / rate, getChannelData: () => data };
    },
    createBufferSource: () => ({
      buffer: null,
      onended: null,
      connect() {},
      disconnect() {},
      start: (when: number) => started.push(when),
      stop() {},
    }),
  };
  return {
    context: context as unknown as AudioContext,
    mic,
    output: { gain: { setTargetAtTime: vi.fn() } } as unknown as GainNode,
    outputMeter: { fftSize: 512, getFloatTimeDomainData: () => undefined } as unknown as AnalyserNode,
    started,
  };
}

function fakeStream(): MediaStream {
  const track = { enabled: true, readyState: "live", stop: vi.fn(), addEventListener: vi.fn() };
  return { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
}

/** 20 ms at 48 kHz: a quiet room, or a voice. */
function block(loud: boolean, seed: number): Float32Array {
  const out = new Float32Array(960);
  for (let i = 0; i < out.length; i++) {
    out[i] = loud ? 0.3 * Math.sin((2 * Math.PI * 300 * (seed * 960 + i)) / 48_000) : 0.0002 * Math.sin(i * 1.7 + seed);
  }
  return out;
}

const ok: StartCallOutcome = { kind: "ok", callId: "vc_call00001", ticket: "tk_ticket000001", maxSeconds: 600, remainingSeconds: 1800, voice: "Kore" };

function ready(): VoiceServerMessage {
  return { type: "ready", callId: "vc_call00001", resumeToken: "rt_token000001", codec: "pcm16", maxSeconds: 600, resumed: false };
}

describe("VoiceCallController", () => {
  let view: VoiceCallView;
  let sockets: FakeSocket[];
  let onBlock: ((samples: Float32Array) => void) | null;
  let reset: ReturnType<typeof vi.fn<() => void>>;

  function makeController(options: { outcome?: StartCallOutcome | Promise<StartCallOutcome>; mic?: Promise<MediaStream> } = {}) {
    const audio = fakeAudio(options.mic ?? Promise.resolve(fakeStream()));
    const controller = new VoiceCallController({
      audio,
      request: { startCall: async () => (await options.outcome) ?? ok },
      getView: () => view,
      setView: (next) => {
        view = next;
      },
      reset,
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      attachMic: async (_context, _stream, listener) => {
        onBlock = listener;
        return () => undefined;
      },
    });
    return { controller, audio };
  }

  beforeEach(() => {
    sockets = [];
    onBlock = null;
    reset = vi.fn<() => void>();
    view = {
      phase: "starting",
      activity: "connecting",
      minimized: false,
      callId: null,
      maxSeconds: 0,
      meter: { accumulatedMs: 0, liveSince: null },
      muted: false,
      micAvailable: true,
      captionsOn: true,
      timeline: [],
      notice: null,
      ending: null,
      failure: null,
      executed: 0,
      trace: { rttMs: null, firstAudioMs: [], reconnects: 0, sentFrames: 0, noiseFloorDb: null, sampleRate: null, bufferedMs: 0, cushionMs: 0 },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a call: speech goes out only while the user speaks, replies play, cards and captions show, the end sums up", async () => {
    const { controller, audio } = makeController();
    await controller.start();
    const socket = sockets[0];
    socket.open();
    expect(socket.json()[0]).toMatchObject({ type: "hello", ticket: "tk_ticket000001" });
    socket.receive(ready());
    expect(view.phase).toBe("live");

    for (let i = 0; i < 30; i++) onBlock!(block(false, i));
    expect(socket.audio()).toHaveLength(0);
    for (let i = 0; i < 40; i++) onBlock!(block(true, i));
    expect(view.activity).toBe("user_speaking");
    const first = socket.audio()[0];
    expect(first.length).toBe(15 * 320);
    for (let i = 0; i < 40; i++) onBlock!(block(false, 100 + i));
    expect(socket.json().some((m) => m.type === "speech_end")).toBe(true);
    expect(view.activity).toBe("thinking");

    socket.receive({ type: "caption", role: "user", text: "صرفت كام" });
    socket.receive({ type: "caption", role: "user", text: " النهارده" });
    socket.receive(new Int16Array(2400).buffer);
    expect(audio.started).toHaveLength(1);
    socket.receive({ type: "caption", role: "assistant", text: "تلتمية وعشرين" });
    expect(view.timeline.map((item) => (item.kind === "caption" ? item.text : item.key))).toEqual([
      "صرفت كام النهارده",
      "تلتمية وعشرين",
    ]);

    const draft = {
      kind: "draft" as const,
      draftId: "dr_000000001",
      title: "خمسين مواصلات",
      items: [{ label: "مواصلات", amount: 50 }],
      status: "pending" as const,
      expiresAt: new Date().toISOString(),
    };
    socket.receive({ type: "card", card: draft });
    controller.cardAction("confirm", "dr_000000001");
    expect(socket.json().some((m) => m.type === "confirm" && m.draftId === "dr_000000001")).toBe(true);
    socket.receive({ type: "card", card: { ...draft, status: "executed", message: "اتسجل" } });
    expect(view.executed).toBe(1);
    expect(view.timeline.filter((item) => item.kind === "card")).toHaveLength(1);

    controller.end();
    expect(socket.json().some((m) => m.type === "end")).toBe(true);
    socket.receive({ type: "ended", reason: "user", summary: { done: ["خمسين مواصلات"], notDone: [], billedSeconds: 42 } });
    socket.drop();
    expect(view.phase).toBe("ended");
    expect(view.ending).toEqual({ reason: "user", done: ["خمسين مواصلات"], notDone: [], billedSeconds: 42 });
  });

  it("keeps the call going by text when the microphone is refused", async () => {
    const { controller } = makeController({ mic: Promise.reject(new Error("NotAllowedError")) });
    await controller.start();
    expect(view.micAvailable).toBe(false);
    expect(view.notice?.kind).toBe("microphone");
    sockets[0].open();
    sockets[0].receive(ready());
    expect(controller.sendText("  صرفت خمسين  ")).toBe(true);
    expect(sockets[0].json().find((m) => m.type === "text")).toEqual({ type: "text", text: "صرفت خمسين" });
    expect(view.timeline).toEqual([{ key: "c1", kind: "caption", role: "user", text: "صرفت خمسين" }]);
  });

  it("shows why a call cannot start, with the way to the chat", async () => {
    const { controller } = makeController({
      outcome: { kind: "blocked", reason: "month_used", message: "خلصت دقايق المكالمات بتاعة الشهر ده." },
    });
    await controller.start();
    expect(view.phase).toBe("failed");
    expect(view.failure).toEqual({ message: "خلصت دقايق المكالمات بتاعة الشهر ده.", fallbackChat: true, legacy: false });
    expect(sockets).toHaveLength(0);
  });

  it("hands over to the old call outside the rollout", async () => {
    const { controller } = makeController({ outcome: { kind: "legacy" } });
    await controller.start();
    expect(view.failure?.legacy).toBe(true);
  });

  it("hanging up before the call connects leaves nothing behind", async () => {
    let release: (outcome: StartCallOutcome) => void = () => undefined;
    const { controller } = makeController({ outcome: new Promise<StartCallOutcome>((resolve) => (release = resolve)) });
    const starting = controller.start();
    controller.end();
    expect(reset).toHaveBeenCalledOnce();
    release(ok);
    await starting;
    expect(sockets).toHaveLength(0);
  });

  it("ends with what it knows when the line cannot be brought back", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    await controller.start();
    sockets[0].open();
    sockets[0].receive(ready());
    sockets[0].receive({
      type: "card",
      card: { kind: "draft", draftId: "dr_000000002", title: "ميزانية الأكل", items: [], status: "pending", expiresAt: "" },
    });
    sockets[0].drop();
    expect(view.phase).toBe("reconnecting");
    expect(view.notice?.kind).toBe("reconnecting");
    for (let i = 0; i < 30 && view.phase === "reconnecting"; i++) {
      vi.advanceTimersByTime(5_000);
      sockets[sockets.length - 1].drop();
    }
    expect(view.phase).toBe("ended");
    expect(view.ending).toEqual({ reason: "lost", done: [], notDone: ["ميزانية الأكل"], billedSeconds: null });
  });
});
