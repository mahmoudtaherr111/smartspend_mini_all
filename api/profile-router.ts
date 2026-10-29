import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "./middleware";
import { db } from "./queries/connection";
import {
  expenses,
  monthlyBehaviorSnapshots,
  onboardingQuestions,
  users,
  localUsers,
  userProfiles,
  inAppNotifications,
  pushSubscriptions,
  userContacts,
  scheduledCashflows,
} from "../db/schema";
import { eq, and, gte, lt, desc, sql, isNotNull } from "drizzle-orm";
import { businessMonthKeyRange, shiftMonthKey } from "./lib/app-time";

import { randomBytes, randomInt } from "crypto";
import {
  getSmartProfile,
  recordProfileLearningEvent,
  saveSmartProfile,
  updateSmartProfile,
  getUserContacts,
  addDynamicContact,
} from "./services/user-profile-service";
import { invalidateUserMemory } from "./lib/muscle-memory";
import {
  ADAPTIVE_ONBOARDING_QUESTIONS,
  applyOnboardingAnswer,
  namedPeopleOfAnswer,
  getNextOnboardingQuestion,
} from "./services/adaptive-question-engine";
import { buildBehaviorSnapshot } from "./services/lifestyle-inference-engine";
import { bumpFinanceCacheGen } from "./services/finance-semantic-layer";
import { cleanPhoneNumber, comparePassword, validatePhone } from "./local-auth-utils";
import {
  executeSlidingWindowRateLimit,
  stateDel,
  stateGet,
  stateSet,
  stateTake,
} from "./lib/redis-client";
import { purgeUserData } from "./services/user-purge-service";
import { isAccountDeletionConfirmed } from "../contracts/account-deletion";
import { whatsappService } from "./services/whatsapp-service";
import { getSystemSettings } from "./lib/settings-cache";
import { invalidatePrincipal } from "./lib/access-control";
import { validateBusinessOwnership } from "./lib/ownership-guard";

/** A phone-number change: the code sent to the new number, then a one-time grant once it is confirmed. */
const PHONE_CHANGE_TTL_SECONDS = 10 * 60;
const PHONE_GRANT_TTL_SECONDS = 15 * 60;
const phoneChangeKey = (userId: number, phone: string) => `phone-change:local:${userId}:${phone}`;
const phoneGrantKey = (userId: number, phone: string, token: string) => `phone-grant:local:${userId}:${phone}:${token}`;

// ─── Strict Profile Validation Schemas (Eliminating z.any() wildcards) ───

export const safePrimitiveSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
]);

export const safeArraySchema = z.array(z.string().max(200)).max(50);

// null clears a field: the smart profile settings screen sends null for every value left empty.
export const safeProfileValueSchema = z.union([
  safePrimitiveSchema,
  safeArraySchema,
  z.null(),
]);

export const safeProfileSectionSchema = z
  .record(
    z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/, "مفتاح غير صالح"),
    safeProfileValueSchema,
  )
  .refine((obj) => Object.keys(obj).length <= 100, "تجاوز الحد الأقصى لعدد العناصر");

export const onboardingAnswerSchema = z.object({
  value: safeProfileValueSchema.optional(),
  skipped: z.boolean().optional(),
  answeredAt: z.string().max(50).optional(),
  updatedAt: z.string().max(50).optional(),
});

export const StrictBasicInfoSchema = z
  .object({
    ageRange: z.enum(["18-24", "25-34", "35-44", "45-54", "55+"]).optional(),
    occupation: z.string().max(100).optional(),
    city: z.string().max(50).optional(),
    maritalStatus: z.enum(["single", "married", "prefer_not_to_say"]).optional(),
    dependentsCount: z.number().int().min(0).max(20).optional(),
  })
  .strict();

export const StrictFinancialInfoSchema = z
  .object({
    primaryIncomeSource: z.enum(["salary", "freelance", "business", "investments", "other"]).optional(),
    incomeBracket: z.string().max(50).optional(),
    primaryGoal: z.enum([
      "save_money",
      "reduce_spending",
      "pay_debt",
      "organize_expenses",
      "track_income",
      "manage_business",
    ]).optional(),
    hasEmergencyFund: z.boolean().optional(),
    budgetingExperience: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  })
  .strict();

