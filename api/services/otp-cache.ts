// SmartSpend In-Memory Security & Performance Cache for WhatsApp OTP
import { validatePhone, cleanPhoneNumber } from "../local-auth-utils";

interface OtpSession {
  code: string;
  phone: string;
  expiresAt: number;
  verified: boolean;
}

// In-memory store for active verification sessions (Key: clean phone number)
export const otpCache = new Map<string, OtpSession>();

// In-memory store for IP and Phone rate limits
export const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

// In-memory store for blocked WhatsApp senders (Anti Brute-Force)
export const blocklist = new Map<string, { attempts: number; blockUntil: number }>();

/**
 * Checks if a phone number or IP address is currently rate-limited
 */
export function checkRateLimit(ip: string, phone: string): { allowed: boolean; message?: string } {
  const now = Date.now();

  // Rate limit by Phone: Max 1 code request per 60 seconds
  const phoneKey = `phone:${phone}`;
  const phoneLimit = rateLimitCache.get(phoneKey);
  if (phoneLimit && now < phoneLimit.resetTime) {
    const waitSeconds = Math.ceil((phoneLimit.resetTime - now) / 1000);
    return { allowed: false, message: `برجاء الانتظار ${waitSeconds} ثانية قبل طلب كود جديد` };
  }

  // Rate limit by IP: Max 5 code requests per 10 minutes
  const ipKey = `ip:${ip}`;
  const ipLimit = rateLimitCache.get(ipKey);
  if (ipLimit) {
    if (now > ipLimit.resetTime) {
      // Reset window
      rateLimitCache.set(ipKey, { count: 1, resetTime: now + 10 * 60 * 1000 });
    } else {
      if (ipLimit.count >= 5) {
        const waitMinutes = Math.ceil((ipLimit.resetTime - now) / (60 * 1000));
        return { allowed: false, message: `لقد تجاوزت الحد الأقصى للطلبات من جهازك. حاول مرة أخرى بعد ${waitMinutes} دقيقة` };
      }
      ipLimit.count += 1;
    }
  } else {
    rateLimitCache.set(ipKey, { count: 1, resetTime: now + 10 * 60 * 1000 });
  }

  // Set next allowed time for phone
  rateLimitCache.set(phoneKey, { count: 1, resetTime: now + 60 * 1000 });

  return { allowed: true };
}

/**
 * Checks if a sender JID/LID is blocked due to excessive wrong code submissions
 */
export function isSenderBlocked(sender: string): boolean {
  const now = Date.now();
  const block = blocklist.get(sender);
  if (block && now < block.blockUntil) {
    return true;
  }
  return false;
}

/**
 * Records a failed OTP verification attempt for a sender
 */
export function recordWrongAttempt(sender: string) {
  const now = Date.now();
  const block = blocklist.get(sender);
  if (block) {
    if (block.blockUntil > 0 && now > block.blockUntil) {
      // Reset attempts if the previous block period has passed
      blocklist.set(sender, { attempts: 1, blockUntil: 0 });
    } else {
      block.attempts += 1;
      if (block.attempts >= 3) {
        // Block for 15 minutes
        block.blockUntil = now + 15 * 60 * 1000;
        console.log(`[WhatsApp Blocklist] Sender ${sender} blocked for 15 minutes due to 3 failed attempts.`);
      }
    }
  } else {
    blocklist.set(sender, { attempts: 1, blockUntil: 0 });
  }
}
