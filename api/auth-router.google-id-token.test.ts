/**
 * Google sign-in from the mobile app (`auth.signInWithGoogle`, decision 0022). Once the token passes its check
 * (`api/lib/google-id-token.test.ts`), the procedure finds or creates the account the redirect flow would and
 * returns a session token, under the strict sign-in limit, logging an event and ids only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "./context";
import { GoogleIdTokenRejected, GoogleKeysUnavailable } from "./lib/google-id-token";

const ANDROID = "android-client.apps.googleusercontent.com";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  findUser: vi.fn(),
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  createSession: vi.fn(),
  logged: [] as unknown[][],
  clients: {
    web: "web-client.apps.googleusercontent.com",
    android: ["android-client.apps.googleusercontent.com"],
    ios: [] as string[],
  },
}));

vi.mock("./queries/connection", () => ({
  db: {
    query: { users: { findFirst: mocks.findUser } },
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        $returningId: async () => {
          mocks.inserted.push(values);
          return [{ id: 77 }];
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          mocks.updated.push(values);
        },
      }),
    }),
  },
}));

vi.mock("./local-auth-utils", () => ({
  generateToken: vi.fn(async (userId: number, type: string) => `session-for-${type}-${userId}`),
  createSession: mocks.createSession,
  getSessionMetadata: vi.fn((_req: unknown, ip: string) => ({ ipAddress: ip })),
  invalidateSession: vi.fn(),
}));

vi.mock("./lib/google-id-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/google-id-token")>();
  return { ...actual, verifyGoogleIdToken: mocks.verify, googleClientIdsFromEnv: () => mocks.clients };
});

vi.mock("./lib/log", () => {
  const record =
    (level: string) =>
    (...args: unknown[]) =>
      mocks.logged.push([level, ...args]);
  return {
    createLogger: () => ({ info: record("info"), warn: record("warn"), error: record("error"), debug: record("debug") }),
  };
});

vi.mock("./lib/redis-client", () => ({ executeSlidingWindowRateLimit: vi.fn(async () => ({ allowed: true })) }));

import { authRouter } from "./auth-router";

let ipCounter = 0;
function caller(ip = `197.38.2.${++ipCounter}`) {
  return authRouter.createCaller({
    user: null,
    req: new Request("http://localhost/api/trpc/auth.signInWithGoogle", { method: "POST" }),
    resHeaders: new Headers(),
    ip,
  } as unknown as Context);
}

const identity = {
  sub: "109876543210",
  email: "mona@example.com",
  name: "Mona",
  picture: "https://lh3.googleusercontent.com/a/photo",
};

const storedUser = (overrides: Record<string, unknown> = {}) => ({
  id: 77,
  unionId: identity.sub,
  name: "Mona",
  email: identity.email,
  avatar: identity.picture,
  role: "user",
  plan: "free",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted.length = 0;
  mocks.updated.length = 0;
  mocks.logged.length = 0;
  mocks.clients.android = [ANDROID];
  mocks.clients.ios = [];
  mocks.verify.mockResolvedValue(identity);
});

describe("auth.signInWithGoogle", () => {
  it("creates the account the redirect flow would, and returns a session token", async () => {
    mocks.findUser.mockResolvedValueOnce(undefined).mockResolvedValueOnce(storedUser());

    const answer = await caller().signInWithGoogle({ idToken: "header.payload.signature" });

    expect(mocks.verify).toHaveBeenCalledWith("header.payload.signature", mocks.clients);
    expect(mocks.inserted).toEqual([
      expect.objectContaining({
        unionId: identity.sub,
        email: identity.email,
        name: "Mona",
        avatar: identity.picture,
        referralCode: expect.stringMatching(/^SS[0-9A-F]{8}$/),
      }),
    ]);
    expect(mocks.createSession).toHaveBeenCalledWith(77, "oauth", "session-for-oauth-77", expect.any(Object));
    expect(answer).toEqual({
      success: true,
      token: "session-for-oauth-77",
      user: {
        id: 77,
        name: "Mona",
        email: identity.email,
        avatar: identity.picture,
        role: "user",
        plan: "free",
      },
    });
  });

  it("signs an existing account in by its Google id and records the sign-in", async () => {
    mocks.findUser.mockResolvedValueOnce(storedUser({ plan: "pro" }));

    const answer = await caller().signInWithGoogle({ idToken: "header.payload.signature" });

    expect(mocks.inserted).toHaveLength(0);
    expect(mocks.updated).toEqual([{ lastSignInAt: expect.any(Date) }]);
    expect(answer.user.plan).toBe("pro");
  });

  it("names a new account after its email when Google gives no name", async () => {
    mocks.verify.mockResolvedValue({ sub: "1", email: "sara.ali@example.com" });
    mocks.findUser.mockResolvedValueOnce(undefined).mockResolvedValueOnce(storedUser({ id: 78 }));

    await caller().signInWithGoogle({ idToken: "header.payload.signature" });

    expect(mocks.inserted[0]).toMatchObject({ name: "sara.ali" });
  });

  it("refuses a token that fails the check, writes nothing and logs only why", async () => {
    mocks.verify.mockRejectedValue(new GoogleIdTokenRejected("audience"));

    await expect(caller().signInWithGoogle({ idToken: "header.payload.signature" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "ماقدرناش نتأكد من حساب Google. جرّب تاني.",
    });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.logged).toEqual([
      ["warn", { event: "auth.google_id_token.rejected", reason: "audience" }, expect.any(String)],
    ]);
  });

  it("says Google is unreachable when its keys cannot be fetched", async () => {
    mocks.verify.mockRejectedValue(new GoogleKeysUnavailable(new TypeError("fetch failed")));

    await expect(caller().signInWithGoogle({ idToken: "header.payload.signature" })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("is off until a mobile client id is configured", async () => {
    mocks.clients.android = [];

    await expect(caller().signInWithGoogle({ idToken: "header.payload.signature" })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("never logs the token, the email or the name", async () => {
    mocks.findUser.mockResolvedValueOnce(undefined).mockResolvedValueOnce(storedUser());

    await caller().signInWithGoogle({ idToken: "header.payload.signature" });

    expect(mocks.logged).toEqual([
      ["info", { event: "auth.google_id_token.signed_in", userId: 77, created: true }, expect.any(String)],
    ]);
    const written = JSON.stringify(mocks.logged);
    for (const secret of ["header.payload.signature", "session-for-oauth-77", identity.email, "Mona"]) {
      expect(written).not.toContain(secret);
    }
  });

  it("validates its input", async () => {
    await expect(caller().signInWithGoogle({ idToken: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().signInWithGoogle({ idToken: "x".repeat(8_193) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("shares the strict sign-in limit: 25 attempts per address in 15 minutes", async () => {
    mocks.verify.mockRejectedValue(new GoogleIdTokenRejected("signature"));
    const ip = "197.38.9.9";
    for (let attempt = 0; attempt < 25; attempt++) {
      await expect(caller(ip).signInWithGoogle({ idToken: "a.b.c" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    await expect(caller(ip).signInWithGoogle({ idToken: "a.b.c" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
