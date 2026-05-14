import { z } from "zod";
import { router, authedProcedure, proProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "./queries/connection";
import { expenses, monthlyReports, aiSummaries, systemSettings, users, localUsers, userProfiles, userDictionaries, classificationLogs, voiceUsage } from "../db/schema";
import { eq, sql, desc, count, and, gte, lte, sum } from "drizzle-orm";
import { env } from "./lib/env";
import { runPipeline, runSTTPipeline } from "./lib/classification-pipeline";
import { CATEGORIES } from "./lib/category-registry";
import { 
  CATEGORY_DICTIONARY, 
  INCOME_KEYWORDS, 
  EXPENSE_KEYWORDS, 
  STRONG_INCOME, 
  STRONG_EXPENSE 
} from "./lib/egyptian-dictionary";
import { fuzzyFindCategory } from "./lib/fuzzy-match";


async function trackTokens(userId: number, userType: string, tokens: number) {
  if (!tokens || tokens <= 0) return;
  try {
    if (userType === "oauth") {
      await db.update(users).set({ aiTokensUsed: sql`ai_tokens_used + ${tokens}` }).where(eq(users.id, userId));
    } else {
      await db.update(localUsers).set({ aiTokensUsed: sql`ai_tokens_used + ${tokens}` }).where(eq(localUsers.id, userId));
    }
  } catch (err) {
    console.error("Failed to track tokens:", err);
  }
}

function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("voice_usage") && (
    msg.includes("doesn't exist") ||
    msg.includes("ER_NO_SUCH_TABLE") ||
    msg.includes("Failed query:")
  );
}

async function getVoiceSecondsSince(userId: number, userType: string, cycleStart: Date): Promise<number> {
  try {
    const usageResult = await db.select({ total: sql`COALESCE(SUM(duration_seconds), 0)` })
      .from(voiceUsage)
      .where(and(
        eq(voiceUsage.userId, userId),
        eq(voiceUsage.userType, userType),
        gte(voiceUsage.createdAt, cycleStart)
      ));
    return Number(usageResult[0]?.total || 0);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn("voice_usage table is missing. Falling back to 0 usage.");
      return 0;
    }
    throw err;
  }
}

async function getAiClient(taskType: "parse" | "report", userPlan: string = "free") {
  const settings = await db.select().from(systemSettings);
  const cfg: Record<string, string> = {};
  settings.forEach(s => { if (s.value) cfg[s.key] = s.value; });

  let apiKey = cfg.ai_api_key || env.GEMINI_API_KEY;
  let apiKey2 = cfg.ai_api_key_2 || "AIzaSyCTbqi-uF65bRYw8T32DbVOciM9CIMjRuo"; // Fallback key

  
  // Model selection based on plan
  let modelName: string;
  if (taskType === "parse") {
    if (userPlan === "ultra") modelName = cfg.ai_model_ultra || "gemini-2.5-pro";
    else if (userPlan === "pro") modelName = cfg.ai_model_pro || env.GEMINI_MODEL_PRO;
    else modelName = cfg.ai_model_free || env.GEMINI_MODEL_FREE;
  } else {
    modelName = cfg.ai_model_reports || env.GEMINI_MODEL_REPORTS;
  }
  
  // Token limits per plan
  const tokenLimits = {
    free: parseInt(cfg.free_token_limit || "50000"),
    pro: parseInt(cfg.pro_token_limit || "500000"),
    ultra: parseInt(cfg.ultra_token_limit || "2000000"),
  };

  // Per-request max tokens
  const maxPerRequest = {
    free: parseInt(cfg.free_max_per_request || "256"),
    pro: parseInt(cfg.pro_max_per_request || "512"),
    ultra: parseInt(cfg.ultra_max_per_request || "1024"),
  };

  // Daily limits
  const dailyLimits = {
    free: parseInt(cfg.free_daily_limit || "10"),
    pro: parseInt(cfg.pro_daily_limit || "100"),
    ultra: parseInt(cfg.ultra_daily_limit || "500"),
  };

  // Feature check
  const canUseAnalysis = cfg[`${userPlan}_ai_analysis`] !== "false";
  const canUseParse = cfg[`${userPlan}_ai_parse`] !== "false";
  
  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
    throw new Error("Demo Mode");
  }

  const plan = userPlan as "free" | "pro" | "ultra";
  const genAI = new GoogleGenerativeAI(apiKey);
  const aiModel = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: taskType === "parse" ? maxPerRequest[plan] || 512 : maxPerRequest[plan] || 1024,
    },
  });
  return { 
    aiModel, modelName, apiKey, apiKey2,
    tokenLimit: tokenLimits[plan] || 50000,
    dailyLimit: dailyLimits[plan] || 10,
    maxPerRequest: maxPerRequest[plan] || 512,
    canUseAnalysis, canUseParse,
    freeTokenLimit: tokenLimits.free, 
    proTokenLimit: tokenLimits.pro 
  };
}

// ─── Number Normalizer ───
const arabicToEnglishNumbers = (str: string) => {
  return str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
};

const wordNumbers: Record<string, number> = {
  "عشرة": 10, "عشرين": 20, "تلاتين": 30, "ثلاثين": 30, "اربعين": 40, "أربعين": 40,
  "خمسين": 50, "ستين": 60, "سبعين": 70, "تمانين": 80, "ثمانين": 80, "تسعين": 90,
  "مية": 100, "مائة": 100, "ميتين": 200, "تلتمية": 300, "ربعمية": 400, "خمسمية": 500,
  "ستمية": 600, "سبعمية": 700, "تمنمية": 800, "تسعمية": 900,
  "الف": 1000, "ألف": 1000, "الفين": 2000, "ألفين": 2000,
};

/**
 * Smart Multi-Transaction Parser for Egyptian Arabic
 * Handles complex messages like: "دفعت ٢٠٠ أكل و٥٠ مواصلات وخدت ١٠٠٠ من مروان"
 */
