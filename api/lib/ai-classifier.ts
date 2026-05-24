/**
 * SmartSpend AI Classifier (Step 5)
 * Uses Gemini with dynamic micro-prompts for financial classification.
 * Enhanced with Context Pruning (Phase 4 of Intelligence Plan):
 *  - Only sends candidate categories (not all 21)
 *  - Prunes profile context based on text keywords
 *  - Selects a single dynamic few-shot example
 *  - Reduces prompt from ~1200 to ~260 tokens
 * Also handles Speech-to-Text via Gemini multimodal API.
 */
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { CATEGORIES, normalizeTransactionTaxonomy } from "./category-registry";
import type { ParsedTransaction } from "./rule-engine";
import { coerceModelForProvider, mapModelName, type AiProviderName } from "./model-mapper";
import type { PlanId } from "./ai-usage-policy";
import { estimateClassificationPromptTokens } from "./ai-routing";
import { callGroqAPI } from "./groq-client";
import { logApiKeyError } from "./error-logger";

export const classificationResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING },
          amount: { type: SchemaType.NUMBER },
          item_name: { type: SchemaType.STRING },
          main_category: { type: SchemaType.STRING },
          sub_category: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
          needs_review: { type: SchemaType.BOOLEAN }
        },
        required: ["type", "amount", "item_name", "main_category", "sub_category", "confidence"]
      }
    },
    needs_clarification: { type: SchemaType.BOOLEAN },
    clarification_question: { type: SchemaType.STRING, nullable: true },
    alertMessage: { type: SchemaType.STRING, nullable: true }
  },
  required: ["items", "needs_clarification"]
} as any;

function buildCompressedCategories(candidateMainCategories?: string[]): string {
  const allowed = candidateMainCategories?.length
    ? new Set(candidateMainCategories)
    : null;
  const list = allowed
    ? CATEGORIES.filter((c) => allowed.has(c.name_ar))
    : CATEGORIES;
  if (list.length === 0) {
    return CATEGORIES.map((c) => `${c.name_ar}:[${c.subcategories.map((s) => s.name_ar).join(",")}]`).join("|");
  }
  return list.map((c) => `${c.name_ar}:[${c.subcategories.map((s) => s.name_ar).join(",")}]`).join("|");
}

function selectDynamicExample(text: string): string {
  if (/(?:حولت|اديت|سلفت|بعتت)\s/.test(text)) {
    return '{"items":[{"amount":500,"item_name":"تحويل لأحمد","main_category":"تحويل","sub_category":"سلف وديون","type":"expense","confidence":95}]}';
  }
  if (/قبضت|مرتب|استلمت|خدت.*مصروف/.test(text)) {
    return '{"items":[{"amount":5000,"item_name":"راتب","main_category":"مرتب","sub_category":"راتب أساسي","type":"income","confidence":95}]}';
  }
  return '{"items":[{"amount":80,"item_name":"شاورما","main_category":"أكل وشرب","sub_category":"مطعم","type":"expense","confidence":90}]}';
}

function buildMicroSystemPrompt(
  text: string,
  options: {
    isSmoker?: boolean;
    plan?: PlanId;
    candidateCategories?: string[];
    richContext?: boolean;
  } = {}
): string {
  const example = selectDynamicExample(text);
  const compressedCats = buildCompressedCategories(options.candidateCategories);
  const isPro = options.plan === "pro" || options.plan === "ultra";
  const smokingRule = options.isSmoker
    ? "4.مدخن:سجائر/فيب/شيشة→تدخين."
    : isPro
      ? "4.جمل مركبة→عمليات منفصلة."
      : "4.جملة واحدة→عملية واحدة إلا مع و/كمان.";
  const qualityLine = isPro
    ? "أولوية أعلى دقة للفئة الفرعية؛ لا تستخدم متنوعات إلا للغموض الشديد."
    : "صنّف بدقة من القائمة؛ تجنب متنوعات/عام.";
  return `محلل مالي مصري.${qualityLine}
قواعد:1)فئات القائمة فقط.2)item_name=السلعة/الخدمة.3)مبالغ كبيرة→سكن/أجهزة؛شحنت→رصيد/بنزين.${smokingRule}
تصحيح مصري: نت/إنترنت/راوتر/باقة→فواتير/إنترنت. شحن رصيد→فواتير/شحن رصيد. شراء موبايل/لاب/سماعة→تسوق/أجهزة إلكترونية وليس فواتير. قبضت/استلمت/جالي مرتب→دخل/مرتب.
فئات:${compressedCats}
مثال:${example}
JSON فقط.`;
}

