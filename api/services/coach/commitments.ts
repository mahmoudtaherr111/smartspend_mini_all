/**
 * The commitments ecosystem (docs/decisions/0051-commitments-ecosystem.md): installments, schedules, open-ended bills
 * and income, debts with people and gam3eyas, each set up once with fixed fields, then paid by whatever the user
 * already records. This module creates and changes them, computes where each stands, records a payment for a due date,
 * links a recorded payment by the strict rules of ./matcher.ts, and keeps the questions the app asks when it opens.
 *
 * The ledger stays the only truth about money: a commitment never writes money unless the user pays from it ("دفعته"),
 * and a link only says which due date a ledger row paid (`cashflow_settlements`). Every read and write is scoped to the
 * user's id and type.
 */
import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  cashflowSettlements,
  commitmentHints,
  commitmentOverrides,
  commitmentQuestions,
  commitmentScheduleItems,
  expenses,
  installmentPlans,
  scheduledCashflows,
  subscriptionCatalog,
  userContacts,
} from "../../../db/schema";
import { businessDateKey } from "../../lib/app-time";
import { getSystemSettings } from "../../lib/settings-cache";
import { planNumber } from "../../../contracts/plan-features";
import { createLogger } from "../../lib/log";
import { db } from "../../queries/connection";
import { createLedgerEntry, updateLedgerEntry } from "../ledger-writer";
import { recordingEngineOf } from "../recording/engine-switch";
import { loadReadingLogItems } from "../recording/reading-log";
import { readingItemFor } from "../recording/saved-reading";
import { addDynamicContact } from "../user-profile-service";
import { GAM3EYA_SUBCATEGORY, LOAN_CATEGORY, LOAN_SUBCATEGORY } from "../debt-ledger";
import {
  canPayCashflow,
  createCashflow,
  settle,
  suggestPayments,
  toScheduleRow,
  unsettle,
  updateCashflow,
  withScheduleDetails,
  type CashflowKind,
  type CoachUser,
} from "./cashflows";
import { logoOf } from "../../lib/capture/brand-logos";
import { decideMatch, learnedPhrase, matchTokens, sayHintOf, type MatchCommitment } from "./matcher";
import { addDays, isCalendarDay, occurrences, type Occurrence, type ScheduleRow, type Shape } from "./schedule";

const log = createLogger("commitments");

export const SHAPES = ["fixed", "schedule", "recurring", "balance", "gam3eya"] as const;
export const PAYMENT_METHODS = ["cash", "app", "auto_debit", "salary", "card"] as const;

/** Where a payment of a kind is filed, and as what movement. Names from contracts/categories.ts. */
export interface Filing {
  type: "expense" | "income" | "transfer";
  category: string;
  subCategory: string;
  movementKind?: "loan" | "gam3eya" | "card_payment";
}

/**
 * The default filing of a kind. Property installments go to «أقساط وفوايد» only through a property commitment the user
 * set up: a sentence that merely says "شقة" never lands there (the matcher needs the commitment and a strong sign).
 */
export function defaultFiling(kind: string, direction: "in" | "out"): Filing {
  if (kind === "debt") return { type: "transfer", category: LOAN_CATEGORY, subCategory: LOAN_SUBCATEGORY, movementKind: "loan" };
  if (kind === "gam3eya") return { type: "transfer", category: LOAN_CATEGORY, subCategory: GAM3EYA_SUBCATEGORY, movementKind: "gam3eya" };
  if (kind === "card") return { type: "transfer", category: LOAN_CATEGORY, subCategory: "تحويل بنكي", movementKind: "card_payment" };
  if (direction === "in") {
    if (kind === "salary") return { type: "income", category: "مرتب", subCategory: "مرتب أساسي" };
    if (kind === "freelance") return { type: "income", category: "عمل حر", subCategory: "مشروع" };
    return { type: "income", category: "دخل آخر", subCategory: "عام" };
  }
  switch (kind) {
    case "installment": case "loan": case "property": return { type: "expense", category: "أقساط وفوايد", subCategory: "أقساط" };
    case "school": return { type: "expense", category: "تعليم", subCategory: "مدرسة" };
    case "university": return { type: "expense", category: "تعليم", subCategory: "جامعة" };
    case "lessons": return { type: "expense", category: "تعليم", subCategory: "دروس خصوصية" };
    case "rent": return { type: "expense", category: "سكن", subCategory: "إيجار" };
    case "bill": return { type: "expense", category: "فواتير", subCategory: "عام" };
    case "subscription": return { type: "expense", category: "اشتراكات", subCategory: "عام" };
    default: return { type: "expense", category: "متنوعات", subCategory: "عام" };
  }
}

/** The filing of a commitment: its own category when set, else its kind's. */
export function filingOf(row: { kind: string; direction: string; category?: string | null; subCategory?: string | null }): Filing {
  const base = defaultFiling(row.kind, row.direction === "in" ? "in" : "out");
  if (base.movementKind || !row.category) return base;
  return { ...base, category: row.category, subCategory: row.subCategory || "عام" };
}

const DEFAULT_TITLES: Record<string, string> = {
  rent: "الإيجار", bill: "فاتورة", subscription: "اشتراك", school: "مصاريف المدرسة", university: "مصاريف الجامعة",
  lessons: "الدروس", installment: "قسط", loan: "قرض", property: "قسط الشقة", card: "كارت الائتمان", debt: "سلفة",
  gam3eya: "جمعية", salary: "المرتب", freelance: "شغل حر", other: "التزام",
};

export interface CommitmentFields {
  shape: Shape;
  kind: CashflowKind;
  title?: string | null;
  direction?: "in" | "out";
  provider?: string | null;
  catalogSlug?: string | null;
  contactId?: number | null;
  /** A person named in the form ("فريدة اختي", "محمد ابني"), made a contact when no id is given. */
  contactName?: string | null;
  contactRelation?: string | null;
  beneficiaryContactId?: number | null;
  beneficiaryName?: string | null;
  beneficiaryRelation?: string | null;
  amount?: number | null;
  amountVaries?: boolean;
  recurrence?: "once" | "weekly" | "monthly" | "yearly";
  intervalCount?: number;
  startDay?: string | null;
  endDay?: string | null;
  /** Fixed: installments in all; balance in installments: their number; gam3eya: months. */
  occurrenceCount?: number | null;
  /** Fixed: installments still owed, when the user says "فاضل كام" instead of the total. */
  remainingCount?: number | null;
  paidBeforeCount?: number | null;
  totalAmount?: number | null;
  /** Balance: once on `startDay`, installments, or on the person's own time. */
  repayment?: "once" | "installments" | "flexible";
  items?: Array<{ dueDay: string; amount: number; label?: string | null }>;
  /** Schedule: what was paid before today, settled as declared over the first items. */
  paidSoFar?: number | null;
  gam3eyaTurn?: number | null;
  /** A gam3eya with several shares: the turn of each (1 to 3 of them); `amount` is then one share's. */
  gam3eyaTurns?: number[] | null;
  paymentMethod?: (typeof PAYMENT_METHODS)[number] | null;
  category?: string | null;
  subCategory?: string | null;
  originExpenseId?: number | null;
  remindDaysBefore?: number | null;
  remindHour?: number | null;
  remindersEnabled?: boolean;
  source?: "user" | "voice" | "chat";
}

const bad = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

async function personId(user: CoachUser, id: number | null | undefined, name: string | null | undefined, relation: string | null | undefined) {
  if (id) return id;
  const cleanName = name?.trim();
  if (!cleanName) return null;
  const added = await addDynamicContact(user.userId, user.userType, cleanName, relation?.trim() || "شخص معروف");
  return added?.contactId ?? null;
}

