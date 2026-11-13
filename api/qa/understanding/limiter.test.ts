import { describe, expect, it } from "vitest";
import { RateLimiter, runWithRetries, type TryResult } from "./limiter";

function fakeTime() {
  const state = { now: 1_000_000, sleeps: [] as number[] };
  return {
    state,
    clock: () => state.now,
    sleep: async (ms: number) => {
      state.sleeps.push(ms);
      state.now += Math.max(0, ms);
    },
  };
}

describe("RateLimiter", () => {
  it("spaces request starts by 60 / rpm seconds", async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(6, time.clock, time.sleep);
    const starts = [await limiter.acquire(), await limiter.acquire(), await limiter.acquire()];
    expect(starts.map((at) => at - starts[0])).toEqual([0, 10_000, 20_000]);
    expect(time.state.sleeps).toEqual([10_000, 10_000]);
  });

  it("measures spacing from the start, so a slow answer does not add a wait", async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(6, time.clock, time.sleep);
    await limiter.acquire();
    time.state.now += 7_000; // the request took 7 s
    await limiter.acquire();
    expect(time.state.sleeps).toEqual([3_000]);
    time.state.now += 15_000; // longer than the interval
    await limiter.acquire();
    expect(time.state.sleeps).toEqual([3_000]);
  });

  it("serves concurrent callers one at a time, never two starts together", async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(8, time.clock, time.sleep);
    const starts = await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    expect(starts[1] - starts[0]).toBe(7_500);
    expect(starts[2] - starts[1]).toBe(7_500);
  });

  it("holdFor pushes the next start out and never shortens a booked wait", async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(1, time.clock, time.sleep);
    await limiter.acquire();
    limiter.holdFor(5_000); // shorter than the 60 s already booked
    await limiter.acquire();
    expect(time.state.sleeps).toEqual([60_000]);
    limiter.holdFor(90_000);
    await limiter.acquire();
    expect(time.state.sleeps).toEqual([60_000, 90_000]);
  });

  it("refuses a non-positive rpm", () => {
    expect(() => new RateLimiter(0)).toThrow();
    expect(() => new RateLimiter(Number.NaN)).toThrow();
  });
});

describe("runWithRetries", () => {
  const limited = (retryAfterMs?: number): TryResult<string> => ({ ok: false, rateLimited: true, retryAfterMs, detail: "429" });

  it("waits a minute by default and retries a rate-limited case at most 3 times", async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(60, time.clock, time.sleep);
    let calls = 0;
    const waits: number[] = [];
    const outcome = await runWithRetries(async () => (calls++, limited()), limiter, time.sleep, undefined, (ms) => waits.push(ms));
    expect(calls).toBe(4);
    expect(outcome).toMatchObject({ status: "failed", rateLimited: true, retries: 3 });
    expect(waits).toEqual([60_000, 60_000, 60_000]);
  });

  it("waits what the provider asked, then succeeds", async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(60, time.clock, time.sleep);
    const replies: TryResult<string>[] = [limited(12_000), { ok: true, value: "read" }];
    const startedAt = time.state.now;
    const outcome = await runWithRetries(async () => replies.shift()!, limiter, time.sleep);
    expect(outcome).toEqual({ status: "done", value: "read", retries: 1 });
    expect(time.state.now - startedAt).toBeGreaterThanOrEqual(12_000);
  });

  it("does not retry a failure that is not a rate limit", async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(60, time.clock, time.sleep);
    let calls = 0;
    const outcome = await runWithRetries(async () => (calls++, { ok: false, rateLimited: false, detail: "timeout" }) as TryResult<string>, limiter, time.sleep);
    expect(calls).toBe(1);
    expect(outcome).toMatchObject({ status: "failed", rateLimited: false, retries: 0 });
  });

  it("reports a wait longer than the policy allows as a quota instead of sitting through it", async () => {
    const time = fakeTime();
    const limiter = new RateLimiter(60, time.clock, time.sleep);
    const outcome = await runWithRetries(async () => limited(6 * 3_600_000), limiter, time.sleep);
    expect(outcome).toMatchObject({ status: "quota", retryAfterMs: 6 * 3_600_000, retries: 0 });
    expect(time.state.sleeps).toEqual([]);
  });
});
