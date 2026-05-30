import { z } from "zod";
import { router, adminProcedure, moderatorProcedure } from "./middleware";
import { db } from "./queries/connection";
import {
  users,
  localUsers,
  expenses,
  sessions,
  supportTickets,
  userAnalytics,
  systemSettings,
  classificationLogs,
  voiceUsage,
  discountCodes,
  userWallets,
  proSubscriptions,
  monthlyReports,
  aiSummaries,
  userProfiles,
  profileLearningEvents,
  monthlyBehaviorSnapshots,
  userDictionaries,
  webhookTokens,
  rawSmsEvents,
  expenseCategories,
  apiKeyErrors,
  pushSubscriptions,
  pendingClarifications,
} from "../db/schema";
import {
  eq,
  sql,
  desc,
  count,
  and,
  gte,
  lte,
  sum,
  inArray,
  or,
  like,
} from "drizzle-orm";
import {
  logApiKeyError,
  getApiKeyErrors as fetchApiKeyErrors,
  resolveApiKeyError as resolveError,
  resolveAllApiKeyErrors,
  classifyApiError,
} from "./lib/error-logger";
import { TRPCError } from "@trpc/server";
import { env } from "./lib/env";
import { getSmartProfile } from "./services/user-profile-service";
import webpush from "web-push";

// Setup Web Push
// In a real app these should be in env vars, but we'll use the ones generated earlier
const vapidPublicKey =
  process.env.VAPID_PUBLIC_KEY ||
  "BBtKP6w97Av5YT6NvKCh3EostLvYiXIHQqM-QGSMlMYRk8fJPalWo3dvXEcghrnlizV1selpCWTOjU4qTjIBb3o";
const vapidPrivateKey =
  process.env.VAPID_PRIVATE_KEY ||
  "-31rwR0LxanvleE02FotUVGGx3mVno1YJtR7hTaNHrA";
webpush.setVapidDetails(
  "mailto:admin@smartspend.ai",
  vapidPublicKey,
  vapidPrivateKey,
);

function isMissingTableError(err: unknown, table: string): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return (
    message.includes(table) &&
    (message.includes("doesn't exist") ||
      message.includes("ER_NO_SUCH_TABLE") ||
      message.includes("Failed query"))
  );
}

function searchUsersConditionOAuth(search: string) {
  const term = `%${search.replace(/[%_\\]/g, "").slice(0, 64)}%`;
  return or(like(users.name, term), like(users.email, term));
}

function searchUsersConditionLocal(search: string) {
  const term = `%${search.replace(/[%_\\]/g, "").slice(0, 64)}%`;
  return or(like(localUsers.name, term), like(localUsers.phone, term));
}

