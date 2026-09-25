import { describe, expect, it } from "vitest";
import { budgetCycle, budgetStanding, dueBudgetAlerts, type BudgetRow } from "./budget-status";

const budget = (overrides: Partial<BudgetRow> = {}): BudgetRow => ({
  id: 1,
  userId: 1,
  userType: "local",
  title: "أكل وشرب",
  category: "أكل وشرب",
  monthlyLimit: "1000",
  periodStartDay: 1,
  linkedGoalId: null,
  status: "active",
  alertThresholdPercent: 80,
  metadata: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: null,
  ...overrides,
});

describe("a budget's cycle", () => {
  it("runs from its start day to the same day next month, in Cairo days", () => {
    const cycle = budgetCycle(new Date("2026-09-20T10:00:00Z"), 25);
    expect(cycle.startDate.toISOString()).toBe("2026-08-24T21:00:00.000Z");
    expect(cycle.endDate.toISOString()).toBe("2026-09-24T21:00:00.000Z");
  });
});

describe("a budget's standing", () => {
  const cycle = { startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-10-01T00:00:00Z") };
  const rows = [
    { category: "أكل وشرب", amount: "600", date: new Date("2026-09-05T10:00:00Z") },
    { category: "أكل وشرب", amount: "250", date: new Date("2026-09-10T10:00:00Z") },
    { category: "مواصلات", amount: "400", date: new Date("2026-09-10T10:00:00Z") },
    { category: "أكل وشرب", amount: "900", date: new Date("2026-08-28T10:00:00Z") },
  ];

  it("counts its category's spending in the cycle", () => {
    const status = budgetStanding(budget(), rows, cycle);
    expect(status.currentSpent).toBe(850);
    expect(status.percentage).toBe(85);
    expect(status.isNearLimit).toBe(true);
    expect(status.isExceeded).toBe(false);
  });

  it("counts all spending when it names no category", () => {
    expect(budgetStanding(budget({ category: null }), rows, cycle).currentSpent).toBe(1250);
  });

  it("warns once near the limit and once past it", () => {
    const near = budgetStanding(budget(), rows, cycle);
    expect(dueBudgetAlerts(near, [])).toEqual(["near_limit"]);
    expect(dueBudgetAlerts(near, ["near_limit"])).toEqual([]);
    const over = budgetStanding(budget({ monthlyLimit: "800" }), rows, cycle);
    expect(dueBudgetAlerts(over, ["near_limit"])).toEqual(["exceeded"]);
    expect(dueBudgetAlerts(over, ["near_limit", "exceeded"])).toEqual([]);
    expect(dueBudgetAlerts({ ...over, status: "paused" }, [])).toEqual([]);
  });
});
