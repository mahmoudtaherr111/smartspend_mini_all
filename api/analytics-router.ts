import { z } from "zod";
import { router, authedProcedure, moderatorProcedure } from "./middleware";
import { getDb } from "./queries/connection";
import { userAnalytics, expenses, localUsers, users } from "../db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";

export const analyticsRouter = router({
  trackEvent: authedProcedure
    .input(
      z.object({
        event: z.string(),
        metadata: z.record(z.string(), z.any()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.insert(userAnalytics).values({
        userId: ctx.user!.id,
        userType: ctx.user!.type,
        event: input.event,
        metadata: input.metadata ?? {},
      });
      return { success: true };
    }),

  getMyAnalytics: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const result = await db
      .select()
      .from(userAnalytics)
      .where(
        and(
          eq(userAnalytics.userId, ctx.user!.id),
          eq(userAnalytics.userType, ctx.user!.type),
        ),
      )
      .orderBy(desc(userAnalytics.createdAt))
      .limit(50);
    return result;
  }),

  getAllUserStats: moderatorProcedure.query(async () => {
    const db = getDb();

    const local = await db
      .select({
        id: localUsers.id,
        name: localUsers.name,
        email: localUsers.email,
        role: localUsers.role,
        plan: localUsers.plan,
        createdAt: localUsers.createdAt,
        lastSignInAt: localUsers.lastSignInAt,
      })
      .from(localUsers);

    const oauth = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        plan: users.plan,
        createdAt: users.createdAt,
        lastSignInAt: users.lastSignInAt,
      })
      .from(users);

    const allUsers = [
      ...local.map((u) => ({ ...u, userType: "local" as const })),
      ...oauth.map((u) => ({ ...u, userType: "oauth" as const })),
    ];

    const stats = await db.select({
      userId: expenses.userId,
      userType: expenses.userType,
      expenseCount: sql`count(*)`,
      totalSpent: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'expense' THEN ${expenses.amount} ELSE 0 END), 0)`,
      totalIncome: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'income' THEN ${expenses.amount} ELSE 0 END), 0)`,
    }).from(expenses).groupBy(expenses.userId, expenses.userType);

    const statsMap = new Map();
    for (const stat of stats) {
      statsMap.set(`${stat.userType}-${stat.userId}`, {
        expenseCount: Number(stat.expenseCount),
        totalSpent: Number(stat.totalSpent),
        totalIncome: Number(stat.totalIncome),
      });
    }

    return allUsers.map((user) => {
      const userStats = statsMap.get(`${user.userType}-${user.id}`) || {
        expenseCount: 0,
        totalSpent: 0,
        totalIncome: 0,
      };

      return {
        ...user,
        expenseCount: userStats.expenseCount,
        totalSpent: userStats.totalSpent,
        totalIncome: userStats.totalIncome,
      };
    });
  }),

  getDashboardStats: moderatorProcedure.query(async () => {
    const db = getDb();

    const totalLocalUsers = await db
      .select({ count: sql`count(*)` })
      .from(localUsers);
    const totalOAuthUsers = await db
      .select({ count: sql`count(*)` })
      .from(users);
    const totalExpenses = await db
      .select({ count: sql`count(*)` })
      .from(expenses);
    const totalAmount = await db
      .select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(eq(expenses.type, "expense"));
    const totalIncome = await db
      .select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(eq(expenses.type, "income"));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayExpenses = await db
      .select({ count: sql`count(*)` })
      .from(expenses)
      .where(and(gte(expenses.createdAt, today), eq(expenses.type, "expense")));

    const adminCount = await db
      .select({ count: sql`count(*)` })
      .from(localUsers)
      .where(eq(localUsers.role, "admin"));
    const moderatorCount = await db
      .select({ count: sql`count(*)` })
      .from(localUsers)
      .where(eq(localUsers.role, "moderator"));
    const proCount = await db
      .select({ count: sql`count(*)` })
      .from(localUsers)
      .where(eq(localUsers.plan, "pro"));

    return {
      totalUsers:
        Number(totalLocalUsers[0]?.count || 0) +
        Number(totalOAuthUsers[0]?.count || 0),
      totalLocalUsers: Number(totalLocalUsers[0]?.count || 0),
      totalOAuthUsers: Number(totalOAuthUsers[0]?.count || 0),
      totalExpenses: Number(totalExpenses[0]?.count || 0),
      totalAmount: Number(totalAmount[0]?.total || 0),
      totalIncome: Number(totalIncome[0]?.total || 0),
      todayExpenses: Number(todayExpenses[0]?.count || 0),
      adminCount: Number(adminCount[0]?.count || 0),
      moderatorCount: Number(moderatorCount[0]?.count || 0),
      proCount: Number(proCount[0]?.count || 0),
    };
  }),
});
