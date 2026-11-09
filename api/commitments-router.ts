/**
 * The commitments screens of the app and everything that pays a commitment (docs/decisions/0051-commitments-ecosystem.md):
 * the hub, one commitment with all its dates, the calendar's month, the fixed fields of each shape, paying a date,
 * linking or unlinking a recorded payment, and the questions the app asks when it opens. Every procedure is the
 * signed-in user's own (api/services/coach/commitments.ts).
 */
import { z } from "zod";
import { router, commitmentsProcedure } from "./middleware";
import { ExpenseInputLimits } from "../contracts/constants";
import { getSystemSettings } from "./lib/settings-cache";
import { CASHFLOW_KINDS } from "./services/coach/cashflows";
import {
  PAYMENT_METHODS,
  SHAPES,
  answerQuestion,
  commitmentDetail,
  commitmentForSentence,
  commitmentsMonth,
  commitmentsOverview,
  createCommitment,
  linkExpense,
  payDue,
  pendingQuestions,
  replaceScheduleItems,
  setCommitmentStatus,
  setOverride,
  subscriptionChoices,
  unlinkSettlement,
  updateCommitment,
} from "./services/coach/commitments";
import { isCalendarDay } from "./services/coach/schedule";

const day = z.string().refine(isCalendarDay, "اختار يوم موجود بالشكل 2026-09-30");
const amount = z.number().positive().max(ExpenseInputLimits.amountMax);
const name = z.string().trim().min(2).max(60);
const items = z.array(z.object({ dueDay: day, amount, label: z.string().trim().max(80).nullable().optional() })).max(120);
const reminder = {
  remindDaysBefore: z.number().int().min(0).max(30).nullable().optional(),
  remindHour: z.number().int().min(0).max(23).nullable().optional(),
  remindersEnabled: z.boolean().optional(),
};

const fields = z.object({
  shape: z.enum(SHAPES),
  kind: z.enum(CASHFLOW_KINDS),
  title: z.string().trim().max(120).nullable().optional(),
  direction: z.enum(["in", "out"]).optional(),
  provider: z.string().trim().max(80).nullable().optional(),
  catalogSlug: z.string().regex(/^[a-z0-9_]{2,60}$/).nullable().optional(),
  contactId: z.number().int().positive().nullable().optional(),
  contactName: name.nullable().optional(),
  contactRelation: z.string().trim().max(40).nullable().optional(),
  beneficiaryContactId: z.number().int().positive().nullable().optional(),
  beneficiaryName: name.nullable().optional(),
  beneficiaryRelation: z.string().trim().max(40).nullable().optional(),
  amount: amount.nullable().optional(),
  amountVaries: z.boolean().optional(),
  recurrence: z.enum(["once", "weekly", "monthly", "yearly"]).optional(),
  intervalCount: z.number().int().min(1).max(12).optional(),
  startDay: day.nullable().optional(),
  endDay: day.nullable().optional(),
  occurrenceCount: z.number().int().min(1).max(600).nullable().optional(),
  remainingCount: z.number().int().min(1).max(600).nullable().optional(),
  paidBeforeCount: z.number().int().min(0).max(600).nullable().optional(),
  totalAmount: amount.nullable().optional(),
  repayment: z.enum(["once", "installments", "flexible"]).optional(),
  items: items.optional(),
  paidSoFar: amount.nullable().optional(),
  gam3eyaTurn: z.number().int().min(1).max(60).nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  subCategory: z.string().trim().max(100).nullable().optional(),
  originExpenseId: z.number().int().positive().nullable().optional(),
  ...reminder,
});

const me = (ctx: { user: { id: number | string; type: string } }) => ({ userId: Number(ctx.user.id), userType: ctx.user.type });

