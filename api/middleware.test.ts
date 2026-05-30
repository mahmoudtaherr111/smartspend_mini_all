import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createRateLimiter } from "./lib/rate-limit";

/**
 * Mirrors api/middleware.ts public + strict limiter usage so regressions
 * like `strictPublicIpLimiter.hit is not a function` are caught in CI.
 */
describe("middleware rate limiter wiring", () => {
  const publicIpLimiter = createRateLimiter(400, 60_000);
  const strictPublicIpLimiter = createRateLimiter(25, 15 * 60_000);

  it("exposes .hit on both limiters used by publicProcedure", () => {
    expect(typeof publicIpLimiter.hit).toBe("function");
    expect(typeof strictPublicIpLimiter.hit).toBe("function");
  });

  it("public limiter can be invoked the same way as middleware", () => {
    expect(() => publicIpLimiter.hit("pub:127.0.0.1")).not.toThrow();
  });

  it("strict limiter can be invoked the same way as middleware", () => {
    expect(() =>
      strictPublicIpLimiter.hit(
        "strict:127.0.0.1",
        "محاولات كتيرة لتسجيل الدخول أو التسجيل من نفس الشبكة. استنى شوية وحاول تاني.",
      ),
    ).not.toThrow();
  });

  it("strict limiter enforces cap", () => {
    const tiny = createRateLimiter(1, 60_000);
    tiny.hit("strict:test");
    expect(() => tiny.hit("strict:test")).toThrow(TRPCError);
  });
});
