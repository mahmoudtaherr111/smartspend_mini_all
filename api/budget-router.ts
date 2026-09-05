import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { db } from "./queries/connection";
import { userBudgets, expenses } from "../db/schema";
import { eq, and, desc, gte, lt } from "drizzle-orm";
import { invalidateFinanceUserCache } from "./services/finance-semantic-layer";
import { businessDateKey, startOfBusinessDay } from "./lib/app-time";
import { ExpenseInputLimits } from "../contracts/constants";

function getFinancialMonthDates(reference: Date, periodStartDay: number) {
  const [year, month] = businessDateKey(reference).split("-").map(Number);
  const currentDay = Number(businessDateKey(reference).slice(-2));
  let startYear = year;
  let startMonthIndex = month - 1;
  if (currentDay < periodStartDay) {
    startMonthIndex -= 1;
    if (startMonthIndex < 0) {
      startMonthIndex = 11;
      startYear -= 1;
    }
  }
  const startDay = Math.min(periodStartDay, new Date(Date.UTC(startYear, startMonthIndex + 1, 0)).getUTCDate());
  let endYear = startYear;
  let endMonthIndex = startMonthIndex + 1;
  if (endMonthIndex > 11) {
    endMonthIndex = 0;
    endYear += 1;
  }
  const endDay = Math.min(periodStartDay, new Date(Date.UTC(endYear, endMonthIndex + 1, 0)).getUTCDate());
  return {
    startDate: startOfBusinessDay(new Date(Date.UTC(startYear, startMonthIndex, startDay, 12))),
    endDate: startOfBusinessDay(new Date(Date.UTC(endYear, endMonthIndex, endDay, 12))),
  };
}

export const budgetRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const userType = ctx.user.type;

    const budgets = await db
      .select()
      .from(userBudgets)
      .where(
        and(
          eq(userBudgets.userId, userId),
          eq(userBudgets.userType, userType),
        ),
      )
      .orderBy(desc(userBudgets.createdAt));

    const now = new Date();
    const budgetPeriods = budgets.map((budget) => ({
      id: budget.id,
      ...getFinancialMonthDates(now, budget.periodStartDay || 1),
    }));
    const earliestStart = budgetPeriods.reduce(
      (earliest, period) => (!earliest || period.startDate < earliest ? period.startDate : earliest),
      null as Date | null,
    );
    const latestEnd = budgetPeriods.reduce(
      (latest, period) => (!latest || period.endDate > latest ? period.endDate : latest),
      null as Date | null,
    );

    const spendingRows = earliestStart && latestEnd ? await db
      .select({
        category: expenses.category,
        amount: expenses.amount,
        date: expenses.date,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
          eq(expenses.type, "expense"),
          gte(expenses.date, earliestStart),
          lt(expenses.date, latestEnd),
        ),
      ) : [];

    const enrichedBudgets = budgets.map((b) => {
      const period = budgetPeriods.find((candidate) => candidate.id === b.id)!;
      const spent = spendingRows
        .filter((row) => row.date >= period.startDate && row.date < period.endDate && (!b.category || row.category === b.category))
        .reduce((total, row) => total + Number(row.amount), 0);
      const limit = Number(b.monthlyLimit) || 1;
      const percentage = Math.round((spent / limit) * 100);
      const isExceeded = spent > limit;
      const isNearLimit = percentage >= (b.alertThresholdPercent ?? 80);

      return {
        ...b,
        currentSpent: spent,
        percentage,
        isExceeded,
        isNearLimit,
      };
    });

    return {
      budgets: enrichedBudgets,
    };
  }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().min(2).max(200),
        category: z.string().max(100).optional(),
        monthlyLimit: z.number().positive().max(ExpenseInputLimits.amountMax),
        periodStartDay: z.number().int().min(1).max(31).default(1),
        linkedGoalId: z.number().int().positive().optional(),
        alertThresholdPercent: z.number().int().min(1).max(100).default(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [result] = await db.insert(userBudgets).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        title: input.title.trim(),
        category: input.category?.trim() || null,
        monthlyLimit: String(input.monthlyLimit),
        periodStartDay: input.periodStartDay,
        linkedGoalId: input.linkedGoalId || null,
        alertThresholdPercent: input.alertThresholdPercent,
        status: "active",
      });

      await invalidateFinanceUserCache(ctx.user.id, ctx.user.type);
      return { success: true, budgetId: result.insertId };
    }),

  update: authedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        title: z.string().min(2).max(200).optional(),
        category: z.string().max(100).optional(),
        monthlyLimit: z.number().positive().max(ExpenseInputLimits.amountMax).optional(),
        periodStartDay: z.number().int().min(1).max(31).optional(),
        alertThresholdPercent: z.number().int().min(1).max(100).optional(),
        status: z.enum(["active", "paused"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title.trim();
      if (input.category !== undefined) updateData.category = input.category.trim() || null;
      if (input.monthlyLimit !== undefined) updateData.monthlyLimit = String(input.monthlyLimit);
      if (input.periodStartDay !== undefined) updateData.periodStartDay = input.periodStartDay;
      if (input.alertThresholdPercent !== undefined) updateData.alertThresholdPercent = input.alertThresholdPercent;
      if (input.status !== undefined) updateData.status = input.status;

      await db
        .update(userBudgets)
        .set(updateData)
        .where(
          and(
            eq(userBudgets.id, input.budgetId),
            eq(userBudgets.userId, ctx.user.id),
            eq(userBudgets.userType, ctx.user.type),
          ),
        );

      await invalidateFinanceUserCache(ctx.user.id, ctx.user.type);
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(userBudgets)
        .where(
          and(
            eq(userBudgets.id, input.budgetId),
            eq(userBudgets.userId, ctx.user.id),
            eq(userBudgets.userType, ctx.user.type),
          ),
        );

      await invalidateFinanceUserCache(ctx.user.id, ctx.user.type);
      return { success: true };
    }),
});
