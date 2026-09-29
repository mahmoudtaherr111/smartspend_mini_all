/**
 * The WhatsApp service's sender blocklist. The service runs in one process by design, so memory is the right place
 * for it: three codes that do not belong to the sender block that sender for fifteen minutes.
 *
 * The phone codes that used to live here are shared state now: sign-up and WhatsApp sign-in challenges are rows of
 * `whatsapp_otp_codes` (`api/services/phone-challenge.ts`), and the codes of a phone-number change are kept with
 * `stateSet` in `api/lib/redis-client.ts` by `profile.requestPhoneChange`, so the confirmation may reach any replica.
 */
import { createLogger, phoneTail } from "../lib/log";

const log = createLogger("otp-cache");

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