function hybridParse(text: string, userDict: any[] = []) {
  let normalizedText = arabicToEnglishNumbers(text);
  
  for (const [word, num] of Object.entries(wordNumbers)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalizedText = normalizedText.replace(regex, num.toString());
  }

  const items: Array<{ amount: number; category: string; subCategory: string; description: string; type: "income" | "expense"; confidence: number }> = [];
  const amountPattern = /(\d+(?:\.\d+)?)\s*(جنيه|ج\.م|ج|الف|ألف)?/g;
  let match;
  const amounts: Array<{ amount: number; index: number; length: number }> = [];

  while ((match = amountPattern.exec(normalizedText)) !== null) {
    let amount = parseFloat(match[1]);
    const suffix = match[2]?.trim();
    if (suffix === "الف" || suffix === "ألف") amount *= 1000;
    if (amount <= 0 || amount > 10000000) continue;
    amounts.push({ amount, index: match.index, length: match[0].length });
  }

  if (amounts.length === 0) return null;

  for (let i = 0; i < amounts.length; i++) {
    const { amount, index, length } = amounts[i];
    const contextStart = i > 0 ? amounts[i - 1].index + amounts[i - 1].length : 0;
    const contextEnd = i < amounts.length - 1 ? amounts[i + 1].index : normalizedText.length;
    const context = normalizedText.slice(contextStart, contextEnd).trim();
    const beforeAmount = normalizedText.slice(contextStart, index).trim();
    const afterAmount = normalizedText.slice(index + length, contextEnd).trim();
    const allContext = (beforeAmount + " " + afterAmount).trim();

    // ── Determine type: income vs expense ──
    let incomeScore = 0;
    let expenseScore = 0;

    for (const kw of STRONG_INCOME) if (context.includes(kw)) incomeScore += 50;
    for (const kw of STRONG_EXPENSE) if (context.includes(kw)) expenseScore += 50;
    for (const kw of INCOME_KEYWORDS) if (context.includes(kw)) incomeScore += 10;
    for (const kw of EXPENSE_KEYWORDS) if (context.includes(kw)) expenseScore += 10;

    if (/حولت\s*(ل|لـ)/.test(context)) expenseScore += 40;
    if (/حول(ي|ى|ولي|ولى)/.test(context)) incomeScore += 40;
    if (/اد(ي|ى)ت\s*(ل|لـ)/.test(context)) expenseScore += 40;
    
    if (incomeScore === 0 && expenseScore === 0) {
      if (items.length > 0 && items[items.length - 1].type === "income") incomeScore = 1;
      else expenseScore = 1;
    }

    const type: "income" | "expense" = incomeScore > expenseScore ? "income" : "expense";

    // ── Determine category & subCategory ──
    let category = type === "income" ? "دخل" : "متنوعات";
    let subCategory = "عام";
    let confidence = 30; // default low confidence for fallback
    
    if (type === "expense") {
      const words = allContext.split(/\s+/).filter(w => w.length >= 2);
      let found = false;

      // 1. User Dictionary
      for (const word of words) {
        const userMatch = userDict.find(ud => ud.word === word);
        if (userMatch) {
          category = userMatch.category;
          subCategory = userMatch.subCategory || "عام";
          confidence = 100;
          found = true;
          break;
        }
      }

      // 2. Exact match from global
      if (!found) {
        for (const word of words) {
          if (CATEGORY_DICTIONARY[word]) {
            category = CATEGORY_DICTIONARY[word];
            subCategory = "عام";
            confidence = 85;
            found = true;
            break;
          }
        }
      }

      // 3. Multi-word
      if (!found) {
        for (let w = 0; w < words.length - 1; w++) {
          const phrase = words[w] + " " + words[w + 1];
          if (CATEGORY_DICTIONARY[phrase]) {
            category = CATEGORY_DICTIONARY[phrase];
            subCategory = "عام";
            confidence = 80;
            found = true;
            break;
          }
        }
      }
      
      // 4. Fuzzy
      if (!found) {
        for (const word of words) {
          const fuzzyResult = fuzzyFindCategory(word, CATEGORY_DICTIONARY, 2);
          if (fuzzyResult && typeof fuzzyResult === "string") {
             category = fuzzyResult;
             subCategory = "عام";
             confidence = 60;
             found = true;
             break;
          }
        }
      }
    } else {
      confidence = 80; // Income matches are relatively straightforward usually
    }

    let description = allContext.replace(/\d+(\.\d+)?/g, "").replace(/(جنيه|ج\.م|ج|الف|ألف)/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!description || description.length < 2) description = type === "income" ? "دخل" : category;

    items.push({ amount, category, subCategory, description, type, confidence });
  }

  return items.length > 0 ? items : null;
}

