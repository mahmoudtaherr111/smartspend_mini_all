import { z } from "zod";
import {
  router,
  authedProcedure,
  proProcedure,
  aiProcedure,
} from "./middleware";
import { TRPCError } from "@trpc/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "./queries/connection";
import {
  expenses,
  monthlyReports,
  aiSummaries,
  systemSettings,
  users,
  localUsers,
  userProfiles,
  userDictionaries,
  classificationLogs,
  voiceUsage,
  monthlyBehaviorSnapshots,
  pendingClarifications,
} from "../db/schema";
import { eq, sql, desc, count, and, gte, lte, sum } from "drizzle-orm";
import { env } from "./lib/env";
import { runSmartPipeline } from "./lib/smart-pipeline";
import { CATEGORIES } from "./lib/category-registry";
import {
  CATEGORY_DICTIONARY,
  INCOME_KEYWORDS,
  EXPENSE_KEYWORDS,
  STRONG_INCOME,
  STRONG_EXPENSE,
} from "./lib/egyptian-dictionary";
import { fuzzyFindCategory } from "./lib/fuzzy-match";
import {
  getSmartProfile,
  recordProfileLearningEvent,
  saveSmartProfile,
  summarizeProfileForAI,
} from "./services/user-profile-service";
import { buildBehaviorSnapshot } from "./services/lifestyle-inference-engine";
import {
  buildBackendPersonalizedInsights,
  buildReportPersonalizationContext,
} from "./services/report-personalization-engine";
import {
  buildPersonalContext,
  buildPersonalContextPrompt,
  buildFamilyReportContext,
} from "./services/personal-context-builder";
import { parseNameAndRelationship } from "./lib/relationship-normalizer";
import { redactSensitiveData } from "./lib/anonymizer";
import {
  coerceModelForProvider,
  defaultGeminiModelForPlan,
  defaultModelForProvider,
  mapModelName,
  isGroqModel,
  type AiPlanName,
  type AiProviderName,
} from "./lib/model-mapper";
import {
  assertAiBudget,
  asPlan,
  capRequestOutputTokens,
  clampOutputTokens,
  countDailyAiRequests,
  estimateTokensFromText,
  getAiBudget,
  recordAiUsageEvent,
  type AiUsageChannel,
} from "./lib/ai-usage-policy";
import {
  buildProReportDataBlock,
  buildProReportPrompt,
  type ProReportBackendSummary,
} from "./services/pro-report-engine";

// ────────────────────────────────────────────────────────
// STT Helper (Speech-to-Text)
// ────────────────────────────────────────────────────────
export async function runSTTPipeline(
  base64Audio: string,
  mimeType: string,
  apiKey: string,
  modelName: string,
  mode: string = "standard"
) {
  // ── Gemini STT prompt: optimized for downstream pipeline ──
  // Key requirements for the pipeline:
  //   1. Numbers as DIGITS (50 not خمسين) — extractAmounts() needs /\d+/
  //   2. Egyptian colloquial verbs (اديت not أعطيت) — rule engine patterns
  //   3. Egyptian relationship words (صاحبي not صديقي) — person-resolver aliases
  //   4. Preserve names exactly as spoken — extractPeople() fuzzy match
  const geminiPrompt = "حوّل الصوت لنص مصري عامي. أرقام بأرقام (50 مش خمسين). لا تضف شرح.";

  // ── Groq Whisper prompt: domain-hint keywords (not instructions) ──
  // Whisper's `prompt` param works as context/vocabulary hint, not instruction.
  // We feed it the exact vocabulary our pipeline expects to condition the output.
  const whisperPrompt = "مصاريف مصرية: اوبر كريم بنزين كهربا فودافون فاليو انستاباي. اديت صرفت دفعت ركبت فطرت اكلت اشتريت جبت حولت قبضت سلفت. صاحبي اخويا مراتي بابا ماما. ميه ميتين الف خمسين.";

  const prompt = isGroqModel(modelName) ? whisperPrompt : geminiPrompt;

  if (isGroqModel(modelName)) {
    // ─── Groq Audio API (Whisper) ───
    const audioBuffer = Buffer.from(base64Audio, "base64");
    const blob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });
    const formData = new FormData();
    formData.append("file", blob, "audio.webm");
    formData.append("model", modelName);
    formData.append("prompt", prompt);
    formData.append("language", "ar");
    
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData as any
    });
    
    if (!res.ok) {
       const errBody = await res.text().catch(() => "");
       console.error(`[Groq STT API Error] HTTP ${res.status}:`, errBody);
       throw new Error(`Groq STT API Error: ${res.status} ${errBody}`);
    }
    
    const data = (await res.json()) as any;
    return {
       text: data.text || "",
       tokensUsed: 0,
       modelUsed: modelName,
    };
  }

  // ─── Gemini Audio STT ───
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Audio,
        mimeType: mimeType || "audio/webm",
      },
    },
  ]);

  const response = result.response;
  const text = response.text();
  const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

  return {
    text,
    tokensUsed,
    modelUsed: modelName,
  };
}

