/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Types & State Machine Implementation for Voice Recording & Audio Pipelines
// ============================================================================

export type VoiceState = "idle" | "acquiring" | "recording" | "processing" | "ended" | "error";

export interface VoiceStateMachineOptions {
  debounceMs?: number;
  maxCallDurationMs?: number;
  warningTimeRemainingMs?: number;
  onStateChange?: (state: VoiceState, previous: VoiceState) => void;
  onError?: (error: Error) => void;
}

export class VoiceStateMachine {
  private state: VoiceState = "idle";
  private lastToggleTimestamp = 0;
  private activeCallId = 0;
  private isCancelled = false;
  private debounceMs: number;
  private maxDurationTimer: any = null;
  private warningTimer: any = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private options: VoiceStateMachineOptions;

  constructor(options: VoiceStateMachineOptions = {}) {
    this.options = options;
    this.debounceMs = options.debounceMs ?? 300;
  }

  public getState(): VoiceState {
    return this.state;
  }

  public getActiveCallId(): number {
    return this.activeCallId;
  }

  public getIsCancelled(): boolean {
    return this.isCancelled;
  }

  private transitionTo(newState: VoiceState): boolean {
    const validTransitions: Record<VoiceState, VoiceState[]> = {
      idle: ["acquiring", "error"],
      acquiring: ["recording", "idle", "error"],
      recording: ["processing", "ended", "idle", "error"],
      processing: ["idle", "error"],
      ended: ["idle", "acquiring"],
      error: ["idle", "acquiring"],
    };

    if (!validTransitions[this.state].includes(newState)) {
      return false;
    }

    const prev = this.state;
    this.state = newState;
    this.options.onStateChange?.(newState, prev);
    return true;
  }

  public async startRecording(
    getUserMediaFn: () => Promise<MediaStream>,
    createAudioContextFn?: () => AudioContext
  ): Promise<boolean> {
    const now = Date.now();
    // Debounce guard: reject if called too quickly after previous toggle
    if (now - this.lastToggleTimestamp < this.debounceMs && this.state !== "idle") {
      return false;
    }
    this.lastToggleTimestamp = now;

    if (this.state !== "idle" && this.state !== "ended" && this.state !== "error") {
      return false;
    }

    const callId = ++this.activeCallId;
    this.isCancelled = false;

    if (!this.transitionTo("acquiring")) {
      return false;
    }

    try {
      const mediaStream = await getUserMediaFn();

      // Check if user cancelled while permission dialog was pending
      if (this.isCancelled || callId !== this.activeCallId) {
        mediaStream.getTracks().forEach((track) => track.stop());
        if (callId === this.activeCallId) {
          this.transitionTo("idle");
        }
        return false;
      }

      this.stream = mediaStream;

      if (createAudioContextFn) {
        this.audioContext = createAudioContextFn();
      }

      if (!this.transitionTo("recording")) {
        this.cleanup();
        return false;
      }

      if (this.options.maxCallDurationMs) {
        this.maxDurationTimer = setTimeout(() => {
          this.endCall("max_duration_reached");
        }, this.options.maxCallDurationMs);
      }

      return true;
    } catch (err: any) {
      if (callId === this.activeCallId) {
        this.transitionTo("error");
        this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
      this.cleanup();
      return false;
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    this.activeCallId++;
    this.cleanup();
    this.transitionTo("idle");
  }

  public stopAndProcess(): boolean {
    if (this.state !== "recording") {
      return false;
    }

    this.transitionTo("processing");
    this.cleanup();
    return true;
  }

  public completeProcessing(): void {
    if (this.state === "processing") {
      this.transitionTo("idle");
    }
  }

  public endCall(reason?: string): void {
    this.cleanup();
    this.transitionTo("ended");
  }

  public handleVisibilityChange(isHidden: boolean): void {
    if (isHidden && (this.state === "recording" || this.state === "acquiring")) {
      this.cancel();
    }
  }

  private cleanup(): void {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
  }
}

// ============================================================================
// WebSocket CSWSH Origin Validator Function
// ============================================================================

export const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.loca\.lt$/,
  /^https:\/\/[a-z0-9-]+\.serveousercontent\.com$/,
  /^https:\/\/[a-z0-9-]+\.lhr\.life$/,
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.dev$/,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/,
  /^https:\/\/[a-z0-9-]+\.ngrok\.app$/,
  /^https:\/\/[a-z0-9-]+\.ngrok\.io$/,
  /^https:\/\/(www\.)?smartspend\.app$/,
];

export function validateWebSocketOrigin(origin: string | undefined | null): boolean {
  if (!origin || typeof origin !== "string") {
    return false;
  }

  const trimmed = origin.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    const originToCheck = `${url.protocol}//${url.host}`;
    return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(originToCheck));
  } catch {
    return false;
  }
}

