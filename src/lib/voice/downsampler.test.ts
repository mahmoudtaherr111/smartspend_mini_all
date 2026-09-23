import { describe, expect, it } from "vitest";
import { Downsampler } from "./downsampler";

function sine(rate: number, hz: number, seconds: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

function rms(samples: Int16Array, skip = 200): number {
  let sum = 0;
  let n = 0;
  for (let i = skip; i < samples.length - skip; i++) {
    sum += (samples[i] / 32768) ** 2;
    n += 1;
  }
  return Math.sqrt(sum / n);
}

function crossingsPerSecond(samples: Int16Array, rate: number): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) crossings += 1;
  return crossings / 2 / (samples.length / rate);
}

describe("Downsampler", () => {
  for (const rate of [48_000, 44_100]) {
    it(`keeps a 1 kHz tone at ${rate} Hz, at 16 kHz`, () => {
      const out = new Downsampler(rate).process(sine(rate, 1_000, 1));
      expect(out.length).toBeGreaterThan(15_900);
      expect(out.length).toBeLessThanOrEqual(16_000);
      expect(rms(out)).toBeGreaterThan(0.5 / Math.SQRT2 * 0.97);
      expect(rms(out)).toBeLessThan(0.5 / Math.SQRT2 * 1.03);
      expect(crossingsPerSecond(out, 16_000)).toBeCloseTo(1_000, -1);
    });

    it(`removes a 12 kHz hiss at ${rate} Hz instead of folding it to 4 kHz`, () => {
      const out = new Downsampler(rate).process(sine(rate, 12_000, 1));
      expect(rms(out)).toBeLessThan(0.35 * 0.02);
    });
  }

  it("gives the same samples whatever the block sizes", () => {
    const input = sine(48_000, 440, 0.5);
    const whole = new Downsampler(48_000).process(input);
    const chunked = new Downsampler(48_000);
    const sizes = [128, 441, 1000, 7, 960];
    const parts: number[] = [];
    for (let at = 0, i = 0; at < input.length; i++) {
      const end = Math.min(input.length, at + sizes[i % sizes.length]);
      parts.push(...chunked.process(input.subarray(at, end)));
      at = end;
    }
    expect(parts).toEqual([...whole]);
  });

  it("passes 16 kHz through unchanged", () => {
    const input = sine(16_000, 500, 0.1);
    const out = new Downsampler(16_000).process(input);
    expect(out.length).toBe(input.length - 1);
    expect(out[10]).toBe(Math.round(input[10] * 0x7fff));
  });
});
