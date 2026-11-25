import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "./middleware";
import { db } from "./queries/connection";
import { userBudgets } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { invalidateFinanceUserCache } from "./services/finance-semantic-layer";
import { listBudgetStatuses } from "./services/budget-status";
import { storageCategoryName } from "./lib/category-registry";
import { ExpenseInputLimits } from "../contracts/constants";
import { assertEntityOwnership } from "./lib/ownership-guard";
import { taxonomyCategory } from "../contracts/taxonomy";
import { storedFiling } from "./lib/understanding/bridge";

const spendingPurposeId = z.string().max(64).refine(id => taxonomyCategory(id)?.kinds.includes("spending"), {
  message: "اختار فئة مصاريف للميزانية",
});

function budgetCategory(input: { category?: string; purposeCategoryId?: string | null }) {
  if (input.purposeCategoryId) return storedFiling(input.purposeCategoryId, "other").category;
  return input.category?.trim() ? storageCategoryName(input.category.trim()) : null;
}

export const budgetRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return { budgets: await listBudgetStatuses(ctx.user.id as number, ctx.user.type) };
  }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().min(2).max(200),
        category: z.string().max(100).optional(),
        purposeCategoryId: spendingPurposeId.optional(),
        monthlyLimit: z.number().positive().max(ExpenseInputLimits.amountMax),
        periodStartDay: z.number().int().min(1).max(31).default(1),
        linkedGoalId: z.number().int().positive().optional(),
        alertThresholdPercent: z.number().int().min(1).max(100).default(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.linkedGoalId) {
        await assertEntityOwnership({
          userId: ctx.user.id,
          userType: ctx.user.type,
          linkedGoalId: input.linkedGoalId,
        });
      }

      const [result] = await db.insert(userBudgets).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        title: input.title.trim(),
        category: budgetCategory(input),
        ...(input.purposeCategoryId ? { metadata: { purposeCategoryId: input.purposeCategoryId } } : {}),
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
        purposeCategoryId: spendingPurposeId.nullable().optional(),
        monthlyLimit: z.number().positive().max(ExpenseInputLimits.amountMax).optional(),
        periodStartDay: z.number().int().min(1).max(31).optional(),
        linkedGoalId: z.number().int().positive().nullable().optional(),
        alertThresholdPercent: z.number().int().min(1).max(100).optional(),
        status: z.enum(["active", "paused"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.linkedGoalId) {
        await assertEntityOwnership({
          userId: ctx.user.id,
          userType: ctx.user.type,
          linkedGoalId: input.linkedGoalId,
        });
      }

      const [existing] = await db
        .select({ id: userBudgets.id, category: userBudgets.category })
        .from(userBudgets)
        .where(
          and(
            eq(userBudgets.id, input.budgetId),
            eq(userBudgets.userId, ctx.user.id),
            eq(userBudgets.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "الميزانية غير موجودة",
        });
      }

      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title.trim();
      if (input.category !== undefined || input.purposeCategoryId !== undefined) {
        const category = budgetCategory(input);
        updateData.category = category;
        if (input.purposeCategoryId) {
          updateData.metadata = sql`JSON_SET(COALESCE(${userBudgets.metadata}, JSON_OBJECT()), '$.purposeCategoryId', ${input.purposeCategoryId})`;
        } else if (input.purposeCategoryId === null || category !== existing.category) {
          updateData.metadata = sql`JSON_REMOVE(${userBudgets.metadata}, '$.purposeCategoryId')`;
        }
      }
      if (input.monthlyLimit !== undefined) updateData.monthlyLimit = String(input.monthlyLimit);
      if (input.periodStartDay !== undefined) updateData.periodStartDay = input.periodStartDay;
      if (input.linkedGoalId !== undefined) updateData.linkedGoalId = input.linkedGoalId;
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
      const [existing] = await db
        .select({ id: userBudgets.id })
        .from(userBudgets)
        .where(
          and(
            eq(userBudgets.id, input.budgetId),
            eq(userBudgets.userId, ctx.user.id),
            eq(userBudgets.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "الميزانية غير موجودة",
        });
      }

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
