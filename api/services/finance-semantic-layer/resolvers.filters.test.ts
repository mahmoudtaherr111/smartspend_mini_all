import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/env", () => ({ env: { REDIS_URL: undefined } }));

// Sixty rows of the period, newest first; what a question looks for sits deep in the list.
const rows = Array.from({ length: 60 }, (_, index) => ({
  id: index + 1,
  type: index === 57 ? "income" : "expense",
  amount: index === 54 ? "40.00" : index === 58 ? "-40.00" : String(100 + index),
  category: index % 2 ? "transport" : "food",
  subCategory: null,
  description: index === 54 ? "أوبر للشغل" : index === 20 || index === 50 ? "طلبات" : `حاجة ${index}`,
  rawText: null,
  placeHint: index === 20 || index === 50 ? "طلبات" : null,
  paymentMethod: null,
  contactId: null,
  date: new Date(Date.UTC(2026, 8, 28) - index * 3_600_000),
}));

vi.mock("../../queries/connection", () => {
  const query: Record<string, unknown> = {};
  for (const step of ["select", "from", "where", "orderBy"]) query[step] = () => query;
  query.limit = async () => rows;
  return { db: query };
});

import { getFinanceTransactions, getTextSpendingTotal } from "./resolvers";

const ctx = { userId: 7, userType: "local", referenceDate: new Date("2026-09-29T10:00:00Z") };

describe("finance filters apply before the list is cut", () => {
  it("finds an amount deep in the period, and a refund by its size", async () => {
    const found = await getFinanceTransactions(ctx, { period: "current_month", amount: 40, limit: 1 });
    // The fifty-fifth row: the call used to look at the latest thirty only and answer "not found".
    expect(found.transactions.map((tx) => tx.id)).toEqual([55]);
    expect(found.totalMatched).toBe(2);
    const byWords = await getFinanceTransactions(ctx, { period: "current_month", amount: 40, text: "أوبر", limit: 5 });
    expect(byWords.transactions.map((tx) => tx.id)).toEqual([55]);
  });

  it("totals every row a shop's name appears in, not the top entries of a breakdown", async () => {
    const total = await getTextSpendingTotal(ctx, "طلبات", { period: "current_month" });
    expect(total).toMatchObject({ totalExpense: 120 + 150, transactionCount: 2, places: [{ name: "طلبات", amount: 270, count: 2 }] });
    const none = await getTextSpendingTotal(ctx, "كارفور", { period: "current_month" });
    expect(none).toMatchObject({ totalExpense: 0, transactionCount: 0 });
  });
});
