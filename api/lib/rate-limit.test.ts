import { afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an object with a hit function", () => {
    const limiter = createRateLimiter(5, 60_000);
    expect(typeof limiter.hit).toBe("function");
  });

  it("allows requests up to the max within the window", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(() => limiter.hit("a")).not.toThrow();
    expect(() => limiter.hit("a")).not.toThrow();
    expect(() => limiter.hit("a")).not.toThrow();
  });

  it("throws TOO_MANY_REQUESTS when max is exceeded", () => {
    const limiter = createRateLimiter(2, 60_000);
    limiter.hit("ip-1");
    limiter.hit("ip-1");

    try {
      limiter.hit("ip-1");
      expect.fail("expected rate limit error");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const trpcErr = err as TRPCError;
      expect(trpcErr.code).toBe("TOO_MANY_REQUESTS");
      expect(trpcErr.message).toContain("طلبات");
    }
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter(1, 60_000);
    limiter.hit("a");
    expect(() => limiter.hit("b")).not.toThrow();
    expect(() => limiter.hit("a")).toThrow(TRPCError);
  });

  it("forgets keys whose window has passed, so its memory does not grow with every address it has seen", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 500; i++) limiter.hit(`old-${i}`);
    expect(limiter.trackedKeys()).toBe(500);

    vi.advanceTimersByTime(61_000);
    for (let i = 0; i < 500; i++) limiter.hit(`new-${i}`);

    expect(limiter.trackedKeys()).toBe(500);
    // A key still inside its window keeps its count through the sweep.
    for (let i = 0; i < 4; i++) limiter.hit("new-0");
    expect(() => limiter.hit("new-0")).toThrow(TRPCError);
  });

  it("uses a custom message when provided", () => {
    const limiter = createRateLimiter(1, 60_000);
    limiter.hit("x");

    try {
      limiter.hit("x", "رسالة مخصصة");
      expect.fail("expected rate limit error");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).message).toBe("رسالة مخصصة");
    }
  });
});
