import { TRPCError } from "@trpc/server";

type Bucket = { count: number; resetAt: number };

export type RateLimiter = {
  hit: (key: string, message?: string) => void;
};

/** Fixed-window counter rate limiter (in-memory; reset on process restart). */
export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const map = new Map<string, Bucket>();

  // Periodically clean up expired keys to prevent memory leaks
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of map) {
      if (now > limit.resetAt) {
        map.delete(key);
      }
    }
  }, Math.max(windowMs, 5 * 60 * 1000));
  
  if (interval.unref) interval.unref();

  return {
    hit(key: string, message = "طلبات كتير جداً من نفس المصدر. جرب بعد شوية.") {
      const now = Date.now();
      const limit = map.get(key);

      if (!limit || now > limit.resetAt) {
        map.set(key, { count: 1, resetAt: now + windowMs });
        return;
      }

      limit.count++;
      if (limit.count > max) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
      }
    },
  };
}
