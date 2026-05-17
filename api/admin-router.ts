import { z } from "zod";
import { router, adminProcedure, moderatorProcedure } from "./middleware";
import { db } from "./queries/connection";
import { users, localUsers, expenses, sessions, supportTickets, userAnalytics, systemSettings, classificationLogs, voiceUsage, discountCodes } from "../db/schema";
import { eq, sql, desc, count, and, gte, lte, sum, inArray, or, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { env } from "./lib/env";
import { getSmartProfile } from "./services/user-profile-service";

function isMissingTableError(err: unknown, table: string): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message.includes(table) && (
    message.includes("doesn't exist") ||
    message.includes("ER_NO_SUCH_TABLE") ||
    message.includes("Failed query")
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

      const oauthFilters = [];
      if (role) oauthFilters.push(eq(users.role, role));
      if (plan) oauthFilters.push(eq(users.plan, plan));
      if (search) oauthFilters.push(searchUsersConditionOAuth(search));

      let oauthQuery = db.select().from(users).$dynamic();
      if (oauthFilters.length) oauthQuery = oauthQuery.where(and(...oauthFilters));

      const localFilters = [];
      if (role) localFilters.push(eq(localUsers.role, role));
      if (plan) localFilters.push(eq(localUsers.plan, plan));
      if (search) localFilters.push(searchUsersConditionLocal(search));

      let localQuery = db.select().from(localUsers).$dynamic();
      if (localFilters.length) localQuery = localQuery.where(and(...localFilters));

      const oauthUsers = await oauthQuery.limit(limit).offset(offset);
      const localUsersList = await localQuery.limit(limit).offset(offset);

      const oauthCount = await db.select({ count: count() }).from(users);
      const localCount = await db.select({ count: count() }).from(localUsers);

      const oauthIds = oauthUsers.map((u) => u.id);
      const localIds = localUsersList.map((u) => u.id);

      const statMap = new Map<string, { expenseCount: number; totalSpent: string }>();

      const expenseParts = [];
      if (oauthIds.length) expenseParts.push(and(inArray(expenses.userId, oauthIds), eq(expenses.userType, "oauth")));
      if (localIds.length) expenseParts.push(and(inArray(expenses.userId, localIds), eq(expenses.userType, "local")));

      if (expenseParts.length > 0) {
        const rows = await db
          .select({
            userId: expenses.userId,
            userType: expenses.userType,
            expenseCount: count(),
            totalSpent: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
          })
          .from(expenses)
          .where(expenseParts.length === 1 ? expenseParts[0]! : or(...expenseParts))
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
        return { ...u, userType: "oauth" as const, expenseCount: s?.expenseCount ?? 0, totalSpent: s?.totalSpent ?? "0" };
      });

      const enrichedLocal = localUsersList.map((u) => {
        const s = statMap.get(`local:${u.id}`);
        return { ...u, userType: "local" as const, expenseCount: s?.expenseCount ?? 0, totalSpent: s?.totalSpent ?? "0" };
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
    .input(z.object({
      userId: z.number(),
      userType: z.enum(["oauth", "local"]),
    }))
    .query(async ({ input }) => {
      const profile = await getSmartProfile(input.userId, input.userType);
      return profile;
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

  // ─── Get User Smart Profile ───
  getUserSmartProfile: adminProcedure
    .input(z.object({
      userId: z.number(),
      userType: z.enum(["oauth", "local"]),
    }))
    .query(async ({ input }) => {
      return await getSmartProfile(input.userId, input.userType);
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
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const { limit = 50 } = input ?? {};
      const activeSessions = await db.select().from(sessions)
        .orderBy(desc(sessions.createdAt))
        .limit(limit);

      const oauthIds = [...new Set(activeSessions.filter((s) => s.userType === "oauth").map((s) => s.userId))];
      const localIds = [...new Set(activeSessions.filter((s) => s.userType === "local").map((s) => s.userId))];

      const oauthRows =
        oauthIds.length > 0
          ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, oauthIds))
          : [];
      const localRows =
        localIds.length > 0
          ? await db.select({ id: localUsers.id, name: localUsers.name }).from(localUsers).where(inArray(localUsers.id, localIds))
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
      ai_api_key: env.GEMINI_API_KEY || "",
      ai_model_free: env.GEMINI_MODEL_FREE || "gemini-2.0-flash",
      ai_model_pro: env.GEMINI_MODEL_PRO || "gemini-2.5-flash",
      ai_model_ultra: "gemini-2.5-pro",
      ai_model_reports: env.GEMINI_MODEL_REPORTS || "gemini-2.5-flash",
      // Token limits
      free_token_limit: "50000",
      pro_token_limit: "500000",
      ultra_token_limit: "2000000",
      // Daily limits (requests per day)
      free_daily_limit: "10",
      pro_daily_limit: "100",
      ultra_daily_limit: "500",
      // Per-request max tokens
      free_max_per_request: "256",
      pro_max_per_request: "512",
      ultra_max_per_request: "1024",
      // Feature toggles
      free_ai_analysis: "false",
      pro_ai_analysis: "true",
      ultra_ai_analysis: "true",
      free_ai_parse: "true",
      pro_ai_parse: "true",
      ultra_ai_parse: "true",
      // New Pipeline Settings
      voice_limit_free: "300",    // 5 min
      voice_limit_pro: "1800",    // 30 min
      voice_limit_ultra: "0",     // unlimited
      voice_per_req_free: "60",   // 60 sec per request
      voice_per_req_pro: "180",   // 3 min per request
      voice_per_req_ultra: "300", // 5 min per request
      confidence_auto_save: "85",
      confidence_review: "60",
      stt_api_key: "AIzaSyCWif4U7uRb1WKG_HTwqNwtNLmvfD5fZj0",
      stt_model: "gemini-3.0-flash-live",
      stt_fallback_model: "gemini-3.1-flash-lite",
      // AI Response Settings
      ai_response_length: "medium", // short, medium, detailed
      ai_focus: "balanced", // statistics, tips, patterns, balanced
      ai_system_prompt: "[Persona] مستشار مالي مصري ذكي ومتعاطف. لغتك عامية مصرية راقية ومبسطة، وتتحدث وكأنك إنسان حقيقي.\n[Rules]\n1. لا تستخدم العناوين الآلية (مثل التطبيع أو السببية).\n2. واجه المستخدم بالأرقام الحقيقية.\n3. قدم نصائح عملية مصممة خصيصاً للمستخدم بناءً على سلوكه المالي.",
      ai_advanced_instructions: "",
      ai_report_structure_override: "",
      // Report frequency limits (days between reports per tier)
      report_limit_free: "30",    // 1 report per 30 days
      report_limit_pro: "14",     // 1 report per 14 days
      report_limit_ultra: "1",    // 1 report per day (effectively unlimited)
      // Report Word Counts (approximate control via prompt + token safety net)
      report_words_free: "550",       // target ~400-700 words for free plan
      report_words_pro: "850",        // target ~700-1000 words for pro plan
      report_words_ultra: "1500",     // target 1000++ words for ultra plan
      // Report Max Output Tokens (hard safety net per plan)
      report_max_tokens_free: "1800",   // ~700 words max safety net
      report_max_tokens_pro: "3500",    // ~1400 words max safety net
      report_max_tokens_ultra: "8192",  // unlimited depth
      // How many subcategories + top items to feed the AI per plan
      report_subcats_free: "15",        // top 15 subcategories for free
      report_subcats_pro: "20",         // top 20 subcategories for pro (same as ultra)
      report_subcats_ultra: "20",       // top 20 subcategories for ultra
      report_top_items_pro: "10",       // send top 10 item descriptions for pro
      report_top_items_ultra: "10",     // send top 10 item descriptions for ultra
      // Referrals
      promo_code_discount: "20",
    };
    
    settings.forEach(s => {
      if (s.value) config[s.key] = s.value;
    });
    
    return config;
  }),

  updateSettings: adminProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(async ({ input }) => {
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== null) {
          await db.insert(systemSettings)
            .values({ key, value })
            .onDuplicateKeyUpdate({ set: { value } });
        }
      }
      return { success: true, message: "تم تحديث الإعدادات بنجاح" };
    }),

  // ─── Update User Plan (with Ultra) ───
  updateUserPlanV2: adminProcedure
    .input(z.object({
      userId: z.number(),
      userType: z.enum(["oauth", "local"]),
      plan: z.enum(["free", "pro", "ultra"]),
    }))
    .mutation(async ({ input }) => {
      const table = input.userType === "oauth" ? users : localUsers;
      await db.update(table).set({ plan: input.plan }).where(eq(table.id, input.userId));
      return { success: true, message: "تم تحديث الخطة بنجاح" };
    }),

  // ─── Reset User Tokens ───
  resetUserTokens: adminProcedure
    .input(z.object({
      userId: z.number(),
      userType: z.enum(["oauth", "local"]),
    }))
    .mutation(async ({ input }) => {
      const table = input.userType === "oauth" ? users : localUsers;
      await db.update(table).set({ aiTokensUsed: 0 }).where(eq(table.id, input.userId));
      return { success: true, message: "تم إعادة تعيين التوكنز" };
    }),

  // ─── Get Available Gemini Models ───
  getAvailableModels: adminProcedure.query(async () => {
    return {
      models: [
        { id: "gemini-3.0-flash-live", name: "Gemini 3.0 Flash Live", tier: "pro", description: "معالجة صوتية حية فائقة الدقة" },
        { id: "gemini-2.5-flash-native-audio", name: "Gemini 2.5 Flash Native Audio", tier: "free", description: "نسخة مخصصة للصوت مباشرة" },
        { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", tier: "free", description: "خفيف وسريع جداً للطلبات المتكررة" },
        { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", tier: "free", description: "اقتصادي وسريع للمهام البسيطة" },
        { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "free", description: "سريع واقتصادي" },
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "pro", description: "دقيق ومتقدم" },
        { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", tier: "free", description: "الجيل السابق - سريع" },
        { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", tier: "free", description: "كلاسيكي - اقتصادي" },
        { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", tier: "pro", description: "كلاسيكي - متقدم" },
        { id: "gemma-3-27b-it", name: "Gemma 3 27B", tier: "free", description: "مفتوح المصدر" },
        { id: "gemma-4-12b-it", name: "Gemma 4 12B", tier: "free", description: "مفتوح المصدر - خفيف" },
        { id: "gemma-4-27b-it", name: "Gemma 4 27B", tier: "pro", description: "مفتوح المصدر - قوي" },
      ]
    };
  }),

  // ─── AI Classification Stats ───
  getAIClassificationStats: adminProcedure.query(async () => {
    let stats: any[] = [];
    let totalLogs: Array<{ count: number }> = [{ count: 0 }];

    try {
      stats = await db.select({
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

  // ─── Get Classification Logs ───
  getClassificationLogs: moderatorProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      parsedBy: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { page = 1, limit = 20, parsedBy } = input ?? {};
      const offset = (page - 1) * limit;

      let logs: any[] = [];
      let total: Array<{ count: number }> = [{ count: 0 }];

      try {
        let query = db.select().from(classificationLogs).$dynamic();
        if (parsedBy) query = query.where(eq(classificationLogs.parsedBy, parsedBy));
        
        logs = await query
          .orderBy(desc(classificationLogs.createdAt))
          .limit(limit)
          .offset(offset);

        total = await db.select({ count: count() }).from(classificationLogs);
      } catch (err) {
        if (!isMissingTableError(err, "classification_logs")) throw err;
      }

      const oauthLogIds = [...new Set(logs.filter((l) => l.userType === "oauth").map((l) => l.userId))];
      const localLogIds = [...new Set(logs.filter((l) => l.userType === "local").map((l) => l.userId))];

      const oauthNameRows =
        oauthLogIds.length > 0
          ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, oauthLogIds))
          : [];
      const localNameRows =
        localLogIds.length > 0
          ? await db.select({ id: localUsers.id, name: localUsers.name }).from(localUsers).where(inArray(localUsers.id, localLogIds))
          : [];

      const logNameMap = new Map<string, string>();
      for (const r of oauthNameRows) logNameMap.set(`oauth:${r.id}`, r.name);
      for (const r of localNameRows) logNameMap.set(`local:${r.id}`, r.name);

      const enriched = logs.map((l) => ({
        ...l,
        userName: logNameMap.get(`${l.userType}:${l.userId}`) || "مجهول",
      }));

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
      usage = await db.select({
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
    return await db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));
  }),

  createDiscountCode: adminProcedure
    .input(z.object({
      code: z.string().min(3).max(50),
      type: z.enum(["referral", "promo"]).default("promo"),
      discountPercent: z.number().min(1).max(100),
      maxUses: z.number().min(0).optional(),
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await db.select().from(discountCodes).where(eq(discountCodes.code, input.code.toUpperCase())).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "الكود موجود بالفعل" });
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
});
