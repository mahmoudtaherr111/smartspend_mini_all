/**
 * Canonical commercial plan contract.
 *
 * Amounts are stored in minor EGP units because Paymob's `amount_cents` field
 * is an integer.  The displayed Ultra price already present in the product UI
 * is therefore represented here rather than duplicated at checkout/webhook
 * boundaries.
 */
export const BILLING_PLANS = {
  pro_monthly: {
    id: "pro_monthly",
    entitlement: "pro",
    amountCents: 9_900,
    duration: "month",
    displayName: "SmartSpend Pro Monthly",
  },
  pro_yearly: {
    id: "pro_yearly",
    entitlement: "pro",
    amountCents: 99_000,
    duration: "year",
    displayName: "SmartSpend Pro Yearly",
  },
  ultra_monthly: {
    id: "ultra_monthly",
    entitlement: "ultra",
    amountCents: 25_000,
    duration: "month",
    displayName: "SmartSpend Ultra Monthly",
  },
} as const;

export type BillingPlan = keyof typeof BILLING_PLANS;
export type EntitlementPlan = (typeof BILLING_PLANS)[BillingPlan]["entitlement"];

export const BILLING_PLAN_IDS = [
  "pro_monthly",
  "pro_yearly",
  "ultra_monthly",
] as const satisfies readonly BillingPlan[];

export function isBillingPlan(value: unknown): value is BillingPlan {
  return typeof value === "string" && value in BILLING_PLANS;
}

export function getBillingPlan(plan: BillingPlan) {
  return BILLING_PLANS[plan];
}

/** Paymob must report the exact configured price; overpayment is not a plan upgrade. */
export function hasExactPlanAmount(plan: BillingPlan, amountCents: unknown): boolean {
  const configuredPlan = getBillingPlan(plan);
  return Boolean(configuredPlan)
    && Number.isInteger(Number(amountCents))
    && Number(amountCents) === configuredPlan.amountCents;
}
