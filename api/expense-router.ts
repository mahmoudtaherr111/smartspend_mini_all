import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { db, getDb } from "./queries/connection";
import { expenses, expenseCategories, userDictionaries, users, localUsers } from "../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { ExpenseInputLimits } from "../contracts/constants";
import { invalidateUserMemory } from "./lib/muscle-memory";

const transactionTypeSchema = z.enum(["income", "expense", "transfer", "investment"]);

const expenseRawText = z.string().min(1).max(ExpenseInputLimits.rawTextMax);
const expenseCategory = z.string().min(1).max(ExpenseInputLimits.categoryMax);
const expenseAmount = z.number().positive().max(ExpenseInputLimits.amountMax);

export const expenseRouter = router({
  create: authedProcedure
    .input(
      z.object({
        amount: expenseAmount,
        type: transactionTypeSchema.default("expense"),
        category: expenseCategory,
        subCategory: z.string().max(ExpenseInputLimits.subCategoryMax).optional(),
        description: z.string().max(ExpenseInputLimits.descriptionMax).optional(),
        rawText: expenseRawText,
        source: z.enum(["voice", "manual", "ai_parsed"]).default("manual"),
        date: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      const expenseDate = input.date ? new Date(input.date) : new Date();

      await db.insert(expenses).values({
        userId,
        userType,
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
      invalidateUserMemory(userId, userType);

      // ─── Gamification: Update Streaks ───
      try {
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (userType === "oauth") {
          const [u] = await db.select().from(users).where(eq(users.id, userId as string));
          if (u) {
            const lastDate = u.lastStreakAt ? new Date(u.lastStreakAt) : null;
            const lastStr = lastDate ? lastDate.toISOString().split("T")[0] : null;

            if (lastStr !== todayStr) {
              let newStreak = lastStr === yesterdayStr ? (u.currentStreak || 0) + 1 : 1;
              let highestStreak = Math.max(u.highestStreak || 0, newStreak);
              await db.update(users)
                .set({ currentStreak: newStreak, highestStreak, lastStreakAt: now })
                .where(eq(users.id, userId as string));
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
              await db.update(localUsers)
                .set({ currentStreak: newStreak, highestStreak, lastStreakAt: now })
                .where(eq(localUsers.id, userId as number));
            }
          }
        }
      } catch (err) {
        console.error("Streak logic error:", err);
      }

      return { success: true };
    }),

  list: authedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        category: z.string().max(ExpenseInputLimits.categoryMax).optional(),
        type: transactionTypeSchema.optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      const conditions = [eq(expenses.userId, userId), eq(expenses.userType, userType)];

      if (input?.startDate) conditions.push(gte(expenses.date, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(expenses.date, new Date(input.endDate)));
      if (input?.category) conditions.push(eq(expenses.category, input.category));
      if (input?.type) conditions.push(eq(expenses.type, input.type));

      const items = await db
        .select()
        .from(expenses)
        .where(and(...conditions))
        .orderBy(desc(expenses.date))
        .limit(input?.limit || 50)
        .offset(input?.offset || 0);

      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(expenses)
        .where(and(...conditions));

      return { items, total: countResult[0]?.count || 0 };
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
        .where(and(eq(expenses.id, input.id), eq(expenses.userId, userId), eq(expenses.userType, userType)));
      return result[0] || null;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.number(),
        amount: expenseAmount.optional(),
        type: transactionTypeSchema.optional(),
        category: expenseCategory.optional(),
        subCategory: z.string().max(ExpenseInputLimits.subCategoryMax || 100).optional(),
        description: z.string().max(ExpenseInputLimits.descriptionMax).optional(),
        rawText: expenseRawText.optional(),
        date: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      // Fetch the original expense BEFORE updating (needed for auto-learning)
      const [originalExpense] = await db.select().from(expenses)
        .where(and(eq(expenses.id, input.id), eq(expenses.userId, userId), eq(expenses.userType, userType)));

      const updateData: Record<string, any> = {};
      if (input.amount !== undefined) updateData.amount = input.amount.toString();
      if (input.type !== undefined) updateData.type = input.type;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.subCategory !== undefined) updateData.subCategory = input.subCategory;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.rawText !== undefined) updateData.rawText = input.rawText;
      if (input.date !== undefined) updateData.date = new Date(input.date);

      await db.update(expenses).set(updateData).where(and(eq(expenses.id, input.id), eq(expenses.userId, userId), eq(expenses.userType, userType)));
      
      // Phase 2: Invalidate muscle memory cache so it learns this correction
      invalidateUserMemory(userId, userType);

      // ── Strategy 6: Auto-Learning Muscle Memory ──
      // When user corrects a category, extract keywords from rawText
      // and auto-save them to user_dictionaries for instant future matching.
      const categoryChanged = input.category && originalExpense && originalExpense.category !== input.category;
      if (categoryChanged && originalExpense?.rawText) {
        try {
          const newCategory = input.category!;
          const newSubCategory = input.subCategory || originalExpense.subCategory || "عام";
          const rawText = originalExpense.rawText;

          // Arabic stop words and noise to exclude
          const STOP_WORDS = new Set([
            "في", "من", "على", "الى", "عن", "مع", "هو", "هي", "ده", "دي",
            "كان", "بتاع", "بتاعت", "اللي", "يعني", "كده", "بس", "خلاص",
            "دفعت", "صرفت", "اشتريت", "جبت", "خدت", "اديت", "حطيت",
            "جنيه", "جنية", "الف", "ألف", "ج.م",
          ]);

          // Extract meaningful keywords (>= 3 chars, not numbers, not stop words)
          const keywords = rawText
            .replace(/\d+(\.\d+)?/g, "")     // Remove numbers
            .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, "") // Keep Arabic + English only
            .split(/\s+/)
            .map((w: string) => w.trim().toLowerCase())
            .filter((w: string) => w.length >= 3 && !STOP_WORDS.has(w));

          // Deduplicate and save top 3 most meaningful keywords
          const uniqueKeywords = [...new Set(keywords)].slice(0, 3);

          for (const word of uniqueKeywords) {
            await db.insert(userDictionaries).values({
              userId,
              userType,
              word,
              category: newCategory,
              subCategory: newSubCategory,
            }).onDuplicateKeyUpdate({
              set: {
                category: newCategory,
                subCategory: newSubCategory,
              }
            }).catch(() => { /* ignore duplicate/constraint errors */ });
          }

          console.log(`🧠 Auto-learned ${uniqueKeywords.length} keywords for user ${userId}: [${uniqueKeywords.join(", ")}] → ${newCategory}/${newSubCategory}`);
        } catch (learnErr) {
          console.warn("Auto-learning failed (non-fatal):", learnErr);
        }
      }
      
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;
      await db.delete(expenses).where(and(eq(expenses.id, input.id), eq(expenses.userId, userId), eq(expenses.userType, userType)));
      return { success: true };
    }),

  getMonthSummary: authedProcedure
    .input(z.object({ 
      month: z.string().regex(/^\d{4}-\d{2}$/),
      salaryDay: z.number().min(1).max(31).optional().nullable()
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      const { getFinancialMonthDates } = await import("./services/financial-month");
      const { startDate, endDate } = getFinancialMonthDates(input.month, input.salaryDay);

      const [summary] = await db
        .select({
          totalIncome: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'income' THEN ${expenses.amount} ELSE 0 END), 0)`,
          totalExpense: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'expense' THEN ${expenses.amount} ELSE 0 END), 0)`,
          totalTransfers: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'transfer' THEN ${expenses.amount} ELSE 0 END), 0)`,
          totalInvestments: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'investment' THEN ${expenses.amount} ELSE 0 END), 0)`,
          count: sql`COUNT(*)`,
        })
        .from(expenses)
        .where(and(eq(expenses.userId, userId), eq(expenses.userType, userType), gte(expenses.date, startDate), lte(expenses.date, endDate)));

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
    }),

  getMonthlyStats: authedProcedure
    .input(z.object({ 
      month: z.string(),
      salaryDay: z.number().min(1).max(31).optional().nullable()
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      const { getFinancialMonthDates } = await import("./services/financial-month");
      const { startDate, endDate } = getFinancialMonthDates(input.month, input.salaryDay);

      // Get user's first expense ever for date-aware analytics
      const firstExpense = await db
        .select({ date: expenses.date })
        .from(expenses)
        .where(and(eq(expenses.userId, userId), eq(expenses.userType, userType)))
        .orderBy(expenses.date)
        .limit(1);

      const userStartDate = firstExpense[0]?.date ? new Date(firstExpense[0].date) : startDate;

      const items = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.userId, userId), eq(expenses.userType, userType), gte(expenses.date, startDate), lte(expenses.date, endDate)));

      // Calculate previous month's dates based on financial month logic
      const prevMonthDate = new Date(input.month + "-01");
      prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
      const prevMonthStr = prevMonthDate.toISOString().slice(0, 7);
      const prevMonthDates = getFinancialMonthDates(prevMonthStr, input.salaryDay);
      const prevStartDate = prevMonthDates.startDate;
      const prevEndDate = prevMonthDates.endDate;

      const previousItems = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.userId, userId), eq(expenses.userType, userType), gte(expenses.date, prevStartDate), lte(expenses.date, prevEndDate)));

      const totalExpense = items.filter(i => i.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
      const totalIncome = items.filter(i => i.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
      
      const automatedExpense = items.filter(i => i.type === "expense" && i.source === "sms").reduce((sum, item) => sum + Number(item.amount), 0);
      const automatedIncome = items.filter(i => i.type === "income" && i.source === "sms").reduce((sum, item) => sum + Number(item.amount), 0);

      const previousTotalExpense = previousItems.filter(i => i.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
      const previousTotalIncome = previousItems.filter(i => i.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);

      // Day map (expenses only)
      // Day map, Week map, Hour map, Day of week map
      const dayMap: Record<string, number> = {};
      const weekMap: Record<string, number> = {};
      const hourMap: Record<number, number> = {};
      const dayOfWeekMap: Record<string, number> = {};
      
      const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

      items.filter(i => i.type === "expense").forEach((item) => {
        const date = new Date(item.date);
        
        // Day Map
        const dayStr = date.toISOString().split("T")[0];
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
      const subCategoryMap: Record<string, { value: number; count: number }> = {};
      
      items.filter(i => i.type === "expense").forEach((item) => {
        const amt = Number(item.amount);
        if (!categoryMap[item.category]) categoryMap[item.category] = { value: 0, count: 0 };
        categoryMap[item.category].value += amt;
        categoryMap[item.category].count += 1;

        if (item.subCategory && item.subCategory !== "عام") {
          if (!subCategoryMap[item.subCategory]) subCategoryMap[item.subCategory] = { value: 0, count: 0 };
          subCategoryMap[item.subCategory].value += amt;
          subCategoryMap[item.subCategory].count += 1;
        }
      });

      const categoryBreakdown = Object.entries(categoryMap).map(([name, data]) => ({
        name,
        value: data.value,
        count: data.count,
        avg: data.count > 0 ? Math.round(data.value / data.count) : 0,
        percentage: totalExpense > 0 ? Math.round((data.value / totalExpense) * 100) : 0,
      }));

      const subCategoryBreakdown = Object.entries(subCategoryMap).map(([name, data]) => ({
        name,
        value: data.value,
        count: data.count,
        avg: data.count > 0 ? Math.round(data.value / data.count) : 0,
        percentage: totalExpense > 0 ? Math.round((data.value / totalExpense) * 100) : 0,
      })).sort((a, b) => b.value - a.value);

      const sortedCategories = [...categoryBreakdown].sort((a, b) => b.value - a.value);
      const hierarchicalBreakdown = sortedCategories.map((main) => ({
        name: main.name,
        value: main.value,
        count: main.count,
        children: subCategoryBreakdown.filter((s) => items.some((it) => it.category === main.name && it.subCategory === s.name)),
      }));

      const recurringHints = subCategoryBreakdown
        .filter((s) => s.count >= 2 && ["اشتراك", "باقات", "قسط", "إنترنت", "كهرباء"].some((k) => s.name.includes(k)))
        .slice(0, 8);

      // Day trend (Income vs Expense)
      const cashFlowMap: Record<string, { expense: number; income: number }> = {};
      items.forEach((item) => {
        const dateStr = new Date(item.date).toISOString().split("T")[0];
        if (!cashFlowMap[dateStr]) cashFlowMap[dateStr] = { expense: 0, income: 0 };
        if (item.type === "expense") cashFlowMap[dateStr].expense += Number(item.amount);
        if (item.type === "income") cashFlowMap[dateStr].income += Number(item.amount);
      });

      const dayTrend = Object.entries(cashFlowMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date: date.slice(5), amount: data.expense, income: data.income }));

      // Date-aware daily average: from user's first expense date to today (or month end)
      const today = new Date();
      const endOfMonth = endDate > today ? today : endDate;
      const activeDays = Math.max(1, Math.ceil((endOfMonth.getTime() - userStartDate.getTime()) / (1000 * 60 * 60 * 24)));
      const dailyAverage = totalExpense / Math.min(activeDays, 30);
      const previousNetFlow = previousTotalIncome - previousTotalExpense;
      const expenseChangePercent = previousTotalExpense > 0
        ? Math.round(((totalExpense - previousTotalExpense) / previousTotalExpense) * 100)
        : null;
      const incomeChangePercent = previousTotalIncome > 0
        ? Math.round(((totalIncome - previousTotalIncome) / previousTotalIncome) * 100)
        : null;
      const previousCategoryMap: Record<string, number> = {};
      const previousSubCategoryMap: Record<string, number> = {};
      previousItems.filter(i => i.type === "expense").forEach((item) => {
        previousCategoryMap[item.category] = (previousCategoryMap[item.category] || 0) + Number(item.amount);
        if (item.subCategory) previousSubCategoryMap[item.subCategory] = (previousSubCategoryMap[item.subCategory] || 0) + Number(item.amount);
      });
      const categoryChanges = sortedCategories.map((cat) => {
        const previous = previousCategoryMap[cat.name] || 0;
        return {
          name: cat.name,
          current: cat.value,
          previous,
          changePercent: previous > 0 ? Math.round(((cat.value - previous) / previous) * 100) : null,
        };
      });
      const subCategoryChanges = subCategoryBreakdown.map((sub) => {
        const previous = previousSubCategoryMap[sub.name] || 0;
        return {
          name: sub.name,
          current: sub.value,
          previous,
          changePercent: previous > 0 ? Math.round(((sub.value - previous) / previous) * 100) : null,
        };
      });
      const mostRecurringExpense = subCategoryBreakdown.slice().sort((a, b) => b.count - a.count)[0] || null;

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
        highestDay: highestDay ? { date: highestDay[0], amount: highestDay[1] } : null,
        weekBreakdown: Object.entries(weekMap).map(([name, amount]) => ({ name, amount })),
        dayTrend,
        hourTrend: Object.entries(hourMap).map(([hour, amount]) => ({ hour: parseInt(hour), amount })).sort((a, b) => a.hour - b.hour),
        dayOfWeekTrend: Object.entries(dayOfWeekMap).map(([name, amount]) => ({ name, amount })),
        hierarchicalBreakdown,
        recurringBreakdown: recurringHints,
        behavioralInsights: {
          topSpendingDay: highestDay ? { date: highestDay[0], amount: highestDay[1] } : null,
          mostRecurringExpense,
          expenseChangePercent,
          incomeChangePercent,
          spendingIncreased: expenseChangePercent === null ? null : expenseChangePercent > 0,
        },
        comparativeAnalysis: {
          previousMonth: {
            totalIncome: previousTotalIncome,
            totalExpense: previousTotalExpense,
            netFlow: previousNetFlow,
          },
          categoryChanges,
          subCategoryChanges,
          trend: expenseChangePercent === null ? "new" : expenseChangePercent > 0 ? "up" : expenseChangePercent < 0 ? "down" : "flat",
        },
        items,
      };
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
        .where(and(eq(expenses.userId, userId), eq(expenses.userType, userType), gte(expenses.date, startDate), lte(expenses.date, endDate)));

      const totalExpense = items.filter(i => i.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
      const totalIncome = items.filter(i => i.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);

      const monthMap: Record<string, number> = {};
      for (let i = 1; i <= 12; i++) {
        monthMap[`${input.year}-${String(i).padStart(2, "0")}`] = 0;
      }
      items.filter(i => i.type === "expense").forEach((item) => {
        const month = new Date(item.date).toISOString().slice(0, 7);
        monthMap[month] = (monthMap[month] || 0) + Number(item.amount);
      });

      const monthNames = ["يناير", "فبراير", "مارس", "إبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
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
    .input(z.object({ name: z.string().min(1), icon: z.string().default("receipt"), color: z.string().default("#3b82f6") }))
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
});
