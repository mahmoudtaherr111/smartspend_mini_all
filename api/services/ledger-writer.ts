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
import { captureEvents, expenses, localUsers, userContacts, users, userWallets } from "../../db/schema";
import { idsOfNames, rememberFiling } from "../lib/capture/memory";
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
import { normalizeFinancialMovement, financialMovement, movementOf, type MovementKind } from "../../contracts/ledger-movement";
import { getSystemSettings } from "../lib/settings-cache";
import { rememberIdentityContact } from "../lib/capture/identity-links";
import { CATEGORIES } from "../../contracts/categories";
import { ExpenseInputLimits } from "../../contracts/constants";

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
  counterWalletId?: number | null;
  placeHint?: string | null;
  paymentMethod?: string | null;
  movementKind?: MovementKind;
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
  /** Internal post-save capture feedback; HTTP callers expose only the purpose-question contract. */
  capturePurpose?: string;
  captureCategoryResolved?: boolean;
  linkedFeeAmount?: number;
  counterWalletId?: number | null;
  direction?: "incoming" | "outgoing";
  movementKind?: MovementKind;
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

/** Common parent lock for money and referenced-wallet lifecycle mutations. */
export async function lockLedgerOwner(tx: LedgerTx, owner: LedgerOwner, missing: "UNAUTHORIZED" | "NOT_FOUND" = "UNAUTHORIZED"): Promise<void> {
  if (!["oauth", "local"].includes(owner.userType)) throw new TRPCError({ code: missing, message: "الحساب مش متاح. ادخل تاني." });
  const table = owner.userType === "oauth" ? users : localUsers;
  const [alive] = await tx.select({ id: table.id }).from(table).where(eq(table.id, owner.userId)).for("update");
  if (!alive) throw new TRPCError({ code: missing, message: missing === "NOT_FOUND" ? "العملية مش موجودة." : "الحساب مش متاح. ادخل تاني." });
}

