import { z } from "zod";
import { SMART_PIPELINE_VERSION } from "./lib/smart-pipeline";
import { router, adminProcedure, moderatorProcedure } from "./middleware";
import { db, getPoolMetrics } from "./queries/connection";
import { getSystemSettings, invalidateSettingsCache } from "./lib/settings-cache";
import { getCacheRuntimeStatus } from "./lib/redis-client";
import { businessDateKey } from "./lib/app-time";
import { bumpAuthVersion } from "./lib/session-validation";
import {
  users,
  localUsers,
  expenses,
  expenseDailyRollups,
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
  onboardingQuestions,
  ads,
  notificationTemplates,
  notificationLogs,
  aiProviders,
  aiModels,
  aiTokenLedgers,
} from "../db/schema";
import {
  encryptApiKey,
  decryptApiKey,
  discoverRemoteModels,
  refreshGatewayCache,
  resolveBillingPeriod,
} from "./lib/ai-gateway";
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
import {
  SETTING_KEYS,
  isMaskedValue,
  maskSettingsForClient,
  settingDefaults,
} from "./lib/system-settings-registry";
import { BUILTIN_BASE_URLS } from "./lib/llm-provider-chain";
import { getSmartProfile } from "./services/user-profile-service";
import { loadAICostOverview } from "./services/ai-cost-analytics";
import webpush from "web-push";
import { sendPush, checkAndTriggerSmartActivityNotifications } from "./notification-engine";
import { purgeUserData } from "./services/user-purge-service";

// Setup Web Push
// In a real app these should be in env vars, but we'll use the ones generated earlier
const vapidPublicKey =
  process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey =
  process.env.VAPID_PRIVATE_KEY || "";
