import { TRPCError } from "@trpc/server";
import { executeSlidingWindowRateLimit } from "./redis-client";

export type RateLimiter = {
  hit: (key: string, message?: string) => Promise<void> | void;
};

/**
 * Sliding-window rate limiter (Decision 5 / P2).
 * Uses Redis Lua script for distributed multi-process atomic enforcement,
 * with an in-memory sliding-window fallback for single-process/testing.
 */
export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const inMemoryWindows = new Map<string, number[]>();

  function localCheck(key: string, message: string) {
    const now = Date.now();
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
  };
}
