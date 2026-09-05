import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Context } from "./context";

const mocks = vi.hoisted(() => ({
  findLocalUser: vi.fn(),
  comparePassword: vi.fn(),
  createSession: vi.fn(),
  beginLoginAttempt: vi.fn(),
  recordLoginFailure: vi.fn(),
  completeSuccessfulLogin: vi.fn(),
  releaseLoginAttempt: vi.fn(),
  setLoginRateLimitHeaders: vi.fn(),
  executeSlidingWindowRateLimit: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock("./queries/connection", () => ({
  db: {
    query: {
      localUsers: { findFirst: mocks.findLocalUser },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: mocks.updateWhere })),
    })),
  },
}));

vi.mock("./local-auth-utils", () => ({
  hashPassword: vi.fn(),
  comparePassword: mocks.comparePassword,
  generateToken: vi.fn(async () => "signed-test-token"),
  createSession: mocks.createSession,
  validatePhone: vi.fn(() => ({ valid: true })),
  generateReferralCode: vi.fn(() => "SSTEST"),
  cleanPhoneNumber: vi.fn((phone: string) => phone.replace(/\D/g, "")),
  getSessionMetadata: vi.fn((_req, ip: string) => ({ ipAddress: ip })),
}));

vi.mock("./lib/login-protection", () => ({
  beginLoginAttempt: mocks.beginLoginAttempt,
  recordLoginFailure: mocks.recordLoginFailure,
  completeSuccessfulLogin: mocks.completeSuccessfulLogin,
  releaseLoginAttempt: mocks.releaseLoginAttempt,
  setLoginRateLimitHeaders: mocks.setLoginRateLimitHeaders,
  loginRateLimitError: (retryAfterMs: number) =>
    new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "تعذر تسجيل الدخول الآن. استنى شوية وحاول مرة تانية.",
      cause: Object.assign(new Error("limited"), {
        retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
      }),
    }),
}));

vi.mock("./lib/redis-client", () => ({
  executeSlidingWindowRateLimit: mocks.executeSlidingWindowRateLimit,
}));

vi.mock("./lib/settings-cache", () => ({
  getSystemSettings: vi.fn(async () => ({})),
}));

vi.mock("./services/whatsapp-service", () => ({
  whatsappService: {
    getStatus: vi.fn(() => ({})),
    sendMessage: vi.fn(),
  },
}));

vi.mock("./services/user-purge-service", () => ({
  purgeUserData: vi.fn(),
}));

import { localAuthRouter } from "./local-auth-router";

const allowedAttempt = {
  allowed: true,
  backend: "memory" as const,
  limit: 5,
  remaining: 5,
  retryAfterMs: 0,
  attemptId: "attempt-id",
  keys: {},
  security: {},
};

function context(): Context {
  return {
    user: null,
    req: new Request("http://localhost/api/trpc/localAuth.login", {
      method: "POST",
      headers: { "user-agent": "security-test" },
    }),
    ip: "203.0.113.44",
    resHeaders: new Headers(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.executeSlidingWindowRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 399,
    resetMs: 0,
  });
  mocks.beginLoginAttempt.mockResolvedValue({ ...allowedAttempt });
  mocks.recordLoginFailure.mockResolvedValue({
    limit: 5,
    remaining: 4,
    retryAfterMs: 0,
  });
  mocks.comparePassword.mockResolvedValue(false);
  mocks.createSession.mockResolvedValue(undefined);
  mocks.completeSuccessfulLogin.mockResolvedValue(undefined);
  mocks.releaseLoginAttempt.mockResolvedValue(undefined);
  mocks.updateWhere.mockResolvedValue(undefined);
});

describe("local password login security boundary", () => {
  it("rejects a limited request before database or bcrypt work", async () => {
    mocks.beginLoginAttempt.mockResolvedValue({
      ...allowedAttempt,
      allowed: false,
      remaining: 0,
      retryAfterMs: 30_000,
      reason: "account_backoff",
    });

    await expect(
      localAuthRouter.createCaller(context()).login({
        phone: "01012345678",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    expect(mocks.findLocalUser).not.toHaveBeenCalled();
    expect(mocks.comparePassword).not.toHaveBeenCalled();
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled();
  });

  it("makes nonexistent-account and wrong-password failures indistinguishable", async () => {
    mocks.findLocalUser.mockResolvedValueOnce(undefined);
    let missingError: unknown;
    try {
      await localAuthRouter.createCaller(context()).login({
        phone: "01011111111",
        password: "wrong-password",
      });
    } catch (error) {
      missingError = error;
    }

    expect(mocks.comparePassword).toHaveBeenLastCalledWith(
      "wrong-password",
      expect.stringMatching(/^\$2b\$12\$/),
    );
    expect(mocks.recordLoginFailure).toHaveBeenCalledTimes(1);

    mocks.findLocalUser.mockResolvedValueOnce({
      id: 10,
      phone: "01011111111",
      password: "$2b$12$real-user-hash",
      name: "Test user",
      role: "user",
      plan: "free",
    });
    let passwordError: unknown;
    try {
      await localAuthRouter.createCaller(context()).login({
        phone: "01011111111",
        password: "wrong-password",
      });
    } catch (error) {
      passwordError = error;
    }

    expect(missingError).toMatchObject({
      code: "UNAUTHORIZED",
      message: "رقم التليفون أو الباسورد غلط",
    });
    expect(passwordError).toMatchObject({
      code: "UNAUTHORIZED",
      message: "رقم التليفون أو الباسورد غلط",
    });
    expect(mocks.recordLoginFailure).toHaveBeenCalledTimes(2);
  });

  it("clears account protection only after a valid password", async () => {
    mocks.findLocalUser.mockResolvedValue({
      id: 10,
      phone: "01011111111",
      password: "$2b$12$real-user-hash",
      name: "Test user",
      role: "admin",
      plan: "ultra",
    });
    mocks.comparePassword.mockResolvedValue(true);

    await expect(
      localAuthRouter.createCaller(context()).login({
        phone: "01011111111",
        password: "correct-password",
      }),
    ).resolves.toMatchObject({
      success: true,
      token: "signed-test-token",
      user: { id: 10, role: "admin", plan: "ultra" },
    });

    expect(mocks.completeSuccessfulLogin).toHaveBeenCalledTimes(1);
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });
});