if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(
      "mailto:admin@smartspend.ai",
      vapidPublicKey,
      vapidPrivateKey,
    );
  } catch (error) {
    console.warn("⚠️ Failed to set VAPID details in admin-router.ts:", error);
  }
} else {
  console.warn("⚠️ VAPID keys not configured — push notifications will not work.");
}

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

    // Optimized from expenseDailyRollups (§P8 / STORAGE_OVERHAUL_REPORT)
    const todayKey = businessDateKey();
    const [rollupTotals] = await db
      .select({
        totalCount: sql<number>`COALESCE(SUM(${expenseDailyRollups.txnCount}), 0)`,
        totalAmount: sql<string>`COALESCE(SUM(${expenseDailyRollups.expense}), 0)`,
      })
      .from(expenseDailyRollups);

    const [todayTotals] = await db
      .select({
        todayAmount: sql<string>`COALESCE(SUM(${expenseDailyRollups.expense}), 0)`,
      })
      .from(expenseDailyRollups)
      .where(eq(expenseDailyRollups.day, todayKey));

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
      totalExpenses: Number(rollupTotals?.totalCount ?? 0),
      totalAmount: String(rollupTotals?.totalAmount ?? "0"),
      todayExpenses: String(todayTotals?.todayAmount ?? "0"),
      activeSessions: activeSessions[0]?.count ?? 0,
      openTickets: openTickets[0]?.count ?? 0,
      proUsers: (proUsers[0]?.count ?? 0) + (proLocalUsers[0]?.count ?? 0),
    };
  }),

  // ─── Storage Runtime Metrics (§P8) ───
  getStorageRuntimeMetrics: adminProcedure.query(async () => {
    const cache = getCacheRuntimeStatus();
    const pool = getPoolMetrics();
    return {
      cache,
      pool,
      timestamp: new Date().toISOString(),
    };
  }),

  // ─── List All Users ───
  getAICostOverview: adminProcedure
    .input(
      z
        .object({
          userId: z.number().int().positive().optional(),
          userType: z.enum(["oauth", "local"]).optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          limit: z.number().int().min(1).max(10000).default(1000),
        })
        .optional(),
    )
    .query(async ({ input }) =>
      loadAICostOverview({
        userId: input?.userId,
        userType: input?.userType,
        from: input?.from ? new Date(input.from) : undefined,
        to: input?.to ? new Date(input.to) : undefined,
        limit: input?.limit,
      }),
    ),

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

      // 1. Get total counts efficiently
      const [oauthCountResult] = await db
        .select({ count: count() })
        .from(users)
        .where(oauthFilters.length ? and(...oauthFilters) : undefined);
      const [localCountResult] = await db
        .select({ count: count() })
        .from(localUsers)
        .where(localFilters.length ? and(...localFilters) : undefined);
      const total = oauthCountResult.count + localCountResult.count;

      // 2. Fetch only up to offset + limit from both tables
      const fetchLimit = offset + limit;
      
      const [oauthUsersChunk, localUsersChunk] = await Promise.all([
        oauthQuery.orderBy(desc(users.createdAt)).limit(fetchLimit),
        localQuery.orderBy(desc(localUsers.createdAt)).limit(fetchLimit),
      ]);

      const merged = [
        ...oauthUsersChunk.map((u) => ({ ...u, userType: "oauth" as const })),
        ...localUsersChunk.map((u) => ({ ...u, userType: "local" as const })),
      ];

      // 3. Sort the combined chunk by date descending
      merged.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

      // 4. Slice the exact page window
      const paged = merged.slice(offset, offset + limit);

      const oauthIds = paged.filter((u) => u.userType === "oauth").map((u) => u.id);
      const localIds = paged.filter((u) => u.userType === "local").map((u) => u.id);

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

      const enriched = paged.map((u) => {
        const s = statMap.get(`${u.userType}:${u.id}`);
        return {
          ...u,
          expenseCount: s?.expenseCount ?? 0,
          totalSpent: s?.totalSpent ?? "0",
        };
      });

      return {
        users: enriched,
        total,
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
      await bumpAuthVersion(input.userType, input.userId);
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
      await bumpAuthVersion(input.userType, input.userId);
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

      await db.transaction(async (tx) => {
        await purgeUserData(tx, userId, userType);
      });

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
    const settings = await getSystemSettings();
    // Defaults come from the registry, so a key the UI can edit is a key the server
    // knows about — the two lists cannot drift apart because there is only one.
    const config: Record<string, string> = settingDefaults();

    for (const [key, value] of Object.entries(settings)) {
      if (value) config[key] = value;
    }

    // Secrets leave as dots plus the last four characters. This response used to carry
    // every production API key in cleartext to the browser.
    return maskSettingsForClient(config);
  }),

  updateSettings: adminProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(async ({ input }) => {
      // The allowlist IS the registry. Eight keys the UI renders (nvidia_api_key,
      // chatbot_*, rag_*, enable_rag) were absent from the hand-written set this
      // replaces: the admin saw "saved" and the value was dropped on the floor.
      const allowedKeys = SETTING_KEYS;

      for (const [key, value] of Object.entries(input)) {
        if (!allowedKeys.has(key)) {
          console.warn(`[Admin] Rejected unknown setting key: ${key}`);
          continue;
        }
        // The client was sent dots for this key and has sent the dots back, which means
        // the admin did not touch the field. Writing it would replace a working API key
        // with the literal string "••••••••" — masking the response would otherwise turn
        // "edit one unrelated setting and save" into a site-wide outage.
        if (isMaskedValue(value)) {
          continue;
        }
        if (value !== undefined && value !== null) {
          await db
            .insert(systemSettings)
            .values({ key, value })
            .onDuplicateKeyUpdate({ set: { value } });
        }
      }
      invalidateSettingsCache();
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
      await bumpAuthVersion(input.userType, input.userId);
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
    // 1. Fetch configured API key from database or env
    let apiKey = env.GEMINI_API_KEY || "";
    try {
      const cfg = await getSystemSettings();
      if (cfg.ai_api_key && cfg.ai_api_key !== "YOUR_GEMINI_API_KEY") {
        apiKey = cfg.ai_api_key;
      } else if (cfg.ai_api_key_2) {
        apiKey = cfg.ai_api_key_2;
      }
    } catch (err) {
      console.warn("Failed to load api key from DB, using env fallback:", err);
    }

    const fallbackGeminiModels = [
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        provider: "gemini",
        tier: "free",
        pricing: "مجاني / Free Tier",
        description: "أحدث الموديلات السريعة الفائقة لتحويل الصوت والتصنيف والتحليل السريع",
      },
      {
        id: "gemini-3.1-flash-lite",
        name: "Gemini 3.1 Flash-Lite",
        provider: "gemini",
        tier: "free",
        pricing: "مجاني / Free Tier",
        description: "سريع واقتصادي للغاية - مثالي للمهام السريعة وتحويل الصوت",
      },
      {
        id: "gemini-3.5-pro",
        name: "Gemini 3.5 Pro",
        provider: "gemini",
        tier: "pro",
        pricing: "ذكي للغاية ودقيق جداً",
        description: "النموذج الاحترافي الأحدث عالي الذكاء والدقة للمهام المركبة والتقارير",
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
    ];

    const fallbackGroqModels = [
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
        description: "موديل تفكير قوي وسريع للتحليل المعقد",
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
    ];

    let geminiModels = [...fallbackGeminiModels];

    if (apiKey && apiKey !== "YOUR_GEMINI_API_KEY" && apiKey !== "your_api_key_here") {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (response.ok) {
          const data = await response.json();
          const apiModels = data.models || [];
          const dynamicModels = apiModels
            .filter((m: any) => {
              const name = m.name || "";
              const supportsGen = m.supportedGenerationMethods?.includes("generateContent") || false;
              return supportsGen && 
                     !name.includes("embedding") && 
                     !name.includes("aqa") &&
                     !name.includes("imagen") &&
                     !name.includes("veo") &&
                     !name.includes("1.5-preview") &&
                     !name.includes("1.6-preview") &&
                     !name.includes("robotics");
            })
            .map((m: any) => {
              const id = m.name.replace("models/", "");
              const isPro = id.includes("pro") || id.includes("ultra");
              return {
                id,
                name: m.displayName || id,
                provider: "gemini",
                tier: isPro ? "pro" : "free",
                pricing: isPro ? "Professional Tier" : "مجاني / Free Tier",
                description: m.description || "نموذج مستخرج ديناميكياً من الـ API key الخاص بك",
              };
            });
            
          if (dynamicModels.length > 0) {
            const seen = new Set<string>();
            const merged: typeof fallbackGeminiModels = [];
            dynamicModels.forEach((m: any) => {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                merged.push(m);
              }
            });
            fallbackGeminiModels.forEach((m) => {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                merged.push(m);
              }
            });
            geminiModels = merged;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch dynamic models list from Google API:", err);
      }
    }

    const fallbackFireworksModels = [
      {
        id: "accounts/fireworks/models/deepseek-v4-flash",
        name: "DeepSeek V4 Flash (Fireworks)",
        provider: "fireworks",
        tier: "free",
        pricing: "سريع واقتصادي / Fast",
        description: "موديل تفكير خفيف وسريع جداً مع ذاكرة 1M توكن",
      },
      {
        id: "accounts/fireworks/models/deepseek-v4-pro",
        name: "DeepSeek V4 Pro (Fireworks)",
        provider: "fireworks",
        tier: "pro",
        pricing: "ذكي للغاية / Smart",
        description: "موديل تفكير متطور للمهام المعقدة والتحليل المتقدم مع ذاكرة 1M توكن",
      }
    ];

    return {
      models: [...geminiModels, ...fallbackGroqModels, ...fallbackFireworksModels],
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

  // ─── Pipeline Version Comparison ───
  //
  // This filtered on the literals "v2.1" and "v2.2" while the pipeline had been writing
  // v3.0 for weeks, so both halves of the comparison were empty and the dashboard was
  // reporting on versions that no longer run. Grouping by whatever the column actually
  // contains means the next version needs no code change here at all.
  getPipelineVersionStats: adminProcedure.query(async () => {
    const empty = { currentPipelineVersion: SMART_PIPELINE_VERSION, versions: [], byMethod: [] };
    try {
      const rows = await db
        .select({
          version: classificationLogs.classificationVersion,
          count: count(),
          avgConfidence: sql`ROUND(AVG(${classificationLogs.confidence}), 1)`,
          avgTokens: sql`ROUND(AVG(${classificationLogs.tokensUsed}), 0)`,
          avgTimeMs: sql`ROUND(AVG(${classificationLogs.processingTimeMs}), 0)`,
          totalTokens: sql`COALESCE(SUM(${classificationLogs.tokensUsed}), 0)`,
          needsFollowupCount: sql`SUM(CASE WHEN ${classificationLogs.needsFollowup} = true THEN 1 ELSE 0 END)`,
          correctedCount: sql`SUM(CASE WHEN ${classificationLogs.wasCorrected} = true THEN 1 ELSE 0 END)`,
          lastSeen: sql`MAX(${classificationLogs.createdAt})`,
        })
        .from(classificationLogs)
        .groupBy(classificationLogs.classificationVersion);

      const byMethod = await db
        .select({
          version: classificationLogs.classificationVersion,
          parsedBy: classificationLogs.parsedBy,
          count: count(),
          avgConfidence: sql`ROUND(AVG(${classificationLogs.confidence}), 1)`,
        })
        .from(classificationLogs)
        .groupBy(classificationLogs.classificationVersion, classificationLogs.parsedBy);

      const rate = (part: unknown, whole: unknown): number =>
        Number(whole) ? Math.round((Number(part) / Number(whole)) * 100) : 0;

      return {
        currentPipelineVersion: SMART_PIPELINE_VERSION,
        versions: rows
          .map((r) => ({
            version: r.version || "unknown",
            totalClassifications: Number(r.count),
            avgConfidence: Number(r.avgConfidence ?? 0),
            avgTokensPerCall: Number(r.avgTokens ?? 0),
            avgProcessingTimeMs: Number(r.avgTimeMs ?? 0),
            totalTokensUsed: Number(r.totalTokens ?? 0),
            // The share of classifications the user came back and changed is the only
            // accuracy signal that does not come from the classifier's own opinion.
            correctionRate: rate(r.correctedCount, r.count),
            needsFollowupRate: rate(r.needsFollowupCount, r.count),
            lastSeen: r.lastSeen ? String(r.lastSeen) : null,
          }))
          .sort((a, b) => b.totalClassifications - a.totalClassifications),
        byMethod: byMethod.map((m) => ({
          version: m.version || "unknown",
          method: m.parsedBy,
          count: Number(m.count),
          avgConfidence: Number(m.avgConfidence ?? 0),
        })),
      };
    } catch (err) {
      if (!isMissingTableError(err, "classification_logs")) throw err;
      return empty;
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
      invalidateSettingsCache();
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
      await db.update(pendingClarifications).set({ status: input.status }).where(eq(pendingClarifications.id, input.id));
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
  /**
   * Check a key against any provider, not a fixed list of four.
   *
   * This replaces four branches that were identical apart from a URL - and whose
   * enum made it impossible to test a key for OpenRouter, DeepSeek, or anything else
   * the admin adds, even though `ai_providers` accepts arbitrary providers and the
   * default base URL in the provider manager is OpenRouter's.
   *
   * It also returns the models the key can actually reach, so the model dropdowns stop
   * being hand-maintained lists that go stale the week a provider ships something new.
   */
  validateApiKey: adminProcedure
    .input(
      z.object({
        provider: z.string().min(1),
        apiKey: z.string().min(1),
        /** Required only for a provider the product does not ship a URL for. */
        baseUrl: z.string().optional(),
        protocol: z.enum(["openai", "gemini"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const protocol =
        input.protocol || (input.provider === "gemini" ? "gemini" : "openai");
      const baseUrl = input.baseUrl || BUILTIN_BASE_URLS[input.provider] || "";

      if (protocol !== "gemini" && !baseUrl) {
        return {
          valid: false,
          status: 0,
          errorType: "config" as const,
          message: "مزود غير معروف: أضف عنوان الـ API (baseUrl) أولاً",
          models: [] as string[],
        };
      }

      try {
        // Listing models is the cheapest call that proves a key works, and it is the
        // one piece of information the admin needs next anyway.
        const discovered = await discoverRemoteModels(baseUrl, input.apiKey, protocol);
        return {
          valid: true,
          status: 200,
          errorType: null,
          message: `المفتاح يعمل بشكل سليم ✅ (${discovered.length} موديل متاح)`,
          models: discovered.map((m) => m.id),
        };
      } catch (err: any) {
        const raw = String(err?.message || "");
        const status = Number(raw.match(/\((\d{3})\)/)?.[1] || 0);
        return {
          valid: false,
          status,
          errorType: classifyApiError(status || undefined, raw),
          message: raw.substring(0, 300) || "خطأ غير متوقع",
          models: [] as string[],
        };
      }
    }),

  /**
   * Live health for every configured provider, replacing a dot that was always green.
   *
   * `ai_providers.healthStatus` now has two writers: the classification circuit breaker
   * records what it learns during real traffic, and this records a deliberate check.
   */
  checkProviderHealth: adminProcedure.mutation(async () => {
    const providers = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.isActive, true))
      .orderBy(aiProviders.priority);

    const results = await Promise.all(
      providers.map(async (provider) => {
        const startedAt = Date.now();
        const apiKey = decryptApiKey(provider.apiKeyEncrypted);
        if (!apiKey) {
          return {
            slug: provider.slug,
            displayName: provider.displayName,
            status: "down" as const,
            latencyMs: 0,
            modelCount: 0,
            message: "لا يوجد مفتاح صالح (قد يحتاج إعادة إدخال)",
          };
        }

        try {
          const models = await discoverRemoteModels(
            provider.baseUrl,
            apiKey,
            provider.protocol,
          );
          return {
            slug: provider.slug,
            displayName: provider.displayName,
            status: "healthy" as const,
            latencyMs: Date.now() - startedAt,
            modelCount: models.length,
            message: "يعمل",
          };
        } catch (err: any) {
          return {
            slug: provider.slug,
            displayName: provider.displayName,
            status: "down" as const,
            latencyMs: Date.now() - startedAt,
            modelCount: 0,
            message: String(err?.message || "").substring(0, 200),
          };
        }
      }),
    );

    // One write per provider, reflecting what was just observed rather than a default.
    await Promise.all(
      results.map((r) =>
        db
          .update(aiProviders)
          .set({ healthStatus: r.status, lastHealthCheck: new Date() })
          .where(eq(aiProviders.slug, r.slug)),
      ),
    );

    return { checkedAt: new Date().toISOString(), providers: results };
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

      let successCount = 0;
      let failureCount = 0;

      await Promise.all(
        subsToNotify.map(async (sub) => {
          const success = await sendPush(sub, input.title, input.body, "/");
          if (success) {
            successCount++;
          } else {
            failureCount++;
          }
        }),
      );

      return {
        success: true,
        message: `تم الإرسال لـ ${successCount} جهاز، وفشل الإرسال لـ ${failureCount} جهاز.`,
      };
    }),

  // ─── Notification Templates CRUD ───
  getNotificationTemplates: adminProcedure.query(async () => {
    return await db.select().from(notificationTemplates).orderBy(desc(notificationTemplates.createdAt));
  }),

  createNotificationTemplate: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      eventType: z.string().min(1),
      titleTemplate: z.string().optional(),
      bodyTemplate: z.string().optional(),
      titleTemplateAr: z.string().optional(),
      bodyTemplateAr: z.string().optional(),
      titleTemplateEn: z.string().optional(),
      bodyTemplateEn: z.string().optional(),
      targetSegment: z.any().optional(),
      sendAt: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      await db.insert(notificationTemplates).values({
        name: input.name,
        eventType: input.eventType,
        titleTemplate: input.titleTemplate || input.titleTemplateAr || "",
        bodyTemplate: input.bodyTemplate || input.bodyTemplateAr || "",
        titleTemplateAr: input.titleTemplateAr || input.titleTemplate || "",
        bodyTemplateAr: input.bodyTemplateAr || input.bodyTemplate || "",
        titleTemplateEn: input.titleTemplateEn || "",
        bodyTemplateEn: input.bodyTemplateEn || "",
        targetSegment: input.targetSegment ? JSON.stringify(input.targetSegment) : null,
        sendAt: input.sendAt ? new Date(input.sendAt) : null,
        createdBy: ctx.user.id
      });
      return { success: true };
    }),

  updateNotificationTemplate: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1),
      titleTemplateAr: z.string().min(1),
      bodyTemplateAr: z.string().min(1),
      titleTemplateEn: z.string().optional(),
      bodyTemplateEn: z.string().optional(),
      targetSegment: z.any().optional(),
      sendAt: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      await db.update(notificationTemplates)
        .set({
          name: input.name,
          titleTemplate: input.titleTemplateAr,
          bodyTemplate: input.bodyTemplateAr,
          titleTemplateAr: input.titleTemplateAr,
          bodyTemplateAr: input.bodyTemplateAr,
          titleTemplateEn: input.titleTemplateEn || "",
          bodyTemplateEn: input.bodyTemplateEn || "",
          targetSegment: input.targetSegment ? JSON.stringify(input.targetSegment) : null,
          sendAt: input.sendAt ? new Date(input.sendAt) : null,
        })
        .where(eq(notificationTemplates.id, input.id));
      return { success: true };
    }),

  toggleNotificationTemplate: adminProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.update(notificationTemplates).set({ isActive: input.isActive }).where(eq(notificationTemplates.id, input.id));
      return { success: true };
    }),

  deleteNotificationTemplate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(notificationTemplates).where(eq(notificationTemplates.id, input.id));
      return { success: true, message: "تم حذف الحملة بنجاح" };
    }),

  triggerActivityCheck: adminProcedure
    .mutation(async () => {
      await checkAndTriggerSmartActivityNotifications();
      return { success: true, message: "تم تشغيل فحص نشاط المستخدمين وإرسال التنبيهات بنجاح!" };
    }),

  getNotificationLogs: adminProcedure.query(async () => {
    return await db.select().from(notificationLogs).orderBy(desc(notificationLogs.sentAt)).limit(100);
  }),

  getNotificationStats: adminProcedure.query(async () => {
    const allSubs = await db.select().from(pushSubscriptions);
    const stats = {
      total: allSubs.length,
      web: allSubs.filter(s => s.deviceType === "web" || !s.deviceType).length,
      ios: allSubs.filter(s => s.deviceType === "ios").length,
      android: allSubs.filter(s => s.deviceType === "android").length,
      fcm: allSubs.filter(s => !!s.fcmToken).length,
      legacy: allSubs.filter(s => !s.fcmToken && !!s.endpoint).length,
    };
    return stats;
  }),

  // ─── Get Raw SMS Logs ───
  getRawSmsLogs: adminProcedure
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(50),
        status: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const { page = 1, limit = 50, status } = input ?? {};
      const offset = (page - 1) * limit;

      let q = db.select().from(rawSmsEvents).$dynamic();
      if (status) {
        q = q.where(eq(rawSmsEvents.status, status));
      }

      const list = await q.orderBy(desc(rawSmsEvents.createdAt)).limit(limit).offset(offset);
      const total = await db.select({ count: count() }).from(rawSmsEvents);

      // Map users
      const oauthIds = [...new Set(list.filter((s) => s.userType === "oauth").map((s) => s.userId))];
      const localIds = [...new Set(list.filter((s) => s.userType === "local").map((s) => s.userId))];

      const oauthRows = oauthIds.length > 0 ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, oauthIds)) : [];
      const localRows = localIds.length > 0 ? await db.select({ id: localUsers.id, name: localUsers.name }).from(localUsers).where(inArray(localUsers.id, localIds)) : [];

      const nameByKey = new Map<string, string>();
      for (const r of oauthRows) nameByKey.set(`oauth:${r.id}`, r.name);
      for (const r of localRows) nameByKey.set(`local:${r.id}`, r.name);

      const enriched = list.map((item) => ({
        ...item,
        userName: nameByKey.get(`${item.userType}:${item.userId}`) || "مجهول",
      }));

      return {
        list: enriched,
        total: total[0]?.count ?? 0,
        page,
        limit,
      };
    }),

  // ─── Trigger Database Backup Demo ───
  triggerBackupDemo: adminProcedure.mutation(async () => {
    const settingsRecord = await getSystemSettings();
    const isSensitiveKey = (key: string): boolean =>
      /(?:api[_-]?key|secret|password|token|hmac|private|database[_-]?url|jwt)/i.test(key);

    const maskSecret = (val: string): string => {
      if (!val) return "";
      if (val.length > 8) return "••••••••" + val.slice(-4);
      return "••••••••";
    };

    const settings = Object.entries(settingsRecord).map(([key, value]) => ({
      key,
      value: isSensitiveKey(key) && typeof value === "string" ? maskSecret(value) : value,
    }));
    const codes = await db.select().from(discountCodes);
    const questions = await db.select().from(onboardingQuestions);
    const activeAds = await db.select().from(ads);

    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        tablesBackedUp: ["system_settings", "discount_codes", "onboarding_questions", "ads"],
        version: "2.0.0",
        stats: {
          settingsCount: settings.length,
          discountCodesCount: codes.length,
          onboardingQuestionsCount: questions.length,
          adsCount: activeAds.length,
        }
      },
      systemSettings: settings,
      discountCodes: codes,
      onboardingQuestions: questions,
      ads: activeAds,
    };

    return {
      success: true,
      message: "تم أخذ نسخة احتياطية من إعدادات النظام بنجاح!",
      backupData,
    };
  }),

  // ─── Universal AI Provider & Model Management ───
  getAiProviders: adminProcedure.query(async () => {
    const list = await db.select().from(aiProviders).orderBy(aiProviders.priority);
    return list.map((p) => {
      let mask = "••••••••";
      if (p.apiKeyEncrypted) {
        try {
          const dec = decryptApiKey(p.apiKeyEncrypted);
          if (dec && dec.length >= 4) {
            mask = "••••••••" + dec.slice(-4);
          }
        } catch {
          mask = "••••••••";
        }
      }
      return {
        id: p.id,
        slug: p.slug,
        displayName: p.displayName,
        protocol: p.protocol,
        baseUrl: p.baseUrl,
        apiKeyMasked: mask,
        supportsModelDiscovery: p.supportsModelDiscovery,
        isActive: p.isActive,
        priority: p.priority,
        healthStatus: p.healthStatus,
        lastHealthCheck: p.lastHealthCheck,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });
  }),

  addAiProvider: adminProcedure
    .input(
      z.object({
        slug: z.string().min(2).max(50),
        displayName: z.string().min(2).max(100),
        protocol: z.enum(["openai", "gemini", "anthropic"]).default("openai"),
        baseUrl: z.string().url(),
        apiKey: z.string().min(1),
        priority: z.number().int().default(10),
      }),
    )
    .mutation(async ({ input }) => {
      const encrypted = encryptApiKey(input.apiKey);
      const [newRow] = await db.insert(aiProviders).values({
        slug: input.slug.toLowerCase().trim(),
        displayName: input.displayName.trim(),
        protocol: input.protocol,
        baseUrl: input.baseUrl.trim(),
        apiKeyEncrypted: encrypted,
        priority: input.priority,
        isActive: true,
      });
      await refreshGatewayCache();
      return { success: true, id: newRow.insertId };
    }),

  updateAiProvider: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        displayName: z.string().min(2).max(100).optional(),
        protocol: z.enum(["openai", "gemini", "anthropic"]).optional(),
        baseUrl: z.string().url().optional(),
        apiKey: z.string().min(1).optional(),
        priority: z.number().int().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const updateData: Record<string, any> = {};
      if (input.displayName !== undefined) updateData.displayName = input.displayName.trim();
      if (input.protocol !== undefined) updateData.protocol = input.protocol;
      if (input.baseUrl !== undefined) updateData.baseUrl = input.baseUrl.trim();
      if (input.apiKey !== undefined) updateData.apiKeyEncrypted = encryptApiKey(input.apiKey);
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      await db.update(aiProviders).set(updateData).where(eq(aiProviders.id, input.id));
      await refreshGatewayCache();
      return { success: true };
    }),

  deleteAiProvider: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.transaction(async (tx) => {
        await tx.delete(aiModels).where(eq(aiModels.providerId, input.id));
        await tx.delete(aiProviders).where(eq(aiProviders.id, input.id));
      });
      await refreshGatewayCache();
      return { success: true };
    }),

  discoverProviderModels: adminProcedure
    .input(
      z.object({
        baseUrl: z.string().url(),
        apiKey: z.string(),
        protocol: z.enum(["openai", "gemini", "anthropic"]).default("openai"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const models = await discoverRemoteModels(input.baseUrl, input.apiKey, input.protocol);
        return { models };
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err?.message || "فشل الاتصال بالمزود لجلب قائمة الموديلات",
        });
      }
    }),

  saveAiModels: adminProcedure
    .input(
      z.object({
        providerId: z.number().int(),
        models: z.array(
          z.object({
            modelId: z.string().min(1),
            displayName: z.string().min(1),
            descriptionAr: z.string().optional(),
            purposes: z.array(z.string()).min(1),
            allowedTiers: z.array(z.string()).min(1),
            isDefaultForPurpose: z.boolean().default(false),
            inputPricePer1M: z.number().min(0).default(0.14),
            outputPricePer1M: z.number().min(0).default(0.56),
            cachedPricePer1M: z.number().min(0).default(0.014),
            maxContextTokens: z.number().int().default(128000),
            supportsVision: z.boolean().default(false),
            supportsReasoning: z.boolean().default(false),
            isActive: z.boolean().default(true),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      await db.transaction(async (tx) => {
        for (const m of input.models) {
          const existing = await tx
            .select({ id: aiModels.id })
            .from(aiModels)
            .where(and(eq(aiModels.providerId, input.providerId), eq(aiModels.modelId, m.modelId)))
            .limit(1);

          const payload = {
            providerId: input.providerId,
            modelId: m.modelId,
            displayName: m.displayName,
            descriptionAr: m.descriptionAr || null,
            purposes: m.purposes,
            allowedTiers: m.allowedTiers,
            isDefaultForPurpose: m.isDefaultForPurpose,
            inputPricePer1M: sql`${m.inputPricePer1M.toFixed(6)}`,
            outputPricePer1M: sql`${m.outputPricePer1M.toFixed(6)}`,
            cachedPricePer1M: sql`${m.cachedPricePer1M.toFixed(6)}`,
            maxContextTokens: m.maxContextTokens,
            supportsVision: m.supportsVision,
            supportsReasoning: m.supportsReasoning,
            isActive: m.isActive,
          };

          if (existing[0]) {
            await tx.update(aiModels).set(payload).where(eq(aiModels.id, existing[0].id));
          } else {
            await tx.insert(aiModels).values(payload);
          }
        }
      });
      await refreshGatewayCache();
      return { success: true };
    }),

  getAiModels: adminProcedure.query(async () => {
    return await db.select().from(aiModels).orderBy(desc(aiModels.createdAt));
  }),

  // ─── Token Ledgers & Quota Inspector ───
  getAiTokenLedger: moderatorProcedure
    .input(
      z.object({
        userId: z.number().int().optional(),
        userType: z.enum(["oauth", "local"]).optional(),
        channel: z.string().optional(),
        provider: z.string().optional(),
        billingPeriod: z.string().optional(),
        page: z.number().int().default(1),
        limit: z.number().int().default(50),
      }),
    )
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [];

      if (input.userId && input.userType) {
        conditions.push(and(eq(aiTokenLedgers.userId, input.userId), eq(aiTokenLedgers.userType, input.userType)));
      }
      if (input.channel) conditions.push(eq(aiTokenLedgers.channel, input.channel));
      if (input.provider) conditions.push(eq(aiTokenLedgers.providerSlug, input.provider));
      if (input.billingPeriod) conditions.push(eq(aiTokenLedgers.billingPeriod, input.billingPeriod));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rowsQuery = db.select().from(aiTokenLedgers);
      const rows = whereClause
        ? await rowsQuery.where(whereClause).orderBy(desc(aiTokenLedgers.createdAt)).limit(input.limit).offset(offset)
        : await rowsQuery.orderBy(desc(aiTokenLedgers.createdAt)).limit(input.limit).offset(offset);

      const totalQuery = db.select({ count: count() }).from(aiTokenLedgers);
      const total = whereClause ? await totalQuery.where(whereClause) : await totalQuery;

      return {
        rows,
        total: total[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  getUserAiQuota: moderatorProcedure
    .input(
      z.object({
        search: z.string().min(1),
        selectedUserId: z.number().optional(),
        selectedUserType: z.enum(["oauth", "local"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      const searchClean = input.search.trim();
      const currentPeriod = resolveBillingPeriod();

      let matchedUser: {
        id: number;
        type: "oauth" | "local";
        name: string;
        email?: string | null;
        phone?: string | null;
        plan: string;
      } | null = null;

      // 1. Explicit user selection
      if (input.selectedUserId && input.selectedUserType) {
        if (input.selectedUserType === "local") {
          const [local] = await db.select().from(localUsers).where(eq(localUsers.id, input.selectedUserId)).limit(1);
          if (local) {
            matchedUser = { id: local.id, type: "local", name: local.name, phone: local.phone, email: local.email, plan: local.plan || "free" };
          }
        } else {
          const [oauth] = await db.select().from(users).where(eq(users.id, input.selectedUserId)).limit(1);
          if (oauth) {
            matchedUser = { id: oauth.id, type: "oauth", name: oauth.name, email: oauth.email, plan: oauth.plan || "free" };
          }
        }
      }

      // 2. Search by exact ID
      if (!matchedUser) {
        const numId = Number.parseInt(searchClean, 10);
        if (!Number.isNaN(numId) && numId > 0) {
          const [local] = await db.select().from(localUsers).where(eq(localUsers.id, numId)).limit(1);
          if (local) {
            matchedUser = { id: local.id, type: "local", name: local.name, phone: local.phone, email: local.email, plan: local.plan || "free" };
          } else {
            const [oauth] = await db.select().from(users).where(eq(users.id, numId)).limit(1);
            if (oauth) {
              matchedUser = { id: oauth.id, type: "oauth", name: oauth.name, email: oauth.email, plan: oauth.plan || "free" };
            }
          }
        }
      }

      // 3. Search by Name, Email, Phone with pattern matching (Fuzzy & Multi-criteria)
      const searchPattern = `%${searchClean}%`;
      const [localsMatched, oauthsMatched] = await Promise.all([
        db
          .select({
            id: localUsers.id,
            name: localUsers.name,
            phone: localUsers.phone,
            email: localUsers.email,
            plan: localUsers.plan,
          })
          .from(localUsers)
          .where(
            or(
              like(localUsers.name, searchPattern),
              like(localUsers.phone, searchPattern),
              like(localUsers.email, searchPattern),
            ),
          )
          .limit(10),
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            plan: users.plan,
          })
          .from(users)
          .where(
            or(
              like(users.name, searchPattern),
              like(users.email, searchPattern),
            ),
          )
          .limit(10),
      ]);

      const candidateUsers = [
        ...localsMatched.map((u) => ({ id: u.id, type: "local" as const, name: u.name, phone: u.phone, email: u.email, plan: u.plan || "free" })),
        ...oauthsMatched.map((u) => ({ id: u.id, type: "oauth" as const, name: u.name, email: u.email, phone: null, plan: u.plan || "free" })),
      ];

      if (!matchedUser && candidateUsers.length > 0) {
        matchedUser = candidateUsers[0];
      }

      if (!matchedUser) {
        return {
          user: null,
          candidateUsers: candidateUsers as Array<{ id: number; type: "oauth" | "local"; name: string; email: string | null; phone: string | null; plan: string }>,
          billingPeriod: currentPeriod,
          quotaLimit: 50_000,
          totalTokens: 0,
          totalCostEgp: 0,
          totalCostUsd: 0,
          percentUsed: 0,
          byChannel: {} as Record<string, number>,
          recentRequests: [],
        };
      }

      // Aggregate token ledgers using SQL SUM (No truncation bug!)
      const [statsRow] = await db
        .select({
          totalTokens: sql<number>`COALESCE(SUM(${aiTokenLedgers.totalTokens}), 0)`,
          totalCostEgp: sql<number>`COALESCE(SUM(${aiTokenLedgers.costEgp}), 0)`,
          totalCostUsd: sql<number>`COALESCE(SUM(${aiTokenLedgers.costUsd}), 0)`,
        })
        .from(aiTokenLedgers)
        .where(
          and(
            eq(aiTokenLedgers.userId, matchedUser.id),
            eq(aiTokenLedgers.userType, matchedUser.type),
            eq(aiTokenLedgers.billingPeriod, currentPeriod),
          ),
        );

      const channelRows = await db
        .select({
          channel: aiTokenLedgers.channel,
          tokens: sql<number>`COALESCE(SUM(${aiTokenLedgers.totalTokens}), 0)`,
        })
        .from(aiTokenLedgers)
        .where(
          and(
            eq(aiTokenLedgers.userId, matchedUser.id),
            eq(aiTokenLedgers.userType, matchedUser.type),
            eq(aiTokenLedgers.billingPeriod, currentPeriod),
          ),
        )
        .groupBy(aiTokenLedgers.channel);

      const byChannel: Record<string, number> = {};
      for (const cr of channelRows) {
        byChannel[cr.channel] = Number(cr.tokens || 0);
      }

      // Fetch the latest 20 receipts for inspector preview
      const recentRequests = await db
        .select()
        .from(aiTokenLedgers)
        .where(
          and(
            eq(aiTokenLedgers.userId, matchedUser.id),
            eq(aiTokenLedgers.userType, matchedUser.type),
            eq(aiTokenLedgers.billingPeriod, currentPeriod),
          ),
        )
        .orderBy(desc(aiTokenLedgers.createdAt))
        .limit(20);

      const totalTokens = Number(statsRow?.totalTokens || 0);
      const totalCostEgp = Number(statsRow?.totalCostEgp || 0);
      const totalCostUsd = Number(statsRow?.totalCostUsd || 0);

      const planLimits: Record<string, number> = {
        free: 50_000,
        pro: 500_000,
        ultra: 2_000_000,
      };
      const quotaLimit = planLimits[matchedUser.plan] || 50_000;

      return {
        user: matchedUser,
        candidateUsers,
        billingPeriod: currentPeriod,
        quotaLimit,
        totalTokens,
        totalCostEgp,
        totalCostUsd,
        percentUsed: Math.min(100, Math.round((totalTokens / quotaLimit) * 100)),
        byChannel,
        recentRequests,
      };
    }),

  getAiTelemetryOverview: adminProcedure.query(async () => {
    const currentPeriod = resolveBillingPeriod();
    const rows = await db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${aiTokenLedgers.totalTokens}), 0)`,
        promptTokens: sql<number>`COALESCE(SUM(${aiTokenLedgers.promptTokens}), 0)`,
        completionTokens: sql<number>`COALESCE(SUM(${aiTokenLedgers.completionTokens}), 0)`,
        cachedTokens: sql<number>`COALESCE(SUM(${aiTokenLedgers.cachedTokens}), 0)`,
        costEgp: sql<number>`COALESCE(SUM(${aiTokenLedgers.costEgp}), 0)`,
        costUsd: sql<number>`COALESCE(SUM(${aiTokenLedgers.costUsd}), 0)`,
        avgLatencyMs: sql<number>`COALESCE(AVG(${aiTokenLedgers.latencyMs}), 0)`,
        totalRequests: count(),
      })
      .from(aiTokenLedgers)
      .where(eq(aiTokenLedgers.billingPeriod, currentPeriod));

    const stats = rows[0] || {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      costEgp: 0,
      costUsd: 0,
      avgLatencyMs: 0,
      totalRequests: 0,
    };

    const providerDistribution = await db
      .select({
        providerSlug: aiTokenLedgers.providerSlug,
        totalTokens: sql<number>`COALESCE(SUM(${aiTokenLedgers.totalTokens}), 0)`,
        costEgp: sql<number>`COALESCE(SUM(${aiTokenLedgers.costEgp}), 0)`,
      })
      .from(aiTokenLedgers)
      .where(eq(aiTokenLedgers.billingPeriod, currentPeriod))
      .groupBy(aiTokenLedgers.providerSlug);

    const channelBreakdown = await db
      .select({
        channel: aiTokenLedgers.channel,
        totalTokens: sql<number>`COALESCE(SUM(${aiTokenLedgers.totalTokens}), 0)`,
        costEgp: sql<number>`COALESCE(SUM(${aiTokenLedgers.costEgp}), 0)`,
        avgLatency: sql<number>`COALESCE(AVG(${aiTokenLedgers.latencyMs}), 0)`,
        requestCount: count(),
      })
      .from(aiTokenLedgers)
      .where(eq(aiTokenLedgers.billingPeriod, currentPeriod))
      .groupBy(aiTokenLedgers.channel);

    return {
      currentPeriod,
      totals: {
        totalTokens: Number(stats.totalTokens),
        promptTokens: Number(stats.promptTokens),
        completionTokens: Number(stats.completionTokens),
        cachedTokens: Number(stats.cachedTokens),
        costEgp: Number(stats.costEgp),
        costUsd: Number(stats.costUsd),
        avgLatencyMs: Number(stats.avgLatencyMs),
        totalRequests: Number(stats.totalRequests),
        cacheSavingsRate:
          Number(stats.promptTokens) > 0
            ? Math.round((Number(stats.cachedTokens) / Number(stats.promptTokens)) * 100)
            : 0,
      },
      providerDistribution,
      channelBreakdown,
    };
  }),
});

