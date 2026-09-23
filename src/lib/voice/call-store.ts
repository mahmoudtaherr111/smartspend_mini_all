/**
 * The app's one live call, as a small store React reads with useSyncExternalStore (useVoiceCallView). Any screen
 * can start the call and the call outlives the screen: it keeps running, shrunk to a bar, while the user moves
 * around the app. This file stays small because every page loads it; the audio and socket code
 * (call-controller.ts) loads only when a call starts. Starting must happen inside the user's tap, because
 * browsers open the microphone and start sound only from one.
 */
import { useSyncExternalStore } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type {
  VoiceCallState,
  VoiceCard,
  VoiceClientPlatform,
  VoiceEndReason,
} from "@contracts/voice-protocol";
import type { AppRouter } from "../../../api/router";
import { primeCallAudio } from "./audio-io";
import type { VoiceCallController } from "./call-controller";

export type StartCallOutcome = inferRouterOutputs<AppRouter>["voice"]["startCall"];
export type StartCallInput = { voice?: string; client: VoiceClientPlatform };

export interface StartRequest {
  voice?: string;
  startCall(input: StartCallInput): Promise<StartCallOutcome>;
}

export type CallPhase = "idle" | "intro" | "starting" | "live" | "reconnecting" | "ended" | "failed";
/** What the screen says the call is doing: the server's state, or the user speaking as the app hears it. */
export type CallActivity = VoiceCallState | "user_speaking";

export type TimelineItem =
  | { key: string; kind: "caption"; role: "user" | "assistant"; text: string }
  | { key: string; kind: "card"; card: VoiceCard };

export interface CallNotice {
  kind: "time_warning" | "reconnecting" | "degraded" | "microphone";
  message: string;
}

export interface CallEnding {
  /** `lost` when the network dropped and the call could not be reached again. */
  reason: VoiceEndReason | "lost";
  done: string[];
  notDone: string[];
  billedSeconds: number | null;
}

export interface CallFailure {
  message: string;
  fallbackChat: boolean;
  /** Not in the rebuilt call's rollout: the old call screen takes over. */
  legacy?: boolean;
}

export interface CallTrace {
  rttMs: number | null;
  firstAudioMs: number[];
  reconnects: number;
  sentFrames: number;
  noiseFloorDb: number | null;
  sampleRate: number | null;
  bufferedMs: number;
  cushionMs: number;
}

export interface VoiceCallView {
  phase: CallPhase;
  activity: CallActivity;
  minimized: boolean;
  callId: string | null;
  maxSeconds: number;
  /** Connected time before the current stretch, and when the current stretch began (null while not connected). */
  meter: { accumulatedMs: number; liveSince: number | null };
  muted: boolean;
  micAvailable: boolean;
  captionsOn: boolean;
  timeline: TimelineItem[];
  notice: CallNotice | null;
  ending: CallEnding | null;
  failure: CallFailure | null;
  /** Goes up each time a draft is executed, so screens can refresh what it changed. */
  executed: number;
  trace: CallTrace;
}

const CAPTIONS_KEY = "smartspend_voice_captions";
const INTRO_KEY = "smartspend_voice_intro_v1";
const VOICE_KEY = "smartspend_voice_choice";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage blocked: the preference lasts for this visit only.
  }
}

function idleView(): VoiceCallView {
  return {
    phase: "idle",
    activity: "connecting",
    minimized: false,
    callId: null,
    maxSeconds: 0,
    meter: { accumulatedMs: 0, liveSince: null },
    muted: false,
    micAvailable: true,
    captionsOn: readFlag(CAPTIONS_KEY, true),
    timeline: [],
    notice: null,
    ending: null,
    failure: null,
    executed: 0,
    trace: {
      rttMs: null,
      firstAudioMs: [],
      reconnects: 0,
      sentFrames: 0,
      noiseFloorDb: null,
      sampleRate: null,
      bufferedMs: 0,
      cushionMs: 0,
    },
  };
}

