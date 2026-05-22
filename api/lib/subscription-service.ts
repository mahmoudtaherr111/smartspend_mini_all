import { db } from "../queries/connection";
import { users, localUsers, proSubscriptions, userAnalytics } from "../../db/schema";
import { eq } from "drizzle-orm";

export type BillingPlan = "pro_monthly" | "pro_yearly";

/** Activates Pro on the user row and inserts an active subscription row. */
export async function grantProSubscription(input: {
  userId: number;
  userType: "oauth" | "local";
  plan: BillingPlan;
  paymentMethod: string;
  transactionId: string;
}) {
  const endDate = new Date();
  if (input.plan === "pro_monthly") endDate.setMonth(endDate.getMonth() + 1);
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
  await db.update(table).set({ plan: "pro" }).where(eq(table.id, input.userId));

  await db
    .insert(userAnalytics)
    .values({
      userId: input.userId,
      userType: input.userType,
      event: "upgrade_to_pro",
      metadata: { plan: input.plan, transactionId: input.transactionId },
    })
    .catch(() => {});

  return { endDate };
}