export const adminRouter = router({
  // ─── Dashboard Stats ───
  getDashboardStats: adminProcedure.query(async () => {
    const totalUsers = await db.select({ count: count() }).from(users);
    const totalLocalUsers = await db
      .select({ count: count() })
      .from(localUsers);
    const totalExpenses = await db.select({ count: count() }).from(expenses);
    const totalAmount = await db
      .select({ sum: sql`SUM(amount)` })
      .from(expenses);
    const todayExpenses = await db
      .select({ sum: sql`SUM(amount)` })
      .from(expenses)
      .where(sql`DATE(date) = CURDATE()`);
    const activeSessions = await db
      .select({ count: count() })
      .from(sessions)
      .where(gte(sessions.expiresAt, new Date()));
    const openTickets = await db
      .select({ count: count() })
      .from(supportTickets)
      .where(eq(supportTickets.status, "open"));
    const paidPlans = inArray(users.plan, ["pro", "ultra"]);
    const paidPlansLocal = inArray(localUsers.plan, ["pro", "ultra"]);
    const proUsers = await db
      .select({ count: count() })
      .from(users)
      .where(paidPlans);
    const proLocalUsers = await db
      .select({ count: count() })
      .from(localUsers)
      .where(paidPlansLocal);

    return {
      totalOAuthUsers: totalUsers[0]?.count ?? 0,
      totalLocalUsers: totalLocalUsers[0]?.count ?? 0,
      totalUsers:
        (totalUsers[0]?.count ?? 0) + (totalLocalUsers[0]?.count ?? 0),
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
    .input(
      z
        .object({
          search: z.string().optional(),
          role: z.string().optional(),
          plan: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { search, role, plan, page = 1, limit = 20 } = input ?? {};
      const offset = (page - 1) * limit;

      const oauthFilters = [];
      if (role) oauthFilters.push(eq(users.role, role));
      if (plan) oauthFilters.push(eq(users.plan, plan));
      if (search) oauthFilters.push(searchUsersConditionOAuth(search));

      let oauthQuery = db.select().from(users).$dynamic();
      if (oauthFilters.length)
        oauthQuery = oauthQuery.where(and(...oauthFilters));

      const localFilters = [];
      if (role) localFilters.push(eq(localUsers.role, role));
      if (plan) localFilters.push(eq(localUsers.plan, plan));
      if (search) localFilters.push(searchUsersConditionLocal(search));

      let localQuery = db.select().from(localUsers).$dynamic();
      if (localFilters.length)
        localQuery = localQuery.where(and(...localFilters));

      const oauthUsers = await oauthQuery.limit(limit).offset(offset);
      const localUsersList = await localQuery.limit(limit).offset(offset);

      const oauthCount = await db.select({ count: count() }).from(users);
      const localCount = await db.select({ count: count() }).from(localUsers);

      const oauthIds = oauthUsers.map((u) => u.id);
      const localIds = localUsersList.map((u) => u.id);

      const statMap = new Map<
        string,
        { expenseCount: number; totalSpent: string }
      >();

      const expenseParts = [];
      if (oauthIds.length)
        expenseParts.push(
          and(
            inArray(expenses.userId, oauthIds),
            eq(expenses.userType, "oauth"),
          ),
        );
      if (localIds.length)
        expenseParts.push(
          and(
            inArray(expenses.userId, localIds),
            eq(expenses.userType, "local"),
          ),
        );

      if (expenseParts.length > 0) {
        const rows = await db
          .select({
            userId: expenses.userId,
            userType: expenses.userType,
            expenseCount: count(),
            totalSpent: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
          })
          .from(expenses)
          .where(
            expenseParts.length === 1 ? expenseParts[0]! : or(...expenseParts),
          )
          .groupBy(expenses.userId, expenses.userType);

        for (const r of rows) {
          statMap.set(`${r.userType}:${r.userId}`, {
            expenseCount: Number(r.expenseCount ?? 0),
            totalSpent: String(r.totalSpent ?? "0"),
          });
        }
      }

      const enrichedOAuth = oauthUsers.map((u) => {
        const s = statMap.get(`oauth:${u.id}`);
        return {
          ...u,
          userType: "oauth" as const,
          expenseCount: s?.expenseCount ?? 0,
          totalSpent: s?.totalSpent ?? "0",
        };
      });

      const enrichedLocal = localUsersList.map((u) => {
        const s = statMap.get(`local:${u.id}`);
        return {
          ...u,
          userType: "local" as const,
          expenseCount: s?.expenseCount ?? 0,
          totalSpent: s?.totalSpent ?? "0",
        };
      });

      return {
        users: [...enrichedOAuth, ...enrichedLocal],
        total: (oauthCount[0]?.count ?? 0) + (localCount[0]?.count ?? 0),
        page,
        limit,
      };
    }),

  // ─── View User SmartProfile (Admin) ───
  getUserSmartProfile: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        userType: z.enum(["oauth", "local"]),
      }),
    )
    .query(async ({ input }) => {
      const profile = await getSmartProfile(input.userId, input.userType);
      return profile;
    }),

  // ─── Update User Role ───
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        userType: z.enum(["oauth", "local"]),
        role: z.enum(["user", "moderator", "admin"]),
      }),
    )
    .mutation(async ({ input }) => {
      const table = input.userType === "oauth" ? users : localUsers;
      await db
        .update(table)
        .set({ role: input.role })
        .where(eq(table.id, input.userId));
      return { success: true, message: "تم تحديث الدور بنجاح" };
    }),

  // ─── Update User Plan ───
  updateUserPlan: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        userType: z.enum(["oauth", "local"]),
        plan: z.enum(["free", "pro"]),
      }),
    )
    .mutation(async ({ input }) => {
      const table = input.userType === "oauth" ? users : localUsers;
      await db
        .update(table)
        .set({ plan: input.plan })
        .where(eq(table.id, input.userId));
      return { success: true, message: "تم تحديث الخطة بنجاح" };
    }),

  // ─── Delete User ───
  deleteUser: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        userType: z.enum(["oauth", "local"]),
      }),
    )
    .mutation(async ({ input }) => {
      const { userId, userType } = input;
      // Delete related data first
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

      const table = userType === "oauth" ? users : localUsers;
      await db.delete(table).where(eq(table.id, userId));
      return { success: true, message: "تم حذف المستخدم بنجاح" };
    }),

  // ─── Get User Sessions ───
  getUserSessions: moderatorProcedure
    .input(
      z.object({
        userId: z.number(),
        userType: z.enum(["oauth", "local"]),
      }),
    )
    .query(async ({ input }) => {
      const list = await db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, input.userId),
            eq(sessions.userType, input.userType),
          ),
        )
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
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const { limit = 50 } = input ?? {};
      const activeSessions = await db
        .select()
        .from(sessions)
        .orderBy(desc(sessions.createdAt))
        .limit(limit);

      const oauthIds = [
        ...new Set(
          activeSessions
            .filter((s) => s.userType === "oauth")
            .map((s) => s.userId),
        ),
      ];
      const localIds = [
        ...new Set(
          activeSessions
            .filter((s) => s.userType === "local")
            .map((s) => s.userId),
        ),
      ];

      const oauthRows =
        oauthIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(inArray(users.id, oauthIds))
          : [];
      const localRows =
        localIds.length > 0
          ? await db
              .select({ id: localUsers.id, name: localUsers.name })
              .from(localUsers)
              .where(inArray(localUsers.id, localIds))
          : [];

      const nameByKey = new Map<string, string>();
      for (const r of oauthRows) nameByKey.set(`oauth:${r.id}`, r.name);
      for (const r of localRows) nameByKey.set(`local:${r.id}`, r.name);

      return activeSessions.map((s) => ({
        id: s.id,
        userName: nameByKey.get(`${s.userType}:${s.userId}`) || "مجهول",
        userType: s.userType,
        ipAddress: s.ipAddress || "غير متوفر",
        userAgent: s.userAgent || "غير متوفر",
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      }));
    }),

  // ─── AI System Settings (Professional) ───
  getSettings: adminProcedure.query(async () => {
    const settings = await db.select().from(systemSettings);
    const config: Record<string, string> = {
      // ── Gemini API Keys ──
      ai_api_key: env.GEMINI_API_KEY || "",
      ai_api_key_2: "",
      // ── Groq API Key (جديد) ──
      groq_api_key: "",
      // ── Legacy model selectors (used for reports + ultra fallback) ──
      ai_model_free: env.GEMINI_MODEL_FREE || "gemini-2.0-flash",
      ai_model_pro: env.GEMINI_MODEL_PRO || "gemini-1.5-flash",
      ai_model_ultra: "gemini-1.5-pro",
      ai_model_reports: env.GEMINI_MODEL_REPORTS || "gemini-1.5-flash",
      // ── Dynamic Token Routing Ranges (JSON arrays) ──
      // Each range: { from, to, provider, key_slot, model } or { from, to, action, message }
      free_routing_ranges: JSON.stringify([
        {
          from: 0,
          to: 20000,
          provider: "groq",
          key_slot: "groq",
          model: "llama-3.1-8b-instant",
        },
        {
          from: 20000,
          to: 50000,
          provider: "gemini",
          key_slot: "key1",
          model: "gemini-2.0-flash",
        },
        {
          from: 50000,
          to: null,
          action: "block",
          message:
            "استهلكت رصيدك الشهري من الذكاء الاصطناعي 🔒\nيتجدد تلقائياً في بداية الشهر الجاي، أو رقّي لباقة Pro للحصول على حد أعلى!",
        },
      ]),
      pro_routing_ranges: JSON.stringify([
        {
          from: 0,
          to: 150000,
          provider: "groq",
          key_slot: "groq",
          model: "llama-3.3-70b-versatile",
        },
        {
          from: 150000,
          to: 500000,
          provider: "gemini",
          key_slot: "key1",
          model: "gemini-1.5-pro",
        },
        {
          from: 500000,
          to: null,
          action: "block",
          message:
            "وصلت لحد باقة Pro الشهري 🔒\nيتجدد تلقائياً في بداية الشهر الجاي.",
        },
      ]),
      // ── Token Limits (total monthly per plan) ──
      free_token_limit: "50000",
      pro_token_limit: "500000",
      ultra_token_limit: "2000000",
      // ── Daily limits (requests per day) ──
      free_daily_limit: "10",
      pro_daily_limit: "100",
      ultra_daily_limit: "500",
      // ── Per-request max tokens ──
      free_max_per_request: "256",
      pro_max_per_request: "512",
      ultra_max_per_request: "1024",
      // ── Feature toggles ──
      free_ai_analysis: "false",
      pro_ai_analysis: "true",
      ultra_ai_analysis: "true",
      free_ai_parse: "true",
      pro_ai_parse: "true",
      ultra_ai_parse: "true",
      // ── Voice / STT limits ──
      voice_limit_free: "300",
      voice_limit_pro: "1800",
      voice_limit_ultra: "0",
      voice_per_req_free: "60",
      voice_per_req_pro: "180",
      voice_per_req_ultra: "300",
      // ── Per-plan STT Configuration (جديد) ──
      free_stt_provider: "gemini",
      free_stt_model: "gemini-3.5-flash",
      free_stt_key_slot: "key1",
      pro_stt_provider: "gemini",
      pro_stt_model: "gemini-2.5-flash",
      pro_stt_key_slot: "key1",
      // ── Legacy STT fields (kept for backward compat) ──
      stt_api_key: "",
      stt_api_key_2: "",
      stt_model: "gemini-1.5-flash",
      stt_fallback_model: "gemini-2.0-flash",
      stt_processing_mode: "standard",
      // ── Per-plan Report Configuration ──
      report_provider_free: "gemini",
      report_model_free: "gemini-1.5-flash",
      report_key_slot_free: "key1",
      report_provider_pro: "gemini",
      report_model_pro: "gemini-1.5-pro",
      report_key_slot_pro: "key1",
      // ── Confidence Thresholds ──
      confidence_auto_save: "85",
      confidence_review: "60",
      // ── AI Response / Prompt Settings ──
      ai_response_length: "medium",
      ai_focus: "balanced",
      ai_system_prompt:
        "[Persona] مستشار مالي مصري ذكي ومتعاطف. لغتك عامية مصرية راقية ومبسطة، وتتحدث وكأنك إنسان حقيقي.\n[Rules]\n1. لا تستخدم العناوين الآلية (مثل التطبيع أو السببية).\n2. واجه المستخدم بالأرقام الحقيقية.\n3. قدم نصائح عملية مصممة خصيصاً للمستخدم بناءً على سلوكه المالي.",
      ai_advanced_instructions: "",
      ai_report_structure_override: "",
      // ── Report Frequency (days between reports) ──
      report_limit_free: "30",
      report_limit_pro: "14",
      report_limit_ultra: "1",
      // ── Report Word Counts ──
      report_words_free: "550",
      report_words_pro: "850",
      report_words_ultra: "1500",
      // ── Report Max Output Tokens ──
      report_max_tokens_free: "1800",
      report_max_tokens_pro: "3500",
      report_max_tokens_ultra: "8192",
      // ── Report Data Saturation ──
      report_subcats_free: "15",
      report_subcats_pro: "20",
      report_subcats_ultra: "20",
      report_top_items_pro: "10",
      report_top_items_ultra: "10",
      // ── SMS Limits ──
      sms_limit_free: "5",
      sms_limit_pro: "999999",
      sms_limit_ultra: "999999",
      // ── Referrals ──
      promo_code_discount: "20",
      // ── Pipeline Version (v1 or v2) ──
      pipeline_version: "v1",
    };

    settings.forEach((s) => {
      if (s.value) config[s.key] = s.value;
    });

    return config;
  }),

  updateSettings: adminProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(async ({ input }) => {
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== null) {
          await db
            .insert(systemSettings)
            .values({ key, value })
            .onDuplicateKeyUpdate({ set: { value } });
        }
      }
      return { success: true, message: "تم تحديث الإعدادات بنجاح" };
    }),

  // ─── Update User Plan (with Ultra) ───
  updateUserPlanV2: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        userType: z.enum(["oauth", "local"]),
        plan: z.enum(["free", "pro", "ultra"]),
      }),
    )
    .mutation(async ({ input }) => {
      const table = input.userType === "oauth" ? users : localUsers;
      await db
        .update(table)
        .set({ plan: input.plan })
        .where(eq(table.id, input.userId));
      return { success: true, message: "تم تحديث الخطة بنجاح" };
    }),

  // ─── Reset User Tokens ───
  resetUserTokens: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        userType: z.enum(["oauth", "local"]),
      }),
    )
    .mutation(async ({ input }) => {
      const table = input.userType === "oauth" ? users : localUsers;
      await db
        .update(table)
        .set({ aiTokensUsed: 0 })
        .where(eq(table.id, input.userId));
      return { success: true, message: "تم إعادة تعيين التوكنز" };
    }),

  getAvailableModels: adminProcedure.query(async () => {
    return {
      models: [
        // ── Gemini Models ──
        {
          id: "gemini-3.5-flash",
          name: "Gemini 3.5 Flash",
          provider: "gemini",
          tier: "free",
          pricing: "مجاني / Free Tier",
          description:
            "أحدث الموديلات السريعة الفائقة لتحويل الصوت والتصنيف",
        },
        {
          id: "gemini-3.1-flash-lite",
          name: "Gemini 3.1 Flash-Lite",
          provider: "gemini",
          tier: "free",
          pricing: "مجاني / Free Tier",
          description: "سريع واقتصادي للغاية - مثالي للمهام السريعة",
        },
        {
          id: "gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          provider: "gemini",
          tier: "free",
          pricing: "$0.075/$0.30 /1M",
          description: "أداء سريع واقتصادي - للمهام البسيطة",
        },
        {
          id: "gemini-2.5-pro",
          name: "Gemini 2.5 Pro",
          provider: "gemini",
          tier: "pro",
          pricing: "ذكي للغاية ودقيق",
          description: "نموذج احترافي عالي الدقة للمهام الحسابية والتقارير",
        },
        {
          id: "gemini-2.0-flash-lite",
          name: "Gemini 2.0 Flash-Lite",
          provider: "gemini",
          tier: "free",
          pricing: "خفيف وسريع",
          description: "موديل خفيف وسريع جداً",
        },
        {
          id: "gemini-2.0-flash",
          name: "Gemini 2.0 Flash",
          provider: "gemini",
          tier: "free",
          pricing: "$0.10/$0.40 /1M",
          description: "سريع وقوي",
        },
        // ── Groq Models ──
        {
          id: "whisper-large-v3",
          name: "Whisper Large V3 (Groq)",
          provider: "groq",
          tier: "free",
          pricing: "مجاني / Free",
          description: "المحرك الصوتي الفائق لتحويل الصوت لنص",
        },
        {
          id: "whisper-large-v3-turbo",
          name: "Whisper V3 Turbo (Groq)",
          provider: "groq",
          tier: "free",
          pricing: "مجاني / Free",
          description: "المحرك الصوتي الأسرع لتحويل الصوت لنص",
        },
        {
          id: "llama-3.1-8b-instant",
          name: "Llama 3.1 8B Instant",
          provider: "groq",
          tier: "free",
          pricing: "$0.05/$0.08 /1M",
          description: "الأسرع والأرخص - ينصح لأول نطاق Free",
        },
        {
          id: "llama-3.3-70b-versatile",
          name: "Llama 3.3 70B Versatile",
          provider: "groq",
          tier: "pro",
          pricing: "$0.59/$0.79 /1M",
          description: "متوازن وقوي - ينصح لباقة Pro",
        },
        {
          id: "deepseek-r1-distill-llama-70b",
          name: "DeepSeek R1 Distill (Groq)",
          provider: "groq",
          tier: "free",
          pricing: "مجاني / Free",
          description: "מודيل تفكير قوي وسريع للتحليل المعقد",
        },
        {
          id: "qwen/qwen3-32b",
          name: "Qwen3 32B (Groq)",
          provider: "groq",
          tier: "pro",
          pricing: "$0.29/$0.59 /1M",
          description: "قوي وأرخص من 70B",
        },
        {
          id: "gemma2-9b-it",
          name: "Gemma2 9B (Groq)",
          provider: "groq",
          tier: "free",
          pricing: "$0.20/$0.20 /1M",
          description: "مفتوح المصدر على Groq",
        },
        {
          id: "openai/gpt-oss-120b",
          name: "GPT-OSS 120B (Groq)",
          provider: "groq",
          tier: "ultra",
          pricing: "مخصص",
          description: "الأقوى على Groq - للحالات الصعبة",
        },
        {
          id: "openai/gpt-oss-20b",
          name: "GPT-OSS 20B (Groq)",
          provider: "groq",
          tier: "pro",
          pricing: "$0.40/$0.60 /1M",
          description: "موديل ممتاز للتصنيف مفتوح المصدر",
        },
      ],
    };
  }),

  // ─── AI Classification Stats ───
  getAIClassificationStats: adminProcedure.query(async () => {
    let stats: any[] = [];
    let totalLogs: Array<{ count: number }> = [{ count: 0 }];

    try {
      stats = await db
        .select({
          parsedBy: classificationLogs.parsedBy,
          count: count(),
          avgConfidence: sql`AVG(${classificationLogs.confidence})`,
          totalTokens: sql`SUM(${classificationLogs.tokensUsed})`,
        })
        .from(classificationLogs)
        .groupBy(classificationLogs.parsedBy);

      totalLogs = await db.select({ count: count() }).from(classificationLogs);
    } catch (err) {
      if (!isMissingTableError(err, "classification_logs")) throw err;
    }

    return {
      stats,
      totalClassifications: totalLogs[0]?.count ?? 0,
    };
  }),

  // ─── V2 Pipeline Accuracy Comparison ───
  getV2PipelineStats: adminProcedure.query(async () => {
    try {
      // v1 stats (classificationVersion = 'v2.1')
      const v1Stats = await db
        .select({
          count: count(),
          avgConfidence: sql`ROUND(AVG(${classificationLogs.confidence}), 1)`,
          avgTokens: sql`ROUND(AVG(${classificationLogs.tokensUsed}), 0)`,
          avgTimeMs: sql`ROUND(AVG(${classificationLogs.processingTimeMs}), 0)`,
          totalTokens: sql`COALESCE(SUM(${classificationLogs.tokensUsed}), 0)`,
          needsFollowupCount: sql`SUM(CASE WHEN ${classificationLogs.needsFollowup} = true THEN 1 ELSE 0 END)`,
        })
        .from(classificationLogs)
        .where(eq(classificationLogs.classificationVersion, "v2.1"));

      // v2 stats (classificationVersion = 'v2.2')
      const v2Stats = await db
        .select({
          count: count(),
          avgConfidence: sql`ROUND(AVG(${classificationLogs.confidence}), 1)`,
          avgTokens: sql`ROUND(AVG(${classificationLogs.tokensUsed}), 0)`,
          avgTimeMs: sql`ROUND(AVG(${classificationLogs.processingTimeMs}), 0)`,
          totalTokens: sql`COALESCE(SUM(${classificationLogs.tokensUsed}), 0)`,
          needsFollowupCount: sql`SUM(CASE WHEN ${classificationLogs.needsFollowup} = true THEN 1 ELSE 0 END)`,
        })
        .from(classificationLogs)
        .where(eq(classificationLogs.classificationVersion, "v2.2"));

      // v2 breakdown by parsedBy
      const v2ByMethod = await db
        .select({
          parsedBy: classificationLogs.parsedBy,
          count: count(),
          avgConfidence: sql`ROUND(AVG(${classificationLogs.confidence}), 1)`,
        })
        .from(classificationLogs)
        .where(eq(classificationLogs.classificationVersion, "v2.2"))
        .groupBy(classificationLogs.parsedBy);

      // Current pipeline version
      const pvRow = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, "pipeline_version"))
        .limit(1);
      const currentVersion = pvRow[0]?.value || "v1";

      return {
        currentPipelineVersion: currentVersion,
        v1: {
          totalClassifications: Number(v1Stats[0]?.count ?? 0),
          avgConfidence: Number(v1Stats[0]?.avgConfidence ?? 0),
          avgTokensPerCall: Number(v1Stats[0]?.avgTokens ?? 0),
          avgProcessingTimeMs: Number(v1Stats[0]?.avgTimeMs ?? 0),
          totalTokensUsed: Number(v1Stats[0]?.totalTokens ?? 0),
          needsFollowupRate: v1Stats[0]?.count
            ? Math.round(
                (Number(v1Stats[0]?.needsFollowupCount ?? 0) /
                  Number(v1Stats[0]?.count)) *
                  100,
              )
            : 0,
        },
        v2: {
          totalClassifications: Number(v2Stats[0]?.count ?? 0),
          avgConfidence: Number(v2Stats[0]?.avgConfidence ?? 0),
          avgTokensPerCall: Number(v2Stats[0]?.avgTokens ?? 0),
          avgProcessingTimeMs: Number(v2Stats[0]?.avgTimeMs ?? 0),
          totalTokensUsed: Number(v2Stats[0]?.totalTokens ?? 0),
          needsFollowupRate: v2Stats[0]?.count
            ? Math.round(
                (Number(v2Stats[0]?.needsFollowupCount ?? 0) /
                  Number(v2Stats[0]?.count)) *
                  100,
              )
            : 0,
          byMethod: v2ByMethod.map((m) => ({
            method: m.parsedBy,
            count: Number(m.count),
            avgConfidence: Number(m.avgConfidence),
          })),
        },
      };
    } catch (err) {
      if (!isMissingTableError(err, "classification_logs")) throw err;
      return {
        currentPipelineVersion: "v1",
        v1: {
          totalClassifications: 0,
          avgConfidence: 0,
          avgTokensPerCall: 0,
          avgProcessingTimeMs: 0,
          totalTokensUsed: 0,
          needsFollowupRate: 0,
        },
        v2: {
          totalClassifications: 0,
          avgConfidence: 0,
          avgTokensPerCall: 0,
          avgProcessingTimeMs: 0,
          totalTokensUsed: 0,
          needsFollowupRate: 0,
          byMethod: [],
        },
      };
    }
  }),

  // ─── Get Classification Logs ───
  getClassificationLogs: moderatorProcedure
    .input(
      z
        .object({
          page: z.number().default(1),
          limit: z.number().default(20),
          parsedBy: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { page = 1, limit = 20, parsedBy } = input ?? {};
      const offset = (page - 1) * limit;

      let logs: any[] = [];
      let total: Array<{ count: number }> = [{ count: 0 }];

      try {
        let query = db.select().from(classificationLogs).$dynamic();
        if (parsedBy)
          query = query.where(eq(classificationLogs.parsedBy, parsedBy));

        logs = await query
          .orderBy(desc(classificationLogs.createdAt))
          .limit(limit)
          .offset(offset);

        total = await db.select({ count: count() }).from(classificationLogs);
      } catch (err) {
        if (!isMissingTableError(err, "classification_logs")) throw err;
      }

      const oauthLogIds = [
        ...new Set(
          logs.filter((l) => l.userType === "oauth").map((l) => l.userId),
        ),
      ];
      const localLogIds = [
        ...new Set(
          logs.filter((l) => l.userType === "local").map((l) => l.userId),
        ),
      ];

      const oauthNameRows =
        oauthLogIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name, plan: users.plan })
              .from(users)
              .where(inArray(users.id, oauthLogIds))
          : [];
      const localNameRows =
        localLogIds.length > 0
          ? await db
              .select({
                id: localUsers.id,
                name: localUsers.name,
                plan: localUsers.plan,
              })
              .from(localUsers)
              .where(inArray(localUsers.id, localLogIds))
          : [];

      const logUserMap = new Map<string, { name: string; plan: string }>();
      for (const r of oauthNameRows)
        logUserMap.set(`oauth:${r.id}`, {
          name: r.name,
          plan: r.plan ?? "free",
        });
      for (const r of localNameRows)
        logUserMap.set(`local:${r.id}`, {
          name: r.name,
          plan: r.plan ?? "free",
        });

      const enriched = logs.map((l) => {
        const userInfo = logUserMap.get(`${l.userType}:${l.userId}`) || {
          name: "مجهول",
          plan: "free",
        };
        return {
          ...l,
          userName: userInfo.name,
          userPlan: userInfo.plan,
        };
      });

      return {
        logs: enriched,
        total: total[0]?.count ?? 0,
        page,
        limit,
      };
    }),

  // ─── Get Voice Usage Stats ───
  getVoiceUsageStats: adminProcedure.query(async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);

    let usage: any[] = [];
    try {
      usage = await db
        .select({
          userType: voiceUsage.userType,
          totalSeconds: sum(voiceUsage.durationSeconds),
          count: count(),
        })
        .from(voiceUsage)
        .where(eq(voiceUsage.month, currentMonth))
        .groupBy(voiceUsage.userType);
    } catch (err) {
      if (!isMissingTableError(err, "voice_usage")) throw err;
    }

    return {
      month: currentMonth,
      usage,
    };
  }),

  // ─── Discount Codes CRUD ───
  getDiscountCodes: adminProcedure.query(async () => {
    return await db
      .select()
      .from(discountCodes)
      .orderBy(desc(discountCodes.createdAt));
  }),

  createDiscountCode: adminProcedure
    .input(
      z.object({
        code: z.string().min(3).max(50),
        type: z.enum(["referral", "promo"]).default("promo"),
        discountPercent: z.number().min(1).max(100),
        maxUses: z.number().min(0).optional(),
        expiresAt: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await db
        .select()
        .from(discountCodes)
        .where(eq(discountCodes.code, input.code.toUpperCase()))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "الكود موجود بالفعل",
        });
      }
      await db.insert(discountCodes).values({
        code: input.code.toUpperCase(),
        type: input.type,
        discountPercent: input.discountPercent,
        maxUses: input.maxUses || null,
        usedCount: 0,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
      return { success: true, message: "تم إنشاء الكود بنجاح" };
    }),

  deleteDiscountCode: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(discountCodes).where(eq(discountCodes.id, input.id));
      return { success: true, message: "تم حذف الكود" };
    }),

  /** Founder / ops: DAU, Pro subs, token burn estimate */
  getFounderMetrics: adminProcedure.query(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const safeCount = async (
      run: () => Promise<{ count?: number | null }[]>,
      fallback = 0,
    ) => {
      try {
        const rows = await run();
        return Number(rows[0]?.count ?? 0);
      } catch (err) {
        console.warn("getFounderMetrics partial failure:", err);
        return fallback;
      }
    };

    const dau = await safeCount(() =>
      db
        .select({
          count: sql<number>`COUNT(DISTINCT CONCAT(${sessions.userType}, ':', ${sessions.userId}))`,
        })
        .from(sessions)
        .where(gte(sessions.createdAt, today)),
    );

    const wau = await safeCount(() =>
      db
        .select({
          count: sql<number>`COUNT(DISTINCT CONCAT(${sessions.userType}, ':', ${sessions.userId}))`,
        })
        .from(sessions)
        .where(gte(sessions.createdAt, weekAgo)),
    );

    const newProSubs7d = await safeCount(() =>
      db
        .select({ count: count() })
        .from(proSubscriptions)
        .where(
          and(
            eq(proSubscriptions.status, "active"),
            gte(proSubscriptions.createdAt, weekAgo),
          ),
        ),
    );

    const activeProSubs = await safeCount(() =>
      db
        .select({ count: count() })
        .from(proSubscriptions)
        .where(eq(proSubscriptions.status, "active")),
    );

    let tokenTotal = 0;
    try {
      const oauthTok = await db
        .select({ sum: sql<number>`COALESCE(SUM(${users.aiTokensUsed}), 0)` })
        .from(users);
      const localTok = await db
        .select({
          sum: sql<number>`COALESCE(SUM(${localUsers.aiTokensUsed}), 0)`,
        })
        .from(localUsers);
      tokenTotal =
        Number(oauthTok[0]?.sum ?? 0) + Number(localTok[0]?.sum ?? 0);
    } catch (err) {
      console.warn("getFounderMetrics token sum failed:", err);
    }

    const upgradeEvents = await safeCount(() =>
      db
        .select({ count: count() })
        .from(userAnalytics)
        .where(eq(userAnalytics.event, "upgrade_to_pro")),
    );

    const openTickets = await safeCount(() =>
      db
        .select({ count: count() })
        .from(supportTickets)
        .where(eq(supportTickets.status, "open")),
    );

    return {
      dau,
      wau,
      newProSubs7d,
      activeProSubs,
      estimatedTokensUsed: tokenTotal,
      upgradeEvents,
      openTickets,
    };
  }),

  setUserTokenLimit: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        userType: z.enum(["oauth", "local"]),
        monthlyTokenLimit: z.number().min(0).max(10_000_000),
      }),
    )
    .mutation(async ({ input }) => {
      const key = `user_token_limit_${input.userType}_${input.userId}`;
      const existing = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);
      if (existing[0]) {
        await db
          .update(systemSettings)
          .set({ value: String(input.monthlyTokenLimit) })
          .where(eq(systemSettings.key, key));
      } else {
        await db
          .insert(systemSettings)
          .values({ key, value: String(input.monthlyTokenLimit) });
      }
      return { success: true, key, limit: input.monthlyTokenLimit };
    }),

  listSubscriptionsAdmin: adminProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(30),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { status, page = 1, limit = 30 } = input ?? {};
      const offset = (page - 1) * limit;
      let q = db
        .select()
        .from(proSubscriptions)
        .$dynamic()
        .orderBy(desc(proSubscriptions.createdAt));
      if (status) q = q.where(eq(proSubscriptions.status, status));
      const list = await q.limit(limit).offset(offset);
      const total = await db.select({ count: count() }).from(proSubscriptions);
      return { list, total: total[0]?.count ?? 0, page, limit };
    }),

  // ─── API Key Error Monitoring ───
  getApiKeyErrors: moderatorProcedure
    .input(
      z
        .object({
          unresolvedOnly: z.boolean().default(false),
          limit: z.number().default(100),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { unresolvedOnly = false, limit = 100 } = input ?? {};
      try {
        return await fetchApiKeyErrors({ unresolvedOnly, limit });
      } catch (err: any) {
        // If table doesn't exist yet, return empty
        if (
          err?.message?.includes("doesn't exist") ||
          err?.message?.includes("no such table")
        ) {
          return [];
        }
        throw err;
      }
    }),



  getPendingClarifications: adminProcedure.query(async () => {
    return await db.select().from(pendingClarifications).orderBy(desc(pendingClarifications.createdAt));
  }),

  resolveClarification: adminProcedure
    .input(z.object({ id: z.number(), status: z.enum(["resolved", "ignored"]) }))
    .mutation(async ({ input }) => {
      await db.update(pendingClarifications).set({ status: input.status, updatedAt: new Date() }).where(eq(pendingClarifications.id, input.id));
      return { success: true };
    }),

  resolveApiKeyError: adminProcedure
    .input(z.object({ errorId: z.number() }))
    .mutation(async ({ input }) => {
      await resolveError(input.errorId);
      return { success: true };
    }),

  clearAllApiKeyErrors: adminProcedure.mutation(async () => {
    await resolveAllApiKeyErrors();
    return { success: true, message: "تم حل جميع الأخطاء بنجاح" };
  }),

  // ─── Test/Validate API Key ───
  validateApiKey: adminProcedure
    .input(
      z.object({
        provider: z.enum(["gemini", "groq"]),
        apiKey: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        if (input.provider === "gemini") {
          // Light validation: call Gemini list models endpoint
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${input.apiKey}`,
            { method: "GET", signal: AbortSignal.timeout(10000) },
          );
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            const errorType = classifyApiError(res.status, body);
            return {
              valid: false,
              status: res.status,
              errorType,
              message: body.substring(0, 300),
            };
          }
          return {
            valid: true,
            status: 200,
            errorType: null,
            message: "المفتاح يعمل بشكل سليم ✅",
          };
        } else {
          // Groq: call /v1/models
          const res = await fetch("https://api.groq.com/openai/v1/models", {
            method: "GET",
            headers: { Authorization: `Bearer ${input.apiKey}` },
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            const errorType = classifyApiError(res.status, body);
            return {
              valid: false,
              status: res.status,
              errorType,
              message: body.substring(0, 300),
            };
          }
          return {
            valid: true,
            status: 200,
            errorType: null,
            message: "المفتاح يعمل بشكل سليم ✅",
          };
        }
      } catch (err: any) {
        const errorType = classifyApiError(undefined, err?.message || "");
        return {
          valid: false,
          status: 0,
          errorType,
          message: err?.message?.substring(0, 300) || "خطأ غير متوقع",
        };
      }
    }),

  // ─── Get Learned Rules (Muscle Memory / Auto-Learning) ───
  getLearnedRules: moderatorProcedure
    .input(
      z
        .object({
          page: z.number().default(1),
          limit: z.number().default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { page = 1, limit = 50 } = input ?? {};
      const offset = (page - 1) * limit;

      const rules = await db
        .select()
        .from(userDictionaries)
        .orderBy(desc(userDictionaries.createdAt))
        .limit(limit)
        .offset(offset);

      const total = await db.select({ count: count() }).from(userDictionaries);

      const oauthIds = [
        ...new Set(
          rules.filter((r) => r.userType === "oauth").map((r) => r.userId),
        ),
      ];
      const localIds = [
        ...new Set(
          rules.filter((r) => r.userType === "local").map((r) => r.userId),
        ),
      ];

      const oauthNameRows =
        oauthIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(inArray(users.id, oauthIds))
          : [];
      const localNameRows =
        localIds.length > 0
          ? await db
              .select({ id: localUsers.id, name: localUsers.name })
              .from(localUsers)
              .where(inArray(localUsers.id, localIds))
          : [];

      const userMap = new Map<string, string>();
      for (const r of oauthNameRows) userMap.set(`oauth:${r.id}`, r.name);
      for (const r of localNameRows) userMap.set(`local:${r.id}`, r.name);

      const enriched = rules.map((r) => ({
        ...r,
        userName: userMap.get(`${r.userType}:${r.userId}`) || "مجهول",
      }));

      return {
        rules: enriched,
        total: total[0]?.count ?? 0,
        page,
        limit,
      };
    }),

  // ─── Delete Learned Rule ───
  deleteLearnedRule: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db
        .delete(userDictionaries)
        .where(eq(userDictionaries.id, input.id));
      return { success: true, message: "تم حذف القاعدة بنجاح" };
    }),

  // ─── Send Push Notifications ───
  sendPushNotification: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        target: z.enum(["all", "free", "pro", "specific"]),
        specificUserId: z.number().optional(),
        specificUserType: z.enum(["oauth", "local"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      let subsToNotify: any[] = [];
      const allSubs = await db.select().from(pushSubscriptions);

      if (input.target === "all") {
        subsToNotify = allSubs;
      } else if (
        input.target === "specific" &&
        input.specificUserId &&
        input.specificUserType
      ) {
        subsToNotify = allSubs.filter(
          (s) =>
            s.userId === input.specificUserId &&
            s.userType === input.specificUserType,
        );
      } else {
        // We need to filter by plan (free or pro)
        // Fetch users plans
        const oauthUsersList = await db
          .select({ id: users.id, plan: users.plan })
          .from(users);
        const localUsersList = await db
          .select({ id: localUsers.id, plan: localUsers.plan })
          .from(localUsers);
        const planMap = new Map<string, string>();
        oauthUsersList.forEach((u) =>
          planMap.set(`oauth:${u.id}`, u.plan || "free"),
        );
        localUsersList.forEach((u) =>
          planMap.set(`local:${u.id}`, u.plan || "free"),
        );

        subsToNotify = allSubs.filter((s) => {
          const plan = planMap.get(`${s.userType}:${s.userId}`) || "free";
          return input.target === "free" ? plan === "free" : plan !== "free";
        });
      }

      const payload = JSON.stringify({
        title: input.title,
        body: input.body,
        icon: "/icons/icon-192x192.png", // Assume PWA icon exists here
        badge: "/icons/icon-192x192.png",
      });

      let successCount = 0;
      let failureCount = 0;

      await Promise.all(
        subsToNotify.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payload,
            );
            successCount++;
          } catch (err: any) {
            console.error("Push Error", err);
            failureCount++;
            // If the subscription is invalid, we could delete it here
            if (err.statusCode === 410 || err.statusCode === 404) {
              await db
                .delete(pushSubscriptions)
                .where(eq(pushSubscriptions.id, sub.id));
            }
          }
        }),
      );

      return {
        success: true,
        message: `تم الإرسال لـ ${successCount} جهاز، وفشل الإرسال لـ ${failureCount} جهاز.`,
      };
    }),
});