/** Creates a commitment from its shape's fixed fields; a gam3eya also gets its payout row. */
export async function createCommitment(user: CoachUser, input: CommitmentFields, plan?: string | null): Promise<{ id: number; payoutId: number | null }> {
  const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));
  const limit = planNumber(settings, plan, "commitments_active_limit");
  if (limit > 0) {
    const active = await db.select({ id: scheduledCashflows.id }).from(scheduledCashflows).where(and(
      eq(scheduledCashflows.userId, user.userId), eq(scheduledCashflows.userType, user.userType),
      eq(scheduledCashflows.status, "active"), isNull(scheduledCashflows.parentId),
    ));
    if (active.length >= limit) throw new TRPCError({ code: "FORBIDDEN", message: `باقتك فيها ${limit} التزامات شغالة. وقّف واحد أو رقّي باقتك.` });
  }
  const direction = input.direction ?? (["salary", "freelance"].includes(input.kind) ? "in" : "out");
  const title = input.title?.trim() || DEFAULT_TITLES[input.kind] || "التزام";
  const contactId = await personId(user, input.contactId, input.contactName, input.contactRelation);
  const beneficiaryContactId = await personId(user, input.beneficiaryContactId, input.beneficiaryName, input.beneficiaryRelation);
  const base = {
    kind: input.kind,
    direction,
    title,
    certainty: input.kind === "freelance" ? "estimated" as const : "confirmed" as const,
    source: input.source ?? "user" as const,
    shape: input.shape,
    provider: input.provider?.trim() || null,
    catalogSlug: input.catalogSlug ?? null,
    contactId,
    beneficiaryContactId,
    paymentMethod: input.paymentMethod ?? null,
    category: input.category ?? null,
    subCategory: input.subCategory ?? null,
    originExpenseId: input.originExpenseId ?? null,
    remindDaysBefore: input.remindDaysBefore ?? null,
    remindHour: input.remindHour ?? null,
    remindersEnabled: input.remindersEnabled ?? true,
    intervalCount: Math.max(1, Math.floor(input.intervalCount ?? 1)),
    endDay: input.endDay ?? null,
  };
  const positive = (value: number | null | undefined) => value != null && value > 0;
  let id: number;
  switch (input.shape) {
    case "fixed": {
      if (!positive(input.amount)) throw bad("اكتب القسط كام.");
      if (!input.startDay) throw bad("اختار ميعاد القسط الجاي.");
      const remaining = input.remainingCount ?? (input.occurrenceCount != null ? input.occurrenceCount - (input.paidBeforeCount ?? 0) : null);
      if (remaining == null || remaining < 1) throw bad("اكتب فاضل كام قسط.");
      const total = input.occurrenceCount ?? remaining + (input.paidBeforeCount ?? 0);
      ({ id } = await createCashflow(user, {
        ...base, amount: input.amount!, recurrence: input.recurrence ?? "monthly", startDay: input.startDay,
        occurrenceCount: total, paidBeforeCount: total - remaining,
      }));
      break;
    }
    case "schedule": {
      const items = (input.items ?? []).filter((item) => isCalendarDay(item.dueDay) && item.amount > 0);
      if (!items.length) throw bad("ضيف دفعة واحدة على الأقل بتاريخها ومبلغها.");
      if (new Set(items.map((item) => item.dueDay)).size !== items.length) throw bad("كل دفعة ليها يوم مختلف.");
      ({ id } = await createCashflow(user, { ...base, amount: null, recurrence: "once", startDay: null }));
      await db.insert(commitmentScheduleItems).values(items.map((item) => ({
        userId: user.userId, userType: user.userType, cashflowId: id, dueDay: item.dueDay,
        amount: new Decimal(item.amount).toFixed(2), label: item.label?.trim() || null,
      })));
      if (positive(input.paidSoFar)) await declarePaidSoFar(user, id, new Decimal(input.paidSoFar!));
      break;
    }
    case "recurring": {
      if (!input.startDay) throw bad("اختار الميعاد الجاي.");
      if (!positive(input.amount) && !input.amountVaries) throw bad("اكتب المبلغ، أو اختار «بيتغير».");
      ({ id } = await createCashflow(user, {
        ...base, amount: positive(input.amount) ? input.amount! : null, amountVaries: input.amountVaries ?? false,
        recurrence: input.recurrence ?? "monthly", startDay: input.startDay,
      }));
      break;
    }
    case "balance": {
      if (!contactId) throw bad("اختار الشخص أو اكتب اسمه.");
      if (!positive(input.totalAmount)) throw bad("اكتب المبلغ كام.");
      const repayment = input.repayment ?? "flexible";
      if (repayment !== "flexible" && !input.startDay) throw bad("اختار الميعاد.");
      if (repayment === "installments" && (!positive(input.amount) || !input.occurrenceCount)) throw bad("اكتب القسط كام وعلى كام مرة.");
      if (positive(input.paidSoFar) && new Decimal(input.paidSoFar!).gte(input.totalAmount!)) throw bad("اللي اتدفع لازم يبقى أقل من المبلغ كله.");
      ({ id } = await createCashflow(user, {
        ...base, kind: "debt", shape: "balance", totalAmount: input.totalAmount!,
        amount: repayment === "installments" ? input.amount! : repayment === "once" ? input.totalAmount! : null,
        recurrence: repayment === "installments" ? "monthly" : "once",
        startDay: repayment === "flexible" ? null : input.startDay!,
        occurrenceCount: repayment === "installments" ? input.occurrenceCount! : null,
      }));
      if (positive(input.paidSoFar)) await declarePaidOnDates(user, id, new Decimal(input.paidSoFar!));
      break;
    }
    case "gam3eya": {
      if (!positive(input.amount)) throw bad("اكتب قسط الجمعية كام.");
      if (!input.startDay) throw bad("اختار أول شهر وميعاد الدفع.");
      const months = input.occurrenceCount ?? 0;
      if (months < 2 || months > 60) throw bad("الجمعية من شهرين لحد 60 شهر.");
      // Shares («سهمين»): the person pays one share's amount per share every month and collects once per share, on
      // each share's own turn. One share is the usual gam3eya.
      const turns = [...new Set(input.gam3eyaTurns?.length ? input.gam3eyaTurns : [input.gam3eyaTurn ?? 0])].sort((a, b) => a - b);
      const shares = turns.length;
      if (shares > 3) throw bad("الجمعية لحد 3 أسهم.");
      if ((input.gam3eyaTurns?.length ?? 1) !== shares) throw bad("كل سهم ليه دور مختلف.");
      for (const turn of turns) if (turn < 1 || turn > months) throw bad(`دورك رقم من 1 لحد ${months}.`);
      const share = new Decimal(input.amount!);
      ({ id } = await createCashflow(user, {
        ...base, kind: "gam3eya", direction: "out", amount: share.times(shares).toNumber(), recurrence: "monthly", startDay: input.startDay,
        occurrenceCount: months, gam3eyaTurn: turns[0],
      }));
      const dates = occurrences([{
        id, kind: "gam3eya", direction: "out", title, amount: input.amount!, recurrence: "monthly", startDay: input.startDay,
        endDay: null, certainty: "confirmed", status: "active", shape: "gam3eya", occurrenceCount: months,
      }], [], "1900-01-01", "2999-12-31", "1900-01-01");
      let payoutId: number | null = null;
      for (const turn of turns) {
        const payout = dates.find((item) => item.number === turn)!;
        const { id: made } = await createCashflow(user, {
          ...base, kind: "gam3eya", direction: "in", title: shares > 1 ? `قبض ${title} (دور ${turn})` : `قبض ${title}`,
          amount: share.times(months).toNumber(), recurrence: "once", startDay: payout.dueDay, shape: "recurring", parentId: id,
        });
        payoutId ??= made;
      }
      return { id, payoutId };
    }
  }
  return { id, payoutId: null };
}