// ────────────────────────────────────────────────────────
// Groq API Helper
// ────────────────────────────────────────────────────────
export async function callGroqAPI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ text: string; tokensUsed: number }> {
  const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: Math.min(maxTokens * 2, 4096),
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `Groq API error ${response.status}: ${errBody.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as any;
  const text = data?.choices?.[0]?.message?.content ?? "";
  const tokensUsed = data?.usage?.total_tokens ?? 0;
  return { text, tokensUsed };
}

// ────────────────────────────────────────────────────────
// Dynamic Routing Config Resolver
// ────────────────────────────────────────────────────────
export interface RoutingRange {
  from: number;
  to: number | null;
  action?: "block";
  message?: string;
  provider?: "gemini" | "groq";
  key_slot?: "key1" | "key2" | "groq";
  model?: string;
}

export interface ResolvedRouting {
  provider: "gemini" | "groq";
  apiKey: string;
  model: string;
}

/**
 * Reads the dynamic routing ranges from admin settings and resolves
 * the correct API provider + key + model for the user's current token usage.
 * Throws a TRPCError with FORBIDDEN code if the user is in a "block" range.
 */
export async function resolveRoutingConfig(
  userPlan: string,
  tokensUsed: number,
  cfg: Record<string, string>,
): Promise<ResolvedRouting> {
  const plan: AiPlanName =
    userPlan === "ultra" ? "ultra" : userPlan === "pro" ? "pro" : "free";
  const rangesPlan = plan === "free" ? "free" : "pro";
  const rangesKey = `${rangesPlan}_routing_ranges`;
  const rawRanges = cfg[rangesKey];
  const legacyGeminiModel =
    plan === "ultra"
      ? cfg.ai_model_ultra || defaultGeminiModelForPlan(plan)
      : plan === "pro"
        ? cfg.ai_model_pro || defaultGeminiModelForPlan(plan)
        : cfg.ai_model_free || defaultGeminiModelForPlan(plan);

  const resolveKey = (
    provider: AiProviderName,
    keySlot?: RoutingRange["key_slot"],
  ) => {
    if (provider === "groq") return cfg.groq_api_key || "";
    if (keySlot === "key2") {
      return cfg.ai_api_key_2 || cfg.ai_api_key || env.GEMINI_API_KEY || "";
    }
    return cfg.ai_api_key || env.GEMINI_API_KEY || cfg.ai_api_key_2 || "";
  };

  const geminiFallback = (modelSetting?: string): ResolvedRouting => ({
    provider: "gemini",
    apiKey: resolveKey("gemini", "key1"),
    model: coerceModelForProvider(
      modelSetting || legacyGeminiModel,
      "gemini",
      plan,
    ),
  });

  // If no routing ranges configured, fall back to simple legacy key/model
  if (!rawRanges) {
    return geminiFallback();
  }

  let ranges: RoutingRange[] = [];
  try {
    ranges = JSON.parse(rawRanges);
  } catch {
    // JSON parse failed — fallback gracefully
    return geminiFallback();
  }

  // Find the matching range for current token usage
  const matchedRange = ranges.find((r) => {
    const from = r.from ?? 0;
    const to = r.to;
    if (tokensUsed < from) return false;
    if (to === null || to === undefined) return true; // open-ended upper bound
    return tokensUsed < to;
  });

  if (!matchedRange) {
    // No range matched (shouldn’t happen with a well-formed config that ends in null)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `استهلكت رصيدك الشهري من الذكاء الاصطناعي. يتجدد تلقائياً في بداية الشهر الجاي.`,
    });
  }

  // Block range
  if (matchedRange.action === "block") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        matchedRange.message ||
        `وصلت للحد الشهري. يتجدد تلقائياً في بداية الشهر الجاي.`,
    });
  }

  // Resolve API key from the selected provider. Provider wins over a mismatched slot.
  const provider: AiProviderName =
    matchedRange.provider ??
    (matchedRange.key_slot === "groq" ? "groq" : "gemini");
  const keySlot =
    matchedRange.key_slot ?? (provider === "groq" ? "groq" : "key1");
  const resolvedKey = resolveKey(provider, keySlot);

  if (!resolvedKey) {
    // Key slot configured but key is empty — fall back to Gemini-safe routing.
    return geminiFallback();
  }

  return {
    provider,
    apiKey: resolvedKey,
    model: coerceModelForProvider(
      matchedRange.model || defaultModelForProvider(provider, plan),
      provider,
      plan,
    ),
  };
}

async function trackTokens(
  userId: number,
  userType: string,
  tokens: number,
  channel: AiUsageChannel = "parse",
  model?: string,
) {
  if (!tokens || tokens <= 0) return;
  try {
    if (userType === "oauth") {
      await db
        .update(users)
        .set({ aiTokensUsed: sql`ai_tokens_used + ${tokens}` })
        .where(eq(users.id, userId));
    } else {
      await db
        .update(localUsers)
        .set({ aiTokensUsed: sql`ai_tokens_used + ${tokens}` })
        .where(eq(localUsers.id, userId));
    }
    await recordAiUsageEvent({
      userId,
      userType: userType as "oauth" | "local",
      channel,
      model,
      tokens,
    });
  } catch (err) {
    console.error("Failed to track tokens:", err);
  }
}

function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("voice_usage") &&
    (msg.includes("doesn't exist") ||
      msg.includes("ER_NO_SUCH_TABLE") ||
      msg.includes("Failed query:"))
  );
}

async function getVoiceSecondsSince(
  userId: number,
  userType: string,
  cycleStart: Date,
): Promise<number> {
  try {
    const usageResult = await db
      .select({ total: sql`COALESCE(SUM(duration_seconds), 0)` })
      .from(voiceUsage)
      .where(
        and(
          eq(voiceUsage.userId, userId),
          eq(voiceUsage.userType, userType),
          eq(voiceUsage.month, new Date().toISOString().slice(0, 7)),
        ),
      );
    return Number(usageResult[0]?.total || 0);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn("voice_usage table is missing. Falling back to 0 usage.");
      return 0;
    }
    throw err;
  }
}

function planValue<T>(values: Record<string, T>, plan: string, fallback: T): T {
  return Object.prototype.hasOwnProperty.call(values, plan)
    ? values[plan]
    : fallback;
}

async function getAiClient(
  taskType: "parse" | "report",
  userPlan: string = "free",
) {
  const settings = await db.select().from(systemSettings);
  const cfg: Record<string, string> = {};
  settings.forEach((s) => {
    if (s.value) cfg[s.key] = s.value;
  });

  let apiKey = cfg.ai_api_key || env.GEMINI_API_KEY;
  let apiKey2 = cfg.ai_api_key_2 || ""; // Loaded from admin settings only

  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
    apiKey = apiKey2;
  }

  // Model selection based on plan
  let modelName: string;
  let reportProvider = "gemini";
  let reportKeySlot = "key1";

  if (taskType === "parse") {
    if (userPlan === "ultra")
      modelName = cfg.ai_model_ultra || "gemini-2.5-pro";
    else if (userPlan === "pro")
      modelName = cfg.ai_model_pro || env.GEMINI_MODEL_PRO;
    else modelName = cfg.ai_model_free || env.GEMINI_MODEL_FREE;
  } else {
    // Analytics/Reports configuration
    const plan = userPlan === "ultra" ? "pro" : userPlan || "free";
    reportProvider = cfg[`report_provider_${plan}`] || "gemini";
    modelName =
      cfg[`report_model_${plan}`] ||
      cfg.ai_model_reports ||
      env.GEMINI_MODEL_REPORTS;
    reportKeySlot = cfg[`report_key_slot_${plan}`] || "key1";
  }
  modelName = mapModelName(modelName);

  const parseSafeInt = (val: string | undefined, def: string) => {
    const cleaned = String(val || def).replace(/[^\d]/g, "");
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? parseInt(def, 10) : parsed;
  };

  // Token limits per plan
  const tokenLimits = {
    free: parseSafeInt(cfg.free_token_limit, "50000"),
    pro: parseSafeInt(cfg.pro_token_limit, "500000"),
    ultra: parseSafeInt(cfg.ultra_token_limit, "2000000"),
  };

  // Per-request max tokens
  const maxPerRequest = {
    free: parseSafeInt(cfg.free_max_per_request, "4096"),
    pro: parseSafeInt(cfg.pro_max_per_request, "8192"),
    ultra: parseSafeInt(cfg.ultra_max_per_request, "8192"),
  };

  // Daily limits
  const dailyLimits = {
    free: parseSafeInt(cfg.free_daily_limit, "10"),
    pro: parseSafeInt(cfg.pro_daily_limit, "100"),
    ultra: parseSafeInt(cfg.ultra_daily_limit, "500"),
  };

  // Feature check
  const canUseAnalysis = cfg[`${userPlan}_ai_analysis`] !== "false";
  const canUseParse = cfg[`${userPlan}_ai_parse`] !== "false";

  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
    throw new Error("Demo Mode");
  }

  const plan = userPlan as "free" | "pro" | "ultra";

  // Report-specific settings (per-plan token limits + word targets from admin)
  const reportMaxTokens = {
    free: parseSafeInt(cfg.report_max_tokens_free, "1800"),
    pro: parseSafeInt(cfg.report_max_tokens_pro, "3500"),
    ultra: parseSafeInt(cfg.report_max_tokens_ultra, "8192"),
  };
  const reportWords = {
    free: parseSafeInt(cfg.report_words_free, "550"),
    pro: parseSafeInt(cfg.report_words_pro, "850"),
    ultra: parseSafeInt(cfg.report_words_ultra, "1500"),
  };
  const reportSubcats = {
    free: parseSafeInt(cfg.report_subcats_free, "15"),
    pro: parseSafeInt(cfg.report_subcats_pro, "20"),
    ultra: parseSafeInt(cfg.report_subcats_ultra, "20"),
  };
  const reportTopItems = {
    free: 0, // Free plan: no individual item descriptions
    pro: parseSafeInt(cfg.report_top_items_pro, "10"),
    ultra: parseSafeInt(cfg.report_top_items_ultra, "10"),
  };

  const channel: AiUsageChannel = taskType === "report" ? "report" : "parse";
  let safeMaxTokens: number;
  if (taskType === "report") {
    safeMaxTokens = capRequestOutputTokens(
      plan,
      "report",
      reportMaxTokens[plan] || 3500,
    );
  } else {
    const raw = maxPerRequest[plan] || 1024;
    safeMaxTokens = capRequestOutputTokens(plan, "parse", raw);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const aiModel = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: taskType === "report" ? 0.7 : 0.3,
      maxOutputTokens: safeMaxTokens,
    },
  });

  const groqApiKey = cfg.groq_api_key || "";

  return {
    aiModel,
    modelName,
    apiKey,
    apiKey2,
    groqApiKey,
    reportProvider,
    reportKeySlot,
    tokenLimit: tokenLimits[plan] || 50000,
    dailyLimit: dailyLimits[plan] || 10,
    maxPerRequest: maxPerRequest[plan] || 512,
    canUseAnalysis,
    canUseParse,
    freeTokenLimit: tokenLimits.free,
    proTokenLimit: tokenLimits.pro,
    // Report-specific config
    reportTargetWords: reportWords[plan] || 550,
    reportSubcatsLimit: reportSubcats[plan] || 15,
    reportTopItemsLimit: reportTopItems[plan] || 0,
    // Full cfg for dynamic routing resolution
    cfg,
  };
}

// Legacy parse functions have been removed.

export const aiRouter = router({
  // ─── Voice Settings ───

  // ─── Parse Expense (New Pipeline) ───
  parseExpense: aiProcedure
    .input(
      z.object({
        text: z.string(),
        model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
        skipClarification: z.boolean().optional(),
        inputChannel: z.enum(["text", "voice"]).default("text"),
        voiceModelUsed: z.string().optional(),
        sttTokensUsed: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const startTime = Date.now();
      // Check daily limits
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let dailyLimit = 10;
      let tokenLimit = 50000;
      let apiKey = env.GEMINI_API_KEY;
      let apiKey2 = "";
      let modelName = env.GEMINI_MODEL_FREE;
      let maxPerRequest = 512;

      try {
        const client = await getAiClient("parse", ctx.user.plan);
        if (!client.canUseParse) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "تحليل الرسائل بالذكاء الاصطناعي غير متاح في خطتك الحالية.",
          });
        }
        dailyLimit = client.dailyLimit;
        tokenLimit = client.tokenLimit;
        apiKey = client.apiKey;
        apiKey2 = client.apiKey2;
        modelName = client.modelName;
        maxPerRequest = client.maxPerRequest;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
      }

      const todayUsage = await countDailyAiRequests(ctx.user, "parse");
      if (todayUsage >= dailyLimit) {
        const upgradeTo = ctx.user.plan === "free" ? "برو" : "ألترا";
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `وصلت للحد اليومي (${dailyLimit} طلب). حدث لـ${upgradeTo}!`,
        });
      }

      const estimatedInputTokens = estimateTokensFromText(input.text) + 420;
      const budget = await assertAiBudget(
        ctx.user,
        "parse",
        estimatedInputTokens,
      );
      tokenLimit = budget.limit;
      maxPerRequest = clampOutputTokens(
        budget.perRequestMax,
        budget.remaining,
        estimatedInputTokens,
      );

      // ── Dynamic Routing: resolve correct provider/key/model based on tokens used ──
      let resolvedProvider: "gemini" | "groq" = "gemini";
      let resolvedGroqKey = "";
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // ── Run independent queries in parallel to speed up ──
      const [
        settings,
        userDictRows,
        currentMonthOps,
        smartProfile
      ] = await Promise.all([
        db.select().from(systemSettings),
        db.select().from(userDictionaries)
          .where(and(eq(userDictionaries.userId, ctx.user.id), eq(userDictionaries.userType, ctx.user.type))),
        db.select().from(expenses)
          .where(and(eq(expenses.userId, ctx.user.id), eq(expenses.userType, ctx.user.type), gte(expenses.date, startOfMonth))),
        getSmartProfile(ctx.user.id, ctx.user.type)
      ]);

      const cfgFull: Record<string, string> = {};
      settings.forEach((s) => {
        if (s.value) cfgFull[s.key] = s.value;
      });

      try {
        const routing = await resolveRoutingConfig(
          ctx.user.plan,
          budget.used,
          cfgFull,
        );
        resolvedProvider = routing.provider;
        resolvedGroqKey = routing.provider === "groq" ? routing.apiKey : "";
        apiKey = routing.apiKey;
        modelName = routing.model;
      } catch (routingErr) {
        if (routingErr instanceof TRPCError) throw routingErr;
        console.warn(
          "Routing config resolution failed, using defaults:",
          routingErr,
        );
      }

      const userDict = userDictRows.map((row) => ({ word: row.word, category: row.category, subCategory: row.subCategory ?? undefined }));
      const totalIncome = currentMonthOps.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
      const totalExpense = currentMonthOps.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      const personalContextRaw = buildPersonalContext(smartProfile);

      // --- INJECT KNOWN PEOPLE INTO USER DICT ---
      for (const p of personalContextRaw.knownPeople) {
        // GUARD: Only inject if category is specific enough (not neutral "تحويلات")
        // This prevents the rule engine from blindly categorizing people as "تحويلات"
        // and bypassing the person-resolver.
        const safeCategory = (p.category && p.category !== "تحويلات") ? p.category : null;
        if (safeCategory) {
          if (p.name && p.name.length >= 2) {
             userDict.push({ word: p.name, category: safeCategory, subCategory: p.subCategory });
          }
          const firstName = p.name.split(/\s+/)[0]; // Match on first name as fallback
          if (firstName && firstName.length >= 2 && firstName !== p.name) {
             userDict.push({ word: firstName, category: safeCategory, subCategory: p.subCategory });
          }
        }
      }

      const result = await runSmartPipeline({
        text: input.text,
        userId: ctx.user.id,
        userType: ctx.user.type,
        userPlan: ctx.user.plan,
        userDict,
        apiKey,
        apiKey2,
        modelName,
        maxTokens: maxPerRequest,
        monthlyContext: { totalIncome, totalExpense },
        userProfileContext: {
          promptSummary: summarizeProfileForAI(smartProfile),
          recentTransactions: currentMonthOps.slice(0, 50).map(e => ({ description: e.description, category: e.category, subCategory: e.subCategory })),
          personalContextPrompt: buildPersonalContextPrompt(personalContextRaw),
          spendingBehavior:
            typeof smartProfile.aiInferredAttributes?.spendingBehavior ===
            "string"
              ? smartProfile.aiInferredAttributes.spendingBehavior
              : undefined,
          hasChildren: smartProfile.lifestyleInfo.hasChildren as boolean | null,
          responsibleForFamily: smartProfile.lifestyleInfo
            .responsibleForFamily as boolean | null,
          supportsOthers: smartProfile.lifestyleInfo.supportsOthers,
          fixedMonthlyCommitments:
            smartProfile.lifestyleInfo.fixedMonthlyCommitments,
          isSmoker: smartProfile.lifestyleInfo.smoking === true,
          hasCar: Boolean(smartProfile.lifestyleInfo.carOwnership),
          hasDebt: Boolean((smartProfile.financialInfo as any)?.hasDebt),
          knownPeople: personalContextRaw.knownPeople,
        },
        skipClarification: input.skipClarification,
        // Dynamic routing
        provider: resolvedProvider,
        groqApiKey: resolvedGroqKey,
        pipelineSettings: {
            ...cfgFull,
            rag_api_key: cfgFull.rag_api_key || apiKey,
            rag_model: cfgFull.rag_model || "text-embedding-004",
            enable_rag: String(cfgFull.enable_rag !== "false"),
          },
      });

      // Track tokens
      if (result.tokensUsed > 0) {
        await trackTokens(
          ctx.user.id,
          ctx.user.type,
          result.tokensUsed,
          "parse",
          result.modelUsed,
        );
      }

      // ── Auto-learn dynamic contacts ──
      for (const item of result.items) {
        if (item.person_mentioned && item.person_relationship) {
          const pName = item.person_mentioned.trim();
          const pRel = item.person_relationship.trim();
          if (pName && pName !== "عام" && pName !== "شخص") {
            const { addDynamicContact } =
              await import("./services/user-profile-service");
            await addDynamicContact(
              ctx.user.id,
              ctx.user.type,
              pName,
              pRel,
            );
          }
        }
      }

      // ── Log classification ──
      const isV2 = false;
      await db
        .insert(classificationLogs)
        .values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          originalText: input.text,
          normalizedText: result.log.normalizedText,
          parsedBy: result.parsedBy,
          ruleEngineResult: result.log.ruleEngineResult,
          aiResult: result.log.aiResult,
          finalResult: result.items,
          confidence: result.overallConfidence,
          decision: result.decision,
          classificationVersion: isV2 ? "v2.2" : "v2.1",
          reasoningTraceLight: {
            entities: result.log.entitiesFound,
            ruleEngine: result.log.ruleEngineResult,
            ai: result.log.aiResult,
            routing: result.log.routing,
            ...(isV2
              ? {
                  pipelineVersion: "v2",
                  decompositionMethod: result.log.routing?.route || "unknown",
                  v2Stats: result.log.routing?.reason || "",
                }
              : {}),
          },
          ambiguityFlags: result.items.flatMap(
            (item: any) => item.ambiguityFlags || [],
          ),
          inputChannel: input.inputChannel,
          needsFollowup: result.decision === "clarify" || result.overallConfidence < 60,
          modelUsed: input.voiceModelUsed ? `STT: ${input.voiceModelUsed} | Parse: ${result.modelUsed}` : result.modelUsed,
          tokensUsed: result.tokensUsed + (input.sttTokensUsed || 0),
          processingTimeMs: result.processingTimeMs,
        })
        .catch(() => {});

      // Cache usage
      await db
        .insert(aiSummaries)
        .values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          period: "daily",
          periodValue: new Date().toISOString().split("T")[0],
          model: result.modelUsed,
          content: JSON.stringify(result.items || []),
        })
        .catch(() => {});

      let clarificationId: number | undefined;
      if (result.decision === "clarify") {
        try {
          // ─── Build queue of all unknown names upfront ───
          // Extract all person names from the text that need clarification.
          // This lets answerClarification ask about them sequentially without
          // re-running the full AI pipeline on each answer.
          const { extractPeople } = await import("./lib/entity-extractor");
          const { cleanPersonName, resolvePersonForTransaction } = await import("./lib/person-resolver");
          const allKnownNames = (personalContextRaw.knownPeople || []).map((p: any) => p.name).filter(Boolean) as string[];
          const detectedPeople = extractPeople(input.text, allKnownNames);
          
          // Find which of the detected people are unknown (need clarification)
          const unknownNames: string[] = [];
          for (const rawName of detectedPeople) {
            const cleanedName = cleanPersonName(rawName, input.text);
            if (!cleanedName) continue;
            const resolution = resolvePersonForTransaction({
              candidateName: cleanedName,
              transactionText: input.text,
              originalText: input.text,
              knownPeople: personalContextRaw.knownPeople || [],
            });
            if (resolution.needsClarification && !unknownNames.includes(cleanedName)) {
              unknownNames.push(cleanedName);
            }
          }

          // If no names extracted deterministically, extract the name from the clarification question
          if (unknownNames.length === 0 && result.clarificationQuestion) {
            const nameMatch = result.clarificationQuestion.match(/مين\s+(.*?)[\؟?]/);
            if (nameMatch?.[1]) {
              const nameFromQ = nameMatch[1].trim().replace(/[\؟?()،,]/g, "").trim();
              if (nameFromQ && nameFromQ.length >= 2) {
                unknownNames.push(nameFromQ);
              }
            }
          }

          // If multiple names need clarification, ask about all of them at once
          let firstQuestion = result.clarificationQuestion || "ممكن توضح أكتر؟";
          if (unknownNames.length === 1) {
            const firstRes = resolvePersonForTransaction({
              candidateName: unknownNames[0],
              transactionText: input.text,
              originalText: input.text,
              knownPeople: personalContextRaw.knownPeople || [],
            });
            firstQuestion = firstRes.clarificationQuestion || `مين ${unknownNames[0]}؟ (أخوك، صديقك، موظف عندك...)`;
          } else if (unknownNames.length > 1) {
            firstQuestion = `محتاج أوضح دول مين: ${unknownNames.join(" و ")}؟`;
          }

          await db.insert(pendingClarifications).values({
            userId: ctx.user.id,
            userType: ctx.user.type,
            question: firstQuestion,
            originalText: input.text,
            status: "pending",
            contextData: {
              items: result.items,
              decision: result.decision,
              confidence: result.overallConfidence,
              log: result.log,
              // Queue-based system: all names that need clarification
              pendingNames: unknownNames,
              resolvedAnswers: {},
            },
          });
          const [pending] = await db
            .select({ id: pendingClarifications.id })
            .from(pendingClarifications)
            .where(
              and(
                eq(pendingClarifications.userId, ctx.user.id),
                eq(pendingClarifications.userType, ctx.user.type),
                eq(pendingClarifications.status, "pending"),
              ),
            )
            .orderBy(desc(pendingClarifications.id))
            .limit(1);
          clarificationId = pending?.id;
          // Override the clarification question returned to frontend with the first one
          result.clarificationQuestion = firstQuestion;
        } catch (err) {
          console.error("Failed to insert pending clarification:", err);
          clarificationId = undefined;
        }
      }

      return {
        text: input.text,
        items: result.items,
        model: result.modelUsed,
        parsedBy: result.parsedBy,
        alertMessage: result.alertMessage,
        decision: result.decision,
        overallConfidence: result.overallConfidence,
        clarificationQuestion: result.clarificationQuestion,
        clarificationId,
        processingTimeMs: result.processingTimeMs,
      };
    }),

  // ─── Get User Limits (Voice, AI) ───
  getUserLimits: authedProcedure.query(async ({ ctx }) => {
    const settings = await db.select().from(systemSettings);
    const cfg: Record<string, string> = {};
    settings.forEach((s) => {
      if (s.value) cfg[s.key] = s.value;
    });

    const voiceLimits: Record<string, number> = {
      free: parseInt(cfg.voice_limit_free || "300"),
      pro: parseInt(cfg.voice_limit_pro || "1800"),
      ultra: parseInt(cfg.voice_limit_ultra || "0"),
    };

    const voicePerReq: Record<string, number> = {
      free: parseInt(cfg.voice_per_req_free || "60"),
      pro: parseInt(cfg.voice_per_req_pro || "180"),
      ultra: parseInt(cfg.voice_per_req_ultra || "300"),
    };

    // Calculate cycle start and end dates
    const now = new Date();
    let cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Attempt to get subscription for pro users
    if (ctx.user.plan !== "free") {
      const sub = await db.query.proSubscriptions.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.userId, ctx.user.id),
            eq(table.userType, ctx.user.type),
            eq(table.status, "active"),
          ),
      });
      if (sub) {
        cycleStart = sub.startDate;
        // Adjust cycleStart to current month/year relative to startDate day
        const day = cycleStart.getDate();
        const currentMonthCycle = new Date(
          now.getFullYear(),
          now.getMonth(),
          day,
        );
        if (now < currentMonthCycle) {
          cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, day);
        } else {
          cycleStart = currentMonthCycle;
        }
      }
    } else {
      // Free user: use account creation date
      const userRec =
        ctx.user.type === "oauth"
          ? await db.query.users.findFirst({
              where: (table, { eq }) => eq(table.id, ctx.user.id),
            })
          : await db.query.localUsers.findFirst({
              where: (table, { eq }) => eq(table.id, ctx.user.id),
            });

      if (userRec && userRec.createdAt) {
        const day = userRec.createdAt.getDate();
        const currentMonthCycle = new Date(
          now.getFullYear(),
          now.getMonth(),
          day,
        );
        if (now < currentMonthCycle) {
          cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, day);
        } else {
          cycleStart = currentMonthCycle;
        }
      }
    }

    const usedVoiceSeconds = await getVoiceSecondsSince(
      ctx.user.id,
      ctx.user.type,
      cycleStart,
    );
    const voiceLimit = planValue(voiceLimits, ctx.user.plan, 300);
    const aiBudget = await getAiBudget(ctx.user, "parse", cfg);
    const offlineLimit = ctx.user.plan === "free"
      ? parseInt(cfg.offline_limit_free || "3")
      : parseInt(cfg.offline_limit_pro || "30");

    return {
      ai: {
        limit: aiBudget.limit,
        used: aiBudget.used,
        remaining: aiBudget.limit > 0 ? aiBudget.remaining : -1,
        maxPerRequest: aiBudget.perRequestMax,
      },
      voice: {
        limit: voiceLimit,
        used: usedVoiceSeconds,
        remaining:
          voiceLimit > 0 ? Math.max(0, voiceLimit - usedVoiceSeconds) : -1,
        resetDate: new Date(
          cycleStart.getFullYear(),
          cycleStart.getMonth() + 1,
          cycleStart.getDate(),
        ).toISOString(),
        maxPerRequest: planValue(voicePerReq, ctx.user.plan, 60),
      },
      offline: {
        limit: offlineLimit,
      },
    };
  }),

  // ─── Speech-to-Text via Gemini ───
  speechToText: aiProcedure
    .input(
      z.object({
        audioBase64: z.string(),
        mimeType: z.string().default("audio/webm"),
        durationSeconds: z.number().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.audioBase64.length > 13333333) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "حجم الملف الصوتي كبير جداً. يرجى إرسال تسجيل أصغر من 10 ميجابايت.",
        });
      }

      const estimatedAudioTokens = Math.max(
        80,
        Math.ceil(input.durationSeconds * 14) +
          Math.ceil(input.audioBase64.length / 18_000),
      );
      await assertAiBudget(ctx.user, "speech", estimatedAudioTokens);

      // Get cycle start
      const now = new Date();
      let cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);

      if (ctx.user.plan !== "free") {
        const sub = await db.query.proSubscriptions.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.userId, ctx.user.id),
              eq(table.userType, ctx.user.type),
              eq(table.status, "active"),
            ),
        });
        if (sub) {
          const day = sub.startDate.getDate();
          const currentMonthCycle = new Date(
            now.getFullYear(),
            now.getMonth(),
            day,
          );
          cycleStart =
            now < currentMonthCycle
              ? new Date(now.getFullYear(), now.getMonth() - 1, day)
              : currentMonthCycle;
        }
      } else {
        const userRec =
          ctx.user.type === "oauth"
            ? await db.query.users.findFirst({
                where: (table, { eq }) => eq(table.id, ctx.user.id),
              })
            : await db.query.localUsers.findFirst({
                where: (table, { eq }) => eq(table.id, ctx.user.id),
              });
        if (userRec && userRec.createdAt) {
          const day = userRec.createdAt.getDate();
          const currentMonthCycle = new Date(
            now.getFullYear(),
            now.getMonth(),
            day,
          );
          cycleStart =
            now < currentMonthCycle
              ? new Date(now.getFullYear(), now.getMonth() - 1, day)
              : currentMonthCycle;
        }
      }

      // Check voice limits
      const usedSeconds = await getVoiceSecondsSince(
        ctx.user.id,
        ctx.user.type,
        cycleStart,
      );

      // Get voice limits from settings
      const settings = await db.select().from(systemSettings);
      const cfg: Record<string, string> = {};
      settings.forEach((s) => {
        if (s.value) cfg[s.key] = s.value;
      });

      const voiceLimits: Record<string, number> = {
        free: parseInt(cfg.voice_limit_free || "300"), // 5 min
        pro: parseInt(cfg.voice_limit_pro || "1800"), // 30 min
        ultra: parseInt(cfg.voice_limit_ultra || "0"), // unlimited
      };

      const voicePerReq: Record<string, number> = {
        free: parseInt(cfg.voice_per_req_free || "60"),
        pro: parseInt(cfg.voice_per_req_pro || "180"),
        ultra: parseInt(cfg.voice_per_req_ultra || "300"),
      };

      const limit = planValue(voiceLimits, ctx.user.plan, 300);
      const maxPerRequest = planValue(voicePerReq, ctx.user.plan, 60);

      if (input.durationSeconds > maxPerRequest) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `مدة التسجيل الواحد لا يمكن أن تتجاوز ${maxPerRequest} ثانية في خطتك الحالية.`,
        });
      }

      if (limit > 0 && usedSeconds >= limit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `وقت التسجيل الصوتي المتاح ليك خلص (${limit} ثانية/شهر). يرجى الترقية لـ Pro للحصول على المزيد!`,
        });
      }

      if (limit > 0 && usedSeconds + input.durationSeconds > limit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `مدة هذا التسجيل تتجاوز الرصيد المتبقي لك هذا الشهر. المتاح الآن ${Math.max(0, limit - usedSeconds)} ثانية فقط.`,
        });
      }

      // STT Plan Configuration
      const plan = ctx.user.plan === "ultra" ? "pro" : ctx.user.plan || "free";

      const sttProvider = cfg[`${plan}_stt_provider`] || "gemini";
      const sttModelSetting =
        cfg[`${plan}_stt_model`] || cfg.stt_model || "gemini-1.5-flash";
      const sttKeySlot = cfg[`${plan}_stt_key_slot`] || "key1";

      const sttModel = mapModelName(sttModelSetting);
      const fallbackModel = mapModelName(
        cfg.stt_fallback_model || "gemini-2.0-flash",
      );

      // Resolve keys dynamically:
      const getSTTKey = (modelName: string, slotPreference?: string) => {
        if (isGroqModel(modelName)) {
          return cfg.groq_api_key || process.env.GROQ_API_KEY || "";
        }
        // Gemini:
        const slot = slotPreference || sttKeySlot;
        if (slot === "key2" && cfg.ai_api_key_2) return cfg.ai_api_key_2;
        if (
          cfg.stt_api_key &&
          cfg.stt_api_key !== "YOUR_GEMINI_API_KEY_HERE"
        )
          return cfg.stt_api_key;
        return cfg.ai_api_key || env.GEMINI_API_KEY || "";
      };

      const cleanMimeType = input.mimeType.split(";")[0];
      const sttMode = cfg.stt_processing_mode || "standard";

      // Remove base64 data URI prefix if present (Gemini expects raw base64 string)
      const pureBase64 = input.audioBase64.includes(",")
        ? input.audioBase64.split(",")[1]
        : input.audioBase64;

      let result = null;
      let lastError = "Unknown error";

      try {
        const key = getSTTKey(sttModel);
        result = await runSTTPipeline(
          pureBase64,
          cleanMimeType,
          key,
          sttModel,
          sttMode,
        );
      } catch (e: any) {
        lastError = e.message;
        console.warn("STT with primary model failed:", e.message);
      }

      if (!result) {
        try {
          const key = getSTTKey(fallbackModel);
          result = await runSTTPipeline(
            pureBase64,
            cleanMimeType,
            key,
            fallbackModel,
            sttMode,
          );
        } catch (e: any) {
          lastError = e.message;
          console.warn("STT with fallback model failed:", e.message);
        }
      }

      if (!result && cfg.ai_api_key_2) {
        try {
          const key = getSTTKey(fallbackModel, "key2");
          result = await runSTTPipeline(
            pureBase64,
            cleanMimeType,
            key,
            fallbackModel,
            sttMode,
          );
        } catch (e: any) {
          lastError = e.message;
          console.warn("STT with secondary key failed:", e.message);
        }
      }

      if (!result) {
        try {
          const ultimateModel = "gemini-2.0-flash";
          const key = getSTTKey(ultimateModel, "key1");
          result = await runSTTPipeline(
            pureBase64,
            cleanMimeType,
            key,
            ultimateModel,
            sttMode,
          );
        } catch (e: any) {
          lastError = e.message;
          console.warn("STT ultimate fallback failed:", e.message);
        }
      }

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحويل الصوت: " + lastError,
        });
      }

      const currentMonthStr = new Date().toISOString().slice(0, 7);
      // Track voice usage
      try {
        await db.insert(voiceUsage).values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          durationSeconds: input.durationSeconds,
          month: currentMonthStr,
          source: "gemini_stt",
        });
      } catch (insertErr) {
        console.error("Failed to insert voice usage:", insertErr);
      }

      // Track tokens
      if (result.tokensUsed > 0) {
        await trackTokens(
          ctx.user.id,
          ctx.user.type,
          result.tokensUsed,
          "speech",
        );
      }

      const remaining =
        limit > 0
          ? Math.max(0, limit - usedSeconds - input.durationSeconds)
          : -1;

      return {
        text: result.text,
        tokensUsed: result.tokensUsed,
        modelUsed: result.modelUsed,
        remainingSeconds: remaining,
        remainingFormatted:
          remaining >= 0
            ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
            : "غير محدود",
      };
    }),

  // ─── STT + Parse Combined (Best Performance) ───
  parseVoiceExpense: aiProcedure
    .input(
      z.object({
        audioBase64: z.string(),
        mimeType: z.string().default("audio/webm"),
        durationSeconds: z.number().default(0),
        model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const startTime = Date.now();
      
      // 1. Run STT Logic (Simplified for performance)
      if (input.audioBase64.length > 13333333) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "حجم الملف الصوتي كبير جداً.",
        });
      }

      // Voice Limits Check
      const now = new Date();
      let cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const usedSeconds = await getVoiceSecondsSince(ctx.user.id, ctx.user.type, cycleStart);
      
      const settings = await db.select().from(systemSettings);
      const cfg: Record<string, string> = {};
      settings.forEach((s) => { if (s.value) cfg[s.key] = s.value; });

      const voiceLimit = parseInt(cfg.voice_limit_free || "300");
      const maxPerRequest = parseInt(cfg.voice_per_req_free || "60");

      if (input.durationSeconds > maxPerRequest) {
        throw new TRPCError({ code: "FORBIDDEN", message: `مدة التسجيل تجاوزت ${maxPerRequest} ثانية.` });
      }

      const plan = ctx.user.plan === "ultra" ? "pro" : ctx.user.plan || "free";
      const sttModelSetting = cfg[`${plan}_stt_model`] || cfg.stt_model || "gemini-1.5-flash";
      const sttModel = mapModelName(sttModelSetting);
      const getSTTKey = (targetModel: string) => {
        if (isGroqModel(targetModel)) {
          return cfg.groq_api_key || env.GROQ_API_KEY || "";
        }
        return cfg.ai_api_key || env.GEMINI_API_KEY || "";
      };
      const cleanMimeType = input.mimeType.split(";")[0];
      const pureBase64 = input.audioBase64.includes(",") ? input.audioBase64.split(",")[1] : input.audioBase64;

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // 1. Run STT and DB Logic Concurrently
      const sttPromise = (async () => {
        try {
          return await runSTTPipeline(pureBase64, cleanMimeType, getSTTKey(sttModel), sttModel, "standard");
        } catch (e: any) {
           console.error("[STT Error First Attempt]:", e?.message || e);
           try {
              return await runSTTPipeline(pureBase64, cleanMimeType, getSTTKey("gemini-2.0-flash"), "gemini-2.0-flash", "standard");
           } catch (e2: any) {
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل تحويل الصوت: " + e2.message });
           }
        }
      })();

      const dbPromise = Promise.all([
        db.select().from(userDictionaries).where(and(eq(userDictionaries.userId, ctx.user.id), eq(userDictionaries.userType, ctx.user.type))),
        db.select().from(expenses).where(and(eq(expenses.userId, ctx.user.id), eq(expenses.userType, ctx.user.type), gte(expenses.date, startOfMonth))),
        getSmartProfile(ctx.user.id, ctx.user.type)
      ]);

      const [sttResult, [userDictRows, currentMonthOps, smartProfile]] = await Promise.all([sttPromise, dbPromise]);
      
      const transcribedText = sttResult.text;

      if (!transcribedText || transcribedText.trim() === "") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لم نتمكن من سماع شيء. حاول مرة أخرى." });
      }

      // Track voice usage
      try {
        await db.insert(voiceUsage).values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          durationSeconds: input.durationSeconds,
          month: new Date().toISOString().slice(0, 7),
          source: "gemini_stt",
        });
      } catch (e) {}

      // 2. Run Parse Logic
      const client = await getAiClient("parse", ctx.user.plan);
      const estimatedInputTokens = estimateTokensFromText(transcribedText) + 420;
      const budget = await assertAiBudget(ctx.user, "parse", estimatedInputTokens);
      const maxParseTokens = clampOutputTokens(
        budget.perRequestMax,
        budget.remaining,
        estimatedInputTokens,
      );

      const userDict = userDictRows.map((row) => ({ word: row.word, category: row.category, subCategory: row.subCategory ?? undefined }));
      const personalContextRaw = buildPersonalContext(smartProfile);

      for (const p of personalContextRaw.knownPeople) {
        const safeCategory = p.category && p.category !== "تحويلات" ? p.category : null;
        if (!safeCategory) continue;
        if (p.name && p.name.length >= 2) {
          userDict.push({ word: p.name, category: safeCategory, subCategory: p.subCategory });
        }
        const firstName = p.name.split(/\s+/)[0];
        if (firstName && firstName.length >= 2 && firstName !== p.name) {
          userDict.push({ word: firstName, category: safeCategory, subCategory: p.subCategory });
        }
      }

      // ── Dynamic Routing for Voice Classification ──
      let resolvedProvider: "gemini" | "groq" = "gemini";
      let resolvedGroqKey = "";
      let apiKey = client.apiKey;
      let modelName = client.modelName;

      try {
        const routing = await resolveRoutingConfig(
          ctx.user.plan,
          budget.used,
          cfg
        );
        resolvedProvider = routing.provider;
        resolvedGroqKey = routing.provider === "groq" ? routing.apiKey : "";
        apiKey = routing.apiKey;
        modelName = routing.model;
      } catch (routingErr) {
        if (routingErr instanceof TRPCError) throw routingErr;
        console.warn(
          "Voice Routing config resolution failed, using defaults:",
          routingErr,
        );
      }
      
      const parseResult = await runSmartPipeline({
        text: transcribedText,
        userId: ctx.user.id,
        userType: ctx.user.type,
        userPlan: ctx.user.plan,
        userDict,
        apiKey: apiKey,
        apiKey2: client.apiKey2,
        modelName: modelName,
        maxTokens: maxParseTokens,
        monthlyContext: { 
           totalIncome: currentMonthOps.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0), 
           totalExpense: currentMonthOps.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0) 
        },
        userProfileContext: {
          promptSummary: summarizeProfileForAI(smartProfile),
          personalContextPrompt: buildPersonalContextPrompt(personalContextRaw),
          hasChildren: smartProfile.lifestyleInfo.hasChildren as boolean | null,
          responsibleForFamily: smartProfile.lifestyleInfo.responsibleForFamily as boolean | null,
          supportsOthers: smartProfile.lifestyleInfo.supportsOthers,
          fixedMonthlyCommitments: smartProfile.lifestyleInfo.fixedMonthlyCommitments,
          isSmoker: smartProfile.lifestyleInfo.smoking === true,
          hasCar: Boolean(smartProfile.lifestyleInfo.carOwnership),
          hasDebt: Boolean((smartProfile.financialInfo as any)?.hasDebt),
          knownPeople: personalContextRaw.knownPeople,
        },
        skipClarification: false,
        provider: resolvedProvider,
        groqApiKey: resolvedGroqKey,
        pipelineSettings: {
            ...cfg,
            rag_api_key: cfg.rag_api_key || apiKey,
            rag_model: cfg.rag_model || "text-embedding-004",
            enable_rag: String(cfg.enable_rag !== "false"),
          },
      });

      if (parseResult.tokensUsed > 0) {
        await trackTokens(ctx.user.id, ctx.user.type, parseResult.tokensUsed, "parse", parseResult.modelUsed);
      }

      const isV2 = false;
      await db.insert(classificationLogs).values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          originalText: transcribedText,
          normalizedText: parseResult.log.normalizedText,
          parsedBy: parseResult.parsedBy,
          ruleEngineResult: parseResult.log.ruleEngineResult,
          aiResult: parseResult.log.aiResult,
          finalResult: parseResult.items,
          confidence: parseResult.overallConfidence,
          decision: parseResult.decision,
          classificationVersion: "v2.1",
          reasoningTraceLight: {
            entities: parseResult.log.entitiesFound,
            ruleEngine: parseResult.log.ruleEngineResult,
            ai: parseResult.log.aiResult,
            routing: parseResult.log.routing,
          },
          ambiguityFlags: parseResult.items.flatMap((item: any) => item.ambiguityFlags || []),
          inputChannel: "voice",
          needsFollowup: parseResult.decision === "clarify" || parseResult.overallConfidence < 60,
          modelUsed: `STT: ${sttResult!.modelUsed} | Parse: ${parseResult.modelUsed}`,
          tokensUsed: parseResult.tokensUsed + sttResult!.tokensUsed,
          processingTimeMs: Date.now() - startTime,
        }).catch(() => {});

      let clarificationId: number | undefined;
      if (parseResult.decision === "clarify") {
        try {
          const { extractPeople } = await import("./lib/entity-extractor");
          const { cleanPersonName, resolvePersonForTransaction } = await import("./lib/person-resolver");
          const allKnownNames = (personalContextRaw.knownPeople || []).map((p: any) => p.name).filter(Boolean) as string[];
          const detectedPeople = extractPeople(transcribedText, allKnownNames);
          
          const unknownNames: string[] = [];
          for (const rawName of detectedPeople) {
            const cleanedName = cleanPersonName(rawName, transcribedText);
            if (!cleanedName) continue;
            const resolution = resolvePersonForTransaction({
              candidateName: cleanedName,
              transactionText: transcribedText,
              originalText: transcribedText,
              knownPeople: personalContextRaw.knownPeople || [],
            });
            if (resolution.needsClarification && !unknownNames.includes(cleanedName)) {
              unknownNames.push(cleanedName);
            }
          }

          if (unknownNames.length === 0 && parseResult.clarificationQuestion) {
            const nameMatch = parseResult.clarificationQuestion.match(/مين\s+(.*?)[\؟?]/);
            if (nameMatch?.[1]) {
              const nameFromQ = nameMatch[1].trim().replace(/[\؟?()،,]/g, "").trim();
              if (nameFromQ && nameFromQ.length >= 2) {
                unknownNames.push(nameFromQ);
              }
            }
          }

          const firstQuestion = unknownNames.length > 1
            ? `محتاج أوضح دول مين: ${unknownNames.join(" و ")}؟`
            : unknownNames.length === 1 
            ? `مين ${unknownNames[0]}؟ (أخوك، صديقك، موظف عندك...)`
            : (parseResult.clarificationQuestion || "ممكن توضح أكتر؟");

          await db.insert(pendingClarifications).values({
            userId: ctx.user.id,
            userType: ctx.user.type,
            question: firstQuestion,
            originalText: transcribedText,
            status: "pending",
            contextData: {
              items: parseResult.items,
              decision: parseResult.decision,
              confidence: parseResult.overallConfidence,
              log: parseResult.log,
              pendingNames: unknownNames,
              resolvedAnswers: {},
            },
          });
          const [pending] = await db
            .select({ id: pendingClarifications.id })
            .from(pendingClarifications)
            .where(
              and(
                eq(pendingClarifications.userId, ctx.user.id),
                eq(pendingClarifications.userType, ctx.user.type),
                eq(pendingClarifications.status, "pending"),
              ),
            )
            .orderBy(desc(pendingClarifications.id))
            .limit(1);
          clarificationId = pending?.id;
          parseResult.clarificationQuestion = firstQuestion;
        } catch (err) {
          console.error("Failed to insert pending voice clarification:", err);
          clarificationId = undefined;
        }
      }

      return {
        text: transcribedText, // Return the transcribed text so frontend can show it
        items: parseResult.items,
        model: parseResult.modelUsed,
        parsedBy: parseResult.parsedBy,
        alertMessage: parseResult.alertMessage,
        decision: parseResult.decision,
        overallConfidence: parseResult.overallConfidence,
        clarificationQuestion: parseResult.clarificationQuestion,
        clarificationId,
        processingTimeMs: Date.now() - startTime,
      };
    }),

  // ─── Financial Copilot: Personal Learning ───
  learnWord: authedProcedure
    .input(
      z.object({
        word: z.string(),
        category: z.string(),
        subCategory: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Upsert into user_dictionaries
      await db
        .insert(userDictionaries)
        .values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          word: input.word.trim().toLowerCase(),
          category: input.category,
          subCategory: input.subCategory || "عام",
        })
        .onDuplicateKeyUpdate({
          set: {
            category: input.category,
            subCategory: input.subCategory || "عام",
          },
        });
      return { success: true };
    }),

  // ─── Financial Copilot: Monthly Insights ───
  generateMonthlyInsights: authedProcedure
    .input(
      z.object({
        month: z.string(),
        model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if we already have a cached summary for this specific month (Fast Fallback & Token Conservation)
      const existingSummary = await db
        .select()
        .from(aiSummaries)
        .where(
          and(
            eq(aiSummaries.userId, ctx.user.id),
            eq(aiSummaries.userType, ctx.user.type),
            eq(aiSummaries.period, "monthly"),
            eq(aiSummaries.periodValue, input.month),
          ),
        )
        .limit(1);

      if (existingSummary[0]) {
        return {
          insights: existingSummary[0].content,
          cached: true,
          model: existingSummary[0].model,
        };
      }

      // ── 0. Rate Limiting Foundation (Reports Generation Limits) ──
      const lastSummary = await db
        .select()
        .from(aiSummaries)
        .where(
          and(
            eq(aiSummaries.userId, ctx.user.id),
            eq(aiSummaries.userType, ctx.user.type),
            eq(aiSummaries.period, "monthly"),
          ),
        )
        .orderBy(desc(aiSummaries.createdAt))
        .limit(1);

      if (lastSummary[0]) {
        const sysSettings = await db.select().from(systemSettings);
        const limits: Record<string, number> = { free: 30, pro: 14, ultra: 1 };
        sysSettings.forEach((s) => {
          if (s.key === "report_limit_free" && s.value)
            limits.free = parseInt(s.value);
          if (s.key === "report_limit_pro" && s.value)
            limits.pro = parseInt(s.value);
          if (s.key === "report_limit_ultra" && s.value)
            limits.ultra = parseInt(s.value);
        });

        const plan = ctx.user.plan || "free";
        const allowedDays = limits[plan] || 30;
        const daysSinceLast =
          (new Date().getTime() - (lastSummary[0]?.createdAt?.getTime() || 0)) /
          (1000 * 3600 * 24);

        if (allowedDays > 0 && daysSinceLast < allowedDays) {
          const remainingDays = Math.ceil(allowedDays - daysSinceLast);
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `متبقي ${remainingDays} يوم لطلب التقرير الذكي القادم في خطتك (${plan.toUpperCase()}). للترقية، قم بزيارة صفحة الاشتراك.`,
          });
        }
      }

      // ── 1. Backend Preprocessing (saves 80% tokens) ──
      const [year, month] = input.month.split("-");
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      const daysInMonth = endDate.getDate();

      // Current month expenses
      const userExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id),
            eq(expenses.userType, ctx.user.type),
            gte(expenses.date, startDate),
            lte(expenses.date, endDate),
          ),
        );

      if (userExpenses.length === 0) {
        return {
          insights: JSON.stringify({
            response_text:
              "مفيش مصاريف مسجلة الشهر ده لسه. ابدأ سجل وهنحللك كل حاجة! 💰",
            alerts: [],
            personality_flag: "new_user",
            data_table: null,
          }),
          cached: false,
          model: "backend",
        };
      }

      // Previous month for comparison
      const prevStart = new Date(parseInt(year), parseInt(month) - 2, 1);
      const prevEnd = new Date(parseInt(year), parseInt(month) - 1, 0);
      const prevExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id),
            eq(expenses.userType, ctx.user.type),
            gte(expenses.date, prevStart),
            lte(expenses.date, prevEnd),
          ),
        );

      // Get smart user profile for personalization context
      const userProfile = await getSmartProfile(ctx.user.id, ctx.user.type);
      const previousAiAttributes = userProfile.aiInferredAttributes;
      const behaviorSnapshot = buildBehaviorSnapshot(
        userExpenses,
        prevExpenses,
        userProfile,
      );
      const reportPersonalizationContext = buildReportPersonalizationContext(
        userProfile,
        behaviorSnapshot,
      );
      const personalCtx = buildPersonalContext(userProfile);
      const familyReportContext = buildFamilyReportContext(personalCtx);
      const personalContextForClassification =
        buildPersonalContextPrompt(personalCtx);

      // Financial month context — salary day awareness for AI reports
      let financialMonthContext = "";
      const salaryDay =
        Number((userProfile.financialInfo as any).salaryDay) || 0;
      if (salaryDay > 0) {
        const { buildFinancialMonthPrompt } =
          await import("./services/financial-month");
        financialMonthContext = buildFinancialMonthPrompt(
          salaryDay,
          input.month,
        );
      }

      // ── 2. Backend Calculations ──
      const totalExpense = userExpenses
        .filter((e) => e.type === "expense")
        .reduce((s, e) => s + Number(e.amount), 0);
      const totalIncome = userExpenses
        .filter((e) => e.type === "income")
        .reduce((s, e) => s + Number(e.amount), 0);
      const prevTotal = prevExpenses
        .filter((e) => e.type === "expense")
        .reduce((s, e) => s + Number(e.amount), 0);
      const dailyAvg = Math.round(totalExpense / daysInMonth);

      // Category breakdown
      const byCategory: Record<string, number> = {};
      userExpenses
        .filter((e) => e.type === "expense")
        .forEach((e) => {
          byCategory[e.category] =
            (byCategory[e.category] || 0) + Number(e.amount);
        });
      const sortedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
      const topCategory = sortedCats[0];
      const topCategoryPercent = topCategory
        ? Math.round((topCategory[1] / totalExpense) * 100)
        : 0;

      // ── Subcategory breakdown (PRIMARY focus for reports) ──
      const bySubCategory: Record<string, { amount: number; mainCat: string }> =
        {};
      userExpenses
        .filter((e) => e.type === "expense")
        .forEach((e) => {
          const subKey =
            e.subCategory && e.subCategory !== "عام"
              ? `${e.category} > ${e.subCategory}`
              : e.category;
          if (!bySubCategory[subKey])
            bySubCategory[subKey] = { amount: 0, mainCat: e.category };
          bySubCategory[subKey].amount += Number(e.amount);
        });
      const sortedSubs = Object.entries(bySubCategory).sort(
        (a, b) => b[1].amount - a[1].amount,
      );
      const topSubCategories = sortedSubs.map(([name, data]) => ({
        name,
        amount: data.amount,
        mainCat: data.mainCat,
        percent:
          totalExpense > 0 ? Math.round((data.amount / totalExpense) * 100) : 0,
      }));

      // Previous month category comparison
      const prevByCategory: Record<string, number> = {};
      prevExpenses
        .filter((e) => e.type === "expense")
        .forEach((e) => {
          prevByCategory[e.category] =
            (prevByCategory[e.category] || 0) + Number(e.amount);
        });
      const catChanges: Array<{
        cat: string;
        current: number;
        prev: number;
        changePercent: number;
      }> = [];
      for (const [cat, amount] of sortedCats) {
        const prev = prevByCategory[cat] || 0;
        const change =
          prev > 0 ? Math.round(((amount - prev) / prev) * 100) : 100;
        catChanges.push({ cat, current: amount, prev, changePercent: change });
      }

      // Monthly change
      const monthlyChange =
        prevTotal > 0
          ? Math.round(((totalExpense - prevTotal) / prevTotal) * 100)
          : 0;

      // ── 3. Financial Personality Detection (Backend) ──
      const flexCats = ["ترفيه", "تسوق", "أكل وشرب", "رفاهية", "هدايا"];
      const currentFlexSpend = sortedCats
        .filter(([k]) => flexCats.includes(k))
        .reduce((s, [, v]) => s + v, 0);
      const flexPercent =
        totalExpense > 0
          ? Math.round((currentFlexSpend / totalExpense) * 100)
          : 0;
      let personality = "balanced";
      if (flexPercent > 45) personality = "impulsive";
      else if (flexPercent < 15 && totalExpense > 0)
        personality = "conservative";
      if (monthlyChange > 30) personality = "stressed";

      // ── 4. Smart Alerts (Backend) ──
      const alerts: string[] = [];
      if (topCategory && topCategoryPercent > 60) {
        alerts.push(
          `⚠️ ${topCategory[0]} واخد ${topCategoryPercent}% من ميزانيتك - اعتماد عالي على بند واحد`,
        );
      }
      if (monthlyChange > 20 && prevTotal > 0)
        alerts.push(`📈 مصاريفك زادت ${monthlyChange}% عن الشهر اللي فات`);
      if (monthlyChange < -15 && prevTotal > 0)
        alerts.push(
          `✅ أحسنت! مصاريفك قلت ${Math.abs(monthlyChange)}% عن الشهر اللي فات`,
        );

      const comparisonIncome =
        totalIncome > 0
          ? totalIncome
          : Number(
              userProfile.financialInfo.averageMonthlyIncome ||
                userProfile.legacy.monthlyIncome ||
                0,
            );
      const incomeRatio =
        comparisonIncome > 0
          ? Math.round((totalExpense / comparisonIncome) * 100)
          : null;

      if (incomeRatio && incomeRatio > 90)
        alerts.push(`🚨 صرفت ${incomeRatio}% من دخلك - خطر على الميزانية!`);
      if (incomeRatio && incomeRatio < 50 && totalExpense > 0)
        alerts.push(`💰 مذهل! أنت بتوفر أكتر من نص دخلك.`);

      // ── 4.5. Perfect AI Mimicry & Memory (Recurring, Pattern, Forecast) ──
      // Recurring Detection (Bills & Subscriptions)
      const recurringBills: string[] = [];
      const billCategories = ["فواتير", "اشتراكات", "سكن"];
      const currentBills = userExpenses.filter(
        (e) =>
          billCategories.includes(e.category) ||
          (e.subCategory && e.subCategory.includes("اشتراك")),
      );
      const prevBills = prevExpenses.filter(
        (e) =>
          billCategories.includes(e.category) ||
          (e.subCategory && e.subCategory.includes("اشتراك")),
      );

      prevBills.forEach((pb) => {
        // Check if a similar bill was paid this month (by category/description match)
        const isPaid = currentBills.some(
          (cb) =>
            cb.category === pb.category &&
            (cb.description === pb.description ||
              Math.abs(Number(cb.amount) - Number(pb.amount)) < 50),
        );
        if (!isPaid && !recurringBills.some((r) => r.includes(pb.category))) {
          recurringBills.push(
            `${pb.description || pb.category} (~${pb.amount} ج.م)`,
          );
        }
      });

      // Pattern Memory
      const prevFlexSpend = prevExpenses
        .filter((e) => flexCats.includes(e.category))
        .reduce((s, e) => s + Number(e.amount), 0);
      let patternMemory = "";
      if (prevFlexSpend > 0) {
        if (currentFlexSpend > prevFlexSpend + 100) {
          patternMemory = `تنبيه نمط سلوكي: إنفاق المستخدم على "الرفاهيات" (المطاعم/التسوق) ارتفع هذا الشهر بشكل ملحوظ مقارنة بالشهر الماضي (${currentFlexSpend} ج.م مقابل ${prevFlexSpend} ج.م).`;
        } else if (currentFlexSpend < prevFlexSpend - 100) {
          patternMemory = `نمط إيجابي: المستخدم نجح في تقليل إنفاقه على "الرفاهيات" بشكل ممتاز مقارنة بالشهر الماضي (${currentFlexSpend} ج.م مقابل ${prevFlexSpend} ج.م).`;
        } else {
          patternMemory = `نمط مستقر: إنفاق المستخدم على "الرفاهيات" شبه ثابت حول مستوى ${currentFlexSpend} ج.م.`;
        }
      }

      // Financial Forecasting
      const today = new Date();
      let forecast = "";
      // Only forecast if looking at current month
      if (
        today.getMonth() === endDate.getMonth() &&
        today.getFullYear() === endDate.getFullYear()
      ) {
        const currentDay = Math.max(1, today.getDate());
        const runRate = Math.round((totalExpense / currentDay) * daysInMonth);
        if (comparisonIncome > 0) {
          if (runRate > comparisonIncome) {
            const runwayDays = Math.floor(
              comparisonIncome / (totalExpense / currentDay),
            );
            forecast = `تحذير سيولة (Burn Rate): استمرار الإنفاق بهذا المعدل سيؤدي إلى نفاد الميزانية المتبقية في يوم ${runwayDays} من الشهر (الاستهلاك المتوقع ${runRate}، الدخل ${comparisonIncome}).`;
          } else {
            const projectedSavings = comparisonIncome - runRate;
            forecast = `توقع مالي آمن: المعدل الحالي ممتاز، المتوقع بنهاية الشهر توفير حوالي ${projectedSavings} ج.م.`;
          }
        }
      }

      // ── 5. Build summary for AI (DYNAMIC per plan - controlled from dashboard) ──
      // Get report config from the client (set in getAiClient based on admin dashboard settings)
      let reportTargetWords = 550;
      let reportSubcatsLimit = 15;
      let reportTopItemsLimit = 0;
      let aiModel: any;
      let reportProvider = "gemini";
      let reportApiKey = env.GEMINI_API_KEY;
      let groqApiKey = "";
      let modelName = "backend";
      let aiResponseLength = "medium";
      let aiFocus = "balanced";
      let aiSystemPrompt =
        "[Persona] مستشار مالي مصري ذكي ومتعاطف. لغتك عامية مصرية راقية ومبسطة، وتتحدث وكأنك إنسان حقيقي.\n[Rules]\n1. لا تستخدم العناوين الآلية (مثل التطبيع أو السببية).\n2. واجه المستخدم بالأرقام الحقيقية.\n3. قدم نصائح عملية مصممة خصيصاً للمستخدم بناءً على سلوكه المالي.";
      let aiAdvancedInstructions = "";
      let aiReportStructureOverride = "";

      try {
        const client = await getAiClient("report", ctx.user.plan);
        if (!client.canUseAnalysis) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "التحليلات الشهرية بالذكاء الاصطناعي غير متاحة في خطتك الحالية.",
          });
        }
        aiModel = client.aiModel;
        modelName = client.modelName;
        reportProvider = client.reportProvider || "gemini";
        reportApiKey = client.apiKey;
        groqApiKey = client.groqApiKey;
        reportTargetWords = client.reportTargetWords;
        reportSubcatsLimit = client.reportSubcatsLimit;
        reportTopItemsLimit = client.reportTopItemsLimit;

        const settings = await db.select().from(systemSettings);
        settings.forEach((s) => {
          if (s.key === "ai_response_length" && s.value)
            aiResponseLength = s.value;
          if (s.key === "ai_focus" && s.value) aiFocus = s.value;
          if (s.key === "ai_system_prompt" && s.value) aiSystemPrompt = s.value;
          if (s.key === "ai_advanced_instructions" && s.value)
            aiAdvancedInstructions = s.value;
          if (s.key === "ai_report_structure_override" && s.value)
            aiReportStructureOverride = s.value;
        });

        // Check token limit
        const tokenField =
          ctx.user.type === "oauth"
            ? await db
                .select({ t: users.aiTokensUsed })
                .from(users)
                .where(eq(users.id, ctx.user.id))
            : await db
                .select({ t: localUsers.aiTokensUsed })
                .from(localUsers)
                .where(eq(localUsers.id, ctx.user.id));
        const usedTokens = tokenField[0]?.t || 0;
        const limit = client.tokenLimit;
        if (usedTokens >= limit) {
          aiModel = null;
          modelName = "backend";
        }
      } catch (e) {
        if (e instanceof TRPCError) throw e;
      }

      // ── Dynamic Data Feed (subcategories depth + item descriptions based on plan) ──
      const subCatSummary = topSubCategories
        .slice(0, reportSubcatsLimit)
        .map((s) => `${s.name}: ${s.amount}ج (${s.percent}%)`)
        .join(" | ");

      // Build top items list (descriptions of biggest/most recurring expenses) for Pro/Ultra
      let topItemsContext = "";
      if (reportTopItemsLimit > 0) {
        const expenseItems = userExpenses.filter((e) => e.type === "expense");
        // Top items by amount (biggest purchases) - locally anonymized
        const biggestItems = [...expenseItems]
          .sort((a, b) => Number(b.amount) - Number(a.amount))
          .slice(0, Math.ceil(reportTopItemsLimit / 2))
          .map((e) =>
            redactSensitiveData(
              `${e.description || e.category}${e.subCategory && e.subCategory !== "عام" ? ` (${e.subCategory})` : ""}: ${e.amount}ج [${e.category}]`,
            ),
          );
        // Most recurring items (by description frequency) - locally anonymized
        const descFreq: Record<
          string,
          { count: number; total: number; cat: string; subCat: string }
        > = {};
        expenseItems.forEach((e) => {
          const key = e.description || e.category;
          if (!descFreq[key])
            descFreq[key] = {
              count: 0,
              total: 0,
              cat: e.category,
              subCat: e.subCategory || "عام",
            };
          descFreq[key].count++;
          descFreq[key].total += Number(e.amount);
        });
        const recurringItemsList = Object.entries(descFreq)
          .filter(([, v]) => v.count >= 2)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, Math.ceil(reportTopItemsLimit / 2))
          .map(([name, v]) =>
            redactSensitiveData(
              `${name} (${v.subCat}): ${v.count} مرات، إجمالي ${v.total}ج [${v.cat}]`,
            ),
          );

        if (biggestItems.length > 0 || recurringItemsList.length > 0) {
          topItemsContext = `\n--- تفاصيل العمليات الفردية ---`;
          if (biggestItems.length > 0)
            topItemsContext += `\nأكبر العمليات هذا الشهر: ${biggestItems.join(" | ")}`;
          if (recurringItemsList.length > 0)
            topItemsContext += `\nالعمليات المتكررة: ${recurringItemsList.join(" | ")}`;
        }
      }

      const summaryForAI = `الشهر: ${input.month}
إجمالي المصاريف: ${totalExpense} ج.م | الدخل: ${comparisonIncome} ج.م
${prevTotal > 0 ? `تغير إجمالي المصاريف عن الشهر السابق: ${monthlyChange > 0 ? "+" : ""}${monthlyChange}%` : "هذا أول شهر يتم تسجيله"}
أكبر بند إنفاق رئيسي: ${topCategory ? `${topCategory[0]} (${topCategoryPercent}%)` : "لا يوجد"}
تفاصيل الفئات الفرعية (الأكثر استهلاكاً): ${subCatSummary}
تغيرات الفئات عن الشهر السابق: ${catChanges
        .slice(0, 6)
        .map(
          (c) =>
            `${c.cat}: ${c.current}ج ${c.prev > 0 ? `(${c.changePercent > 0 ? "+" : ""}${c.changePercent}%)` : ""}`,
        )
        .join(" | ")}
متوسط الإنفاق اليومي الفعلي: ${dailyAvg} ج.م
الشخصية المالية التحليلية: ${personality}
عدد المعاملات: ${userExpenses.length}${topItemsContext}
---
الذكاء المالي المتقدم (Perfect Memory & Mimicry):
- ذاكرة الأنماط: ${patternMemory || "لا يوجد بيانات كافية للمقارنة التاريخية"}
- فواتير واشتراكات متوقعة قريباً: ${recurringBills.length > 0 ? recurringBills.join(" | ") : "لا يوجد فواتير معلقة مكتشفة بناءً على السجل السابق"}
- التوقع المالي المستقبلي (Forecasting): ${forecast || "غير متاح لعدم كفاية بيانات الدخل/الأيام"}`;

      // ── 6. Try AI, fallback to backend ──
      const personalizedSummaryForAI = `${summaryForAI}
---
${reportPersonalizationContext}
${familyReportContext}
${personalContextForClassification}
${financialMonthContext}`;

      let responseJson: any;
      let aiErrorMsg = "";

      if (aiModel || reportProvider === "groq" || isGroqModel(modelName)) {
        try {
          const planId = asPlan(ctx.user.plan);
          const useProReportEngine = planId === "pro" || planId === "ultra";

          if (useProReportEngine) {
            const proSummary: ProReportBackendSummary = {
              month: input.month,
              totalExpense,
              totalIncome: comparisonIncome,
              netFlow: totalIncome - totalExpense,
              dailyAvg,
              monthlyChangePercent: monthlyChange,
              topSubCategories: topSubCategories.map((s) => ({
                name: s.name,
                amount: s.amount,
                percent: s.percent,
              })),
              alerts,
              personality,
              forecast: forecast || undefined,
              patternMemory: patternMemory || undefined,
              recurringBills: recurringBills.length
                ? recurringBills
                : undefined,
              transactionCount: userExpenses.length,
            };
            const { systemInstruction, userPrompt } = buildProReportPrompt({
              profile: userProfile,
              snapshot: behaviorSnapshot,
              summary: proSummary,
              targetWords: reportTargetWords,
              topItemsContext,
            });
            let raw = "";
            let tokens = 0;
            if (reportProvider === "groq" || isGroqModel(modelName)) {
              const res = await callGroqAPI(
                groqApiKey || reportApiKey,
                modelName,
                systemInstruction,
                userPrompt,
                capRequestOutputTokens(planId, "report", reportTargetWords * 4),
              );
              raw = res.text;
              tokens = res.tokensUsed;
            } else {
              const genAI = new GoogleGenerativeAI(reportApiKey);
              const proReportModel = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction,
                generationConfig: {
                  temperature: 0.65,
                  maxOutputTokens: capRequestOutputTokens(
                    planId,
                    "report",
                    reportTargetWords * 4,
                  ),
                  responseMimeType: "application/json",
                },
              });
              const result = await proReportModel.generateContent(userPrompt);
              raw = result.response
                .text()
                .replace(/```json?/g, "")
                .replace(/```/g, "")
                .trim();
              tokens = result.response.usageMetadata?.totalTokenCount || 0;
            }
            await trackTokens(
              ctx.user.id,
              ctx.user.type,
              tokens,
              "report",
              `pro_report:${modelName}`,
            );
            try {
              responseJson = JSON.parse(raw);
            } catch {
              const match = raw.match(/\{[\s\S]*\}/);
              if (match) responseJson = JSON.parse(match[0]);
            }
          } else {
            let lengthInstruction =
              "اكتب تحليلاً متوازناً ومناسباً للشرح بأسلوب مهني.";
            if (aiResponseLength === "short")
              lengthInstruction =
                "اكتب موجزاً تنفيذياً (Executive Summary) مختصراً ومباشراً وضع النقاط الأساسية للقرار المالي.";
            if (aiResponseLength === "detailed")
              lengthInstruction =
                "اكتب تقريراً مالياً (Financial Report) متعمقاً جداً ومفصلاً يشرح كل الجوانب، ويحلل المخاطر، والفرص، والأنماط بشكل دقيق واحترافي.";

            lengthInstruction += ` (ملاحظة: النظام يحتوي على تفاصيل ${userExpenses.length} معاملة. يرجى تكييف كثافة وعمق التقرير ليعكس هذا الحجم من البيانات بدقة).`;

            let focusInstruction =
              "ركز على إعطاء مزيج متوازن بين الإحصائيات، ومؤشرات الأداء، والتوصيات.";
            if (aiFocus === "statistics")
              focusInstruction =
                "ركز بشكل كامل على الأرقام، النسب المئوية، والمقارنات الإحصائية الدقيقة، والمؤشرات المالية مثل معدل الحرق المالي والادخار.";
            if (aiFocus === "tips")
              focusInstruction =
                "ركز بشكل كبير على تقديم توصيات استراتيجية وحلول عملية لإعادة هيكلة الميزانية وتحسين كفاءة الإنفاق.";
            if (aiFocus === "patterns")
              focusInstruction =
                "ركز على اكتشاف الأنماط السلوكية، وتفسير توجهات الإنفاق (Spending Trends)، وتقييم السلوك المالي على المدى الطويل.";

            // ── Dynamic structure instruction based on target word count from admin dashboard ──
            let structureInstruction: string;
            let sectionCount: number = 4;

            if (
              aiReportStructureOverride &&
              aiReportStructureOverride.trim() !== ""
            ) {
              structureInstruction = aiReportStructureOverride;
              sectionCount = 0; // Not explicitly defined when overridden
            } else {
              if (reportTargetWords <= 300) {
                sectionCount = 2;
                structureInstruction = `اكتب ملخصاً مالياً مركزاً (${reportTargetWords} كلمة تقريباً) مقسم إلى ${sectionCount} قسم: (1) الوضع المالي العام بالأرقام، (2) أهم توصية عملية.`;
              } else if (reportTargetWords <= 600) {
                sectionCount = 3;
                structureInstruction = `اكتب تقريراً مالياً (${reportTargetWords} كلمة تقريباً) مقسم إلى ${sectionCount} أقسام مفصلة:
القسم 1 - نظرة عامة: اعرض الأرقام الأساسية (الدخل، المصروف، الصافي، المتوسط اليومي) مع تعليق عليها.
القسم 2 - تحليل الفئات: حلل أعلى 3-5 فئات إنفاق بالتفصيل مع النسب والمقارنة بالشهر السابق.
القسم 3 - التوصيات: قدم 3-4 نصائح عملية ومحددة بأرقام (مثلاً "قلل بند X من Y إلى Z").`;
              } else if (reportTargetWords <= 1000) {
                sectionCount = 4;
                structureInstruction = `اكتب تقريراً مالياً شاملاً (${reportTargetWords} كلمة تقريباً) مقسم إلى ${sectionCount} أقسام مفصلة:
القسم 1 - نظرة عامة: الأرقام الأساسية + المقارنة بالشهر السابق + تقييم الوضع المالي العام.
القسم 2 - تحليل الفئات الفرعية: حلل كل فئة فرعية بالتفصيل (قهوة/مطاعم/أجهزة إلكترونية/مواصلات...) مع ذكر الأوصاف والأماكن إن وُجدت.
القسم 3 - الأنماط السلوكية: اشرح نمط الإنفاق (اندفاعي؟ محافظ؟) مع نقاط القوة والضعف المالية.
القسم 4 - خطة التحسين: قدم 5+ توصيات استراتيجية مفصلة بأرقام مقترحة وجدول زمني.`;
              } else {
                sectionCount = 5;
                structureInstruction = `اكتب تقريراً مالياً عميقاً ومشبعاً (لا يقل عن ${reportTargetWords} كلمة) مقسم إجبارياً إلى ${sectionCount} أقسام رئيسية على الأقل:
القسم 1 - نظرة عامة شاملة: الأرقام الدقيقة + المقارنات + نسبة الاستهلاك من الدخل + تقييم السيولة.
القسم 2 - تحليل تفصيلي عميق: كل فئة فرعية وكل عملية فردية (ستاربكس، جرير، كارفور...) مع شرح السياق.
القسم 3 - الأنماط والتوجهات: تحليل سلوكي عميق مع شرح الأسباب المحتملة والمقارنة التاريخية.
القسم 4 - المخاطر المالية: تحليل السيولة (Burn Rate) + نقاط الضعف + سيناريوهات محتملة.
القسم 5 - خطة تحسين مفصلة: توصيات استراتيجية مع أرقام مقترحة لكل بند + جدول زمني + أهداف الشهر القادم.`;
              }
            }

            const advancedInstructionsStr =
              aiAdvancedInstructions.trim() !== ""
                ? aiAdvancedInstructions
                : `- تحدث بضمير المخاطب المباشر (أنت) كأنك تجلس مع المستخدم وجهاً لوجه.
- ادمج الأرقام الحقيقية من البيانات في التحليل بشكل طبيعي.
- إذا وُجدت تفاصيل عمليات فردية (أسماء أماكن/منتجات)، حللها بعمق واذكرها بالاسم.
- كل قسم يجب أن يكون فقرة طويلة كاملة (ليس مجرد جملة أو جملتين).`;

            const prompt = `${aiSystemPrompt}

**[تعليمة حاسمة]**: يجب أن يكون طول response_text حوالي ${reportTargetWords} كلمة عربية. هذا شرط غير قابل للتفاوض. إذا كان ردك أقصر من ${Math.round(reportTargetWords * 0.7)} كلمة، فأنت تخالف التعليمات.

[Instructions]
- ${lengthInstruction}
- ${focusInstruction}
- **الهيكل الإلزامي**: ${structureInstruction}
${advancedInstructionsStr}

[Context]
- تاريخ اليوم: ${new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- الشهر الذي يتم تحليله: ${input.month}

[Data]
${personalizedSummaryForAI}

[Output format] رد بصيغة JSON فقط. تذكر: response_text يجب أن يكون نصاً طويلاً ومفصلاً (حوالي ${reportTargetWords} كلمة):
{
  "response_text": "التقرير المالي المفصل هنا — يجب أن يكون ${reportTargetWords} كلمة تقريباً",
  "alerts": ["تنبيه 1", "تنبيه 2"],
  "personality_flag": "${personality}",
  "data_table": []
}`;

            let raw = "";
            let tokens = 0;
            if (reportProvider === "groq" || isGroqModel(modelName)) {
              const res = await callGroqAPI(
                groqApiKey || reportApiKey,
                modelName,
                aiSystemPrompt,
                prompt,
                capRequestOutputTokens(
                  ctx.user.plan,
                  "report",
                  reportTargetWords * 4,
                ),
              );
              raw = res.text;
              tokens = res.tokensUsed;
            } else if (aiModel) {
              const result = await aiModel.generateContent(prompt);
              raw = result.response
                .text()
                .replace(/```json?/g, "")
                .replace(/```/g, "")
                .trim();
              tokens = result.response.usageMetadata?.totalTokenCount || 0;
            }
            await trackTokens(
              ctx.user.id,
              ctx.user.type,
              tokens,
              "report",
              modelName,
            );

            try {
              responseJson = JSON.parse(raw);
            } catch (e: any) {
              const match = raw.match(/\{[\s\S]*\}/);
              if (match) {
                try {
                  responseJson = JSON.parse(match[0]);
                } catch (e2: any) {
                  console.error(
                    `Regex Parse Error: ${e2.message}\nRaw:\n${raw}`,
                  );
                }
              } else {
                console.error(
                  `No JSON matched.\nParse Error: ${e.message}\nRaw:\n${raw}`,
                );
              }
            }
          }
        } catch (err: any) {
          console.error(`AI Insights Error: ${err.message}\n${err.stack}`);
          if (err.message.includes("429") || err.message.includes("Quota"))
            aiErrorMsg =
              "تم استهلاك رصيد مفتاح الـ API (Quota Exceeded). يرجى إعداد مفتاح جديد من لوحة الإدارة.";
          else if (err.message.includes("key not valid"))
            aiErrorMsg =
              "مفتاح الذكاء الاصطناعي غير صالح. يرجى التأكد من الإعدادات.";
          else aiErrorMsg = err.message;
        }
      }

      // ── 7. Backend Fallback (still smart!) ──
      if (!responseJson) {
        modelName = "backend";
        let text = "";

        if (!aiModel) {
          text +=
            "💡 (ملاحظة: هذا التقرير تم توليده بواسطة النظام الأساسي لأنك استهلكت كل التوكنز المتاحة للذكاء الاصطناعي هذا الشهر. قم بالترقية لزيادة الحدود!)\n\n";
        } else {
          text += `💡 (ملاحظة: تم استخدام التحليل الأساسي بدلاً من الذكاء الاصطناعي للسبب التالي: ${aiErrorMsg})\n\n`;
        }

        if (topCategoryPercent > 50) {
          text += `عندك اعتماد عالي جداً على بند "${topCategory![0]}" (${topCategoryPercent}% من صرفك). أي زيادة بسيطة في البند ده ممكن تضغط ميزانيتك بشكل واضح.\n\n`;
        }
        if (monthlyChange > 0 && prevTotal > 0) {
          text += `مصاريفك زادت ${monthlyChange}% عن الشهر اللي فات. `;
          const biggestIncrease = catChanges.find(
            (c) => c.changePercent > 20 && c.prev > 0,
          );
          if (biggestIncrease)
            text += `أكبر زيادة كانت في "${biggestIncrease.cat}" (${biggestIncrease.changePercent}%).`;
          text += "\n\n";
        } else if (monthlyChange < 0 && prevTotal > 0) {
          text += `أحسنت! وفرت ${Math.abs(monthlyChange)}% عن الشهر اللي فات. كمل على كده! 💪\n\n`;
        }
        if (incomeRatio && incomeRatio > 80) {
          text += `⚠️ صرفت ${incomeRatio}% من دخلك. لازم تسيب هامش أمان 20% على الأقل.\n\n`;
        }
        text += `متوسط صرفك اليومي ${dailyAvg} ج.م (${totalExpense} ج.م إجمالي الشهر).`;
        if (personality === "impulsive")
          text +=
            "\n\nلاحظ إن نسبة كبيرة من صرفك على حاجات مرنة (ترفيه/تسوق). حاول تحط ليها حد شهري.";

        responseJson = {
          response_text: text,
          alerts,
          personality_flag: personality,
          personalization: buildBackendPersonalizedInsights(
            userProfile,
            behaviorSnapshot,
          ),
          data_table: sortedCats.slice(0, 5).map(([cat, amt]) => ({
            category: cat,
            amount: amt,
            percent: Math.round((amt / totalExpense) * 100),
            change: prevByCategory[cat]
              ? `${Math.round(((amt - prevByCategory[cat]) / prevByCategory[cat]) * 100)}%`
              : "جديد",
          })),
        };
      }

      const learnedAttributes = {
        ...behaviorSnapshot.inferredAttributes,
        financialPersonality: personality,
      };
      await saveSmartProfile(ctx.user.id, ctx.user.type, {
        ...userProfile,
        aiInferredAttributes: {
          ...userProfile.aiInferredAttributes,
          ...learnedAttributes,
        },
        lastAiRefreshAt: new Date(),
      }).catch(() => {});
      await db
        .insert(monthlyBehaviorSnapshots)
        .values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          month: input.month,
          totalIncome: behaviorSnapshot.totalIncome.toString(),
          totalExpense: behaviorSnapshot.totalExpense.toString(),
          netFlow: behaviorSnapshot.netFlow.toString(),
          topCategories: behaviorSnapshot.topCategories.slice(0, 10),
          topSubCategories: behaviorSnapshot.topSubCategories.slice(0, 10),
          spendingByDay: behaviorSnapshot.spendingByDay,
          spendingByWeekday: behaviorSnapshot.spendingByWeekday,
          behaviorFlags: behaviorSnapshot.behaviorFlags,
          inferredAttributes: learnedAttributes,
        })
        .onDuplicateKeyUpdate({
          set: {
            totalIncome: behaviorSnapshot.totalIncome.toString(),
            totalExpense: behaviorSnapshot.totalExpense.toString(),
            netFlow: behaviorSnapshot.netFlow.toString(),
            topCategories: behaviorSnapshot.topCategories.slice(0, 10),
            topSubCategories: behaviorSnapshot.topSubCategories.slice(0, 10),
            spendingByDay: behaviorSnapshot.spendingByDay,
            spendingByWeekday: behaviorSnapshot.spendingByWeekday,
            behaviorFlags: behaviorSnapshot.behaviorFlags,
            inferredAttributes: learnedAttributes,
          },
        })
        .catch(() => {});
      await recordProfileLearningEvent({
        userId: ctx.user.id,
        userType: ctx.user.type,
        eventType: "report_generation",
        previousAttributes: previousAiAttributes,
        newAttributes: learnedAttributes,
        metadata: {
          month: input.month,
          model: modelName,
          transactionCount: userExpenses.length,
        },
      });

      const insightsStr = JSON.stringify(responseJson);
      await db
        .insert(aiSummaries)
        .values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          period: "monthly",
          periodValue: input.month,
          model: modelName,
          content: insightsStr,
        })
        .catch(() => {});

      return { insights: insightsStr, cached: false, model: modelName };
    }),

  // ─── Compare Months ───
  compareMonths: authedProcedure
    .input(
      z.object({
        month1: z.string(),
        month2: z.string(),
        model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let aiModel: any;
      let modelName = "demo";
      try {
        const client = await getAiClient("report", ctx.user.plan);
        if (!client.canUseAnalysis) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "تحليلات المقارنة بالذكاء الاصطناعي غير متاحة في خطتك الحالية.",
          });
        }
        aiModel = client.aiModel;
        modelName = client.modelName;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
      }

      const getMonthData = async (monthStr: string) => {
        const [y, m] = monthStr.split("-");
        const start = new Date(parseInt(y), parseInt(m) - 1, 1);
        const end = new Date(parseInt(y), parseInt(m), 0);
        const exps = await db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, ctx.user.id),
              eq(expenses.userType, ctx.user.type),
              gte(expenses.date, start),
              lte(expenses.date, end),
            ),
          );
        return {
          total: exps.reduce((s, e) => s + Number(e.amount), 0),
          count: exps.length,
        };
      };

      const d1 = await getMonthData(input.month1);
      const d2 = await getMonthData(input.month2);

      const prompt = `قارن بين شهرين ماليا بالعامية المصرية:
${input.month1}: ${d1.total} جنيه (${d1.count} عملية)
${input.month2}: ${d2.total} جنيه (${d2.count} عملية)
اعمل مقارنة مختصرة.`;

      let comparison = "";
      try {
        if (!aiModel) throw new Error("Demo Mode or Client Error");
        const result = await aiModel.generateContent(prompt);
        comparison = result.response.text();
        const tokens = result.response.usageMetadata?.totalTokenCount || 0;
        await trackTokens(
          ctx.user.id,
          ctx.user.type,
          tokens,
          "report",
          modelName,
        );
      } catch (err) {
        console.error("AI Compare Error:", err);
        comparison = `(Fallback Mode) مقارنة بين الشهور:
مقارنة بين ${input.month1} و ${input.month2}.
مصاريف ${input.month1}: ${d1.total} جنيه
مصاريف ${input.month2}: ${d2.total} جنيه
الفرق هو ${Math.abs(d1.total - d2.total)} جنيه.`;
      }

      return { comparison, model: modelName, data: { month1: d1, month2: d2 } };
    }),

  // ─── Generate Yearly Insights ───
  generateYearlyInsights: authedProcedure
    .input(
      z.object({
        year: z.string(),
        model: z.enum(["flash", "pro", "ultra", "gemma"]).default("pro"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let aiModel: any;
      let modelName = "demo";
      try {
        const client = await getAiClient("report", ctx.user.plan);
        if (!client.canUseAnalysis) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "التحليلات السنوية بالذكاء الاصطناعي غير متاحة في خطتك الحالية.",
          });
        }
        aiModel = client.aiModel;
        modelName = client.modelName;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
      }

      const start = new Date(parseInt(input.year), 0, 1);
      const end = new Date(parseInt(input.year), 11, 31);
      const exps = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id),
            eq(expenses.userType, ctx.user.type),
            gte(expenses.date, start),
            lte(expenses.date, end),
          ),
        );

      const total = exps.reduce((s, e) => s + Number(e.amount), 0);
      const byMonth = exps.reduce(
        (acc, e) => {
          const m = new Date(e.date).getMonth() + 1;
          acc[m] = (acc[m] || 0) + Number(e.amount);
          return acc;
        },
        {} as Record<number, number>,
      );

      const prompt = `حلل مصاريف السنة ${input.year} بالعامية المصرية:
إجمالي: ${total} جنيه
الشهور: ${Object.entries(byMonth)
        .map(([k, v]) => `شهر ${k}: ${v}`)
        .join(", ")}
اعمل ملخص سنوي وتوقعات.`;

      let insights = "";
      try {
        if (!aiModel) throw new Error("Demo Mode or Client Error");
        const result = await aiModel.generateContent(prompt);
        insights = result.response.text();
        const tokens = result.response.usageMetadata?.totalTokenCount || 0;
        await trackTokens(
          ctx.user.id,
          ctx.user.type,
          tokens,
          "report",
          modelName,
        );
      } catch (err) {
        console.error("AI Yearly Error:", err);
        insights = `(Fallback Mode) ملخص سنة ${input.year}:
إجمالي المصاريف: ${total} جنيه.
تأكد من إعدادات الـ API Key للحصول على تحليل ذكي.`;
      }
      return { insights, model: modelName, total };
    }),

  // ─── Financial Copilot: Get Cached Monthly Insights (Premium UX) ───
  getCachedMonthlyInsights: authedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const summary = await db
        .select()
        .from(aiSummaries)
        .where(
          and(
            eq(aiSummaries.userId, ctx.user.id),
            eq(aiSummaries.userType, ctx.user.type),
            eq(aiSummaries.period, "monthly"),
            eq(aiSummaries.periodValue, input.month),
          ),
        )
        .limit(1);

      if (summary[0]) {
        return {
          insights: summary[0].content,
          model: summary[0].model,
          createdAt: summary[0].createdAt,
          exists: true,
        };
      }
      return { exists: false, insights: null };
    }),
});
