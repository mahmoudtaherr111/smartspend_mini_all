import { TRPCError } from "@trpc/server";
import { executeSlidingWindowRateLimit } from "./redis-client";

/** How many hits pass between two sweeps of a limiter's in-process map: often enough to bound it, rarely enough to cost nothing. */
const SWEEP_EVERY = 1_000;

export type RateLimiter = {
  hit: (key: string, message?: string) => Promise<void> | void;
  /** How many keys this process is counting; lets a test see the sweep work. */
  trackedKeys: () => number;
};

/**
 * Sliding-window rate limiter (Decision 5 / P2).
 * Uses Redis Lua script for distributed multi-process atomic enforcement,
 * with an in-memory sliding-window fallback for single-process/testing.
 */
export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const inMemoryWindows = new Map<string, number[]>();
  let hitsSinceSweep = 0;

  /**
   * Forgets keys whose last hit has left the window. Without it the map keeps an entry for every address and
   * number it has ever counted, for as long as the process lives.
   */
  function sweep(now: number) {
    const clearBefore = now - windowMs;
    for (const [key, timestamps] of inMemoryWindows) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= clearBefore) inMemoryWindows.delete(key);
    }
  }

  function localCheck(key: string, message: string) {
    const now = Date.now();
    if (++hitsSinceSweep >= SWEEP_EVERY) {
      hitsSinceSweep = 0;
      sweep(now);
    }
    const clearBefore = now - windowMs;
    const timestamps = (inMemoryWindows.get(key) || []).filter((ts) => ts > clearBefore);
    if (timestamps.length >= max) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
    }
    timestamps.push(now);
    inMemoryWindows.set(key, timestamps);
  }

  return {
    hit(key: string, message = "طلبات كتير جداً من نفس المصدر. جرب بعد شوية.") {
      localCheck(key, message);

      const redisPromise = executeSlidingWindowRateLimit(`rl:${key}`, max, windowMs).then(
        ({ allowed }) => {
          if (!allowed) {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
          }
        },
      );

      // Return promise for async callers that await it
      return redisPromise;
    },
    trackedKeys: () => inMemoryWindows.size,
  };
}
