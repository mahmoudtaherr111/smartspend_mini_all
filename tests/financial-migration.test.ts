import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { expenses, expenseDailyRollups, localUsers, systemSettings } from "../db/schema";
import { migrateFinancialBatch, rollbackFinancialBatch, activateCashflowIfClean } from "../api/services/financial-migration";
import { applyExpenseRollupDelta, expenseToRollupDelta } from "../api/services/expense-rollups";
import { insertLedgerEntriesInTx, updateLedgerEntry } from "../api/services/ledger-writer";

const owner = { userId: 900120, userType: "local" };
const date = new Date("2026-10-20T10:00:00Z");
const own = <T extends { userId: unknown; userType: unknown }>(table: T) => and(eq(table.userId as never, owner.userId), eq(table.userType as never, owner.userType));
async function seed(direction?: string) {
  const row = { ...owner, type: "transfer", amount: "100.00", category: "تحويل", subCategory: "دين/سلفة", date, source: "manual", parsedMetadata: direction ? { direction } : null };
  const [{ id }] = await db.insert(expenses).values(row).$returningId();
  await applyExpenseRollupDelta(db, expenseToRollupDelta(row, 1)); return id;
}
async function clean() {
  await db.delete(expenses).where(own(expenses)); await db.delete(expenseDailyRollups).where(own(expenseDailyRollups));
  await db.delete(localUsers).where(eq(localUsers.id, owner.userId));
  await db.delete(systemSettings).where(eq(systemSettings.key, "capture_financial_version"));
}
describe.runIf(process.env.RUN_DB_INTEGRATION === "1")("financial migration against MySQL", () => {
  beforeEach(async () => { await clean(); await db.insert(localUsers).values({ id: owner.userId, name: "Synthetic", phone: "synthetic-migration", password: "synthetic" }); await db.insert(systemSettings).values({ key: "capture_financial_version", value: "" }); });
  afterAll(clean);
  it("previews, converts and idempotently revisits known directions while reporting unknown ones", async () => {
    const id = await seed("outgoing"); const unresolved = await seed();
    const preview = await migrateFinancialBatch({ owner });
    expect(preview.changed).toBe(1); expect(preview.unresolved).toEqual([{ id: unresolved, reason: "direction_unknown" }]);
    expect((await db.select().from(expenses).where(eq(expenses.id, id)))[0].type).toBe("transfer");
    expect((await migrateFinancialBatch({ owner, apply: true })).changed).toBe(1);
    expect((await migrateFinancialBatch({ owner, apply: true })).changed).toBe(0);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(row.type).toBe("expense");
    const [day] = await db.select().from(expenseDailyRollups).where(own(expenseDailyRollups));
    expect(Number(day.expense)).toBe(100); expect(Number(day.transfer)).toBe(100);
  });
  it("restores authentic unchanged snapshots with their original rollup", async () => {
    const id = await seed("incoming");
    await migrateFinancialBatch({ owner, apply: true });
    expect((await rollbackFinancialBatch({ owner })).restored).toBe(1);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(row.type).toBe("transfer"); expect(row.parsedMetadata).toEqual({ direction: "incoming" });
    const [day] = await db.select().from(expenseDailyRollups).where(own(expenseDailyRollups));
    expect(Number(day.income)).toBe(0); expect(Number(day.transfer)).toBe(100);
  });
  it("does not overwrite a later user edit or trust a forged snapshot", async () => {
    const id = await seed("outgoing"); await migrateFinancialBatch({ owner, apply: true });
    await updateLedgerEntry(owner, id, { description: "A later edit" });
    expect((await rollbackFinancialBatch({ owner })).skipped).toEqual([{ id, reason: "changed_after_migration" }]);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    const metadata = row.parsedMetadata as Record<string, any>;
    metadata.cashflowMigration.signature = "0".repeat(64);
    await db.update(expenses).set({ parsedMetadata: metadata }).where(eq(expenses.id, id));
    expect((await rollbackFinancialBatch({ owner })).skipped).toEqual([{ id, reason: "invalid_snapshot" }]);
  });
  it("waits for an in-flight legacy writer before the activation barrier re-counts rows", async () => {
    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const write = db.transaction(async (tx) => {
      await insertLedgerEntriesInTx(tx, owner, [{ type: "transfer", amount: 100, direction: "outgoing", category: "تحويل", subCategory: "دين/سلفة", description: "Synthetic", source: "manual", date }]);
      entered(); await held;
    });
    await enteredPromise;
    let completed = false;
    const activation = activateCashflowIfClean().then((result) => { completed = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 20)); expect(completed).toBe(false);
    release(); await write;
    expect(await activation).toMatchObject({ activated: false });
  });
});
