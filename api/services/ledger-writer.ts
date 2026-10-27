/**
 * The ledger writer: how a row of `expenses` is added, changed or removed together with everything that has to move
 * with it (docs/decisions/0027-one-ledger-writer.md).
 *
 * A ledger write is more than the row. In the same transaction the daily rollup takes the row's delta
 * (`expense-rollups.ts`), the linked contact's transaction count follows it, a commitment the row paid toward is
 * reconciled or released (`coach/cashflows.ts`) and, for a save the user made, the streak moves. After the commit the
 * user's muscle memory and finance caches forget, and new spending is checked against the budgets. Each procedure that
 * saved used to write these steps out itself; a new writer would have had to copy them and could miss one.
 *
 * Callers still decide what is written: the ownership of referenced wallets, businesses and contacts
 * (`assertEntityOwnership`), finding or creating the contact, and the category the taxonomy holds stay with them.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { expenses, localUsers, userContacts, users } from "../../db/schema";
import { businessDayRange } from "../lib/app-time";
import { CacheKeys } from "../lib/cache-keys";
import { createLogger } from "../lib/log";
import { invalidateUserMemory } from "../lib/muscle-memory";
import { cacheIncr } from "../lib/redis-client";
import { checkUserBudgetExceeded } from "../notification-engine";
import { db, getDb } from "../queries/connection";
import { reconcileSettlementsOf, releaseSettlementsOf } from "./coach/cashflows";
import { applyExpenseRollupDelta, expenseToRollupDelta, ledgerAmount } from "./expense-rollups";
import { invalidateFinanceUserCache } from "./finance-semantic-layer";

const log = createLogger("ledger-writer");

export type LedgerTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LedgerRow = typeof expenses.$inferSelect;

/** Whose ledger is written. */
export interface LedgerOwner {
  userId: number;
  userType: string;
}

/** One row to add. `amount` is a magnitude: the stored sign follows `type` and `direction` (`ledgerAmount`). */
export interface NewLedgerEntry {
  type: string;
  amount: number | string;
  direction?: "incoming" | "outgoing" | null;
  category: string;
  /** Empty means the category's general subcategory, "عام". */
  subCategory?: string | null;
  description: string;
  rawText?: string | null;
  source: string;
  date: Date;
  contactId?: number | null;
  classificationLogId?: number | null;
  businessId?: number | null;
  walletId?: number | null;
  /** The caller's idempotency key, unique per user (`expenses_user_client_request_unique`). */
  clientRequestId?: string | null;
  /** Stored as given; without it a direction is kept as `{ direction }`. */
  parsedMetadata?: Record<string, unknown> | null;
}

/** What an edit changes; anything left undefined is kept. `amount` is a magnitude. */
export interface LedgerEntryChange {
  type?: string;
  amount?: number;
  /** An expense whose money came back: stored negative (docs/decisions/0010-refunds-net-their-category.md). */
  refund?: boolean;
  category?: string;
  subCategory?: string;
  description?: string;
  rawText?: string;
  date?: Date;
  walletId?: number | null;
  businessId?: number | null;
  contactId?: number | null;
}

/** A write of a row that already exists under the same `clientRequestId`. */
export function isDuplicateEntryError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const errorObj = err as Record<string, unknown>;
  const cause = errorObj.cause as Record<string, unknown> | undefined;
  const code = errorObj.code || cause?.code;
  const errno = errorObj.errno || cause?.errno;
  const sqlState = String(errorObj.sqlState || cause?.sqlState || "");
  const message = String(errorObj.message || cause?.message || "");
  return (
    code === "ER_DUP_ENTRY" ||
    errno === 1062 ||
    sqlState === "23000" ||
    message.includes("ER_DUP_ENTRY") ||
    message.includes("Duplicate entry") ||
    message.includes("expenses_user_client_request_unique")
  );
}

/** The rows the user already saved under these idempotency keys. */
export async function ledgerEntriesByRequestId(owner: LedgerOwner, clientRequestIds: string[]): Promise<LedgerRow[]> {
  if (clientRequestIds.length === 0) return [];
  return getDb()
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, owner.userId),
        eq(expenses.userType, owner.userType),
        inArray(expenses.clientRequestId, clientRequestIds),
      ),
    );
}

/**
 * Adds rows inside the caller's transaction: the rows, each one's rollup delta and its contact's count. Returns the
 * new ids in order. The streak is the caller's call (`bumpStreakInTx`).
 */
