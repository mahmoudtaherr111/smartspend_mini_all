/**
 * The phone challenge against a real `whatsapp_otp_codes` (decision 0038): a code we send on WhatsApp, stored only as
 * an HMAC, typed back with the ticket of the screen that asked; five wrong codes close it, and the conditional
 * delete lets exactly one request spend a verified one.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { whatsappOtpCodes } from "../db/schema";
import {
  confirmPhoneChallenge,
  consumePhoneChallenge,
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

const wrongCode = (code: string) => (code === "000000" ? "111111" : "000000");

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
describe.runIf(process.env.RUN_DB_INTEGRATION === "1")("phone challenges", () => {
  beforeEach(cleanUp);
  afterAll(cleanUp);

  it("stores no code, only its hash", async () => {
    const started = await startPhoneChallenge(PHONE);
    expect(started.code).toMatch(/^\d{6}$/);
    const [row] = await db.select().from(whatsappOtpCodes).where(eq(whatsappOtpCodes.phone, PHONE));
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(started.code);
  });

  it("names a challenge only with a genuine ticket", async () => {
    const started = await startPhoneChallenge(PHONE);

    expect(await readPhoneChallenge(started.ticket)).toMatchObject({ phone: PHONE, verified: false, attempts: 0 });
    const [id, mac] = started.ticket.split(".");
    expect(await readPhoneChallenge(`${id}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(await readPhoneChallenge(`${Number(id) + 1}.${mac}`)).toBeNull();
  });

  it("is verified by its code, and spent once", async () => {
    const started = await startPhoneChallenge(PHONE);
    const challenge = (await readPhoneChallenge(started.ticket))!;
    expect(await consumePhoneChallenge(challenge, { phone: PHONE })).toBe(false);

    expect(await confirmPhoneChallenge(started.ticket, started.code)).toEqual({ outcome: "verified", attemptsLeft: 5 });
    expect(await consumePhoneChallenge(challenge, { phone: PHONE })).toBe(true);
    expect(await consumePhoneChallenge(challenge, { phone: PHONE })).toBe(false);
    expect(await readPhoneChallenge(started.ticket)).toBeNull();
  });

  it("closes after five wrong codes, even for the right one after", async () => {
    const started = await startPhoneChallenge(PHONE);
    const wrong = wrongCode(started.code);
    for (const left of [4, 3, 2, 1]) {
      expect(await confirmPhoneChallenge(started.ticket, wrong)).toEqual({ outcome: "wrong", attemptsLeft: left });
    }
    expect(await confirmPhoneChallenge(started.ticket, wrong)).toEqual({ outcome: "closed", attemptsLeft: 0 });
    expect(await confirmPhoneChallenge(started.ticket, started.code)).toEqual({ outcome: "closed", attemptsLeft: 0 });
  });

  it("counts parallel guesses: no more than five are checked", async () => {
    const started = await startPhoneChallenge(PHONE);
    const wrong = wrongCode(started.code);
    await Promise.all(Array.from({ length: 12 }, () => confirmPhoneChallenge(started.ticket, wrong)));
    const [row] = await db.select().from(whatsappOtpCodes).where(eq(whatsappOtpCodes.phone, PHONE));
    expect(row.attempts).toBe(5);
    expect(row.verified).toBe(false);
  });

  it("cannot be spent for another number", async () => {
    const started = await startPhoneChallenge(PHONE);
    const challenge = (await readPhoneChallenge(started.ticket))!;
    await confirmPhoneChallenge(started.ticket, started.code);

    expect(await consumePhoneChallenge(challenge, { phone: OTHER_PHONE })).toBe(false);
    expect(await consumePhoneChallenge({ id: challenge.id, phone: OTHER_PHONE })).toBe(false);
    expect(await consumePhoneChallenge(challenge, { phone: PHONE })).toBe(true);
  });

  it("expires, and the nightly cleanup deletes it", async () => {
    const started = await startPhoneChallenge(PHONE);
    const later = new Date(Date.now() + 11 * 60 * 1000);
    expect(await readPhoneChallenge(started.ticket, later)).toBeNull();
    expect(await confirmPhoneChallenge(started.ticket, started.code, later)).toEqual({ outcome: "expired", attemptsLeft: 0 });

    const challenge = await db.select().from(whatsappOtpCodes).where(eq(whatsappOtpCodes.phone, PHONE));
    await purgeExpiredPhoneChallenges(later);
    expect(await db.select().from(whatsappOtpCodes).where(eq(whatsappOtpCodes.id, challenge[0].id))).toEqual([]);
  });
});
