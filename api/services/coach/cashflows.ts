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
import { normalizeArabic } from "../../lib/unified-normalizer";
import { db } from "../../queries/connection";
import { LOAN_CATEGORY, LOAN_SUBCATEGORY } from "../debt-ledger";
import { getProfileSnapshot } from "../finance-semantic-layer";
import { addDays, cashPosition, dueDays, isCalendarDay, occurrences, type CashPosition, type Occurrence, type ScheduleRow } from "./schedule";

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

function toScheduleRow(row: typeof scheduledCashflows.$inferSelect, contactName: string | null = null): ScheduleRow {
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
    contactId: row.contactId,
    contactName,
  };
}

export async function listCashflows(user: CoachUser): Promise<ScheduleRow[]> {
  const rows = await db.select({ schedule: scheduledCashflows, contactName: userContacts.name }).from(scheduledCashflows)
    .leftJoin(userContacts, and(eq(userContacts.id, scheduledCashflows.contactId), eq(userContacts.userId, user.userId), eq(userContacts.userType, user.userType)))
    .where(and(scope(user), inArray(scheduledCashflows.status, ["active", "paused"])))
    .orderBy(desc(scheduledCashflows.createdAt)).limit(200);
  return rows.map((row) => toScheduleRow(row.schedule, row.contactName));
}

/** Exact normalized names only: overlapping or duplicate names need the user's choice, never a fuzzy guess. */
export async function resolveCashflowContact(user: CoachUser, input: { id?: number; name?: string }) {
  const key = (name: string) => normalizeArabic(name).toLocaleLowerCase().replace(/\s+/g, " ");
  const rows = await db.select({ id: userContacts.id, name: userContacts.name, relation: userContacts.relation }).from(userContacts).where(and(
    eq(userContacts.userId, user.userId), eq(userContacts.userType, user.userType),
    ...(input.id !== undefined ? [eq(userContacts.id, input.id)] : []),
  ));
  const matches = input.name ? rows.filter((row) => key(row.name) === key(input.name!)) : rows;
  if (matches.length > 1) return { error: "الاسم ده متسجل أكتر من مرة. اسأل مين المقصود من الاختيارات، من غير تخمين ولا قراءة أرقام الأشخاص.", choices: matches.slice(0, 10).map((row) => ({ contact_id: row.id, name: row.name, relation: row.relation })) };
  if (!matches.length) return input.id !== undefined
    ? { error: "الشخص ده مش موجود بالاسم والرقم دول في جهات اتصالك. راجع الشخص قبل المسودة." }
    : { contact: null };
  return { contact: matches[0] };
}

type Payment = Pick<typeof expenses.$inferSelect, "amount" | "type" | "category" | "subCategory" | "contactId" | "businessId" | "status" | "parsedMetadata">;
type Payable = Pick<ScheduleRow, "kind" | "direction" | "contactId">;