export async function assertWalletsInTx(tx: LedgerTx, owner: LedgerOwner, ids: Array<number | null | undefined>): Promise<void> {
  if (ids.some((id) => id != null && (!Number.isSafeInteger(id) || id <= 0))) throw new TRPCError({ code: "BAD_REQUEST", message: "المحفظة لازم تكون اختيار صحيح من حسابك." });
  const wanted = [...new Set(ids.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0))];
  if (!wanted.length) return;
  const rows = await tx.select({ id: userWallets.id }).from(userWallets).where(and(eq(userWallets.userId, owner.userId), eq(userWallets.userType, owner.userType), inArray(userWallets.id, wanted)));
  if (rows.length !== wanted.length) throw new TRPCError({ code: "BAD_REQUEST", message: "المحفظة مش موجودة في حسابك." });
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
  await lockLedgerOwner(tx, owner);
  await assertWalletsInTx(tx, owner, entries.flatMap((entry) => [entry.walletId, entry.counterWalletId, financialMovement(entry)?.counterWalletId]));
  const financialEnabled = (await getSystemSettings(tx, { keys: ["capture_financial_version"], lock: true })).capture_financial_version === "cashflow-v1";
  const normalized = entries.map((entry) => {
    if (!financialEnabled) {
      if (entry.counterWalletId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "التحويل بين المحافظ لسه بيتجهز." });
      const metadata = { ...entry.parsedMetadata };
      const capture = metadata.capture as { details?: { promptVersion?: string } } | undefined;
      if (capture?.details?.promptVersion === "sms-v4") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "تسجيل رسايل البنك لسه بيتجهز." });
      delete metadata.financial;
      return { ...entry, parsedMetadata: entry.parsedMetadata ? metadata : null };
    }
    const metadataDirection = entry.parsedMetadata?.direction;
    const direction = entry.direction ?? (metadataDirection === "incoming" || metadataDirection === "outgoing" ? metadataDirection : entry.type === "investment" ? "outgoing" : undefined);
    const financial = normalizeFinancialMovement({ ...entry, direction }, entry.movementKind);
    if (!financial) throw new TRPCError({ code: "BAD_REQUEST", message: "حدد حركة الفلوس داخلة ولا خارجة." });
    if (entry.counterWalletId && financial.financial.excluded) financial.financial.counterWalletId = entry.counterWalletId;
    if (entry.counterWalletId === entry.walletId && entry.walletId) throw new TRPCError({ code: "BAD_REQUEST", message: "اختار محفظتين مختلفتين للتحويل." });
    return { ...entry, type: financial.type, direction: financial.financial.movement === "in" ? "incoming" as const : "outgoing" as const,
      parsedMetadata: { ...entry.parsedMetadata, direction: financial.financial.movement === "in" ? "incoming" : "outgoing", financial: financial.financial } };
  });
  const values = normalized.map((entry) => ({
    userId: owner.userId,
    userType: owner.userType,
    type: entry.type,
    amount: ledgerAmount(entry.type, entry.direction, entry.amount).toString(),
    category: entry.category,
    subCategory: entry.subCategory || "عام",
    description: entry.description,
    rawText: entry.rawText ?? null,
    placeHint: entry.placeHint ?? null,
    paymentMethod: entry.paymentMethod ?? null,
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
          parsedMetadata: value.parsedMetadata,
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
      .where(and(eq(userContacts.id, contactId), eq(userContacts.userId, owner.userId), eq(userContacts.userType, owner.userType)));
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
  const financial = normalizeFinancialMovement(entry, entry.movementKind);
  await afterLedgerWrite(owner, { spending: !!financial && !financial.financial.excluded && financial.type === "expense" });
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
  const before = await getDb().transaction((tx) => updateLedgerEntryInTx(tx, owner, id, change));
  await options.afterCommit?.(before);
  await afterLedgerWrite(owner);
  return before;
}

/** Shared edit inside an existing owner transaction; the caller invalidates caches after commit. */
export async function updateLedgerEntryInTx(tx: LedgerTx, owner: LedgerOwner, id: number, change: LedgerEntryChange): Promise<LedgerRow> {
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
  await lockLedgerOwner(tx, owner, "NOT_FOUND");
  const [row] = await tx.select().from(expenses).where(own).limit(1).for("update");
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "المصروف غير موجود" });
  await assertWalletsInTx(tx, owner, [change.walletId, change.counterWalletId]);
  if (change.contactId) {
    const [contact] = await tx.select({ id: userContacts.id }).from(userContacts).where(and(eq(userContacts.id, change.contactId), eq(userContacts.userId, owner.userId), eq(userContacts.userType, owner.userType)));
    if (!contact) throw new TRPCError({ code: "BAD_REQUEST", message: "الشخص مش موجود في حسابك." });
  }

  // The stored sign follows the kind and whether the money came back: a refund is a negative expense, anything
  // else is positive.
  if (change.amount !== undefined || change.type !== undefined || change.refund !== undefined) {
    const type = change.type ?? row.type;
    const wasRefund = row.type === "expense" && Number(row.amount) < 0;
    const refund = change.refund ?? wasRefund;
    set.amount = ledgerAmount(type, refund ? "incoming" : null, change.amount ?? Math.abs(Number(row.amount))).toString();
  }

  const financialEnabled = (await getSystemSettings(tx, { keys: ["capture_financial_version"], lock: true })).capture_financial_version === "cashflow-v1" || !!(row.parsedMetadata as { financial?: unknown } | null)?.financial;
  const wasRefundMovement = row.type === "expense" && Number(row.amount) < 0;
  const refundChanged = change.refund === true || (change.refund === false && wasRefundMovement);
  const kind = change.movementKind ?? (!refundChanged ? undefined : change.refund ? "refund" : (change.type ?? row.type) === "income" ? "income" : "spending");
  const direction = change.direction ?? (refundChanged ? (change.refund || change.type === "income" ? "incoming" : "outgoing")
    : change.type === "income" ? "incoming" : change.type === "expense" ? (Number(set.amount ?? row.amount) < 0 ? "incoming" : "outgoing")
      : change.type ? (movementOf(row) === "in" ? "incoming" : movementOf(row) === "out" ? "outgoing" : undefined) : undefined);
  const financial = financialEnabled ? normalizeFinancialMovement({ ...row, ...set, direction }, kind) : null;
  if (financial) {
    if (change.counterWalletId !== undefined) {
      if (change.counterWalletId && financial.financial.excluded) financial.financial.counterWalletId = change.counterWalletId;
      else delete financial.financial.counterWalletId;
    }
    if (financial.financial.counterWalletId && financial.financial.counterWalletId === (change.walletId ?? row.walletId)) throw new TRPCError({ code: "BAD_REQUEST", message: "اختار محفظتين مختلفتين للتحويل." });
    set.type = financial.type;
    set.amount = ledgerAmount(financial.type, financial.financial.movement === "in" ? "incoming" : "outgoing", set.amount ?? row.amount).toString();
    set.parsedMetadata = { ...(row.parsedMetadata as Record<string, unknown> | null), financial: financial.financial,
      direction: financial.financial.movement === "in" ? "incoming" : "outgoing" };
  } else if (financialEnabled && (change.amount !== undefined || change.type !== undefined || change.direction !== undefined || change.movementKind !== undefined)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "حدد حركة الفلوس داخلة ولا خارجة." });
  }
  if (!financialEnabled && change.direction) set.parsedMetadata = { ...(row.parsedMetadata as Record<string, unknown> | null), direction: change.direction };

  const capturedMetadata = row.parsedMetadata as { capture?: { details?: Record<string, unknown> } } | null;
  const filingChanged = (change.category !== undefined && change.category !== row.category) || (change.subCategory !== undefined && change.subCategory !== row.subCategory);
  if (capturedMetadata?.capture && (change.captureCategoryResolved || change.capturePurpose || filingChanged)) {
    set.parsedMetadata = { ...(set.parsedMetadata as Record<string, unknown> | undefined ?? row.parsedMetadata as Record<string, unknown> | null),
      capture: { ...capturedMetadata.capture, provisional: false, details: { ...capturedMetadata.capture.details, categoryPending: false,
        ...(change.capturePurpose ? { purpose: change.capturePurpose.trim().slice(0, 200) } : {}) } } };
  }

  await tx.update(expenses).set(set).where(own);
  if (change.contactId !== undefined && change.contactId !== row.contactId) {
    if (row.contactId) await tx.update(userContacts).set({ transactionCount: sql`GREATEST(COALESCE(${userContacts.transactionCount}, 1) - 1, 0)` }).where(and(eq(userContacts.id, row.contactId), eq(userContacts.userId, owner.userId), eq(userContacts.userType, owner.userType)));
    if (change.contactId) await tx.update(userContacts).set({ transactionCount: sql`COALESCE(${userContacts.transactionCount}, 0) + 1` }).where(and(eq(userContacts.id, change.contactId), eq(userContacts.userId, owner.userId), eq(userContacts.userType, owner.userType)));
    await rememberIdentityContact(tx, owner, capturedMetadata?.capture?.details?.memoryKey, capturedMetadata?.capture?.details?.identityKind, change.contactId);
  }
  await updateLinkedFeeInTx(tx, owner, row, change);
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

  // A row recorded from a bank message that the user files elsewhere teaches where that merchant goes next time
  // (decision 0030).
  const captured = (row.parsedMetadata as { capture?: { eventId?: unknown } } | null)?.capture?.eventId;
  if (typeof captured === "number" && ((set.category !== undefined && set.category !== row.category) || (set.subCategory !== undefined && set.subCategory !== row.subCategory))) {
    const [event] = await tx
      .select({ merchantKey: captureEvents.merchantKey })
      .from(captureEvents)
      .where(and(eq(captureEvents.id, captured), eq(captureEvents.userId, owner.userId), eq(captureEvents.userType, owner.userType)));
    const filing = idsOfNames(set.category ?? row.category, set.subCategory ?? row.subCategory);
    const privateKey = capturedMetadata?.capture?.details?.memoryKey;
    const memoryKey = typeof privateKey === "string" && /^[mp]:.{1,138}$/.test(privateKey) ? privateKey : event?.merchantKey ? `m:${event.merchantKey}`.slice(0, 140) : null;
    if (memoryKey && filing) await rememberFiling(tx, owner, memoryKey, filing);
  }
  return row;
}

