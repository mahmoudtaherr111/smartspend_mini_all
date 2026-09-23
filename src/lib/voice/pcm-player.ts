/**
 * Plays the assistant's voice as it streams in: 24 kHz 16-bit mono PCM chunks, scheduled back to back. A short
 * cushion before the first chunk of a reply absorbs uneven network timing; when a reply runs dry anyway, the
 * cushion grows for the rest of the call. `flush` drops everything queued at once, for when the user talks over
 * the assistant.
 */
import { VOICE_OUTPUT_SAMPLE_RATE } from "@contracts/voice-protocol";

/** The parts of an AudioContext the player uses, so tests can drive its clock. */
export interface PlayerContext {
  readonly currentTime: number;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
}

const START_CUSHION_S = 0.12;
const MAX_CUSHION_S = 0.3;
const CUSHION_STEP_S = 0.04;
/** A gap longer than this between chunks is a new reply, not a stutter. */
const REPLY_GAP_S = 0.6;

export class PcmPlayer {
  private nextTime = 0;
  private lastEnd = 0;
  private cushion = START_CUSHION_S;
  private readonly sources = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly context: PlayerContext,
    private readonly output: AudioNode,
  ) {}

  enqueue(pcm: ArrayBuffer): void {
    const samples = Math.floor(pcm.byteLength / 2);
    if (!samples) return;
    const view = new Int16Array(pcm, 0, samples);
    const buffer = this.context.createBuffer(1, samples, VOICE_OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) channel[i] = view[i] / 32768;

    const now = this.context.currentTime;
    if (this.nextTime < now) {
      // Nothing left to play: a reply starts, or the stream fell behind in the middle of one.
      if (this.lastEnd > 0 && now - this.lastEnd < REPLY_GAP_S) {
        this.cushion = Math.min(MAX_CUSHION_S, this.cushion + CUSHION_STEP_S);
      }
      this.nextTime = now + this.cushion;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    source.onended = () => {
      this.sources.delete(source);
    };
    source.start(this.nextTime);
    this.sources.add(source);
    this.nextTime += buffer.duration;
    this.lastEnd = this.nextTime;
  }

  /** Stops what is playing and drops what is queued. */
  flush(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      source.disconnect();
    }
    this.sources.clear();
    this.nextTime = 0;
    this.lastEnd = 0;
  }

  /** True from the moment a reply is queued until its last sample has played. */
  get playing(): boolean {
    return this.nextTime > this.context.currentTime;
  }

  get bufferedMs(): number {
    return Math.max(0, this.nextTime - this.context.currentTime) * 1000;
  }

  get cushionMs(): number {
    return this.cushion * 1000;
  }
}
