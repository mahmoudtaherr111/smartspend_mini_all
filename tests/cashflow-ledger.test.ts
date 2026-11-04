/** Shared financial behavior exercised against a migrated disposable MySQL. All identities are synthetic. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { expenses, expenseDailyRollups, localUsers, userWallets, userContacts, systemSettings, captureMarkers } from "../db/schema";
import { createLedgerEntry, updateLedgerEntry, deleteLedgerEntry, type NewLedgerEntry } from "../api/services/ledger-writer";
import { getFinanceSummary } from "../api/services/finance-semantic-layer/resolvers";
import { listDebtBalances, getGam3eyaStanding } from "../api/services/debt-ledger";
import { reconcileRollupsForRange } from "../api/services/expense-rollups";
import { invalidateSettingsCache } from "../api/lib/settings-cache";
import { walletRouter } from "../api/wallet-router";
import { countsInTotals, financialBucket } from "../contracts/ledger-movement";
import { ledgerBucketSql } from "../api/services/ledger-semantics";
import { setWalletBalanceKind, walletBalanceKind } from "../api/lib/capture/markers";

const owner = { userId: 900100, userType: "local" };
const stranger = { userId: 900101, userType: "local" };
const date = new Date("2026-10-20T10:00:00Z");
const period = { period: "custom" as const, startDate: "2026-10-01", endDate: "2026-10-31" };
let bank: number, cash: number, foreign: number, person: number;
const own = <T extends { userId: unknown; userType: unknown }>(table: T) => and(eq(table.userId as never, owner.userId), eq(table.userType as never, owner.userType));
const wallets = walletRouter.createCaller({ user: { id: owner.userId, type: owner.userType, role: "user", plan: "free" }, req: new Request("http://localhost"), ip: "127.0.0.1" } as never);
const entry = (patch: Partial<NewLedgerEntry>): NewLedgerEntry => ({ type: "expense", amount: 1, category: "متنوعات", subCategory: "عام", description: "Synthetic", source: "manual", date, ...patch });
async function add(patch: Partial<NewLedgerEntry>) { const result = await createLedgerEntry(owner, entry(patch), { countsForStreak: false }); return result.id!; }
async function clean() {
  for (const table of [expenses, expenseDailyRollups, userWallets, userContacts, captureMarkers]) await db.delete(table).where(own(table));
  await db.delete(userWallets).where(and(eq(userWallets.userId, stranger.userId), eq(userWallets.userType, stranger.userType)));
  await db.delete(localUsers).where(inArray(localUsers.id, [owner.userId, stranger.userId]));
  await db.delete(systemSettings).where(eq(systemSettings.key, "capture_financial_version")); invalidateSettingsCache();
}
describe.runIf(process.env.RUN_DB_INTEGRATION === "1")("cashflow-v1 ledger", () => {
  beforeEach(async () => {
    await clean();
    await db.insert(localUsers).values([{ id: owner.userId, name: "Synthetic", phone: "synthetic-finance-01", password: "synthetic" }, { id: stranger.userId, name: "Synthetic Other", phone: "synthetic-finance-02", password: "synthetic" }]);
    await db.insert(systemSettings).values({ key: "capture_financial_version", value: "cashflow-v1" }); invalidateSettingsCache();
    const created = await db.insert(userWallets).values([{ ...owner, name: "Bank", provider: "Synthetic" }, { ...owner, name: "Cash", provider: "Cash" }, { ...stranger, name: "Other", provider: "Synthetic" }]).$returningId();
    [bank, cash, foreign] = created.map((row) => row.id);
    [person] = (await db.insert(userContacts).values({ ...owner, name: "Synthetic Person" }).$returningId()).map((row) => row.id);
  });
  afterAll(clean);
  it("counts rent, loans and repayments while own cash movements leave month totals unchanged", async () => {
    await add({ type: "income", amount: 10000, category: "مرتب", walletId: bank });
    await add({ amount: 5000, category: "البيت", subCategory: "إيجار", walletId: bank });
    await add({ type: "transfer", direction: "outgoing", amount: 1000, category: "تحويل", subCategory: "دين/سلفة", contactId: person, walletId: bank });
    await add({ type: "transfer", direction: "incoming", amount: 1000, category: "تحويل", subCategory: "دين/سلفة", contactId: person, walletId: bank });
    const internal = await add({ type: "transfer", direction: "outgoing", amount: 2000, category: "تحويل", subCategory: "سحب ATM", walletId: bank, counterWalletId: cash });
    await add({ amount: 300, category: "أكل وشرب", walletId: cash });
    await add({ amount: 5, category: "أقساط وفوايد", subCategory: "رسوم بنكية", walletId: bank });
    await add({ amount: 100, direction: "incoming", category: "أكل وشرب", walletId: cash });
    const summary = await getFinanceSummary(owner, period);
    expect(summary).toMatchObject({ totalIncome: 11000, totalExpense: 6205, netFlow: 4795 });
    expect(await listDebtBalances(owner.userId, owner.userType)).toHaveLength(0);
    expect(await wallets.getWalletMonth({ walletId: bank, month: "2026-10" })).toMatchObject({ moneyIn: 11000, moneyOut: 8005 });
    expect(await wallets.getWalletMonth({ walletId: cash, month: "2026-10" })).toMatchObject({ moneyIn: 2100, moneyOut: 300 });
    expect((await wallets.getWalletTransactions({ walletId: cash, limit: 20, offset: 0 })).find((row) => row.id === internal)?.type).toBe("income");
    const [rollup] = await db.select().from(expenseDailyRollups).where(own(expenseDailyRollups));
    expect(Number(rollup.income)).toBe(11000); expect(Number(rollup.expense)).toBe(6205);
    const reconciled = await reconcileRollupsForRange(owner.userId, owner.userType, "2026-10-01", "2026-10-31");
    expect(reconciled.driftDetected).toBe(false);
    const rows = await db.select().from(expenses).where(own(expenses));
    expect(rows.every((row) => ["income", "expense"].includes(row.type))).toBe(true);
    expect(countsInTotals(rows.find((row) => row.id === internal)!)).toBe(false);
  });
  it("keeps gam3eya standing while its payments and payouts enter cashflow totals", async () => {
    await add({ type: "transfer", amount: 1000, direction: "outgoing", category: "تحويل", subCategory: "جمعية" });
    await add({ type: "transfer", amount: 500, direction: "incoming", category: "تحويل", subCategory: "جمعية" });
    expect(await getGam3eyaStanding(owner.userId, owner.userType)).toMatchObject({ paid: 1000, received: 500, held: 500 });
    expect(await getFinanceSummary(owner, period)).toMatchObject({ totalIncome: 500, totalExpense: 1000 });
  });
  it("does not turn an incoming own-account transfer into income when an older editor submits refund=false", async () => {
    const id = await add({ type: "transfer", direction: "incoming", amount: 100, category: "تحويل", subCategory: "بين حساباتي", walletId: bank, counterWalletId: cash });
    await updateLedgerEntry(owner, id, { amount: 100, refund: false });
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(countsInTotals(row)).toBe(false);
    expect(await getFinanceSummary(owner, period)).toMatchObject({ totalIncome: 0, totalExpense: 0 });
  });
  it("validates both wallets on the owner pair, including metadata-supplied counter references", async () => {
    await expect(add({ type: "transfer", direction: "outgoing", amount: 100, category: "تحويل", subCategory: "بين حساباتي", walletId: bank, counterWalletId: foreign })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(add({ amount: 100, walletId: bank, parsedMetadata: { financial: { version: 1, kind: "own_transfer", movement: "out", counterWalletId: foreign } } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(expenses).where(own(expenses))).toHaveLength(0);
  });
  it("removes a destination link on wallet deletion and keeps its transaction in the source wallet", async () => {
    await add({ type: "transfer", direction: "outgoing", amount: 100, category: "تحويل", subCategory: "بين حساباتي", walletId: bank, counterWalletId: cash });
    await setWalletBalanceKind(owner, cash, "cash");
    await wallets.deleteWallet({ id: cash });
    expect(await walletBalanceKind(owner, cash)).toBe("unknown");
    expect(await wallets.getWalletMonth({ walletId: cash, month: "2026-10" })).toMatchObject({ moneyIn: 0, count: 0 });
    expect(await wallets.getWalletMonth({ walletId: bank, month: "2026-10" })).toMatchObject({ moneyOut: 100 });
  });
  it("keeps direct SQL bucket evaluation consistent with the shared reader on malformed metadata", async () => {
    for (const financial of [{ version: "1", kind: "own_transfer", movement: "out" }, { version: 1, kind: "own_transfer", movement: "wrong" }, { version: 1, kind: "loan", movement: "out", excluded: true }]) {
      await db.insert(expenses).values({ ...owner, type: "expense", amount: "10", category: "متنوعات", source: "manual", date, parsedMetadata: { financial } });
    }
    const rows = await db.select({ bucket: ledgerBucketSql, type: expenses.type, amount: expenses.amount, parsedMetadata: expenses.parsedMetadata }).from(expenses).where(own(expenses));
    for (const row of rows) expect(row.bucket).toBe(financialBucket(row));
  });
});