export const StrictProfileUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().regex(/^01[0125]\d{8}$/, "رقم هاتف مصري غير صحيح").optional(),
    otpToken: z.string().min(6).max(64).optional(),
    avatar: z.string().max(200).optional(),
  })
  .refine(
    (data) => {
      // If phone number is being changed, otpToken MUST be supplied
      if (data.phone !== undefined) {
        return Boolean(data.otpToken && data.otpToken.trim().length > 0);
      }
      return true;
    },
    {
      message: "تغيير رقم الهاتف يتطلب تقديم رمز تأكيد التوثيق (OTP)",
      path: ["otpToken"],
    },
  );

export const smartProfilePatchSchema = z.object({
  basicInfo: z.union([StrictBasicInfoSchema, safeProfileSectionSchema]).optional(),
  financialInfo: z.union([StrictFinancialInfoSchema, safeProfileSectionSchema]).optional(),
  lifestyleInfo: safeProfileSectionSchema.optional(),
  onboardingAnswers: z.record(z.string().max(80), onboardingAnswerSchema).optional(),
  aiInferredAttributes: safeProfileSectionSchema.optional(),
  preferences: safeProfileSectionSchema.optional(),
  avatarId: z.string().max(100).nullable().optional(),
  profileCompleted: z.boolean().optional(),
});


export async function refreshMonthlyInferences(
  userId: number,
  userType: string,
  month: string,
) {
  const profile = await getSmartProfile(userId, userType);
  const currentRange = businessMonthKeyRange(month);
  const previousRange = businessMonthKeyRange(shiftMonthKey(month, -1));

  const [items, previousItems] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
          gte(expenses.date, currentRange.start),
          lt(expenses.date, currentRange.endExclusive),
        ),
      ),
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
          gte(expenses.date, previousRange.start),
          lt(expenses.date, previousRange.endExclusive),
        ),
      ),
  ]);

  const snapshot = buildBehaviorSnapshot(items, previousItems, profile);
  const previousAttributes = profile.aiInferredAttributes;
  const nextProfile = {
    ...profile,
    aiInferredAttributes: {
      ...profile.aiInferredAttributes,
      ...snapshot.inferredAttributes,
    },
    lastAiRefreshAt: new Date(),
  };

  await saveSmartProfile(userId, userType, nextProfile);
  await db
    .insert(monthlyBehaviorSnapshots)
    .values({
      userId,
      userType,
      month,
      totalIncome: snapshot.totalIncome.toString(),
      totalExpense: snapshot.totalExpense.toString(),
      netFlow: snapshot.netFlow.toString(),
      topCategories: snapshot.topCategories.slice(0, 10),
      topSubCategories: snapshot.topSubCategories.slice(0, 10),
      spendingByDay: snapshot.spendingByDay,
      spendingByWeekday: snapshot.spendingByWeekday,
      behaviorFlags: snapshot.behaviorFlags,
      inferredAttributes: snapshot.inferredAttributes,
    })
    .onDuplicateKeyUpdate({
      set: {
        totalIncome: snapshot.totalIncome.toString(),
        totalExpense: snapshot.totalExpense.toString(),
        netFlow: snapshot.netFlow.toString(),
        topCategories: snapshot.topCategories.slice(0, 10),
        topSubCategories: snapshot.topSubCategories.slice(0, 10),
        spendingByDay: snapshot.spendingByDay,
        spendingByWeekday: snapshot.spendingByWeekday,
        behaviorFlags: snapshot.behaviorFlags,
        inferredAttributes: snapshot.inferredAttributes,
      },
    })
    .catch((err) => {
      console.warn("[refreshMonthlyInferences] Failed to save behavior snapshot:", err);
    });

  await recordProfileLearningEvent({
    userId,
    userType,
    eventType: "manual_refresh",
    previousAttributes,
    newAttributes: snapshot.inferredAttributes,
    metadata: { month, transactionCount: items.length },
  });

  return { profile: nextProfile, snapshot };
}