/** What was repaid of a debt before it was added: declared over its first dates (its one undated "date" when flexible). */
async function declarePaidOnDates(user: CoachUser, cashflowId: number, amount: Decimal) {
  const [row] = await loadCommitments(user, { ids: [cashflowId], includeEnded: true });
  if (!row) return;
  const today = businessDateKey();
  let left = amount;
  for (const item of occurrences([row], [], "1900-01-01", addDays(today, 3660), today)) {
    if (left.lte(0)) break;
    const pay = Decimal.min(left, new Decimal(item.amount ?? item.remaining ?? 0));
    if (pay.lte(0)) continue;
    await settle(user, { cashflowId, dueDay: item.dueDay, expenseId: null, amount: pay.toNumber(), matchedBy: "user" });
    left = left.minus(pay);
  }
}

/** "اتدفع كام لحد النهارده" on a schedule: declared payments over the first items, oldest first. */
async function declarePaidSoFar(user: CoachUser, cashflowId: number, amount: Decimal) {
  const items = await db.select().from(commitmentScheduleItems).where(and(
    eq(commitmentScheduleItems.userId, user.userId), eq(commitmentScheduleItems.userType, user.userType), eq(commitmentScheduleItems.cashflowId, cashflowId),
  )).orderBy(commitmentScheduleItems.dueDay);
  let left = amount;
  for (const item of items) {
    if (left.lte(0)) break;
    const pay = Decimal.min(left, new Decimal(item.amount ?? 0));
    if (pay.lte(0)) continue;
    await settle(user, { cashflowId, dueDay: item.dueDay, expenseId: null, amount: pay.toNumber(), matchedBy: "user" });
    left = left.minus(pay);
  }
}

const own = (user: CoachUser) => and(eq(scheduledCashflows.userId, user.userId), eq(scheduledCashflows.userType, user.userType));

async function ownedRow(user: CoachUser, id: number) {
  const [row] = await db.select().from(scheduledCashflows).where(and(own(user), eq(scheduledCashflows.id, id))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الالتزام ده مش موجود." });
  return row;
}

/** Stops, pauses or resumes a commitment; a gam3eya's payout follows it. */
export async function setCommitmentStatus(user: CoachUser, id: number, status: "active" | "paused" | "ended"): Promise<void> {
  await ownedRow(user, id);
  await db.update(scheduledCashflows).set({ status }).where(and(own(user), or(eq(scheduledCashflows.id, id), eq(scheduledCashflows.parentId, id))));
}

/** One date changed by the user: skip it, move it, another amount this time; null clears the change. */
export async function setOverride(
  user: CoachUser,
  id: number,
  dueDay: string,
  change: { action: "skip" | "move" | "amount"; newDay?: string | null; amount?: number | null } | null,
): Promise<void> {
  await ownedRow(user, id);
  if (!isCalendarDay(dueDay)) throw bad("اليوم ده مش صحيح.");
  const where = and(eq(commitmentOverrides.userId, user.userId), eq(commitmentOverrides.userType, user.userType),
    eq(commitmentOverrides.cashflowId, id), eq(commitmentOverrides.dueDay, dueDay));
  if (!change) {
    await db.delete(commitmentOverrides).where(where);
    return;
  }
  if (change.action === "move" && (!change.newDay || !isCalendarDay(change.newDay))) throw bad("اختار اليوم الجديد.");
  if (change.action === "amount" && !(change.amount && change.amount > 0)) throw bad("اكتب المبلغ المرة دي.");
  const values = {
    action: change.action,
    newDay: change.action === "move" ? change.newDay! : null,
    amount: change.action === "amount" ? new Decimal(change.amount!).toFixed(2) : null,
  };
  await db.insert(commitmentOverrides).values({ userId: user.userId, userType: user.userType, cashflowId: id, dueDay, ...values })
    .onDuplicateKeyUpdate({ set: values });
}

/** Replaces a schedule's dates from `from` on (the school raised its fees from next term); paid dates stay. */
export async function replaceScheduleItems(
  user: CoachUser,
  id: number,
  items: Array<{ dueDay: string; amount: number; label?: string | null }>,
): Promise<void> {
  const row = await ownedRow(user, id);
  if (row.shape !== "schedule") throw bad("الالتزام ده مش جدول دفعات.");
  const paid = await db.select({ dueDay: cashflowSettlements.dueDay }).from(cashflowSettlements).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), eq(cashflowSettlements.cashflowId, id),
  ));
  const paidDays = new Set(paid.map((item) => item.dueDay));
  const clean = items.filter((item) => isCalendarDay(item.dueDay) && item.amount > 0 && !paidDays.has(item.dueDay));
  await db.transaction(async (tx) => {
    const where = and(eq(commitmentScheduleItems.userId, user.userId), eq(commitmentScheduleItems.userType, user.userType), eq(commitmentScheduleItems.cashflowId, id));
    const existing = await tx.select().from(commitmentScheduleItems).where(where);
    const removable = existing.filter((item) => !paidDays.has(item.dueDay)).map((item) => item.id);
    if (removable.length) await tx.delete(commitmentScheduleItems).where(and(where, inArray(commitmentScheduleItems.id, removable)));
    if (clean.length) await tx.insert(commitmentScheduleItems).values(clean.map((item) => ({
      userId: user.userId, userType: user.userType, cashflowId: id, dueDay: item.dueDay,
      amount: new Decimal(item.amount).toFixed(2), label: item.label?.trim() || null,
    })));
  });
}

export { updateCashflow as updateCommitment };

// ─── Reading: rows with names, progress and occurrences ───

export interface CommitmentRow extends ScheduleRow {
  provider: string | null;
  catalogSlug: string | null;
  beneficiaryContactId: number | null;
  beneficiaryName: string | null;
  paymentMethod: string | null;
  gam3eyaTurn: number | null;
  category: string | null;
  subCategory: string | null;
  remindDaysBefore: number | null;
  remindHour: number | null;
  remindersEnabled: boolean;
  createdDay: string;
}

export async function loadCommitments(user: CoachUser, options: { ids?: number[]; includeEnded?: boolean } = {}): Promise<CommitmentRow[]> {
  const statuses = options.includeEnded ? ["active", "paused", "ended"] : ["active", "paused"];
  const rows = await db.select().from(scheduledCashflows).where(and(
    own(user), inArray(scheduledCashflows.status, statuses),
    ...(options.ids?.length ? [inArray(scheduledCashflows.id, options.ids)] : []),
  )).orderBy(desc(scheduledCashflows.createdAt)).limit(300);
  const contactIds = [...new Set(rows.flatMap((row) => [row.contactId, row.beneficiaryContactId]).filter((id): id is number => !!id))];
  const contacts = contactIds.length ? await db.select({ id: userContacts.id, name: userContacts.name }).from(userContacts).where(and(
    eq(userContacts.userId, user.userId), eq(userContacts.userType, user.userType), inArray(userContacts.id, contactIds),
  )) : [];
  const nameOf = new Map(contacts.map((contact) => [contact.id, contact.name]));
  const detailed = await withScheduleDetails(user, rows.map((row) => toScheduleRow(row, row.contactId ? nameOf.get(row.contactId) ?? null : null)));
  return detailed.map((schedule, index) => {
    const row = rows[index];
    return {
      ...schedule,
      provider: row.provider,
      catalogSlug: row.catalogSlug,
      beneficiaryContactId: row.beneficiaryContactId,
      beneficiaryName: row.beneficiaryContactId ? nameOf.get(row.beneficiaryContactId) ?? null : null,
      paymentMethod: row.paymentMethod,
      gam3eyaTurn: row.gam3eyaTurn,
      category: row.category,
      subCategory: row.subCategory,
      remindDaysBefore: row.remindDaysBefore,
      remindHour: row.remindHour,
      remindersEnabled: row.remindersEnabled,
      createdDay: businessDateKey(row.createdAt),
    };
  });
}