let view: VoiceCallView = idleView();
let controller: VoiceCallController | null = null;
let pending: StartRequest | null = null;
let lastRequest: StartRequest | null = null;
const listeners = new Set<() => void>();

function publish(next: VoiceCallView): void {
  view = next;
  for (const listener of listeners) listener();
}

function update(patch: Partial<VoiceCallView>): void {
  publish({ ...view, ...patch });
}

const active = () => view.phase === "starting" || view.phase === "live" || view.phase === "reconnecting";

function begin(request: StartRequest): void {
  lastRequest = request;
  // Inside the tap: the audio context and the microphone request cannot wait for the call's code to load.
  const audio = primeCallAudio();
  controller?.dispose();
  controller = null;
  publish({ ...idleView(), phase: "starting" });
  void import("./call-controller")
    .then(({ VoiceCallController: Controller }) => {
      if (view.phase !== "starting") {
        audio.mic.then((stream) => stream.getTracks().forEach((track) => track.stop()), () => undefined);
        void audio.context.close().catch(() => undefined);
        return;
      }
      const created = new Controller({
        audio,
        request,
        getView: () => view,
        setView: publish,
        reset: () => {
          controller = null;
          publish(idleView());
        },
      });
      controller = created;
      return created.start();
    })
    .catch(() => {
      void audio.context.close().catch(() => undefined);
      update({
        phase: "failed",
        failure: { message: "مقدرناش نبدأ المكالمة. جرّب تاني بعد شوية.", fallbackChat: true },
      });
    });
}

export const voiceCall = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getView(): VoiceCallView {
    return view;
  },

  /** A tap on a call button: the first time it explains the call, otherwise it starts right away. */
  open(request: StartRequest): void {
    if (active()) {
      update({ minimized: false });
      return;
    }
    if (!readFlag(INTRO_KEY, false)) {
      pending = request;
      publish({ ...idleView(), phase: "intro" });
      return;
    }
    begin(request);
  },

  /** The start button of the explanation (a tap). */
  acceptIntro(): void {
    writeFlag(INTRO_KEY, true);
    const request = pending;
    pending = null;
    if (request) begin(request);
    else publish(idleView());
  },

  /** A new call from the end screen (a tap), started the way the last one was. */
  restart(): void {
    if (!active() && lastRequest) begin(lastRequest);
  },

  end(): void {
    if (controller) controller.end();
    else publish(idleView());
  },

  /** Closes the explanation, the end screen or a failure. */
  close(): void {
    if (active()) return;
    pending = null;
    controller?.dispose();
    controller = null;
    publish(idleView());
  },

  minimize(): void {
    if (active()) update({ minimized: true });
  },

  expand(): void {
    update({ minimized: false });
  },

  toggleMute(): void {
    controller?.setMuted(!view.muted);
  },

  toggleCaptions(): void {
    writeFlag(CAPTIONS_KEY, !view.captionsOn);
    update({ captionsOn: !view.captionsOn });
  },

  sendText(text: string): boolean {
    return controller?.sendText(text) ?? false;
  },

  confirmDraft(draftId: string): void {
    controller?.cardAction("confirm", draftId);
  },

  cancelDraft(draftId: string): void {
    controller?.cardAction("cancel", draftId);
  },

  /** Loudness of the user and of the assistant, 0 to 1, read by the screen's animation every frame. */
  levels(): { input: number; output: number } {
    return controller?.levels() ?? { input: 0, output: 0 };
  },
};

/** The voice the user picked for the assistant, if any. */
export function preferredVoice(): string | undefined {
  try {
    return localStorage.getItem(VOICE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setPreferredVoice(voice: string): void {
  try {
    localStorage.setItem(VOICE_KEY, voice);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

export function useVoiceCallView(): VoiceCallView {
  return useSyncExternalStore(voiceCall.subscribe, voiceCall.getView, voiceCall.getView);
}

/** Connected seconds so far, for the timer. */
export function connectedSeconds(meter: VoiceCallView["meter"], now = Date.now()): number {
  return Math.floor((meter.accumulatedMs + (meter.liveSince !== null ? now - meter.liveSince : 0)) / 1000);
}
