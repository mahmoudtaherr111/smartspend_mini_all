/**
 * The phone challenge against a real `whatsapp_otp_codes`: the state every replica shares, the tokens that name a
 * challenge, and the conditional delete that lets exactly one request spend a verified one.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { whatsappOtpCodes } from "../db/schema";
import {
  consumePhoneChallenge,
  markPhoneChallengeVerified,
  openChallengesWithCode,
  purgeExpiredPhoneChallenges,
  readPhoneChallenge,
  startPhoneChallenge,
} from "../api/services/phone-challenge";

// Numbers no real account uses, so the suite can clean up after itself.
const PHONE = "01500000001";
const OTHER_PHONE = "01500000002";

async function cleanUp() {
  await db.delete(whatsappOtpCodes).where(like(whatsappOtpCodes.phone, "015000000%"));
}

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
describe.runIf(process.env.RUN_DB_INTEGRATION === "1")("phone challenges", () => {
  beforeEach(cleanUp);
  afterAll(cleanUp);

  it("names a challenge only with a genuine token of the right kind", async () => {
    const started = await startPhoneChallenge(PHONE);

    expect(await readPhoneChallenge(started.ticket, "ticket")).toMatchObject({ phone: PHONE, code: started.code, verified: false });
    expect(await readPhoneChallenge(started.watch, "watch")).toMatchObject({ phone: PHONE });
    // A watch token, which travels in a URL, cannot stand in for the ticket.
    expect(await readPhoneChallenge(started.watch, "ticket")).toBeNull();
    const [id, mac] = started.ticket.split(".");
    expect(await readPhoneChallenge(`${id}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`, "ticket")).toBeNull();
    expect(await readPhoneChallenge(`${Number(id) + 1}.${mac}`, "ticket")).toBeNull();
  });

  it("cannot be spent before the bot has seen the number send its code", async () => {
    const started = await startPhoneChallenge(PHONE);
    const challenge = (await readPhoneChallenge(started.ticket, "ticket"))!;

    expect(await consumePhoneChallenge(challenge, { phone: PHONE })).toBe(false);
  });

  it("is spent once: the second request with the same ticket gets nothing", async () => {
    const started = await startPhoneChallenge(PHONE);
    const challenge = (await readPhoneChallenge(started.ticket, "ticket"))!;
    expect(await markPhoneChallengeVerified(challenge.id)).toBe(true);

    expect(await consumePhoneChallenge(challenge, { phone: PHONE })).toBe(true);
    expect(await consumePhoneChallenge(challenge, { phone: PHONE })).toBe(false);
    expect(await readPhoneChallenge(started.ticket, "ticket")).toBeNull();
  });

  it("cannot be spent for another number", async () => {
    const started = await startPhoneChallenge(PHONE);
    const challenge = (await readPhoneChallenge(started.ticket, "ticket"))!;
    await markPhoneChallengeVerified(challenge.id);

    expect(await consumePhoneChallenge(challenge, { phone: OTHER_PHONE })).toBe(false);
    expect(await consumePhoneChallenge({ id: challenge.id, phone: OTHER_PHONE })).toBe(false);
    expect(await consumePhoneChallenge(challenge, { phone: PHONE })).toBe(true);
  });

  it("is found by the bot through its code until it is verified, and expires", async () => {
    const started = await startPhoneChallenge(PHONE);
    const [open] = await openChallengesWithCode(started.code);
    expect(open).toMatchObject({ phone: PHONE });

    await markPhoneChallengeVerified(open.id);
    expect(await openChallengesWithCode(started.code)).toEqual([]);

    const later = new Date(Date.now() + 11 * 60 * 1000);
    expect(await readPhoneChallenge(started.ticket, "ticket", later)).toBeNull();
    await purgeExpiredPhoneChallenges(later);
    expect(await db.select().from(whatsappOtpCodes).where(eq(whatsappOtpCodes.id, open.id))).toEqual([]);
  });
});
