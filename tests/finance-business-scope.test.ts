import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { expenses, userBudgets } from "../db/schema";
import { getCategoryTotal, getFinanceBreakdown, getFinanceSummary, getTextSpendingTotal } from "../api/services/finance-semantic-layer/resolvers";
import { TAXONOMY_VERSION, taxonomyCategory, taxonomySub } from "../contracts/taxonomy";
import { expenseRouter } from "../api/expense-router";
import { exportRouter } from "../api/export-router";
import { budgetRouter } from "../api/budget-router";
import { listBudgetStatuses } from "../api/services/budget-status";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_953, userType: "local" };
const stranger = { userId: 88_954, userType: "local" };
const otherIdentity = { userId: user.userId, userType: "oauth" };
const ctx = { user: { id: user.userId, type: "local" as const, email: "owner@example.com", name: "Owner" } };

async function clean() {
  for (const who of [user, stranger, otherIdentity]) {
    await db.delete(expenses).where(and(eq(expenses.userId, who.userId), eq(expenses.userType, who.userType)));
  }
  await db.delete(userBudgets).where(and(eq(userBudgets.userId, user.userId), eq(userBudgets.userType, user.userType)));
}

async function spend(who: typeof user, amount: number, businessId: number | null, description: string, extra: Partial<typeof expenses.$inferInsert> = {}) {
  await db.insert(expenses).values({
    userId: who.userId, userType: who.userType, type: "expense", amount: amount.toFixed(2), category: "أكل وشرب",
    subCategory: "مطاعم", description, rawText: description, source: "manual", date: new Date("2026-09-10T10:00:00Z"), businessId,
    ...extra,
  });
}

const period = { period: "custom" as const, startDate: "2026-09-01", endDate: "2026-09-30" };

describe("the finance layer's ledger scope", () => {
  beforeEach(clean);
  afterAll(clean);

  itWithDatabase("reads a business's ledger apart from the personal one, never from a cached answer of the other", async () => {
    await spend(user, 100, null, "غدا");
    await spend(user, 40, 0, "قهوة");
    await spend(user, 900, 501, "خامات الورشة");
    await spend(stranger, 7_000, 501, "مش بتاعه");
    const personal = await getFinanceSummary(user, period);
    const business = await getFinanceSummary({ ...user, businessId: 501 }, period);
    expect(personal.totalExpense).toBe(140);
    // Only this user's rows of that business: another account's rows under the same id never count.
    expect(business.totalExpense).toBe(900);
    expect((await getFinanceSummary(user, period)).totalExpense).toBe(140);
    expect((await getTextSpendingTotal({ ...user, businessId: 501 }, "خامات", period)).totalExpense).toBe(900);
    expect((await getTextSpendingTotal(user, "خامات", period)).totalExpense).toBe(0);
  });

  itWithDatabase("reports saved purposes consistently and preserves unresolved historical spending", async () => {
    const dining = { purposeCategoryId: "dining", purposeSubId: "other", purposeVersion: TAXONOMY_VERSION };
    const groceries = { purposeCategoryId: "groceries", purposeSubId: "other", purposeVersion: TAXONOMY_VERSION };
    const diningName = taxonomyCategory("dining")!.nameAr;
    const groceryName = taxonomyCategory("groceries")!.nameAr;
    await spend(user, 120, null, "مطعم", dining);
    await spend(user, -20, 0, "مرتجع المطعم", dining);
    await spend(user, 70, 0, "بقالة", groceries);
    await spend(user, 35, null, "قيد قديم");
    await spend(user, 90, 501, "غدا الشغل", dining);
    await spend(otherIdentity, 1000, null, "مطعم مستخدم تاني", dining);

    const ledger = expenseRouter.createCaller(ctx);
    const stats = await ledger.getMonthlyStats({ month: "2026-09" });
    expect(stats.purposeBreakdown.map(row => [row.name, row.value, row.count])).toEqual([
      [diningName, 100, 2], [groceryName, 70, 1], ["أكل وشرب", 35, 1],
    ]);
    expect(stats.categoryBreakdown.map(row => [row.name, row.value])).toEqual([["أكل وشرب", 205]]);
    const diningFilter = { kind: "purpose", id: "dining" } as const;
    const page = await ledger.list({ spendingCategory: diningFilter, limit: 1 });
    expect(page.total).toBe(2);
    expect(page.items.map(row => Number(row.amount))).toEqual([-20]);
    const nextPage = await ledger.list({ spendingCategory: diningFilter, cursor: page.items[0].id });
    expect(nextPage.total).toBe(2);
    expect(nextPage.items.map(row => Number(row.amount))).toEqual([120]);
    expect((await ledger.list({ spendingCategory: { kind: "legacy", name: "أكل وشرب" } })).items.map(row => Number(row.amount))).toEqual([35]);
    expect((await ledger.list({ spendingCategory: diningFilter, businessId: 501 })).items.map(row => Number(row.amount))).toEqual([90]);

    const aiBreakdown = await getFinanceBreakdown(user, { ...period, granularity: "category" });
    expect(aiBreakdown.items.map(row => [row.name, row.amount])).toEqual([[diningName, 100], [groceryName, 70], ["أكل وشرب", 35]]);
    expect((await getCategoryTotal(user, "dining", period)).totalExpense).toBe(100);
    expect((await getCategoryTotal(user, "food", period)).totalExpense).toBe(205);

    const budgets = budgetRouter.createCaller(ctx);
    const { budgetId } = await budgets.create({ title: diningName, purposeCategoryId: "dining", monthlyLimit: 500 });
    const legacy = await budgets.create({ title: "ميزانية الأكل", category: "أكل وشرب", monthlyLimit: 500 });
    const statuses = await listBudgetStatuses(user.userId, user.userType, new Date("2026-09-20T10:00:00Z"));
    expect(statuses.find(row => row.id === budgetId)).toMatchObject({ purposeCategoryId: "dining", currentSpent: 100 });
    expect(statuses.find(row => row.id === legacy.budgetId)).toMatchObject({ purposeCategoryId: null, currentSpent: 205 });

    const result = await exportRouter.createCaller(ctx).myExpenses({ format: "json", businessId: null });
    expect(result.format).toBe("json");
    if (result.format !== "json") throw new Error("Expected JSON expense export");
    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ الفئة: diningName, "الفئة الفرعية": taxonomySub("dining", "other")!.nameAr, المبلغ: -20 }),
      expect.objectContaining({ الفئة: "أكل وشرب", المبلغ: 35 }),
    ]));
    expect(result.data).toHaveLength(4);
  });
});