async function settlementsOf(user: CoachUser, ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(cashflowSettlements).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), inArray(cashflowSettlements.cashflowId, ids),
  ));
}

/** The whole span a commitment's dates can cover: from its first to a year ahead (or its last). */
function span(row: CommitmentRow, today: string): [string, string] {
  const starts = [row.startDay, row.trackedFrom ? addDays(row.trackedFrom, -45) : null, ...(row.items ?? []).map((item) => item.dueDay)]
    .filter((day): day is string => !!day && isCalendarDay(day)).sort();
  const from = starts[0] && starts[0] < addDays(today, -800) ? addDays(today, -800) : starts[0] ?? addDays(today, -45);
  return [from, addDays(today, 5 * 366)];
}

export interface Progress {
  /** Installments: paid of total. */
  paidCount: number | null;
  totalCount: number | null;
  /** Money still to pay (or to receive) on every remaining date; null when an amount is unknown. */
  remainingAmount: number | null;
  paidAmount: number;
  next: Occurrence | null;
  lastDay: string | null;
  overdue: number;
}

export function progressOf(row: CommitmentRow, list: Occurrence[], today: string): Progress {
  const mine = list.filter((item) => item.cashflowId === row.id && item.status !== "skipped");
  const finite = row.shape === "fixed" || row.shape === "schedule" || row.shape === "gam3eya" || row.shape === "balance" || row.recurrence === "once" || !!row.endDay;
  const paidAmount = mine.reduce((sum, item) => sum.plus(item.paid), new Decimal(0));
  const open = mine.filter((item) => item.status !== "paid" && item.status !== "unconfirmed");
  const unknown = open.some((item) => item.remaining == null);
  const remainingAmount = finite && !unknown ? open.reduce((sum, item) => sum.plus(item.remaining ?? 0), new Decimal(0)).toNumber() : null;
  const paidCount = row.shape === "fixed" || row.shape === "gam3eya" || (row.shape === "balance" && row.occurrenceCount != null) || row.shape === "schedule"
    ? (row.shape === "fixed" || row.shape === "balance" ? Math.max(0, row.paidBeforeCount ?? 0) : 0) + mine.filter((item) => item.status === "paid").length
    : null;
  const totalCount = row.shape === "schedule" ? new Set((row.items ?? []).map((item) => item.dueDay)).size : paidCount != null ? row.occurrenceCount ?? null : null;
  const next = open.sort((a, b) => (a.effectiveDay ?? a.dueDay).localeCompare(b.effectiveDay ?? b.dueDay))[0] ?? null;
  const lastDay = finite ? mine.map((item) => item.effectiveDay ?? item.dueDay).sort().at(-1) ?? null : null;
  return {
    paidCount, totalCount, remainingAmount, paidAmount: paidAmount.toNumber(), next, lastDay,
    overdue: open.filter((item) => item.status === "overdue" && (item.effectiveDay ?? item.dueDay) < today).length,
  };
}

/** Everything a list or the hub needs at once: each commitment with its progress, and the open dates. */
export async function commitmentsOverview(user: CoachUser) {
  await migrateInstallmentPlans(user).catch((err) => log.warn({ err, event: "commitments.installment_migration_failed", userId: user.userId }, "Installment plans were not migrated"));
  const today = businessDateKey();
  const rows = await loadCommitments(user);
  const settled = await settlementsOf(user, rows.map((row) => row.id));
  const all = rows.flatMap((row) => {
    const [from, to] = span(row, today);
    return occurrences([row], settled, from, to, today);
  });
  const catalog = await catalogFor(rows.map((row) => row.catalogSlug));
  const items = rows.filter((row) => !row.parentId).map((row) => {
    const payouts = rows.filter((child) => child.parentId === row.id).sort((a, b) => (a.startDay ?? "").localeCompare(b.startDay ?? ""));
    const statusOf = (child: CommitmentRow) => all.find((item) => item.cashflowId === child.id)?.status ?? null;
    // The payout shown first: the next one not yet received, else the last.
    const payout = payouts.find((child) => statusOf(child) !== "paid") ?? payouts.at(-1) ?? null;
    return {
      ...publicRow(row, catalog),
      progress: progressOf(row, all, today),
      payout: payout ? { id: payout.id, dueDay: payout.startDay, amount: payout.amount == null ? null : Number(payout.amount), status: statusOf(payout) } : null,
      payouts: payouts.map((child) => ({ id: child.id, dueDay: child.startDay, amount: child.amount == null ? null : Number(child.amount), status: statusOf(child) })),
    };
  });
  const monthEnd = addDays(today, 60);
  const due = all
    .filter((item) => item.status !== "paid" || (item.effectiveDay ?? item.dueDay) >= addDays(today, -45))
    .filter((item) => (item.effectiveDay ?? item.dueDay) <= monthEnd && (item.status !== "unconfirmed" || item.dueDay >= addDays(today, -45)))
    .filter((item) => !(item.undated && item.status === "paid"));
  const thisMonth = today.slice(0, 7);
  const inMonth = all.filter((item) => (item.effectiveDay ?? item.dueDay).startsWith(thisMonth) && item.direction === "out" && item.status !== "skipped" && item.status !== "unconfirmed");
  const sum = (values: Array<number | null>) => values.reduce<Decimal>((total, value) => total.plus(value ?? 0), new Decimal(0)).toNumber();
  return {
    today,
    items,
    due,
    summary: {
      dueThisMonth: sum(inMonth.map((item) => item.amount)),
      paidThisMonth: sum(inMonth.map((item) => item.paid)),
      leftThisMonth: sum(inMonth.map((item) => item.remaining)),
      overdue: all.filter((item) => item.status === "overdue").length,
      installmentsLeft: sum(items.filter((item) => ["installment", "loan", "property"].includes(item.kind)).map((item) => item.progress.remainingAmount)),
    },
  };
}

