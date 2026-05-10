import { z } from "zod";
import { router, adminProcedure, moderatorProcedure } from "./middleware";
import { db } from "./queries/connection";
import { users, localUsers, expenses, sessions, supportTickets, userAnalytics } from "../db/schema";
import { eq, sql, desc, count, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const adminRouter = router({
  // ─── Dashboard Stats ───
  getDashboardStats: adminProcedure.query(async () => {
    const totalUsers = await db.select({ count: count() }).from(users);
    const totalLocalUsers = await db.select({ count: count() }).from(localUsers);
    const totalExpenses = await db.select({ count: count() }).from(expenses);
    const totalAmount = await db.select({ sum: sql`SUM(amount)` }).from(expenses);
    const todayExpenses = await db.select({ sum: sql`SUM(amount)` }).from(expenses)
      .where(sql`DATE(date) = CURDATE()`);
    const activeSessions = await db.select({ count: count() }).from(sessions)
      .where(gte(sessions.expiresAt, new Date()));
    const openTickets = await db.select({ count: count() }).from(supportTickets)
      .where(eq(supportTickets.status, "open"));
    const proUsers = await db.select({ count: count() }).from(users).where(eq(users.plan, "pro"));
    const proLocalUsers = await db.select({ count: count() }).from(localUsers).where(eq(localUsers.plan, "pro"));

    return {
      totalOAuthUsers: totalUsers[0]?.count ?? 0,
      totalLocalUsers: totalLocalUsers[0]?.count ?? 0,
      totalUsers: (totalUsers[0]?.count ?? 0) + (totalLocalUsers[0]?.count ?? 0),
      totalExpenses: totalExpenses[0]?.count ?? 0,
      totalAmount: totalAmount[0]?.sum ?? "0",
      todayExpenses: todayExpenses[0]?.sum ?? "0",
      activeSessions: activeSessions[0]?.count ?? 0,
      openTickets: openTickets[0]?.count ?? 0,
      proUsers: (proUsers[0]?.count ?? 0) + (proLocalUsers[0]?.count ?? 0),
    };
  }),

  // ─── List All Users ───
  listAllUsers: moderatorProcedure
    .input(z.object({
      search: z.string().optional(),
      role: z.string().optional(),
      plan: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input }) => {
      const { search, role, plan, page = 1, limit = 20 } = input ?? {};
      const offset = (page - 1) * limit;

      // OAuth users
      let oauthQuery = db.select().from(users);
      if (role) oauthQuery = oauthQuery.where(eq(users.role, role)) as any;
      if (plan) oauthQuery = oauthQuery.where(eq(users.plan, plan)) as any;
      if (search) oauthQuery = oauthQuery.where(sql`name LIKE ${`%${search}%`} OR email LIKE ${`%${search}%`}`) as any;

      const oauthUsers = await oauthQuery.limit(limit).offset(offset);
      const oauthCount = await db.select({ count: count() }).from(users);

      // Local users
      let localQuery = db.select().from(localUsers);
      if (role) localQuery = localQuery.where(eq(localUsers.role, role)) as any;
      if (plan) localQuery = localQuery.where(eq(localUsers.plan, plan)) as any;
      if (search) localQuery = localQuery.where(sql`name LIKE ${`%${search}%`} OR phone LIKE ${`%${search}%`}`) as any;

      const localUsersList = await localQuery.limit(limit).offset(offset);
      const localCount = await db.select({ count: count() }).from(localUsers);

      // Get expense counts
      const enrichedOAuth = await Promise.all(oauthUsers.map(async (u) => {
        const expCount = await db.select({ count: count() }).from(expenses)
          .where(and(eq(expenses.userId, u.id), eq(expenses.userType, "oauth")));
        const expSum = await db.select({ sum: sql`SUM(amount)` }).from(expenses)
          .where(and(eq(expenses.userId, u.id), eq(expenses.userType, "oauth")));
        return { ...u, userType: "oauth", expenseCount: expCount[0]?.count ?? 0, totalSpent: expSum[0]?.sum ?? "0" };
      }));

      const enrichedLocal = await Promise.all(localUsersList.map(async (u) => {
        const expCount = await db.select({ count: count() }).from(expenses)
          .where(and(eq(expenses.userId, u.id), eq(expenses.userType, "local")));
        const expSum = await db.select({ sum: sql`SUM(amount)` }).from(expenses)
          .where(and(eq(expenses.userId, u.id), eq(expenses.userType, "local")));
        return { ...u, userType: "local", expenseCount: expCount[0]?.count ?? 0, totalSpent: expSum[0]?.sum ?? "0" };
      }));

      return {
        users: [...enrichedOAuth, ...enrichedLocal],
        total: (oauthCount[0]?.count ?? 0) + (localCount[0]?.count ?? 0),
        page,
        limit,
      };
    }),

  // ─── Update User Role ───
  updateUserRole: adminProcedure
    .input(z.object({
      userId: z.number(),
      userType: z.enum(["oauth", "local"]),
      role: z.enum(["user", "moderator", "admin"]),
    }))
    .mutation(async ({ input }) => {
      const table = input.userType === "oauth" ? users : localUsers;
      await db.update(table).set({ role: input.role }).where(eq(table.id, input.userId));
      return { success: true, message: "تم تحديث الدور بنجاح" };
    }),

  // ─── Update User Plan ───
  updateUserPlan: adminProcedure
    .input(z.object({
      userId: z.number(),
      userType: z.enum(["oauth", "local"]),
      plan: z.enum(["free", "pro"]),
    }))
    .mutation(async ({ input }) => {
      const table = input.userType === "oauth" ? users : localUsers;
      await db.update(table).set({ plan: input.plan }).where(eq(table.id, input.userId));
      return { success: true, message: "تم تحديث الخطة بنجاح" };
    }),

  // ─── Delete User ───
  deleteUser: adminProcedure
    .input(z.object({
      userId: z.number(),
      userType: z.enum(["oauth", "local"]),
    }))
    .mutation(async ({ input }) => {
      const { userId, userType } = input;
      // Delete related data first
      await db.delete(expenses).where(and(eq(expenses.userId, userId), eq(expenses.userType, userType)));
      await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.userType, userType)));
      await db.delete(userAnalytics).where(and(eq(userAnalytics.userId, userId), eq(userAnalytics.userType, userType)));
      await db.delete(supportTickets).where(and(eq(supportTickets.userId, userId), eq(supportTickets.userType, userType)));

      const table = userType === "oauth" ? users : localUsers;
      await db.delete(table).where(eq(table.id, userId));
      return { success: true, message: "تم حذف المستخدم بنجاح" };
    }),

  // ─── Get User Sessions ───
  getUserSessions: moderatorProcedure
    .input(z.object({
      userId: z.number(),
      userType: z.enum(["oauth", "local"]),
    }))
    .query(async ({ input }) => {
      const list = await db.select().from(sessions)
        .where(and(eq(sessions.userId, input.userId), eq(sessions.userType, input.userType)))
        .orderBy(desc(sessions.createdAt));
      return list;
    }),

  // ─── Revoke Session ───
  revokeSession: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(sessions).where(eq(sessions.id, input.sessionId));
      return { success: true, message: "تم إلغاء الجلسة" };
    }),

  // ─── Get Activity Log ───
  getActivityLog: moderatorProcedure
    .input(z.object({
      userId: z.number().optional(),
      event: z.string().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const { userId, event, limit = 50 } = input ?? {};
      let query = db.select().from(userAnalytics).orderBy(desc(userAnalytics.createdAt)).limit(limit);
      if (userId) query = query.where(eq(userAnalytics.userId, userId)) as any;
      if (event) query = query.where(eq(userAnalytics.event, event)) as any;
      return await query;
    }),
});