// ============================================================================
// Multi-Codec File Alignment & MIME Mapping
// ============================================================================

export interface AudioCodecMapping {
  mimeType: string;
  extension: string;
  isSupported: boolean;
}

export function resolveAudioContainer(mimeType: string): { extension: string; normalizedMime: string } {
  const lower = (mimeType || "").toLowerCase();

  if (lower.includes("mp4") || lower.includes("aac") || lower.includes("m4a")) {
    return { extension: "mp4", normalizedMime: "audio/mp4" };
  }
  if (lower.includes("wav") || lower.includes("wave") || lower.includes("x-wav")) {
    return { extension: "wav", normalizedMime: "audio/wav" };
  }
  if (lower.includes("webm")) {
    return { extension: "webm", normalizedMime: "audio/webm" };
  }
  if (lower.includes("ogg") || lower.includes("opus")) {
    return { extension: "ogg", normalizedMime: "audio/ogg" };
  }
  // Default fallback for Whisper/Gemini APIs
  return { extension: "webm", normalizedMime: "audio/webm" };
}

export function buildAudioMultipartPayload(
  blob: Blob,
  customMime?: string
): { formData: FormData; filename: string; mimeType: string } {
  const mimeType = customMime || blob.type || "audio/webm";
  const { extension, normalizedMime } = resolveAudioContainer(mimeType);
  const filename = `recording.${extension}`;

  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("mimeType", normalizedMime);

  return { formData, filename, mimeType: normalizedMime };
}

// ============================================================================
// Voice Analyser RMS Calculation
// ============================================================================

export function computeAudioRMS(int16Buffer: Int16Array): number {
  if (int16Buffer.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < int16Buffer.length; i++) {
    sumSq += int16Buffer[i] * int16Buffer[i];
  }
  return Math.sqrt(sumSq / int16Buffer.length);
}

// ============================================================================
// TEST SUITE: Voice State Machine & Audio Edge Cases
// ============================================================================

