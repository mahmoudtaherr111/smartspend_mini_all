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

      const conditions = [eq(expenses.userId, userId)];

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
      const result = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, input.id), eq(expenses.userId, userId)));
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

      const updateData: Record<string, any> = {};
      if (input.amount !== undefined) updateData.amount = input.amount.toString();
      if (input.type !== undefined) updateData.type = input.type;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.rawText !== undefined) updateData.rawText = input.rawText;
      if (input.date !== undefined) updateData.date = new Date(input.date);

      await db.update(expenses).set(updateData).where(and(eq(expenses.id, input.id), eq(expenses.userId, userId)));
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;
      await db.delete(expenses).where(and(eq(expenses.id, input.id), eq(expenses.userId, userId)));
      return { success: true };
    }),

  getMonthlyStats: authedProcedure
    .input(z.object({ month: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;

      const startDate = new Date(input.month + "-01");
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      // Get user's first expense ever for date-aware analytics
      const firstExpense = await db
        .select({ date: expenses.date })
        .from(expenses)
        .where(eq(expenses.userId, userId))
        .orderBy(expenses.date)
        .limit(1);

      const userStartDate = firstExpense[0]?.date ? new Date(firstExpense[0].date) : startDate;

      const items = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.userId, userId), gte(expenses.date, startDate), lte(expenses.date, endDate)));

      const totalExpense = items.filter(i => i.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
      const totalIncome = items.filter(i => i.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);

      // Day map (expenses only)
      const dayMap: Record<string, number> = {};
      items.filter(i => i.type === "expense").forEach((item) => {
        const day = new Date(item.date).toISOString().split("T")[0];
        dayMap[day] = (dayMap[day] || 0) + Number(item.amount);
      });

      const highestDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];

      // Week map
      const weekMap: Record<string, number> = {};
      items.filter(i => i.type === "expense").forEach((item) => {
        const date = new Date(item.date);
        const weekNum = Math.ceil(date.getDate() / 7);
        const key = `الأسبوع ${weekNum}`;
        weekMap[key] = (weekMap[key] || 0) + Number(item.amount);
      });

      // Category map (expenses only)
      const categoryMap: Record<string, number> = {};
      items.filter(i => i.type === "expense").forEach((item) => {
        categoryMap[item.category] = (categoryMap[item.category] || 0) + Number(item.amount);
      });

      const categoryBreakdown = Object.entries(categoryMap).map(([name, value]) => ({
        name,
        value,
        percentage: totalExpense > 0 ? Math.round((value / totalExpense) * 100) : 0,
      }));

      const sortedCategories = [...categoryBreakdown].sort((a, b) => b.value - a.value);

      // Day trend
      const dayTrend = Object.entries(dayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date: date.slice(5), amount }));

      // Date-aware daily average: from user's first expense date to today (or month end)
      const today = new Date();
      const endOfMonth = endDate > today ? today : endDate;
      const activeDays = Math.max(1, Math.ceil((endOfMonth.getTime() - userStartDate.getTime()) / (1000 * 60 * 60 * 24)));
      const dailyAverage = totalExpense / Math.min(activeDays, 30);

      return {
        totalExpense,
        totalIncome,
        netFlow: totalIncome - totalExpense,
        count: items.length,
        dailyAverage,
        categoryBreakdown: sortedCategories,
        topCategories: sortedCategories.slice(0, 5),
        highestDay: highestDay ? { date: highestDay[0], amount: highestDay[1] } : null,
        weekBreakdown: Object.entries(weekMap).map(([name, amount]) => ({ name, amount })),
        dayTrend,
        items,
      };
    }),

  getYearlyStats: authedProcedure
    .input(z.object({ year: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user!.id;

      const startDate = new Date(input.year + "-01-01");
      const endDate = new Date(input.year + "-12-31");

      const items = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.userId, userId), gte(expenses.date, startDate), lte(expenses.date, endDate)));

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
        name: input.name,
        icon: input.icon,
        color: input.color,
        isDefault: "false",
      });
      return { success: true };
    }),
});
