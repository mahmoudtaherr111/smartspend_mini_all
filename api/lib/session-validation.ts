import { verify } from "hono/jwt";
import { and, eq, gt } from "drizzle-orm";
import { sessions } from "../../db/schema";
import { db } from "../queries/connection";
import { env } from "./env";

export type SessionUserType = "oauth" | "local";

export type ActiveSession = {
  userId: number;
  userType: SessionUserType;
  token: string;
};

function isSessionUserType(value: unknown): value is SessionUserType {
  return value === "oauth" || value === "local";
}

/**
 * Verifies the signed token and its live database session in one canonical
 * place.  A JWT is never sufficient authentication on its own: logout and
 * session revocation remove the database row immediately.
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

    // Explicit cookie flows know their type.  The local default preserves
    // compatibility with existing pre-userType local tokens, while the DB
    // session check still prevents type confusion and revoked-token access.
    const userType = expectedUserType ?? (tokenUserType || "local");
    if (!isSessionUserType(userType)) return null;

    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.token, token),
        eq(sessions.userId, userId),
        eq(sessions.userType, userType),
        gt(sessions.expiresAt, new Date()),
      ),
    });

    return session ? { userId, userType, token } : null;
  } catch {
    return null;
  }
}