/** One commitment with every date from its start to its end (or a year ahead), and each payment linked to it. */
export async function commitmentDetail(user: CoachUser, id: number) {
  const today = businessDateKey();
  const rows = await loadCommitments(user, { includeEnded: true });
  const row = rows.find((item) => item.id === id);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الالتزام ده مش موجود." });
  const payouts = rows.filter((item) => item.parentId === id);
  const ids = [id, ...payouts.map((item) => item.id)];
  const settled = await settlementsOf(user, ids);
  const active = (item: CommitmentRow) => ({ ...item, status: "active" });
  const [from, to] = span(row, today);
  const dates = occurrences([active(row), ...payouts.map(active)], settled, from, row.shape === "recurring" && !row.endDay ? addDays(today, 366) : to, today);
  const expenseIds = settled.map((item) => item.expenseId).filter((value): value is number => !!value);
  const payments = expenseIds.length ? await db.select({
    id: expenses.id, amount: expenses.amount, date: expenses.date, description: expenses.description, source: expenses.source, category: expenses.category,
  }).from(expenses).where(and(eq(expenses.userId, user.userId), eq(expenses.userType, user.userType), inArray(expenses.id, expenseIds))) : [];
  const catalog = await catalogFor([row.catalogSlug]);
  return {
    today,
    commitment: { ...publicRow(row, catalog), progress: progressOf(active(row), dates, today), filing: filingOf(row) },
    dates: dates.map((item) => ({
      ...item,
      settlements: settled.filter((settlement) => settlement.cashflowId === item.cashflowId && settlement.dueDay === item.dueDay).map((settlement) => {
        const payment = payments.find((expense) => expense.id === settlement.expenseId);
        return {
          id: settlement.id, amount: Number(settlement.amount), source: settlement.source, matchedBy: settlement.matchedBy, linkedAt: settlement.createdAt,
          expense: payment ? { id: payment.id, amount: Math.abs(Number(payment.amount)), date: payment.date, description: payment.description, source: payment.source } : null,
        };
      }),
    })),
  };
}

type Catalog = Map<string, { slug: string; name: string; nameAr: string; brandColor: string | null; logoUrl: string | null; matchTokens: string[] }>;

async function catalogFor(slugs: Array<string | null>): Promise<Catalog> {
  const wanted = [...new Set(slugs.filter((slug): slug is string => !!slug))];
  if (!wanted.length) return new Map();
  const rows = await db.select().from(subscriptionCatalog).where(inArray(subscriptionCatalog.slug, wanted));
  return new Map(rows.map((row) => [row.slug, {
    slug: row.slug, name: row.name, nameAr: row.nameAr, brandColor: row.brandColor ?? null, logoUrl: logoOf(row),
    matchTokens: Array.isArray(row.matchTokens) ? (row.matchTokens as string[]) : [],
  }]));
}

/** The subscriptions a user can pick, with their names, colours and logos (the admin edits them). */
export async function subscriptionChoices() {
  const rows = await db.select().from(subscriptionCatalog).where(and(eq(subscriptionCatalog.status, "active"), eq(subscriptionCatalog.kind, "service")));
  // The seed lists the services most people in Egypt pay for first; admin additions follow.
  return rows.sort((a, b) => a.id - b.id)
    .map((row) => ({ slug: row.slug, name: row.name, nameAr: row.nameAr, cycle: row.cycle, group: row.subCategoryId, brandColor: row.brandColor ?? null, logoUrl: logoOf(row) }));
}

function publicRow(row: CommitmentRow, catalog: Catalog) {
  const brand = row.catalogSlug ? catalog.get(row.catalogSlug) ?? null : null;
  return {
    id: row.id, kind: row.kind, shape: row.shape ?? "recurring", direction: row.direction, title: row.title,
    amount: row.amount == null ? null : Number(row.amount), amountVaries: !!row.amountVaries, estimatedAmount: row.estimatedAmount ?? null,
    recurrence: row.recurrence, intervalCount: row.intervalCount ?? 1, startDay: row.startDay, endDay: row.endDay,
    occurrenceCount: row.occurrenceCount ?? null, paidBeforeCount: row.paidBeforeCount ?? 0,
    totalAmount: row.totalAmount == null ? null : Number(row.totalAmount),
    provider: row.provider, contactId: row.contactId ?? null, contactName: row.contactName ?? null,
    beneficiaryContactId: row.beneficiaryContactId, beneficiaryName: row.beneficiaryName,
    paymentMethod: row.paymentMethod, gam3eyaTurn: row.gam3eyaTurn, status: row.status, items: row.items ?? [],
    remindDaysBefore: row.remindDaysBefore, remindHour: row.remindHour, remindersEnabled: row.remindersEnabled,
    catalog: brand ? { slug: brand.slug, name: brand.name, nameAr: brand.nameAr, brandColor: brand.brandColor, logoUrl: brand.logoUrl } : null,
    /** What to say when recording a payment of it: "دفعت قسط مدرسة محمد". */
    sayHint: sayHintOf(row.kind, row.title),
  };
}

/** The open and paid dates of one month, for the calendar (logos on days, the day's sheet). */
export async function commitmentsMonth(user: CoachUser, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw bad("الشهر بالشكل 2026-11.");
  const today = businessDateKey();
  const rows = await loadCommitments(user);
  const settled = await settlementsOf(user, rows.map((row) => row.id));
  const from = `${month}-01`;
  const to = addDays(addDays(`${month}-28`, 4).slice(0, 7) + "-01", -1);
  const catalog = await catalogFor(rows.map((row) => row.catalogSlug));
  const list = occurrences(rows, settled, from, to, today).filter((item) => item.status !== "skipped");
  return list.map((item) => {
    const row = rows.find((candidate) => candidate.id === item.cashflowId)!;
    const brand = row.catalogSlug ? catalog.get(row.catalogSlug) : undefined;
    return { ...item, day: item.effectiveDay ?? item.dueDay, catalogSlug: row.catalogSlug, brandColor: brand?.brandColor ?? null, logoUrl: brand?.logoUrl ?? null };
  });
}

// ─── Paying, linking and learning ───

/**
 * "دفعته": records the payment in the ledger, filed where the commitment says, and links it to the date in one
 * request; or, with `record` false, says it was paid off the records (someone else paid it).
 */
export async function payDue(user: CoachUser, input: {
  cashflowId: number; dueDay: string; amount?: number | null; record?: boolean; walletId?: number | null; clientRequestId?: string | null; date?: string | null;
}): Promise<{ expenseId: number | null; settlementId: number }> {
  const row = await ownedRow(user, input.cashflowId);
  const [schedule] = await withScheduleDetails(user, [toScheduleRow(row)]);
  const settled = await settlementsOf(user, [row.id]);
  const [occurrence] = occurrences([{ ...schedule, status: "active", trackedFrom: null }], settled, input.dueDay, input.dueDay, input.dueDay)
    .filter((item) => item.dueDay === input.dueDay);
  if (!occurrence) throw bad("اليوم ده مش من مواعيد الالتزام ده.");
  const amount = input.amount && input.amount > 0 ? input.amount : occurrence.remaining;
  if (!amount || amount <= 0) throw bad("اكتب دفعت كام.");
  if (input.record === false) {
    const result = await settle(user, { cashflowId: row.id, dueDay: input.dueDay, expenseId: null, amount, matchedBy: "user" });
    return { expenseId: null, settlementId: result.id };
  }
  const filing = filingOf(row);
  const direction = row.direction === "in" ? "incoming" as const : "outgoing" as const;
  const when = input.date && isCalendarDay(input.date) ? new Date(`${input.date}T12:00:00Z`) : new Date();
  const label = occurrence.number && occurrence.total ? ` · ${occurrence.number} من ${occurrence.total}` : "";
  const { id: expenseId } = await createLedgerEntry({ userId: user.userId, userType: user.userType }, {
    type: filing.type, amount, direction: filing.type === "transfer" ? direction : undefined, movementKind: filing.movementKind,
    category: filing.category, subCategory: filing.subCategory, description: `${row.title}${label}`, source: "manual", date: when,
    contactId: row.contactId ?? null, walletId: input.walletId ?? null, clientRequestId: input.clientRequestId ?? null,
  });
  if (!expenseId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ماقدرناش نسجل الدفعة. جرّب تاني." });
  const result = await settle(user, { cashflowId: row.id, dueDay: input.dueDay, expenseId, amount, matchedBy: "user" });
  return { expenseId, settlementId: result.id };
}

/** Links an already recorded payment to a date and learns how the user names it. */
export async function linkExpense(user: CoachUser, input: { expenseId: number; cashflowId: number; dueDay: string; amount?: number | null; matchedBy?: "user" | "question" | "auto" }) {
  const result = await settle(user, { cashflowId: input.cashflowId, dueDay: input.dueDay, expenseId: input.expenseId, amount: input.amount ?? null, matchedBy: input.matchedBy ?? "user" });
  await afterLink(user, input.cashflowId, input.expenseId).catch((err) => log.warn({ err, event: "commitments.learn_failed", userId: user.userId }, "Learning from a link failed"));
  return result;
}

/** After a link: the payment is filed where its commitment files payments, and its words are remembered. */
async function afterLink(user: CoachUser, cashflowId: number, expenseId: number) {
  const [row] = await db.select().from(scheduledCashflows).where(and(own(user), eq(scheduledCashflows.id, cashflowId))).limit(1);
  const [payment] = await db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.userId, user.userId), eq(expenses.userType, user.userType))).limit(1);
  if (!row || !payment) return;
  const filing = filingOf(row);
  if (filing.type === "expense" && payment.type === "expense" && (payment.category !== filing.category || payment.subCategory !== filing.subCategory)) {
    await updateLedgerEntry({ userId: user.userId, userType: user.userType }, expenseId, { category: filing.category, subCategory: filing.subCategory });
  }
  const phrase = learnedPhrase(`${payment.description ?? ""} ${payment.rawText ?? ""}`);
  if (phrase) await adjustHint(user, cashflowId, "phrase", phrase, 1);
  const sender = senderOf(payment.parsedMetadata);
  if (sender) await adjustHint(user, cashflowId, "sender", sender, 1);
}