async function aiParse(text: string, client: any, userId: number, userType: string, contextObj: any) {
  const prompt = `أنت نظام ذكاء مالي اصطناعي احترافي (Professional Financial AI). حلل النص التالي واستخرج العمليات المالية بدقة.
  الفئات المتاحة: [أكل وشرب، مواصلات، فواتير، سكن، تسوق، صحة، تعليم، ترفيه، هدايا، استثمار، دخل، متنوعات]
  
  لكل عملية، حدد الفئة (category) والفئة الفرعية (subCategory) بدقة، بالإضافة لنسبة ثقتك في هذا التحليل (confidence) من 0 لـ 100.
  
  قواعد هامة جداً للاستنتاج:
  - الأرقام الكبيرة جداً (أكثر من 10,000) نادراً ما تكون أكل أو مواصلات عادية، وغالباً تكون (سيارة، إيجار، أجهزة، أو عقارات).
  - الأجهزة الإلكترونية (موبايل، تليفون، لابتوب) يجب تصنيفها تحت فئة "تسوق" والفئة الفرعية "أجهزة إلكترونية"، وليست "فواتير".
  - لا تضع مصروف تحت فئة "متنوعات" إلا إذا كان النص غامضاً تماماً. استنتج السياق بناءً على الكلمات.
  
  رد بـ JSON فقط:
  {
    "items": [{"amount":رقم,"category":"فئة","subCategory":"فئة فرعية","description":"وصف مختصر","type":"income"|"expense","confidence":رقم}],
    "alertMessage": "رسالة تنبيه مالية احترافية باللغة العربية الفصحى المعاصرة (اختياري)"
  }

  السياق الحالي:
  - إجمالي دخل الشهر: ${contextObj.totalIncome}
  - إجمالي مصاريف الشهر: ${contextObj.totalExpense}
  - التاريخ: ${contextObj.currentDate}

  النص: "${text}"`;

  let response = "";
  try {
    const result = await client.aiModel.generateContent(prompt);
    response = result.response.text();
    const tokens = result.response.usageMetadata?.totalTokenCount || 0;
    await trackTokens(userId, userType, tokens);
  } catch (error: any) {
    console.error("AI API Error (Key 1):", error.message);
    // ── FAILOVER SYSTEM ──
    if (client.apiKey2 && client.apiKey2 !== "AIzaSyCTbqi-uF65bRYw8T32DbVOciM9CIMjRuo_placeholder") {
      try {
        console.log("Switching to Failover API Key...");
        const genAI2 = new GoogleGenerativeAI(client.apiKey2);
        const fallbackModel = genAI2.getGenerativeModel({ 
          model: client.modelName, 
          generationConfig: client.aiModel.generationConfig 
        });
        const result = await fallbackModel.generateContent(prompt);
        response = result.response.text();
        const tokens = result.response.usageMetadata?.totalTokenCount || 0;
        await trackTokens(userId, userType, tokens);
      } catch (fallbackError) {
        console.error("Failover API Error (Key 2):", fallbackError);
        return null;
      }
    } else {
      return null;
    }
  }

  const stripCodeFences = (s: string) => s.replace(/```json?/g, "").replace(/```/g, "").trim();

  const tryParse = (s: string) => {
    try {
      const j = JSON.parse(s);
      if (j.items && Array.isArray(j.items)) return j;
      if (Array.isArray(j)) return { items: j, alertMessage: null };
      return null;
    } catch {
      return null;
    }
  };

  const cleaned = stripCodeFences(response);

  // 1) direct parse
  let parsed = tryParse(cleaned);
  if (parsed) return parsed;

  // 2) extract first JSON object/array block
  const blockMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (blockMatch && blockMatch[0]) {
    parsed = tryParse(blockMatch[0]);
    if (parsed) return parsed;
  }

  // 3) try to remove any leading junk before the first brace/bracket and progressively trim trailing junk
  const firstIdx = cleaned.search(/[\{\[]/);
  if (firstIdx !== -1) {
    const substr = cleaned.slice(firstIdx);
    for (let end = substr.length; end > 0; end--) {
      const attempt = substr.slice(0, end);
      parsed = tryParse(attempt);
      if (parsed) return parsed;
    }
  }

  // 4) last resort: strip any leading non-brace characters and try once
  const fallback = cleaned.replace(/^[^\{\[]*/g, "");
  parsed = tryParse(fallback);
  if (parsed) return parsed;

  // Log a truncated snapshot for debugging (avoid leaking long secrets)
  try {
    console.error("aiParse: failed to parse AI response as JSON. snippet:", cleaned.slice(0, 1000));
  } catch {}

  return { items: [], alertMessage: null };
}

export const aiRouter = router({
  // ─── Parse Expense (New Pipeline) ───
  parseExpense: authedProcedure
    .input(z.object({ text: z.string(), model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"), skipClarification: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Check daily limits
      const today = new Date(); today.setHours(0,0,0,0);
      const todayUsage = await db.select({ count: sql`COUNT(*)` }).from(aiSummaries)
        .where(and(eq(aiSummaries.userId, ctx.user.id), eq(aiSummaries.userType, ctx.user.type), gte(aiSummaries.createdAt, today)));

      let dailyLimit = 10;
      let tokenLimit = 50000;
      let apiKey = env.GEMINI_API_KEY;
      let apiKey2 = "";
      let modelName = env.GEMINI_MODEL_FREE;
      let maxPerRequest = 512;

      try {
        const client = await getAiClient("parse", ctx.user.plan);
        dailyLimit = client.dailyLimit;
        tokenLimit = client.tokenLimit;
        apiKey = client.apiKey;
        apiKey2 = client.apiKey2;
        modelName = client.modelName;
        maxPerRequest = client.maxPerRequest;
      } catch {}

      if ((todayUsage[0]?.count as number ?? 0) >= dailyLimit) {
        const upgradeTo = ctx.user.plan === "free" ? "برو" : "ألترا";
        throw new TRPCError({ code: "FORBIDDEN", message: `وصلت للحد اليومي (${dailyLimit} طلب). حدث لـ${upgradeTo}!` });
      }

      // Check token limits
      const userRecord = ctx.user.type === "oauth"
        ? await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) })
        : await db.query.localUsers.findFirst({ where: eq(localUsers.id, ctx.user.id) });

      const usedTokens = userRecord?.aiTokensUsed || 0;
      if (usedTokens >= tokenLimit) {
        const upgradeTo = ctx.user.plan === "free" ? "برو" : "ألترا";
        throw new TRPCError({ code: "FORBIDDEN", message: `استهلكت رصيدك الشهري (${tokenLimit} كلمة). حدث لـ${upgradeTo}!` });
      }

      // Get user dictionary
      const userDict = await db.select().from(userDictionaries)
        .where(and(eq(userDictionaries.userId, ctx.user.id), eq(userDictionaries.userType, ctx.user.type)))
        .then(rows => rows.map(row => ({ word: row.word, category: row.category, subCategory: row.subCategory ?? undefined })));
      // Get month context
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const currentMonthOps = await db.select().from(expenses)
        .where(and(eq(expenses.userId, ctx.user.id), eq(expenses.userType, ctx.user.type), gte(expenses.date, startOfMonth)));
      const totalIncome = currentMonthOps.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
      const totalExpense = currentMonthOps.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);

      // ── Run the new Pipeline ──
      const result = await runPipeline({
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
        skipClarification: input.skipClarification,
      });

      // Track tokens
      if (result.tokensUsed > 0) {
        await trackTokens(ctx.user.id, ctx.user.type, result.tokensUsed);
      }

      // ── Log classification ──
      await db.insert(classificationLogs).values({
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
        classificationVersion: "v2.1",
        reasoningTraceLight: {
          entities: result.log.entitiesFound,
          ruleEngine: result.log.ruleEngineResult,
          ai: result.log.aiResult,
        },
        ambiguityFlags: result.items.flatMap((item: any) => item.ambiguityFlags || []),
        inputChannel: "text",
        needsFollowup: result.decision === "clarify" || result.overallConfidence < 60,
        modelUsed: result.modelUsed,
        tokensUsed: result.tokensUsed,
        processingTimeMs: result.processingTimeMs,
      }).catch(() => {});

      // Cache usage
      await db.insert(aiSummaries).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        period: "daily",
        periodValue: new Date().toISOString().split("T")[0],
        model: result.modelUsed,
        content: JSON.stringify(result.items || []),
      }).catch(() => {});

      return {
        items: result.items,
        model: result.modelUsed,
        parsedBy: result.parsedBy,
        alertMessage: result.alertMessage,
        decision: result.decision,
        overallConfidence: result.overallConfidence,
        clarificationQuestion: result.clarificationQuestion,
        processingTimeMs: result.processingTimeMs,
      };
    }),

  // ─── Get User Limits (Voice, AI) ───
  getUserLimits: authedProcedure.query(async ({ ctx }) => {
    const settings = await db.select().from(systemSettings);
    const cfg: Record<string, string> = {};
    settings.forEach(s => { if (s.value) cfg[s.key] = s.value; });

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
        where: (table, { and, eq }) => and(eq(table.userId, ctx.user.id), eq(table.userType, ctx.user.type), eq(table.status, "active"))
      });
      if (sub) {
        cycleStart = sub.startDate;
        // Adjust cycleStart to current month/year relative to startDate day
        const day = cycleStart.getDate();
        const currentMonthCycle = new Date(now.getFullYear(), now.getMonth(), day);
        if (now < currentMonthCycle) {
          cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, day);
        } else {
          cycleStart = currentMonthCycle;
        }
      }
    } else {
      // Free user: use account creation date
      const userRec = ctx.user.type === "oauth" 
        ? await db.query.users.findFirst({ where: (table, { eq }) => eq(table.id, ctx.user.id) })
        : await db.query.localUsers.findFirst({ where: (table, { eq }) => eq(table.id, ctx.user.id) });
      
      if (userRec && userRec.createdAt) {
        const day = userRec.createdAt.getDate();
        const currentMonthCycle = new Date(now.getFullYear(), now.getMonth(), day);
        if (now < currentMonthCycle) {
          cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, day);
        } else {
          cycleStart = currentMonthCycle;
        }
      }
    }

    const usedVoiceSeconds = await getVoiceSecondsSince(ctx.user.id, ctx.user.type, cycleStart);
    const voiceLimit = voiceLimits[ctx.user.plan] || 300;
    
    return {
      voice: {
        limit: voiceLimit,
        used: usedVoiceSeconds,
        remaining: voiceLimit > 0 ? Math.max(0, voiceLimit - usedVoiceSeconds) : -1,
        resetDate: new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate()).toISOString(),
        maxPerRequest: voicePerReq[ctx.user.plan] || 60,
      }
    };
  }),

  // ─── Speech-to-Text via Gemini ───
  speechToText: authedProcedure
    .input(z.object({
      audioBase64: z.string(),
      mimeType: z.string().default("audio/webm"),
      durationSeconds: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get cycle start
      const now = new Date();
      let cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      if (ctx.user.plan !== "free") {
        const sub = await db.query.proSubscriptions.findFirst({
          where: (table, { and, eq }) => and(eq(table.userId, ctx.user.id), eq(table.userType, ctx.user.type), eq(table.status, "active"))
        });
        if (sub) {
          const day = sub.startDate.getDate();
          const currentMonthCycle = new Date(now.getFullYear(), now.getMonth(), day);
          cycleStart = now < currentMonthCycle ? new Date(now.getFullYear(), now.getMonth() - 1, day) : currentMonthCycle;
        }
      } else {
        const userRec = ctx.user.type === "oauth" 
          ? await db.query.users.findFirst({ where: (table, { eq }) => eq(table.id, ctx.user.id) })
          : await db.query.localUsers.findFirst({ where: (table, { eq }) => eq(table.id, ctx.user.id) });
        if (userRec && userRec.createdAt) {
          const day = userRec.createdAt.getDate();
          const currentMonthCycle = new Date(now.getFullYear(), now.getMonth(), day);
          cycleStart = now < currentMonthCycle ? new Date(now.getFullYear(), now.getMonth() - 1, day) : currentMonthCycle;
        }
      }

      // Check voice limits
      const usedSeconds = await getVoiceSecondsSince(ctx.user.id, ctx.user.type, cycleStart);

      // Get voice limits from settings
      const settings = await db.select().from(systemSettings);
      const cfg: Record<string, string> = {};
      settings.forEach(s => { if (s.value) cfg[s.key] = s.value; });

      const voiceLimits: Record<string, number> = {
        free: parseInt(cfg.voice_limit_free || "300"),    // 5 min
        pro: parseInt(cfg.voice_limit_pro || "1800"),     // 30 min
        ultra: parseInt(cfg.voice_limit_ultra || "0"),    // unlimited
      };

      const limit = voiceLimits[ctx.user.plan] || 300;
      if (limit > 0 && usedSeconds >= limit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `وقت التسجيل الصوتي خلص (${Math.floor(limit / 60)} دقيقة/شهر). حدث للبرو للمزيد!`,
        });
      }

      // Get API key
      let apiKey = cfg.ai_api_key || env.GEMINI_API_KEY;
      const sttModel = cfg.stt_model || "gemini-2.5-flash";

      const cleanMimeType = input.mimeType.split(';')[0];
      const result = await runSTTPipeline(input.audioBase64, cleanMimeType, apiKey, sttModel);
      if (!result) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل تحويل الصوت. جرب تاني." });
      }

      const currentMonthStr = new Date().toISOString().slice(0, 7);
      // Track voice usage
      await db.insert(voiceUsage).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        durationSeconds: input.durationSeconds,
        month: currentMonthStr,
        source: "gemini_stt",
      }).catch(() => {});

      // Track tokens
      if (result.tokensUsed > 0) {
        await trackTokens(ctx.user.id, ctx.user.type, result.tokensUsed);
      }

      const remaining = limit > 0 ? Math.max(0, limit - usedSeconds - input.durationSeconds) : -1;

      return {
        text: result.text,
        tokensUsed: result.tokensUsed,
        remainingSeconds: remaining,
        remainingFormatted: remaining >= 0 ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "غير محدود",
      };
    }),


  // ─── Financial Copilot: Personal Learning ───
  learnWord: authedProcedure
    .input(z.object({
      word: z.string(),
      category: z.string(),
      subCategory: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Upsert into user_dictionaries
      await db.insert(userDictionaries).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        word: input.word.trim().toLowerCase(),
        category: input.category,
        subCategory: input.subCategory || "عام",
      }).onDuplicateKeyUpdate({
        set: {
          category: input.category,
          subCategory: input.subCategory || "عام",
        }
      });
      return { success: true };
    }),

  // ─── Financial Copilot: Monthly Insights ───
  generateMonthlyInsights: authedProcedure
    .input(z.object({
      month: z.string(),
      model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
    }))
    .mutation(async ({ ctx, input }) => {
      // ── 0. Rate Limiting Foundation (Reports Generation Limits) ──
      /* 
      const lastSummary = await db.select().from(aiSummaries)
        .where(and(eq(aiSummaries.userId, ctx.user.id), eq(aiSummaries.userType, ctx.user.type), eq(aiSummaries.period, "monthly")))
        .orderBy(desc(aiSummaries.createdAt)).limit(1);
      
      if (lastSummary[0]) {
        const daysSinceLast = (new Date().getTime() - lastSummary[0].createdAt.getTime()) / (1000 * 3600 * 24);
        if (ctx.user.plan !== "pro" && daysSinceLast < 30) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "المستخدم المجاني مسموح له بتقرير ذكي واحد كل شهر." });
        }
        if (ctx.user.plan === "pro" && daysSinceLast < 14) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "مستخدم برو مسموح له بتقرير ذكي كل أسبوعين." });
        }
      }
      */

      // ── 1. Backend Preprocessing (saves 80% tokens) ──
      const [year, month] = input.month.split("-");
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      const daysInMonth = endDate.getDate();

      // Current month expenses
      const userExpenses = await db.select().from(expenses)
        .where(and(
          eq(expenses.userId, ctx.user.id),
          eq(expenses.userType, ctx.user.type),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate)
        ));

      if (userExpenses.length === 0) {
        return { insights: JSON.stringify({ response_text: "مفيش مصاريف مسجلة الشهر ده لسه. ابدأ سجل وهنحللك كل حاجة! 💰", alerts: [], personality_flag: "new_user", data_table: null }), cached: false, model: "backend" };
      }

      // Previous month for comparison
      const prevStart = new Date(parseInt(year), parseInt(month) - 2, 1);
      const prevEnd = new Date(parseInt(year), parseInt(month) - 1, 0);
      const prevExpenses = await db.select().from(expenses)
        .where(and(
          eq(expenses.userId, ctx.user.id),
          eq(expenses.userType, ctx.user.type),
          gte(expenses.date, prevStart),
          lte(expenses.date, prevEnd)
        ));

      // Get user profile for context
      const profile = await db.select().from(userProfiles)
        .where(and(eq(userProfiles.userId, ctx.user.id), eq(userProfiles.userType, ctx.user.type)))
        .limit(1);
      const userProfile = profile[0] || null;

      // ── 2. Backend Calculations ──
      const totalExpense = userExpenses.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      const totalIncome = userExpenses.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
      const prevTotal = prevExpenses.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      const dailyAvg = Math.round(totalExpense / daysInMonth);

      // Category breakdown
      const byCategory: Record<string, number> = {};
      userExpenses.filter(e => e.type === "expense").forEach(e => {
        byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
      });
      const sortedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
      const topCategory = sortedCats[0];
      const topCategoryPercent = topCategory ? Math.round((topCategory[1] / totalExpense) * 100) : 0;

      // ── Subcategory breakdown (PRIMARY focus for reports) ──
      const bySubCategory: Record<string, { amount: number; mainCat: string }> = {};
      userExpenses.filter(e => e.type === "expense").forEach(e => {
        const subKey = e.subCategory && e.subCategory !== "عام" ? `${e.category} > ${e.subCategory}` : e.category;
        if (!bySubCategory[subKey]) bySubCategory[subKey] = { amount: 0, mainCat: e.category };
        bySubCategory[subKey].amount += Number(e.amount);
      });
      const sortedSubs = Object.entries(bySubCategory).sort((a, b) => b[1].amount - a[1].amount);
      const topSubCategories = sortedSubs.slice(0, 10).map(([name, data]) => ({
        name, amount: data.amount, mainCat: data.mainCat,
        percent: totalExpense > 0 ? Math.round((data.amount / totalExpense) * 100) : 0,
      }));

      // Previous month category comparison
      const prevByCategory: Record<string, number> = {};
      prevExpenses.filter(e => e.type === "expense").forEach(e => {
        prevByCategory[e.category] = (prevByCategory[e.category] || 0) + Number(e.amount);
      });
      const catChanges: Array<{ cat: string; current: number; prev: number; changePercent: number }> = [];
      for (const [cat, amount] of sortedCats) {
        const prev = prevByCategory[cat] || 0;
        const change = prev > 0 ? Math.round(((amount - prev) / prev) * 100) : 100;
        catChanges.push({ cat, current: amount, prev, changePercent: change });
      }

      // Monthly change
      const monthlyChange = prevTotal > 0 ? Math.round(((totalExpense - prevTotal) / prevTotal) * 100) : 0;

      // ── 3. Financial Personality Detection (Backend) ──
      const flexCats = ["ترفيه", "تسوق", "أكل وشرب", "رفاهية", "هدايا"];
      const currentFlexSpend = sortedCats.filter(([k]) => flexCats.includes(k)).reduce((s, [, v]) => s + v, 0);
      const flexPercent = totalExpense > 0 ? Math.round((currentFlexSpend / totalExpense) * 100) : 0;
      let personality = "balanced";
      if (flexPercent > 45) personality = "impulsive";
      else if (flexPercent < 15 && totalExpense > 0) personality = "conservative";
      if (monthlyChange > 30) personality = "stressed";

      // ── 4. Smart Alerts (Backend) ──
      const alerts: string[] = [];
      if (topCategory && topCategoryPercent > 60) {
        alerts.push(`⚠️ ${topCategory[0]} واخد ${topCategoryPercent}% من ميزانيتك - اعتماد عالي على بند واحد`);
      }
      if (monthlyChange > 20 && prevTotal > 0) alerts.push(`📈 مصاريفك زادت ${monthlyChange}% عن الشهر اللي فات`);
      if (monthlyChange < -15 && prevTotal > 0) alerts.push(`✅ أحسنت! مصاريفك قلت ${Math.abs(monthlyChange)}% عن الشهر اللي فات`);
      
      const comparisonIncome = totalIncome > 0 ? totalIncome : Number(userProfile?.monthlyIncome || 0);
      const incomeRatio = comparisonIncome > 0 ? Math.round((totalExpense / comparisonIncome) * 100) : null;
      
      if (incomeRatio && incomeRatio > 90) alerts.push(`🚨 صرفت ${incomeRatio}% من دخلك - خطر على الميزانية!`);
      if (incomeRatio && incomeRatio < 50 && totalExpense > 0) alerts.push(`💰 مذهل! أنت بتوفر أكتر من نص دخلك.`);

      // ── 4.5. Perfect AI Mimicry & Memory (Recurring, Pattern, Forecast) ──
      // Recurring Detection (Bills & Subscriptions)
      const recurringBills: string[] = [];
      const billCategories = ["فواتير", "اشتراكات", "سكن"];
      const currentBills = userExpenses.filter(e => billCategories.includes(e.category) || (e.subCategory && e.subCategory.includes("اشتراك")));
      const prevBills = prevExpenses.filter(e => billCategories.includes(e.category) || (e.subCategory && e.subCategory.includes("اشتراك")));
      
      prevBills.forEach(pb => {
        // Check if a similar bill was paid this month (by category/description match)
        const isPaid = currentBills.some(cb => cb.category === pb.category && (cb.description === pb.description || Math.abs(Number(cb.amount) - Number(pb.amount)) < 50));
        if (!isPaid && !recurringBills.some(r => r.includes(pb.category))) {
          recurringBills.push(`${pb.description || pb.category} (~${pb.amount} ج.م)`);
        }
      });

      // Pattern Memory
      const prevFlexSpend = prevExpenses.filter(e => flexCats.includes(e.category)).reduce((s, e) => s + Number(e.amount), 0);
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
      if (today.getMonth() === endDate.getMonth() && today.getFullYear() === endDate.getFullYear()) {
        const currentDay = Math.max(1, today.getDate());
        const runRate = Math.round((totalExpense / currentDay) * daysInMonth);
        if (comparisonIncome > 0) {
          if (runRate > comparisonIncome) {
            const runwayDays = Math.floor(comparisonIncome / (totalExpense / currentDay));
            forecast = `تحذير سيولة (Burn Rate): استمرار الإنفاق بهذا المعدل سيؤدي إلى نفاد الميزانية المتبقية في يوم ${runwayDays} من الشهر (الاستهلاك المتوقع ${runRate}، الدخل ${comparisonIncome}).`;
          } else {
            const projectedSavings = comparisonIncome - runRate;
            forecast = `توقع مالي آمن: المعدل الحالي ممتاز، المتوقع بنهاية الشهر توفير حوالي ${projectedSavings} ج.م.`;
          }
        }
      }

      // ── 5. Build summary for AI (with subcategory focus and Memory) ──
      const subCatSummary = topSubCategories.slice(0, 8).map(s => `${s.name}: ${s.amount}ج (${s.percent}%)`).join(" | ");
      const summaryForAI = `الشهر: ${input.month}
إجمالي المصاريف: ${totalExpense} ج.م | الدخل: ${comparisonIncome} ج.م
${prevTotal > 0 ? `تغير إجمالي المصاريف عن الشهر السابق: ${monthlyChange > 0 ? "+" : ""}${monthlyChange}%` : "هذا أول شهر يتم تسجيله"}
أكبر بند إنفاق رئيسي: ${topCategory ? `${topCategory[0]} (${topCategoryPercent}%)` : "لا يوجد"}
تفاصيل الفئات الفرعية (الأكثر استهلاكاً): ${subCatSummary}
تغيرات الفئات عن الشهر السابق: ${catChanges.slice(0, 4).map(c => `${c.cat}: ${c.current}ج ${c.prev > 0 ? `(${c.changePercent > 0 ? "+" : ""}${c.changePercent}%)` : ""}`).join(" | ")}
متوسط الإنفاق اليومي الفعلي: ${dailyAvg} ج.م
الشخصية المالية التحليلية: ${personality}
---
الذكاء المالي المتقدم (Perfect Memory & Mimicry):
- ذاكرة الأنماط: ${patternMemory || "لا يوجد بيانات كافية للمقارنة التاريخية"}
- فواتير واشتراكات متوقعة قريباً: ${recurringBills.length > 0 ? recurringBills.join(" | ") : "لا يوجد فواتير معلقة مكتشفة بناءً على السجل السابق"}
- التوقع المالي المستقبلي (Forecasting): ${forecast || "غير متاح لعدم كفاية بيانات الدخل/الأيام"}`;

      // ── 6. Try AI, fallback to backend ──
      let aiModel: any;
      let modelName = "backend";
      let aiResponseLength = "medium";
      let aiFocus = "balanced";
      
      try {
        const client = await getAiClient("report", ctx.user.plan);
        aiModel = client.aiModel;
        modelName = client.modelName;

        const settings = await db.select().from(systemSettings);
        settings.forEach(s => {
          if (s.key === "ai_response_length" && s.value) aiResponseLength = s.value;
          if (s.key === "ai_focus" && s.value) aiFocus = s.value;
        });

        // Check token limit
        const tokenField = ctx.user.type === "oauth" 
          ? await db.select({ t: users.aiTokensUsed }).from(users).where(eq(users.id, ctx.user.id))
          : await db.select({ t: localUsers.aiTokensUsed }).from(localUsers).where(eq(localUsers.id, ctx.user.id));
        const usedTokens = tokenField[0]?.t || 0;
        const limit = ctx.user.plan === "pro" ? client.proTokenLimit : client.freeTokenLimit;
        if (usedTokens >= limit) {
          aiModel = null;
          modelName = "backend";
        }
      } catch (e) {}

      let responseJson: any;

      if (aiModel) {
        try {
          let lengthInstruction = "اكتب تحليلاً متوازناً ومناسباً للشرح بأسلوب مهني.";
          if (aiResponseLength === "short") lengthInstruction = "اكتب موجزاً تنفيذياً (Executive Summary) مختصراً ومباشراً وضع النقاط الأساسية للقرار المالي.";
          if (aiResponseLength === "detailed") lengthInstruction = "اكتب تقريراً مالياً (Financial Report) متعمقاً جداً ومفصلاً يشرح كل الجوانب، ويحلل المخاطر، والفرص، والأنماط بشكل دقيق واحترافي.";

          // Make length dynamically aware of the transaction count
          lengthInstruction += ` (ملاحظة: النظام يحتوي على تفاصيل ${userExpenses.length} معاملة. يرجى تكييف كثافة وعمق التقرير ليعكس هذا الحجم من البيانات بدقة).`;

          let focusInstruction = "ركز على إعطاء مزيج متوازن بين الإحصائيات، ومؤشرات الأداء، والتوصيات.";
          if (aiFocus === "statistics") focusInstruction = "ركز بشكل كامل على الأرقام، النسب المئوية، والمقارنات الإحصائية الدقيقة، والمؤشرات المالية مثل معدل الحرق المالي والادخار.";
          if (aiFocus === "tips") focusInstruction = "ركز بشكل كبير على تقديم توصيات استراتيجية وحلول عملية لإعادة هيكلة الميزانية وتحسين كفاءة الإنفاق.";
          if (aiFocus === "patterns") focusInstruction = "ركز على اكتشاف الأنماط السلوكية، وتفسير توجهات الإنفاق (Spending Trends)، وتقييم السلوك المالي على المدى الطويل.";

          const prompt = `أنت "محلل مالي خبير" (Expert Financial Analyst) تعمل في نظام ذكاء أعمال مؤسسي (Enterprise Financial Platform).
المطلوب منك تحليل هذه البيانات المالية للمستخدم، وتقديم تقرير استشاري عالي المستوى باللغة العربية الفصحى المعاصرة (لغة الأعمال والأموال). لا تستخدم العامية المصرية.

البيانات الإحصائية:
${summaryForAI}

إرشادات التقرير:
- الطول والعمق: ${lengthInstruction}
- التركيز الأساسي: ${focusInstruction}

صيغة التقرير المطلوبة (يجب أن ترد بـ JSON فقط بدون أي نصوص خارجية):
{
  "response_text": "نص التقرير هنا. يجب أن يكون بأسلوب مؤسسي محترف. استخدم مصطلحات مثل: تشير البيانات إلى، تمركز الإنفاق، معدلات النمو، مرونة الميزانية، الهيكلة المالية. قسم النص لفقرات مريحة بصرياً.",
  "alerts": ["تنبيه مالي محترف 1", "تنبيه مالي محترف 2"],
  "personality_flag": "${personality}",
  "data_table": [{"category":"الفئة","amount":رقم,"percent":رقم,"change":"نص يشرح التغير"}]
}

قواعد صارمة جداً:
- أسلوب الكتابة: احترافي جداً، رزين، وموضوعي (Objective & Analytical).
- يجب دمج "التوقع المالي" و"ذاكرة الأنماط" و"الاشتراكات المتوقعة" في سياق تقريرك بأسلوب احترافي لتبدو كأنها استنتاجات ذكية جداً من طرفك وذاكرة قوية للنظام.
- تجنب العبارات المبتذلة مثل "لا تصرف كثيراً"، واستخدم بدلاً منها "يوصى بإعادة تقييم حجم الإنفاق في هذا البند لتحسين تدفقات السيولة".
- يجب أن يكون التنسيق JSON صالحاً بنسبة 100%.`;

          const result = await aiModel.generateContent(prompt);
          const raw = result.response.text().replace(/```json?/g, "").replace(/```/g, "").trim();
          const tokens = result.response.usageMetadata?.totalTokenCount || 0;
          await trackTokens(ctx.user.id, ctx.user.type, tokens);
          
          try { responseJson = JSON.parse(raw); } catch { 
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) try { responseJson = JSON.parse(match[0]); } catch {}
          }
        } catch (err) {
          console.error("AI Insights Error:", err);
        }
      }

      // ── 7. Backend Fallback (still smart!) ──
      if (!responseJson) {
        modelName = "backend";
        let text = "";
        if (topCategoryPercent > 50) {
          text += `عندك اعتماد عالي جداً على بند "${topCategory![0]}" (${topCategoryPercent}% من صرفك). أي زيادة بسيطة في البند ده ممكن تضغط ميزانيتك بشكل واضح.\n\n`;
        }
        if (monthlyChange > 0 && prevTotal > 0) {
          text += `مصاريفك زادت ${monthlyChange}% عن الشهر اللي فات. `;
          const biggestIncrease = catChanges.find(c => c.changePercent > 20 && c.prev > 0);
          if (biggestIncrease) text += `أكبر زيادة كانت في "${biggestIncrease.cat}" (${biggestIncrease.changePercent}%).`;
          text += "\n\n";
        } else if (monthlyChange < 0 && prevTotal > 0) {
          text += `أحسنت! وفرت ${Math.abs(monthlyChange)}% عن الشهر اللي فات. كمل على كده! 💪\n\n`;
        }
        if (incomeRatio && incomeRatio > 80) {
          text += `⚠️ صرفت ${incomeRatio}% من دخلك. لازم تسيب هامش أمان 20% على الأقل.\n\n`;
        }
        text += `متوسط صرفك اليومي ${dailyAvg} ج.م (${totalExpense} ج.م إجمالي الشهر).`;
        if (personality === "impulsive") text += "\n\nلاحظ إن نسبة كبيرة من صرفك على حاجات مرنة (ترفيه/تسوق). حاول تحط ليها حد شهري.";

        responseJson = {
          response_text: text,
          alerts,
          personality_flag: personality,
          data_table: sortedCats.slice(0, 5).map(([cat, amt]) => ({
            category: cat, amount: amt, percent: Math.round((amt / totalExpense) * 100),
            change: prevByCategory[cat] ? `${Math.round(((amt - prevByCategory[cat]) / prevByCategory[cat]) * 100)}%` : "جديد"
          }))
        };
      }

      // Update personality in profile
      await db.insert(userProfiles).values({
        userId: ctx.user.id, userType: ctx.user.type, financialPersonality: personality,
      }).onDuplicateKeyUpdate({ set: { financialPersonality: personality } }).catch(() => {});

      const insightsStr = JSON.stringify(responseJson);
      await db.insert(aiSummaries).values({
        userId: ctx.user.id, userType: ctx.user.type,
        period: "monthly", periodValue: input.month,
        model: modelName, content: insightsStr,
      }).catch(() => {});

      return { insights: insightsStr, cached: false, model: modelName };
    }),

  // ─── Compare Months ───
  compareMonths: authedProcedure
    .input(z.object({
      month1: z.string(),
      month2: z.string(),
      model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
    }))
    .mutation(async ({ ctx, input }) => {
      let aiModel: any;
      let modelName = "demo";
      try {
        const client = await getAiClient("report", ctx.user.plan);
        aiModel = client.aiModel;
        modelName = client.modelName;
      } catch (e) {}

      const getMonthData = async (monthStr: string) => {
        const [y, m] = monthStr.split("-");
        const start = new Date(parseInt(y), parseInt(m) - 1, 1);
        const end = new Date(parseInt(y), parseInt(m), 0);
        const exps = await db.select().from(expenses)
          .where(and(eq(expenses.userId, ctx.user.id), eq(expenses.userType, ctx.user.type), gte(expenses.date, start), lte(expenses.date, end)));
        return { total: exps.reduce((s, e) => s + Number(e.amount), 0), count: exps.length };
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
        await trackTokens(ctx.user.id, ctx.user.type, tokens);
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
    .input(z.object({
      year: z.string(),
      model: z.enum(["flash", "pro", "ultra", "gemma"]).default("pro"),
    }))
    .mutation(async ({ ctx, input }) => {
      let aiModel: any;
      let modelName = "demo";
      try {
        const client = await getAiClient("report", ctx.user.plan);
        aiModel = client.aiModel;
        modelName = client.modelName;
      } catch (e) {}

      const start = new Date(parseInt(input.year), 0, 1);
      const end = new Date(parseInt(input.year), 11, 31);
      const exps = await db.select().from(expenses)
        .where(and(eq(expenses.userId, ctx.user.id), eq(expenses.userType, ctx.user.type), gte(expenses.date, start), lte(expenses.date, end)));

      const total = exps.reduce((s, e) => s + Number(e.amount), 0);
      const byMonth = exps.reduce((acc, e) => {
        const m = new Date(e.date).getMonth() + 1;
        acc[m] = (acc[m] || 0) + Number(e.amount);
        return acc;
      }, {} as Record<number, number>);

      const prompt = `حلل مصاريف السنة ${input.year} بالعامية المصرية:
إجمالي: ${total} جنيه
الشهور: ${Object.entries(byMonth).map(([k, v]) => `شهر ${k}: ${v}`).join(", ")}
اعمل ملخص سنوي وتوقعات.`;

      let insights = "";
      try {
        if (!aiModel) throw new Error("Demo Mode or Client Error");
        const result = await aiModel.generateContent(prompt);
        insights = result.response.text();
        const tokens = result.response.usageMetadata?.totalTokenCount || 0;
        await trackTokens(ctx.user.id, ctx.user.type, tokens);
      } catch (err) {
        console.error("AI Yearly Error:", err);
        insights = `(Fallback Mode) ملخص سنة ${input.year}:
إجمالي المصاريف: ${total} جنيه.
تأكد من إعدادات الـ API Key للحصول على تحليل ذكي.`;
      }
      return { insights, model: modelName, total };
    }),
});
