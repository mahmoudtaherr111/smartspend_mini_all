import { verify } from "hono/jwt";
import { and, eq, gt, or } from "drizzle-orm";
import { createHash } from "crypto";
import { sessions } from "../../db/schema";
import { db } from "../queries/connection";
import { env } from "./env";
import { CacheKeys } from "./cache-keys";
import { cacheGet, cacheSet, cacheDel, cacheIncr } from "./redis-client";
import type { UnifiedUser } from "../context";

export type SessionUserType = "oauth" | "local";

export type ActiveSession = {
  userId: number;
  userType: SessionUserType;
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export type CachedSessionPayload = {
  user: UnifiedUser;
  authver: number;
  expiresAtMs: number;
};

function isSessionUserType(value: unknown): value is SessionUserType {
  return value === "oauth" || value === "local";
}

/**
 * SHA-256 session token hashing (Decision 3 / P1).
 * Returns both the 32-byte Buffer and 64-character lowercase hex representation.
 */
export function hashSessionToken(token: string): { binary: Buffer; hex: string } {
  const hash = createHash("sha256").update(token).digest();
  return {
    binary: hash,
    hex: hash.toString("hex"),
  };
}

/**
 * Gets the current auth version for a user.
 * Defaults to 1 if unset.
 */
export async function getAuthVersion(
  userType: string,
  userId: number | string,
): Promise<number> {
  const key = CacheKeys.authVer(userType, userId);
  const raw = await cacheGet(key);
  if (!raw) return 0;
  const num = parseInt(raw, 10);
  return Number.isSafeInteger(num) ? num : 0;
}

/**
 * Atomically bumps the auth version for a user (logout, password change, plan change).
 * Invalidates all existing cached sessions for this user without scanning keys.
 */
export async function bumpAuthVersion(
  userType: string,
  userId: number | string,
): Promise<number> {
  const key = CacheKeys.authVer(userType, userId);
  return cacheIncr(key);
}

/**
 * Reads cached UnifiedUser directly from Redis in O(1).
 * Returns null if missing, expired, or authver is stale.
 */
export async function getCachedResolvedSession(
  tokenHashHex: string,
): Promise<{ user: UnifiedUser; authver: number; expiresAt: Date } | null> {
  const key = CacheKeys.session(tokenHashHex);
  const raw = await cacheGet(key);
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as CachedSessionPayload;
    if (!payload || !payload.user) return null;

    // Check lifetime
    if (payload.expiresAtMs <= Date.now()) {
      await cacheDel(key);
      return null;
    }

    // Check auth version (immediate revocation)
    const currentAuthVer = await getAuthVersion(
      payload.user.type,
      payload.user.id,
    );
    if (payload.authver !== currentAuthVer) {
      // Stale authver (user logged out or changed plan/role)
      await cacheDel(key);
      return null;
    }

    return {
      user: payload.user,
      authver: payload.authver,
      expiresAt: new Date(payload.expiresAtMs),
    };
  } catch {
    await cacheDel(key);
    return null;
  }
}

/**
 * Caches the resolved UnifiedUser in Redis.
 * TTL is min(session remaining lifetime, 15 minutes).
 */
export async function cacheResolvedSession(
  tokenHashHex: string,
  user: UnifiedUser,
  expiresAt: Date,
  authver: number,
): Promise<void> {
  const key = CacheKeys.session(tokenHashHex);
  const remainingSecs = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  if (remainingSecs <= 0) return;

  const ttlSeconds = Math.min(remainingSecs, 15 * 60); // 15-minute sliding principal cache
  const payload: CachedSessionPayload = {
    user,
    authver,
    expiresAtMs: expiresAt.getTime(),
  };

  await cacheSet(key, ttlSeconds, JSON.stringify(payload));
}

/**
 * Invalidates session cache immediately (on logout).
 */
export async function invalidateCachedSession(
  token: string,
  userType?: string,
  userId?: number,
): Promise<void> {
  const { hex } = hashSessionToken(token);
  await cacheDel(CacheKeys.session(hex));
  if (userType && userId) {
    await bumpAuthVersion(userType, userId);
  }
}

/**
 * Verifies the signed JWT and checks database session by token_hash.
 * Fallback to plaintext token lookup for smooth rolling migration.
 */
export async function validateActiveSessionToken(
  token: string,
  expectedUserType?: SessionUserType,
): Promise<ActiveSession | null> {
  if (!token) return null;

  try {
    const payload = await verify(token, env.JWT_SECRET, "HS256");
    const userId = Number(payload?.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return null;

    const tokenUserType = payload?.userType;
    if (tokenUserType !== undefined && !isSessionUserType(tokenUserType)) return null;
    if (expectedUserType && tokenUserType && tokenUserType !== expectedUserType) return null;

    const userType = expectedUserType ?? (tokenUserType || "local");
    if (!isSessionUserType(userType)) return null;

    const { hex: tokenHashHex } = hashSessionToken(token);

    // Primary: lookup by tokenHash; Fallback: lookup by token
    const session = await db.query.sessions.findFirst({
      where: and(
        or(
          eq(sessions.tokenHash, tokenHashHex),
          eq(sessions.token, token),
        ),
        eq(sessions.userId, userId),
        eq(sessions.userType, userType),
        gt(sessions.expiresAt, new Date()),
      ),
    });

    if (!session) return null;

    return {
      userId,
      userType,
      token,
      tokenHash: session.tokenHash || tokenHashHex,
      expiresAt: new Date(session.expiresAt),
    };
  } catch {
    return null;
  }
}
