import { describe, expect, it } from "vitest";
import {
  BILLING_PLAN_IDS,
  getBillingPlan,
  hasExactPlanAmount,
  isBillingPlan,
} from "../../contracts/plans";

describe("billing plan contract", () => {
  it("accepts every declared plan and only its canonical amount", () => {
    for (const planId of BILLING_PLAN_IDS) {
      const plan = getBillingPlan(planId);
      expect(isBillingPlan(planId)).toBe(true);
      expect(hasExactPlanAmount(planId, plan.amountCents)).toBe(true);
      expect(hasExactPlanAmount(planId, plan.amountCents - 1)).toBe(false);
      expect(hasExactPlanAmount(planId, plan.amountCents + 1)).toBe(false);
    }
  });

  it("does not fall back to a plan for unknown identifiers", () => {
    expect(isBillingPlan("pro_lifetime")).toBe(false);
    expect(getBillingPlan("pro_lifetime")).toBeUndefined();
    expect(hasExactPlanAmount("pro_lifetime", 9900)).toBe(false);
  });
});