export const profileRouter = router({
  // The owner deletes the account and everything it holds, from the app: the app stores require it, and the
  // profile used to send people to Support for it. A phone account also gives its password, so a session left open
  // on someone else's phone cannot delete it.
  deleteMyAccount: authedProcedure
    .input(
      z.object({
        confirmation: z.string().max(60),
        password: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const userType = ctx.user.type === "local" ? "local" : "oauth";
      if (!isAccountDeletionConfirmed(input.confirmation)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اكتب «احذف حسابي» عشان نتأكد إنك عايز تحذفه." });
      }
      if (ctx.user.role === "admin") {
        // The console's last admin must not lock everyone out by accident.
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "حساب الإدارة مينفعش يتحذف من هنا. اطلب من مدير تاني يحذفه من لوحة الإدارة.",
        });
      }
      if (userType === "local") {
        const attempts = await executeSlidingWindowRateLimit(`account-delete:${userId}`, 5, 15 * 60_000);
        if (!attempts.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "جربت كتير. استنى ربع ساعة وجرّب تاني." });
        }
        const [row] = await db
          .select({ password: localUsers.password })
          .from(localUsers)
          .where(eq(localUsers.id, userId))
          .limit(1);
        if (!row || !input.password || !(await comparePassword(input.password, row.password))) {
          // Not UNAUTHORIZED: the app reads that as a session that ended and signs the person out.
          throw new TRPCError({ code: "BAD_REQUEST", message: "الباسورد مش صح." });
        }
      }

      await db.transaction(async (tx) => {
        await purgeUserData(tx, userId, userType);
      });
      // As for an admin deletion: a principal resolved a minute ago would keep answering for the deleted account.
      await invalidatePrincipal(userType, userId);
      if (ctx.resHeaders) {
        ctx.resHeaders.append("Set-Cookie", "google_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
        ctx.resHeaders.append("Set-Cookie", "smartspend_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
      }
      return { success: true };
    }),

  getMyProfile: authedProcedure.query(async ({ ctx }) => {
    const profile = await db
      .select()
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.userId, ctx.user.id),
          eq(userProfiles.userType, ctx.user.type),
        ),
      )
      .limit(1);
    return profile[0] || { profileCompleted: false };
  }),

  getSmartProfile: authedProcedure.query(async ({ ctx }) => {
    return await getSmartProfile(ctx.user.id, ctx.user.type);
  }),

  updateProfile: authedProcedure
    .input(
      z.object({
        monthlyIncome: z.number().optional(),
        financialGoal: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(userProfiles)
        .values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          monthlyIncome: input.monthlyIncome?.toString(),
          financialGoal: input.financialGoal,
          profileCompleted: true,
          lastAskedAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: {
            monthlyIncome: input.monthlyIncome?.toString(),
            financialGoal: input.financialGoal,
            profileCompleted: true,
            lastAskedAt: new Date(),
          },
        });
      return { success: true };
    }),

  getQuestions: authedProcedure.query(async () => {
    const dbQuestions = await db
      .select()
      .from(onboardingQuestions)
      .where(eq(onboardingQuestions.isActive, true))
      .orderBy(onboardingQuestions.sortOrder);
    return dbQuestions.length > 0 ? dbQuestions : ADAPTIVE_ONBOARDING_QUESTIONS;
  }),

  updateSmartProfile: authedProcedure
    .input(smartProfilePatchSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await updateSmartProfile(
        ctx.user.id,
        ctx.user.type,
        input,
      );
      return { success: true, profile };
    }),

  getNextOnboardingQuestion: authedProcedure.query(async ({ ctx }) => {
    const profile = await getSmartProfile(ctx.user.id, ctx.user.type);
    const nextQ = getNextOnboardingQuestion(profile.onboardingAnswers);

    console.log(
      `[getNextOnboardingQuestion] user=${ctx.user.id}, answered=${Object.keys(profile.onboardingAnswers).length}, profileCompleted=${profile.profileCompleted}, nextQ=${nextQ?.key || "DONE"}`,
    );

    // Get lastAskedAt from DB for cooldown check on frontend
    let lastAskedAt: string | null = null;
    try {
      const rows = await db
        .select({ lastAskedAt: userProfiles.lastAskedAt })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.userId, ctx.user.id),
            eq(userProfiles.userType, ctx.user.type),
          ),
        )
        .limit(1);
      lastAskedAt = rows[0]?.lastAskedAt?.toISOString() || null;
    } catch {
      // Ignore lastAskedAt fetch errors
    }

    return {
      question: nextQ,
      profileCompleted: profile.profileCompleted && !nextQ,
      lastAskedAt,
    };
  }),

  // Dismiss onboarding card — updates lastAskedAt for 24h cooldown
  dismissOnboarding: authedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    await db
      .insert(userProfiles)
      .values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        lastAskedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: { lastAskedAt: now },
      });
    return { success: true };
  }),

  submitOnboardingAnswer: authedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
        value: safeProfileValueSchema.optional(),
        skipped: z.boolean().default(false),
        // Frontend sends ALL accumulated answers so far — this is the resilience layer.
        // Even if the DB failed to persist previous answers, these are the source of truth.
        accumulatedAnswers: z.record(z.string().max(80), onboardingAnswerSchema).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getSmartProfile(ctx.user.id, ctx.user.type);

      // CRITICAL FIX: Merge frontend-accumulated answers into the profile BEFORE applying the new one.
      // This ensures that even if previous DB saves lost the onboardingAnswers,
      // we reconstruct the full state from the frontend's local copy.
      if (
        input.accumulatedAnswers &&
        Object.keys(input.accumulatedAnswers).length > 0
      ) {
        for (const [aKey, aVal] of Object.entries(input.accumulatedAnswers)) {
          if (aKey !== input.key && aVal && !profile.onboardingAnswers[aKey]) {
            profile.onboardingAnswers[aKey] = aVal as any;
          }
        }
      }

      const nextProfile = applyOnboardingAnswer(
        profile,
        input.key,
        input.value,
        input.skipped,
      );

      console.log(
        `[submitOnboardingAnswer] key=${input.key}, total answers=${Object.keys(nextProfile.onboardingAnswers).length}, keys=[${Object.keys(nextProfile.onboardingAnswers).join(",")}]`,
      );

      await saveSmartProfile(ctx.user.id, ctx.user.type, nextProfile);
      // Names given here are people the classifier should already know.
      if (!input.skipped) {
        for (const person of namedPeopleOfAnswer(input.key, input.value)) {
          await addDynamicContact(ctx.user.id, ctx.user.type, person.name, person.relationship).catch(() => null);
        }
      }
      return {
        success: true,
        profile: nextProfile,
        nextQuestion: getNextOnboardingQuestion(nextProfile.onboardingAnswers),
        // Send back all answers so frontend can accumulate them
        allAnswers: nextProfile.onboardingAnswers,
      };
    }),

  refreshInferences: authedProcedure
    .input(
      z
        .object({
          month: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const month =
        input?.month ||
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const result = await refreshMonthlyInferences(
        ctx.user.id,
        ctx.user.type,
        month,
      );
      return { success: true, ...result };
    }),

  requestPhoneChange: authedProcedure
    .input(
      z.object({
        newPhone: z.string().regex(/^01[0125]\d{8}$/, "رقم هاتف مصري غير صحيح"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.type !== "local") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "تغيير رقم الهاتف متاح فقط للحسابات المحلية",
        });
      }

      const clean = cleanPhoneNumber(input.newPhone);
      const validation = validatePhone(clean);
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.message,
        });
      }

      // Check if phone is already registered to another user
      const existing = await db.query.localUsers.findFirst({
        where: eq(localUsers.phone, clean),
      });
      if (existing && existing.id !== ctx.user.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "رقم الهاتف مسجل بالفعل لحساب آخر",
        });
      }

      const code = "SS-" + randomInt(100000, 1000000).toString();
      // Shared state, so the confirmation may reach any replica (api/AGENTS.md, rule 6).
      await stateSet(phoneChangeKey(ctx.user.id, clean), PHONE_CHANGE_TTL_SECONDS, code);

      const settings = await getSystemSettings();
      if (settings["whatsapp_otp_enabled"] === "true") {
        await whatsappService.sendMessage(
          clean,
          `رمز تأكيد تغيير رقم الهاتف في SmartSpend هو: ${code}`,
        );
      }

      return {
        success: true,
        message: "تم إرسال رمز التأكيد إلى رقم هاتفك الجديد",
      };
    }),

  confirmPhoneChange: authedProcedure
    .input(
      z.object({
        newPhone: z.string().regex(/^01[0125]\d{8}$/, "رقم هاتف مصري غير صحيح"),
        code: z.string().min(4).max(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.type !== "local") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "تغيير رقم الهاتف متاح فقط للحسابات المحلية",
        });
      }

      const clean = cleanPhoneNumber(input.newPhone);
      const cacheKey = phoneChangeKey(ctx.user.id, clean);
      const expected = await stateGet(cacheKey);

      if (!expected || expected !== input.code.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "رمز التأكيد غير صحيح أو منتهي الصلاحية",
        });
      }

      await stateDel(cacheKey);

      // Check conflict again before persisting
      const existing = await db.query.localUsers.findFirst({
        where: eq(localUsers.phone, clean),
      });
      if (existing && existing.id !== ctx.user.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "رقم الهاتف مسجل بالفعل لحساب آخر",
        });
      }

      // Generate verified OTP grant token (usable if client also calls updateUserInfo)
      const otpToken = `otp_grant_${randomBytes(16).toString("hex")}`;
      await stateSet(phoneGrantKey(ctx.user.id, clean, otpToken), PHONE_GRANT_TTL_SECONDS, "1");

      // Update phone in DB
      await db
        .update(localUsers)
        .set({ phone: clean })
        .where(eq(localUsers.id, ctx.user.id));

      // The phone is part of the cached principal, so the cache has to resolve again.
      await invalidatePrincipal("local", ctx.user.id);

      return {
        success: true,
        otpToken,
        message: "تم تحديث رقم الهاتف بنجاح",
      };
    }),

  updateUserInfo: authedProcedure
    .input(StrictProfileUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.phone !== undefined) {
        if (ctx.user.type !== "local") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "تغيير رقم الهاتف متاح فقط للحسابات المحلية",
          });
        }

        const clean = cleanPhoneNumber(input.phone);
        const directKey = phoneChangeKey(ctx.user.id, clean);
        const offered = input.otpToken?.trim() ?? "";
        // A grant from confirmPhoneChange is used once; the code itself is accepted too.
        const isGrantMatch = offered.length > 0 && (await stateTake(phoneGrantKey(ctx.user.id, clean, offered))) !== null;
        const directCode = isGrantMatch ? null : await stateGet(directKey);
        const isDirectCodeMatch = directCode !== null && offered.length > 0 && directCode === offered;

        if (!isDirectCodeMatch && !isGrantMatch) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "رمز تأكيد التوثيق (OTP) غير صحيح أو منتهي الصلاحية",
          });
        }

        await stateDel(directKey);

        const existing = await db.query.localUsers.findFirst({
          where: eq(localUsers.phone, clean),
        });
        if (existing && existing.id !== ctx.user.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "رقم الهاتف مسجل بالفعل لحساب آخر",
          });
        }

        await db
          .update(localUsers)
          .set({ phone: clean })
          .where(eq(localUsers.id, ctx.user.id));

        await invalidatePrincipal("local", ctx.user.id);
      }

      if (ctx.user.type === "oauth") {
        const updates: any = {};
        if (input.name) updates.name = input.name;
        if (input.avatar !== undefined) updates.avatar = input.avatar;
        if (Object.keys(updates).length > 0) {
          await db.update(users).set(updates).where(eq(users.id, ctx.user.id));
        }
      } else {
        const updates: any = {};
        if (input.name) updates.name = input.name;
        if (input.avatar !== undefined) updates.avatar = input.avatar;
        if (Object.keys(updates).length > 0) {
          await db
            .update(localUsers)
            .set(updates)
            .where(eq(localUsers.id, ctx.user.id));
        }
      }
      return { success: true };
    }),

  // ─── Save Push Subscription ───
  savePushSubscription: authedProcedure
    .input(
      z.object({
        endpoint: z.string().optional(),
        p256dh: z.string().optional(),
        auth: z.string().optional(),
        fcmToken: z.string().optional(),
        deviceType: z.string().optional().default("web"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let existing: any[] = [];
      
      if (input.fcmToken) {
        existing = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.fcmToken, input.fcmToken))
          .limit(1);
      } else if (input.endpoint) {
        existing = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, input.endpoint))
          .limit(1);
      }

      if (existing.length === 0) {
        await db.insert(pushSubscriptions).values({
          userId: ctx.user.id as number,
          userType: ctx.user.type,
          endpoint: input.endpoint || null,
          p256dh: input.p256dh || null,
          auth: input.auth || null,
          fcmToken: input.fcmToken || null,
          deviceType: input.deviceType || "web",
        });
      } else {
        const currentSub = existing[0];
        if (currentSub.userId !== ctx.user.id || currentSub.userType !== ctx.user.type) {
          await db
            .update(pushSubscriptions)
            .set({
              userId: ctx.user.id as number,
              userType: ctx.user.type,
              deviceType: input.deviceType || currentSub.deviceType,
            })
            .where(eq(pushSubscriptions.id, currentSub.id));
        }
      }
      return { success: true };
    }),

  // ─── Get In-App Notifications (The Bell) ───
  getInAppNotifications: authedProcedure.query(async ({ ctx }) => {
    return await db.select()
      .from(inAppNotifications)
      .where(and(
        eq(inAppNotifications.userId, ctx.user.id as number),
        eq(inAppNotifications.userType, ctx.user.type)
      ))
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(50);
  }),

  markInAppNotificationRead: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(inAppNotifications)
        .set({ isRead: true })
        .where(and(
          eq(inAppNotifications.id, input.id),
          eq(inAppNotifications.userId, ctx.user.id as number),
          eq(inAppNotifications.userType, ctx.user.type)
        ));
      return { success: true };
    }),

  markAllInAppNotificationsRead: authedProcedure.mutation(async ({ ctx }) => {
    await db.update(inAppNotifications)
      .set({ isRead: true })
      .where(and(
        eq(inAppNotifications.userId, ctx.user.id as number),
        eq(inAppNotifications.userType, ctx.user.type),
        eq(inAppNotifications.isRead, false),
      ));
    return { success: true };
  }),

  // ─── People Management (People Hub) ───

  listContacts: authedProcedure
    .input(z.object({
      filter: z.enum(["all", "personal", "business", "silenced"]).default("all"),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const filter = input?.filter || "all";
      const search = input?.search;

      let query = db
        .select({
          id: userContacts.id,
          name: userContacts.name,
          relation: userContacts.relation,
          contactType: userContacts.contactType,
          businessId: userContacts.businessId,
          isSilenced: userContacts.isSilenced,
          transactionCount: userContacts.transactionCount,
          createdAt: userContacts.createdAt,
        })
        .from(userContacts)
        .where(and(
          eq(userContacts.userId, ctx.user.id as number),
          eq(userContacts.userType, ctx.user.type),
        ));

      const rows = await query;
      // `transactionCount` is a cache for sorting and offline display, never
      // the source of truth. Calculate it from the canonical expense relation
      // so old stale counters cannot mislead the user.
      const counts = await db
        .select({
          contactId: expenses.contactId,
          total: sql<number>`COUNT(*)`,
        })
        .from(expenses)
        .where(and(
          eq(expenses.userId, ctx.user.id as number),
          eq(expenses.userType, ctx.user.type),
          isNotNull(expenses.contactId),
        ))
        .groupBy(expenses.contactId);
      const countByContactId = new Map(
        counts.map((row) => [row.contactId, Number(row.total || 0)]),
      );
      const rowsWithCounts = rows.map((row) => ({
        ...row,
        transactionCount: countByContactId.get(row.id) || 0,
      }));

      let filtered = rowsWithCounts;
      if (filter === "personal") {
        filtered = rowsWithCounts.filter(r => r.contactType === "personal" && !r.isSilenced);
      } else if (filter === "business") {
        filtered = rowsWithCounts.filter(r => r.contactType !== "personal");
      } else if (filter === "silenced") {
        filtered = rowsWithCounts.filter(r => r.isSilenced);
      }

      if (search && search.trim().length > 0) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(r =>
          r.name.toLowerCase().includes(q) ||
          (r.relation || "").toLowerCase().includes(q)
        );
      }

      return { contacts: filtered };
    }),

  addContact: authedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      relation: z.string().max(100).optional(),
      contactType: z.enum(["personal", "business_supplier", "business_customer", "business_employee"]).default("personal"),
      businessId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db
        .select({ id: userContacts.id })
        .from(userContacts)
        .where(and(
          eq(userContacts.userId, ctx.user.id as number),
          eq(userContacts.userType, ctx.user.type),
          eq(userContacts.name, input.name),
        ))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "شخص بنفس الاسم موجود بالفعل" });
      }

      if (input.businessId) {
        const isOwner = await validateBusinessOwnership(
          ctx.user.id as number,
          input.businessId,
          ctx.user.type,
        );
        if (!isOwner) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المشروع المحدد غير موجود أو لا تملك صلاحية الوصول إليه",
          });
        }
      }

      const [result] = await db.insert(userContacts).values({
        userId: ctx.user.id as number,
        userType: ctx.user.type,
        name: input.name,
        relation: input.relation || null,
        contactType: input.contactType,
        businessId: input.businessId || null,
        isSilenced: false,
      });

      invalidateUserMemory(ctx.user.id as number, ctx.user.type);
      return { id: result.insertId, success: true };
    }),

  updateContact: authedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      relation: z.string().max(100).optional(),
      contactType: z.enum(["personal", "business_supplier", "business_customer", "business_employee"]).optional(),
      businessId: z.number().nullable().optional(),
      isSilenced: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.businessId) {
        const isOwner = await validateBusinessOwnership(
          ctx.user.id as number,
          input.businessId,
          ctx.user.type,
        );
        if (!isOwner) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المشروع المحدد غير موجود أو لا تملك صلاحية الوصول إليه",
          });
        }
      }

      const [existing] = await db
        .select({ id: userContacts.id })
        .from(userContacts)
        .where(and(
          eq(userContacts.id, input.id),
          eq(userContacts.userId, ctx.user.id as number),
          eq(userContacts.userType, ctx.user.type),
        ))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "جهة الاتصال غير موجودة",
        });
      }

      const { id, ...updates } = input;
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined),
      );

      if (Object.keys(cleanUpdates).length > 0) {
        await db
          .update(userContacts)
          .set(cleanUpdates)
          .where(and(
            eq(userContacts.id, id),
            eq(userContacts.userId, ctx.user.id as number),
            eq(userContacts.userType, ctx.user.type),
          ));
      }

      invalidateUserMemory(ctx.user.id as number, ctx.user.type);
      return { success: true };
    }),

  deleteContact: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [contactToDelete] = await db
        .select()
        .from(userContacts)
        .where(and(
          eq(userContacts.id, input.id),
          eq(userContacts.userId, ctx.user.id as number),
          eq(userContacts.userType, ctx.user.type),
        ));

      if (!contactToDelete) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "جهة الاتصال غير موجودة",
        });
      }

      if (contactToDelete?.name) {
        try {
          const [userProfile] = await db
            .select()
            .from(userProfiles)
            .where(and(
              eq(userProfiles.userId, ctx.user.id as number),
              eq(userProfiles.userType, ctx.user.type),
            ));
          if (userProfile && userProfile.lifestyleInfo) {
            const lifestyle = userProfile.lifestyleInfo as Record<string, any>;
            const target = contactToDelete.name.trim();
            let changed = false;
            const scrubArray = (arr: any) => {
              if (!Array.isArray(arr)) return arr;
              const filtered = arr.filter(item => {
                if (typeof item === "string") return item.trim() !== target;
                if (item && typeof item === "object" && item.name) return item.name.trim() !== target;
                return true;
              });
              if (filtered.length !== arr.length) changed = true;
              return filtered;
            };
            lifestyle.dynamicContacts = scrubArray(lifestyle.dynamicContacts);
            lifestyle.regularContacts = scrubArray(lifestyle.regularContacts);
            lifestyle.childrenNames = scrubArray(lifestyle.childrenNames);
            lifestyle.siblingsNames = scrubArray(lifestyle.siblingsNames);
            lifestyle.parentsNames = scrubArray(lifestyle.parentsNames);
            lifestyle.petNames = scrubArray(lifestyle.petNames);
            if (lifestyle.partnerName && typeof lifestyle.partnerName === "string" && lifestyle.partnerName.trim() === target) {
              lifestyle.partnerName = undefined;
              changed = true;
            }
            if (changed) {
              await db
                .update(userProfiles)
                .set({ lifestyleInfo: lifestyle as any })
                .where(eq(userProfiles.id, userProfile.id));
            }
          }
        } catch (err) {
          console.error("[deleteContact] Profile scrub error:", err);
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(expenses)
          .set({ contactId: null })
          .where(and(
            eq(expenses.contactId, input.id),
            eq(expenses.userId, ctx.user.id as number),
            eq(expenses.userType, ctx.user.type),
          ));

        await tx.update(scheduledCashflows).set({ contactId: null }).where(and(
          eq(scheduledCashflows.contactId, input.id), eq(scheduledCashflows.userId, ctx.user.id as number), eq(scheduledCashflows.userType, ctx.user.type),
        ));

        await tx
          .delete(userContacts)
          .where(and(
            eq(userContacts.id, input.id),
            eq(userContacts.userId, ctx.user.id as number),
            eq(userContacts.userType, ctx.user.type),
          ));
      });

      invalidateUserMemory(ctx.user.id as number, ctx.user.type);
      // The person's rows changed hands: the loan balances and the AI Center's per-person
      // answers are cached, and read them.
      await bumpFinanceCacheGen(ctx.user.id as number, ctx.user.type as "oauth" | "local");
      return { success: true };
    }),

  mergeContacts: authedProcedure
    .input(z.object({
      primaryId: z.number(),
      secondaryId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.primaryId === input.secondaryId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن دمج الشخص بنفسه" });
      }

      const contacts = await db
        .select()
        .from(userContacts)
        .where(and(
          eq(userContacts.userId, ctx.user.id as number),
          eq(userContacts.userType, ctx.user.type),
        ));

      const primary = contacts.find(c => c.id === input.primaryId);
      const secondary = contacts.find(c => c.id === input.secondaryId);

      if (!primary || !secondary) {
        throw new TRPCError({ code: "NOT_FOUND", message: "جهة الاتصال غير موجودة" });
      }

      if (secondary.name) {
        try {
          const [userProfile] = await db
            .select()
            .from(userProfiles)
            .where(and(
              eq(userProfiles.userId, ctx.user.id as number),
              eq(userProfiles.userType, ctx.user.type),
            ));
          if (userProfile && userProfile.lifestyleInfo) {
            const lifestyle = userProfile.lifestyleInfo as Record<string, any>;
            const target = secondary.name.trim();
            let changed = false;
            const scrubArray = (arr: any) => {
              if (!Array.isArray(arr)) return arr;
              const filtered = arr.filter(item => {
                if (typeof item === "string") return item.trim() !== target;
                if (item && typeof item === "object" && item.name) return item.name.trim() !== target;
                return true;
              });
              if (filtered.length !== arr.length) changed = true;
              return filtered;
            };
            lifestyle.dynamicContacts = scrubArray(lifestyle.dynamicContacts);
            lifestyle.regularContacts = scrubArray(lifestyle.regularContacts);
            lifestyle.childrenNames = scrubArray(lifestyle.childrenNames);
            lifestyle.siblingsNames = scrubArray(lifestyle.siblingsNames);
            lifestyle.parentsNames = scrubArray(lifestyle.parentsNames);
            lifestyle.petNames = scrubArray(lifestyle.petNames);
            if (lifestyle.partnerName && typeof lifestyle.partnerName === "string" && lifestyle.partnerName.trim() === target) {
              lifestyle.partnerName = undefined;
              changed = true;
            }
            if (changed) {
              await db
                .update(userProfiles)
                .set({ lifestyleInfo: lifestyle as any })
                .where(eq(userProfiles.id, userProfile.id));
            }
          }
        } catch (err) {
          console.error("[mergeContacts] Profile scrub error:", err);
        }
      }

      const mergedRelation = primary.relation || secondary.relation;
      const mergedIsSilenced = primary.isSilenced || secondary.isSilenced;
      const mergedContactType = primary.contactType !== "personal" ? primary.contactType : secondary.contactType;
      const mergedBusinessId = primary.businessId || secondary.businessId;

      await db.transaction(async (tx) => {
        await tx
          .update(expenses)
          .set({ contactId: primary.id })
          .where(and(
            eq(expenses.contactId, secondary.id),
            eq(expenses.userId, ctx.user.id as number),
            eq(expenses.userType, ctx.user.type),
          ));

        await tx.update(scheduledCashflows).set({ contactId: primary.id }).where(and(
          eq(scheduledCashflows.contactId, secondary.id), eq(scheduledCashflows.userId, ctx.user.id as number), eq(scheduledCashflows.userType, ctx.user.type),
        ));

        const [canonicalCount] = await tx
          .select({ total: sql<number>`COUNT(*)` })
          .from(expenses)
          .where(and(
            eq(expenses.contactId, primary.id),
            eq(expenses.userId, ctx.user.id as number),
            eq(expenses.userType, ctx.user.type),
          ));

        await tx
          .update(userContacts)
          .set({
            relation: mergedRelation,
            transactionCount: Number(canonicalCount?.total || 0),
            isSilenced: mergedIsSilenced,
            contactType: mergedContactType,
            businessId: mergedBusinessId,
          })
          .where(and(
            eq(userContacts.id, primary.id),
            eq(userContacts.userId, ctx.user.id as number),
            eq(userContacts.userType, ctx.user.type),
          ));

        await tx
          .delete(userContacts)
          .where(and(
            eq(userContacts.id, secondary.id),
            eq(userContacts.userId, ctx.user.id as number),
            eq(userContacts.userType, ctx.user.type),
          ));
      });

      invalidateUserMemory(ctx.user.id as number, ctx.user.type);
      await bumpFinanceCacheGen(ctx.user.id as number, ctx.user.type as "oauth" | "local");
      return { success: true, mergedInto: primary.name };
    }),
});
