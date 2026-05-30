import { z } from "zod";
import {
  router,
  publicProcedure,
  strictPublicProcedure,
  adminProcedure,
} from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import {
  localUsers,
  expenses,
  sessions,
  userAnalytics,
  supportTickets,
  userWallets,
  proSubscriptions,
  monthlyReports,
  aiSummaries,
  userProfiles,
  profileLearningEvents,
  monthlyBehaviorSnapshots,
  userDictionaries,
  classificationLogs,
  voiceUsage,
  webhookTokens,
  rawSmsEvents,
  expenseCategories,
} from "../db/schema";
import { eq, count, sum, sql, like, desc, and } from "drizzle-orm";
import {
  hashPassword,
  comparePassword,
  generateToken,
  createSession,
  validatePhone,
  generateReferralCode,
} from "./local-auth-utils";
import { getIncomingHeader } from "./lib/get-client-ip";

export const localAuthRouter = router({
  register: strictPublicProcedure
    .input(
      z.object({
        name: z.string().min(2, "الاسم لازم يكون حرفين على الأقل").max(100),
        phone: z.string().min(11, "رقم التليفون لازم يكون 11 رقم").max(11),
        email: z.string().email("الإيميل مش صحيح").optional().or(z.literal("")),
        password: z.string().min(6, "الباسورد لازم يكون 6 أحرف على الأقل"),
        referralCode: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Validate phone
      const phoneValidation = validatePhone(input.phone);
      if (!phoneValidation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: phoneValidation.message,
        });
      }

      // Check if phone exists
      const existing = await db.query.localUsers.findFirst({
        where: eq(localUsers.phone, input.phone),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "رقم التليفون مسجل بالفعل",
        });
      }

      const hashedPassword = await hashPassword(input.password);
      const referral = generateReferralCode();

      let referredBy: number | null = null;
      if (input.referralCode) {
        const referrer = await db.query.localUsers.findFirst({
          where: eq(localUsers.referralCode, input.referralCode),
        });
        if (referrer) referredBy = referrer.id;
      }

      const [newUser] = await db
        .insert(localUsers)
        .values({
          name: input.name,
          phone: input.phone,
          email: input.email || null,
          password: hashedPassword,
          referralCode: referral,
          referredBy: referredBy,
        })
        .$returningId();

      const token = await generateToken(newUser.id, "local");
      await createSession(newUser.id, "local", token);

      return {
        success: true,
        token,
        user: {
          id: newUser.id,
          name: input.name,
          phone: input.phone,
          role: "user",
          plan: "free",
        },
      };
    }),

  login: strictPublicProcedure
    .input(
      z.object({
        phone: z.string(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const user = await db.query.localUsers.findFirst({
        where: eq(localUsers.phone, input.phone),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "رقم التليفون أو الباسورد غلط",
        });
      }

      const valid = await comparePassword(input.password, user.password);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "رقم التليفون أو الباسورد غلط",
        });
      }

      // Update last sign in
      await db
        .update(localUsers)
        .set({ lastSignInAt: new Date() })
        .where(eq(localUsers.id, user.id));

      const token = await generateToken(user.id, "local");
      await createSession(user.id, "local", token);

      return {
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          plan: user.plan,
        },
      };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.type !== "local") return null;

    const user = await db.query.localUsers.findFirst({
      where: eq(localUsers.id, ctx.user.id),
      columns: { password: false },
    });

    return user;
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const authHeader = getIncomingHeader(ctx.req, "Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      await db.delete(sessions).where(eq(sessions.token, token));
    }
    return { success: true };
  }),

  // Admin endpoints
  listUsers: adminProcedure.query(async () => {
    const allUsers = await db.query.localUsers.findMany({
      columns: { password: false },
      orderBy: desc(localUsers.createdAt),
    });

    const stats = await db.select({
      userId: expenses.userId,
      expenseCount: sql`count(*)`,
      totalSpent: sql`COALESCE(SUM(${expenses.amount}), 0)`,
    }).from(expenses).where(eq(expenses.userType, 'local')).groupBy(expenses.userId);

    const statsMap = new Map();
    for (const stat of stats) {
      statsMap.set(stat.userId, {
        expenseCount: Number(stat.expenseCount),
        totalSpent: Number(stat.totalSpent),
      });
    }

    return allUsers.map((user) => {
      const userStats = statsMap.get(user.id) || { expenseCount: 0, totalSpent: 0 };
      return {
        ...user,
        expenseCount: userStats.expenseCount,
        totalSpent: userStats.totalSpent,
      };
    });
  }),

  getStats: adminProcedure.query(async () => {
    const totalUsers = await db.select({ count: count() }).from(localUsers);
    const totalExpenses = await db.select({ count: count() }).from(expenses);
    const totalAmount = await db
      .select({ total: sum(expenses.amount) })
      .from(expenses);
    const todayExpenses = await db
      .select({ total: sum(expenses.amount) })
      .from(expenses)
      .where(sql`DATE(date) = CURDATE()`);
    const adminCount = await db
      .select({ count: count() })
      .from(localUsers)
      .where(eq(localUsers.role, "admin"));

    return {
      totalUsers: totalUsers[0]?.count || 0,
      totalExpenses: totalExpenses[0]?.count || 0,
      totalAmount: Number(totalAmount[0]?.total) || 0,
      todayExpenses: Number(todayExpenses[0]?.total) || 0,
      adminCount: adminCount[0]?.count || 0,
    };
  }),

  deleteUser: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const userId = input.id;
      const userType = "local" as const;

      await db
        .delete(expenses)
        .where(
          and(eq(expenses.userId, userId), eq(expenses.userType, userType)),
        );
      await db
        .delete(sessions)
        .where(
          and(eq(sessions.userId, userId), eq(sessions.userType, userType)),
        );
      await db
        .delete(userAnalytics)
        .where(
          and(
            eq(userAnalytics.userId, userId),
            eq(userAnalytics.userType, userType),
          ),
        );
      await db
        .delete(supportTickets)
        .where(
          and(
            eq(supportTickets.userId, userId),
            eq(supportTickets.userType, userType),
          ),
        );
      await db
        .delete(userWallets)
        .where(
          and(
            eq(userWallets.userId, userId),
            eq(userWallets.userType, userType),
          ),
        );
      await db
        .delete(proSubscriptions)
        .where(
          and(
            eq(proSubscriptions.userId, userId),
            eq(proSubscriptions.userType, userType),
          ),
        );
      await db
        .delete(monthlyReports)
        .where(
          and(
            eq(monthlyReports.userId, userId),
            eq(monthlyReports.userType, userType),
          ),
        );
      await db
        .delete(aiSummaries)
        .where(
          and(
            eq(aiSummaries.userId, userId),
            eq(aiSummaries.userType, userType),
          ),
        );
      await db
        .delete(userProfiles)
        .where(
          and(
            eq(userProfiles.userId, userId),
            eq(userProfiles.userType, userType),
          ),
        );
      await db
        .delete(profileLearningEvents)
        .where(
          and(
            eq(profileLearningEvents.userId, userId),
            eq(profileLearningEvents.userType, userType),
          ),
        );
      await db
        .delete(monthlyBehaviorSnapshots)
        .where(
          and(
            eq(monthlyBehaviorSnapshots.userId, userId),
            eq(monthlyBehaviorSnapshots.userType, userType),
          ),
        );
      await db
        .delete(userDictionaries)
        .where(
          and(
            eq(userDictionaries.userId, userId),
            eq(userDictionaries.userType, userType),
          ),
        );
      await db
        .delete(classificationLogs)
        .where(
          and(
            eq(classificationLogs.userId, userId),
            eq(classificationLogs.userType, userType),
          ),
        );
      await db
        .delete(voiceUsage)
        .where(
          and(eq(voiceUsage.userId, userId), eq(voiceUsage.userType, userType)),
        );
      await db
        .delete(webhookTokens)
        .where(
          and(
            eq(webhookTokens.userId, userId),
            eq(webhookTokens.userType, userType),
          ),
        );
      await db
        .delete(rawSmsEvents)
        .where(
          and(
            eq(rawSmsEvents.userId, userId),
            eq(rawSmsEvents.userType, userType),
          ),
        );
      await db
        .delete(expenseCategories)
        .where(
          and(
            eq(expenseCategories.userId, userId),
            eq(expenseCategories.userType, userType),
          ),
        );

      await db.delete(localUsers).where(eq(localUsers.id, userId));
      return { success: true };
    }),

  updateRole: adminProcedure
    .input(
      z.object({
        id: z.number(),
        role: z.enum(["user", "moderator", "admin"]),
      }),
    )
    .mutation(async ({ input }) => {
      await db
        .update(localUsers)
        .set({ role: input.role })
        .where(eq(localUsers.id, input.id));
      return { success: true };
    }),
});
