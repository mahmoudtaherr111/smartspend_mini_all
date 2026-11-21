/**
 * Proving a phone number is tied to the screen that asked. With WhatsApp verification on, the server sends a code to
 * the number's WhatsApp in Meta's authentication template (decision 0038) and never returns it; an account or a
 * WhatsApp sign-in comes only from the ticket of a challenge whose code was typed back — for that very number, and
 * once.
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
  confirmPhoneChallenge: vi.fn(),
  sendMessageNow: vi.fn(),
  whatsAppConfigured: true,
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
  confirmPhoneChallenge: mocks.confirmPhoneChallenge,
}));

vi.mock("./lib/whatsapp/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/whatsapp/client")>();
  return {
    ...actual,
    whatsAppConfig: () =>
      mocks.whatsAppConfigured ? { accessToken: "t", phoneNumberId: "1", apiVersion: "v23.0" } : null,
  };
});
vi.mock("./lib/whatsapp/outbox", () => ({ sendMessageNow: mocks.sendMessageNow }));

vi.mock("./local-auth-utils", () => ({
  hashPassword: vi.fn(async () => "hashed"),
  comparePassword: vi.fn(),
  generateToken: vi.fn(async () => "signed-test-token"),
  createSession: mocks.createSession,
  validatePhone: vi.fn(() => ({ valid: true })),
  generateReferralCode: vi.fn(() => "SSTEST"),
  cleanPhoneNumber: vi.fn((phone: string) => phone.replace(/\D/g, "")),
  getSessionMetadata: vi.fn((_req, ip: string) => ({ ipAddress: ip })),
  sessionCookie: vi.fn((token: string) => `smartspend_token=${token}; HttpOnly; SameSite=Lax; Path=/`),
  invalidateSession: vi.fn(),
}));

vi.mock("./lib/settings-cache", () => ({ getSystemSettings: vi.fn(async () => mocks.settings) }));
vi.mock("./lib/redis-client", () => ({ executeSlidingWindowRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("./services/turnstile-service", () => ({ guardOtpGeneration: vi.fn(async () => ({ verified: true })) }));
vi.mock("./services/user-purge-service", () => ({ purgeUserData: vi.fn() }));

import { WhatsAppApiError } from "./lib/whatsapp/client";
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
  attempts: 0,
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
  mocks.whatsAppConfigured = true;
  mocks.sendMessageNow.mockResolvedValue({ id: 1, messageId: "wamid.X" });
});

describe("signing up with verification on", () => {
  it("refuses a request without a ticket", async () => {
    await expect(signUp()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.insertedUsers).toHaveLength(0);
  });

  it("refuses a number whose code was not typed back", async () => {
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
  it("gives no session for a challenge whose code was not typed back", async () => {
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
  const started = { code: "482913", ticket: "7.ticket", expiresAt: new Date() };

  it("sends the code to the number's WhatsApp and returns only the ticket", async () => {
    mocks.startPhoneChallenge.mockResolvedValue(started);
    const answer = await caller().generateVerificationCode({ phone: "01012345678" });

    expect(answer).toEqual({ success: true, ticket: "7.ticket", expiresInSeconds: 600, resendInSeconds: 60 });
    expect(JSON.stringify(answer)).not.toContain("482913");
    expect(mocks.sendMessageNow).toHaveBeenCalledWith(
      {
        to: "01012345678",
        purpose: "verification",
        message: {
          name: "smartspend_verification",
          language: "ar",
          body: ["482913"],
          buttons: [{ index: 0, subType: "url", parameter: "482913" }],
        },
      },
      expect.objectContaining({ phoneNumberId: "1" }),
    );
  });

  it("refuses while WhatsApp is not set up, without opening a challenge", async () => {
    mocks.whatsAppConfigured = false;
    await expect(caller().generateVerificationCode({ phone: "01012345678" })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(mocks.startPhoneChallenge).not.toHaveBeenCalled();
  });

  // Each asks for its own number: one code a minute per number holds across these tests.
  it("says when the number has no WhatsApp", async () => {
    mocks.startPhoneChallenge.mockResolvedValue(started);
    mocks.sendMessageNow.mockRejectedValue(new WhatsAppApiError(400, 131026, false, "undeliverable"));
    await expect(caller().generateVerificationCode({ phone: "01112345678" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "الرقم ده مش عليه واتساب. اتأكد من الرقم وجرّب تاني.",
    });
  });

  it("asks to try later when Meta refuses for another reason", async () => {
    mocks.startPhoneChallenge.mockResolvedValue(started);
    mocks.sendMessageNow.mockRejectedValue(new WhatsAppApiError(401, 190, false, "token expired"));
    await expect(caller().generateVerificationCode({ phone: "01212345678" })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });
});

describe("typing the code back", () => {
  const confirm = (code: string) => caller().confirmVerificationCode({ verificationTicket: "7.ticket", code });

  it("verifies the challenge, reading Arabic-Indic digits as the same code", async () => {
    mocks.confirmPhoneChallenge.mockResolvedValue({ outcome: "verified", attemptsLeft: 5 });
    await expect(confirm("٤٨٢٩١٣")).resolves.toEqual({ verified: true });
    expect(mocks.confirmPhoneChallenge).toHaveBeenCalledWith("7.ticket", "482913");
  });

  it("says how many tries are left after a wrong code", async () => {
    mocks.confirmPhoneChallenge.mockResolvedValue({ outcome: "wrong", attemptsLeft: 3 });
    await expect(confirm("111111")).rejects.toMatchObject({ code: "BAD_REQUEST", message: "الكود غلط. فاضل 3 محاولات." });
    mocks.confirmPhoneChallenge.mockResolvedValue({ outcome: "wrong", attemptsLeft: 1 });
    await expect(confirm("111111")).rejects.toMatchObject({ message: "الكود غلط. فاضل محاولة واحدة." });
  });

  it("asks for a new code once the challenge is closed or expired", async () => {
    mocks.confirmPhoneChallenge.mockResolvedValue({ outcome: "closed", attemptsLeft: 0 });
    await expect(confirm("111111")).rejects.toMatchObject({ message: "جربت كتير بكود غلط. اطلب كود جديد." });
    mocks.confirmPhoneChallenge.mockResolvedValue({ outcome: "expired", attemptsLeft: 0 });
    await expect(confirm("111111")).rejects.toMatchObject({ message: "الكود انتهى. اطلب كود جديد." });
  });

  it("refuses anything but six digits before looking", async () => {
    await expect(confirm("12345")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(confirm("12345a")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.confirmPhoneChallenge).not.toHaveBeenCalled();
  });
});
