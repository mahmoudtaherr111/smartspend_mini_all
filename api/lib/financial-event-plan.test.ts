import { describe, expect, it } from "vitest";
import { planFinancialEvents } from "./financial-event-plan";

describe("filing destination in an ordinary money sentence", () => {
  it("keeps the expense and does not ask for an amount for its filing instruction", () => {
    const plan = planFinancialEvents(
      "اشتريت خشب للورشة بتلتمية، سجلها في حساب مشروع ورشة النجارة",
    );
    expect(plan.admitted.map((event) => event.amount)).toEqual([300]);
    expect(plan.pending).toHaveLength(0);
    expect(plan.events).toContainEqual(
      expect.objectContaining({ status: "rejected", reason: "instruction" }),
    );
  });
  it("retains genuinely unpriced financial clauses for clarification", () => {
    const plan = planFinancialEvents("اشتريت خشب بتلتمية، وسددت القسط");
    expect(plan.pending.length).toBeGreaterThan(0);
  });
});
