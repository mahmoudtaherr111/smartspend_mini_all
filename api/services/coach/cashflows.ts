/**
 * Commitments and expected income (`scheduled_cashflows`) and what paid them (`cashflow_settlements`), for one user.
 * Every read and write is scoped to the user's id and type. A payment is linked to a due date only by the user
 * (a tap, or a confirmed draft in a call): a matching amount or word is offered as a suggestion, never linked on
 * its own, and the allocations of one expense never exceed it.
 */
import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { cashflowSettlements, expenses, installmentPlans, scheduledCashflows, userContacts, userWallets } from "../../../db/schema";
import { businessDateKey, startOfBusinessDay } from "../../lib/app-time";
import { db } from "../../queries/connection";
import { getProfileSnapshot } from "../finance-semantic-layer";
import { addDays, cashPosition, dueDays, occurrences, type CashPosition, type Occurrence, type ScheduleRow } from "./schedule";

export interface CoachUser {
  userId: number;
  userType: string;
}

export const CASHFLOW_KINDS = ["rent", "bill", "subscription", "school", "installment", "debt", "gam3eya", "salary", "freelance", "other"] as const;
export type CashflowKind = (typeof CASHFLOW_KINDS)[number];

export interface CashflowInput {
  kind: CashflowKind;
  direction: "in" | "out";
  title: string;
  amount: number | null;
  recurrence: ScheduleRow["recurrence"];
  startDay: string | null;
  endDay?: string | null;
  certainty: "confirmed" | "estimated";
  installmentPlanId?: number | null;
  contactId?: number | null;
  source: "user" | "voice" | "chat";
}

const scope = (user: CoachUser) => and(eq(scheduledCashflows.userId, user.userId), eq(scheduledCashflows.userType, user.userType));

function toScheduleRow(row: typeof scheduledCashflows.$inferSelect): ScheduleRow {
  return {
    id: row.id,
    kind: row.kind,
    direction: row.direction === "in" ? "in" : "out",
    title: row.title,
    amount: row.amount,
    recurrence: row.recurrence as ScheduleRow["recurrence"],
    startDay: row.startDay,
    endDay: row.endDay,
    certainty: row.certainty === "estimated" ? "estimated" : "confirmed",
    status: row.status,
    trackedFrom: businessDateKey(row.createdAt),
  };
}

export async function listCashflows(user: CoachUser): Promise<ScheduleRow[]> {
  const rows = await db.select().from(scheduledCashflows).where(and(scope(user), inArray(scheduledCashflows.status, ["active", "paused"])))
    .orderBy(desc(scheduledCashflows.createdAt)).limit(200);
  return rows.map(toScheduleRow);
}

async function assertOwned(user: CoachUser, input: Pick<CashflowInput, "installmentPlanId" | "contactId">): Promise<void> {
  if (input.installmentPlanId) {
    const [plan] = await db.select({ id: installmentPlans.id }).from(installmentPlans).where(and(
      eq(installmentPlans.id, input.installmentPlanId), eq(installmentPlans.userId, user.userId), eq(installmentPlans.userType, user.userType),
    )).limit(1);
    if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "خطة القسط دي مش موجودة." });
  }
  if (input.contactId) {
    const [contact] = await db.select({ id: userContacts.id }).from(userContacts).where(and(
      eq(userContacts.id, input.contactId), eq(userContacts.userId, user.userId), eq(userContacts.userType, user.userType),
    )).limit(1);
    if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "الشخص ده مش في جهات اتصالك." });
  }
}

export async function createCashflow(user: CoachUser, input: CashflowInput): Promise<{ id: number }> {
  await assertOwned(user, input);
  if (input.installmentPlanId) {
    // An installment plan has one schedule: a second one would count the same installment twice.
    const [existing] = await db.select({ id: scheduledCashflows.id }).from(scheduledCashflows).where(and(
      scope(user), eq(scheduledCashflows.installmentPlanId, input.installmentPlanId),
    )).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "القسط ده ليه موعد متسجل بالفعل؛ عدّله بدل ما تضيفه تاني." });
  }
  const [inserted] = await db.insert(scheduledCashflows).values({
    userId: user.userId,
    userType: user.userType,
    kind: input.kind,
    direction: input.direction,
    title: input.title,
    amount: input.amount === null ? null : new Decimal(input.amount).toFixed(2),
    recurrence: input.recurrence,
    startDay: input.startDay,
    endDay: input.endDay ?? null,
    certainty: input.certainty,
    source: input.source,
    installmentPlanId: input.installmentPlanId ?? null,
    contactId: input.contactId ?? null,
  });
  return { id: Number(inserted.insertId) };
}

