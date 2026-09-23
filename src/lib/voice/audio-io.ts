/**
 * The call's audio in the browser. Browsers open the microphone and start sound only from a user's tap, so
 * `primeCallAudio` runs inside the tap that starts the call: it creates the one AudioContext and asks for the
 * microphone. The rest is wired once the call's code has loaded: the microphone through a worklet that hands
 * 20 ms blocks to the page, and the output chain the player feeds (gain, then a level meter, then the speaker).
 */

export interface PrimedAudio {
  context: AudioContext;
  /** Resolves with the microphone, or rejects when the user or the device refuses it. */
  mic: Promise<MediaStream>;
  output: GainNode;
  outputMeter: AnalyserNode;
}

type AudioSessionType = "auto" | "playback" | "play-and-record";

/** iOS Safari 17+: keep the speaker, not the earpiece, while the microphone is open. */
function setAudioSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // Not supported for this page.
  }
}

/** Must be called synchronously inside the tap that starts the call. */
export function primeCallAudio(): PrimedAudio {
  const Context =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = new Context({ latencyHint: "interactive" });
  void context.resume().catch(() => undefined);
  setAudioSession("play-and-record");

  const output = context.createGain();
  const outputMeter = context.createAnalyser();
  outputMeter.fftSize = 512;
  output.connect(outputMeter);
  outputMeter.connect(context.destination);

  const mic = navigator.mediaDevices?.getUserMedia
    ? navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
    : Promise.reject(new Error("no_microphone_api"));
  // The call decides what a refused microphone means; this only keeps the rejection from being reported as unhandled.
  mic.catch(() => undefined);
  return { context, mic, output, outputMeter };
}

/** Feeds the microphone to `onBlock` in 20 ms blocks at the context's rate; returns the function that unhooks it. */
export async function attachMicrophone(
  context: AudioContext,
  stream: MediaStream,
  onBlock: (samples: Float32Array) => void,
): Promise<() => void> {
  await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}voice/capture-worklet.js`);
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "smartspend-capture", { numberOfInputs: 1, numberOfOutputs: 1 });
  // Some engines only run a worklet that leads somewhere; a muted gain keeps it running without an echo.
  const sink = context.createGain();
  sink.gain.value = 0;
  node.port.onmessage = (event: MessageEvent<Float32Array>) => onBlock(event.data);
  source.connect(node);
  node.connect(sink);
  sink.connect(context.destination);
  return () => {
    node.port.onmessage = null;
    source.disconnect();
    node.disconnect();
    sink.disconnect();
  };
}

/** The assistant's loudness right now, 0 to 1, for the call screen's animation. */
export function outputLevel(meter: AnalyserNode, scratch: Float32Array<ArrayBuffer>): number {
  meter.getFloatTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i];
  const rms = Math.sqrt(sum / scratch.length);
  return Math.min(1, rms * 4);
}

export function releaseCallAudio(audio: PrimedAudio, stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
  // A microphone granted after the call already ended must not stay open.
  audio.mic.then((late) => {
    if (late !== stream) late.getTracks().forEach((track) => track.stop());
  }, () => undefined);
  void audio.context.close().catch(() => undefined);
  setAudioSession("auto");
}

/** Keeps the screen on during the call; the browser drops the lock when the app goes to the background. */
export class ScreenWake {
  private sentinel: { release(): Promise<void> } | null = null;
  private wanted = false;

  async acquire(): Promise<void> {
    this.wanted = true;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } })
      .wakeLock;
    if (!wakeLock || this.sentinel || document.visibilityState !== "visible") return;
    try {
      const sentinel = await wakeLock.request("screen");
      if (this.wanted) this.sentinel = sentinel;
      else void sentinel.release();
    } catch {
      // Refused (battery saver, or not supported): the call works without it.
    }
  }

  /** The lock is lost when the app is hidden; take it again on return. */
  lost(): void {
    this.sentinel = null;
  }

  release(): void {
    this.wanted = false;
    const sentinel = this.sentinel;
    this.sentinel = null;
    void sentinel?.release().catch(() => undefined);
  }
}