/** Bundle edits stay atomic. Bank-declared fee metadata remains immutable evidence for late-signal deduplication. */
async function updateLinkedFeeInTx(tx: LedgerTx, owner: LedgerOwner, row: LedgerRow, change: LedgerEntryChange): Promise<void> {
  if (change.linkedFeeAmount === undefined && change.walletId === undefined && change.date === undefined) return;
  const capture = (row.parsedMetadata as { capture?: { eventId?: unknown; parentExpenseId?: unknown; details?: { promptVersion?: string } } } | null)?.capture;
  if (change.linkedFeeAmount !== undefined && (!Number.isFinite(change.linkedFeeAmount) || change.linkedFeeAmount < 0 || change.linkedFeeAmount > ExpenseInputLimits.amountMax)) throw new TRPCError({ code: "BAD_REQUEST", message: "الرسوم لازم تكون مبلغ صحيح أو صفر." });
  if (typeof capture?.eventId !== "number" || capture.parentExpenseId || capture.details?.promptVersion !== "sms-v4") {
    if (change.linkedFeeAmount !== undefined) throw new TRPCError({ code: "BAD_REQUEST", message: "عدّل الرسوم من العملية الأصلية." });
    return;
  }
  const scope = and(eq(expenses.userId, owner.userId), eq(expenses.userType, owner.userType), eq(expenses.clientRequestId, `cap:e${capture.eventId}:fee`));
  const [child] = await tx.select().from(expenses).where(scope).for("update");
  if (child) {
    if (change.linkedFeeAmount === 0) {
      await deleteLedgerEntryInTx(tx, owner, child.id);
    } else {
      await applyExpenseRollupDelta(tx, expenseToRollupDelta(child, -1));
      const after = { ...child, amount: change.linkedFeeAmount === undefined ? child.amount : String(change.linkedFeeAmount),
        date: change.date ?? child.date, walletId: change.walletId === undefined ? child.walletId : change.walletId };
      await tx.update(expenses).set({ amount: after.amount, date: after.date, walletId: after.walletId }).where(scope);
      await reconcileSettlementsOf(tx, owner, child.id);
      await applyExpenseRollupDelta(tx, expenseToRollupDelta(after, 1));
    }
  } else if (change.linkedFeeAmount && change.linkedFeeAmount > 0) {
    const main = CATEGORIES.find((category) => category.id === "installments")!;
    const sub = main.subcategories.find((item) => item.id === "bank_fees")!;
    await insertLedgerEntriesInTx(tx, owner, [{ type: "expense", amount: change.linkedFeeAmount, category: main.name_ar, subCategory: sub.name_ar,
      description: sub.name_ar, source: "sms", date: change.date ?? row.date, walletId: change.walletId === undefined ? row.walletId : change.walletId,
      clientRequestId: `cap:e${capture.eventId}:fee`, parsedMetadata: { capture: { feeOfEventId: capture.eventId, parentExpenseId: row.id } } }]);
  }
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
  const removed = await getDb().transaction((tx) => deleteLedgerEntryInTx(tx, owner, id));
  await options.afterCommit?.(removed);
  await afterLedgerWrite(owner);
  return removed;
}

