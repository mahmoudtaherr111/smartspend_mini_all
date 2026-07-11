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
  userBusinesses,
  businessCategories as bizCategoriesTable,
} from "../db/schema";
import { eq, sql, desc, count, and, gte, lte, sum } from "drizzle-orm";
import { env } from "./lib/env";
import { getCacheRuntimeStatus } from "./lib/redis-client";
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
  isFireworksModel,
  type AiPlanName,
  type AiProviderName,
} from "./lib/model-mapper";
import { callFireworksAPI } from "./lib/fireworks-client";
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
  buildMonthlyReportFactsPack,
  getChartData,
  getFinanceBreakdown,
  getFinanceSummary,
  type FinanceSummary,
} from "./services/finance-semantic-layer";
import {
  recordAICostMetric,
  resolveAICostPolicy,
  validateNumbersAgainstFacts,
} from "./services/ai-cost-policy";
import {
  embeddingApiCallsFromCacheHits,
  embeddingApiStatusFor,
  type DataNeed,
  type ResolvedFact,
} from "./services/ai-kernel";
import {
  clearVoiceSessionState,
  createVoiceSessionState,
  executeVoiceTool,
  type VoiceToolName,
} from "./services/voice-kernel";
import { buildParserTrace } from "./services/parser-trace";

const MONTHLY_REPORT_TRANSACTION_EVIDENCE_LIMIT = 4;
const VOICE_QA_TOOL_NAMES = ["finance_query", "memory_search", "action_draft"] as const;

function compactQaFact(fact: ResolvedFact): Record<string, unknown> {
  return {
    label: fact.label,
    source: fact.source,
    confidence: fact.confidence,
    value:
      typeof fact.value === "string" && fact.value.length > 120
        ? `${fact.value.slice(0, 117)}...`
        : fact.value,
  };
}

function summarizeVoiceQaToolResponse(toolName: VoiceToolName, response: unknown): Record<string, unknown> {
  const record = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const dataNeeds = Array.isArray(record.dataNeeds)
    ? (record.dataNeeds.filter((need) => need && typeof need === "object") as DataNeed[])
    : [];
  const facts = Array.isArray(record.facts) ? (record.facts as ResolvedFact[]) : [];
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  const cacheHits = Array.isArray(record.cacheHits) ? record.cacheHits.map((hit) => String(hit)) : [];
  const result = record.result && typeof record.result === "object" ? (record.result as Record<string, unknown>) : {};
  const action = record.action && typeof record.action === "object" ? (record.action as Record<string, unknown>) : undefined;

  return {
    toolName,
    ok: record.ok === true,
    dataNeeds: dataNeeds.map((need) => need.kind).filter(Boolean),
    factCount: facts.length,
    artifactCount: artifacts.length,
    factsPreview: facts.slice(0, 4).map(compactQaFact),
    cacheHits,
    embeddingCalls: embeddingApiCallsFromCacheHits(cacheHits),
    embeddingApiStatus:
      typeof record.embeddingApiStatus === "string"
        ? record.embeddingApiStatus
        : embeddingApiStatusFor(dataNeeds, cacheHits),
    retrievalPolicy:
      record.retrievalPolicy && typeof record.retrievalPolicy === "object"
        ? record.retrievalPolicy
        : undefined,
    cacheRuntime: getCacheRuntimeStatus(),
    action: action
      ? {
          id: action.id,
          actionName: action.actionName,
          status: action.status,
          summary: action.summary,
          requiresUiConfirmation: action.requiresUiConfirmation,
        }
      : undefined,
    result: {
      requiresConfirmation: result.requiresConfirmation,
      requiresUiConfirmation: result.requiresUiConfirmation,
      errors: Array.isArray(result.errors) ? result.errors.map(String).slice(0, 4) : [],
    },
    error: typeof record.error === "string" ? record.error : undefined,
  };
}

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
  provider?: AiProviderName;
  key_slot?: "key1" | "key2" | "groq" | "fireworks";
  model?: string;
}

