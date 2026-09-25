import { describe, expect, it } from "vitest";
import { expenseToRollupDelta, ledgerAmount } from "./expense-rollups";

describe("the amount a ledger row stores", () => {
  it("stores a refund as a negative expense, so spending totals net it", () => {
    expect(ledgerAmount("expense", "incoming", 300)).toBe(-300);
    const delta = expenseToRollupDelta({
      userId: 1, userType: "local", date: "2026-09-25", type: "expense",
      amount: ledgerAmount("expense", "incoming", 300),
    });
    expect(Number(delta.expenseDelta)).toBe(-300);
  });

  it("keeps every other row positive", () => {
    expect(ledgerAmount("expense", "outgoing", 300)).toBe(300);
    expect(ledgerAmount("expense", null, "300")).toBe(300);
    expect(ledgerAmount("transfer", "incoming", 300)).toBe(300);
    expect(ledgerAmount("income", "incoming", 300)).toBe(300);
  });
});