async function adjustHint(user: CoachUser, cashflowId: number, kind: "phrase" | "sender", value: string, delta: number) {
  await db.insert(commitmentHints).values({ userId: user.userId, userType: user.userType, cashflowId, kind, value, weight: Math.max(delta, 0) || -1 })
    .onDuplicateKeyUpdate({ set: { weight: sqlAdd(delta), lastSeenAt: new Date() } });
}

const sqlAdd = (delta: number) => sql`${commitmentHints.weight} + ${delta}`;

/** The bank or wallet a captured row came from, as the capture stored it; null for typed and spoken rows. */
function senderOf(metadata: unknown): string | null {
  const capture = metadata && typeof metadata === "object" ? (metadata as { capture?: { source?: unknown; sourceSlug?: unknown } }).capture : undefined;
  const value = capture?.sourceSlug ?? capture?.source;
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase().slice(0, 60) : null;
}

/** Unlinks a payment; a link the user undoes teaches that the payment's words do not name this commitment. */
export async function unlinkSettlement(user: CoachUser, settlementId: number): Promise<void> {
  const [settlement] = await db.select().from(cashflowSettlements).where(and(
    eq(cashflowSettlements.id, settlementId), eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType),
  )).limit(1);
  if (!settlement) return;
  await unsettle(user, settlementId);
  if (settlement.expenseId && (settlement.matchedBy === "auto" || settlement.matchedBy === "question")) {
    const [payment] = await db.select().from(expenses).where(and(eq(expenses.id, settlement.expenseId), eq(expenses.userId, user.userId), eq(expenses.userType, user.userType))).limit(1);
    const phrase = payment ? learnedPhrase(`${payment.description ?? ""} ${payment.rawText ?? ""}`) : null;
    if (phrase) await adjustHint(user, settlement.cashflowId, "phrase", phrase, -2);
  }
}

// ─── Matching saved payments ───

export interface CommitmentLinkResult {
  expenseId: number;
  status: "linked" | "ask" | "none";
  cashflowId?: number;
  title?: string;
  dueDays?: string[];
  number?: number | null;
  total?: number | null;
  /** What is left of the commitment after this payment; null when unknown. */
  remainingAmount?: number | null;
  settlementIds?: number[];
  questionId?: number;
  /** The key to answer the question with (`commitments.answer`). */
  questionKey?: string;
  candidates?: Array<{ cashflowId: number; title: string; dueDay: string; amount: number | null }>;
}

/**
 * What the matcher did with payments the user just saved: the commitment each paid (with the installment's number and
 * what is left) and the settlements to undo it, or the open question to ask. The app reads it after a save, so the
 * offline outbox needs no change.
 */
export async function linksForExpenses(user: CoachUser, expenseIds: number[]): Promise<CommitmentLinkResult[]> {
  if (!expenseIds.length) return [];
  const settled = await db.select().from(cashflowSettlements).where(and(
    eq(cashflowSettlements.userId, user.userId), eq(cashflowSettlements.userType, user.userType), inArray(cashflowSettlements.expenseId, expenseIds),
  ));
  const questions = await db.select().from(commitmentQuestions).where(and(
    eq(commitmentQuestions.userId, user.userId), eq(commitmentQuestions.userType, user.userType), eq(commitmentQuestions.status, "open"),
    inArray(commitmentQuestions.dedupeKey, expenseIds.map((id) => `link:${id}`)),
  ));
  const rows = await loadCommitments(user, { ids: [...new Set(settled.map((item) => item.cashflowId))], includeEnded: true });
  const allSettled = await settlementsOf(user, rows.map((row) => row.id));
  const today = businessDateKey();
  return expenseIds.map((expenseId) => {
    const own = settled.filter((item) => item.expenseId === expenseId);
    if (own.length) {
      const row = rows.find((item) => item.id === own[0].cashflowId);
      if (row) {
        const [from, to] = span(row, today);
        const list = occurrences([{ ...row, status: "active" }], allSettled, from, to, today);
        const last = list.find((item) => item.dueDay === own.at(-1)!.dueDay);
        return {
          expenseId, status: "linked" as const, cashflowId: row.id, title: row.title, dueDays: own.map((item) => item.dueDay),
          number: last?.number ?? null, total: last?.total ?? null,
          remainingAmount: progressOf({ ...row, status: "active" }, list, today).remainingAmount, settlementIds: own.map((item) => item.id),
        };
      }
    }
    const question = questions.find((item) => item.dedupeKey === `link:${expenseId}`);
    if (question) {
      return {
        expenseId, status: "ask" as const, questionId: question.id, questionKey: question.dedupeKey,
        candidates: (question.candidates as Array<{ cashflowId: number; title: string; dueDay: string; amount: number | null }>) ?? [],
      };
    }
    return { expenseId, status: "none" as const };
  });
}

/**
 * Runs the strict matcher over rows the user just saved: links what is certain (and says so, with the settlement ids
 * to undo), stores a question for what is likely, and stays silent otherwise. Never throws: a failure only means no
 * link, and the save stands.
 */
