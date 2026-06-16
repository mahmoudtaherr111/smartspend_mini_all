import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { db, getDb } from "./queries/connection";
import {
  expenses,
  expenseCategories,
  userDictionaries,
  users,
  localUsers,
  classificationLogs,
  pendingClarifications,
  systemSettings,
} from "../db/schema";
import { parseNameAndRelationship } from "./lib/relationship-normalizer";
import { eq, and, gte, lte, desc, sql, lt } from "drizzle-orm";
import Decimal from "decimal.js";
import { ExpenseInputLimits } from "../contracts/constants";
import { invalidateUserMemory } from "./lib/muscle-memory";
import { deleteCacheByPattern, withCache } from "./lib/redis-client";
import { checkUserBudgetExceeded } from "./notification-engine";
import { invalidateFinanceUserCache } from "./services/finance-semantic-layer";

async function invalidateExpenseCache(userId: number | string, userType: string) {
  try {
    await deleteCacheByPattern(`expense_stats:${userId}:${userType}:*`);
    await invalidateFinanceUserCache(userId, userType);
  } catch (err) {
    console.warn("Failed to invalidate expense cache", err);
  }
}

const transactionTypeSchema = z.enum([
  "income",
  "expense",
  "transfer",
  "investment",
]);

const expenseRawText = z.string().min(1).max(ExpenseInputLimits.rawTextMax);
const expenseCategory = z.string().min(1).max(ExpenseInputLimits.categoryMax);
const expenseAmount = z.number().positive().max(ExpenseInputLimits.amountMax);

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

function safeDate(value: unknown, fallback: Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value as any);
  return isValidDate(date) ? date : new Date(fallback);
}

function safeDateString(value: unknown, fallback = ""): string {
  const date = value instanceof Date ? value : new Date(value as any);
  return isValidDate(date) ? date.toISOString().split("T")[0] : fallback;
}

