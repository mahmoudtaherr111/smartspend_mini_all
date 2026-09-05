import { db } from "../queries/connection";
import {
  users,
  localUsers,
  proSubscriptions,
  userAnalytics,
} from "../../db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { getBillingPlan, type BillingPlan } from "../../contracts/plans";

export type { BillingPlan } from "../../contracts/plans";

/** Activates Pro on the user row and inserts an active subscription row. */
export async function grantProSubscription(input: {
  userId: number;
  userType: "oauth" | "local";
  plan: BillingPlan;
  paymentMethod: string;
  transactionId: string;
}): Promise<{ endDate: Date; alreadyProcessed: boolean }> {
  try {
    return await db.transaction(async (tx) => {
      // 1. Check idempotency: if transaction was already processed, return existing end date
      const existingTx = await tx
        .select({ id: proSubscriptions.id, endDate: proSubscriptions.endDate })
        .from(proSubscriptions)
        .where(eq(proSubscriptions.transactionId, input.transactionId))
        .limit(1);

      if (existingTx.length > 0) {
        return {
          endDate: existingTx[0].endDate ?? new Date(),
          alreadyProcessed: true,
        };
      }

      // 2. Query active subscription to preserve remaining active duration on early renewal
      const now = new Date();
      const activeSubs = await tx
        .select({ id: proSubscriptions.id, endDate: proSubscriptions.endDate })
        .from(proSubscriptions)
        .where(
          and(
            eq(proSubscriptions.userId, input.userId),
            eq(proSubscriptions.userType, input.userType),
            eq(proSubscriptions.status, "active"),
            gt(proSubscriptions.endDate, now),
          ),
        )
        .orderBy(desc(proSubscriptions.endDate))
        .limit(1);

      const billingPlan = getBillingPlan(input.plan);
      // If user has an active subscription that hasn't expired yet, extend from its endDate
      const baseDate =
        activeSubs.length > 0 && activeSubs[0].endDate && new Date(activeSubs[0].endDate) > now
          ? new Date(activeSubs[0].endDate)
          : new Date(now);

      const endDate = new Date(baseDate);
      if (billingPlan.duration === "month") {
        endDate.setMonth(endDate.getMonth() + 1);
      } else {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      // 3. Insert new subscription record
      await tx.insert(proSubscriptions).values({
        userId: input.userId,
        userType: input.userType,
        plan: input.plan,
        status: "active",
        startDate: now,
        endDate,
        paymentMethod: input.paymentMethod,
        transactionId: input.transactionId,
      });

      // 4. Update user entitlement tier
      const table = input.userType === "oauth" ? users : localUsers;
      await tx
        .update(table)
        .set({ plan: billingPlan.entitlement })
        .where(eq(table.id, input.userId));

      const { bumpAuthVersion } = await import("./session-validation");
      await bumpAuthVersion(input.userType, input.userId);

      // 5. Track analytics event
      await tx
        .insert(userAnalytics)
        .values({
          userId: input.userId,
          userType: input.userType,
          event:
            billingPlan.entitlement === "ultra"
              ? "upgrade_to_ultra"
              : "upgrade_to_pro",
          metadata: { plan: input.plan, transactionId: input.transactionId },
        })
        .catch(() => {});

      return { endDate, alreadyProcessed: false };
    });
  } catch (error: any) {
    // Gracefully handle duplicate key race condition
    if (
      error?.code === "ER_DUP_ENTRY" ||
      error?.message?.includes("Duplicate entry") ||
      error?.message?.includes("UNIQUE constraint failed")
    ) {
      const existing = await db
        .select({ id: proSubscriptions.id, endDate: proSubscriptions.endDate })
        .from(proSubscriptions)
        .where(eq(proSubscriptions.transactionId, input.transactionId))
        .limit(1);

      if (existing.length > 0) {
        return {
          endDate: existing[0].endDate ?? new Date(),
          alreadyProcessed: true,
        };
      }
    }
    throw error;
  }
}
