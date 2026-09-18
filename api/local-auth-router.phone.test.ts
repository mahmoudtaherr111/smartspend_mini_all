/**
 * Proving a phone number is tied to the browser that asked. With WhatsApp verification on, an account or a
 * WhatsApp sign-in comes only from the ticket of a challenge the bot saw the number answer — for that very number,
 * and once. Before, `verifyOtp` issued a session for a phone and a code from anyone, and `register` accepted any
 * number some browser had verified.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "./context";

const mocks = vi.hoisted(() => ({
  findLocalUser: vi.fn(),
  insertedUsers: [] as unknown[],
  createSession: vi.fn(),
  readPhoneChallenge: vi.fn(),
  consumePhoneChallenge: vi.fn(),
  startPhoneChallenge: vi.fn(),
  settings: { whatsapp_otp_enabled: "true" } as Record<string, string>,
}));

vi.mock("./queries/connection", () => {
  const tx = {
    insert: () => ({
      values: (values: unknown) => ({
        $returningId: async () => {
          mocks.insertedUsers.push(values);
          return [{ id: 42 }];
        },
      }),
    }),
  };
  return {
    db: {
      query: { localUsers: { findFirst: mocks.findLocalUser } },
      transaction: async (work: (t: typeof tx) => Promise<unknown>) => work(tx),
    },
  };
});

vi.mock("./services/phone-challenge", () => ({
  PHONE_CHALLENGE_TTL_MS: 600_000,
  readPhoneChallenge: mocks.readPhoneChallenge,
  consumePhoneChallenge: mocks.consumePhoneChallenge,
  startPhoneChallenge: mocks.startPhoneChallenge,
}));

vi.mock("./local-auth-utils", () => ({
  hashPassword: vi.fn(async () => "hashed"),
  comparePassword: vi.fn(),
  generateToken: vi.fn(async () => "signed-test-token"),
  createSession: mocks.createSession,
  validatePhone: vi.fn(() => ({ valid: true })),
  generateReferralCode: vi.fn(() => "SSTEST"),
  cleanPhoneNumber: vi.fn((phone: string) => phone.replace(/\D/g, "")),
  getSessionMetadata: vi.fn((_req, ip: string) => ({ ipAddress: ip })),
  invalidateSession: vi.fn(),
}));

vi.mock("./lib/settings-cache", () => ({ getSystemSettings: vi.fn(async () => mocks.settings) }));
vi.mock("./lib/redis-client", () => ({ executeSlidingWindowRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("./services/turnstile-service", () => ({ guardOtpGeneration: vi.fn(async () => ({ verified: true })) }));
vi.mock("./services/whatsapp-service", () => ({ whatsappService: { getStatus: vi.fn(() => ({})) } }));
vi.mock("./services/user-purge-service", () => ({ purgeUserData: vi.fn() }));

import { localAuthRouter } from "./local-auth-router";

function context(): Context {
  return {
    user: null,
    req: new Request("http://localhost/api/trpc/localAuth.register", { method: "POST" }),
    resHeaders: new Headers(),
    ip: "197.38.1.1",
  } as unknown as Context;
}

const caller = () => localAuthRouter.createCaller(context());

const signUp = (verificationTicket?: string) =>
  caller().register({ name: "Mona", phone: "01012345678", password: "secret-pass", verificationTicket });

const challenge = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  phone: "01012345678",
  code: "SS-123456",
  verified: true,
  expiresAt: new Date(Date.now() + 60_000),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertedUsers.length = 0;
  mocks.settings = { whatsapp_otp_enabled: "true" };
  mocks.findLocalUser.mockResolvedValue(undefined);
  mocks.consumePhoneChallenge.mockResolvedValue(true);
});

describe("signing up with verification on", () => {
  it("refuses a request without a ticket", async () => {
    await expect(signUp()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.insertedUsers).toHaveLength(0);
  });

  it("refuses a number the bot has not seen send its code", async () => {
    mocks.readPhoneChallenge.mockResolvedValue(challenge({ verified: false }));
    await expect(signUp("7.ticket")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.consumePhoneChallenge).not.toHaveBeenCalled();
    expect(mocks.insertedUsers).toHaveLength(0);
  });

  it("refuses the proof of another number", async () => {
    mocks.readPhoneChallenge.mockResolvedValue(challenge({ phone: "01099999999" }));
    await expect(signUp("7.ticket")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.insertedUsers).toHaveLength(0);
  });

  it("creates one account per proof: the second request with the same ticket is refused", async () => {
    mocks.readPhoneChallenge.mockResolvedValue(challenge());
    mocks.consumePhoneChallenge.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(signUp("7.ticket")).resolves.toMatchObject({ success: true });
    await expect(signUp("7.ticket")).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mocks.insertedUsers).toHaveLength(1);
    expect(mocks.consumePhoneChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      expect.objectContaining({ phone: "01012345678" }),
    );
  });

  it("does not ask for a ticket when verification is off", async () => {
    mocks.settings = { whatsapp_otp_enabled: "false" };
    await expect(signUp()).resolves.toMatchObject({ success: true });
    expect(mocks.readPhoneChallenge).not.toHaveBeenCalled();
  });
});

describe("signing in by WhatsApp", () => {
  it("gives no session for a challenge the bot has not verified", async () => {
    mocks.readPhoneChallenge.mockResolvedValue(challenge({ verified: false }));
    await expect(caller().verifyOtp({ verificationTicket: "7.ticket" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("gives one session per ticket", async () => {
    mocks.readPhoneChallenge.mockResolvedValue(challenge());
    mocks.findLocalUser.mockResolvedValue({ id: 5, name: "Mona", phone: "01012345678", role: "user", plan: "free" });
    mocks.consumePhoneChallenge.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(caller().verifyOtp({ verificationTicket: "7.ticket" })).resolves.toMatchObject({ success: true });
    await expect(caller().verifyOtp({ verificationTicket: "7.ticket" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });
});

describe("asking for a code", () => {
  it("returns the code to send, the ticket and the watch token", async () => {
    mocks.startPhoneChallenge.mockResolvedValue({
      code: "SS-123456",
      ticket: "7.ticket",
      watch: "7.watch",
      expiresAt: new Date(),
    });
    await expect(caller().generateVerificationCode({ phone: "01012345678" })).resolves.toEqual({
      success: true,
      code: "SS-123456",
      ticket: "7.ticket",
      watch: "7.watch",
      expiresInSeconds: 600,
    });
  });
});