describe("Voice Recording State Machine & Resilience Tests", () => {
  let mockTracks: { stop: ReturnType<typeof vi.fn>; enabled: boolean }[];
  let mockStream: MediaStream;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTracks = [{ stop: vi.fn(), enabled: true }];
    mockStream = {
      getTracks: () => mockTracks as any,
    } as unknown as MediaStream;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tier 1: Primary Feature & Happy Path State Transitions
  // --------------------------------------------------------------------------
  describe("Tier 1: Primary Voice State Machine Transitions", () => {
    it("1.1 starts in idle state", () => {
      const sm = new VoiceStateMachine();
      expect(sm.getState()).toBe("idle");
    });

    it("1.2 transitions from idle -> acquiring -> recording on successful mic grant", async () => {
      const stateChanges: VoiceState[] = [];
      const sm = new VoiceStateMachine({
        onStateChange: (newState) => stateChanges.push(newState),
      });

      const getUserMedia = vi.fn().mockResolvedValue(mockStream);
      const success = await sm.startRecording(getUserMedia);

      expect(success).toBe(true);
      expect(sm.getState()).toBe("recording");
      expect(stateChanges).toEqual(["acquiring", "recording"]);
    });

    it("1.3 transitions recording -> processing -> idle when stopping to transcribe", async () => {
      const stateChanges: VoiceState[] = [];
      const sm = new VoiceStateMachine({
        onStateChange: (newState) => stateChanges.push(newState),
      });

      await sm.startRecording(vi.fn().mockResolvedValue(mockStream));
      expect(sm.getState()).toBe("recording");

      const stopped = sm.stopAndProcess();
      expect(stopped).toBe(true);
      expect(sm.getState()).toBe("processing");

      sm.completeProcessing();
      expect(sm.getState()).toBe("idle");
      expect(stateChanges).toEqual(["acquiring", "recording", "processing", "idle"]);
    });

    it("1.4 transitions to error state when getUserMedia rejects", async () => {
      const errors: Error[] = [];
      const sm = new VoiceStateMachine({
        onError: (err) => errors.push(err),
      });

      const getUserMedia = vi.fn().mockRejectedValue(new Error("Permission denied"));
      const success = await sm.startRecording(getUserMedia);

      expect(success).toBe(false);
      expect(sm.getState()).toBe("error");
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("Permission denied");
    });

    it("1.5 allows transitioning from error back to idle upon cancel/reset", async () => {
      const sm = new VoiceStateMachine();
      await sm.startRecording(vi.fn().mockRejectedValue(new Error("Device not found")));
      expect(sm.getState()).toBe("error");

      sm.cancel();
      expect(sm.getState()).toBe("idle");
    });
  });

  // --------------------------------------------------------------------------
  // Tier 2: Boundary Value Analysis & Async Race Condition Cancellation
  // --------------------------------------------------------------------------
  describe("Tier 2: Async Mic Cancellation & Race Conditions", () => {
    it("2.1 stops tracks immediately if user cancels while getUserMedia is pending", async () => {
      const sm = new VoiceStateMachine();

      let resolveMicPromise!: (stream: MediaStream) => void;
      const delayedMicPromise = new Promise<MediaStream>((resolve) => {
        resolveMicPromise = resolve;
      });

      // Start acquiring
      const startPromise = sm.startRecording(() => delayedMicPromise);
      expect(sm.getState()).toBe("acquiring");

      // User immediately clicks cancel while permission prompt is open
      sm.cancel();
      expect(sm.getState()).toBe("idle");
      expect(sm.getIsCancelled()).toBe(true);

      // Now the mic permission resolves later
      resolveMicPromise(mockStream);
      const result = await startPromise;

      expect(result).toBe(false);
      expect(sm.getState()).toBe("idle");
      // Critical check: Tracks must be stopped to avoid leaving recording light on
      expect(mockTracks[0].stop).toHaveBeenCalledTimes(1);
    });

    it("2.2 handles multiple rapid startRecording triggers with unique callIds", async () => {
      const sm = new VoiceStateMachine({ debounceMs: 0 });

      let resolveFirst!: (s: MediaStream) => void;
      const firstStreamPromise = new Promise<MediaStream>((r) => (resolveFirst = r));

      const tracks1 = [{ stop: vi.fn(), enabled: true }];
      const stream1 = { getTracks: () => tracks1 as any } as unknown as MediaStream;

      const tracks2 = [{ stop: vi.fn(), enabled: true }];
      const stream2 = { getTracks: () => tracks2 as any } as unknown as MediaStream;

      // First start
      const firstStart = sm.startRecording(() => firstStreamPromise);
      const firstCallId = sm.getActiveCallId();

      // User cancels and starts second call
      sm.cancel();
      const secondStart = sm.startRecording(vi.fn().mockResolvedValue(stream2));
      const secondCallId = sm.getActiveCallId();

      expect(secondCallId).toBeGreaterThan(firstCallId);

      // Resolve stale first call
      resolveFirst(stream1);
      const [res1, res2] = await Promise.all([firstStart, secondStart]);

      expect(res1).toBe(false);
      expect(res2).toBe(true);
      expect(tracks1[0].stop).toHaveBeenCalled();
      expect(sm.getState()).toBe("recording");
    });

    it("2.3 cancels recording cleanly when PWA is backgrounded (visibilitychange hidden)", async () => {
      const sm = new VoiceStateMachine();
      await sm.startRecording(vi.fn().mockResolvedValue(mockStream));
      expect(sm.getState()).toBe("recording");

      sm.handleVisibilityChange(true); // tab hidden
      expect(sm.getState()).toBe("idle");
      expect(mockTracks[0].stop).toHaveBeenCalled();
    });

    it("2.4 ignores visibility change when already idle", () => {
      const sm = new VoiceStateMachine();
      expect(sm.getState()).toBe("idle");

      sm.handleVisibilityChange(true);
      expect(sm.getState()).toBe("idle");
    });

    it("2.5 handles stopAndProcess when in idle or acquiring by returning false", () => {
      const sm = new VoiceStateMachine();
      expect(sm.stopAndProcess()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Tier 3: Debouncing & Audio Graph Behavior
  // --------------------------------------------------------------------------
  describe("Tier 3: Debounce Protection & Audio Processing", () => {
    it("3.1 rejects startRecording if invoked within debounceMs window", async () => {
      const sm = new VoiceStateMachine({ debounceMs: 300 });

      // First call succeeds
      const first = await sm.startRecording(vi.fn().mockResolvedValue(mockStream));
      expect(first).toBe(true);

      // Second immediate call within 300ms is dropped
      const second = await sm.startRecording(vi.fn().mockResolvedValue(mockStream));
      expect(second).toBe(false);
    });

    it("3.2 cancel is NEVER blocked by debounce lockouts", async () => {
      const sm = new VoiceStateMachine({ debounceMs: 500 });
      await sm.startRecording(vi.fn().mockResolvedValue(mockStream));
      expect(sm.getState()).toBe("recording");

      // Cancel called immediately (e.g. 5ms later)
      sm.cancel();
      expect(sm.getState()).toBe("idle");
    });

    it("3.3 accurately calculates RMS for silence vs active voice speech", () => {
      // Complete silence buffer
      const silentBuffer = new Int16Array(1024).fill(0);
      expect(computeAudioRMS(silentBuffer)).toBe(0);

      // Low ambient noise buffer (below 200 threshold)
      const lowNoise = new Int16Array([50, -40, 30, -50, 60]);
      expect(computeAudioRMS(lowNoise)).toBeLessThan(200);

      // Speech audio buffer (above 200 threshold)
      const speechBuffer = new Int16Array([500, -800, 1200, -1500, 2000]);
      expect(computeAudioRMS(speechBuffer)).toBeGreaterThan(200);
    });

    it("3.4 cleans up AudioContext without unhandled rejection if context is closed", async () => {
      const mockAudioContext = {
        state: "running",
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as AudioContext;

      const sm = new VoiceStateMachine();
      await sm.startRecording(vi.fn().mockResolvedValue(mockStream), () => mockAudioContext);
      expect(sm.getState()).toBe("recording");

      sm.cancel();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Tier 4: CSWSH Origin Protection & Multi-Codec File Alignment
  // --------------------------------------------------------------------------
  describe("Tier 4: CSWSH Origin Security & Multi-Codec Alignment", () => {
    describe("WebSocket Origin CSWSH Protection", () => {
      it("4.1 accepts valid localhost and local dev origins", () => {
        expect(validateWebSocketOrigin("http://localhost:3000")).toBe(true);
        expect(validateWebSocketOrigin("http://localhost:5173")).toBe(true);
        expect(validateWebSocketOrigin("http://127.0.0.1:3000")).toBe(true);
      });

      it("4.2 accepts valid ngrok, cloudflare, and smartspend domains", () => {
        expect(validateWebSocketOrigin("https://nutty-husband-customary.ngrok-free.dev")).toBe(true);
        expect(validateWebSocketOrigin("https://mobile-preview.trycloudflare.com")).toBe(true);
        expect(validateWebSocketOrigin("https://smartspend.app")).toBe(true);
        expect(validateWebSocketOrigin("https://www.smartspend.app")).toBe(true);
      });

      it("4.3 rejects malicious attacker origins and subdomains", () => {
        expect(validateWebSocketOrigin("https://evil-hacker.com")).toBe(false);
        expect(validateWebSocketOrigin("http://localhost.attacker.com")).toBe(false);
        expect(validateWebSocketOrigin("https://smartspend.app.evil.com")).toBe(false);
        expect(validateWebSocketOrigin("https://phishing-smartspend.org")).toBe(false);
      });

      it("4.4 rejects empty, null, undefined, or malformed origin headers", () => {
        expect(validateWebSocketOrigin(null)).toBe(false);
        expect(validateWebSocketOrigin(undefined)).toBe(false);
        expect(validateWebSocketOrigin("")).toBe(false);
        expect(validateWebSocketOrigin("not-a-url")).toBe(false);
      });
    });

    describe("Whisper & Gemini Multi-Codec Container Alignment", () => {
      it("4.5 maps iOS Safari audio/mp4 and audio/aac to mp4 container", () => {
        expect(resolveAudioContainer("audio/mp4")).toEqual({
          extension: "mp4",
          normalizedMime: "audio/mp4",
        });
        expect(resolveAudioContainer("audio/aac")).toEqual({
          extension: "mp4",
          normalizedMime: "audio/mp4",
        });
        expect(resolveAudioContainer("audio/x-m4a")).toEqual({
          extension: "mp4",
          normalizedMime: "audio/mp4",
        });
      });

      it("4.6 maps Chrome/Android audio/webm to webm container", () => {
        expect(resolveAudioContainer("audio/webm;codecs=opus")).toEqual({
          extension: "webm",
          normalizedMime: "audio/webm",
        });
      });

      it("4.7 maps audio/wav and audio/ogg to appropriate containers", () => {
        expect(resolveAudioContainer("audio/wav")).toEqual({
          extension: "wav",
          normalizedMime: "audio/wav",
        });
        expect(resolveAudioContainer("audio/ogg; codecs=opus")).toEqual({
          extension: "ogg",
          normalizedMime: "audio/ogg",
        });
      });

      it("4.8 constructs valid multipart FormData with aligned filename", () => {
        const dummyBlob = new Blob(["dummy-audio-bytes"], { type: "audio/mp4" });
        const { formData, filename, mimeType } = buildAudioMultipartPayload(dummyBlob);

        expect(filename).toBe("recording.mp4");
        expect(mimeType).toBe("audio/mp4");
        expect(formData.get("mimeType")).toBe("audio/mp4");
        const fileEntry = formData.get("file") as File;
        expect(fileEntry).toBeDefined();
        expect(fileEntry.name).toBe("recording.mp4");
      });
    });
  });
});
