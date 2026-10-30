import { randomUUID } from "crypto";
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
  expenseCategories,
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
  sessionCookie,
  invalidateSession,
} from "./local-auth-utils";
import { getIncomingHeader } from "./lib/get-client-ip";
import {
  PHONE_CHALLENGE_TTL_MS,
  confirmPhoneChallenge,
  consumePhoneChallenge,
  readPhoneChallenge,
  startPhoneChallenge,
  type PhoneChallenge,
} from "./services/phone-challenge";
import { WhatsAppApiError, whatsAppConfig } from "./lib/whatsapp/client";
import { sendMessageNow } from "./lib/whatsapp/outbox";
import { verificationMessage } from "./lib/whatsapp/templates";
import { guardOtpGeneration } from "./services/turnstile-service";
import { createRateLimiter } from "./lib/rate-limit";

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
import { invalidatePrincipal, setRole } from "./lib/access-control";

// A fixed cost-12 hash keeps nonexistent-account failures on the same bcrypt
// path as incorrect passwords without deriving a hash during each request.
const INVALID_ACCOUNT_PASSWORD_HASH =
  "$2b$12$0cGyfKa.Hcq3FAwq/CUhju/iICgm1cM2vbhjNwwRs.yfpJyoek6ya";
const INVALID_LOGIN_MESSAGE = "رقم التليفون أو الباسورد غلط";
const NOT_VERIFIED_MESSAGE = "برجاء توثيق رقم التليفون عبر واتساب أولاً";

// Counted in Redis across replicas, with each process's own count as a floor. They used to live in one
// process's memory, so every replica handed out its own five codes per address.
const codeRequestsPerIp = createRateLimiter(5, 10 * 60 * 1000);
const codeRequestsPerPhone = createRateLimiter(1, 60 * 1000);

/** The challenge a ticket names, when it is open and the right code was typed for it. */
async function verifiedChallenge(ticket: string | undefined): Promise<PhoneChallenge | null> {
  if (!ticket) return null;
  const challenge = await readPhoneChallenge(ticket);
  return challenge?.verified ? challenge : null;
}

/** Seconds a screen waits before it may ask for another code for the same number. */
const RESEND_AFTER_SECONDS = 60;

