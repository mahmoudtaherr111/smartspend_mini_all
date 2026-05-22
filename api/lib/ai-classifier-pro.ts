/**
 * Pro/Ultra classification — accuracy-first prompts with full user context.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CATEGORIES } from "./category-registry";
import type { ParsedTransaction } from "./rule-engine";
import { mapModelName } from "./model-mapper";
import type { PlanId } from "./ai-usage-policy";
import {
  classificationResponseSchema,
  parseAIResponse,
  type AIClassificationResult,
} from "./ai-classifier";
import { estimateClassificationPromptTokens } from "./ai-routing";

export interface ProClassificationContext {
  totalIncome: number;
  totalExpense: number;
  currentDate: string;
  profileSummary?: string;
  personalContext?: string;
  spendingBehavior?: string;
  topCategoriesMonth?: string;
  interests?: string;
  ruleHints?: ParsedTransaction[];
  candidateCategories?: string[];
  isSmoker?: boolean | null;
  plan?: PlanId;
}

function buildProCategoryTaxonomy(candidateMainCategories?: string[]): string {
  const allowed = candidateMainCategories?.length
    ? new Set(candidateMainCategories)
    : null;
  const list = allowed
    ? CATEGORIES.filter((c) => allowed.has(c.name_ar))
    : CATEGORIES;
  return list
    .map(
      (c) =>
        `${c.name_ar} → [${c.subcategories.map((s) => s.name_ar).join(", ")}]`
    )
    .join("\n");
}

function buildProSystemPrompt(ctx: ProClassificationContext): string {
  const cats = buildProCategoryTaxonomy(ctx.candidateCategories);
  const smoker = ctx.isSmoker
    ? "المستخدم مدخن: صنّف السجائر/الفيب/الشيشة تحت تدخين."
    : "";
  return `أنت محلل مالي Pro في SpinSmart — دقة التصنيف أولوية قصوى.
${smoker}
قواعد:
1) استخدم فقط الفئات والفئات الفرعية من القائمة — لا "متنوعات" إلا للغموض الشديد.
2) item_name = وصف السلعة/التاجر كما قالها المستخدم.
3) افصل كل عملية مالية في item مستقل عند وجود عدة مبالغ.
4) confidence 0-100 يعكس يقينك الحقيقي.
5) alertMessage اختياري: جملة مهنية واحدة عن مخاطر أو فرصة ادخار (ليس دائماً).

الفئات:
${cats}
JSON فقط حسب المخطط.`;
}

function needsRichProContext(text: string, context: ProClassificationContext): boolean {
  if ((context.ruleHints?.length ?? 0) > 0 && (context.ruleHints?.[0]?.confidence ?? 0) < 80) return true;
  if (/\d+.*(?:و|وكمان|وبعدين)/.test(text)) return true;
  if (text.length > 80) return true;
  if (/(أهل|عيلة|أولاد|زوج|زوجة|مدخن|سجاير|هدف|ادخار)/i.test(text)) return true;
  return false;
}

export async function aiClassifyPro(
  text: string,
  apiKey: string,
  apiKey2: string,
  modelName: string,
  maxTokens: number,
  context: ProClassificationContext,
  skipClarification?: boolean
): Promise<AIClassificationResult | null> {
  const rich = needsRichProContext(text, context);
  const parts: string[] = [`النص المطلوب تصنيفه:\n"${text}"`];

  parts.push(
    `\n── سياق الشهر ──`,
    `دخل: ${context.totalIncome} ج | مصروف: ${context.totalExpense} ج`
  );

  if (context.topCategoriesMonth) {
    parts.push(`أعلى فئات: ${context.topCategoriesMonth}`);
  }
  if (rich && context.spendingBehavior) {
    parts.push(`سلوك: ${context.spendingBehavior}`);
  }
  if (rich && context.profileSummary) {
    parts.push(`ملف: ${context.profileSummary.slice(0, rich ? 220 : 120)}`);
  }
  if (rich && context.personalContext) {
    parts.push(`شخصي: ${context.personalContext.slice(0, 180)}`);
  }
  if (rich && context.interests) {
    parts.push(`عادات: ${context.interests.slice(0, 120)}`);
  }
  if (context.ruleHints?.length) {
    const hints = context.ruleHints
      .slice(0, 3)
      .map((h) => `${h.amount}→${h.category}/${h.subCategory}(${h.confidence}%)`)
      .join(" | ");
    parts.push(`تلميحات المحرك المحلي (تحقق منها): ${hints}`);
  }
  if (skipClarification) {
    parts.push("SkipClarification=true — لا تسأل أسئلة توضيح.");
  }

  const userPrompt = parts.join("\n");
  const systemPrompt = buildProSystemPrompt(context);
  const estimatedPromptTokens = estimateClassificationPromptTokens(
    systemPrompt.length,
    userPrompt.length
  );
  const actualModelName = mapModelName(
    context.plan === "ultra" ? modelName : modelName || "gemini-2.5-pro"
  );

  const runModel = async (key: string) => {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: actualModelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        responseSchema: classificationResponseSchema,
      },
    });
    return model.generateContent(userPrompt);
  };

  let response = "";
  let tokensUsed = 0;
  try {
    const result = await runModel(apiKey);
    response = result.response.text();
    tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
  } catch (e1: any) {
    console.error("Pro AI Classify (Key 1):", e1.message);
    if (!apiKey2) return null;
    try {
      const result = await runModel(apiKey2);
      response = result.response.text();
      tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
    } catch (e2) {
      console.error("Pro AI Classify (Key 2):", e2);
      return null;
    }
  }

  const parsed = parseAIResponse(response, actualModelName);
  if (parsed) {
    parsed.tokensUsed =
      tokensUsed > 0
        ? tokensUsed
        : estimatedPromptTokens + Math.ceil((response?.length || 0) / 3.5);
    parsed.modelUsed = `pro:${actualModelName}`;
  }
  return parsed;
}