export async function insertLedgerEntriesInTx(tx: LedgerTx, owner: LedgerOwner, entries: NewLedgerEntry[]): Promise<number[]> {
  if (entries.length === 0) return [];
  const values = entries.map((entry) => ({
    userId: owner.userId,
    userType: owner.userType,
    type: entry.type,
    amount: ledgerAmount(entry.type, entry.direction, entry.amount).toString(),
    category: entry.category,
    subCategory: entry.subCategory || "عام",
    description: entry.description,
    rawText: entry.rawText ?? null,
    source: entry.source,
    parsedMetadata: entry.parsedMetadata || (entry.direction ? { direction: entry.direction } : null),
    contactId: entry.contactId ?? null,
    classificationLogId: entry.classificationLogId ?? null,
    businessId: entry.businessId || null,
    walletId: entry.walletId || null,
    clientRequestId: entry.clientRequestId || null,
    date: entry.date,
  }));

  const [result] = await tx.insert(expenses).values(values);
  // One INSERT of several rows takes consecutive ids from the first.
  const raw = result as { insertId?: number } | Array<{ insertId?: number }> | undefined;
  const firstId = Number((Array.isArray(raw) ? raw[0]?.insertId : raw?.insertId) ?? 0);

  for (const value of values) {
    await applyExpenseRollupDelta(
      tx,
      expenseToRollupDelta(
        {
          userId: owner.userId,
          userType: owner.userType,
          businessId: value.businessId,
          date: value.date,
          type: value.type,
          amount: value.amount,
          source: value.source,
        },
        1,
      ),
    );
  }

  const perContact = new Map<number, number>();
  for (const value of values) {
    if (value.contactId) perContact.set(value.contactId, (perContact.get(value.contactId) ?? 0) + 1);
  }
  for (const [contactId, count] of perContact) {
    await tx
      .update(userContacts)
      .set({ transactionCount: sql`${userContacts.transactionCount} + ${count}` })
      .where(eq(userContacts.id, contactId));
  }

  return firstId ? values.map((_, index) => firstId + index) : [];
}

/**
 * Moves the user's streak for a save they made: the same Cairo day keeps it, the next day adds one, a gap restarts
 * it. One UPDATE with CASE, so two saves at once cannot both read the old value.
 */
export async function bumpStreakInTx(tx: LedgerTx, owner: LedgerOwner): Promise<void> {
  const now = new Date();
  const today = businessDayRange(now);
  const yesterday = businessDayRange(new Date(today.start.getTime() - 1));
  const table = owner.userType === "oauth" ? users : localUsers;
  await tx
    .update(table)
    .set({
      currentStreak: sql`CASE
        WHEN ${table.lastStreakAt} >= ${today.start} AND ${table.lastStreakAt} < ${today.endExclusive} THEN ${table.currentStreak}
        WHEN ${table.lastStreakAt} >= ${yesterday.start} AND ${table.lastStreakAt} < ${today.start} THEN COALESCE(${table.currentStreak}, 0) + 1
        ELSE 1
      END`,
      highestStreak: sql`GREATEST(
        COALESCE(${table.highestStreak}, 0),
        CASE
          WHEN ${table.lastStreakAt} >= ${today.start} AND ${table.lastStreakAt} < ${today.endExclusive} THEN COALESCE(${table.currentStreak}, 0)
          WHEN ${table.lastStreakAt} >= ${yesterday.start} AND ${table.lastStreakAt} < ${today.start} THEN COALESCE(${table.currentStreak}, 0) + 1
          ELSE 1
        END
      )`,
      lastStreakAt: sql`CASE
        WHEN ${table.lastStreakAt} >= ${today.start} AND ${table.lastStreakAt} < ${today.endExclusive} THEN ${table.lastStreakAt}
        ELSE ${now}
      END`,
    })
    .where(eq(table.id, owner.userId));
}

/** Drops what is cached from the user's ledger: the month summaries and statistics, and the AI Center's facts. */
export async function invalidateLedgerCaches(userId: number | string, userType: string): Promise<void> {
  try {
    await cacheIncr(CacheKeys.cacheGen(userType, userId));
    await invalidateFinanceUserCache(userId, userType);
  } catch (err) {
    log.warn({ err, event: "ledger.cache_invalidation.failed", userId }, "Ledger cache invalidation failed");
  }
}

/**
 * After a committed write: muscle memory and the ledger caches forget, and new spending is checked against the
 * user's budgets (in the background).
 */
export async function afterLedgerWrite(owner: LedgerOwner, options: { spending?: boolean } = {}): Promise<void> {
  invalidateUserMemory(owner.userId, owner.userType);
  await invalidateLedgerCaches(owner.userId, owner.userType);
  if (options.spending) {
    checkUserBudgetExceeded(owner.userId, owner.userType).catch((err) => {
      log.error({ err, event: "ledger.budget_check.failed", userId: owner.userId }, "Budget check failed");
    });
  }
}

/**
 * Saves one row: in one transaction the row, its rollup delta, its contact's count and (unless `countsForStreak` is
 * false) the streak; then `afterCommit`, then the caches and the budget check. A row already saved under the same
 * `clientRequestId` comes back as `existing` and nothing is written. Callers that do work before saving (creating a
 * contact) look the key up first with `ledgerEntriesByRequestId`.
 */
