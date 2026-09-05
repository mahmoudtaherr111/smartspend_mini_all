import { db } from "../queries/connection";
import { proSubscriptions, users, localUsers } from "../../db/schema";
import { and, eq, lte, or, inArray, gt } from "drizzle-orm";
import { bumpAuthVersion } from "../lib/session-validation";

/**
 * Daily cron job to expire pro subscriptions and downgrade users to free (§3.4 Decision 3).
 * Offloads subscription expiry check from the hot request path.
 */
export async function runSubscriptionExpiryJob(): Promise<{
  expiredCount: number;
}> {
  const now = new Date();

  // Find active or cancelled subscriptions past their end date
  const expiredSubs = await db
    .select({
      id: proSubscriptions.id,
      userId: proSubscriptions.userId,
      userType: proSubscriptions.userType,
    })
    .from(proSubscriptions)
    .where(
      and(
        or(
          eq(proSubscriptions.status, "active"),
          eq(proSubscriptions.status, "cancelled"),
        ),
        lte(proSubscriptions.endDate, now),
      ),
    )
    .limit(500);

  if (expiredSubs.length === 0) {
    return { expiredCount: 0 };
  }

  const expiredIds = expiredSubs.map((s) => s.id);

  // 1. Mark subscriptions as expired in bulk
  await db
    .update(proSubscriptions)
    .set({ status: "expired" })
    .where(inArray(proSubscriptions.id, expiredIds));

  // 2. For each user, check if they have an active renewal subscription before downgrading
  const userMap = new Map<string, { userId: number; userType: "oauth" | "local" }>();
  for (const sub of expiredSubs) {
    const key = `${sub.userType}:${sub.userId}`;
    if (!userMap.has(key)) {
      userMap.set(key, { userId: sub.userId, userType: sub.userType as "oauth" | "local" });
    }
  }

  for (const { userId, userType } of userMap.values()) {
    try {
      const activeRenewals = await db
        .select({ id: proSubscriptions.id })
        .from(proSubscriptions)
        .where(
          and(
            eq(proSubscriptions.userId, userId),
            eq(proSubscriptions.userType, userType),
            eq(proSubscriptions.status, "active"),
            gt(proSubscriptions.endDate, now),
          ),
        )
        .limit(1);

      if (activeRenewals.length > 0) {
        console.log(
          `[SubscriptionExpiryJob] User ${userType}:${userId} has active renewal subscription (${activeRenewals[0].id}). Skipping downgrade.`,
        );
        continue;
      }

      const table = userType === "oauth" ? users : localUsers;
      await db
        .update(table)
        .set({ plan: "free" })
        .where(eq(table.id, userId));

      await bumpAuthVersion(userType, userId);
    } catch (err) {
      console.error(
        `[SubscriptionExpiryJob] Failed to process downgrade for user ${userType}:${userId}:`,
        err,
      );
    }
  }

  console.log(
    `[SubscriptionExpiryJob] Successfully processed ${expiredSubs.length} expired subscriptions.`,
  );

  return { expiredCount: expiredSubs.length };
}
