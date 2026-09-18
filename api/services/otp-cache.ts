/**
 * What is left in process memory of the phone codes.
 *
 * - `otpCache` holds the codes of a phone-number change (`profile.requestPhoneChange`), which the bot sends to
 *   the new number and the user types back. Sign-up and WhatsApp sign-in no longer use it: their challenges live
 *   in `whatsapp_otp_codes`, shared by every replica (`api/services/phone-challenge.ts`).
 * - The sender blocklist belongs to the WhatsApp service, which runs in one process by design, so memory is the
 *   right place for it: three codes that do not belong to the sender block that sender for fifteen minutes.
 */
import { createLogger, phoneTail } from "../lib/log";

const log = createLogger("otp-cache");

interface OtpSession {
  code: string;
  phone: string;
  expiresAt: number;
  verified: boolean;
}

/** Phone-change codes, keyed by `phone-change:<userId>:<phone>` and `phone-grant:...`. */
export const otpCache = new Map<string, OtpSession>();

const BLOCK_AFTER = 3;
const BLOCK_MS = 15 * 60 * 1000;

const blocklist = new Map<string, { attempts: number; blockUntil: number; lastAt: number }>();

/** Forgets senders whose block ended and who have been quiet as long; the map would otherwise only grow. */
function pruneBlocklist(now: number): void {
  for (const [sender, entry] of blocklist) {
    if (entry.blockUntil <= now && now - entry.lastAt > BLOCK_MS) blocklist.delete(sender);
  }
}

/** Whether a sender is blocked for sending codes that were not theirs. */
export function isSenderBlocked(sender: string, now = Date.now()): boolean {
  const entry = blocklist.get(sender);
  return Boolean(entry && now < entry.blockUntil);
}

/** Counts a code the sender had no right to send; the third within the window blocks them. */
export function recordWrongAttempt(sender: string, now = Date.now()): void {
  pruneBlocklist(now);
  const entry = blocklist.get(sender);
  if (!entry || (entry.blockUntil > 0 && now > entry.blockUntil)) {
    blocklist.set(sender, { attempts: 1, blockUntil: 0, lastAt: now });
    return;
  }
  entry.attempts += 1;
  entry.lastAt = now;
  if (entry.attempts >= BLOCK_AFTER && entry.blockUntil <= now) {
    entry.blockUntil = now + BLOCK_MS;
    log.warn({ event: "whatsapp.sender_blocked", phone: phoneTail(sender) }, "Sender blocked for 15 minutes after 3 wrong codes");
  }
}