export async function updateCashflow(
  user: CoachUser,
  id: number,
  patch: Partial<Omit<CashflowInput, "source" | "installmentPlanId">> & { status?: "active" | "paused" | "ended" },
): Promise<void> {
  await assertOwned(user, { contactId: patch.contactId });
  const set: Partial<typeof scheduledCashflows.$inferInsert> = {};
  if (patch.kind) set.kind = patch.kind;
  if (patch.direction) set.direction = patch.direction;
  if (patch.title) set.title = patch.title;
  if (patch.amount !== undefined) set.amount = patch.amount === null ? null : new Decimal(patch.amount).toFixed(2);
  if (patch.recurrence) set.recurrence = patch.recurrence;
  if (patch.startDay !== undefined) set.startDay = patch.startDay;
  if (patch.endDay !== undefined) set.endDay = patch.endDay;
  if (patch.certainty) set.certainty = patch.certainty;
  if (patch.contactId !== undefined) set.contactId = patch.contactId;
  if (patch.status) set.status = patch.status;
  const [result] = await db.update(scheduledCashflows).set(set).where(and(scope(user), eq(scheduledCashflows.id, id)));
  if (!(result as { affectedRows?: number }).affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "الالتزام ده مش موجود." });
}

/**
 * Records that a payment settles (part of) a due date. With `expenseId` it is that ledger row, which must be the
 * user's, money going out (or in, for income), and not already allocated beyond its amount; without, the user says
 * it was paid off the records, once per due date. The due date must be one of the schedule's own.
 */
export async function settle(
  user: CoachUser,
  input: { cashflowId: number; dueDay: string; expenseId?: number | null; amount?: number | null },
): Promise<{ id: number; amount: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(scheduledCashflows).where(and(scope(user), eq(scheduledCashflows.id, input.cashflowId))).limit(1).for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الالتزام ده مش موجود." });
    const schedule = toScheduleRow(row);
    if (!dueDays(schedule, input.dueDay, input.dueDay).length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "اليوم ده مش من مواعيد الالتزام ده." });
    }
    const paidRows = await tx.select({ amount: cashflowSettlements.amount, expenseId: cashflowSettlements.expenseId }).from(cashflowSettlements).where(and(
      eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType),
      eq(cashflowSettlements.cashflowId, input.cashflowId), eq(cashflowSettlements.dueDay, input.dueDay),
    ));
    const paid = paidRows.reduce((sum, paidRow) => sum.plus(paidRow.amount), new Decimal(0));
    const due = row.amount === null ? null : new Decimal(row.amount);
    const owed = due ? Decimal.max(0, due.minus(paid)) : null;
    if (owed?.isZero() || (due === null && paidRows.length > 0)) {
      throw new TRPCError({ code: "CONFLICT", message: "الموعد ده متسدد بالفعل." });
    }

    let amount: Decimal;
    if (input.expenseId) {
      const [expense] = await tx.select({ id: expenses.id, amount: expenses.amount, type: expenses.type }).from(expenses).where(and(
        eq(expenses.id, input.expenseId), eq(expenses.userId, user.userId), eq(expenses.userType, user.userType),
      )).limit(1).for("update");
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "العملية دي مش موجودة." });
      const size = new Decimal(expense.amount);
      const wantsIn = row.direction === "in";
      if (size.lte(0) || (wantsIn ? expense.type !== "income" && expense.type !== "transfer" : expense.type === "income")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: wantsIn ? "دي مش فلوس داخلة." : "دي مش فلوس خارجة (مرتجع أو دخل)." });
      }
      const [allocated] = await tx.select({ total: sql<string>`COALESCE(SUM(${cashflowSettlements.amount}), 0)` }).from(cashflowSettlements).where(and(
        eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), eq(cashflowSettlements.expenseId, expense.id),
      ));
      const free = size.minus(allocated?.total ?? 0);
      if (free.lte(0)) throw new TRPCError({ code: "CONFLICT", message: "العملية دي متوزعة كلها على مواعيد تانية." });
      amount = new Decimal(input.amount ?? Decimal.min(free, owed ?? free));
      if (amount.gt(free)) throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ أكبر من اللي فاضل من العملية." });
    } else {
      if (paidRows.some((paidRow) => paidRow.expenseId === null)) throw new TRPCError({ code: "CONFLICT", message: "الموعد ده اتقال إنه اتدفع قبل كده." });
      if (input.amount === undefined || input.amount === null) {
        if (!owed) throw new TRPCError({ code: "BAD_REQUEST", message: "قول دفعت كام." });
        amount = owed;
      } else {
        amount = new Decimal(input.amount);
      }
    }
    if (amount.lte(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ لازم يكون أكبر من صفر." });
    if (owed && amount.gt(owed)) throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ أكبر من المطلوب في الموعد ده." });
    const [inserted] = await tx.insert(cashflowSettlements).values({
      userId: user.userId,
      userType: user.userType,
      cashflowId: input.cashflowId,
      dueDay: input.dueDay,
      expenseId: input.expenseId ?? null,
      amount: amount.toFixed(2),
      source: input.expenseId ? "linked" : "declared",
    });
    return { id: Number(inserted.insertId), amount: amount.toNumber() };
  });
}

