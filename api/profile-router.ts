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
  webhookTokens,
  rawSmsEvents,
  inAppNotifications,
  pushSubscriptions,
  userContacts,
} from "../db/schema";
import { eq, and, gte, lte, desc, sql, isNotNull } from "drizzle-orm";

import { randomBytes } from "crypto";
import {
  getSmartProfile,
  recordProfileLearningEvent,
  saveSmartProfile,
  updateSmartProfile,
  getUserContacts,
} from "./services/user-profile-service";
import { invalidateUserClassificationCache } from "./lib/smart-pipeline";
import { invalidateUserMemory } from "./lib/muscle-memory";
import {
  ADAPTIVE_ONBOARDING_QUESTIONS,
  applyOnboardingAnswer,
  getNextOnboardingQuestion,
} from "./services/adaptive-question-engine";
import { buildBehaviorSnapshot } from "./services/lifestyle-inference-engine";

const smartProfilePatchSchema = z.object({
  basicInfo: z.record(z.string(), z.any()).optional(),
  financialInfo: z.record(z.string(), z.any()).optional(),
  lifestyleInfo: z.record(z.string(), z.any()).optional(),
  onboardingAnswers: z.record(z.string(), z.any()).optional(),
  aiInferredAttributes: z.record(z.string(), z.any()).optional(),
  preferences: z.record(z.string(), z.any()).optional(),
  avatarId: z.string().nullable().optional(),
  profileCompleted: z.boolean().optional(),
});

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 0, 23, 59, 59, 999);
  return { start, end };
}

async function refreshMonthlyInferences(
  userId: number,
  userType: string,
  month: string,
) {
  const profile = await getSmartProfile(userId, userType);
  const currentRange = monthRange(month);
  const [year, monthNumber] = month.split("-").map(Number);
  const prevMonth = `${monthNumber === 1 ? year - 1 : year}-${String(monthNumber === 1 ? 12 : monthNumber - 1).padStart(2, "0")}`;
  const previousRange = monthRange(prevMonth);

  const [items, previousItems] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
          gte(expenses.date, currentRange.start),
          lte(expenses.date, currentRange.end),
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
          lte(expenses.date, previousRange.end),
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
    await db
      .update(userProfiles)
      .set({ lastAskedAt: new Date() })
      .where(
        and(
          eq(userProfiles.userId, ctx.user.id),
          eq(userProfiles.userType, ctx.user.type),
        ),
      );
    return { success: true };
  }),

  submitOnboardingAnswer: authedProcedure
    .input(
      z.object({
        key: z.string().min(1),
        value: z.any().optional(),
        skipped: z.boolean().default(false),
        // Frontend sends ALL accumulated answers so far — this is the resilience layer.
        // Even if the DB failed to persist previous answers, these are the source of truth.
        accumulatedAnswers: z.record(z.string(), z.any()).optional(),
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

  updateUserInfo: authedProcedure
    .input(
      z.object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        avatar: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
        if (input.phone) updates.phone = input.phone;
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

  // ─── Webhook Token Management (for SMS Ingestion via iOS Shortcuts) ───
  getWebhookToken: authedProcedure.query(async ({ ctx }) => {
    const [record] = await db
      .select()
      .from(webhookTokens)
      .where(
        and(
          eq(webhookTokens.userId, ctx.user.id as number),
          eq(webhookTokens.userType, ctx.user.type),
        ),
      )
      .limit(1);
    return {
      token: record?.token || null,
      hasToken: !!record,
      createdAt: record?.createdAt || null,
    };
  }),

  generateWebhookToken: authedProcedure.mutation(async ({ ctx }) => {
    // Revoke any existing tokens first
    await db
      .delete(webhookTokens)
      .where(
        and(
          eq(webhookTokens.userId, ctx.user.id as number),
          eq(webhookTokens.userType, ctx.user.type),
        ),
      );
    const newToken = `sms_${randomBytes(32).toString("hex")}`;
    await db.insert(webhookTokens).values({
      userId: ctx.user.id as number,
      userType: ctx.user.type,
      token: newToken,
      name: "iOS Shortcut Token",
    });
    return { success: true, token: newToken };
  }),

  // ─── Magic Code for zero-config iOS Shortcut setup ───
  generateMagicCode: authedProcedure.mutation(async ({ ctx }) => {
    const [record] = await db
      .select()
      .from(webhookTokens)
      .where(
        and(
          eq(webhookTokens.userId, ctx.user.id as number),
          eq(webhookTokens.userType, ctx.user.type),
        ),
      )
      .limit(1);

    if (!record) {
      throw new Error("لازم تعمل Token الأول قبل ما تستخدم Magic Link.");
    }

    const { storeMagicCode } = await import("./sms-router");
    const code = storeMagicCode(
      record.token,
      ctx.user.id as number,
      ctx.user.type,
    );
    return { code, expiresInSeconds: 300 };
  }),

  // ─── Get recent SMS logs ───
  getSmsLogs: authedProcedure.query(async ({ ctx }) => {
    return await db
      .select()
      .from(rawSmsEvents)
      .where(
        and(
          eq(rawSmsEvents.userId, ctx.user.id as number),
          eq(rawSmsEvents.userType, ctx.user.type),
        ),
      )
      .orderBy(desc(rawSmsEvents.createdAt))
      .limit(10);
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

      const [result] = await db.insert(userContacts).values({
        userId: ctx.user.id as number,
        userType: ctx.user.type,
        name: input.name,
        relation: input.relation || null,
        contactType: input.contactType,
        businessId: input.businessId || null,
        isSilenced: false,
      });

      invalidateUserClassificationCache(ctx.user.id as number);
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

      invalidateUserClassificationCache(ctx.user.id as number);
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

      await db
        .update(expenses)
        .set({ contactId: null })
        .where(and(
          eq(expenses.contactId, input.id),
          eq(expenses.userId, ctx.user.id as number),
          eq(expenses.userType, ctx.user.type),
        ));

      await db
        .delete(userContacts)
        .where(and(
          eq(userContacts.id, input.id),
          eq(userContacts.userId, ctx.user.id as number),
          eq(userContacts.userType, ctx.user.type),
        ));

      invalidateUserClassificationCache(ctx.user.id as number);
      invalidateUserMemory(ctx.user.id as number, ctx.user.type);
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
        throw new TRPCError({ code: "NOT_FOUND", message: "شخص غير موجود" });
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

      await db
        .update(expenses)
        .set({ contactId: primary.id })
        .where(and(
          eq(expenses.contactId, secondary.id),
          eq(expenses.userId, ctx.user.id as number),
          eq(expenses.userType, ctx.user.type),
        ));

      const [canonicalCount] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(expenses)
        .where(and(
          eq(expenses.contactId, primary.id),
          eq(expenses.userId, ctx.user.id as number),
          eq(expenses.userType, ctx.user.type),
        ));

      await db
        .update(userContacts)
        .set({
          relation: mergedRelation,
          transactionCount: Number(canonicalCount?.total || 0),
          isSilenced: mergedIsSilenced,
          contactType: mergedContactType,
          businessId: mergedBusinessId,
        })
        .where(eq(userContacts.id, primary.id));

      await db
        .delete(userContacts)
        .where(eq(userContacts.id, secondary.id));

      invalidateUserClassificationCache(ctx.user.id as number);
      invalidateUserMemory(ctx.user.id as number, ctx.user.type);
      return { success: true, mergedInto: primary.name };
    }),
});
