/**
 * Microphone samples to what the call sends: 16 kHz mono 16-bit PCM. Browsers record at the device's rate
 * (usually 48 kHz, sometimes 44.1 kHz), so the samples are low-pass filtered below 8 kHz before they are thinned
 * out. Without the filter, the hiss of "س" and "ش" above 8 kHz folds back into the band the recognizer hears.
 *
 * The filter is a Hamming-windowed sinc evaluated at the two input samples around each output instant, and the
 * output is interpolated between them, so any input rate works and blocks of any length give the same result.
 */
import { VOICE_INPUT_SAMPLE_RATE } from "@contracts/voice-protocol";

const CUTOFF_HZ = 7_000;

function lowPassTaps(inputRate: number, half: number): Float32Array {
  const size = half * 2 + 1;
  const taps = new Float32Array(size);
  const fc = CUTOFF_HZ / inputRate;
  let sum = 0;
  for (let n = 0; n < size; n++) {
    const k = n - half;
    const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (size - 1));
    taps[n] = sinc * window;
    sum += taps[n];
  }
  for (let n = 0; n < size; n++) taps[n] /= sum;
  return taps;
}

export function floatToInt16(value: number): number {
  const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

export class Downsampler {
  private readonly step: number;
  private readonly taps: Float32Array | null;
  private readonly half: number;
  private buffer: Float32Array;
  private length: number;
  private position: number;

  constructor(readonly inputRate: number, readonly outputRate = VOICE_INPUT_SAMPLE_RATE) {
    this.step = inputRate / outputRate;
    // Filtering only matters when thinning out; a device already at 16 kHz (or below) is interpolated as is.
    this.half = this.step > 1.05 ? Math.ceil(this.step * 10) : 0;
    this.taps = this.half ? lowPassTaps(inputRate, this.half) : null;
    this.buffer = new Float32Array(Math.max(4096, this.half * 4));
    // Zeros before the first sample, so the first output lines up with the first input sample.
    this.length = this.half;
    this.position = this.half;
  }

  private filterAt(index: number): number {
    const taps = this.taps;
    if (!taps) return this.buffer[index];
    const start = index - this.half;
    let sum = 0;
    for (let n = 0; n < taps.length; n++) sum += taps[n] * this.buffer[start + n];
    return sum;
  }

  /** Converts one block of microphone samples; returns the 16 kHz samples it completes. */
  process(input: Float32Array): Int16Array {
    if (this.length + input.length > this.buffer.length) {
      const grown = new Float32Array(Math.max(this.buffer.length * 2, this.length + input.length));
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
    this.buffer.set(input, this.length);
    this.length += input.length;

    const out = new Int16Array(Math.ceil(this.length / this.step) + 1);
    let count = 0;
    for (;;) {
      const index = Math.floor(this.position);
      if (index + 1 + this.half >= this.length) break;
      const frac = this.position - index;
      const a = this.filterAt(index);
      const value = frac > 0 ? a + (this.filterAt(index + 1) - a) * frac : a;
      out[count++] = floatToInt16(value);
      this.position += this.step;
    }

    const keepFrom = Math.max(0, Math.floor(this.position) - this.half);
    if (keepFrom > 0) {
      this.buffer.copyWithin(0, keepFrom, this.length);
      this.length -= keepFrom;
      this.position -= keepFrom;
    }
    return out.subarray(0, count);
  }
}