/** Deletes with rollup/fee/tombstone effects inside the caller's transaction; invalidate caches after commit. */
export async function deleteLedgerEntryInTx(tx: LedgerTx, owner: LedgerOwner, id: number): Promise<LedgerRow> {
  const own = and(eq(expenses.id, id), eq(expenses.userId, owner.userId), eq(expenses.userType, owner.userType));
  await lockLedgerOwner(tx, owner, "NOT_FOUND");
  const [row] = await tx.select().from(expenses).where(own).limit(1).for("update");
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "المصروف غير موجود" });

  await tx.delete(expenses).where(own);
  // A row recorded from a bank message leaves its event as a tombstone, so a late signal of the same payment does
  // not bring it back (decision 0029).
  const captured = (row.parsedMetadata as { capture?: { eventId?: unknown } } | null)?.capture?.eventId;
  if (typeof captured === "number") {
    const children = await tx.select().from(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, owner.userType), eq(expenses.clientRequestId, `cap:e${captured}:fee`))).for("update");
    for (const child of children) {
      await deleteLedgerEntryInTx(tx, owner, child.id);
    }
    await tx
      .update(captureEvents)
      .set({ status: "deleted", expenseId: null, resolvedAt: new Date() })
      .where(and(eq(captureEvents.id, captured), eq(captureEvents.userId, owner.userId), eq(captureEvents.userType, owner.userType)));
  }
  // What it paid toward a commitment is unpaid again (api/services/coach/cashflows.ts).
  await releaseSettlementsOf(tx, owner, [row.id]);
  await applyExpenseRollupDelta(tx, expenseToRollupDelta(row, -1));

  if (row.contactId) {
    await tx
      .update(userContacts)
      .set({ transactionCount: sql`GREATEST(COALESCE(${userContacts.transactionCount}, 1) - 1, 0)` })
      .where(and(eq(userContacts.id, row.contactId), eq(userContacts.userId, owner.userId), eq(userContacts.userType, owner.userType)));
  }
  return row;
}
