/**
 * Everything that changes what a signed-in user may do, in one place.
 *
 * A resolved principal is cached in Redis for up to fifteen minutes (`api/lib/session-validation.ts`), and
 * every read of that cache compares its `authver` with the counter for the user: bumping the counter kills
 * every cached session of that user at once, in constant time. That design only holds if every writer
 * remembers to bump — and three of them did not. An admin revoked a session and it kept answering for a
 * quarter of an hour; a role was taken away and the old role stayed; an expired subscriber kept a paid plan.
 *
 * So the bump is not something a caller remembers any more. Changing a role, changing a plan and ending a
 * session are the operations in this file, they always invalidate what they must, and
 * `tests/knowledge/architecture.test.ts` refuses a write to `role`, `plan` or `sessions` anywhere else.
 */
import { and, eq, lt } from "drizzle-orm";
import { localUsers, sessions, users } from "../../db/schema";
import { db } from "../queries/connection";

/** A Drizzle transaction, or the pool itself when the caller has none. */
type Writer = Pick<typeof db, "update">;
import { CacheKeys } from "./cache-keys";
import { cacheDel } from "./redis-client";
import { bumpAuthVersion, hashSessionToken, type SessionUserType } from "./session-validation";

export type UserRole = "user" | "moderator" | "admin";
export type UserPlan = "free" | "pro" | "ultra";

/**
 * The two identity tables are written by name rather than through a variable.
 *
 * `const table = userType === "oauth" ? users : localUsers` reads better and hides the write from static
 * analysis: the atlas then draws this module as touching no table at all, and the architecture model stops
 * being able to answer "who writes the plan". Naming both tables costs four lines and keeps the map true.
 */

/** The cache key of a stored session row, whichever column the row still carries the token in. */
function sessionCacheKey(row: { tokenHash: string | null; token: string | null }): string | null {
  if (row.tokenHash) return CacheKeys.session(row.tokenHash);
  if (row.token) return CacheKeys.session(hashSessionToken(row.token).hex);
  return null;
}

/**
 * Makes every cached session of a user resolve again from the database.
 *
 * For the writes that cannot go through the helpers below — a row written inside someone else's transaction,
 * a column that changes what a session carries — this is the one line that keeps the cache honest.
 */
export async function invalidatePrincipal(userType: SessionUserType, userId: number): Promise<void> {
  await bumpAuthVersion(userType, userId);
}

/**
 * Gives a user a role, and makes every session of theirs see it now.
 *
 * Role decides who reaches the admin console, so the fifteen minutes a cached principal would otherwise live
 * are fifteen minutes of access after it was taken away.
 */
export async function setRole(userType: SessionUserType, userId: number, role: UserRole): Promise<void> {
  if (userType === "oauth") {
    await db.update(users).set({ role }).where(eq(users.id, userId));
  } else {
    await db.update(localUsers).set({ role }).where(eq(localUsers.id, userId));
  }
  await bumpAuthVersion(userType, userId);
}

/**
 * Gives a user a plan — an upgrade, a downgrade or an expiry — and makes every session of theirs see it now.
 *
 * `tx` is for the caller who must write the plan atomically with something else, as granting a subscription
 * does: the row is written through the transaction, and the cache is invalidated the same way regardless. A
 * transaction that later rolls back costs the user's devices one extra database read and nothing else.
 */
export async function setPlan(
  userType: SessionUserType,
  userId: number,
  plan: UserPlan,
  options: { tx?: Writer } = {},
): Promise<void> {
  const writer = options.tx ?? db;
  if (userType === "oauth") {
    await writer.update(users).set({ plan }).where(eq(users.id, userId));
  } else {
    await writer.update(localUsers).set({ plan }).where(eq(localUsers.id, userId));
  }
  await bumpAuthVersion(userType, userId);
}

/**
 * Ends one session: the row, its cached principal, and the cached principals of that user's other devices.
 *
 * The exact cache key is deleted so the revoked token dies with the call. The bump is what makes it certain:
 * without it a replica that cached this principal under a key this process cannot name would keep answering.
 * The cost is one database read on the user's other devices, the next time each of them asks.
 *
 * `owner` scopes the lookup, so a caller acting for a user cannot reach someone else's session by id.
 */
export async function revokeSession(input: {
  sessionId: number;
  owner?: { userId: number; userType: SessionUserType };
}): Promise<boolean> {
  const row = await db.query.sessions.findFirst({
    where: input.owner
      ? and(
          eq(sessions.id, input.sessionId),
          eq(sessions.userId, input.owner.userId),
          eq(sessions.userType, input.owner.userType),
        )
      : eq(sessions.id, input.sessionId),
  });
  if (!row) return false;

  await db.delete(sessions).where(eq(sessions.id, row.id));
  const key = sessionCacheKey(row);
  if (key) await cacheDel(key);
  await bumpAuthVersion(row.userType, row.userId);
  return true;
}

/** Ends every session of one user: account deletion, a password change, "sign out everywhere". */
export async function revokeAllSessions(userType: SessionUserType, userId: number): Promise<number> {
  const rows = await db.query.sessions.findMany({
    where: and(eq(sessions.userId, userId), eq(sessions.userType, userType)),
  });
  if (rows.length === 0) {
    // Still bump: a principal may be cached from a row that has already gone.
    await bumpAuthVersion(userType, userId);
    return 0;
  }

  await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.userType, userType)));
  for (const row of rows) {
    const key = sessionCacheKey(row);
    if (key) await cacheDel(key);
  }
  await bumpAuthVersion(userType, userId);
  return rows.length;
}

/**
 * Signs one device out, and leaves the user's other devices alone.
 *
 * Deliberately no bump: the token is gone from the table and from the cache, so it cannot resolve again, and
 * a person signing out of one browser has not asked to be signed out of their phone.
 */
export async function revokeSessionByToken(token: string): Promise<void> {
  const { hex } = hashSessionToken(token);
  await cacheDel(CacheKeys.session(hex));
  await db.delete(sessions).where(eq(sessions.tokenHash, hex));
}

/**
 * Removes sessions that have already expired.
 *
 * No cache work: a cached principal carries its own expiry and is refused once it passes, so these rows are
 * housekeeping rather than access control.
 */
export async function purgeExpiredSessions(now: Date = new Date()): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
