import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "./middleware";
import { getDb } from "./queries/connection";
import { userAnalytics, expenses, localUsers, users } from "../db/schema";
import { eq, and, gte, sql, desc, or, inArray } from "drizzle-orm";
import { businessDayRange } from "./lib/app-time";

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

  getAllUserStats: adminProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
    const db = getDb();
    const limit = input?.limit ?? 50;
    const offset = input?.offset ?? 0;

    const [localCountResult] = await db.select({ count: sql`count(*)` }).from(localUsers);
    const [oauthCountResult] = await db.select({ count: sql`count(*)` }).from(users);
    const totalUsers = Number(localCountResult.count) + Number(oauthCountResult.count);

    const localCount = Number(localCountResult?.count || 0);
    let local: any[] = [];
    let oauth: any[] = [];

    if (offset < localCount) {
      local = await db
        .select({
          id: localUsers.id,
          name: localUsers.name,
          email: localUsers.email,
          role: localUsers.role,
          plan: localUsers.plan,
          createdAt: localUsers.createdAt,
          lastSignInAt: localUsers.lastSignInAt,
        })
        .from(localUsers)
        .limit(limit)
        .offset(offset);

      const remainingLimit = limit - local.length;
      if (remainingLimit > 0) {
        oauth = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            plan: users.plan,
            createdAt: users.createdAt,
            lastSignInAt: users.lastSignInAt,
          })
          .from(users)
          .limit(remainingLimit)
          .offset(0);
      }
    } else {
      const oauthOffset = offset - localCount;
      oauth = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          plan: users.plan,
          createdAt: users.createdAt,
          lastSignInAt: users.lastSignInAt,
        })
        .from(users)
        .limit(limit)
        .offset(oauthOffset);
    }

    const allUsers = [
      ...local.map((u) => ({ ...u, userType: "local" as const })),
      ...oauth.map((u) => ({ ...u, userType: "oauth" as const })),
    ];

    const stats = allUsers.length > 0 
      ? await db.select({
          userId: expenses.userId,
          userType: expenses.userType,
          expenseCount: sql`count(*)`,
          totalSpent: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'expense' THEN ${expenses.amount} ELSE 0 END), 0)`,
          totalIncome: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'income' THEN ${expenses.amount} ELSE 0 END), 0)`,
        }).from(expenses)
        .where(
          or(
            ...allUsers.map(u => and(eq(expenses.userId, u.id), eq(expenses.userType, u.userType)))
          )
        )
        .groupBy(expenses.userId, expenses.userType)
      : [];

    const statsMap = new Map();
    for (const stat of stats) {
      statsMap.set(`${stat.userType}-${stat.userId}`, {
        expenseCount: Number(stat.expenseCount),
        totalSpent: Number(stat.totalSpent),
        totalIncome: Number(stat.totalIncome),
      });
    }

    return {
      total: totalUsers,
      users: allUsers.map((user) => {
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
      })
    };
  }),

  getDashboardStats: adminProcedure.query(async () => {
    const db = getDb();

    const today = businessDayRange().start;

    const [
      totalLocalUsers,
      totalOAuthUsers,
      totalExpenses,
      totalAmount,
      totalIncome,
      todayExpenses,
      adminCount,
      moderatorCount,
      proCount,
      oauthAdminCount,
      oauthModeratorCount,
      oauthProCount,
    ] = await Promise.all([
      db.select({ count: sql`count(*)` }).from(localUsers),
      db.select({ count: sql`count(*)` }).from(users),
      db.select({ count: sql`count(*)` }).from(expenses),
      db.select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(eq(expenses.type, "expense")),
      db.select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(eq(expenses.type, "income")),
      db.select({ count: sql`count(*)` }).from(expenses).where(and(gte(expenses.createdAt, today), eq(expenses.type, "expense"))),
      db.select({ count: sql`count(*)` }).from(localUsers).where(eq(localUsers.role, "admin")),
      db.select({ count: sql`count(*)` }).from(localUsers).where(eq(localUsers.role, "moderator")),
      db.select({ count: sql`count(*)` }).from(localUsers).where(inArray(localUsers.plan, ["pro", "ultra"])),
      db.select({ count: sql`count(*)` }).from(users).where(eq(users.role, "admin")),
      db.select({ count: sql`count(*)` }).from(users).where(eq(users.role, "moderator")),
      db.select({ count: sql`count(*)` }).from(users).where(inArray(users.plan, ["pro", "ultra"])),
    ]);

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
      adminCount: Number(adminCount[0]?.count || 0) + Number(oauthAdminCount[0]?.count || 0),
      moderatorCount: Number(moderatorCount[0]?.count || 0) + Number(oauthModeratorCount[0]?.count || 0),
      proCount: Number(proCount[0]?.count || 0) + Number(oauthProCount[0]?.count || 0),
    };
  }),
});
