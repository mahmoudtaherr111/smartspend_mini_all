import { describe, expect, it } from "vitest";
import { installmentProgress } from "./installments";

describe("installment progress", () => {
  it("adds recorded payments to the ones paid before the plan was added", () => {
    expect(installmentProgress({ monthlyAmount: 800, totalInstallments: 12, paidBefore: 3 }, 2)).toEqual({
      paid: 5, remaining: 7, remainingAmount: 5600, done: false,
    });
  });

  it("never counts past the last installment", () => {
    const progress = installmentProgress({ monthlyAmount: 500, totalInstallments: 6, paidBefore: 5 }, 4);
    expect(progress).toMatchObject({ paid: 6, remaining: 0, remainingAmount: 0, done: true });
  });
});
