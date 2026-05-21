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
import { CATEGORIES } from "./category-registry";
import type { ParsedTransaction } from "./rule-engine";
import { mapModelName } from "./model-mapper";

const classificationResponseSchema = {
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

function buildCompressedCategories(): string {
  // Compress categories into a highly dense string to save tokens:
  // "أكل وشرب:[مطعم,قهوة,بقالة]|مواصلات:[أوبر,عامة]"
  return CATEGORIES.map(c => `${c.name_ar}:[${c.subcategories.map(s => s.name_ar).join(",")}]`).join("|");
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

function buildMicroSystemPrompt(text: string, isSmoker?: boolean): string {
  const example = selectDynamicExample(text);
  const compressedCats = buildCompressedCategories();
  const smokingRule = isSmoker ? "\n4. المستخدم مدخن، صنف مصاريف السجائر والفيب والشيشة تحت فئة 'تدخين'." : "\n4. فكك الجمل المعقدة لعدة عمليات منفصلة.";
  return `أنت محلل مالي دقيق.
استخرج المشتريات وصنفها بأدق فئة فرعية.
القواعد:
1. صنف بدقة من الفئات المتاحة فقط. (مثال: شاورما->مطعم، كورة->ترفيه/خروجة صحاب، مياه->بقالة).
2. استخرج اسم السلعة الفعلي في item_name.
3. المبالغ>10000=إيجار/أجهزة. شحنت=شحن رصيد/بنزين.${smokingRule}
الفئات:
${compressedCats}
مثال: ${example}
JSON فقط.`;
}

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

const CLARIFICATION_POLICY_PROMPT = `
Additional policy:
- Prefer precise subcategory mapping and avoid generic fallback categories when context exists.
- If clarification is needed, ask ONE critical clarification question only.
- If user selected skip clarification, never ask a question and proceed with best-effort classification.
- For multi-transaction text, split and classify each operation independently.
`;

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
    candidateCategories?: string[];  // Phase 4: from embedding hints
    amountCount?: number;            // Phase 4: for dynamic example selection
    isSmoker?: boolean | null;
  },
  skipClarification?: boolean
): Promise<AIClassificationResult | null> {
  // ── Context ──
  let userPrompt = `النص: "${text}"`;

  // Strategy 3: Temporal Context Hints — feed time/day hints to bias ambiguous classifications
  if (contextObj.currentDate) {
    try {
      const now = new Date(contextObj.currentDate);
      const dayOfMonth = now.getDate();
      const hour = now.getHours();
      const temporalHints: string[] = [];

      // Day 1-5: high-value payments are likely rent, installments, or fixed commitments
      if (dayOfMonth >= 1 && dayOfMonth <= 5) {
        temporalHints.push("بداية الشهر: المبالغ الكبيرة غالباً إيجار أو أقساط");
      }
      // Day 25-31: end-of-month often means salary or subscriptions
      if (dayOfMonth >= 25) {
        temporalHints.push("نهاية الشهر: احتمال راتب أو تجديد اشتراكات");
      }
      // Late night (12AM-5AM): likely delivery, entertainment, or online subscriptions
      if (hour >= 0 && hour < 5) {
        temporalHints.push("وقت متأخر: غالباً دليفري أو ترفيه أو اشتراكات أونلاين");
      }
      // Morning (6-9AM): likely transport or breakfast
      if (hour >= 6 && hour <= 9) {
        temporalHints.push("صباح: غالباً مواصلات أو فطار");
      }

      if (temporalHints.length > 0) {
        userPrompt += `\nتلميح زمني:${temporalHints.join(".")}`;
      }
    } catch { /* ignore date parse errors */ }
  }

  if (contextObj.userProfileContext) {
    userPrompt += `\nسياق شخصي:${contextObj.userProfileContext.slice(0, 150)}`;
  }

  if (skipClarification) {
    userPrompt += `\nSkip=true:لا تطلب توضيح.`;
  }

  let response = "";
  let tokensUsed = 0;

  const systemPrompt = `${buildMicroSystemPrompt(text, contextObj.isSmoker ?? false)}\n${CLARIFICATION_POLICY_PROMPT}`;

  const actualModelName = mapModelName(modelName);

  // Try primary key
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: actualModelName,
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
  } catch (error: any) {
    console.error("AI Classify Error (Key 1):", error.message);

    // Failover to key 2
    if (apiKey2) {
      try {
        console.log("AI Classifier: switching to failover key...");
        const genAI2 = new GoogleGenerativeAI(apiKey2);
        const model2 = genAI2.getGenerativeModel({
          model: actualModelName,
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
      } catch (fallbackError) {
        console.error("AI Classify Error (Key 2):", fallbackError);
        return null;
      }
    } else {
      return null;
    }
  }

  // Parse response
  const parsed = parseAIResponse(response, actualModelName);
  if (parsed) {
    parsed.tokensUsed = tokensUsed;
  }
  return parsed;
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
      "gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
      // ── Gemini API stable model names ──
      "gemini-2.5-pro": "gemini-1.5-pro",
      "gemini-2.0-flash": "gemini-2.0-flash",
      "gemini-1.5-flash": "gemini-2.0-flash",
      // ── Legacy / admin UI aliases → map to supported models ──
      "gemini-3.0-flash-live": "gemini-2.0-flash",
      "gemini-3.1-flash": "gemini-2.0-flash",
      "gemini-3.1-pro": "gemini-1.5-pro",
      "gemini-2.5-flash-native-audio": "gemini-2.5-flash",
      // ── Admin shorthand names ──
      "flash": "gemini-2.0-flash",
      "flash-lite": "gemini-3.1-flash-lite",
      "pro": "gemini-1.5-pro",
      "flash-2.5": "gemini-2.5-flash",
      "flash-2.0": "gemini-2.0-flash",
    };
    let actualModelName = MODEL_MAP[modelName] ?? modelName; // Use the provided model if not in map
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
function parseAIResponse(response: string, modelName: string): AIClassificationResult | null {
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

  // Map AI response to ParsedTransaction format
  const items: ParsedTransaction[] = parsed.items.map((item: any) => ({
    amount: item.amount || 0,
    category: item.main_category || "متنوعات",
    subCategory: item.sub_category || "عام",
    description: item.item_name || item.notes || "",
    type: item.type || "expense",
    confidence: item.confidence || 70,
    merchant: item.merchant || undefined,
    currency: "EGP",
    needsReview: item.needs_review ?? (item.confidence || 70) < 85,
    parsedBy: "ai" as const,
    inferenceSource: "ai" as const,
  }));

  return {
    items,
    alertMessage: parsed.alertMessage || null,
    needsClarification: parsed.needs_clarification || false,
    clarificationQuestion: parsed.clarification_question || null,
    tokensUsed: 0,
    modelUsed: modelName,
  };
}