/** Meta's code for a number that has no WhatsApp account. */
const NOT_ON_WHATSAPP = 131026;

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
        /** From `generateVerificationCode`, once `confirmVerificationCode` accepted the code sent on WhatsApp. */
        verificationTicket: z.string().max(200).optional(),
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

      // With verification on, the account is created only for the screen holding the ticket of a challenge verified
      // for this very number, not for any request that names a number someone else verified.
      let proof: PhoneChallenge | null = null;
      if (otpEnabled === "true") {
        proof = await verifiedChallenge(input.verificationTicket);
        if (!proof || proof.phone !== cleanPhone) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: NOT_VERIFIED_MESSAGE });
        }
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

      // The proof is spent in the transaction that creates the account: two tabs with one ticket get one account,
      // and an insert that fails gives the proof back.
      const newUser = await db.transaction(async (tx) => {
        if (proof && !(await consumePhoneChallenge(proof, { phone: cleanPhone, tx }))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: NOT_VERIFIED_MESSAGE });
        }
        const [created] = await tx
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
        return created;
      });

      const token = await generateToken(newUser.id, "local");
      await createSession(
        newUser.id,
        "local",
        token,
        getSessionMetadata(ctx.req, ctx.ip),
      );

      if (ctx.resHeaders) ctx.resHeaders.append("Set-Cookie", sessionCookie(token, ctx.req));

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
    .input(
      z.object({
        phone: z.string(),
        turnstileToken: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const clientIp = ctx.ip;
      await guardOtpGeneration(input.turnstileToken, clientIp);

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

      // Fail closed: with verification on and WhatsApp not set up, no code can reach anyone.
      const whatsapp = whatsAppConfig();
      if (!whatsapp) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "مش قادرين نبعت كود على واتساب دلوقتي. جرّب تاني بعد شوية.",
        });
      }

      await codeRequestsPerIp.hit(`otp-code-ip:${clientIp}`, "طلبت أكواد كتير من الجهاز ده. جرّب تاني بعد شوية.");
      await codeRequestsPerPhone.hit(`otp-code-phone:${cleanPhone}`, "استنى دقيقة قبل ما تطلب كود جديد لنفس الرقم.");

      // The code goes to the number's WhatsApp and nowhere else; the ticket stays with this screen and is what turns
      // the verified challenge into an account or a session.
      const challenge = await startPhoneChallenge(cleanPhone);
      try {
        await sendMessageNow(
          { to: cleanPhone, purpose: "verification", message: verificationMessage(challenge.code) },
          whatsapp,
        );
      } catch (error) {
        if (error instanceof WhatsAppApiError && error.code === NOT_ON_WHATSAPP) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "الرقم ده مش عليه واتساب. اتأكد من الرقم وجرّب تاني." });
        }
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "مش قادرين نبعت كود على واتساب دلوقتي. جرّب تاني بعد شوية.",
        });
      }
      return {
        success: true,
        ticket: challenge.ticket,
        expiresInSeconds: Math.round(PHONE_CHALLENGE_TTL_MS / 1000),
        resendInSeconds: RESEND_AFTER_SECONDS,
      };
    }),

  /** The code the person received on WhatsApp, typed back with the ticket of the same screen. */
  confirmVerificationCode: strictPublicProcedure
    .input(
      z.object({
        verificationTicket: z.string().min(1).max(200),
        code: z.string().trim().regex(/^[0-9٠-٩]{6}$/, "الكود 6 أرقام"),
      }),
    )
    .mutation(async ({ input }) => {
      // Arabic-Indic digits are read as the same code.
      const code = input.code.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
      const { outcome, attemptsLeft } = await confirmPhoneChallenge(input.verificationTicket, code);
      if (outcome === "verified") return { verified: true };
      if (outcome === "wrong") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: attemptsLeft === 1 ? "الكود غلط. فاضل محاولة واحدة." : `الكود غلط. فاضل ${attemptsLeft} محاولات.`,
        });
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          outcome === "closed"
            ? "جربت كتير بكود غلط. اطلب كود جديد."
            : "الكود انتهى. اطلب كود جديد.",
      });
    }),

  getVerificationSettings: publicProcedure.query(async () => {
    const settings = await getSystemSettings();
    return { enabled: settings["whatsapp_otp_enabled"] === "true" };
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

        if (ctx.resHeaders) ctx.resHeaders.append("Set-Cookie", sessionCookie(token, ctx.req));

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

  /**
   * Sign-in by WhatsApp: a session for the number whose code was typed back, given to the screen that holds the
   * challenge's ticket, once.
   */
  verifyOtp: strictPublicProcedure
    .input(z.object({ verificationTicket: z.string().min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const challenge = await verifiedChallenge(input.verificationTicket);
      if (!challenge) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "الرقم لسه ماتوثقش، أو التوثيق انتهى" });
      }

      const user = await db.query.localUsers.findFirst({
        where: eq(localUsers.phone, challenge.phone),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "الحساب غير موجود",
        });
      }

      if (!(await consumePhoneChallenge(challenge))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "التوثيق ده اتستخدم قبل كده" });
      }

      const token = await generateToken(user.id, "local");
      await createSession(
        user.id,
        "local",
        token,
        getSessionMetadata(ctx.req, ctx.ip),
      );

      if (ctx.resHeaders) ctx.resHeaders.append("Set-Cookie", sessionCookie(token, ctx.req));

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
    // Clear Google OAuth and smartspend_token cookies on client side
    if (ctx.resHeaders) {
      ctx.resHeaders.append(
        "Set-Cookie",
        "google_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
      );
      ctx.resHeaders.append(
        "Set-Cookie",
        "smartspend_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
      );
    }

    let token: string | undefined;
    const authHeader = getIncomingHeader(ctx.req, "Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      const cookieHeader = getIncomingHeader(ctx.req, "cookie");
      const match = cookieHeader?.match(/(?:^|;\s*)smartspend_token=([^;]*)/);
      if (match) {
        const raw = match[1].trim();
        token = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
      }
    }

    if (token) {
      await invalidateSession(token);
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
      // Without this a session resolved before the deletion keeps answering for the deleted account.
      await invalidatePrincipal(userType, userId);

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
      await setRole("local", input.id, input.role);
      return { success: true };
    }),
});