export interface ResolvedRouting {
  provider: AiProviderName;
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
    provider: string,
    keySlot?: string,
  ) => {
    if (provider === "groq") return cfg.groq_api_key || "";
    if (provider === "fireworks") return cfg.fireworks_api_key || env.FIREWORKS_API_KEY || "";
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
    (matchedRange.key_slot === "groq" ? "groq" : matchedRange.key_slot === "fireworks" ? "fireworks" : "gemini");
  const keySlot =
    matchedRange.key_slot ?? (provider === "groq" ? "groq" : provider === "fireworks" ? "fireworks" : "key1");
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

function materialReportMissingNumbers(missing: string[] | undefined): string[] {
  return (missing ?? []).filter((item) => {
    const parsed = Math.abs(Number(item));
    if (!Number.isFinite(parsed)) return false;
    return parsed >= 10 || !Number.isInteger(parsed);
  });
}

function reportHallucinationRisk(
  missing: string[] | undefined,
  llmCalls: number,
): { risk: "low" | "medium" | "high"; signals: string[] } {
  if (llmCalls <= 0) return { risk: "low", signals: [] };
  const materialMissing = materialReportMissingNumbers(missing);
  if (materialMissing.length === 0) return { risk: "low", signals: [] };
  return {
    risk: materialMissing.length <= 2 ? "medium" : "high",
    signals: materialMissing.map((number) => `missing_number:${number}`),
  };
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
  const fireworksApiKey = cfg.fireworks_api_key || env.FIREWORKS_API_KEY || "";

  return {
    aiModel,
    modelName,
    apiKey,
    apiKey2,
    groqApiKey,
    fireworksApiKey,
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
  runVoiceToolQa: aiProcedure
    .input(
      z.object({
        toolName: z.enum(VOICE_QA_TOOL_NAMES),
        args: z.record(z.string(), z.unknown()).optional().default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (env.NODE_ENV === "production") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Voice QA is disabled in production.",
        });
      }

      const voiceSession = await createVoiceSessionState({
        userId: ctx.user.id,
        userType: ctx.user.type,
        userPlan: ctx.user.plan || "free",
      });

      try {
        const response = await executeVoiceTool({
          toolName: input.toolName,
          args: input.args,
          ctx: {
            userId: ctx.user.id,
            userType: ctx.user.type,
            userPlan: ctx.user.plan || "free",
            sessionId: voiceSession.sessionId,
          },
        });

        return {
          voiceSessionId: voiceSession.sessionId,
          qa: true,
          ...summarizeVoiceQaToolResponse(input.toolName, response),
        };
      } finally {
        await clearVoiceSessionState(voiceSession.sessionId).catch((error: unknown) => {
          console.warn("[Voice QA] failed to clear session", error instanceof Error ? error.message : String(error));
        });
      }
    }),

  parseExpense: aiProcedure
    .input(
      z.object({
        text: z.string(),
        model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
        skipClarification: z.boolean().optional(),
        inputChannel: z.enum(["text", "voice"]).default("text"),
        voiceModelUsed: z.string().optional(),
        sttTokensUsed: z.number().optional(),
        businessMode: z.boolean().optional(),
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
      let resolvedProvider: "gemini" | "groq" | "fireworks" = "gemini";
      let resolvedGroqKey = "";
      let resolvedFireworksKey = "";
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // ── Run independent queries in parallel to speed up ──
      const [
        settings,
        userDictRows,
        smartProfile
      ] = await Promise.all([
        db.select().from(systemSettings),
        db.select().from(userDictionaries)
          .where(and(eq(userDictionaries.userId, ctx.user.id), eq(userDictionaries.userType, ctx.user.type))),
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
        resolvedFireworksKey = routing.provider === "fireworks" ? routing.apiKey : "";
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
      const personalContextRaw = buildPersonalContext(smartProfile);
      const salaryDay = Number((smartProfile.financialInfo as any)?.salaryDay) || 0;
      const currentMonthSummary = await getFinanceSummary(
        {
          userId: ctx.user.id,
          userType: ctx.user.type,
          salaryDay,
        },
        { period: "current_month" },
      ).catch((error: unknown) => {
        console.warn("[Parse Expense] finance summary failed", error instanceof Error ? error.message : String(error));
        return null;
      });
      const totalIncome = currentMonthSummary?.totalIncome ?? 0;
      const totalExpense = currentMonthSummary?.totalExpense ?? 0;

      // --- INJECT KNOWN PEOPLE INTO USER DICT ---
      for (const p of personalContextRaw.knownPeople) {
        const safeCategory = (p.category && p.category !== "تحويلات") ? p.category : null;
        if (safeCategory) {
          if (p.name && p.name.length >= 2) {
             userDict.push({ word: p.name, category: safeCategory, subCategory: p.subCategory });
          }
          const firstName = p.name.split(/\s+/)[0];
          if (firstName && firstName.length >= 2 && firstName !== p.name) {
             userDict.push({ word: firstName, category: safeCategory, subCategory: p.subCategory });
          }
        }
      }

      // --- LOAD BUSINESS CATEGORIES (if user has an active business) ---
      let bizCategoriesForPipeline: Array<{
        id: number; name: string; nameAr: string; type: string;
        keywords: string[]; matchExamples: string[];
      }> | undefined;
      // Lift `biz` outside the try block so its length/id can be referenced
      // when constructing the pipeline input below. Previously `biz` was
      // declared with `const` inside the try, leaking the reference and
      // producing TS2304 "Cannot find name 'biz'" at the call site.
      let biz: { id: number }[] = [];
      try {
        biz = await db
          .select({ id: userBusinesses.id })
          .from(userBusinesses)
          .where(and(
            eq(userBusinesses.userId, ctx.user.id as number),
            eq(userBusinesses.userType, ctx.user.type),
            eq(userBusinesses.isActive, true),
          ))
          .limit(1);

        if (biz.length > 0) {
          const cats = await db
            .select()
            .from(bizCategoriesTable)
            .where(and(
              eq(bizCategoriesTable.businessId, biz[0].id),
              eq(bizCategoriesTable.isActive, true),
            ));
          bizCategoriesForPipeline = cats.map((c) => ({
            id: c.id, name: c.name, nameAr: c.nameAr, type: c.type,
            keywords: Array.isArray(c.keywords) ? c.keywords as string[] : [],
            matchExamples: Array.isArray(c.matchExamples) ? c.matchExamples as string[] : [],
          }));
        }
      } catch (e) {
        // Business categories load failed — don't block pipeline
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
        provider: resolvedProvider,
        groqApiKey: resolvedGroqKey,
        fireworksApiKey: resolvedFireworksKey,
        pipelineSettings: {
            ...cfgFull,
            rag_api_key: cfgFull.rag_api_key || apiKey,
            rag_model: cfgFull.rag_model || "text-embedding-004",
            enable_rag: String(cfgFull.enable_rag !== "false"),
          },
        businessCategories: bizCategoriesForPipeline,
        businessId: biz.length > 0 ? biz[0].id : null,
        businessMode: input.businessMode || false,
      });
      const financeContextSource = currentMonthSummary ? "finance.summary" : "fallback_zero";
      const parseTrace = buildParserTrace({
        route: "expense_parse",
        inputChannel: input.inputChannel,
        provider: resolvedProvider,
        estimatedInputTokens,
        result,
        latencyMs: Date.now() - startTime,
        financeContextSource,
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
      void recordAICostMetric({
        userId: ctx.user.id,
        userType: ctx.user.type,
        channel: "parse",
        plan: ctx.user.plan || "free",
        intentKind: "expense_parse",
        model: result.modelUsed,
        inputTokens: parseTrace.inputTokens,
        outputTokens: Math.max(0, result.tokensUsed - parseTrace.inputTokens),
        totalTokens: result.tokensUsed,
        embeddingCalls: parseTrace.embeddingCalls,
        llmCalls: parseTrace.llmCalls,
        toolCalls: 0,
        latencyMs: Date.now() - startTime,
        metadata: {
          inputChannel: input.inputChannel,
          provider: resolvedProvider,
          parsedBy: result.parsedBy,
          decision: result.decision,
          confidence: result.overallConfidence,
          itemCount: result.items.length,
          routing: result.log.routing,
          cachedTokens: result.cachedTokens ?? 0,
          sttTokensUsed: input.sttTokensUsed ?? 0,
          financeContextSource,
          trace: parseTrace,
        },
      });

      // ── Log classification ──
      const isV2 = false;
      let classificationLogId: number | undefined;
      try {
      const [classificationLog] = await db
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
            trace: parseTrace,
            cachedTokens: result.cachedTokens,
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
        });
      classificationLogId = Number(classificationLog.insertId) || undefined;
      } catch {
        // A trace-storage outage must not block a user from reviewing a parse.
      }

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
              classificationLogId,
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
        trace: parseTrace,
        classificationLogId,
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
        getSmartProfile(ctx.user.id, ctx.user.type)
      ]);

      const [sttResult, [userDictRows, smartProfile]] = await Promise.all([sttPromise, dbPromise]);
      
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
      const salaryDay = Number((smartProfile.financialInfo as any)?.salaryDay) || 0;
      const currentMonthSummary = await getFinanceSummary(
        {
          userId: ctx.user.id,
          userType: ctx.user.type,
          salaryDay,
        },
        { period: "current_month" },
      ).catch((error: unknown) => {
        console.warn("[Parse Voice Expense] finance summary failed", error instanceof Error ? error.message : String(error));
        return null;
      });

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
      let resolvedProvider: "gemini" | "groq" | "fireworks" = "gemini";
      let resolvedGroqKey = "";
      let resolvedFireworksKey = "";
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
        resolvedFireworksKey = routing.provider === "fireworks" ? routing.apiKey : "";
        apiKey = routing.apiKey;
        modelName = routing.model;
      } catch (routingErr) {
        if (routingErr instanceof TRPCError) throw routingErr;
        console.warn(
          "Voice Routing config resolution failed, using defaults:",
          routingErr,
        );
      }

      // ── Load Business Categories for voice pipeline ──
      let voiceBizCats: Array<{
        id: number; name: string; nameAr: string; type: string;
        keywords: string[]; matchExamples: string[];
      }> | undefined;
      // Lift `biz` outside the try so its length/id remain accessible when
      // constructing the pipeline input below (fixes TS2304 at line 1764).
      let biz: { id: number }[] = [];
      try {
        biz = await db
          .select({ id: userBusinesses.id })
          .from(userBusinesses)
          .where(and(
            eq(userBusinesses.userId, ctx.user.id as number),
            eq(userBusinesses.userType, ctx.user.type),
            eq(userBusinesses.isActive, true),
          ))
          .limit(1);
        if (biz.length > 0) {
          const cats = await db
            .select()
            .from(bizCategoriesTable)
            .where(and(
              eq(bizCategoriesTable.businessId, biz[0].id),
              eq(bizCategoriesTable.isActive, true),
            ));
          voiceBizCats = cats.map((c) => ({
            id: c.id, name: c.name, nameAr: c.nameAr, type: c.type,
            keywords: Array.isArray(c.keywords) ? c.keywords as string[] : [],
            matchExamples: Array.isArray(c.matchExamples) ? c.matchExamples as string[] : [],
          }));
        }
      } catch {}

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
           totalIncome: currentMonthSummary?.totalIncome ?? 0,
           totalExpense: currentMonthSummary?.totalExpense ?? 0
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
        fireworksApiKey: resolvedFireworksKey,
        pipelineSettings: {
            ...cfg,
            rag_api_key: cfg.rag_api_key || apiKey,
            rag_model: cfg.rag_model || "text-embedding-004",
            enable_rag: String(cfg.enable_rag !== "false"),
          },
        businessCategories: voiceBizCats,
        businessId: biz.length > 0 ? biz[0].id : null,
        businessMode: false,
      });

      let newlyAddedContact: { isNew: boolean; name: string; totalContacts: number } | null = null;
      for (const item of parseResult.items) {
        if (item.person_mentioned && item.person_relationship) {
          const pName = item.person_mentioned.trim();
          const pRel = item.person_relationship.trim();
          if (pName && pName !== "عام" && pName !== "شخص") {
            const { addDynamicContact } =
              await import("./services/user-profile-service");
            const res = await addDynamicContact(
              ctx.user.id,
              ctx.user.type,
              pName,
              pRel,
            );
            if (res && res.isNew) newlyAddedContact = res;
          }
        }
      }

      const financeContextSource = currentMonthSummary ? "finance.summary" : "fallback_zero";
      const parseTrace = buildParserTrace({
        route: "voice_expense_parse",
        inputChannel: "voice",
        provider: resolvedProvider,
        estimatedInputTokens,
        result: parseResult,
        latencyMs: Date.now() - startTime,
        financeContextSource,
        stt: {
          model: sttResult.modelUsed,
          tokensUsed: sttResult.tokensUsed,
          durationSeconds: input.durationSeconds,
        },
      });

      if (parseResult.tokensUsed > 0) {
        await trackTokens(ctx.user.id, ctx.user.type, parseResult.tokensUsed, "parse", parseResult.modelUsed);
      }
      void recordAICostMetric({
        userId: ctx.user.id,
        userType: ctx.user.type,
        channel: "speech",
        plan: ctx.user.plan || "free",
        intentKind: "stt",
        model: sttResult.modelUsed,
        inputTokens: 0,
        outputTokens: sttResult.tokensUsed,
        totalTokens: sttResult.tokensUsed,
        embeddingCalls: 0,
        llmCalls: 0,
        toolCalls: 0,
        latencyMs: Date.now() - startTime,
        metadata: {
          durationSeconds: input.durationSeconds,
          mimeType: cleanMimeType,
          provider: isGroqModel(sttResult.modelUsed) ? "groq" : "gemini",
        },
      });
      void recordAICostMetric({
        userId: ctx.user.id,
        userType: ctx.user.type,
        channel: "parse",
        plan: ctx.user.plan || "free",
        intentKind: "voice_expense_parse",
        model: parseResult.modelUsed,
        inputTokens: parseTrace.inputTokens,
        outputTokens: Math.max(0, parseResult.tokensUsed - parseTrace.inputTokens),
        totalTokens: parseResult.tokensUsed,
        embeddingCalls: parseTrace.embeddingCalls,
        llmCalls: parseTrace.llmCalls,
        toolCalls: 0,
        latencyMs: Date.now() - startTime,
        metadata: {
          inputChannel: "voice",
          provider: resolvedProvider,
          parsedBy: parseResult.parsedBy,
          decision: parseResult.decision,
          confidence: parseResult.overallConfidence,
          itemCount: parseResult.items.length,
          routing: parseResult.log.routing,
          cachedTokens: parseResult.cachedTokens ?? 0,
          sttTokensUsed: sttResult.tokensUsed,
          sttModel: sttResult.modelUsed,
          financeContextSource,
          trace: parseTrace,
        },
      });

      const isV2 = false;
      let classificationLogId: number | undefined;
      try {
      const [classificationLog] = await db.insert(classificationLogs).values({
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
            trace: parseTrace,
          },
          ambiguityFlags: parseResult.items.flatMap((item: any) => item.ambiguityFlags || []),
          inputChannel: "voice",
          needsFollowup: parseResult.decision === "clarify" || parseResult.overallConfidence < 60,
          modelUsed: `STT: ${sttResult!.modelUsed} | Parse: ${parseResult.modelUsed}`,
          tokensUsed: parseResult.tokensUsed + sttResult!.tokensUsed,
          processingTimeMs: Date.now() - startTime,
        });
      classificationLogId = Number(classificationLog.insertId) || undefined;
      } catch {
        // A trace-storage outage must not block a user from reviewing a parse.
      }

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
              classificationLogId,
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
        trace: parseTrace,
        classificationLogId,
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
        forceRefresh: z.boolean().optional().default(false),
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

      if (existingSummary[0] && !input.forceRefresh) {
        let trace: unknown = null;
        try {
          const parsed = JSON.parse(existingSummary[0].content);
          trace = parsed?.ai_trace ?? null;
        } catch {
          trace = null;
        }
        return {
          insights: existingSummary[0].content,
          cached: true,
          model: existingSummary[0].model,
          trace,
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

      if (lastSummary[0] && !(input.forceRefresh && existingSummary[0])) {
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
      // Get smart user profile for personalization context to check salaryDay
      const userProfile = await getSmartProfile(ctx.user.id, ctx.user.type);
      const salaryDay = Number((userProfile.financialInfo as any).salaryDay) || 0;
      const semanticReportFacts = await buildMonthlyReportFactsPack(
        {
          userId: ctx.user.id,
          userType: ctx.user.type,
          salaryDay,
        },
        input.month,
        {
          forceLive: input.forceRefresh,
          skipCache: input.forceRefresh,
        },
      ).catch((error: unknown) => {
        console.warn(
          "[Monthly Report Semantic Facts] failed",
          error instanceof Error ? error.message : String(error),
        );
        return null;
      });

      let startDate: Date;
      let endDate: Date;
      let prevStart: Date;
      let prevEnd: Date;
      let daysInMonth: number;

      if (salaryDay > 1) {
        const { getFinancialMonthDates } = await import("./services/financial-month");
        const currentDates = getFinancialMonthDates(input.month, salaryDay);
        startDate = currentDates.startDate;
        endDate = currentDates.endDate;

        // Calculate previous month string
        const [y, m] = input.month.split("-").map(Number);
        const prevMonthDate = new Date(y, m - 2, 1);
        const prevMonthStr = prevMonthDate.toISOString().slice(0, 7);
        const prevDates = getFinancialMonthDates(prevMonthStr, salaryDay);
        prevStart = prevDates.startDate;
        prevEnd = prevDates.endDate;

        daysInMonth = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        const [year, month] = input.month.split("-");
        startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        endDate = new Date(parseInt(year), parseInt(month), 0);
        daysInMonth = endDate.getDate();

        prevStart = new Date(parseInt(year), parseInt(month) - 2, 1);
        prevEnd = new Date(parseInt(year), parseInt(month) - 1, 0);
      }

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
      let fireworksApiKey = "";
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
        fireworksApiKey = client.fireworksApiKey;
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

        if (semanticReportFacts) {
          reportTargetWords = Math.min(Math.max(reportTargetWords, 220), 420);
          reportSubcatsLimit = Math.min(reportSubcatsLimit, 8);
          reportTopItemsLimit = 0;
          aiResponseLength = "short";
          aiFocus = "statistics";
          aiSystemPrompt =
            "أنت مستشار مالي مصري ذكي. اكتب تقريرا شهريا مختصرا ودقيقا من الحقائق المرسلة فقط، ولا تخترع أي رقم.";
          aiAdvancedInstructions =
            "- استخدم SEMANTIC_REPORT_FACTS فقط كمصدر للأرقام.\n- لا تقرب الأرقام المالية؛ انسخ القيم العشرية كما هي مثل 2337.5.\n- لا تطلب أدوات ولا بيانات إضافية.\n- اكتب توصيات عملية قصيرة مبنية على أعلى الفئات والصافي والأهداف إن وجدت.";
          aiReportStructureOverride = "";
        }

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
          reportProvider = "backend";
        }
      } catch (e) {
        if (e instanceof TRPCError) throw e;
      }

      // ── Dynamic Data Feed (subcategories depth + item descriptions based on plan) ──
      const subCatSummary = topSubCategories
        .slice(0, reportSubcatsLimit)
        .map((s) => `${s.name}: ${s.amount}ج (${s.percent}%)`)
        .join(" | ");

      // Build a small evidence pack only. Never send a raw transaction dump to the report LLM.
      let topItemsContext = "";
      const reportEvidenceLimit = Math.min(
        reportTopItemsLimit,
        MONTHLY_REPORT_TRANSACTION_EVIDENCE_LIMIT,
      );
      if (reportEvidenceLimit > 0) {
        const expenseItems = userExpenses.filter((e) => e.type === "expense");
        const biggestLimit = Math.max(1, Math.ceil(reportEvidenceLimit / 2));
        // Top items by amount - locally anonymized and hard-capped as evidence.
        const biggestItems = [...expenseItems]
          .sort((a, b) => Number(b.amount) - Number(a.amount))
          .slice(0, biggestLimit)
          .map((e) =>
            redactSensitiveData(
              `${e.description || e.category}${e.subCategory && e.subCategory !== "عام" ? ` (${e.subCategory})` : ""}: ${e.amount}ج [${e.category}]`,
            ),
          );
        const recurringLimit = Math.max(0, reportEvidenceLimit - biggestItems.length);
        // Most recurring items - aggregated by description and hard-capped as evidence.
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
          .slice(0, recurringLimit)
          .map(([name, v]) =>
            redactSensitiveData(
              `${name} (${v.subCat}): ${v.count} مرات، إجمالي ${v.total}ج [${v.cat}]`,
            ),
          );

        if (biggestItems.length > 0 || recurringItemsList.length > 0) {
          topItemsContext = `\n--- LIMITED_TRANSACTION_EVIDENCE: max_${MONTHLY_REPORT_TRANSACTION_EVIDENCE_LIMIT}_items ---`;
          if (biggestItems.length > 0)
            topItemsContext += `\nأكبر evidence محدود هذا الشهر: ${biggestItems.join(" | ")}`;
          if (recurringItemsList.length > 0)
            topItemsContext += `\nأنماط متكررة مجمعة: ${recurringItemsList.join(" | ")}`;
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
      const compactReportContext = [
        semanticReportFacts?.factsBlock ?? summaryForAI.slice(0, 1200),
        `user_name: ${userProfile.basicInfo.name || ctx.user.name || "SmartSpend user"}`,
        salaryDay > 0 ? `salary_day: ${salaryDay}` : "",
        financialMonthContext ? `financial_month: ${financialMonthContext.slice(0, 280)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const personalizedSummaryForAI = compactReportContext;

      let responseJson: any;
      let aiErrorMsg = "";
      let reportEstimatedInputTokens = 0;
      let reportTotalTokens = 0;
      let reportLlmCalls = 0;
      let reportLatencyMs: number | null = null;
      const semanticNumber = (label: string): number | undefined => {
        const value = semanticReportFacts?.facts.find((fact) => fact.label === label)?.value;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      };

      if (modelName !== "backend" && (aiModel || reportProvider === "groq" || isGroqModel(modelName))) {
        try {
          const planId = asPlan(ctx.user.plan);
          const reportCostPolicy = resolveAICostPolicy({
            channel: "report",
            plan: planId,
            intentKind: "report_request",
          });
          const reportStartedAt = Date.now();
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
القسم 2 - تحليل الفئات الفرعية: حلل أعلى الفئات الفرعية فقط من الأرقام المجمعة، واستخدم أمثلة evidence المحدودة إن وُجدت بدون محاولة سرد كل العمليات.
القسم 3 - الأنماط السلوكية: اشرح نمط الإنفاق (اندفاعي؟ محافظ؟) مع نقاط القوة والضعف المالية.
القسم 4 - خطة التحسين: قدم 5+ توصيات استراتيجية مفصلة بأرقام مقترحة وجدول زمني.`;
              } else {
                sectionCount = 5;
                structureInstruction = `اكتب تقريراً مالياً عميقاً ومشبعاً (لا يقل عن ${reportTargetWords} كلمة) مقسم إجبارياً إلى ${sectionCount} أقسام رئيسية على الأقل:
القسم 1 - نظرة عامة شاملة: الأرقام الدقيقة + المقارنات + نسبة الاستهلاك من الدخل + تقييم السيولة.
القسم 2 - تحليل تفصيلي عميق: أعلى الفئات الفرعية والأنماط المجمعة فقط. لا تسرد كل عملية فردية؛ استخدم evidence محدودا بحد أقصى 4 أمثلة إن كان متاحا.
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
- إذا وُجد LIMITED_TRANSACTION_EVIDENCE فاستخدمه كأمثلة داعمة فقط، ولا تحوله إلى سرد خام لكل العمليات أو تستنتج منه عمليات غير موجودة.
- كل قسم يجب أن يكون فقرة طويلة كاملة (ليس مجرد جملة أو جملتين).`;

            const prompt = `${aiSystemPrompt}

**[تعليمة حاسمة]**: يجب أن يكون طول response_text حوالي ${reportTargetWords} كلمة عربية. هذا شرط غير قابل للتفاوض. إذا كان ردك أقصر من ${Math.round(reportTargetWords * 0.7)} كلمة، فأنت تخالف التعليمات.

[Instructions]
- ${lengthInstruction}
- ${focusInstruction}
- قاعدة بيانات إلزامية: لا تستخدم raw transactions في الرد. الأرقام تأتي من facts المجمعة فقط، وأي تفاصيل عمليات فردية مسموحة فقط إذا ظهرت داخل LIMITED_TRANSACTION_EVIDENCE وبحد أقصى ${MONTHLY_REPORT_TRANSACTION_EVIDENCE_LIMIT} أمثلة داعمة.
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
            if (reportProvider === "fireworks" || isFireworksModel(modelName)) {
              const res = await callFireworksAPI(
                fireworksApiKey || reportApiKey,
                modelName,
                aiSystemPrompt,
                prompt,
                capRequestOutputTokens(
                  ctx.user.plan,
                  "report",
                  Math.min(reportTargetWords * 4, reportCostPolicy.maxOutputTokens),
                ),
              );
              raw = res.text;
              tokens = res.tokensUsed;
            } else if (reportProvider === "groq" || isGroqModel(modelName)) {
              const res = await callGroqAPI(
                groqApiKey || reportApiKey,
                modelName,
                aiSystemPrompt,
                prompt,
                capRequestOutputTokens(
                  ctx.user.plan,
                  "report",
                  Math.min(reportTargetWords * 4, reportCostPolicy.maxOutputTokens),
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
            const estimatedInputTokens = estimateTokensFromText(prompt);
            reportEstimatedInputTokens = estimatedInputTokens;
            reportTotalTokens = tokens;
            reportLlmCalls = tokens > 0 ? 1 : 0;
            reportLatencyMs = Date.now() - reportStartedAt;
            void recordAICostMetric({
              userId: ctx.user.id,
              userType: ctx.user.type,
              channel: "report",
              plan: planId,
              intentKind: "report_request",
              model: modelName,
              inputTokens: estimatedInputTokens,
              outputTokens: Math.max(0, tokens - estimatedInputTokens),
              totalTokens: tokens,
              llmCalls: reportLlmCalls,
              toolCalls: 0,
              latencyMs: reportLatencyMs,
              metadata: {
                month: input.month,
                source: "monthly_report_endpoint",
                provider: reportProvider,
                factsSource: semanticReportFacts?.source ?? null,
                factsCacheKey: semanticReportFacts?.cacheKey ?? null,
                semanticFactsAvailable: Boolean(semanticReportFacts),
                maxOutputTokens: reportCostPolicy.maxOutputTokens,
              },
            });

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
        reportProvider = "backend";
        let text = "";
        const fallbackDailyAvg = semanticNumber("daily_average_expense") ?? dailyAvg;
        const fallbackTotalExpense = semanticNumber("total_expense") ?? totalExpense;

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
        text += `متوسط صرفك اليومي ${fallbackDailyAvg} ج.م (${fallbackTotalExpense} ج.م إجمالي الشهر).`;
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
      if (responseJson && typeof responseJson === "object") {
        const reportText = String(responseJson.response_text ?? "");
        const validationFacts =
          reportLlmCalls > 0
            ? (semanticReportFacts?.facts ?? [])
            : {
                semanticFacts: semanticReportFacts?.facts ?? [],
                serverDerivedFacts: {
                  totalExpense,
                  totalIncome,
                  prevTotal,
                  dailyAvg,
                  semanticDailyAverageExpense: semanticNumber("daily_average_expense"),
                  semanticTotalExpense: semanticNumber("total_expense"),
                  monthlyChange,
                  topCategoryPercent,
                  incomeRatio,
                },
              };
        const numericAccuracy = semanticReportFacts
          ? validateNumbersAgainstFacts(reportText, validationFacts)
          : { accuracy: 1, numbers: [], supported: [], missing: [] };
        const hallucination = reportHallucinationRisk(numericAccuracy.missing, reportLlmCalls);
        responseJson.semantic_facts = {
          source: semanticReportFacts?.source ?? "unavailable",
          factCount: semanticReportFacts?.facts.length ?? 0,
          artifactCount: semanticReportFacts?.artifacts.length ?? 0,
        };
        responseJson.ai_trace = {
          route: "report_request",
          tools: ["monthly_report.facts"],
          factsSource: semanticReportFacts?.source ?? "unavailable",
          factCount: semanticReportFacts?.facts.length ?? 0,
          artifactCount: semanticReportFacts?.artifacts.length ?? 0,
          model: modelName,
          provider: reportProvider,
          llmCalls: reportLlmCalls,
          embeddingCalls: 0,
          inputTokens: reportEstimatedInputTokens,
          totalTokens: reportTotalTokens,
          latencyMs: reportLatencyMs,
          numericAccuracy: {
            accuracy: numericAccuracy.accuracy,
            numbers: numericAccuracy.numbers,
            supported: numericAccuracy.supported,
            missing: numericAccuracy.missing,
          },
          hallucinationRisk: hallucination.risk,
          hallucinationSignals: hallucination.signals,
        };
      }
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
      if (existingSummary[0]?.id) {
        await db
          .update(aiSummaries)
          .set({
            model: modelName,
            content: insightsStr,
            createdAt: new Date(),
          })
          .where(eq(aiSummaries.id, existingSummary[0].id))
          .catch(() => {});
      } else {
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
      }

      return { insights: insightsStr, cached: false, model: modelName, trace: responseJson?.ai_trace ?? null };
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
      const startedAt = Date.now();
      const settingsRows = await db.select().from(systemSettings);
      const settings: Record<string, string> = {};
      settingsRows.forEach((setting) => {
        if (setting.value !== undefined && setting.value !== null) {
          settings[setting.key] = setting.value;
        }
      });

      const plan = asPlan(ctx.user.plan);
      if (settings[`${plan}_ai_analysis`] === "false") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "تحليلات المقارنة غير متاحة في خطتك الحالية.",
        });
      }

      const userProfile = await getSmartProfile(ctx.user.id, ctx.user.type).catch(() => null);
      const salaryDay = Number((userProfile?.financialInfo as any)?.salaryDay) || 0;
      const financeCtx = {
        userId: ctx.user.id,
        userType: ctx.user.type,
        salaryDay,
      };

      const [month1, month2] = await Promise.all([
        getFinanceSummary(financeCtx, { period: "current_month", month: input.month1 }),
        getFinanceSummary(financeCtx, { period: "current_month", month: input.month2 }),
      ]);

      const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
      const formatMoney = (value: number) => `${roundMoney(value).toLocaleString("en-US")} جنيه`;
      const formatPercent = (value: number | null) =>
        value === null || !Number.isFinite(value)
          ? "غير محسوبة"
          : `${roundMoney(value)}%`;
      const periodDateLabel = (value: Date | string | number) => {
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime())
          ? String(value).slice(0, 10)
          : parsed.toISOString().slice(0, 10);
      };
      const periodLabel = (summary: FinanceSummary) =>
        `${periodDateLabel(summary.period.startDate as Date | string | number)}..${periodDateLabel(summary.period.endDate as Date | string | number)}`;
      const expenseDifference = month1.totalExpense - month2.totalExpense;
      const incomeDifference = month1.totalIncome - month2.totalIncome;
      const netFlowDifference = month1.netFlow - month2.netFlow;
      const expenseChangePercent =
        month2.totalExpense === 0
          ? month1.totalExpense === 0
            ? 0
            : null
          : (expenseDifference / month2.totalExpense) * 100;
      const direction =
        expenseDifference > 0
          ? "أعلى"
          : expenseDifference < 0
            ? "أقل"
            : "نفس المستوى";

      const comparison = [
        `مقارنة ${input.month1} مع ${input.month2}:`,
        `- المصروفات: ${formatMoney(month1.totalExpense)} مقابل ${formatMoney(month2.totalExpense)}. شهر ${input.month1} ${direction} بفارق ${formatMoney(Math.abs(expenseDifference))} (${formatPercent(expenseChangePercent)}).`,
        `- الدخل: ${formatMoney(month1.totalIncome)} مقابل ${formatMoney(month2.totalIncome)}. الفرق ${formatMoney(incomeDifference)}.`,
        `- الصافي: ${formatMoney(month1.netFlow)} مقابل ${formatMoney(month2.netFlow)}. الفرق ${formatMoney(netFlowDifference)}.`,
        `- عدد العمليات: ${month1.transactionCount} مقابل ${month2.transactionCount}.`,
      ].join("\n");

      const numericAccuracy = validateNumbersAgainstFacts(comparison, {
        month1: input.month1,
        month2: input.month2,
        month1Period: periodLabel(month1),
        month2Period: periodLabel(month2),
        month1TotalExpense: roundMoney(month1.totalExpense),
        month2TotalExpense: roundMoney(month2.totalExpense),
        month1TotalIncome: roundMoney(month1.totalIncome),
        month2TotalIncome: roundMoney(month2.totalIncome),
        month1NetFlow: roundMoney(month1.netFlow),
        month2NetFlow: roundMoney(month2.netFlow),
        expenseDifference: roundMoney(expenseDifference),
        absoluteExpenseDifference: roundMoney(Math.abs(expenseDifference)),
        incomeDifference: roundMoney(incomeDifference),
        netFlowDifference: roundMoney(netFlowDifference),
        expenseChangePercent:
          expenseChangePercent === null ? null : roundMoney(expenseChangePercent),
        month1TransactionCount: month1.transactionCount,
        month2TransactionCount: month2.transactionCount,
      });
      const hallucination = reportHallucinationRisk(numericAccuracy.missing, 0);
      const inputTokens = estimateTokensFromText(
        JSON.stringify({
          month1: input.month1,
          month2: input.month2,
          month1Expense: month1.totalExpense,
          month2Expense: month2.totalExpense,
          month1Income: month1.totalIncome,
          month2Income: month2.totalIncome,
          month1NetFlow: month1.netFlow,
          month2NetFlow: month2.netFlow,
        }),
      );
      const outputTokens = estimateTokensFromText(comparison);
      const trace = {
        route: "finance_period_comparison",
        tools: ["finance.summary"],
        factsSource: "semantic_live",
        factCount: 10,
        artifactCount: 0,
        model: "semantic-deterministic",
        provider: "backend",
        llmCalls: 0,
        embeddingCalls: 0,
        inputTokens,
        totalTokens: inputTokens + outputTokens,
        latencyMs: Date.now() - startedAt,
        numericAccuracy: {
          accuracy: numericAccuracy.accuracy,
          numbers: numericAccuracy.numbers,
          supported: numericAccuracy.supported,
          missing: numericAccuracy.missing,
        },
        hallucinationRisk: hallucination.risk,
        hallucinationSignals: hallucination.signals,
      };

      void recordAICostMetric({
        userId: ctx.user.id,
        userType: ctx.user.type,
        channel: "report",
        plan,
        intentKind: "finance.period_comparison",
        model: "semantic-deterministic",
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        embeddingCalls: 0,
        llmCalls: 0,
        toolCalls: 2,
        latencyMs: trace.latencyMs,
        metadata: {
          route: trace.route,
          factsSource: trace.factsSource,
          factCount: trace.factCount,
          numericAccuracy: numericAccuracy.accuracy,
        },
      });

      return {
        comparison,
        model: "semantic-deterministic",
        trace,
        data: {
          month1,
          month2,
          expenseDifference,
          expenseChangePercent,
          incomeDifference,
          netFlowDifference,
        },
      };
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
      const startedAt = Date.now();
      const year = Number.parseInt(input.year, 10);
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "سنة التقرير غير صحيحة.",
        });
      }

      const settingsRows = await db.select().from(systemSettings);
      const settings: Record<string, string> = {};
      settingsRows.forEach((setting) => {
        if (setting.value !== undefined && setting.value !== null) {
          settings[setting.key] = setting.value;
        }
      });

      const plan = asPlan(ctx.user.plan);
      if (settings[`${plan}_ai_analysis`] === "false") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "التحليلات السنوية غير متاحة في خطتك الحالية.",
        });
      }

      const userProfile = await getSmartProfile(ctx.user.id, ctx.user.type).catch(() => null);
      const salaryDay = Number((userProfile?.financialInfo as any)?.salaryDay) || 0;
      const financeCtx = {
        userId: ctx.user.id,
        userType: ctx.user.type,
        salaryDay,
      };
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

      const [summary, monthlyChart, categoryBreakdown] = await Promise.all([
        getFinanceSummary(financeCtx, { period: "custom", startDate, endDate }),
        getChartData(financeCtx, {
          period: "custom",
          startDate,
          endDate,
          granularity: "month",
          limit: 12,
        }),
        getFinanceBreakdown(financeCtx, {
          period: "custom",
          startDate,
          endDate,
          granularity: "category",
          limit: 5,
        }),
      ]);

      const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
      const formatMoney = (value: number) => `${roundMoney(value).toLocaleString("en-US")} جنيه`;
      const monthlyPoints = monthlyChart.points;
      const peakMonth = monthlyPoints.reduce(
        (best, point) => (Number(point.value) > Number(best.value) ? point : best),
        monthlyPoints[0] ?? { label: String(year), value: 0, count: 0 },
      );
      const activeMonths = monthlyPoints.filter((point) => Number(point.value) > 0).length;
      const topCategory = categoryBreakdown.items[0];
      const monthlyLine = monthlyPoints
        .map((point) => `${point.label}: ${roundMoney(Number(point.value) || 0)}`)
        .join(" | ");
      const categoryLine =
        categoryBreakdown.items.length > 0
          ? categoryBreakdown.items
              .map((item) => `${item.name}: ${roundMoney(item.amount)} (${item.percent}%)`)
              .join(" | ")
          : "لا توجد فئات مصروفات مسجلة";

      const insights = [
        `ملخص سنة ${year}:`,
        `- إجمالي المصروفات: ${formatMoney(summary.totalExpense)} من ${summary.expenseCount} عملية مصروفات.`,
        `- إجمالي الدخل: ${formatMoney(summary.totalIncome)}، والصافي: ${formatMoney(summary.netFlow)}.`,
        `- متوسط الصرف اليومي: ${formatMoney(summary.dailyAverageExpense)}.`,
        `- أعلى شهر في الصرف: ${peakMonth.label} بقيمة ${formatMoney(Number(peakMonth.value) || 0)}.`,
        `- عدد الشهور التي فيها مصروفات: ${activeMonths} من 12.`,
        topCategory
          ? `- أعلى فئة: ${topCategory.name} بقيمة ${formatMoney(topCategory.amount)} (${topCategory.percent}%).`
          : "- لا توجد فئات كافية لاستخراج أعلى فئة.",
        `- توزيع الشهور: ${monthlyLine || "لا توجد بيانات شهرية"}.`,
        `- أعلى الفئات: ${categoryLine}.`,
      ].join("\n");

      const numericAccuracy = validateNumbersAgainstFacts(insights, {
        year,
        totalExpense: roundMoney(summary.totalExpense),
        expenseCount: summary.expenseCount,
        totalIncome: roundMoney(summary.totalIncome),
        netFlow: roundMoney(summary.netFlow),
        dailyAverageExpense: roundMoney(summary.dailyAverageExpense),
        peakMonthLabel: peakMonth.label,
        peakMonthValue: roundMoney(Number(peakMonth.value) || 0),
        activeMonths,
        monthsInYear: 12,
        topCategoryName: topCategory?.name,
        topCategoryAmount: topCategory ? roundMoney(topCategory.amount) : null,
        topCategoryPercent: topCategory?.percent ?? null,
        monthlyPoints: monthlyPoints.map((point) => ({
          label: point.label,
          value: roundMoney(Number(point.value) || 0),
          count: point.count,
        })),
        categoryBreakdown: categoryBreakdown.items.map((item) => ({
          name: item.name,
          amount: roundMoney(item.amount),
          percent: item.percent,
          count: item.count,
        })),
      });
      const hallucination = reportHallucinationRisk(numericAccuracy.missing, 0);
      const inputTokens = estimateTokensFromText(
        JSON.stringify({
          year,
          summary: {
            totalExpense: summary.totalExpense,
            totalIncome: summary.totalIncome,
            netFlow: summary.netFlow,
            transactionCount: summary.transactionCount,
          },
          monthlyPoints,
          categoryBreakdown: categoryBreakdown.items,
        }),
      );
      const outputTokens = estimateTokensFromText(insights);
      const trace = {
        route: "yearly_report",
        tools: ["finance.summary", "chart.data", "finance.breakdown"],
        factsSource: "semantic_live",
        factCount: 8 + monthlyPoints.length + categoryBreakdown.items.length,
        artifactCount: 1,
        model: "semantic-deterministic",
        provider: "backend",
        llmCalls: 0,
        embeddingCalls: 0,
        inputTokens,
        totalTokens: inputTokens + outputTokens,
        latencyMs: Date.now() - startedAt,
        numericAccuracy: {
          accuracy: numericAccuracy.accuracy,
          numbers: numericAccuracy.numbers,
          supported: numericAccuracy.supported,
          missing: numericAccuracy.missing,
        },
        hallucinationRisk: hallucination.risk,
        hallucinationSignals: hallucination.signals,
      };

      void recordAICostMetric({
        userId: ctx.user.id,
        userType: ctx.user.type,
        channel: "report",
        plan,
        intentKind: "yearly_report",
        model: "semantic-deterministic",
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        embeddingCalls: 0,
        llmCalls: 0,
        toolCalls: 3,
        latencyMs: trace.latencyMs,
        metadata: {
          route: trace.route,
          factsSource: trace.factsSource,
          factCount: trace.factCount,
          numericAccuracy: numericAccuracy.accuracy,
        },
      });

      return {
        insights,
        model: "semantic-deterministic",
        total: summary.totalExpense,
        trace,
        data: {
          summary,
          monthlyChart,
          categoryBreakdown,
        },
      };
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