/** Used by suggestions, confirmation and edits: a transfer's direction is never inferred from its positive size. */
export function canPayCashflow(schedule: Payable, payment: Payment): boolean {
  if (payment.status !== "confirmed" || payment.businessId !== null || new Decimal(payment.amount).lte(0)) return false;
  const direction = (payment.parsedMetadata as { direction?: string } | null)?.direction;
  const rightWay = payment.type === "transfer"
    ? direction === (schedule.direction === "in" ? "incoming" : "outgoing")
    : payment.type === (schedule.direction === "in" ? "income" : "expense");
  if (!rightWay || (schedule.contactId != null && payment.contactId !== schedule.contactId)) return false;
  return schedule.kind !== "debt" || (payment.type === "transfer" && payment.category === LOAN_CATEGORY && payment.subCategory === LOAN_SUBCATEGORY);
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
  assertDates(input);
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

function assertDates(input: { startDay?: string | null; endDay?: string | null }) {
  if ((input.startDay != null && !isCalendarDay(input.startDay)) || (input.endDay != null && !isCalendarDay(input.endDay)) ||
      (input.startDay && input.endDay && input.endDay < input.startDay)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ميعاد الالتزام مش صحيح. اختار يوم موجود، والنهاية بعد البداية." });
  }
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
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(scheduledCashflows).where(and(scope(user), eq(scheduledCashflows.id, id))).limit(1).for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الالتزام ده مش موجود." });
    if (!Object.keys(set).length) return;
    const changed = toScheduleRow({ ...row, ...set } as typeof row);
    assertDates(changed);
    const allocations = await tx.select().from(cashflowSettlements).where(and(
      eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), eq(cashflowSettlements.cashflowId, id),
    ));
    const paidByDay = new Map<string, Decimal>();
    for (const allocation of allocations) {
      paidByDay.set(allocation.dueDay, (paidByDay.get(allocation.dueDay) ?? new Decimal(0)).plus(allocation.amount));
      if (!dueDays(changed, allocation.dueDay, allocation.dueDay).length) throw new TRPCError({ code: "CONFLICT", message: "فيه سداد مربوط بالميعاد القديم. فكّ ربطه قبل تغيير الميعاد." });
      if (allocation.expenseId !== null) {
        const [payment] = await tx.select().from(expenses).where(and(eq(expenses.id, allocation.expenseId), eq(expenses.userId, user.userId), eq(expenses.userType, user.userType))).limit(1);
        if (!payment || !canPayCashflow(changed, payment)) throw new TRPCError({ code: "CONFLICT", message: "التعديل ده مش متوافق مع السداد المربوط. فكّ ربط السداد الأول." });
      }
    }
    if (changed.amount !== null && [...paidByDay.values()].some((paid) => paid.gt(changed.amount!))) throw new TRPCError({ code: "CONFLICT", message: "المبلغ الجديد أقل من السداد المربوط. راجع السداد الأول." });
    await tx.update(scheduledCashflows).set(set).where(and(scope(user), eq(scheduledCashflows.id, id)));
  });
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
      const [expense] = await tx.select().from(expenses).where(and(
        eq(expenses.id, input.expenseId), eq(expenses.userId, user.userId), eq(expenses.userType, user.userType),
      )).limit(1).for("update");
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "العملية دي مش موجودة." });
      const size = new Decimal(expense.amount);
      if (!canPayCashflow(schedule, expense)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "العملية دي مش فلوس " + (row.direction === "in" ? "داخلة" : "خارجة") + " مناسبة للالتزام وصاحبه." });
      }
      // A locking read sees allocations committed while this transaction waited for the expense lock.
      // Its earlier per-date read may already have created an older repeatable-read snapshot.
      const allocated = await tx.select({ amount: cashflowSettlements.amount }).from(cashflowSettlements).where(and(
        eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), eq(cashflowSettlements.expenseId, expense.id),
      )).for("update");
      const free = size.minus(allocated.reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0)));
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

export async function listSettlements(user: CoachUser, fromDay: string, toDay?: string) {
  return db.select({
    id: cashflowSettlements.id, source: cashflowSettlements.source,
    cashflowId: cashflowSettlements.cashflowId, dueDay: cashflowSettlements.dueDay, amount: cashflowSettlements.amount, expenseId: cashflowSettlements.expenseId,
  }).from(cashflowSettlements).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), gte(cashflowSettlements.dueDay, fromDay),
    ...(toDay ? [lte(cashflowSettlements.dueDay, toDay)] : []),
  ));
}

/** The due dates in [from, to] with what was paid toward each. */
export async function upcoming(user: CoachUser, from: string, to: string, today = businessDateKey()): Promise<Occurrence[]> {
  const [rows, settlements] = await Promise.all([listCashflows(user), listSettlements(user, from, to)]);
  return occurrences(rows, settlements, from, to, today);
}