const CLARIFICATION_POLICY_FREE = "لا توضيح إلا للغموض الشديد؛عملية واحدة افتراضياً.";
const CLARIFICATION_POLICY_PRO = `سياسة:فئة فرعية دقيقة؛سؤال توضيح واحد فقط عند الضرورة؛تعدد العمليات→items منفصلة؛skip=true→بدون أسئلة.`;

/** System prompt for Speech-to-Text — optimized for Egyptian Arabic financial transcription */
const STT_SYSTEM_PROMPT = `أنت "SmartSpend Voice Engine" — نظام تحويل الصوت لتسجيل المصاريف.
مهمتك: تحويل كلام المستخدم بالعامية المصرية لنص مكتوب بدقة.
القواعد الصارمة:
1. حوّل الأرقام المنطوقة لأرقام (مثال: "تلاتين جنيه" → "30 جنيه"، "الف" → "1000").
2. اكتب الأرقام العربية أرقام ("خمسمية" → "500"، "الفين" → "2000").
3. حافظ على السياق المالي كما هو بالعامية المصرية بدون ترجمة.
4. لا تضف أي كلام من عندك ولا تفسر ولا تعلق.
5. تجاهل التأتأة والتكرار غير المقصود.
6. مصطلحات مالية شائعة: دفعت، صرفت، اشتريت، جبت، قبضت، حولت، ادفع، خد، حط.`;

export interface AIClassificationResult {
  items: ParsedTransaction[];
  alertMessage?: string | null;
  needsClarification: boolean;
  clarificationQuestion?: string | null;
  tokensUsed: number;
  modelUsed: string;
}

/**
 * Classify text using Gemini AI
 */
