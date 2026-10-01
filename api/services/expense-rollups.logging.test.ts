import { describe, expect, it, vi } from "vitest";
const { warnings } = vi.hoisted(() => ({ warnings: [] as unknown[] }));
vi.mock("../lib/log", () => ({ createLogger: () => ({ warn: (record: unknown) => warnings.push(record) }), hideQueryValuesFromConsole: () => {} }));
import { applyExpenseRollupDelta } from "./expense-rollups";

describe("rollup alerts for refunds", () => {
  it("keeps a legitimate negative spending day without an alert, and never logs financial totals", async () => {
    warnings.length = 0;
    const row = { income: "0", expense: "-300", transfer: "0", investment: "0", automated_income: "0", automated_expense: "-300", txn_count: 1 };
    const executor = { execute: vi.fn().mockResolvedValueOnce([{}]).mockResolvedValueOnce([[row]]) };
    await applyExpenseRollupDelta(executor, { userId: 7, userType: "local", day: "2026-10-01", expenseDelta: "-300", txnCountDelta: 1 });
    expect(warnings).toHaveLength(0);
    executor.execute.mockResolvedValueOnce([{}]).mockResolvedValueOnce([[{ ...row, txn_count: -1 }]]);
    await applyExpenseRollupDelta(executor, { userId: 7, userType: "local", day: "2026-10-01", txnCountDelta: -1 });
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings)).not.toMatch(/300|income|expense|txn_count/);
  });
});
