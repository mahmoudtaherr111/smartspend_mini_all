import { db } from "../queries/connection";
import {
  users,
  localUsers,
  proSubscriptions,
  userAnalytics,
} from "../../db/schema";
import { eq } from "drizzle-orm";
import { getBillingPlan, type BillingPlan } from "../../contracts/plans";

export type { BillingPlan } from "../../contracts/plans";

/** Activates Pro on the user row and inserts an active subscription row. */
export async function grantProSubscription(input: {
  userId: number;
  userType: "oauth" | "local";
  plan: BillingPlan;
  paymentMethod: string;
  transactionId: string;
}) {
  const existing = await db
    .select({ id: proSubscriptions.id, endDate: proSubscriptions.endDate })
    .from(proSubscriptions)
    .where(eq(proSubscriptions.transactionId, input.transactionId))
    .limit(1);
  if (existing.length > 0) {
    return { endDate: existing[0].endDate ?? new Date(), alreadyProcessed: true };
  }

  const billingPlan = getBillingPlan(input.plan);
  const endDate = new Date();
  if (billingPlan.duration === "month") endDate.setMonth(endDate.getMonth() + 1);
  else endDate.setFullYear(endDate.getFullYear() + 1);

  await db.insert(proSubscriptions).values({
    userId: input.userId,
    userType: input.userType,
    plan: input.plan,
    status: "active",
    startDate: new Date(),
    endDate,
    paymentMethod: input.paymentMethod,
    transactionId: input.transactionId,
  });

  const table = input.userType === "oauth" ? users : localUsers;
  await db
    .update(table)
    .set({ plan: billingPlan.entitlement })
    .where(eq(table.id, input.userId));

  await db
    .insert(userAnalytics)
    .values({
      userId: input.userId,
      userType: input.userType,
      event: billingPlan.entitlement === "ultra" ? "upgrade_to_ultra" : "upgrade_to_pro",
      metadata: { plan: input.plan, transactionId: input.transactionId },
    })
    .catch(() => {});

  return { endDate };
}
