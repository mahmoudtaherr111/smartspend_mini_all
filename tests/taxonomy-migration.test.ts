import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { expenseDailyRollups, expenses } from "../db/schema";
import { applyExpenseRollupDelta, expenseToRollupDelta, toDayString } from "../api/services/expense-rollups";
import { runTaxonomyMigrationJob } from "../api/jobs/taxonomy-migration-job";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

describe("taxonomy migration job against MySQL", () => {
  const userId = 88811;
  const userType = "local";
  const when = new Date("2026-09-10T10:00:00.000Z");

  async function seed(row: { type: string; category: string; subCategory: string; amount: string }) {
    const values = { userId, userType, date: when, source: "manual", status: "confirmed", ...row };
    const [result] = await db.insert(expenses).values(values);
    await applyExpenseRollupDelta(db, expenseToRollupDelta(values, 1));
    return Number((result as { insertId?: number }).insertId);
  }

  async function rollup() {
    const [row] = await db
      .select()
      .from(expenseDailyRollups)
      .where(and(
        eq(expenseDailyRollups.userId, userId),
        eq(expenseDailyRollups.userType, userType),
        eq(expenseDailyRollups.day, toDayString(when) as never),
      ));
    return row;
  }

  beforeEach(async () => {
    await db.delete(expenseDailyRollups).where(and(eq(expenseDailyRollups.userId, userId), eq(expenseDailyRollups.userType, userType)));
    await db.delete(expenses).where(and(eq(expenses.userId, userId), eq(expenses.userType, userType)));
  });

  itWithDatabase("moves rows, keeps the old values and moves retyped money between rollup columns", async () => {
    const gam3eya = await seed({ type: "expense", category: "التزامات وجمعيات", subCategory: "قسط جمعية", amount: "1000.00" });
    const oil = await seed({ type: "expense", category: "خدمات سيارات", subCategory: "تغيير زيت", amount: "600.00" });
    const before = await rollup();
    expect(Number(before?.expense)).toBe(1600);

    await runTaxonomyMigrationJob();

    const [paid] = await db.select().from(expenses).where(eq(expenses.id, gam3eya));
    expect(paid).toMatchObject({ category: "تحويل", subCategory: "جمعية", type: "transfer" });
    expect((paid.parsedMetadata as Record<string, unknown>).legacy_taxonomy).toMatchObject({
      category: "التزامات وجمعيات",
      subCategory: "قسط جمعية",
      type: "expense",
    });
    const [car] = await db.select().from(expenses).where(eq(expenses.id, oil));
    expect(car).toMatchObject({ category: "مواصلات", subCategory: "صيانة عربية", type: "expense" });

    const after = await rollup();
    expect(Number(after?.expense)).toBe(600);
    expect(Number(after?.transfer)).toBe(1000);
    expect(after?.txnCount).toBe(before?.txnCount);

    // A second run finds nothing to do.
    const again = await runTaxonomyMigrationJob();
    expect(again.expenses).toBe(0);
  });
});