export async function createLedgerEntry(
  owner: LedgerOwner,
  entry: NewLedgerEntry,
  options: { countsForStreak?: boolean; afterCommit?: () => Promise<void> } = {},
): Promise<{ id: number | undefined; existing: LedgerRow | null }> {
  let id: number | undefined;
  try {
    await getDb().transaction(async (tx) => {
      [id] = await insertLedgerEntriesInTx(tx, owner, [entry]);
      if (options.countsForStreak !== false) await bumpStreakInTx(tx, owner);
    });
  } catch (err) {
    if (entry.clientRequestId && isDuplicateEntryError(err)) {
      const [existing] = await ledgerEntriesByRequestId(owner, [entry.clientRequestId]);
      if (existing) return { id: existing.id, existing };
    }
    throw err;
  }
  await options.afterCommit?.();
  await afterLedgerWrite(owner, { spending: entry.type === "expense" });
  return { id, existing: null };
}

/**
 * Changes one row: locks it, keeps its stored sign in line with its kind and refund, reconciles what it paid toward,
 * and moves the rollup from the old values to the new ones. Then `afterCommit` and the caches. Throws NOT_FOUND for a
 * row that is not the user's.
 */
export async function updateLedgerEntry(
  owner: LedgerOwner,
  id: number,
  change: LedgerEntryChange,
  options: { afterCommit?: (before: LedgerRow) => Promise<void> } = {},
): Promise<LedgerRow> {
  const set: Partial<typeof expenses.$inferInsert> = {};
  if (change.type !== undefined) set.type = change.type;
  if (change.category !== undefined) set.category = change.category;
  if (change.subCategory !== undefined) set.subCategory = change.subCategory;
  if (change.description !== undefined) set.description = change.description;
  if (change.rawText !== undefined) set.rawText = change.rawText;
  if (change.date !== undefined) set.date = change.date;
  if (change.walletId !== undefined) set.walletId = change.walletId;
  if (change.businessId !== undefined) set.businessId = change.businessId;
  if (change.contactId !== undefined) set.contactId = change.contactId;

  const own = and(eq(expenses.id, id), eq(expenses.userId, owner.userId), eq(expenses.userType, owner.userType));
  let before: LedgerRow | undefined;
  await getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(expenses).where(own).limit(1).for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "المصروف غير موجود" });
    before = row;

    // The stored sign follows the kind and whether the money came back: a refund is a negative expense, anything
    // else is positive.
    if (change.amount !== undefined || change.type !== undefined || change.refund !== undefined) {
      const type = change.type ?? row.type;
      const wasRefund = row.type === "expense" && Number(row.amount) < 0;
      const refund = change.refund ?? wasRefund;
      set.amount = ledgerAmount(type, refund ? "incoming" : null, change.amount ?? Math.abs(Number(row.amount))).toString();
    }

    await tx.update(expenses).set(set).where(own);
    await reconcileSettlementsOf(tx, owner, id);

    await applyExpenseRollupDelta(tx, expenseToRollupDelta(row, -1));
    const after = {
      ...row,
      ...set,
      amount: set.amount ?? row.amount,
      date: set.date ?? row.date,
      type: set.type ?? row.type,
    };
    await applyExpenseRollupDelta(tx, expenseToRollupDelta(after, 1));
  });

  await options.afterCommit?.(before!);
  await afterLedgerWrite(owner);
  return before!;
}

/**
 * Removes one row: locks it, deletes it, makes what it paid toward unpaid again, backs out its rollup delta and lowers
 * its contact's count. Then `afterCommit` and the caches. Returns the removed row; throws NOT_FOUND for a row that is
 * not the user's.
 */
export async function deleteLedgerEntry(
  owner: LedgerOwner,
  id: number,
  options: { afterCommit?: (removed: LedgerRow) => Promise<void> } = {},
): Promise<LedgerRow> {
  const own = and(eq(expenses.id, id), eq(expenses.userId, owner.userId), eq(expenses.userType, owner.userType));
  let removed: LedgerRow | undefined;
  await getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(expenses).where(own).limit(1).for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "المصروف غير موجود" });
    removed = row;

    await tx.delete(expenses).where(own);
    // What it paid toward a commitment is unpaid again (api/services/coach/cashflows.ts).
    await releaseSettlementsOf(tx, owner, [row.id]);
    await applyExpenseRollupDelta(tx, expenseToRollupDelta(row, -1));

    if (row.contactId) {
      await tx
        .update(userContacts)
        .set({ transactionCount: sql`GREATEST(COALESCE(${userContacts.transactionCount}, 1) - 1, 0)` })
        .where(eq(userContacts.id, row.contactId));
    }
  });

  await options.afterCommit?.(removed!);
  await afterLedgerWrite(owner);
  return removed!;
}