export async function aiClassify(
  text: string,
  apiKey: string,
  apiKey2: string,
  modelName: string,
  maxTokens: number,
  contextObj: {
    totalIncome: number;
    totalExpense: number;
    currentDate: string;
    userProfileContext?: string;
    personalContext?: string;
    ruleHints?: ParsedTransaction[];
    candidateCategories?: string[];
    amountCount?: number;
    isSmoker?: boolean | null;
    plan?: PlanId;
    richContext?: boolean;
    ruleHintsCompact?: string;
  },
  skipClarification?: boolean,
  groqApiKey?: string,
  provider?: "gemini" | "groq"
): Promise<AIClassificationResult | null> {
  const plan: PlanId = contextObj.plan ?? "free";
  const rich = contextObj.richContext ?? plan !== "free";

  let userPrompt = `نص:"${text}"`;

  if (rich && contextObj.currentDate) {
    try {
      const now = new Date(contextObj.currentDate);
      const hints: string[] = [];
      const day = now.getDate();
      const hour = now.getHours();
      if (day <= 5) hints.push("بداية شهر:إيجار/أقساط");
      if (day >= 25) hints.push("نهاية شهر:راتب/اشتراكات");
      if (hour < 5) hints.push("ليل:دليفري/ترفيه");
      if (hour >= 6 && hour <= 9) hints.push("صباح:مواصلات/فطار");
      if (hints.length) userPrompt += `\nزمن:${hints.join(".")}`;
    } catch { /* ignore */ }
  }

  if (rich && contextObj.userProfileContext) {
    userPrompt += `\nملف:${contextObj.userProfileContext.slice(0, plan === "ultra" ? 200 : 120)}`;
  }

  if (contextObj.ruleHintsCompact) {
    userPrompt += `\nتلميح:${contextObj.ruleHintsCompact.slice(0, 80)}`;
  }

  if (skipClarification) {
    userPrompt += `\nSkip=1`;
  }

  let response = "";
  let tokensUsed = 0;

  const systemPrompt = `${buildMicroSystemPrompt(text, {
    isSmoker: contextObj.isSmoker ?? false,
    plan,
    candidateCategories: contextObj.candidateCategories,
    richContext: rich,
  })}\n${plan === "free" ? CLARIFICATION_POLICY_FREE : CLARIFICATION_POLICY_PRO}`;

  const estimatedPromptTokens = estimateClassificationPromptTokens(
    systemPrompt.length,
    userPrompt.length
  );

  const requestedProvider: AiProviderName = provider === "groq" ? "groq" : "gemini";
  const providerModelName = coerceModelForProvider(modelName, requestedProvider, plan);
  const geminiFallbackModelName = coerceModelForProvider(modelName, "gemini", plan);
  let modelUsed = providerModelName;

  // ── Groq Branch ──
  if (provider === "groq" && groqApiKey) {
    try {
      const groqResult = await callGroqAPI(
        groqApiKey,
        providerModelName,
        systemPrompt,
        userPrompt,
        maxTokens
      );
      response = groqResult.text;
      tokensUsed = groqResult.tokensUsed;
      modelUsed = `groq:${providerModelName}`;
    } catch (groqError: any) {
      console.error("Groq classify error, falling back to Gemini:", groqError?.message);
      await logApiKeyError("groq", "groq_api_key", groqError);
      // Fall through to Gemini below
      provider = "gemini";
    }
  }

  // ── Gemini Branch ──
  if (provider !== "groq" || !response) {
    // Try primary key
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: geminiFallbackModelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
          responseSchema: classificationResponseSchema,
        },
      });

      const result = await model.generateContent(userPrompt);
      response = result.response.text();
      tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
      modelUsed = `gemini:${geminiFallbackModelName}`;
    } catch (error: any) {
      console.error("AI Classify Error (Key 1):", error.message);
      await logApiKeyError("gemini", "ai_api_key", error);

      // Failover to key 2
      if (apiKey2) {
        try {
          console.log("AI Classifier: switching to failover key...");
          const genAI2 = new GoogleGenerativeAI(apiKey2);
          const model2 = genAI2.getGenerativeModel({
            model: geminiFallbackModelName,
            systemInstruction: systemPrompt,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
              responseSchema: classificationResponseSchema,
            },
          });
          const result = await model2.generateContent(userPrompt);
          response = result.response.text();
          tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
          modelUsed = `gemini:${geminiFallbackModelName}:key2`;
        } catch (fallbackError) {
          console.error("AI Classify Error (Key 2):", fallbackError);
          await logApiKeyError("gemini", "ai_api_key_2", fallbackError);
          return null;
        }
      } else {
        return null;
      }
    }
  }

  // Parse response
  const parsed = parseAIResponse(response, modelUsed);
  if (parsed) {
    parsed.tokensUsed = tokensUsed;
    if (tokensUsed <= 0) {
      parsed.tokensUsed = estimatedPromptTokens + Math.ceil((response?.length || 0) / 3.5);
    }
  }
  return parsed;
}

export function compactRuleHints(items: ParsedTransaction[]): string {
  if (!items.length) return "";
  return items
    .slice(0, 2)
    .map((it) => `${it.amount}:${it.category}/${it.subCategory}`)
    .join("|");
}

/**
 * Speech-to-Text using Gemini multimodal API
 * Accepts audio as base64 and returns transcribed text
 */
