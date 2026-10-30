/**
 * Proving a phone number before a sign-up, a WhatsApp sign-in or a phone change (decision 0038).
 *
 * We send a six-digit code to the number's WhatsApp in Meta's authentication template, and the person types it back:
 * delivery to that WhatsApp account proves the number, even when the person hides it behind a username. Only an HMAC
 * of the code is stored; five wrong codes close the challenge. The ticket stays with the screen that started it, and
 * only the ticket turns a verified challenge into an account or a session, once.
 *
 * A challenge is a row of `whatsapp_otp_codes`, so every replica sees the same state:
 *
 *   started ── the right code typed with the ticket ──▶ verified
 *   verified ── the first request that presents the ticket ──▶ consumed (the row is deleted)
 *   started ── five wrong codes ──▶ closed (a new code is needed)
 *   any state ── ten minutes ──▶ expired (the nightly cleanup deletes it)
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { whatsappOtpCodes } from "../../db/schema";
import { env } from "../lib/env";
import { db } from "../queries/connection";

export const PHONE_CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** Wrong codes a challenge accepts before it closes. */
export const PHONE_CHALLENGE_MAX_ATTEMPTS = 5;

type Writer = Pick<typeof db, "delete">;

export interface PhoneChallenge {
  id: number;
  phone: string;
  verified: boolean;
  attempts: number;
  expiresAt: Date;
}

export interface StartedChallenge {
  /** The code to send on WhatsApp; never returned to the screen and never stored. */
  code: string;
  ticket: string;
  expiresAt: Date;
}

/** Its own key, so neither a ticket nor a code hash can be mistaken for anything else signed with `JWT_SECRET`. */
function challengeKey(): Buffer {
  return createHmac("sha256", env.JWT_SECRET).update("smartspend:phone-challenge:v2").digest();
}

function hmac(text: string): string {
  return createHmac("sha256", challengeKey()).update(text).digest("base64url");
}

function codeHash(phone: string, code: string): string {
  return createHmac("sha256", challengeKey()).update(`code:${phone}:${code}`).digest("hex");
}

function ticketFor(row: { id: number; phone: string; codeHash: string }): string {
  return `${row.id}.${hmac(`ticket:${row.id}:${row.phone}:${row.codeHash}`)}`;
}

function sameText(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function idOf(ticket: string): number | null {
  const match = /^(\d{1,12})\.[A-Za-z0-9_-]{43}$/.exec(ticket);
  return match ? Number(match[1]) : null;
}

/** Six digits, leading zeros included. */
export function newVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Opens a challenge for a number that `validatePhone` accepted and `cleanPhoneNumber` normalised. */
export async function startPhoneChallenge(phone: string, now = new Date()): Promise<StartedChallenge> {
  const expiresAt = new Date(now.getTime() + PHONE_CHALLENGE_TTL_MS);
  const code = newVerificationCode();
  const hash = codeHash(phone, code);
  const [row] = await db
    .insert(whatsappOtpCodes)
    .values({ phone, codeHash: hash, attempts: 0, verified: false, expiresAt })
    .$returningId();
  return { code, ticket: ticketFor({ id: row.id, phone, codeHash: hash }), expiresAt };
}

/** The challenge a ticket names, if the ticket is genuine and the challenge still open. */
export async function readPhoneChallenge(ticket: string, now = new Date()): Promise<PhoneChallenge | null> {
  const id = idOf(ticket);
  if (id === null) return null;
  const [row] = await db.select().from(whatsappOtpCodes).where(eq(whatsappOtpCodes.id, id)).limit(1);
  if (!row || row.expiresAt <= now) return null;
  if (!sameText(ticket, ticketFor(row))) return null;
  return { id: row.id, phone: row.phone, verified: row.verified, attempts: row.attempts, expiresAt: row.expiresAt };
}

export type ConfirmOutcome = "verified" | "wrong" | "closed" | "expired";

/**
 * Checks the code the person typed against the challenge the ticket names. A wrong code is counted in the same
 * statement that checks the limit, so parallel guesses cannot pass five.
 */
export async function confirmPhoneChallenge(
  ticket: string,
  code: string,
  now = new Date(),
): Promise<{ outcome: ConfirmOutcome; attemptsLeft: number }> {
  const id = idOf(ticket);
  const [row] = id === null ? [] : await db.select().from(whatsappOtpCodes).where(eq(whatsappOtpCodes.id, id)).limit(1);
  if (!row || row.expiresAt <= now || !sameText(ticket, ticketFor(row))) return { outcome: "expired", attemptsLeft: 0 };
  if (row.verified) return { outcome: "verified", attemptsLeft: PHONE_CHALLENGE_MAX_ATTEMPTS - row.attempts };
  if (row.attempts >= PHONE_CHALLENGE_MAX_ATTEMPTS) return { outcome: "closed", attemptsLeft: 0 };

  if (/^\d{6}$/.test(code) && sameText(codeHash(row.phone, code), row.codeHash)) {
    await db
      .update(whatsappOtpCodes)
      .set({ verified: true })
      .where(and(eq(whatsappOtpCodes.id, row.id), lt(whatsappOtpCodes.attempts, PHONE_CHALLENGE_MAX_ATTEMPTS)));
    return { outcome: "verified", attemptsLeft: PHONE_CHALLENGE_MAX_ATTEMPTS - row.attempts };
  }

  const [counted] = await db
    .update(whatsappOtpCodes)
    .set({ attempts: sql`${whatsappOtpCodes.attempts} + 1` })
    .where(and(eq(whatsappOtpCodes.id, row.id), lt(whatsappOtpCodes.attempts, PHONE_CHALLENGE_MAX_ATTEMPTS)));
  const countedNow = Number((counted as { affectedRows?: number }).affectedRows ?? 0) === 1;
  const attemptsLeft = countedNow ? Math.max(0, PHONE_CHALLENGE_MAX_ATTEMPTS - row.attempts - 1) : 0;
  return { outcome: attemptsLeft === 0 ? "closed" : "wrong", attemptsLeft };
}

/**
 * Spends a verified challenge. The delete is conditional on the row still being verified and open, so of two
 * requests presenting the same ticket exactly one gets `true`; the other, and any later one, gets `false`.
 *
 * `phone`, when given, must be the challenge's: a sign-up cannot borrow the proof of another number. Pass the
 * transaction the account is created in, so a failed insert gives the challenge back.
 */
export async function consumePhoneChallenge(
  challenge: Pick<PhoneChallenge, "id" | "phone">,
  options: { phone?: string; tx?: Writer; now?: Date } = {},
): Promise<boolean> {
  if (options.phone !== undefined && options.phone !== challenge.phone) return false;
  const [result] = await (options.tx ?? db)
    .delete(whatsappOtpCodes)
    .where(
      and(
        eq(whatsappOtpCodes.id, challenge.id),
        eq(whatsappOtpCodes.phone, challenge.phone),
        eq(whatsappOtpCodes.verified, true),
        gt(whatsappOtpCodes.expiresAt, options.now ?? new Date()),
      ),
    );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

/** Nightly: challenges nobody finished. */
export async function purgeExpiredPhoneChallenges(now = new Date()): Promise<void> {
  await db.delete(whatsappOtpCodes).where(lt(whatsappOtpCodes.expiresAt, now));
}

export const __testing = { idOf, codeHash, ticketFor };