export async function matchSavedExpenses(user: CoachUser, expenseIds: number[]): Promise<CommitmentLinkResult[]> {
  try {
    if (!expenseIds.length) return [];
    const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));
    const autoLink = settings.commitments_auto_link_enabled !== "false";
    const payments = await db.select().from(expenses).where(and(
      eq(expenses.userId, user.userId), eq(expenses.userType, user.userType), inArray(expenses.id, expenseIds),
    ));
    const rows = await loadCommitments(user);
    const active = rows.filter((row) => row.status === "active");
    if (!payments.length || !active.length) return payments.map((payment) => ({ expenseId: payment.id, status: "none" as const }));
    const settled = await settlementsOf(user, active.map((row) => row.id));
    const hints = await db.select().from(commitmentHints).where(and(eq(commitmentHints.userId, user.userId), eq(commitmentHints.userType, user.userType)));
    const catalog = await catalogFor(active.map((row) => row.catalogSlug));
    // Under the understanding engine a payment's reading may name its commitment: read from the user's own log rows.
    const readings = recordingEngineOf(settings) === "understanding"
      ? await loadReadingLogItems(user, payments.map((payment) => payment.classificationLogId))
      : new Map<number, unknown>();
    const results: CommitmentLinkResult[] = [];
    for (const payment of payments) {
      if (settled.some((item) => item.expenseId === payment.id)) {
        results.push({ expenseId: payment.id, status: "none" });
        continue;
      }
      const day = businessDateKey(payment.date);
      const candidates: MatchCommitment[] = [];
      for (const row of active) {
        if (!canPayCashflow({ kind: row.kind, direction: row.direction, contactId: row.contactId ?? null }, payment)) continue;
        const open = occurrences([row], settled, addDays(day, -400), addDays(day, 400), businessDateKey())
          .filter((item) => item.status !== "paid" && item.status !== "skipped")
          .map((item) => ({ dueDay: item.dueDay, effectiveDay: item.effectiveDay ?? item.dueDay, remaining: item.remaining, undated: item.undated }));
        if (!open.length) continue;
        const brand = row.catalogSlug ? catalog.get(row.catalogSlug) : undefined;
        candidates.push({
          id: row.id, title: row.title, kind: row.kind, contactId: row.contactId ?? null, beneficiaryName: row.beneficiaryName,
          provider: row.provider, open,
          aliases: brand ? [brand.name, brand.nameAr, ...brand.matchTokens] : [],
          hints: hints.filter((hint) => hint.cashflowId === row.id).map((hint) => ({ kind: hint.kind, value: hint.value, weight: hint.weight })),
        });
      }
      const magnitude = Math.abs(Number(payment.amount));
      const read = payment.classificationLogId && readings.has(payment.classificationLogId)
        ? readingItemFor(readings.get(payment.classificationLogId), { amount: magnitude })
        : null;
      const decision = decideMatch({
        id: payment.id, amount: magnitude, text: `${payment.description ?? ""} ${payment.rawText ?? ""}`,
        contactId: payment.contactId ?? null, day, sender: senderOf(payment.parsedMetadata),
        ...(read?.reading.commitmentId ? { namedCashflowId: read.reading.commitmentId } : {}),
      }, candidates);
      const titleOf = (id: number) => active.find((row) => row.id === id)?.title ?? "";
      if (decision.status === "linked" && autoLink) {
        const settlementIds: number[] = [];
        for (const allocation of decision.allocations) {
          const done = await settle(user, { cashflowId: allocation.cashflowId, dueDay: allocation.dueDay, expenseId: payment.id, amount: allocation.amount, matchedBy: "auto" });
          settlementIds.push(done.id);
        }
        await afterLink(user, decision.cashflowId, payment.id).catch((err) => log.warn({ err, event: "commitments.learn_failed", userId: user.userId }, "Learning from a link failed"));
        const row = active.find((item) => item.id === decision.cashflowId)!;
        const after = await settlementsOf(user, [row.id]);
        const [from, to] = span(row, businessDateKey());
        const list = occurrences([row], after, from, to, businessDateKey());
        const linked = list.find((item) => item.dueDay === decision.allocations.at(-1)!.dueDay);
        results.push({
          expenseId: payment.id, status: "linked", cashflowId: row.id, title: row.title, dueDays: decision.allocations.map((item) => item.dueDay),
          number: linked?.number ?? null, total: linked?.total ?? null, remainingAmount: progressOf(row, list, businessDateKey()).remainingAmount, settlementIds,
        });
        continue;
      }
      const ask = decision.status === "linked"
        ? [{ cashflowId: decision.cashflowId, dueDay: decision.allocations[0].dueDay, amount: decision.allocations[0].amount }]
        : decision.status === "ask" ? decision.candidates : [];
      if (!ask.length) {
        results.push({ expenseId: payment.id, status: "none" });
        continue;
      }
      const candidatesOut = ask.map((item) => ({ ...item, title: titleOf(item.cashflowId) }));
      await db.insert(commitmentQuestions).values({
        userId: user.userId, userType: user.userType, kind: "link", dedupeKey: `link:${payment.id}`, expenseId: payment.id,
        candidates: candidatesOut,
      // Asked once: a sweep that meets the payment again leaves an answered question as it is.
      }).onDuplicateKeyUpdate({ set: { kind: "link" } });
      const [question] = await db.select({ id: commitmentQuestions.id }).from(commitmentQuestions).where(and(
        eq(commitmentQuestions.userId, user.userId), eq(commitmentQuestions.userType, user.userType), eq(commitmentQuestions.dedupeKey, `link:${payment.id}`),
      )).limit(1);
      results.push({ expenseId: payment.id, status: "ask", questionId: question?.id, candidates: candidatesOut });
    }
    return results;
  } catch (err) {
    log.warn({ err, event: "commitments.match_failed", userId: user.userId }, "Matching saved payments failed");
    return expenseIds.map((expenseId) => ({ expenseId, status: "none" as const }));
  }
}

/**
 * A sentence that names a commitment but no amount ("دفعت نتفليكس", "دفعت قسط التلاجة"): the commitment and its open
 * date, so the app offers one button that records and links it. Null when no single commitment is named strongly.
 */
export async function commitmentForSentence(user: CoachUser, text: string) {
  const rows = (await loadCommitments(user)).filter((row) => row.status === "active");
  if (!rows.length) return null;
  const words = new Set(matchTokens(text));
  const catalog = await catalogFor(rows.map((row) => row.catalogSlug));
  const settled = await settlementsOf(user, rows.map((row) => row.id));
  const today = businessDateKey();
  const named = rows.filter((row) => {
    const brand = row.catalogSlug ? catalog.get(row.catalogSlug) : undefined;
    const probe: MatchCommitment = {
      id: row.id, title: row.title, kind: row.kind, contactId: null, beneficiaryName: row.beneficiaryName, provider: row.provider,
      aliases: brand ? [brand.name, brand.nameAr, ...brand.matchTokens] : [], hints: [], open: [{ dueDay: today, effectiveDay: today, remaining: 1 }],
    };
    return decideMatch({ id: 0, amount: 1, text, contactId: null, day: today }, [probe]).status === "linked";
  });
  if (named.length !== 1 || !words.size) return null;
  const [row] = named;
  const open = occurrences([row], settled, addDays(today, -400), addDays(today, 40), today)
    .filter((item) => item.status !== "paid" && item.status !== "skipped" && (item.undated || (item.effectiveDay ?? item.dueDay) <= addDays(today, 10)));
  const next = open[0];
  if (!next) return null;
  return { cashflowId: row.id, title: row.title, dueDay: next.dueDay, amount: next.remaining, number: next.number ?? null, total: next.total ?? null };
}

// ─── Questions the app asks when it opens ───