export async function geminiSpeechToText(
  audioBase64: string,
  mimeType: string,
  apiKey: string,
  modelName: string = "gemini-2.5-flash",
  sttMode: string = "standard"
): Promise<{ text: string; tokensUsed: number } | null> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Map UI/admin model names to real Gemini API model strings
    // Priority: use the model as-is if it's a known valid API name,
    // otherwise map aliases → stable equivalents.
    const MODEL_MAP: Record<string, string> = {
      // ── Explicit Custom Models ──
      "gemini-2.5-flash": "gemini-2.5-flash",
      "gemini-3.1-flash-lite": "gemini-2.5-flash",
      // ── Gemini API stable model names ──
      "gemini-2.5-pro": "gemini-2.5-pro",
      "gemini-2.0-flash": "gemini-2.0-flash",
      "gemini-1.5-flash": "gemini-2.0-flash",
      // ── Legacy / admin UI aliases → map to supported models ──
      "gemini-3.0-flash-live": "gemini-2.0-flash",
      "gemini-3.1-flash": "gemini-2.0-flash",
      "gemini-3.1-pro": "gemini-2.5-pro",
      "gemini-2.5-flash-native-audio": "gemini-2.5-flash",
      // ── Admin shorthand names ──
      "flash": "gemini-2.0-flash",
      "flash-lite": "gemini-2.5-flash",
      "pro": "gemini-2.5-pro",
      "flash-2.5": "gemini-2.5-flash",
      "flash-2.0": "gemini-2.0-flash",
    };
    let actualModelName = mapModelName(MODEL_MAP[modelName] ?? modelName); // Normalize twice for safety
    // Ensure no spaces or weird characters
    actualModelName = actualModelName.trim();

    // Customize configuration based on sttMode
    const generationConfig: any = {
      temperature: 0.1,
      maxOutputTokens: 512,
    };

    // Add specific settings for native audio if requested
    const supportsNativeAudio = actualModelName.includes("gemini-2.0") || actualModelName.includes("gemini-2.5") || actualModelName.includes("gemini-3.0") || actualModelName.includes("gemini-3.1");
    if (sttMode === "native_audio" && supportsNativeAudio) {
      generationConfig.responseModalities = ["TEXT"];
    }

    const model = genAI.getGenerativeModel({
      model: actualModelName,
      systemInstruction: STT_SYSTEM_PROMPT,
      generationConfig,
    });

    const result = await model.generateContent([
      { text: "حوّل الصوت ده لنص مكتوب بالعامية المصرية. اكتب النص فقط بدون أي شرح:" },
      {
        inlineData: {
          mimeType: mimeType,
          data: audioBase64,
        },
      },
    ]);

    const text = result.response.text().trim();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

    return { text, tokensUsed };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error(`Gemini STT Error (Model: ${modelName}):`, errorMsg);
    throw new Error(`Gemini Error (${modelName}): ${errorMsg}`);
  }
}

/**
 * Parse AI JSON response with fallback strategies
 */
export function parseAIResponse(response: string, modelName: string): AIClassificationResult | null {
  const stripCodeFences = (s: string) => s.replace(/```json?/g, "").replace(/```/g, "").trim();
  const cleaned = stripCodeFences(response);

  const tryParse = (s: string): any => {
    try {
      const j = JSON.parse(s);
      if (j.items && Array.isArray(j.items)) return j;
      if (Array.isArray(j)) return { items: j, alertMessage: null, needs_clarification: false };
      return null;
    } catch {
      return null;
    }
  };

  // Strategy 1: direct parse
  let parsed = tryParse(cleaned);
  if (!parsed) {
    // Strategy 2: extract JSON block
    const blockMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (blockMatch) parsed = tryParse(blockMatch[0]);
  }
  if (!parsed) {
    // Strategy 3: trim leading junk
    const firstIdx = cleaned.search(/[\{\[]/);
    if (firstIdx !== -1) {
      const substr = cleaned.slice(firstIdx);
      for (let end = substr.length; end > 0; end--) {
        parsed = tryParse(substr.slice(0, end));
        if (parsed) break;
      }
    }
  }

  if (!parsed || !parsed.items) {
    console.error("AI response parse failed. Snippet:", cleaned.slice(0, 500));
    return null;
  }

  // Map AI response to ParsedTransaction format and force it back onto our canonical taxonomy.
  const items: ParsedTransaction[] = parsed.items.map((item: any) => {
    const rawCategory = item.main_category || item.category || item.category_ar || "متنوعات";
    const rawSubCategory = item.sub_category || item.subCategory || item.subcategory || "عام";
    const description = item.item_name || item.description || item.notes || "";
    const normalized = normalizeTransactionTaxonomy({
      amount: item.amount || 0,
      category: rawCategory,
      subCategory: rawSubCategory,
      description,
      type: item.type || "expense",
      confidence: item.confidence || 70,
      merchant: item.merchant || undefined,
      currency: "EGP",
      needsReview: item.needs_review ?? (item.confidence || 70) < 85,
      parsedBy: "ai" as const,
      inferenceSource: "ai" as const,
    }, `${rawCategory} ${rawSubCategory} ${description}`);

    return {
      ...normalized,
      needsReview: normalized.needsReview ?? normalized.confidence < 85,
    };
  });

  return {
    items,
    alertMessage: parsed.alertMessage || null,
    needsClarification: parsed.needs_clarification || false,
    clarificationQuestion: parsed.clarification_question || null,
    tokensUsed: 0,
    modelUsed: modelName,
  };
}
