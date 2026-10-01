import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { expenses } from "../db/schema";
import { getFinanceSummary, getTextSpendingTotal } from "../api/services/finance-semantic-layer/resolvers";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_953, userType: "local" };
const stranger = { userId: 88_954, userType: "local" };

async function clean() {
  for (const who of [user, stranger]) {
    await db.delete(expenses).where(and(eq(expenses.userId, who.userId), eq(expenses.userType, who.userType)));
  }
}

async function spend(who: typeof user, amount: number, businessId: number | null, description: string) {
  await db.insert(expenses).values({
    userId: who.userId, userType: who.userType, type: "expense", amount: amount.toFixed(2), category: "أكل وشرب",
    subCategory: "مطاعم", description, rawText: description, source: "manual", date: new Date("2026-09-10T10:00:00Z"), businessId,
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
});