export async function unsettle(user: CoachUser, settlementId: number): Promise<void> {
  await db.delete(cashflowSettlements).where(and(
    eq(cashflowSettlements.id, settlementId), eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType),
  ));
}

async function settlementsSince(user: CoachUser, fromDay: string) {
  return db.select({
    cashflowId: cashflowSettlements.cashflowId, dueDay: cashflowSettlements.dueDay, amount: cashflowSettlements.amount, expenseId: cashflowSettlements.expenseId,
  }).from(cashflowSettlements).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), gte(cashflowSettlements.dueDay, fromDay),
  ));
}

/** The due dates in [from, to] with what was paid toward each. */
export async function upcoming(user: CoachUser, from: string, to: string, today = businessDateKey()): Promise<Occurrence[]> {
  const [rows, settlements] = await Promise.all([listCashflows(user), settlementsSince(user, from)]);
  return occurrences(rows, settlements, from, to, today);
}

/** What the records say is free until the next payday (api/services/coach/schedule.ts#cashPosition). */
export async function position(user: CoachUser, now = new Date()): Promise<CashPosition> {
  const today = businessDateKey(now);
  const [rows, settlements, wallets, profile] = await Promise.all([
    listCashflows(user),
    settlementsSince(user, addDays(today, -60)),
    db.select({ balance: userWallets.balance, observedAt: userWallets.balanceObservedAt }).from(userWallets)
      .where(and(eq(userWallets.userId, user.userId), eq(userWallets.userType, user.userType))),
    getProfileSnapshot({ userId: user.userId, userType: user.userType }).catch(() => null),
  ]);
  return cashPosition({ today, salaryDay: profile?.salaryDay ?? null, wallets, rows, settlements });
}

/**
 * Recorded payments that may have paid a due date: the user's own expenses within a week of it, not refunds, with
 * room left to allocate, whose amount is what is owed or whose words share one with the schedule's title. Offered to
 * the user to confirm; never linked by this function.
 */
export async function suggestPayments(user: CoachUser, occurrence: Pick<Occurrence, "cashflowId" | "dueDay" | "remaining" | "title" | "direction">) {
  const from = startOfBusinessDay(new Date(`${addDays(occurrence.dueDay, -7)}T12:00:00Z`));
  const to = startOfBusinessDay(new Date(`${addDays(occurrence.dueDay, 8)}T12:00:00Z`));
  const rows = await db.select({ id: expenses.id, amount: expenses.amount, description: expenses.description, category: expenses.category, date: expenses.date, type: expenses.type })
    .from(expenses).where(and(
      eq(expenses.userId, user.userId), eq(expenses.userType, user.userType), gte(expenses.date, from), lte(expenses.date, to),
    )).orderBy(desc(expenses.date)).limit(60);
  const words = occurrence.title.split(/\s+/).filter((word) => word.length >= 3);
  return rows
    .filter((row) => Number(row.amount) > 0 && (occurrence.direction === "in" ? row.type !== "expense" : row.type !== "income"))
    .map((row) => ({
      ...row,
      amount: Number(row.amount),
      sameAmount: occurrence.remaining !== null && Math.abs(Number(row.amount) - occurrence.remaining) < 0.5,
      sharedWord: words.find((word) => `${row.description ?? ""} ${row.category ?? ""}`.includes(word)) ?? null,
    }))
    .filter((row) => row.sameAmount || row.sharedWord)
    .slice(0, 5);
}

/**
 * An edited ledger row that can no longer pay what it was allocated to (now smaller than its allocations, or no
 * longer money going out) releases them all; the due dates show as unpaid again for the user to link anew.
 * Called inside the edit's transaction.
 */
export async function reconcileSettlementsOf(
  tx: Pick<typeof db, "delete" | "select">,
  user: CoachUser,
  expenseId: number,
  amount: string | number,
): Promise<void> {
  const [allocated] = await tx.select({ total: sql<string>`COALESCE(SUM(${cashflowSettlements.amount}), 0)` }).from(cashflowSettlements).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), eq(cashflowSettlements.expenseId, expenseId),
  ));
  const total = new Decimal(allocated?.total ?? 0);
  if (total.isZero()) return;
  if (new Decimal(amount).lt(total)) await releaseSettlementsOf(tx, user, [expenseId]);
}

/** A deleted ledger row pays nothing any more: its allocations go with it. Called inside the delete's transaction. */
export async function releaseSettlementsOf(
  tx: Pick<typeof db, "delete">,
  user: CoachUser,
  expenseIds: number[],
): Promise<void> {
  if (!expenseIds.length) return;
  await tx.delete(cashflowSettlements).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), inArray(cashflowSettlements.expenseId, expenseIds),
  ));
}
