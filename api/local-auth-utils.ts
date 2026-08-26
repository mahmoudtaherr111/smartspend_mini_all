import { sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import { db } from "./queries/connection";
import { sessions } from "../db/schema";
import { env } from "./lib/env";
import { getClientIp, getIncomingHeader } from "./lib/get-client-ip";
import type { HonoRequest } from "hono";

type SessionRequest = HonoRequest | Request;

export type SessionMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

export function getSessionMetadata(req: SessionRequest): SessionMetadata {
  return {
    ipAddress: getClientIp(req),
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

export async function generateToken(
  userId: number,
  userType: "oauth" | "local",
): Promise<string> {
  return sign(
    { userId, userType, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    env.JWT_SECRET,
  );
}

export async function createSession(
  userId: number,
  userType: "oauth" | "local",
  token: string,
  metadata: SessionMetadata = {},
) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.insert(sessions).values({
    userId,
    userType,
    token,
    expiresAt,
    ipAddress: metadata.ipAddress || null,
    userAgent: metadata.userAgent || null,
  });
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.token, token));
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
  return "SS" + Math.random().toString(36).substring(2, 8).toUpperCase();
}
