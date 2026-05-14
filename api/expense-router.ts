import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { db, getDb } from "./queries/connection";
import { expenses, expenseCategories } from "../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

export const expenseRouter = router({
  create: authedProcedure
    .input(
      z.object({
        amount: z.number().positive(),
        type: z.enum(["income", "expense"]).default("expense"),
        category: z.string().min(1),
        subCategory: z.string().optional(),
        description: z.string().optional(),
        rawText: z.string().min(1),
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

      return { success: true };
    }),

  list: authedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(["income", "expense"]).optional(),
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
        amount: z.number().positive().optional(),
        type: z.enum(["income", "expense"]).optional(),
        category: z.string().optional(),
        description: z.string().optional(),
        rawText: z.string().optional(),
        date: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      const updateData: Record<string, any> = {};
      if (input.amount !== undefined) updateData.amount = input.amount.toString();
      if (input.type !== undefined) updateData.type = input.type;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.rawText !== undefined) updateData.rawText = input.rawText;
      if (input.date !== undefined) updateData.date = new Date(input.date);

      await db.update(expenses).set(updateData).where(and(eq(expenses.id, input.id), eq(expenses.userId, userId), eq(expenses.userType, userType)));
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

  getMonthlyStats: authedProcedure
    .input(z.object({ month: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      const userType = ctx.user!.type;

      const startDate = new Date(input.month + "-01");
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

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

      const prevStartDate = new Date(startDate);
      prevStartDate.setMonth(prevStartDate.getMonth() - 1);
      const prevEndDate = new Date(startDate);
      const previousItems = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.userId, userId), eq(expenses.userType, userType), gte(expenses.date, prevStartDate), lte(expenses.date, prevEndDate)));

      const totalExpense = items.filter(i => i.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
      const totalIncome = items.filter(i => i.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
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
