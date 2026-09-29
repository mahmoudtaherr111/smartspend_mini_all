import { describe, expect, it } from "vitest";
import { installmentProgress, installmentProgressFromLinked } from "./installments";

describe("installment progress", () => {
  it("adds recorded payments to the ones paid before the plan was added", () => {
    expect(installmentProgress({ monthlyAmount: 800, totalInstallments: 12, paidBefore: 3 }, 2)).toEqual({
      paid: 5, remaining: 7, remainingAmount: 5600, done: false, countedBy: "keyword",
    });
  });

  it("never counts past the last installment", () => {
    const progress = installmentProgress({ monthlyAmount: 500, totalInstallments: 6, paidBefore: 5 }, 4);
    expect(progress).toMatchObject({ paid: 6, remaining: 0, remainingAmount: 0, done: true });
  });

  it("counts payments linked to due dates by amount: a partial one leaves the rest owed", () => {
    const plan = { monthlyAmount: 800, totalInstallments: 12, paidBefore: 3 };
    expect(installmentProgressFromLinked(plan, 500)).toMatchObject({ paid: 3, remaining: 9, remainingAmount: 6_700, done: false, countedBy: "linked" });
    expect(installmentProgressFromLinked(plan, 1_600)).toMatchObject({ paid: 5, remaining: 7, remainingAmount: 5_600 });
    // Paid off: never below zero, whatever was linked.
    expect(installmentProgressFromLinked(plan, 99_999)).toMatchObject({ paid: 12, remaining: 0, remainingAmount: 0, done: true });
  });
});
