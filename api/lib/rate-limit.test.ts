import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
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
