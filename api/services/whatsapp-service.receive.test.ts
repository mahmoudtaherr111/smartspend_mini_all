/**
 * A code sent to the bot verifies a challenge only when it comes from the challenge's own number, and whoever
 * watches the challenge learns the outcome without either number: the old "fraud" event carried both.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openChallengesWithCode: vi.fn(),
  markPhoneChallengeVerified: vi.fn(),
}));

vi.mock("./phone-challenge", () => ({
  openChallengesWithCode: mocks.openChallengesWithCode,
  markPhoneChallengeVerified: mocks.markPhoneChallengeVerified,
}));

import { otpEvents, receiveVerificationCode } from "./whatsapp-service";

const open = (id: number, phone: string) => ({
  id,
  phone,
  code: "SS-123456",
  verified: false,
  expiresAt: new Date(Date.now() + 60_000),
});

function eventsFor(id: number): unknown[] {
  const seen: unknown[] = [];
  otpEvents.on(`challenge:${id}`, (event) => seen.push(event));
  return seen;
}

beforeEach(() => {
  vi.clearAllMocks();
  otpEvents.removeAllListeners();
  mocks.markPhoneChallengeVerified.mockResolvedValue(true);
});

describe("a code arriving on WhatsApp", () => {
  it("verifies the challenge when the sender is its number", async () => {
    mocks.openChallengesWithCode.mockResolvedValue([open(7, "01012345678")]);
    const events = eventsFor(7);

    await expect(receiveVerificationCode("SS-123456", "01012345678")).resolves.toBe("verified");
    expect(mocks.markPhoneChallengeVerified).toHaveBeenCalledWith(7);
    expect(events).toEqual([{ status: "verified" }]);
  });

  it("does not verify a code sent from another number, and tells the page without either number", async () => {
    mocks.openChallengesWithCode.mockResolvedValue([open(8, "01012345678")]);
    const events = eventsFor(8);

    await expect(receiveVerificationCode("SS-123456", "01122223333")).resolves.toBe("wrong_sender");
    expect(mocks.markPhoneChallengeVerified).not.toHaveBeenCalled();
    expect(events).toEqual([{ status: "wrong_sender" }]);
    expect(JSON.stringify(events)).not.toMatch(/\d{4,}/);
  });

  it("picks the challenge that belongs to the sender when two share a code", async () => {
    mocks.openChallengesWithCode.mockResolvedValue([open(9, "01099999999"), open(10, "01012345678")]);

    await expect(receiveVerificationCode("SS-123456", "01012345678")).resolves.toBe("verified");
    expect(mocks.markPhoneChallengeVerified).toHaveBeenCalledWith(10);
  });

  it("ignores a sender after three codes that were not theirs", async () => {
    mocks.openChallengesWithCode.mockResolvedValue([]);
    for (let i = 0; i < 3; i++) await receiveVerificationCode("SS-000000", "01055556666");

    await expect(receiveVerificationCode("SS-123456", "01055556666")).resolves.toBe("blocked");
  });
});
