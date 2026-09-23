import { describe, expect, it } from "vitest";
import { FRAME_SAMPLES, SpeechDetector, frameDbfs, type DetectorStep } from "./speech-detector";

/** A frame of noise-like audio at roughly the given level in dBFS. */
function frameAt(dbfs: number, seed = 1): Int16Array {
  const amplitude = 32768 * 10 ** (dbfs / 20) * Math.SQRT2;
  const frame = new Int16Array(FRAME_SAMPLES);
  let x = seed;
  for (let i = 0; i < frame.length; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const phase = (i / FRAME_SAMPLES) * 2 * Math.PI * 7 + x / 2147483648;
    frame[i] = Math.round(amplitude * Math.sin(phase));
  }
  return frame;
}

function run(detector: SpeechDetector, frames: Int16Array[], assistantSpeaking = false): DetectorStep[] {
  return frames.map((frame) => detector.push(frame, assistantSpeaking));
}

const repeat = (count: number, dbfs: number) => Array.from({ length: count }, (_, i) => frameAt(dbfs, i + 1));

describe("frameDbfs", () => {
  it("measures a frame's level", () => {
    expect(frameDbfs(frameAt(-20))).toBeCloseTo(-20, 0);
    expect(frameDbfs(new Int16Array(FRAME_SAMPLES))).toBe(-96);
  });
});

describe("SpeechDetector", () => {
  it("sends nothing while the room is quiet", () => {
    const steps = run(new SpeechDetector(), repeat(100, -62));
    expect(steps.every((s) => s.send.length === 0 && !s.speechStart && !s.speechEnd)).toBe(true);
  });

  it("starts with the 300 ms before the speech and ends a short answer after 450 ms", () => {
    const detector = new SpeechDetector();
    run(detector, repeat(50, -62));
    const speech = run(detector, repeat(40, -25));
    const start = speech.findIndex((s) => s.speechStart);
    expect(start).toBe(2);
    expect(speech[start].send).toHaveLength(15);
    expect(speech.slice(start + 1).every((s) => s.send.length === 1)).toBe(true);

    const silence = run(detector, repeat(40, -62));
    const sent = silence.filter((s) => s.send.length).length;
    expect(sent).toBe(10);
    const end = silence.findIndex((s) => s.speechEnd);
    expect(end + 1).toBe(23);
    expect(detector.speaking).toBe(false);
  });

  it("waits 700 ms after a longer sentence", () => {
    const detector = new SpeechDetector();
    run(detector, repeat(50, -62));
    run(detector, repeat(100, -25));
    const silence = run(detector, repeat(50, -62));
    expect(silence.findIndex((s) => s.speechEnd) + 1).toBe(35);
  });

  it("keeps a sentence whole across a short pause, sending only the first 200 ms of it", () => {
    const detector = new SpeechDetector();
    run(detector, repeat(50, -62));
    run(detector, repeat(80, -25));
    const pause = run(detector, repeat(15, -62));
    expect(pause.some((s) => s.speechEnd)).toBe(false);
    expect(pause.filter((s) => s.send.length).length).toBe(10);
    const again = run(detector, repeat(5, -25));
    expect(again.every((s) => s.send.length === 1 && !s.speechStart)).toBe(true);
    expect(detector.speaking).toBe(true);
  });

  it("does not let the assistant's own voice from the speaker interrupt it", () => {
    const detector = new SpeechDetector();
    run(detector, repeat(50, -62));
    // Leaking playback: well above the room, but not a voice speaking into the phone.
    const echo = run(detector, repeat(30, -47), true);
    expect(echo.some((s) => s.speechStart)).toBe(false);
    const user = run(detector, repeat(10, -24), true);
    expect(user.findIndex((s) => s.speechStart)).toBe(4);
  });

  it("gets used to a noise that stays, instead of sending it forever", () => {
    const detector = new SpeechDetector();
    run(detector, repeat(50, -62));
    const noisy = run(detector, repeat(250, -35));
    const end = noisy.findIndex((s) => s.speechEnd);
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThan(200);
    expect(noisy.slice(end + 1).some((s) => s.speechStart)).toBe(false);
  });

  it("flush ends an utterance at once", () => {
    const detector = new SpeechDetector();
    run(detector, repeat(50, -62));
    run(detector, repeat(10, -25));
    expect(detector.flush()).toBe(true);
    expect(detector.flush()).toBe(false);
  });
});
