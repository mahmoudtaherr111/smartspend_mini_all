/**
 * SmartSpend AI Classifier (Step 5)
 * Uses Gemini 2.5 Flash with customized system prompt for financial classification
 * Also handles Speech-to-Text via Gemini multimodal API
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { CATEGORIES } from "./category-registry";
import type { ParsedTransaction } from "./rule-engine";

/** Build the category list for the AI prompt */
function buildCategoryList(): string {
  return CATEGORIES.map(c => {
    const subs = c.subcategories.map(s => s.name_ar).join("، ");
    return `${c.icon} ${c.name_ar} (${c.type}): [${subs}]`;
  }).join("\n");
}



/** The master system prompt — customizes Gemini for SmartSpend */
const SYSTEM_PROMPT = `أنت "SmartSpend AI" — مصنف مالي مصري متخصص بالذكاء الاصطناعي.

مهمتك الوحيدة: تحليل النصوص المالية المكتوبة بالعامية المصرية واستخراج المعاملات المالية منها بدقة عالية جداً.

## القواعد الصارمة:
1. افهم العامية المصرية بكل اختصاراتها (مثلاً: "قبضت" = استلمت راتب، "سلفت" = أقرضت، "شحنت العربية" = بنزين)
2. فرّق بدقة بين: expense (مصروف), income (دخل), transfer (تحويل), investment (استثمار)
3. حدد الفئة الرئيسية (main_category) والفئة الفرعية (sub_category) بدقة — الفئة الفرعية أهم بكتير
4. الأرقام الكبيرة (أكثر من 10,000) نادراً ما تكون أكل أو مواصلات — غالباً: إيجار، أجهزة، سيارة، استثمار
5. "شحنت" وحدها = شحن رصيد (فواتير)، "شحنت العربية" = بنزين (مواصلات)
6. "حولت لـ" = تحويل أو مصروف، "حولولي" = دخل
7. "سلفت صاحبي" = دين/سلفة (تحويل)
8. فكك الجمل المتعددة لمعاملات منفصلة
9. لا تضع مصروف تحت "متنوعات" إلا إذا كان النص غامضاً تماماً — استنتج السياق
10. الأجهزة الإلكترونية (موبايل، لابتوب) = "تسوق" / "أجهزة إلكترونية" وليس "فواتير"
11. ركّز على الفئة الفرعية أكتر من الأساسية — دي اللي بتفرق في التقارير

## الفئات المتاحة:
${buildCategoryList()}

## صيغة الرد (JSON فقط):
{
  "items": [{
    "type": "expense|income|transfer|investment",
    "amount": number,
    "currency": "EGP",
    "main_category": "اسم الفئة الرئيسية بالعربي",
    "sub_category": "اسم الفئة الفرعية بالعربي",
    "confidence": 0-100,
    "needs_review": boolean,
    "merchant": "اسم المحل/الخدمة أو null",
    "notes": "وصف مختصر",
    "ambiguity_flags": ["optional_flag"],
    "inference_source": "ai",
    "confidence_breakdown": { "intent": 0-100, "taxonomy": 0-100, "heuristics": 0-100 }
  }],
  "needs_clarification": false,
  "clarification_question": null,
  "alertMessage": "رسالة تنبيه ذكية لو فيه تبذير (اختياري، أو null)"
}

## قواعد الثقة:
- confidence >= 90: واضح جداً ومؤكد
- confidence 70-89: غالباً صح بس محتاج مراجعة
- confidence < 70: فيه غموض → اعمل needs_review = true
- لو النص غامض تماماً: needs_clarification = true واسأل سؤال توضيحي ذكي بالعامية`;