/** What the records say is free until the next payday (api/services/coach/schedule.ts#cashPosition). */
export async function position(user: CoachUser, now = new Date()): Promise<CashPosition> {
  const today = businessDateKey(now);
  const [rows, settlements, wallets, profile] = await Promise.all([
    listCashflows(user),
    listSettlements(user, addDays(today, -60)),
    db.select({ balance: userWallets.balance, observedAt: userWallets.balanceObservedAt }).from(userWallets)
      .where(and(eq(userWallets.userId, user.userId), eq(userWallets.userType, user.userType))),
    getProfileSnapshot({ userId: user.userId, userType: user.userType }).catch(() => null),
  ]);
  return cashPosition({ today, salaryDay: profile?.salaryDay ?? null, wallets, rows, settlements });
}

/**
 * Recorded payments that may have paid a due date: the user's own expenses within a week of it, not refunds, with
 * room left to allocate, whose available amount is what is owed or whose words share one with the schedule's title.
 * A contact-linked commitment instead requires that exact contact. Offered to the user; never linked here.
 */
export async function suggestPayments(user: CoachUser, occurrence: Occurrence) {
  const from = startOfBusinessDay(new Date(`${addDays(occurrence.dueDay, -7)}T12:00:00Z`));
  const to = startOfBusinessDay(new Date(`${addDays(occurrence.dueDay, 8)}T12:00:00Z`));
  const rows = await db.select()
    .from(expenses).where(and(
      eq(expenses.userId, user.userId), eq(expenses.userType, user.userType), gte(expenses.date, from), lte(expenses.date, to),
    )).orderBy(desc(expenses.date)).limit(60);
  const words = occurrence.title.split(/\s+/).filter((word) => word.length >= 3);
  const allocated = rows.length ? await db.select({ expenseId: cashflowSettlements.expenseId, total: sql<string>`SUM(${cashflowSettlements.amount})` })
    .from(cashflowSettlements).where(and(eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType),
      inArray(cashflowSettlements.expenseId, rows.map((row) => row.id))))
    .groupBy(cashflowSettlements.expenseId) : [];
  const used = new Map(allocated.map((row) => [row.expenseId, row.total]));
  return rows
    .filter((row) => canPayCashflow(occurrence, row))
    .map((row) => ({
      id: row.id, description: row.description, category: row.category, date: row.date, type: row.type,
      amount: Number(row.amount),
      available: Decimal.max(0, new Decimal(row.amount).minus(used.get(row.id) ?? 0)).toNumber(),
      sameAmount: occurrence.remaining !== null && new Decimal(row.amount).minus(used.get(row.id) ?? 0).eq(occurrence.remaining),
      sharedWord: words.find((word) => `${row.description ?? ""} ${row.category ?? ""}`.includes(word)) ?? null,
    }))
    .filter((row) => row.available > 0 && (occurrence.contactId != null || row.sameAmount || row.sharedWord))
    .slice(0, 5);
}

/**
 * An edited ledger row releases incompatible allocations (direction, contact, kind, personal scope or status).
 * If the remaining valid allocations exceed its new size, it releases those too, for the user to link anew.
 * Called inside the edit's transaction.
 */
export async function reconcileSettlementsOf(
  tx: Pick<typeof db, "delete" | "select">,
  user: CoachUser,
  expenseId: number,
): Promise<void> {
  const [payment] = await tx.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.userId, user.userId), eq(expenses.userType, user.userType))).limit(1);
  if (!payment) return releaseSettlementsOf(tx, user, [expenseId]);
  const allocations = await tx.select({ id: cashflowSettlements.id, amount: cashflowSettlements.amount, schedule: scheduledCashflows }).from(cashflowSettlements)
    .innerJoin(scheduledCashflows, and(eq(scheduledCashflows.id, cashflowSettlements.cashflowId), scope(user))).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), eq(cashflowSettlements.expenseId, expenseId),
  ));
  const invalid = allocations.filter((allocation) => !canPayCashflow(toScheduleRow(allocation.schedule), payment));
  if (invalid.length) await tx.delete(cashflowSettlements).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), inArray(cashflowSettlements.id, invalid.map((allocation) => allocation.id)),
  ));
  const remaining = allocations.filter((allocation) => !invalid.includes(allocation)).reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));
  if (new Decimal(payment.amount).lt(remaining)) await releaseSettlementsOf(tx, user, [expenseId]);
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
