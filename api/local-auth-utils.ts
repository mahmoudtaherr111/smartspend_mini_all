import { sign } from "hono/jwt";
import { db } from "./queries/connection";
import { sessions } from "../db/schema";
import { env } from "./lib/env";
import { getClientIp, getIncomingHeader } from "./lib/get-client-ip";
import { createHash, randomBytes } from "crypto";
import type { HonoRequest } from "hono";

type SessionRequest = HonoRequest | Request;

export type SessionMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

export function getSessionMetadata(
  req: SessionRequest,
  resolvedIp?: string,
): SessionMetadata {
  return {
    ipAddress: resolvedIp || getClientIp(req),
    userAgent: getIncomingHeader(req, "user-agent")?.slice(0, 2_000),
  };
}

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(password, hash);
}

/** How long a session lives: the token's `exp`, the session row and the browser's cookie end together. */
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export async function generateToken(
  userId: number,
  userType: "oauth" | "local",
): Promise<string> {
  return sign(
    { userId, userType, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS },
    env.JWT_SECRET,
  );
}

/** Whether the request reached us over https, directly or through a proxy that says so. */
function arrivedOverHttps(req: SessionRequest): boolean {
  if (getIncomingHeader(req, "x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The website's session: an HttpOnly cookie, so no script on the page can read the token (the website never stores
 * it). `SameSite=Lax` and the origin check in `api/lib/http-origin-security.ts` keep other sites from using it;
 * `Secure` in production and whenever the request came over https. The mobile app keeps the token from the answer in
 * the Keychain or Keystore and sends it as a Bearer header instead.
 */
export function sessionCookie(token: string, req: SessionRequest): string {
  const secure = env.NODE_ENV === "production" || arrivedOverHttps(req) ? "; Secure" : "";
  return `smartspend_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

export async function createSession(
  userId: number,
  userType: "oauth" | "local",
  token: string,
  metadata: SessionMetadata = {},
) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const tokenHash = createHash("sha256").update(token).digest("hex");

  await db.insert(sessions).values({
    userId,
    userType,
    token: null,
    tokenHash,
    expiresAt,
    ipAddress: metadata.ipAddress || null,
    userAgent: metadata.userAgent || null,
  });
}

export async function invalidateSession(token: string) {
  // Signing out of one device: the token leaves the table and the cache, and the user's other devices are
  // left alone (api/lib/access-control.ts).
  const { revokeSessionByToken } = await import("./lib/access-control");
  await revokeSessionByToken(token);
}

// Smart phone validation for Egyptian numbers
export function cleanPhoneNumber(phone: string): string {
  // Convert Arabic numerals to English numerals
  const englishPhone = phone.replace(/[٠١٢٣٤٥٦٧٨٩]/g, function (d) {
    return (d.charCodeAt(0) - 1632).toString();
  });

  return englishPhone.replace(/\s/g, "").replace(/^\+?2/, "");
}

export function validatePhone(phone: string): {
  valid: boolean;
  message?: string;
} {
  const clean = cleanPhoneNumber(phone);

  if (!/^01[0-9]{9}$/.test(clean)) {
    return {
      valid: false,
      message: "رقم التليفون لازم يكون 11 رقم ويبدأ بـ 01",
    };
  }

  const prefix = clean.substring(0, 3);
  const validPrefixes = ["010", "011", "012", "015"];
  if (!validPrefixes.includes(prefix)) {
    return {
      valid: false,
      message: "أول 3 أرقام مش صحيحين. لازم يكونوا 010 أو 011 أو 012 أو 015",
    };
  }

  return { valid: true };
}

export function generateReferralCode(): string {
  return "SS" + randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
}
