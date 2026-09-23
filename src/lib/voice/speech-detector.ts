/**
 * Decides, 20 ms at a time, whether the user is speaking, so the call sends audio only while they are. Google
 * bills every second of audio it listens to, and it answers as soon as the app says the user stopped, instead of
 * waiting to hear enough silence on its own.
 *
 * The noise floor is the quietest frame of the last three seconds, which follows a street or a fan without a
 * calibration step. Speech starts 10 dB above it and keeps going until it falls to 6 dB above it. While the
 * assistant is talking, interrupting it takes 18 dB above the floor and a clearly spoken voice (-42 dBFS), held
 * for 100 ms, so its own voice leaking from the speaker does not cut it off. The 300 ms before the
 * start are sent too, so the first syllable is not clipped. A pause inside a sentence is sent for its first
 * 200 ms; after that the app waits: 450 ms for a short answer ("آه", "لأ"), 700 ms after a longer sentence,
 * where people stop to remember an amount, before it tells the server the user finished.
 */
export const FRAME_SAMPLES = 320;

export interface SpeechDetectorOptions {
  preRollFrames?: number;
  tailFrames?: number;
  shortHangoverFrames?: number;
  longHangoverFrames?: number;
  shortUtteranceFrames?: number;
  floorWindowFrames?: number;
  onsetDb?: number;
  onsetFrames?: number;
  playbackOnsetDb?: number;
  playbackOnsetFrames?: number;
  offsetDb?: number;
  minSpeechDbfs?: number;
  minBargeInDbfs?: number;
}

export interface DetectorStep {
  /** Frames to send now, oldest first; the pre-roll comes with the frame that starts the speech. */
  send: Int16Array[];
  speechStart: boolean;
  speechEnd: boolean;
}

const DEFAULTS: Required<SpeechDetectorOptions> = {
  preRollFrames: 15,
  tailFrames: 10,
  shortHangoverFrames: 23,
  longHangoverFrames: 35,
  shortUtteranceFrames: 60,
  floorWindowFrames: 150,
  onsetDb: 10,
  onsetFrames: 3,
  playbackOnsetDb: 18,
  playbackOnsetFrames: 5,
  offsetDb: 6,
  minSpeechDbfs: -55,
  minBargeInDbfs: -42,
};

const SILENT_DBFS = -96;

export function frameDbfs(frame: Int16Array): number {
  if (!frame.length) return SILENT_DBFS;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / frame.length) / 32768;
  return rms > 0 ? Math.max(SILENT_DBFS, 20 * Math.log10(rms)) : SILENT_DBFS;
}

export class SpeechDetector {
  private readonly options: Required<SpeechDetectorOptions>;
  private state: "idle" | "speech" | "pause" = "idle";
  private readonly preRoll: Int16Array[] = [];
  private readonly energies: number[] = [];
  private energyIndex = 0;
  private onsetCount = 0;
  private speechFrames = 0;
  private silentFrames = 0;
  private lastDb = SILENT_DBFS;

  constructor(options: SpeechDetectorOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  get speaking(): boolean {
    return this.state !== "idle";
  }

  get levelDb(): number {
    return this.lastDb;
  }

  get noiseFloorDb(): number {
    if (!this.energies.length) return SILENT_DBFS;
    let floor = Infinity;
    for (const energy of this.energies) if (energy < floor) floor = energy;
    return floor;
  }

  private remember(db: number): void {
    const size = this.options.floorWindowFrames;
    if (this.energies.length < size) this.energies.push(db);
    else this.energies[this.energyIndex] = db;
    this.energyIndex = (this.energyIndex + 1) % size;
  }

  private keepPreRoll(frame: Int16Array): void {
    this.preRoll.push(frame);
    if (this.preRoll.length > this.options.preRollFrames) this.preRoll.shift();
  }

  /**
   * One 20 ms frame of 16 kHz audio. `assistantSpeaking` raises the bar for starting to speak, so the assistant's
   * voice from the speaker does not count as the user interrupting it.
   */
  push(frame: Int16Array, assistantSpeaking = false): DetectorStep {
    const o = this.options;
    const db = frameDbfs(frame);
    this.lastDb = db;
    // The floor is judged on what came before this frame, so a loud first frame of speech cannot raise it.
    const floor = this.energies.length ? this.noiseFloorDb : db;
    this.remember(db);
    const onset = Math.max(floor + o.onsetDb, o.minSpeechDbfs);
    const bargeIn = Math.max(floor + o.playbackOnsetDb, o.minBargeInDbfs);
    const offset = Math.max(floor + o.offsetDb, o.minSpeechDbfs);
    const step: DetectorStep = { send: [], speechStart: false, speechEnd: false };

    if (this.state === "idle") {
      this.keepPreRoll(frame);
      const threshold = assistantSpeaking ? bargeIn : onset;
      const needed = assistantSpeaking ? o.playbackOnsetFrames : o.onsetFrames;
      this.onsetCount = db >= threshold ? this.onsetCount + 1 : 0;
      if (this.onsetCount >= needed) {
        this.state = "speech";
        this.speechFrames = this.onsetCount;
        this.onsetCount = 0;
        step.send = this.preRoll.splice(0);
        step.speechStart = true;
      }
      return step;
    }

    if (this.state === "speech") {
      step.send = [frame];
      this.speechFrames += 1;
      if (db < offset) {
        this.state = "pause";
        this.silentFrames = 1;
      }
      return step;
    }

    // A pause inside the utterance: speech again, or long enough to call it finished.
    if (db >= onset) {
      this.state = "speech";
      this.speechFrames += 1;
      step.send = [frame];
      return step;
    }
    this.silentFrames += 1;
    if (this.silentFrames <= o.tailFrames) step.send = [frame];
    const hangover = this.speechFrames < o.shortUtteranceFrames ? o.shortHangoverFrames : o.longHangoverFrames;
    if (this.silentFrames >= hangover) {
      this.state = "idle";
      this.speechFrames = 0;
      this.silentFrames = 0;
      step.speechEnd = true;
    }
    return step;
  }

  /** Ends an utterance at once (the microphone was muted); true when the server must be told the user stopped. */
  flush(): boolean {
    const wasSpeaking = this.state !== "idle";
    this.state = "idle";
    this.speechFrames = 0;
    this.silentFrames = 0;
    this.onsetCount = 0;
    this.preRoll.length = 0;
    return wasSpeaking;
  }
}
