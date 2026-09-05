import { randomInt, randomUUID } from "crypto";
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
  whatsappOtpCodes,
  financialGoals,
  userBudgets,
  userBusinesses,
  userContacts,
  adClicks,
} from "../db/schema";
import { eq, count, sum, sql, like, desc, and } from "drizzle-orm";
import {
  hashPassword,
  comparePassword,
  generateToken,
  createSession,
  validatePhone,
  generateReferralCode,
  cleanPhoneNumber,
  getSessionMetadata,
} from "./local-auth-utils";
import { getIncomingHeader } from "./lib/get-client-ip";
import { whatsappService } from "./services/whatsapp-service";
import { otpCache, checkRateLimit } from "./services/otp-cache";

import { getSystemSettings } from "./lib/settings-cache";
import { purgeUserData } from "./services/user-purge-service";
import {
  beginLoginAttempt,
  completeSuccessfulLogin,
  loginRateLimitError,
  recordLoginFailure,
  releaseLoginAttempt,
  setLoginRateLimitHeaders,
} from "./lib/login-protection";

// A fixed cost-12 hash keeps nonexistent-account failures on the same bcrypt
// path as incorrect passwords without deriving a hash during each request.
const INVALID_ACCOUNT_PASSWORD_HASH =
  "$2b$12$0cGyfKa.Hcq3FAwq/CUhju/iICgm1cM2vbhjNwwRs.yfpJyoek6ya";
const INVALID_LOGIN_MESSAGE = "رقم التليفون أو الباسورد غلط";

