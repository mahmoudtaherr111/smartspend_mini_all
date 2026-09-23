import { describe, expect, it } from "vitest";
import { PcmPlayer, type PlayerContext } from "./pcm-player";

class FakeSource {
  buffer: { duration: number } | null = null;
  startedAt: number | null = null;
  stopped = false;
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  start(when: number) {
    this.startedAt = when;
  }
  stop() {
    this.stopped = true;
  }
}

class FakeContext implements PlayerContext {
  currentTime = 10;
  readonly sources: FakeSource[] = [];
  createBuffer(_channels: number, length: number, sampleRate: number): AudioBuffer {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data } as unknown as AudioBuffer;
  }
  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

/** 100 ms of 24 kHz audio. */
const chunk = () => new Int16Array(2_400).buffer;

describe("PcmPlayer", () => {
  it("starts a reply after a short cushion and plays its chunks back to back", () => {
    const context = new FakeContext();
    const player = new PcmPlayer(context, {} as AudioNode);
    player.enqueue(chunk());
    player.enqueue(chunk());
    expect(context.sources[0].startedAt).toBeCloseTo(10.12);
    expect(context.sources[1].startedAt).toBeCloseTo(10.22);
    expect(player.playing).toBe(true);
    expect(player.bufferedMs).toBeCloseTo(320);
  });

  it("grows the cushion when a reply runs dry, but not for a new reply", () => {
    const context = new FakeContext();
    const player = new PcmPlayer(context, {} as AudioNode);
    player.enqueue(chunk());
    context.currentTime = 10.3; // the first chunk ended at 10.22; the next came late
    player.enqueue(chunk());
    expect(player.cushionMs).toBeCloseTo(160);
    expect(context.sources[1].startedAt).toBeCloseTo(10.46);

    context.currentTime = 20; // long after: a new reply
    player.enqueue(chunk());
    expect(player.cushionMs).toBeCloseTo(160);
  });

  it("drops everything on flush", () => {
    const context = new FakeContext();
    const player = new PcmPlayer(context, {} as AudioNode);
    player.enqueue(chunk());
    player.enqueue(chunk());
    player.flush();
    expect(context.sources.every((s) => s.stopped)).toBe(true);
    expect(player.playing).toBe(false);
    player.enqueue(chunk());
    expect(context.sources[2].startedAt).toBeCloseTo(10.12);
  });
});
