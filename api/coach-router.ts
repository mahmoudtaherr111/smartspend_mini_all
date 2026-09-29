/**
 * The plan and commitments screen (`src/pages/PlanPage.tsx`) and anything else that shows or changes them: the
 * active coaching plan and its steps and reminders, the schedule of commitments and expected income, which payments
 * settled which due date, and what is free until payday. Every procedure is the signed-in user's own
 * (api/services/coach).
 */
import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { ExpenseInputLimits } from "../contracts/constants";
import { businessDateKey, parseBusinessInstant } from "./lib/app-time";
import {
  CASHFLOW_KINDS,
  createCashflow,
  listCashflows,
  position,
  settle,
  suggestPayments,
  unsettle,
  updateCashflow,
  upcoming,
} from "./services/coach/cashflows";
import { addDays } from "./services/coach/schedule";
import { activePlan, cancelReminder, endPlan, setReminder, setStepStatus } from "./services/coach/plans";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ لازم يكون بالشكل 2026-09-30");
const amount = z.number().positive().max(ExpenseInputLimits.amountMax);

const cashflowFields = z.object({
  kind: z.enum(CASHFLOW_KINDS),
  direction: z.enum(["in", "out"]),
  title: z.string().trim().min(2).max(120),
  amount: amount.nullable(),
  recurrence: z.enum(["once", "weekly", "monthly", "yearly"]),
  startDay: day.nullable(),
  endDay: day.nullable().optional(),
  certainty: z.enum(["confirmed", "estimated"]).default("confirmed"),
  contactId: z.number().int().positive().nullable().optional(),
});

const me = (ctx: { user: { id: number | string; type: string } }) => ({ userId: Number(ctx.user.id), userType: ctx.user.type });

export const coachRouter = router({
  /** Everything the screen shows at once: the plan, what is due in the next 45 days, and the position until payday. */
  overview: authedProcedure.query(async ({ ctx }) => {
    const user = me(ctx);
    const today = businessDateKey();
    const [plan, due, cash, schedules] = await Promise.all([
      activePlan(user),
      upcoming(user, addDays(today, -45), addDays(today, 45), today),
      position(user),
      listCashflows(user),
    ]);
    return { today, plan, due, position: cash, schedules };
  }),

  addCashflow: authedProcedure
    .input(cashflowFields.extend({ installmentPlanId: z.number().int().positive().nullable().optional() }))
    .mutation(({ ctx, input }) => createCashflow(me(ctx), { ...input, endDay: input.endDay ?? null, source: "user" })),

  updateCashflow: authedProcedure
    .input(cashflowFields.partial().extend({ id: z.number().int().positive(), status: z.enum(["active", "paused", "ended"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      await updateCashflow(me(ctx), id, patch);
      return { success: true };
    }),

  settle: authedProcedure
    .input(z.object({ cashflowId: z.number().int().positive(), dueDay: day, expenseId: z.number().int().positive().nullable().optional(), amount: amount.nullable().optional() }))
    .mutation(({ ctx, input }) => settle(me(ctx), input)),

  unsettle: authedProcedure
    .input(z.object({ settlementId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await unsettle(me(ctx), input.settlementId);
      return { success: true };
    }),

  /** Recorded payments that may have paid a due date, for the user to confirm; nothing is linked here. */
  paymentSuggestions: authedProcedure
    .input(z.object({ cashflowId: z.number().int().positive(), dueDay: day }))
    .query(async ({ ctx, input }) => {
      const user = me(ctx);
      const [occurrence] = await upcoming(user, input.dueDay, input.dueDay);
      if (!occurrence || occurrence.cashflowId !== input.cashflowId) return [];
      return suggestPayments(user, occurrence);
    }),

  setStepStatus: authedProcedure
    .input(z.object({ stepId: z.number().int().positive(), status: z.enum(["pending", "done", "skipped"]) }))
    .mutation(async ({ ctx, input }) => {
      await setStepStatus(me(ctx), input.stepId, input.status, "user");
      return { success: true };
    }),

  /** `at` is the day and hour on Cairo's clock as the user picked it ("2026-10-02T09:00"), whatever the device's zone. */
  setReminder: authedProcedure
    .input(z.object({ stepId: z.number().int().positive(), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "اختار اليوم والساعة") }))
    .mutation(({ ctx, input }) => setReminder(me(ctx), input.stepId, parseBusinessInstant(input.at))),

  cancelReminder: authedProcedure
    .input(z.object({ stepId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await cancelReminder(me(ctx), input.stepId);
      return { success: true };
    }),

  endPlan: authedProcedure
    .input(z.object({ planId: z.number().int().positive(), status: z.enum(["completed", "cancelled"]) }))
    .mutation(async ({ ctx, input }) => {
      await endPlan(me(ctx), input.planId, input.status);
      return { success: true };
    }),
});