/** Due dates that came without a payment ("اتدفع؟"), and payments waiting for "which one is it?". */
export async function pendingQuestions(user: CoachUser) {
  const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));
  const today = businessDateKey();
  const asked = await db.select().from(commitmentQuestions).where(and(eq(commitmentQuestions.userId, user.userId), eq(commitmentQuestions.userType, user.userType)))
    .orderBy(desc(commitmentQuestions.createdAt)).limit(500);
  const answered = new Set(asked.filter((item) => item.status !== "open").map((item) => item.dedupeKey));
  const dueChecks: Array<Occurrence & { key: string }> = [];
  if (settings.commitments_due_prompt_enabled !== "false") {
    const rows = await loadCommitments(user);
    const settled = await settlementsOf(user, rows.map((row) => row.id));
    for (const item of occurrences(rows.filter((row) => row.status === "active"), settled, addDays(today, -60), today, today)) {
      if (item.undated || item.status === "paid" || item.status === "skipped" || item.status === "partial") continue;
      const key = `due:${item.cashflowId}:${item.dueDay}`;
      if (!answered.has(key)) dueChecks.push({ ...item, key });
    }
  }
  const links = asked.filter((item) => item.kind === "link" && item.status === "open").slice(0, 10).map((item) => ({
    id: item.id, key: item.dedupeKey, expenseId: item.expenseId, candidates: (item.candidates as Array<{ cashflowId: number; title: string; dueDay: string; amount: number | null }>) ?? [],
  }));
  const linkExpenses = links.length ? await db.select({ id: expenses.id, amount: expenses.amount, description: expenses.description, date: expenses.date })
    .from(expenses).where(and(eq(expenses.userId, user.userId), eq(expenses.userType, user.userType), inArray(expenses.id, links.map((item) => item.expenseId!).filter(Boolean)))) : [];
  return {
    today,
    dueChecks: dueChecks.sort((a, b) => a.dueDay.localeCompare(b.dueDay)).slice(0, 5),
    links: links.map((item) => {
      const payment = linkExpenses.find((expense) => expense.id === item.expenseId);
      return { ...item, expense: payment ? { id: payment.id, amount: Math.abs(Number(payment.amount)), description: payment.description, date: payment.date } : null };
    }).filter((item) => item.expense),
  };
}

/**
 * The answer to a question. Due check: `paid` links the one recorded payment that fits exactly, or records a new one;
 * `paid_off_records` says someone else paid it; `not_yet` ("لسه") leaves it unpaid and stops asking. Link: a
 * candidate's `cashflowId:dueDay`, or `none`.
 */
export async function answerQuestion(user: CoachUser, input: { key: string; answer: string; amount?: number | null }) {
  const markAnswered = async (status: "answered" | "skipped", fields: Partial<typeof commitmentQuestions.$inferInsert> = {}) => {
    await db.insert(commitmentQuestions).values({
      userId: user.userId, userType: user.userType, kind: input.key.startsWith("due:") ? "due_check" : "link", dedupeKey: input.key,
      status, answer: input.answer.slice(0, 40), answeredAt: new Date(), ...fields,
    }).onDuplicateKeyUpdate({ set: { status, answer: input.answer.slice(0, 40), answeredAt: new Date() } });
  };
  const due = /^due:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(input.key);
  if (due) {
    const cashflowId = Number(due[1]);
    const dueDay = due[2];
    await ownedRow(user, cashflowId);
    if (input.answer === "not_yet") {
      await markAnswered("skipped", { cashflowId, dueDay });
      return { status: "not_paid" as const };
    }
    if (input.answer === "paid_off_records") {
      const result = await payDue(user, { cashflowId, dueDay, amount: input.amount ?? null, record: false });
      await markAnswered("answered", { cashflowId, dueDay });
      return { status: "paid" as const, settlementId: result.settlementId, expenseId: null };
    }
    if (input.answer !== "paid") throw bad("الإجابة دي مش معروفة.");
    const rows = await loadCommitments(user, { ids: [cashflowId] });
    const settled = await settlementsOf(user, [cashflowId]);
    const [occurrence] = occurrences(rows, settled, dueDay, dueDay, businessDateKey()).filter((item) => item.dueDay === dueDay);
    if (occurrence) {
      const exact = (await suggestPayments(user, occurrence)).filter((item) => item.sameAmount);
      if (exact.length === 1) {
        const result = await linkExpense(user, { expenseId: exact[0].id, cashflowId, dueDay, matchedBy: "question" });
        await markAnswered("answered", { cashflowId, dueDay });
        return { status: "linked" as const, settlementId: result.id, expenseId: exact[0].id };
      }
    }
    const result = await payDue(user, { cashflowId, dueDay, amount: input.amount ?? null, record: true });
    await markAnswered("answered", { cashflowId, dueDay });
    return { status: "recorded" as const, settlementId: result.settlementId, expenseId: result.expenseId };
  }
  const [question] = await db.select().from(commitmentQuestions).where(and(
    eq(commitmentQuestions.userId, user.userId), eq(commitmentQuestions.userType, user.userType), eq(commitmentQuestions.dedupeKey, input.key),
  )).limit(1);
  if (!question || question.kind !== "link" || !question.expenseId) throw new TRPCError({ code: "NOT_FOUND", message: "السؤال ده مش موجود." });
  if (input.answer === "none") {
    await markAnswered("answered");
    return { status: "none" as const };
  }
  const [cashflowPart, dueDay] = input.answer.split(":");
  const candidate = ((question.candidates as Array<{ cashflowId: number; dueDay: string }>) ?? [])
    .find((item) => item.cashflowId === Number(cashflowPart) && item.dueDay === dueDay);
  if (!candidate) throw bad("اختار واحد من الاختيارات.");
  const result = await linkExpense(user, { expenseId: question.expenseId, cashflowId: candidate.cashflowId, dueDay: candidate.dueDay, matchedBy: "question" });
  await markAnswered("answered");
  return { status: "linked" as const, settlementId: result.id, expenseId: question.expenseId };
}

// ─── The old installment plans ───

/**
 * Turns each active `installment_plans` row of the user into a fixed commitment once (the plan keeps its row and gets
 * the commitment's id, so old apps reading `expense.listInstallmentPlans` keep working). Its word becomes a learned
 * phrase; what it counted as paid becomes the installments paid before. Its next date is unknown: the commitment
 * starts undated and the app asks for it.
 */
export async function migrateInstallmentPlans(user: CoachUser): Promise<number> {
  const plans = await db.select().from(installmentPlans).where(and(
    eq(installmentPlans.userId, user.userId), eq(installmentPlans.userType, user.userType), eq(installmentPlans.status, "active"), isNull(installmentPlans.cashflowId),
  ));
  let moved = 0;
  for (const plan of plans) {
    const [existing] = await db.select({ id: scheduledCashflows.id }).from(scheduledCashflows).where(and(own(user), eq(scheduledCashflows.installmentPlanId, plan.id))).limit(1);
    let id = existing?.id;
    if (!id) {
      ({ id } = await createCashflow(user, {
        kind: "installment", shape: "fixed", direction: "out", title: plan.title, amount: Number(plan.monthlyAmount), recurrence: "monthly",
        startDay: null, certainty: "confirmed", source: "user", installmentPlanId: plan.id,
        occurrenceCount: plan.totalInstallments, paidBeforeCount: Math.min(plan.totalInstallments, plan.paidBefore),
      }));
    }
    const phrase = learnedPhrase(plan.keyword);
    if (phrase) await adjustHint(user, id, "phrase", phrase, 1);
    await db.update(installmentPlans).set({ cashflowId: id }).where(and(eq(installmentPlans.id, plan.id), eq(installmentPlans.userId, user.userId), eq(installmentPlans.userType, user.userType)));
    moved += 1;
  }
  return moved;
}