/** System prompt for Speech-to-Text */
const STT_SYSTEM_PROMPT = `أنت "SmartSpend Voice Engine" — نظام التعرف الصوتي لموقع وتطبيق إدارة المصاريف "SmartSpend".

مهمتك الأساسية: تحويل كلام المستخدم (الذي يتحدث بالعامية المصرية) لتسجيل مصاريفه اليومية إلى نص دقيق ومفهوم جداً.
الهدف: أخذ هذا النص بعد ذلك لتحليله وتصنيفه مالياً.

القواعد الصارمة للتفريغ الصوتي (STT):
1. **ترجمة الأرقام المنطوقة:** حول أي رقم مسموع إلى أرقام رياضية فوراً (مثال: "صرفت تلاتين جنيه" → "صرفت 30 جنيه"، "خمسمية" → "500").
2. **الحفاظ على السياق المالي:** حافظ بدقة على كلمات مثل (مرتب، سلفة، قبضت، دفعت، إيجار، مواصلات، أوبر، كريم، فواتير).
3. **لا تضف أي نص أو تفسير من عندك:** فقط حول ما قاله المستخدم نصاً.
4. **تجاهل التأتأة (Ums and Ahs):** ركز على المعلومات المالية.
5. **الناتج هو نص فوري جاهز لمساعد مالي لمعالجته.**`;

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
  contextObj: { totalIncome: number; totalExpense: number; currentDate: string; userProfileContext?: string },
  skipClarification?: boolean
): Promise<AIClassificationResult | null> {
  let userPrompt = `السياق المالي الحالي:
- إجمالي دخل الشهر: ${contextObj.totalIncome} ج.م
- إجمالي مصاريف الشهر: ${contextObj.totalExpense} ج.م  
- التاريخ: ${contextObj.currentDate}

النص المطلوب تحليله: "${text}"`;

  if (contextObj.userProfileContext) {
    userPrompt += `\n\nSmart user profile context:\n${contextObj.userProfileContext}`;
  }

  if (skipClarification) {
    userPrompt += `\n\n**ملاحظة هامة جداً**: المستخدم طلب تخطي التوضيح (Skip). ممنوع طلب توضيح (اجعل needs_clarification = false دائمًا). قم بتخمين الفئات المجهولة بناءً على السياق، وأعد أفضل استنتاج ممكن وضع نسبة الثقة confidence مناسبة لتوقعك.`;
  }

  let response = "";
  let tokensUsed = 0;

  // Try primary key
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: `${SYSTEM_PROMPT}\n${CLARIFICATION_POLICY_PROMPT}`,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
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
          model: modelName,
          systemInstruction: `${SYSTEM_PROMPT}\n${CLARIFICATION_POLICY_PROMPT}`,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
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
  const parsed = parseAIResponse(response, modelName);
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
      // Legacy / UI aliases
      "gemini-3.0-flash-live":           "gemini-2.0-flash",
      "gemini-2.5-flash-native-audio":   "gemini-2.5-flash",
      "gemini-3.1-flash-lite":           "gemini-2.0-flash-lite",
      // Shorthand names admins might type
      "flash":                            "gemini-2.0-flash",
      "flash-lite":                       "gemini-2.0-flash-lite",
      "pro":                              "gemini-2.5-pro",
      "flash-2.5":                        "gemini-2.5-flash",
    };
    const actualModelName = MODEL_MAP[modelName] ?? modelName;
    
    // Customize configuration based on sttMode
    const generationConfig: any = {
      temperature: 0.1,
      maxOutputTokens: 512,
    };
    
    // Add specific settings for native audio if requested
    const supportsNativeAudio = actualModelName.includes("gemini-2.0") || actualModelName.includes("gemini-2.5") || actualModelName.includes("gemini-3.0");
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
  } catch (error) {
    console.error("Gemini STT Error:", error);
    return null;
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
    category: item.main_category || item.category || "متنوعات",
    subCategory: item.sub_category || item.subCategory || "عام",
    description: item.notes || item.description || "",
    type: item.type || "expense",
    confidence: item.confidence || 70,
    merchant: item.merchant || undefined,
    currency: item.currency || "EGP",
    needsReview: item.needs_review || item.confidence < 85,
    parsedBy: "ai" as const,
    inferenceSource: item.inference_source || "ai",
    ambiguityFlags: item.ambiguity_flags || undefined,
    confidenceBreakdown: item.confidence_breakdown || undefined,
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