export const commitmentsRouter = router({
  /** The hub: every commitment with where it stands, the open dates, and this month's totals. */
  overview: commitmentsProcedure.query(({ ctx }) => commitmentsOverview(me(ctx))),

  /** One commitment with each of its dates and the payments linked to each. */
  detail: commitmentsProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => commitmentDetail(me(ctx), input.id)),

  /** The dates of one month, for the calendar: a subscription's logo on its day. */
  month: commitmentsProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ ctx, input }) => commitmentsMonth(me(ctx), input.month)),

  /** The known subscriptions (Netflix, Shahid…) with their names, colours and logos. */
  subscriptions: commitmentsProcedure.query(() => subscriptionChoices()),

  /** The reminder the admin set as default, shown in the forms. */
  defaults: commitmentsProcedure.query(async () => {
    const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));
    const number = (key: string, fallback: number) => {
      const value = Number.parseInt(settings[key] ?? "", 10);
      return Number.isFinite(value) ? value : fallback;
    };
    return { remindDaysBefore: number("commitments_remind_days_default", 3), remindHour: number("commitments_remind_hour_default", 10) };
  }),

  create: commitmentsProcedure.input(fields).mutation(({ ctx, input }) => createCommitment(me(ctx), input, ctx.user.plan)),

  update: commitmentsProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(2).max(120).optional(),
      amount: amount.nullable().optional(),
      amountVaries: z.boolean().optional(),
      startDay: day.nullable().optional(),
      endDay: day.nullable().optional(),
      recurrence: z.enum(["once", "weekly", "monthly", "yearly"]).optional(),
      intervalCount: z.number().int().min(1).max(12).optional(),
      occurrenceCount: z.number().int().min(1).max(600).nullable().optional(),
      paidBeforeCount: z.number().int().min(0).max(600).optional(),
      totalAmount: amount.nullable().optional(),
      provider: z.string().trim().max(80).nullable().optional(),
      paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
      category: z.string().trim().max(100).nullable().optional(),
      subCategory: z.string().trim().max(100).nullable().optional(),
      ...reminder,
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      await updateCommitment(me(ctx), id, patch);
      return { success: true };
    }),

  setStatus: commitmentsProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "paused", "ended"]) }))
    .mutation(async ({ ctx, input }) => {
      await setCommitmentStatus(me(ctx), input.id, input.status);
      return { success: true };
    }),

  /** One date: skip it this time, move it, or another amount; `action` null clears the change. */
  setOverride: commitmentsProcedure
    .input(z.object({
      id: z.number().int().positive(),
      dueDay: day,
      action: z.enum(["skip", "move", "amount"]).nullable(),
      newDay: day.nullable().optional(),
      amount: amount.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await setOverride(me(ctx), input.id, input.dueDay, input.action ? { action: input.action, newDay: input.newDay, amount: input.amount } : null);
      return { success: true };
    }),

  replaceItems: commitmentsProcedure
    .input(z.object({ id: z.number().int().positive(), items }))
    .mutation(async ({ ctx, input }) => {
      await replaceScheduleItems(me(ctx), input.id, input.items);
      return { success: true };
    }),

  /** "دفعته": records the payment where the commitment files it and links it; `record` false: paid off the records. */
  pay: commitmentsProcedure
    .input(z.object({
      cashflowId: z.number().int().positive(),
      dueDay: day,
      amount: amount.nullable().optional(),
      record: z.boolean().default(true),
      walletId: z.number().int().positive().nullable().optional(),
      date: day.nullable().optional(),
      clientRequestId: z.string().min(1).max(64).nullable().optional(),
    }))
    .mutation(({ ctx, input }) => payDue(me(ctx), input)),

  link: commitmentsProcedure
    .input(z.object({ expenseId: z.number().int().positive(), cashflowId: z.number().int().positive(), dueDay: day, amount: amount.nullable().optional() }))
    .mutation(({ ctx, input }) => linkExpense(me(ctx), input)),

  /** Unlinks a payment; the payment itself stays in the ledger. */
  unlink: commitmentsProcedure
    .input(z.object({ settlementId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await unlinkSettlement(me(ctx), input.settlementId);
      return { success: true };
    }),

  /** Asked when the app opens: dates that passed without a payment, and payments waiting for "which one?". */
  questions: commitmentsProcedure.query(({ ctx }) => pendingQuestions(me(ctx))),

  answer: commitmentsProcedure
    .input(z.object({ key: z.string().min(3).max(80), answer: z.string().min(2).max(40), amount: amount.nullable().optional() }))
    .mutation(({ ctx, input }) => answerQuestion(me(ctx), input)),

  /** A sentence that names a commitment with no amount ("دفعت نتفليكس"): the date it would pay, for one button. */
  forSentence: commitmentsProcedure
    .input(z.object({ text: z.string().trim().min(2).max(500) }))
    .query(({ ctx, input }) => commitmentForSentence(me(ctx), input.text)),
});
