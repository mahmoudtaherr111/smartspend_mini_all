import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./redis-client", () => ({
  getRedisClient: vi.fn(async () => null),
}));

import {
  beginLoginAttempt,
  completeSuccessfulLogin,
  recordLoginFailure,
  releaseLoginAttempt,
  resetLoginProtectionForTests,
  setLoginRateLimitHeaders,
} from "./login-protection";

function begin(ip = "203.0.113.10", accountIdentifier = "01012345678") {
  return beginLoginAttempt({
    ip,
    accountIdentifier,
    requestId: "security-test-request",
    userAgent: "test-agent",
  });
}

beforeEach(() => {
  resetLoginProtectionForTests();
});

describe("login account protection", () => {
  it("does not consume failure points for successful or abandoned preflights", async () => {
    for (let index = 0; index < 20; index++) {
      const attempt = await begin();
      expect(attempt.allowed).toBe(true);
      await releaseLoginAttempt(attempt);
    }
  });

  it("blocks before credential work after five failed account attempts", async () => {
    for (let index = 0; index < 5; index++) {
      const attempt = await begin();
      expect(attempt.allowed).toBe(true);
      await recordLoginFailure(attempt);
    }

    const blocked = await begin();
    expect(blocked).toMatchObject({
      allowed: false,
      reason: "account_backoff",
      remaining: 0,
    });
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets account and account-network failures on successful login", async () => {
    for (let index = 0; index < 4; index++) {
      const attempt = await begin();
      await recordLoginFailure(attempt);
    }

    const success = await begin();
    expect(success.allowed).toBe(true);
    await completeSuccessfulLogin(success);

    for (let index = 0; index < 5; index++) {
      const attempt = await begin();
      expect(attempt.allowed).toBe(true);
      await recordLoginFailure(attempt);
    }
    expect((await begin()).allowed).toBe(false);
  });

  it("limits failed password spraying across many accounts from one IP", async () => {
    for (let index = 0; index < 10; index++) {
      const attempt = await begin("203.0.113.20", `0100000000${index}`);
      expect(attempt.allowed).toBe(true);
      await recordLoginFailure(attempt);
    }

    const blocked = await begin("203.0.113.20", "01199999999");
    expect(blocked).toMatchObject({
      allowed: false,
      reason: "ip_burst_limit",
    });
  });

  it("caps concurrent bcrypt work for one account", async () => {
    const attempts = await Promise.all([begin(), begin(), begin()]);
    expect(attempts.every((attempt) => attempt.allowed)).toBe(true);

    const blocked = await begin();
    expect(blocked).toMatchObject({
      allowed: false,
      reason: "concurrency_limit",
    });

    await releaseLoginAttempt(attempts[0]);
    expect((await begin()).allowed).toBe(true);
  });

  it("never exposes raw account or IP values in Redis-style keys", async () => {
    const attempt = await begin("203.0.113.77", "01077777777");
    const serializedKeys = JSON.stringify(attempt.keys);
    expect(serializedKeys).not.toContain("203.0.113.77");
    expect(serializedKeys).not.toContain("01077777777");
  });

  it("sets standard and legacy rate-limit headers without revealing the key", () => {
    const headers = new Headers();
    setLoginRateLimitHeaders(headers, {
      limit: 5,
      remaining: 0,
      retryAfterMs: 30_000,
    });

    expect(headers.get("Retry-After")).toBe("30");
    expect(headers.get("RateLimit-Limit")).toBe("5");
    expect(headers.get("RateLimit-Remaining")).toBe("0");
    expect(headers.get("X-RateLimit-Limit")).toBe("5");
    expect(headers.get("Cache-Control")).toBe("no-store");
  });
});
