import { db } from "../queries/connection";
import { proSubscriptions } from "../../db/schema";
import { and, eq, lte, or, inArray, gt } from "drizzle-orm";
import { setPlan } from "../lib/access-control";
import { createLogger } from "../lib/log";

const log = createLogger("subscription-expiry");
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which reminder a subscription ending at `endDate` is due today, for a job that runs once a
 * day: three days before, then the last day. Each window is one day wide, so each reminder
 * is sent once without anything being recorded.
 */
export function renewalReminderDue(endDate: Date, now: Date): 3 | 1 | null {
  const left = endDate.getTime() - now.getTime();
  if (left > 2 * DAY_MS && left <= 3 * DAY_MS) return 3;
  if (left > 0 && left <= DAY_MS) return 1;
  return null;
}

/** Tells users whose plan ends in three days, or tomorrow, so they can renew before it lapses. */
export async function runRenewalReminders(now = new Date()): Promise<number> {
  const ending = await db
    .select({
      userId: proSubscriptions.userId,
      userType: proSubscriptions.userType,
      plan: proSubscriptions.plan,
      endDate: proSubscriptions.endDate,
    })
    .from(proSubscriptions)
    .where(
      and(
        or(eq(proSubscriptions.status, "active"), eq(proSubscriptions.status, "cancelled")),
        gt(proSubscriptions.endDate, now),
        lte(proSubscriptions.endDate, new Date(now.getTime() + 3 * DAY_MS)),
      ),
    )
    .limit(1000);

  const { triggerEventNotification } = await import("../notification-engine");
  let sent = 0;
  for (const sub of ending) {
    const days = renewalReminderDue(sub.endDate, now);
    if (!days) continue;
    // A renewal already paid for runs past this one: nothing is ending.
    const [later] = await db
      .select({ id: proSubscriptions.id })
      .from(proSubscriptions)
      .where(
        and(
          eq(proSubscriptions.userId, sub.userId),
          eq(proSubscriptions.userType, sub.userType),
          eq(proSubscriptions.status, "active"),
          gt(proSubscriptions.endDate, sub.endDate),
        ),
      )
      .limit(1);
    if (later) continue;
    try {
      await triggerEventNotification(
        "subscription_ending",
        { id: sub.userId, type: sub.userType },
        {
          planName: sub.plan.startsWith("ultra") ? "Ultra" : "Pro",
          daysLeft: days === 1 ? "بكرة" : "بعد 3 أيام",
        },
        "/pro",
      );
      sent += 1;
    } catch (err) {
      log.warn({ userId: sub.userId, userType: sub.userType, err }, "renewal_reminder_failed");
    }
  }
  return sent;
}

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

      await setPlan(userType, userId, "free");
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
