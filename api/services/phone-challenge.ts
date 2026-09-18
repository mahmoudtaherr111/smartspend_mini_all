/**
 * Proving a phone number before a sign-up or a WhatsApp sign-in.
 *
 * The user sends a code from their own WhatsApp to the bot, and that inbound message is the proof — so the code
 * is a label, not a secret, and the page shows it. What must stay secret is the ticket: only the browser that
 * started the challenge holds it, and only the ticket turns a verified challenge into an account or a session,
 * once. Before this, `localAuth.verifyOtp` issued a session to anyone who sent a phone number and its code, the
 * sign-up accepted any number some browser had verified, and the whole state lived in one process's memory.
 *
 * A challenge is a row of `whatsapp_otp_codes`, so every replica sees the same state:
 *
 *   started ── the bot receives the code from the challenge's own number ──▶ verified
 *   verified ── the first request that presents the ticket ──▶ consumed (the row is deleted)
 *   any state ── ten minutes ──▶ expired (the nightly cleanup deletes it)
 *
 * Starting one returns two tokens, both HMACs of the row under a key derived from `JWT_SECRET`:
 *   - `ticket`, sent in a request body to `localAuth.register` or `localAuth.verifyOtp`;
 *   - `watch`, sent in the URL of `/api/sse/otp`, which can follow the challenge and do nothing else, so a URL
 *     that ends up in a proxy log gives nobody an account.
 *
 * The table's columns are the ones production already has; nothing here needs a migration.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { whatsappOtpCodes } from "../../db/schema";
import { env } from "../lib/env";
import { db } from "../queries/connection";

export const PHONE_CHALLENGE_TTL_MS = 10 * 60 * 1000;

type Purpose = "ticket" | "watch";
type Writer = Pick<typeof db, "delete">;

export interface PhoneChallenge {
  id: number;
  phone: string;
  code: string;
  verified: boolean;
  expiresAt: Date;
}

export interface StartedChallenge {
  code: string;
  ticket: string;
  watch: string;
  expiresAt: Date;
}

/** Its own key, so a ticket can never be mistaken for anything else signed with `JWT_SECRET`. */
function challengeKey(): Buffer {
  return createHmac("sha256", env.JWT_SECRET).update("smartspend:phone-challenge:v1").digest();
}

function signature(purpose: Purpose, row: Pick<PhoneChallenge, "id" | "phone" | "code">): string {
  return createHmac("sha256", challengeKey())
    .update(`${purpose}:${row.id}:${row.phone}:${row.code}`)
    .digest("base64url");
}

function tokenFor(purpose: Purpose, row: Pick<PhoneChallenge, "id" | "phone" | "code">): string {
  return `${row.id}.${signature(purpose, row)}`;
}

function sameSignature(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function idOf(token: string): number | null {
  const match = /^(\d{1,12})\.[A-Za-z0-9_-]{43}$/.exec(token);
  return match ? Number(match[1]) : null;
}

const newCode = () => `SS-${randomInt(100000, 1000000)}`;

/**
 * Opens a challenge for a number that `validatePhone` accepted and `cleanPhoneNumber` normalised.
 *
 * Its code differs from every other open challenge's, so the bot never has to guess which one a message means.
 */
export async function startPhoneChallenge(phone: string, now = new Date()): Promise<StartedChallenge> {
  const expiresAt = new Date(now.getTime() + PHONE_CHALLENGE_TTL_MS);
  let code = newCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const [taken] = await db
      .select({ id: whatsappOtpCodes.id })
      .from(whatsappOtpCodes)
      .where(and(eq(whatsappOtpCodes.code, code), gt(whatsappOtpCodes.expiresAt, now)))
      .limit(1);
    if (!taken) break;
    code = newCode();
  }
  const [row] = await db.insert(whatsappOtpCodes).values({ phone, code, verified: false, expiresAt }).$returningId();
  const saved = { id: row.id, phone, code };
  return { code, ticket: tokenFor("ticket", saved), watch: tokenFor("watch", saved), expiresAt };
}

/** The challenge a ticket or watch token names, if the token is genuine and the challenge still open. */
export async function readPhoneChallenge(token: string, purpose: Purpose, now = new Date()): Promise<PhoneChallenge | null> {
  const id = idOf(token);
  if (id === null) return null;
  const [row] = await db.select().from(whatsappOtpCodes).where(eq(whatsappOtpCodes.id, id)).limit(1);
  if (!row || row.expiresAt <= now) return null;
  if (!sameSignature(token.slice(token.indexOf(".") + 1), signature(purpose, row))) return null;
  return { id: row.id, phone: row.phone, code: row.code, verified: row.verified, expiresAt: row.expiresAt };
}

/** Open, unverified challenges carrying a code: what an inbound WhatsApp message may be answering. */
export async function openChallengesWithCode(code: string, now = new Date()): Promise<PhoneChallenge[]> {
  const rows = await db
    .select()
    .from(whatsappOtpCodes)
    .where(
      and(eq(whatsappOtpCodes.code, code), eq(whatsappOtpCodes.verified, false), gt(whatsappOtpCodes.expiresAt, now)),
    )
    .orderBy(desc(whatsappOtpCodes.id))
    .limit(5);
  return rows.map((row) => ({ id: row.id, phone: row.phone, code: row.code, verified: row.verified, expiresAt: row.expiresAt }));
}

/** Called by the bot once the sender is the challenge's number. */
export async function markPhoneChallengeVerified(id: number): Promise<boolean> {
  const [result] = await db
    .update(whatsappOtpCodes)
    .set({ verified: true })
    .where(and(eq(whatsappOtpCodes.id, id), eq(whatsappOtpCodes.verified, false)));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
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

export const __testing = { tokenFor, idOf };