function loginRequestId(req: Parameters<typeof getIncomingHeader>[0]): string {
  const incoming = getIncomingHeader(req, "x-request-id")?.trim();
  return incoming && /^[a-zA-Z0-9._:-]{1,128}$/.test(incoming)
    ? incoming
    : randomUUID();
}

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
    .mutation(async ({ input, ctx }) => {
      const phoneValidation = validatePhone(input.phone);
      if (!phoneValidation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: phoneValidation.message,
        });
      }

      const cleanPhone = cleanPhoneNumber(input.phone);

      // Check if phone already exists in local users
      const existingUser = await db.query.localUsers.findFirst({
        where: eq(localUsers.phone, cleanPhone),
      });
      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "رقم التليفون مسجل بالفعل",
        });
      }

      // Check if OTP verification is globally enabled
      const settings = await getSystemSettings();
      const otpEnabled = settings["whatsapp_otp_enabled"];

      if (otpEnabled === "true") {
        // Check if phone is verified in our in-memory cache
        const verificationRecord = otpCache.get(cleanPhone);

        if (!verificationRecord || !verificationRecord.verified) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "برجاء توثيق رقم التليفون عبر واتساب أولاً",
          });
        }

        // Check expiration
        if (verificationRecord.expiresAt < Date.now()) {
          otpCache.delete(cleanPhone);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "انتهت صلاحية توثيق الرقم، برجاء المحاولة مرة أخرى",
          });
        }

        // Clean up the verification code from cache
        otpCache.delete(cleanPhone);
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
          phone: cleanPhone,
          email: input.email || null,
          password: hashedPassword,

          referralCode: referral,
          referredBy: referredBy,
          referredByType: referredBy ? "local" : null,
        })
        .$returningId();

      const token = await generateToken(newUser.id, "local");
      await createSession(
        newUser.id,
        "local",
        token,
        getSessionMetadata(ctx.req, ctx.ip),
      );

      return {
        success: true,
        token,
        user: {
          id: newUser.id,
          name: input.name,
          phone: cleanPhone,
          role: "user",
          plan: "free",
        },
      };
    }),

  generateVerificationCode: strictPublicProcedure
    .input(z.object({ phone: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const settings = await getSystemSettings();
      if (settings["whatsapp_otp_enabled"] !== "true") {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "توثيق واتساب متوقف مؤقتاً. استخدم التسجيل العادي حالياً.",
        });
      }

      const phoneValidation = validatePhone(input.phone);
      if (!phoneValidation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: phoneValidation.message,
        });
      }

      const cleanPhone = cleanPhoneNumber(input.phone);

      // Check In-Memory Rate Limiting
      const rateLimit = checkRateLimit(ctx.ip, cleanPhone);
      if (!rateLimit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: rateLimit.message,
        });
      }

      const code = "SS-" + randomInt(100000, 1000000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now

      // Store in memory cache (0 database writes!)
      otpCache.set(cleanPhone, {
        phone: cleanPhone,
        code,
        expiresAt,
        verified: false,
      });

      return { success: true };
    }),

  getVerificationSettings: publicProcedure.query(async () => {
    const settings = await getSystemSettings();
    return { enabled: settings["whatsapp_otp_enabled"] === "true" };
  }),

  checkVerificationStatus: strictPublicProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const cleanPhone = cleanPhoneNumber(input.phone);
      const record = otpCache.get(cleanPhone);

      if (!record) return { verified: false };

      // Check expiration
      if (record.expiresAt < Date.now()) {
        otpCache.delete(cleanPhone);
        return { verified: false, expired: true };
      }

      return { verified: record.verified };
    }),

  getBotPhoneNumber: publicProcedure.query(() => {
    const status = whatsappService.getStatus();
    return status.phoneNumber || "201000000000"; // Fallback if not connected yet
  }),

  login: publicProcedure
    .input(
      z.object({
        phone: z.string().min(1).max(64),
        password: z.string().min(1).max(1_024),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const cleanPhone = cleanPhoneNumber(input.phone);
      const attempt = await beginLoginAttempt({
        ip: ctx.ip,
        accountIdentifier: cleanPhone,
        requestId: loginRequestId(ctx.req),
        userAgent: getIncomingHeader(ctx.req, "user-agent")?.slice(0, 512),
      });
      setLoginRateLimitHeaders(ctx.resHeaders, attempt);

      if (!attempt.allowed) {
        throw loginRateLimitError(attempt.retryAfterMs);
      }

      let protectionFinalized = false;
      try {
        const user = await db.query.localUsers.findFirst({
          where: eq(localUsers.phone, cleanPhone),
        });

        // Always execute one cost-equivalent comparison to prevent timing-based
        // account enumeration. The response code and message are identical too.
        const valid = await comparePassword(
          input.password,
          user?.password || INVALID_ACCOUNT_PASSWORD_HASH,
        );
        if (!user || !valid) {
          const failureState = await recordLoginFailure(attempt);
          protectionFinalized = true;
          setLoginRateLimitHeaders(ctx.resHeaders, failureState);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: INVALID_LOGIN_MESSAGE,
          });
        }

        await completeSuccessfulLogin(attempt);
        protectionFinalized = true;
        setLoginRateLimitHeaders(ctx.resHeaders, {
          limit: attempt.limit,
          remaining: attempt.limit,
          retryAfterMs: 0,
        });

        // Update last sign in only after the credential has been verified.
        await db
          .update(localUsers)
          .set({ lastSignInAt: new Date() })
          .where(eq(localUsers.id, user.id));

        const token = await generateToken(user.id, "local");
        await createSession(
          user.id,
          "local",
          token,
          getSessionMetadata(ctx.req, ctx.ip),
        );

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
      } catch (error) {
        if (!protectionFinalized) await releaseLoginAttempt(attempt);
        throw error;
      }
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
    // Clear Google OAuth cookie on server side to avoid stale session shadow
    if (ctx.resHeaders) {
      ctx.resHeaders.append(
        "Set-Cookie",
        "google_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
      );
    }

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

    const stats = await db
      .select({
        userId: expenses.userId,
        expenseCount: sql`count(*)`,
        totalSpent: sql`COALESCE(SUM(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(eq(expenses.userType, "local"))
      .groupBy(expenses.userId);

    const statsMap = new Map();
    for (const stat of stats) {
      statsMap.set(stat.userId, {
        expenseCount: Number(stat.expenseCount),
        totalSpent: Number(stat.totalSpent),
      });
    }

    return allUsers.map((user) => {
      const userStats = statsMap.get(user.id) || {
        expenseCount: 0,
        totalSpent: 0,
      };
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

      await db.transaction(async (tx) => {
        await purgeUserData(tx, userId, userType);
      });

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