function safeDayDiff(start: Date, end: Date): number {
  if (!isValidDate(start) || !isValidDate(end)) return 1;
  const diff = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

const statsCategoryDisplayNames: Record<string, string> = {
  food: "أكل وشرب",
  transport: "مواصلات",
  shopping: "تسوق",
  health: "صحة",
  bills: "فواتير",
  income: "دخل",
  saving: "ادخار",
  uncategorized: "غير مصنف",
};

function normalizeStatsCategory(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "غير مصنف";
  return statsCategoryDisplayNames[raw.toLowerCase()] ?? raw;
}

export const expenseRouter = router({
  create: authedProcedure
    .input(
      z.object({
        amount: expenseAmount,
        type: transactionTypeSchema.default("expense"),
        category: expenseCategory,
        subCategory: z
          .string()
          .max(ExpenseInputLimits.subCategoryMax)
          .optional(),
        description: z
          .string()
          .max(ExpenseInputLimits.descriptionMax)
          .optional(),
        rawText: expenseRawText,
        source: z
          .enum(["voice", "manual", "ai_parsed", "image", "sms"])
          .default("manual"),
        date: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const requestUserType = ctx.user!.type;

      const expenseDate = input.date ? new Date(input.date) : new Date();

      await db.insert(expenses).values({
        userId,
        userType: requestUserType,
        type: input.type,
        amount: input.amount.toString(),
        category: input.category,
        subCategory: input.subCategory || "عام",
        description: input.description || "",
        rawText: input.rawText,
        source: input.source,
        date: expenseDate,
      });

      // Phase 2: Invalidate muscle memory cache so it learns this new confirmed pattern
      invalidateUserMemory(userId, requestUserType);

      // Phase 2.5: Auto-learn dynamic contacts from manually saved expenses
      const personCategories = [
        "العائلة",
        "أصدقاء",
        "موظفين",
        "خدمات سيارات",
        "أخرى",
      ];
      if (
        personCategories.includes(input.category) &&
        input.subCategory &&
        input.subCategory !== "عام"
      ) {
        const { name, relationship } = parseNameAndRelationship(
          input.subCategory,
          input.category,
        );
        if (name && name !== "عام" && name !== "شخص") {
          const { addDynamicContact } =
            await import("./services/user-profile-service");
          await addDynamicContact(
            userId as number,
            requestUserType,
            name,
            relationship,
          );
        }
      }

      // ─── Gamification: Update Streaks ───
      try {
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (requestUserType === "oauth") {
          const [u] = await db
            .select()
            .from(users)
            .where(eq(users.id, Number(userId)));
          if (u) {
            const lastDate = u.lastStreakAt ? new Date(u.lastStreakAt) : null;
            const lastStr = lastDate
              ? lastDate.toISOString().split("T")[0]
              : null;

            if (lastStr !== todayStr) {
              let newStreak =
                lastStr === yesterdayStr ? (u.currentStreak || 0) + 1 : 1;
              let highestStreak = Math.max(u.highestStreak || 0, newStreak);
              await db
                .update(users)
                .set({
                  currentStreak: newStreak,
                  highestStreak,
                  lastStreakAt: now,
                })
                .where(eq(users.id, Number(userId)));
            }
          }
        } else {
          const [u] = await db
            .select()
            .from(localUsers)
            .where(eq(localUsers.id, userId as number));
          if (u) {
            const lastDate = u.lastStreakAt ? new Date(u.lastStreakAt) : null;
            const lastStr = lastDate
              ? lastDate.toISOString().split("T")[0]
              : null;

            if (lastStr !== todayStr) {
              let newStreak =
                lastStr === yesterdayStr ? (u.currentStreak || 0) + 1 : 1;
              let highestStreak = Math.max(u.highestStreak || 0, newStreak);
              await db
                .update(localUsers)
                .set({
                  currentStreak: newStreak,
                  highestStreak,
                  lastStreakAt: now,
                })
                .where(eq(localUsers.id, userId as number));
            }
          }
        }
      } catch (err) {
        console.error("Streak logic error:", err);
      }

      await invalidateExpenseCache(userId, requestUserType);
      
      if (input.type === "expense") {
        checkUserBudgetExceeded(userId as number, requestUserType).catch(err => {
          console.error("Budget exceeded check failed:", err);
        });
      }

      return { success: true };
    }),

  batchCreate: authedProcedure
    .input(
      z.array(
        z.object({
          amount: expenseAmount,
          type: transactionTypeSchema.default("expense"),
          category: expenseCategory,
          subCategory: z.string().max(ExpenseInputLimits.subCategoryMax).optional(),
          description: z.string().max(ExpenseInputLimits.descriptionMax).optional(),
          rawText: expenseRawText,
          source: z.enum(["voice", "manual", "ai_parsed", "image", "sms"]).default("manual"),
          date: z.string().optional(),
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const requestUserType = ctx.user!.type;

      if (input.length === 0) return { success: true };

      const valuesToInsert = input.map(item => ({
        userId,
        userType: requestUserType,
        type: item.type,
        amount: item.amount.toString(),
        category: item.category,
        subCategory: item.subCategory || "عام",
        description: item.description || "",
        rawText: item.rawText,
        source: item.source,
        date: item.date ? new Date(item.date) : new Date(),
      }));

      await db.insert(expenses).values(valuesToInsert);

      invalidateUserMemory(userId, requestUserType);

      const personCategories = ["العائلة", "أصدقاء", "موظفين", "خدمات سيارات", "أخرى"];
      for (const item of input) {
        if (personCategories.includes(item.category) && item.subCategory && item.subCategory !== "عام") {
          const { name, relationship } = parseNameAndRelationship(item.subCategory, item.category);
          if (name && name !== "عام" && name !== "شخص") {
            const { addDynamicContact } = await import("./services/user-profile-service");
            await addDynamicContact(userId as number, requestUserType, name, relationship);
          }
        }
      }

      try {
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (requestUserType === "oauth") {
          const [u] = await db.select().from(users).where(eq(users.id, Number(userId)));
          if (u) {
            const lastDate = u.lastStreakAt ? new Date(u.lastStreakAt) : null;
            const lastStr = lastDate ? lastDate.toISOString().split("T")[0] : null;

            if (lastStr !== todayStr) {
              let newStreak = lastStr === yesterdayStr ? (u.currentStreak || 0) + 1 : 1;
              let highestStreak = Math.max(u.highestStreak || 0, newStreak);
              await db.update(users).set({ currentStreak: newStreak, highestStreak, lastStreakAt: now })
                .where(eq(users.id, Number(userId)));
            }
          }
        } else {
          const [u] = await db.select().from(localUsers).where(eq(localUsers.id, userId as number));
          if (u) {
            const lastDate = u.lastStreakAt ? new Date(u.lastStreakAt) : null;
            const lastStr = lastDate ? lastDate.toISOString().split("T")[0] : null;

            if (lastStr !== todayStr) {
              let newStreak = lastStr === yesterdayStr ? (u.currentStreak || 0) + 1 : 1;
              let highestStreak = Math.max(u.highestStreak || 0, newStreak);
              await db.update(localUsers).set({ currentStreak: newStreak, highestStreak, lastStreakAt: now })
                .where(eq(localUsers.id, userId as number));
            }
          }
        }
      } catch (err) {
        console.error("Streak logic error:", err);
      }

      await invalidateExpenseCache(userId, requestUserType);
      
      const hasExpenses = input.some(item => item.type === "expense");
      if (hasExpenses) {
        checkUserBudgetExceeded(userId as number, requestUserType).catch(err => {
          console.error("Budget exceeded check failed:", err);
        });
      }

      return { success: true };
    }),

  list: authedProcedure
    .input(
      z
        .object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          category: z.string().max(ExpenseInputLimits.categoryMax).optional(),
          type: transactionTypeSchema.optional(),
          limit: z.number().min(1).max(100).default(50),
          cursor: z.number().optional(),
          offset: z.number().min(0).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      try {
        const conditions = [
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
        ];

        if (input?.startDate)
          conditions.push(gte(expenses.date, new Date(input.startDate)));
        if (input?.endDate)
          conditions.push(lte(expenses.date, new Date(input.endDate)));
        if (input?.category)
          conditions.push(eq(expenses.category, input.category));
        if (input?.type) conditions.push(eq(expenses.type, input.type));
        if (input?.cursor) conditions.push(lt(expenses.id, input.cursor));

        const items = await db
          .select()
          .from(expenses)
          .where(and(...conditions))
          .orderBy(desc(expenses.id))
          .limit(input?.limit || 50)
          .offset(input?.offset || 0);

        const countResult = await db
          .select({ count: sql`count(*)` })
          .from(expenses)
          .where(and(...conditions));

        return {
          items,
          total: Number(countResult[0].count),
        };
      } catch (err) {
        console.error("Expense list error:", err);
        throw err;
      }
    }),

  searchTransactions: authedProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      // Search across category, subCategory, description, and rawText
      const q = `%${input.query}%`;
      const conditions = and(
        eq(expenses.userId, userId),
        eq(expenses.userType, userType),
        sql`${expenses.category} LIKE ${q} OR ${expenses.subCategory} LIKE ${q} OR ${expenses.description} LIKE ${q} OR ${expenses.rawText} LIKE ${q}`,
      );

      const items = await db
        .select()
        .from(expenses)
        .where(conditions)
        .orderBy(desc(expenses.date))
        .limit(20);

      return items;
    }),

  getById: authedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;
      const result = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, input.id),
            eq(expenses.userId, userId),
            eq(expenses.userType, userType),
          ),
        );
      return result[0] || null;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.number(),
        amount: expenseAmount.optional(),
        type: transactionTypeSchema.optional(),
        category: expenseCategory.optional(),
        subCategory: z
          .string()
          .max(ExpenseInputLimits.subCategoryMax || 100)
          .optional(),
        description: z
          .string()
          .max(ExpenseInputLimits.descriptionMax)
          .optional(),
        rawText: expenseRawText.optional(),
        date: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      // Fetch the original expense BEFORE updating (needed for auto-learning)
      const [originalExpense] = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, input.id),
            eq(expenses.userId, userId),
            eq(expenses.userType, userType),
          ),
        );

      const updateData: Record<string, any> = {};
      if (input.amount !== undefined)
        updateData.amount = input.amount.toString();
      if (input.type !== undefined) updateData.type = input.type;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.subCategory !== undefined)
        updateData.subCategory = input.subCategory;
      if (input.description !== undefined)
        updateData.description = input.description;
      if (input.rawText !== undefined) updateData.rawText = input.rawText;
      if (input.date !== undefined) updateData.date = new Date(input.date);

      await db
        .update(expenses)
        .set(updateData)
        .where(
          and(
            eq(expenses.id, input.id),
            eq(expenses.userId, userId),
            eq(expenses.userType, userType),
          ),
        );

      // Phase 2: Invalidate muscle memory cache so it learns this correction
      invalidateUserMemory(userId, userType);

      // Phase 2.5: Auto-learn dynamic contacts from manually edited expenses
      const personCategories = [
        "العائلة",
        "أصدقاء",
        "موظفين",
        "خدمات سيارات",
        "أخرى",
      ];
      if (
        input.category &&
        personCategories.includes(input.category) &&
        input.subCategory &&
        input.subCategory !== "عام"
      ) {
        const { name, relationship } = parseNameAndRelationship(
          input.subCategory,
          input.category,
        );
        if (name && name !== "عام" && name !== "شخص") {
          const { addDynamicContact } =
            await import("./services/user-profile-service");
          await addDynamicContact(
            userId as number,
            userType,
            name,
            relationship,
          );
        }
      }
      // ── Strategy 6: Auto-Learning Muscle Memory ──
      // When user corrects a category, extract keywords from rawText
      // and auto-save them to user_dictionaries for instant future matching.
      const categoryChanged =
        input.category &&
        originalExpense &&
        originalExpense.category !== input.category;
      if (categoryChanged && originalExpense?.rawText) {
        try {
          const newCategory = input.category!;
          const newSubCategory =
            input.subCategory || originalExpense.subCategory || "عام";
          const rawText = originalExpense.rawText;

          const [latestClassificationLog] = await db
            .select({ id: classificationLogs.id })
            .from(classificationLogs)
            .where(
              and(
                eq(classificationLogs.userId, userId),
                eq(classificationLogs.userType, userType),
                eq(classificationLogs.originalText, rawText),
              ),
            )
            .orderBy(desc(classificationLogs.createdAt))
            .limit(1);

          if (latestClassificationLog) {
            await db
              .update(classificationLogs)
              .set({
                wasCorrected: true,
                correction: {
                  expenseId: input.id,
                  previousCategory: originalExpense.category,
                  previousSubCategory: originalExpense.subCategory,
                  correctedCategory: newCategory,
                  correctedSubCategory: newSubCategory,
                  correctedAt: new Date().toISOString(),
                },
              })
              .where(eq(classificationLogs.id, latestClassificationLog.id));
          }

          // Instead of extracting single words, save the exact phrase normalized
          let exactPhrase = rawText
            .replace(/\d+(\.\d+)?/g, "") // Remove numbers
            .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, "") // Keep Arabic + English only
            .replace(/\s+/g, " ") // Normalize spaces
            .trim()
            .toLowerCase();

          // If the phrase is meaningful (at least 3 chars)
          if (exactPhrase.length >= 3) {
            // Trim to fit database column (max 255 chars for 'word' column if updated, safely keeping 100 or less)
            exactPhrase = exactPhrase.substring(0, 100);

            await db
              .insert(userDictionaries)
              .values({
                userId,
                userType,
                word: exactPhrase,
                category: newCategory,
                subCategory: newSubCategory,
              })
              .onDuplicateKeyUpdate({
                set: {
                  category: newCategory,
                  subCategory: newSubCategory,
                },
              })
              .catch(() => {
                /* ignore duplicate/constraint errors */
              });

            console.log(
              `🧠 Auto-learned phrase for user ${userId}: ["${exactPhrase}"] → ${newCategory}/${newSubCategory}`,
            );
          }
        } catch (learnErr) {
          console.warn("Auto-learning failed (non-fatal):", learnErr);
        }
      }

      await invalidateExpenseCache(userId, userType);
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;
      await db
        .delete(expenses)
        .where(
          and(
            eq(expenses.id, input.id),
            eq(expenses.userId, userId),
            eq(expenses.userType, userType),
          ),
        );
      await invalidateExpenseCache(userId, userType);
      return { success: true };
    }),

  getMonthSummary: authedProcedure
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        salaryDay: z.number().min(1).max(31).optional().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;
      
      const cacheKey = `expense_stats:${userId}:${userType}:summary:${input.month}:${input.salaryDay || 0}`;
      
      return withCache(cacheKey, 60 * 60 * 24, async () => {
        const { getFinancialMonthDates } =
          await import("./services/financial-month");
        const { startDate, endDate } = getFinancialMonthDates(
          input.month,
          input.salaryDay,
        );

        const [summary] = await db
          .select({
            totalIncome: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'income' THEN ${expenses.amount} ELSE 0 END), 0)`,
            totalExpense: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'expense' THEN ${expenses.amount} ELSE 0 END), 0)`,
            totalTransfers: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'transfer' THEN ${expenses.amount} ELSE 0 END), 0)`,
            totalInvestments: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'investment' THEN ${expenses.amount} ELSE 0 END), 0)`,
            count: sql`COUNT(*)`,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, userId),
              eq(expenses.userType, userType),
              gte(expenses.date, startDate),
              lte(expenses.date, endDate),
            ),
          );

        const totalIncome = Number(summary?.totalIncome || 0);
        const totalExpense = Number(summary?.totalExpense || 0);

        return {
          totalIncome,
          totalExpense,
          totalTransfers: Number(summary?.totalTransfers || 0),
          totalInvestments: Number(summary?.totalInvestments || 0),
          netFlow: totalIncome - totalExpense,
          count: Number(summary?.count || 0),
        };
      });
    }),

  getMonthlyStats: authedProcedure
    .input(
      z.object({
        month: z.string(),
        salaryDay: z.number().min(1).max(31).optional().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;
      
      const cacheKey = `expense_stats:${userId}:${userType}:stats:${input.month}:${input.salaryDay || 0}`;
      
      return withCache(cacheKey, 60 * 60 * 24, async () => {
        const { getFinancialMonthDates } =
          await import("./services/financial-month");
        const { startDate, endDate } = getFinancialMonthDates(
          input.month,
          input.salaryDay,
        );

        // Get user's first expense ever for date-aware analytics
        const firstExpense = await db
          .select({ date: expenses.date })
          .from(expenses)
          .where(
            and(eq(expenses.userId, userId), eq(expenses.userType, userType)),
          )
          .orderBy(expenses.date)
          .limit(1);

        const userStartDate = safeDate(firstExpense[0]?.date, startDate);

        const items = await db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, userId),
              eq(expenses.userType, userType),
              gte(expenses.date, startDate),
              lte(expenses.date, endDate),
            ),
          );

        // Calculate previous month's dates based on financial month logic
        const prevMonthDate = safeDate(`${input.month}-01`, startDate);
        prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const prevMonthStr = prevMonthDate.toISOString().slice(0, 7);
        const prevMonthDates = getFinancialMonthDates(
          prevMonthStr,
          input.salaryDay,
        );
        const prevStartDate = prevMonthDates.startDate;
        const prevEndDate = prevMonthDates.endDate;

        const previousItems = await db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, userId),
              eq(expenses.userType, userType),
              gte(expenses.date, prevStartDate),
              lte(expenses.date, prevEndDate),
            ),
          );

        const totalExpense = items
          .filter((i) => i.type === "expense")
          .reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0)).toNumber();
        const totalIncome = items
          .filter((i) => i.type === "income")
          .reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0)).toNumber();

      const automatedExpense = items
        .filter((i) => i.type === "expense" && i.source === "sms")
        .reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0)).toNumber();
      const automatedIncome = items
        .filter((i) => i.type === "income" && i.source === "sms")
        .reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0)).toNumber();

      const previousTotalExpense = previousItems
        .filter((i) => i.type === "expense")
        .reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0)).toNumber();
      const previousTotalIncome = previousItems
        .filter((i) => i.type === "income")
        .reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0)).toNumber();

      // Day map (expenses only)
      // Day map, Week map, Hour map, Day of week map
      const dayMap: Record<string, number> = {};
      const weekMap: Record<string, number> = {};
      const hourMap: Record<number, number> = {};
      const dayOfWeekMap: Record<string, number> = {};

      const dayNames = [
        "الأحد",
        "الإثنين",
        "الثلاثاء",
        "الأربعاء",
        "الخميس",
        "الجمعة",
        "السبت",
      ];

      items
        .filter((i) => i.type === "expense")
        .forEach((item) => {
          const date = safeDate(item.date, startDate);
          if (!isValidDate(date)) return;

          // Day Map
          const dayStr = safeDateString(date);
          if (!dayStr) return;
          dayMap[dayStr] = (dayMap[dayStr] || 0) + Number(item.amount);

          // Week Map
          const weekNum = Math.ceil(date.getDate() / 7);
          const weekKey = `الأسبوع ${weekNum}`;
          weekMap[weekKey] = (weekMap[weekKey] || 0) + Number(item.amount);

          // Hour Map
          const hour = date.getHours();
          hourMap[hour] = (hourMap[hour] || 0) + Number(item.amount);

          // Day of Week Map
          const dow = dayNames[date.getDay()];
          dayOfWeekMap[dow] = (dayOfWeekMap[dow] || 0) + Number(item.amount);
        });

      const highestDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];

      // Category map (expenses only)
      const categoryMap: Record<string, { value: number; count: number }> = {};
      const subCategoryMap: Record<string, { value: number; count: number }> =
        {};

      items
        .filter((i) => i.type === "expense")
        .forEach((item) => {
          const amt = Number(item.amount);
          const categoryName = normalizeStatsCategory(item.category);
          if (!categoryMap[categoryName])
            categoryMap[categoryName] = { value: 0, count: 0 };
          categoryMap[categoryName].value += amt;
          categoryMap[categoryName].count += 1;

          if (item.subCategory && item.subCategory !== "عام") {
            if (!subCategoryMap[item.subCategory])
              subCategoryMap[item.subCategory] = { value: 0, count: 0 };
            subCategoryMap[item.subCategory].value += amt;
            subCategoryMap[item.subCategory].count += 1;
          }
        });

      const categoryBreakdown = Object.entries(categoryMap).map(
        ([name, data]) => ({
          name,
          value: data.value,
          count: data.count,
          avg: data.count > 0 ? Math.round(data.value / data.count) : 0,
          percentage:
            totalExpense > 0
              ? Math.round((data.value / totalExpense) * 100)
              : 0,
        }),
      );

      const subCategoryBreakdown = Object.entries(subCategoryMap)
        .map(([name, data]) => ({
          name,
          value: data.value,
          count: data.count,
          avg: data.count > 0 ? Math.round(data.value / data.count) : 0,
          percentage:
            totalExpense > 0
              ? Math.round((data.value / totalExpense) * 100)
              : 0,
        }))
        .sort((a, b) => b.value - a.value);

      const sortedCategories = [...categoryBreakdown].sort(
        (a, b) => b.value - a.value,
      );
      const hierarchicalBreakdown = sortedCategories.map((main) => ({
        name: main.name,
        value: main.value,
        count: main.count,
        children: subCategoryBreakdown.filter((s) =>
          items.some(
            (it) => normalizeStatsCategory(it.category) === main.name && it.subCategory === s.name,
          ),
        ),
      }));

      const recurringHints = subCategoryBreakdown
        .filter(
          (s) =>
            s.count >= 2 &&
            ["اشتراك", "باقات", "قسط", "إنترنت", "كهرباء"].some((k) =>
              s.name.includes(k),
            ),
        )
        .slice(0, 8);

      // Day trend (Income vs Expense)
      const cashFlowMap: Record<string, { expense: number; income: number }> =
        {};
      items.forEach((item) => {
        const dateStr = safeDateString(item.date);
        if (!dateStr) return;
        if (!cashFlowMap[dateStr])
          cashFlowMap[dateStr] = { expense: 0, income: 0 };
        if (item.type === "expense")
          cashFlowMap[dateStr].expense += Number(item.amount);
        if (item.type === "income")
          cashFlowMap[dateStr].income += Number(item.amount);
      });

      const dayTrend = Object.entries(cashFlowMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date: date.slice(5),
          amount: data.expense,
          income: data.income,
        }));

      // Date-aware daily average: from user's first expense date to today (or month end)
      const today = new Date();
      const endOfMonth =
        isValidDate(endDate) && endDate > today ? today : endDate;
      const activeDays = safeDayDiff(userStartDate, endOfMonth);
      const dailyAverage = totalExpense / Math.min(activeDays, 30);
      const previousNetFlow = previousTotalIncome - previousTotalExpense;
      // Day-matched weekly vs monthly comparison logic
      const getDayOfFinancialMonth = (d: Date, start: Date) => {
        return Math.max(1, Math.ceil((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      };

      const currentDayNumber = Math.max(1, getDayOfFinancialMonth(today, startDate));
      let comparisonType: "weekly" | "monthly" = "monthly";
      let weekNumber = 1;
      let expenseChangePercent: number | null = null;

      if (currentDayNumber > 24) {
        comparisonType = "monthly";
        expenseChangePercent =
          previousTotalExpense > 0
            ? Math.round(
                ((totalExpense - previousTotalExpense) / previousTotalExpense) *
                  100,
              )
            : null;
      } else {
        comparisonType = "weekly";
        let startDay = 1;
        let endDay = 7;

        if (currentDayNumber > 21) {
          weekNumber = 4;
          startDay = 22;
          endDay = 28;
        } else if (currentDayNumber > 14) {
          weekNumber = 3;
          startDay = 15;
          endDay = 21;
        } else if (currentDayNumber > 7) {
          weekNumber = 2;
          startDay = 8;
          endDay = 14;
        } else {
          weekNumber = 1;
          startDay = 1;
          endDay = 7;
        }

        const currentWeekExpenses = items.filter((i) => {
          if (i.type !== "expense") return false;
          const itemDay = getDayOfFinancialMonth(new Date(i.date), startDate);
          return itemDay >= startDay && itemDay <= Math.min(endDay, currentDayNumber);
        });

        const prevWeekExpenses = previousItems.filter((i) => {
          if (i.type !== "expense") return false;
          const itemDay = getDayOfFinancialMonth(new Date(i.date), prevStartDate);
          return itemDay >= startDay && itemDay <= Math.min(endDay, currentDayNumber);
        });

        const currentWeekSum = currentWeekExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
        const prevWeekSum = prevWeekExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

        expenseChangePercent = prevWeekSum > 0 ? Math.round(((currentWeekSum - prevWeekSum) / prevWeekSum) * 100) : null;
      }
      const incomeChangePercent =
        previousTotalIncome > 0
          ? Math.round(
              ((totalIncome - previousTotalIncome) / previousTotalIncome) * 100,
            )
          : null;
      const previousCategoryMap: Record<string, number> = {};
      const previousSubCategoryMap: Record<string, number> = {};
      previousItems
        .filter((i) => i.type === "expense")
        .forEach((item) => {
          const categoryName = normalizeStatsCategory(item.category);
          previousCategoryMap[categoryName] =
            (previousCategoryMap[categoryName] || 0) + Number(item.amount);
          if (item.subCategory)
            previousSubCategoryMap[item.subCategory] =
              (previousSubCategoryMap[item.subCategory] || 0) +
              Number(item.amount);
        });
      const categoryChanges = sortedCategories.map((cat) => {
        const previous = previousCategoryMap[cat.name] || 0;
        return {
          name: cat.name,
          current: cat.value,
          previous,
          changePercent:
            previous > 0
              ? Math.round(((cat.value - previous) / previous) * 100)
              : null,
        };
      });
      const subCategoryChanges = subCategoryBreakdown.map((sub) => {
        const previous = previousSubCategoryMap[sub.name] || 0;
        return {
          name: sub.name,
          current: sub.value,
          previous,
          changePercent:
            previous > 0
              ? Math.round(((sub.value - previous) / previous) * 100)
              : null,
        };
      });
      const mostRecurringExpense =
        subCategoryBreakdown.slice().sort((a, b) => b.count - a.count)[0] ||
        null;

      // Calculate family/friends peer-to-peer tracking (both incoming and outgoing)
      const familyMap: Record<
        string,
        { spent: number; received: number; transactions: any[] }
      > = {};
      items
        .filter((i) => i.category === "العائلة")
        .forEach((item) => {
          const person =
            item.subCategory && item.subCategory !== "عام"
              ? item.subCategory
              : "شخص آخر";
          if (!familyMap[person])
            familyMap[person] = { spent: 0, received: 0, transactions: [] };

          const amt = Number(item.amount);
          if (item.type === "expense") {
            familyMap[person].spent += amt;
          } else if (item.type === "income") {
            familyMap[person].received += amt;
          }
          familyMap[person].transactions.push(item);
        });

      const familyBreakdown = Object.entries(familyMap)
        .map(([person, data]) => ({
          person,
          spent: data.spent,
          received: data.received,
          netBalance: data.received - data.spent, // Positive means they owe us / we received more. Negative means we owe them / we spent more.
          transactions: data.transactions.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          ),
        }))
        .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));

      const flexCategories = new Set(["ترفيه", "تسوق", "أكل وشرب", "خروجات"]);
      const flexSpend = sortedCategories
        .filter((cat) => flexCategories.has(cat.name))
        .reduce((sum, cat) => sum + cat.value, 0);
      const flexPercent =
        totalExpense > 0 ? (flexSpend / totalExpense) * 100 : 0;
      const dailyAverageSpike =
        dayTrend.length > 0 ? totalExpense / dayTrend.length : 0;
      const hasSpike = dayTrend.some(
        (d) => d.amount > Math.max(500, dailyAverageSpike * 2.5),
      );

      let spendingBehavior = "planned";
      if (hasSpike || flexPercent > 45) spendingBehavior = "spiky";
      if (flexPercent > 55) spendingBehavior = "emotional";
      if (sortedCategories.length <= 2 && totalExpense > 0)
        spendingBehavior = "concentrated";

      const expenseIncomeRatio =
        totalIncome > 0 ? (totalExpense / totalIncome) * 100 : null;
      if (expenseIncomeRatio !== null) {
        if (expenseIncomeRatio > 95) spendingBehavior = "impulsive";
        if (expenseIncomeRatio < 40) spendingBehavior = "conservative";
      }

      return {
        structuredMonthlyBreakdown: {
          totalIncome,
          totalExpense,
          netFlow: totalIncome - totalExpense,
          previousTotalIncome,
          previousTotalExpense,
          previousNetFlow,
        },
        totalExpense,
        totalIncome,
        automatedExpense,
        automatedIncome,
        netFlow: totalIncome - totalExpense,
        count: items.length,
        dailyAverage,
        categoryBreakdown: sortedCategories,
        subCategoryBreakdown,
        topCategories: sortedCategories.slice(0, 5),
        highestDay: highestDay
          ? { date: highestDay[0], amount: highestDay[1] }
          : null,
        weekBreakdown: Object.entries(weekMap).map(([name, amount]) => ({
          name,
          amount,
        })),
        dayTrend,
        hourTrend: Object.entries(hourMap)
          .map(([hour, amount]) => ({ hour: parseInt(hour), amount }))
          .sort((a, b) => a.hour - b.hour),
        dayOfWeekTrend: Object.entries(dayOfWeekMap).map(([name, amount]) => ({
          name,
          amount,
        })),
        hierarchicalBreakdown,
        familyBreakdown,
        recurringBreakdown: recurringHints,
        behavioralInsights: {
          topSpendingDay: highestDay
            ? { date: highestDay[0], amount: highestDay[1] }
            : null,
          mostRecurringExpense,
          expenseChangePercent,
          incomeChangePercent,
          spendingIncreased:
            expenseChangePercent === null ? null : expenseChangePercent > 0,
          spendingBehavior,
          comparisonType,
          weekNumber,
        },
        comparativeAnalysis: {
          previousMonth: {
            totalIncome: previousTotalIncome,
            totalExpense: previousTotalExpense,
            netFlow: previousNetFlow,
          },
          categoryChanges,
          subCategoryChanges,
          trend:
            expenseChangePercent === null
              ? "new"
              : expenseChangePercent > 0
                ? "up"
                : expenseChangePercent < 0
                  ? "down"
                  : "flat",
        },
        items,
      };
      });
    }),

  getYearlyStats: authedProcedure
    .input(z.object({ year: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      const startDate = new Date(input.year + "-01-01");
      const endDate = new Date(input.year + "-12-31");

      const items = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.userType, userType),
            gte(expenses.date, startDate),
            lte(expenses.date, endDate),
          ),
        );

      const totalExpense = items
        .filter((i) => i.type === "expense")
        .reduce((sum, item) => sum + Number(item.amount), 0);
      const totalIncome = items
        .filter((i) => i.type === "income")
        .reduce((sum, item) => sum + Number(item.amount), 0);

      const monthMap: Record<string, number> = {};
      for (let i = 1; i <= 12; i++) {
        monthMap[`${input.year}-${String(i).padStart(2, "0")}`] = 0;
      }
      items
        .filter((i) => i.type === "expense")
        .forEach((item) => {
          const month = safeDateString(
            item.date,
            input.year ? `${input.year}-01` : "",
          );
          if (!month) return;
          monthMap[month] = (monthMap[month] || 0) + Number(item.amount);
        });

      const monthNames = [
        "يناير",
        "فبراير",
        "مارس",
        "إبريل",
        "مايو",
        "يونيو",
        "يوليو",
        "أغسطس",
        "سبتمبر",
        "أكتوبر",
        "نوفمبر",
        "ديسمبر",
      ];
      const monthlyData = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => {
          const monthIdx = parseInt(month.split("-")[1]) - 1;
          return { month: monthNames[monthIdx], amount };
        });

      return {
        totalExpense,
        totalIncome,
        netFlow: totalIncome - totalExpense,
        count: items.length,
        monthlyData,
      };
    }),

  getCategoryList: authedProcedure.query(async () => {
    const db = getDb();
    return await db.select().from(expenseCategories);
  }),

  createCategory: authedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        icon: z.string().default("receipt"),
        color: z.string().default("#3b82f6"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.insert(expenseCategories).values({
        userId: ctx.user!.id,
        userType: ctx.user!.type,
        name: input.name,
        icon: input.icon,
        color: input.color,
        isDefault: false,
      });
      return { success: true };
    }),

  getPendingClarifications: authedProcedure
    .query(async ({ ctx }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      const items = await db
        .select()
        .from(pendingClarifications)
        .where(
          and(
            eq(pendingClarifications.userId, userId),
            eq(pendingClarifications.userType, userType),
            eq(pendingClarifications.status, "pending"),
          ),
        )
        .orderBy(desc(pendingClarifications.createdAt));

      return items;
    }),

  answerClarification: authedProcedure
    .input(
      z.object({
        clarificationId: z.number(),
        answer: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      // Ensure it belongs to user
      const [clarification] = await db
        .select()
        .from(pendingClarifications)
        .where(
          and(
            eq(pendingClarifications.id, input.clarificationId),
            eq(pendingClarifications.userId, userId),
            eq(pendingClarifications.userType, userType),
          ),
        );

      if (!clarification) {
        throw new Error("Clarification not found");
      }

      let ctxData: Record<string, any> = {};
      if (typeof clarification.contextData === "string") {
        try {
          ctxData = JSON.parse(clarification.contextData);
        } catch (e) {
          ctxData = {};
        }
      } else if (clarification.contextData) {
        ctxData = clarification.contextData as Record<string, any>;
      }

      const pendingNames: string[] = Array.isArray(ctxData.pendingNames) ? [...ctxData.pendingNames] : [];
      const resolvedAnswers: Record<string, string> = typeof ctxData.resolvedAnswers === "object" && !Array.isArray(ctxData.resolvedAnswers) ? { ...ctxData.resolvedAnswers } : {};

      if (pendingNames.length > 0) {
        const trimmedAnswer = input.answer.trim();
        const { inferRelationshipFromText } = await import("./lib/person-resolver");

        let anyResolved = false;
        const remainingNames: string[] = [];

        // Attempt to resolve each pending name from the user's answer
        for (const name of pendingNames) {
           const inferredRel = inferRelationshipFromText(trimmedAnswer, name);
           const nameMentioned = trimmedAnswer.includes(name) || trimmedAnswer.includes(name.split(" ")[0]);
           
           if (inferredRel) {
               resolvedAnswers[name] = inferredRel;
               anyResolved = true;
           } else if (nameMentioned || pendingNames.length === 1) {
               // If name is mentioned but no explicit relationship is inferred, or if there's only 1 name, assign the remaining text
               const finalAnswer = (trimmedAnswer === "تخطي" || trimmedAnswer.toLowerCase() === "skip")
                 ? "صاحبه"
                 : trimmedAnswer.replace(new RegExp(`(?:^|\\s)${name}(?:\\s|$)`), " ").trim() || trimmedAnswer;
               resolvedAnswers[name] = finalAnswer || "معروف";
               anyResolved = true;
           } else {
               remainingNames.push(name);
           }
        }

        // Fallback: If user typed something generic (e.g., "أخويا") without mentioning names, apply to the first pending name
        if (!anyResolved && pendingNames.length > 0) {
           const currentName = pendingNames[0];
           const finalAnswer = (trimmedAnswer === "تخطي" || trimmedAnswer.toLowerCase() === "skip")
                 ? "صاحبه" : trimmedAnswer;
           resolvedAnswers[currentName] = finalAnswer;
           remainingNames.push(...pendingNames.slice(1));
        }

        if (remainingNames.length > 0) {
          const nextQuestion = `محتاج أوضح دول مين: ${remainingNames.join(" و ")}؟`;
          
          await db
            .update(pendingClarifications)
            .set({
              question: nextQuestion,
              contextData: {
                ...ctxData,
                pendingNames: remainingNames,
                resolvedAnswers,
              },
            })
            .where(eq(pendingClarifications.id, input.clarificationId));

          let currentEnrichedText = clarification.originalText;
          for (const [name, rel] of Object.entries(resolvedAnswers)) {
            const looseName = name.replace(/[اأإآ]/g, "[اأإآ]").replace(/[يى]/g, "[يى]").replace(/[هة]/g, "[هة]");
            const nameRegex = new RegExp(`(?:^|\\s)(${looseName})(?:\\s|$)`);
            if (nameRegex.test(currentEnrichedText)) {
              currentEnrichedText = currentEnrichedText.replace(nameRegex, (match, p1) => match.replace(p1, `${p1} (${rel})`));
            } else {
              // Try without boundaries just in case
              const looseRegex = new RegExp(`(${looseName})`);
              if (looseRegex.test(currentEnrichedText)) {
                 currentEnrichedText = currentEnrichedText.replace(looseRegex, (match, p1) => match.replace(p1, `${p1} (${rel})`));
              } else {
                 // Absolute fallback, append to end
                 currentEnrichedText = `${currentEnrichedText} (${name} ${rel})`;
              }
            }
          }

          return {
            success: false,
            savedCount: 0,
            needsClarification: true,
            clarificationQuestion: nextQuestion,
            clarificationId: input.clarificationId,
            enrichedText: currentEnrichedText,
          };
        }

        let savedCount = 0;
        try {
          let enrichedText = clarification.originalText;
          for (const [name, rel] of Object.entries(resolvedAnswers)) {
            const looseName = name.replace(/[اأإآ]/g, "[اأإآ]").replace(/[يى]/g, "[يى]").replace(/[هة]/g, "[هة]");
            const nameRegex = new RegExp(`(?:^|\\s)(${looseName})(?:\\s|$)`);
            if (nameRegex.test(enrichedText)) {
              enrichedText = enrichedText.replace(nameRegex, (match, p1) => match.replace(p1, `${p1} (${rel})`));
            } else {
              const looseRegex = new RegExp(`(${looseName})`);
              if (looseRegex.test(enrichedText)) {
                enrichedText = enrichedText.replace(looseRegex, (match, p1) => match.replace(p1, `${p1} (${rel})`));
              } else {
                enrichedText = `${enrichedText} (${name} ${rel})`;
              }
            }
          }

          const { runSmartPipeline } = await import("./lib/smart-pipeline");
          const { env } = await import("./lib/env");
          const { resolveRoutingConfig } = await import("./ai-router");
          const { getSmartProfile, summarizeProfileForAI } = await import("./services/user-profile-service");
          const { buildPersonalContext, buildPersonalContextPrompt } = await import("./services/personal-context-builder");

          const [userDictRows, smartProfile, settingRows] = await Promise.all([
            db.select().from(userDictionaries)
              .where(and(eq(userDictionaries.userId, userId), eq(userDictionaries.userType, userType))),
            getSmartProfile(userId as number, userType as string),
            db.select().from(systemSettings),
          ]);
          const cfg: Record<string, string> = {};
          settingRows.forEach((s) => {
            if (s.value) cfg[s.key] = s.value;
          });

          const routing = await resolveRoutingConfig(ctx.user!.plan ?? "free", 0, cfg);
          const userDict = userDictRows.map((row) => ({ word: row.word, category: row.category, subCategory: row.subCategory ?? undefined }));
          const personalContextRaw = buildPersonalContext(smartProfile);

          for (const p of personalContextRaw.knownPeople) {
            const safeCategory = p.category && p.category !== "تحويلات" ? p.category : null;
            if (!safeCategory) continue;
            if (p.name && p.name.length >= 2) userDict.push({ word: p.name, category: safeCategory, subCategory: p.subCategory });
            const firstName = p.name.split(/\s+/)[0];
            if (firstName && firstName.length >= 2) userDict.push({ word: firstName, category: safeCategory, subCategory: p.subCategory });
          }
          
          const pipeline = await runSmartPipeline({
            text: enrichedText,
            userId: userId as number,
            userType: userType as string,
            userPlan: ctx.user!.plan,
            userDict,
            apiKey: routing.apiKey || env.GEMINI_API_KEY || "",
            apiKey2: routing.apiKey || env.GEMINI_API_KEY || "",
            modelName: routing.model,
            maxTokens: 2000,
            skipClarification: true,
            userProfileContext: {
              promptSummary: summarizeProfileForAI(smartProfile),
              personalContextPrompt: buildPersonalContextPrompt(personalContextRaw),
              spendingBehavior: typeof smartProfile.aiInferredAttributes?.spendingBehavior === "string" ? smartProfile.aiInferredAttributes.spendingBehavior : undefined,
              hasChildren: smartProfile.lifestyleInfo.hasChildren as boolean | null,
              responsibleForFamily: smartProfile.lifestyleInfo.responsibleForFamily as boolean | null,
              supportsOthers: smartProfile.lifestyleInfo.supportsOthers,
              fixedMonthlyCommitments: smartProfile.lifestyleInfo.fixedMonthlyCommitments,
              isSmoker: smartProfile.lifestyleInfo.smoking === true,
              hasCar: Boolean(smartProfile.lifestyleInfo.carOwnership),
              hasDebt: Boolean((smartProfile.financialInfo as any)?.hasDebt),
              knownPeople: personalContextRaw.knownPeople,
            },
            pipelineSettings: cfg,
          });

          const itemsToSave = pipeline.items && pipeline.items.length > 0
            ? pipeline.items
            : Array.isArray(ctxData.items) ? ctxData.items : [];

          for (const item of itemsToSave) {
            await db.insert(expenses).values({
              userId: userId as number,
              userType: userType as string,
              amount: item.amount.toString(),
              description: item.description || enrichedText,
              category: item.category,
              subCategory: item.subCategory,
              type: item.type,
              date: new Date(),
              source: "manual",
              rawText: enrichedText,
            });

            if (item.person_mentioned && item.person_relationship) {
              const pName = item.person_mentioned.trim();
              const pRel = item.person_relationship.trim();
              if (pName && pName !== "عام" && pName !== "شخص") {
                const { addDynamicContact } = await import("./services/user-profile-service");
                await addDynamicContact(userId as number, userType as string, pName, pRel);
              }
            }
            savedCount += 1;
          }
          await invalidateExpenseCache(userId as number, userType as string);
          
          const hasExpenses = itemsToSave.some((item: any) => item.type === "expense");
          if (hasExpenses) {
            checkUserBudgetExceeded(userId as number, userType as string).catch(err => {
              console.error("Budget exceeded check failed:", err);
            });
          }
        } catch (err) {
          console.error("Failed to save after queue clarification:", err);
          throw new Error(err instanceof Error ? err.message : "تعذر حفظ العمليات بعد التوضيح.");
        }

        await db
          .update(pendingClarifications)
          .set({ status: "resolved" })
          .where(eq(pendingClarifications.id, input.clarificationId));

        return {
          success: true,
          savedCount,
          needsClarification: false,
          clarificationQuestion: undefined,
          clarificationId: undefined,
          enrichedText: undefined,
        };
      }

      let savedCount = 0;
      try {
        const { runSmartPipeline } = await import("./lib/smart-pipeline");
        const { env } = await import("./lib/env");
        const { resolveRoutingConfig } = await import("./ai-router");
        const { getSmartProfile, summarizeProfileForAI } = await import("./services/user-profile-service");
        const { buildPersonalContext, buildPersonalContextPrompt } = await import("./services/personal-context-builder");

        const enrichedText = clarification.originalText + " (" + input.answer + ")";
        
        const [userDictRows, smartProfile, settingRows] = await Promise.all([
          db.select().from(userDictionaries)
            .where(and(eq(userDictionaries.userId, userId), eq(userDictionaries.userType, userType))),
          getSmartProfile(userId as number, userType as string),
          db.select().from(systemSettings),
        ]);
        const cfg: Record<string, string> = {};
        settingRows.forEach((s) => {
          if (s.value) cfg[s.key] = s.value;
        });

        const routing = await resolveRoutingConfig(
          ctx.user!.plan ?? "free",
          0,
          cfg,
        );

        const userDict = userDictRows.map((row) => ({ word: row.word, category: row.category, subCategory: row.subCategory ?? undefined }));
        const personalContextRaw = buildPersonalContext(smartProfile);

        for (const p of personalContextRaw.knownPeople) {
          const safeCategory = p.category && p.category !== "تحويلات" ? p.category : null;
          if (!safeCategory) continue;
          if (p.name && p.name.length >= 2) {
             userDict.push({ word: p.name, category: safeCategory, subCategory: p.subCategory });
          }
          const firstName = p.name.split(/\s+/)[0];
          if (firstName && firstName.length >= 2) {
             userDict.push({ word: firstName, category: safeCategory, subCategory: p.subCategory });
          }
        }
        
        const pipeline = await runSmartPipeline({
          text: enrichedText,
          userId: userId as number,
          userType: userType as string,
          userPlan: ctx.user!.plan,
          userDict,
          apiKey: routing.apiKey || env.GEMINI_API_KEY || "",
          apiKey2: routing.apiKey || env.GEMINI_API_KEY || "",
          modelName: routing.model,
          maxTokens: 2000,
          userProfileContext: {
            promptSummary: summarizeProfileForAI(smartProfile),
            personalContextPrompt: buildPersonalContextPrompt(personalContextRaw),
            spendingBehavior: typeof smartProfile.aiInferredAttributes?.spendingBehavior === "string" ? smartProfile.aiInferredAttributes.spendingBehavior : undefined,
            hasChildren: smartProfile.lifestyleInfo.hasChildren as boolean | null,
            responsibleForFamily: smartProfile.lifestyleInfo.responsibleForFamily as boolean | null,
            supportsOthers: smartProfile.lifestyleInfo.supportsOthers,
            fixedMonthlyCommitments: smartProfile.lifestyleInfo.fixedMonthlyCommitments,
            isSmoker: smartProfile.lifestyleInfo.smoking === true,
            hasCar: Boolean(smartProfile.lifestyleInfo.carOwnership),
            hasDebt: Boolean((smartProfile.financialInfo as any)?.hasDebt),
            knownPeople: personalContextRaw.knownPeople,
          },
          pipelineSettings: cfg,
        });
        
        if (pipeline.decision === "clarify") {
          await db
            .update(pendingClarifications)
            .set({
              originalText: enrichedText,
              question: pipeline.clarificationQuestion || "ممكن توضح أكتر؟",
              contextData: {
                items: pipeline.items,
                decision: pipeline.decision,
                confidence: pipeline.overallConfidence,
                log: pipeline.log,
              },
            })
            .where(eq(pendingClarifications.id, input.clarificationId));

          return {
            success: false,
            savedCount: 0,
            needsClarification: true,
            clarificationQuestion: pipeline.clarificationQuestion || "ممكن توضح أكتر؟",
            clarificationId: input.clarificationId,
            enrichedText,
          };
        }

        if (
          !pipeline.items ||
          pipeline.items.length === 0 ||
          pipeline.overallConfidence < 70
        ) {
          throw new Error("التوضيح لسه مش كافي لتسجيل العملية بدقة.");
        }

        if (pipeline.items && pipeline.items.length > 0) {
          for (const item of pipeline.items) {
             await db.insert(expenses).values({
               userId: userId as number,
               userType: userType as string,
               amount: item.amount.toString(),
               description: item.description || enrichedText,
               category: item.category,
               subCategory: item.subCategory,
               type: item.type,
               date: new Date(),
               source: "manual",
               rawText: enrichedText,
             });
             
             if (item.person_mentioned && item.person_relationship) {
               const pName = item.person_mentioned.trim();
               const pRel = item.person_relationship.trim();
               if (pName && pName !== "عام" && pName !== "شخص") {
                 const { addDynamicContact } = await import("./services/user-profile-service");
                 await addDynamicContact(
                   userId as number,
                   userType as string,
                   pName,
                   pRel
                 );
               }
             }
             savedCount += 1;
          }
          await invalidateExpenseCache(userId as number, userType as string);
          
          const hasExpenses = pipeline.items && pipeline.items.some((item: any) => item.type === "expense");
          if (hasExpenses) {
            checkUserBudgetExceeded(userId as number, userType as string).catch(err => {
              console.error("Budget exceeded check failed:", err);
            });
          }
        }

        await db
          .update(pendingClarifications)
          .set({ status: "resolved" })
          .where(eq(pendingClarifications.id, input.clarificationId));
      } catch (err) {
        console.error("Failed to re-run pipeline on clarification answer:", err);
        throw new Error(
          err instanceof Error
            ? err.message
            : "تعذر حفظ التوضيح. جرّب توضيح العلاقة بشكل أبسط.",
        );
      }

      return {
        success: true,
        savedCount,
        needsClarification: false,
        clarificationQuestion: undefined,
        clarificationId: undefined,
        enrichedText: undefined,
      };
    }),
});
