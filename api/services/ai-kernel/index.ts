import { logAITrace } from "./ai-trace-logger";
import { callChatCompletionAPI, type ChatMessage } from "../../lib/deepseek-client";
import { getCacheRuntimeStatus } from "../../lib/redis-client";
import { validateNumbersAgainstFacts } from "../ai-cost-policy";
import { buildContextPack, estimateTokens } from "./context-packer";
import { compileDataNeeds } from "./data-need-compiler";
import { planAgentTurn } from "./agent-planner";
import { routeIntent } from "./intent-router";
import { embeddingApiStatusFor, retrievalPolicyFor } from "./retrieval-policy";
import { normalizeAIResponse } from "./response-normalizer";
import { displayFinanceCategory } from "../finance-semantic-layer/category-matcher";
import { isLowSignalMemoryText, normalizeMemoryText, truncateWords } from "../ai-memory/text-utils";
import type { ActionDraft, AIRequest, AIResponse, Artifact, DataNeed, IntentResult, ResolvedFact, ResponseRecipe } from "./types";

export * from "./types";
export { buildContextPack, estimateTokens, getTokenBudget } from "./context-packer";
export { compileDataNeeds } from "./data-need-compiler";
export { planAgentTurn } from "./agent-planner";
export { normalizeForIntent, routeIntent } from "./intent-router";
export { embeddingApiStatusFor, retrievalPolicyFor, type EmbeddingApiStatus, type RetrievalPolicy } from "./retrieval-policy";
export { AI_RESPONSE_SCHEMA_VERSION, normalizeAIResponse } from "./response-normalizer";
export { logAITrace, serializeTraceEvent } from "./ai-trace-logger";

function createTraceId(): string {
  return `aik_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function fallbackIntent(error: unknown): IntentResult {
  return {
    kind: "unknown",
    confidence: 0,
    reason: "ai_kernel_shadow_failed",
    slots: {
      query: error instanceof Error ? error.message : String(error),
    },
  };
}

function shouldResolveDataNeeds(request: AIRequest): boolean {
  return request.metadata?.resolveDataNeeds !== false;
}

export function embeddingApiCallsFromCacheHits(cacheHits: string[]): number {
  if (cacheHits.some((hit) => hit.startsWith("memory_cache:hit"))) {
    return 0;
  }
  if (cacheHits.includes("embedding:query_embedded") && cacheHits.includes("embedding:fireworks")) {
    return 1;
  }
  return 0;
}

function metadataNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function resolveShadowFacts(
  request: AIRequest,
  dataNeeds: DataNeed[],
): Promise<{
  facts: ResolvedFact[];
  artifacts: Artifact[];
  errors: string[];
  cacheHits: string[];
}> {
  if (!shouldResolveDataNeeds(request)) {
    return { facts: [], artifacts: [], errors: [], cacheHits: [] };
  }

  const empty = { facts: [] as ResolvedFact[], artifacts: [] as Artifact[], errors: [] as string[], cacheHits: [] as string[] };
  const financeKinds = new Set([
    "finance.summary", "finance.category_total", "finance.person_total", "finance.classification_trace",
    "finance.breakdown", "finance.transactions", "finance.transaction_lookup", "finance.period_comparison",
    "finance.comparison_drivers", "finance.category_inclusion", "finance.business_cashflow", "finance.goal_progress",
    "goal.feasibility", "wallet.summary", "chart.data", "profile.snapshot", "goals.active",
  ]);
  const needsFinance = dataNeeds.some((need) => financeKinds.has(need.kind));
  const needsMemory = dataNeeds.some((need) => need.kind === "memory.search");
  const needsSiteGuide = dataNeeds.some((need) => need.kind === "site_guide.search");
  const failOpen = <T extends typeof empty>(source: string, error: unknown): T => ({
    ...empty,
    errors: [`${source}:${error instanceof Error ? error.message : String(error)}`],
  }) as T;

  const [finance, memory, siteGuide] = await Promise.all([
    needsFinance
      ? import("../finance-semantic-layer")
          .then(({ resolveKernelDataNeeds }) => resolveKernelDataNeeds({
            userId: request.userId,
            userType: request.userType,
            salaryDay: metadataNumber(request.metadata?.salaryDay),
          }, dataNeeds))
          .catch((error) => failOpen("finance", error))
      : Promise.resolve(empty),
    needsMemory
      ? import("../ai-memory")
          .then(({ resolveMemoryDataNeeds }) => resolveMemoryDataNeeds({ userId: request.userId, userType: request.userType }, dataNeeds))
          .catch((error) => failOpen("memory", error))
      : Promise.resolve(empty),
    needsSiteGuide
      ? import("../site-guide")
          .then(({ resolveSiteGuideDataNeeds }) => resolveSiteGuideDataNeeds(dataNeeds))
          .catch((error) => failOpen("site_guide", error))
      : Promise.resolve(empty),
  ]);

  return {
    facts: [...finance.facts, ...memory.facts, ...siteGuide.facts],
    artifacts: [...finance.artifacts, ...memory.artifacts, ...siteGuide.artifacts],
    errors: [...finance.errors, ...memory.errors, ...siteGuide.errors],
    cacheHits: [...finance.cacheHits, ...memory.cacheHits, ...siteGuide.cacheHits],
  };
}

export interface AIKernelActiveConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
}

function materialMissingNumbers(missing: string[] | undefined): string[] {
  return (missing ?? []).filter((item) => {
    const parsed = Math.abs(Number(item));
    if (!Number.isFinite(parsed)) return false;
    return parsed >= 10 || !Number.isInteger(parsed);
  });
}

function hallucinationRiskFor(
  content: string,
  facts: ResolvedFact[],
  llmCalls: number,
): {
  numericAccuracy: ReturnType<typeof validateNumbersAgainstFacts>;
  hallucinationRisk: "low" | "medium" | "high";
  hallucinationSignals: string[];
} {
  const numericAccuracy = validateNumbersAgainstFacts(content, facts);
  if (llmCalls <= 0) {
    return {
      numericAccuracy,
      hallucinationRisk: "low",
      hallucinationSignals: [],
    };
  }

  const materialMissing = materialMissingNumbers(numericAccuracy.missing);
  const hallucinationRisk =
    materialMissing.length === 0 ? "low" : materialMissing.length <= 2 ? "medium" : "high";

  return {
    numericAccuracy,
    hallucinationRisk,
    hallucinationSignals: materialMissing.map((number) => `missing_number:${number}`),
  };
}

function safeContentAfterUnsupportedNumbers(
  intent: IntentResult,
  facts: ResolvedFact[],
  blockedNumbers: string[],
): string {
  if (intent.kind === "advice_request") {
    return buildGroundedAdviceContent(intent, facts);
  }

  const numericFacts = facts
    .filter((fact) => typeof fact.value === "number" || (typeof fact.value === "string" && /\d|[٠-٩۰-۹]/.test(fact.value)))
    .slice(0, 6)
    .map((fact) => `- ${fact.source}.${fact.label.replace(/\d+/g, "item")}: ${fact.value}`);

  return [
    "منعت رقم غير مؤكد من الرد عشان الأرقام المالية لازم تطلع من بياناتك الفعلية فقط.",
    numericFacts.length > 0
      ? `الأرقام المؤكدة المتاحة:\n${numericFacts.join("\n")}`
      : "مفيش أرقام مؤكدة كفاية في البيانات المتاحة للرد الرقمي الدقيق.",
    "اسألني بصيغة أضيق أو اطلب تفصيلة محددة، وسأرجعها من أدوات الموقع مباشرة.",
    blockedNumbers.length > 0 ? "تم تسجيل محاولة رقم غير مدعوم في trace للمراجعة." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function factValue(
  facts: ResolvedFact[],
  label: string,
  source?: ResolvedFact["source"],
): string | number | boolean | null | undefined {
  return facts.find((fact) => fact.label === label && (!source || fact.source === source))?.value;
}

function numericFact(
  facts: ResolvedFact[],
  label: string,
  source?: ResolvedFact["source"],
): number | undefined {
  const value = factValue(facts, label, source);
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function textFact(
  facts: ResolvedFact[],
  label: string,
  source?: ResolvedFact["source"],
): string | undefined {
  const value = factValue(facts, label, source);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function money(value: number | undefined): string {
  const safe = Number.isFinite(value) ? value! : 0;
  return `${safe.toLocaleString("ar-EG", {
    maximumFractionDigits: Number.isInteger(safe) ? 0 : 2,
  })} جنيه`;
}

function amountFromText(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = normalizeNumericText(value);
  const match = normalized.match(/(\d+(?:[.,٬]\d{3})*(?:[.,]\d+)?)\s*(الف|ألف|k|مليون|million)?/i);
  if (!match) return undefined;
  return applyAmountUnit(parseAmountNumber(match[1]), match[2]);
}

function normalizeNumericText(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = "٠١٢٣٤٥٦٧٨٩";
    const eastern = "۰۱۲۳۴۵۶۷۸۹";
    const arabicIndex = arabic.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    const easternIndex = eastern.indexOf(digit);
    return easternIndex >= 0 ? String(easternIndex) : digit;
  }).replace(/[٬،]/g, ",");
}

function parseAmountNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  let cleaned = raw.replace(/\s+/g, "");
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (/^\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const base = Number(cleaned);
  if (!Number.isFinite(base) || base <= 0) return undefined;
  return base;
}

function applyAmountUnit(base: number | undefined, unitValue: string | undefined): number | undefined {
  if (base === undefined || !Number.isFinite(base)) return undefined;
  const unit = unitValue ?? "";
  if (unit === "مليون" || unit === "million") return Math.round(base * 1_000_000);
  if (unit === "الف" || unit === "ألف" || unit.toLowerCase() === "k") return Math.round(base * 1_000);
  return Math.round(base);
}

function moneyAmountFromText(value: string): number | undefined {
  const normalized = normalizeNumericText(value);
  const amountPattern = "(\\d+(?:[.,]\\d{3})*(?:[.,]\\d+)?)\\s*(الف|ألف|k|مليون|million)?";
  const withCurrency = normalized.match(new RegExp(`${amountPattern}\\s*(?:جنيه|جنيها|egp|pounds?|ج\\b)`, "i"));
  if (withCurrency) return applyAmountUnit(parseAmountNumber(withCurrency[1]), withCurrency[2]);

  const afterGoalVerb = normalized.match(
    new RegExp(`(?:احوش|ادخر|بمبلغ|المبلغ المستهدف|مبلغ|target|amount)\\s+${amountPattern}`, "i"),
  );
  if (afterGoalVerb) return applyAmountUnit(parseAmountNumber(afterGoalVerb[1]), afterGoalVerb[2]);

  return undefined;
}

function countText(count: number | undefined): string {
  if (!Number.isFinite(count)) return "";
  return ` من ${Math.round(count!).toLocaleString("ar-EG")} عملية`;
}

function displayCategoryName(value: string | undefined): string {
  if (!value || value === "uncategorized") return "غير مصنف";
  return displayFinanceCategory(value);
}

function goalTargetDateFromText(value: string): string | undefined {
  const query = normalizeNumericText(value.toLowerCase());
  const now = new Date();
  if (/(سنه|سنة|year)/i.test(query)) {
    const date = new Date(now);
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString().slice(0, 10);
  }
  const months = query.match(/(\d+)\s*(شهر|شهور|months?)/i);
  if (months?.[1]) {
    const date = new Date(now);
    date.setMonth(date.getMonth() + Number(months[1]));
    return date.toISOString().slice(0, 10);
  }
  return undefined;
}

function goalTitleFromText(value: string): string {
  const normalized = value.toLowerCase();
  if (/(لابتوب|لاب توب|laptop)/i.test(normalized)) return "هدف شراء لابتوب";
  if (/(عربيه|عربية|سياره|سيارة|car)/i.test(normalized)) return "هدف شراء عربية";
  if (/(شقه|شقة|apartment|flat)/i.test(normalized)) return "هدف شراء شقة";
  if (/(سفر|travel)/i.test(normalized)) return "هدف السفر";
  const cleaned = normalizeNumericText(value)
    .replace(/[؟?,،.!]/g, " ")
    .replace(/خلال\s+.*$/i, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(جنيه|ج|egp|الف|ألف|k|مليون|million)?/gi, " ")
    .replace(/\b(هدف|احوش|ادخر|توفير|حوش|اعمل|انشئ|أضف|ضيف|حط|سجل|create|add|saving|goal)\b/gi, " ")
    .replace(/\b(اشتري|شراء|اجيب|أجيب|جيب|عايز|عاوز|لل|ل)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 2 && cleaned.length <= 50 ? `هدف ${cleaned}` : "هدف ادخار جديد";
}

function proposedGoalCreateAction(intent: IntentResult, facts: ResolvedFact[]): ActionDraft[] {
  if (intent.kind !== "goal_planning" || intent.slots.actionName !== "goal.create") return [];
  const query = intent.slots.query ?? "";
  const targetAmount =
    moneyAmountFromText(query) ??
    numericFact(facts, "target_amount", "goal.feasibility");
  const targetDate = goalTargetDateFromText(query);
  const title = goalTitleFromText(query);
  const summaryParts = [title];
  if (targetAmount) summaryParts.push(money(targetAmount));
  if (targetDate) summaryParts.push(`حتى ${targetDate}`);

  return [
    {
      id: `proposed:goal.create:${targetAmount ?? "new"}`,
      name: "goal.create",
      status: "draft",
      risk: "medium",
      confirmationRequired: true,
      summary: summaryParts.join(" - "),
      payload: {
        title,
        description: query.slice(0, 500),
        targetAmount,
        targetDate,
      },
    },
  ];
}

function proposedActionsFromFacts(intent: IntentResult, facts: ResolvedFact[]): ActionDraft[] {
  const goalActions = proposedGoalCreateAction(intent, facts);
  if (goalActions.length > 0) return goalActions;

  if (intent.kind !== "action_request" || intent.slots.actionName !== "expense.recategorize") {
    return [];
  }

  const notFound = factValue(facts, "not_found", "finance.transaction_lookup") === true;
  if (notFound) return [];

  const expenseId = numericFact(facts, "expense_id", "finance.transaction_lookup");
  const targetCategory =
    textFact(facts, "target_category", "finance.transaction_lookup") ??
    intent.slots.targetCategory ??
    intent.slots.category;
  if (!Number.isFinite(expenseId) || !targetCategory || targetCategory === "uncategorized") {
    return [];
  }

  const currentCategory = textFact(facts, "category", "finance.transaction_lookup");
  const description = textFact(facts, "description", "finance.transaction_lookup");
  const amount = numericFact(facts, "amount", "finance.transaction_lookup");
  const date = textFact(facts, "date", "finance.transaction_lookup");
  const targetDisplay = displayCategoryName(targetCategory);
  const currentDisplay = displayCategoryName(currentCategory);
  const descriptor = description ? `"${description}"` : `#${Math.round(expenseId!)}`;
  const amountText = amount !== undefined ? ` بقيمة ${money(amount)}` : "";
  const dateText = date ? ` بتاريخ ${date}` : "";

  return [
    {
      id: `proposed:expense.recategorize:${Math.round(expenseId!)}`,
      name: "expense.recategorize",
      status: "draft",
      risk: "medium",
      confirmationRequired: true,
      summary: `تعديل تصنيف مصروف ${descriptor}${amountText}${dateText} من ${currentDisplay} إلى ${targetDisplay}`,
      payload: {
        expenseId: Math.round(expenseId!),
        category: targetCategory,
        reason: intent.slots.query ?? "AI recategorization request",
      },
    },
  ];
}

function buildActionConfirmationContent(
  intent: IntentResult,
  facts: ResolvedFact[],
  proposedActions: ActionDraft[],
): string | undefined {
  if (intent.kind === "goal_planning" && intent.slots.actionName === "goal.create") {
    const action = proposedActions.find((item) => item.name === "goal.create");
    if (!action) return undefined;
    const payload = action.payload;
    const targetAmount = typeof payload.targetAmount === "number" ? payload.targetAmount : undefined;
    const targetDate = typeof payload.targetDate === "string" ? payload.targetDate : undefined;
    const monthlyCapacity = numericFact(facts, "monthly_capacity", "goal.feasibility");
    const estimatedMonths = numericFact(facts, "estimated_months", "goal.feasibility");
    const rating = textFact(facts, "feasibility_rating", "goal.feasibility");
    const lines = [
      "جهزت مسودة الهدف، لكنها لن تتنفذ غير بعد تأكيدك.",
      `الهدف: ${String(payload.title ?? "هدف ادخار جديد")}`,
      targetAmount !== undefined ? `المبلغ المستهدف: ${money(targetAmount)}` : "",
      targetDate ? `التاريخ المستهدف: ${targetDate}` : "",
      monthlyCapacity !== undefined ? `قدرتك الشهرية المقدرة من صافي التدفق الحالي: ${money(monthlyCapacity)}` : "",
      estimatedMonths !== undefined ? `المدة المقدرة حسب البيانات الحالية: ${estimatedMonths.toLocaleString("ar-EG")} شهر` : "",
      rating ? `تقييم القابلية: ${rating}` : "",
      "لو موافق أكد الإجراء من زر التأكيد تحت الرسالة.",
    ];
    return lines.filter(Boolean).join("\n");
  }

  if (intent.kind !== "action_request" || intent.slots.actionName !== "expense.recategorize") {
    return undefined;
  }

  const notFound = factValue(facts, "not_found", "finance.transaction_lookup") === true;
  if (notFound) {
    return "ملقتش عملية مطابقة أقدر أعدل تصنيفها بثقة. ابعتلي اسم التاجر أو رقم العملية، أو اطلب آخر مصروف بدون شرط التصنيف.";
  }

  const action = proposedActions[0];
  if (!action) {
    return "لقيت طلب تعديل تصنيف، لكن البيانات المتاحة مش كفاية لتجهيز إجراء مؤكد. محتاج العملية المقصودة أو رقمها.";
  }

  const description = textFact(facts, "description", "finance.transaction_lookup");
  const amount = numericFact(facts, "amount", "finance.transaction_lookup");
  const currentCategory = textFact(facts, "category", "finance.transaction_lookup");
  const targetCategory = String(action.payload.category ?? "");
  const evidence = [
    description ? `العملية: ${description}` : "",
    amount !== undefined ? `المبلغ: ${money(amount)}` : "",
    currentCategory ? `التصنيف الحالي: ${displayCategoryName(currentCategory)}` : "",
    targetCategory ? `التصنيف المقترح: ${displayCategoryName(targetCategory)}` : "",
  ].filter(Boolean);

  return [
    "لقيت العملية وجهزت تعديل التصنيف، لكنه لن يتنفذ غير بعد تأكيدك.",
    evidence.length ? evidence.join("\n") : "",
    "لو موافق أكد الإجراء من زر التأكيد تحت الرسالة.",
  ]
    .filter(Boolean)
    .join("\n");
}

function uniqueMemoryFacts(facts: ResolvedFact[]): ResolvedFact[] {
  const seen = new Set<string>();
  const result: ResolvedFact[] = [];
  for (const fact of facts) {
    const value = String(fact.value ?? "").replace(/\s+/g, " ").trim();
    if (!value || isLowSignalMemoryText(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...fact, value });
  }
  return result;
}

function preferDirectMemoryFacts(facts: ResolvedFact[]): ResolvedFact[] {
  const direct = facts.filter((fact) =>
    fact.evidence?.some((item) => String(item.label ?? "") === "memory"),
  );
  return direct.length > 0 ? direct : facts;
}

function memoryPlanLine(value: string): string {
  const amount = moneyAmountFromText(value);
  const monthsMatch = value.match(/(\d+|[٠-٩]+)\s*(?:شهر|شهور)/);
  const months = amountFromText(monthsMatch?.[1]);
  const itemMatch = value.match(/(?:اجيب|اشتري|شراء)\s+([^،.؟?]+?)(?:\s+خلال|\s+بس|$)/);
  const item = itemMatch?.[1]?.trim();
  const isGoalLike = /(هدف|احوش|ادخر|ادخار|خطة|خطه)/.test(value);

  if (isGoalLike && (amount || months || item)) {
    return [
      item ? `هدف ${item}` : "هدف ادخار",
      amount ? `بمبلغ ${money(amount)}` : "",
      months ? `خلال ${months.toLocaleString("ar-EG")} شهور` : "",
      /ما تنفذش|ااكد|أأكد|اوافق|أوافق/.test(value) ? "وكان محتاج تأكيد قبل التنفيذ" : "",
    ]
      .filter(Boolean)
      .join("، ");
  }

  return truncateWords(value, 28);
}

const MEMORY_SUBJECT_HINTS = [
  "كاميرا",
  "موبايل",
  "سماعات",
  "عربيه",
  "عربية",
  "شقه",
  "شقة",
  "لابتوب",
  "سلفه",
  "سلفة",
];

function focusMemoryFactsForQuery(facts: ResolvedFact[], query: string | undefined): ResolvedFact[] {
  const normalizedQuery = normalizeMemoryText(query ?? "");
  const subjects = MEMORY_SUBJECT_HINTS.map((item) => normalizeMemoryText(item)).filter((item) =>
    normalizedQuery.includes(item),
  );
  if (subjects.length === 0) return facts;

  const focused = facts.filter((fact) => {
    const normalizedValue = normalizeMemoryText(String(fact.value ?? ""));
    return subjects.some((subject) => normalizedValue.includes(subject));
  });
  return focused.length > 0 ? focused : facts;
}

function percentText(value: number | undefined): string {
  if (value === undefined) return "مش قابل للحساب لأن الفترة السابقة صفر";
  const absolute = Math.abs(value).toLocaleString("ar-EG", { maximumFractionDigits: 1 });
  if (Math.abs(value) < 0.05) return "بدون تغيير تقريبا";
  return value > 0 ? `زيادة ${absolute}%` : `انخفاض ${absolute}%`;
}

function sourceFacts(facts: ResolvedFact[], source: ResolvedFact["source"]): ResolvedFact[] {
  return facts.filter((fact) => fact.source === source);
}

function transactionEvidenceLines(facts: ResolvedFact[], limit = 5): string[] {
  return sourceFacts(facts, "finance.transactions")
    .filter((fact) => fact.label.startsWith("transaction_"))
    .slice(0, limit)
    .map((fact) => {
      const evidence = fact.evidence?.[0];
      const amount = Number(evidence?.value);
      if (evidence?.label && Number.isFinite(amount)) {
        return `${evidence.label}: ${money(amount)}`;
      }
      return String(fact.value);
    });
}

function isClassificationExplanationIntent(intent: IntentResult): boolean {
  return intent.reason === "classification_explanation_match";
}

function categoryFromTransactionFact(fact: ResolvedFact): string | undefined {
  const value = String(fact.value ?? "");
  const parts = value.split(/\s+/);
  return parts.length >= 2 ? parts[1] : undefined;
}

function buildClassificationExplanationContent(intent: IntentResult, facts: ResolvedFact[]): string | undefined {
  if (!isClassificationExplanationIntent(intent)) return undefined;

  const exactCategory = textFact(facts, "stored_category", "finance.classification_trace");
  if (exactCategory) {
    const description = textFact(facts, "description", "finance.classification_trace") ?? "العملية دي";
    const traceAvailable = sourceFacts(facts, "finance.classification_trace")
      .find((fact) => fact.label === "trace_available")?.value === true;
    const parsedBy = textFact(facts, "parsed_by", "finance.classification_trace");
    const confidence = numericFact(facts, "confidence", "finance.classification_trace");
    const decision = textFact(facts, "decision", "finance.classification_trace");
    return [
      `عملية «${description}» متسجلة تحت ${displayCategoryName(exactCategory)}.`,
      traceAvailable
        ? `اتخذنا القرار من مسار ${parsedBy ?? "التصنيف"}${confidence !== undefined ? ` بدرجة ثقة ${Math.round(confidence)}%` : ""}${decision ? `، وحالتها ${decision}` : ""}.`
        : "العملية دي قديمة أو اتحفظت بدون أثر قرار مرتبط، فمش هافترض سببًا غير موجود في سجلك.",
      "لو التصنيف مش مناسب، أقدر أجهز تعديل للمراجعة؛ التغيير لا يتم إلا بعد تأكيدك.",
    ].join("\n");
  }

  const categories = [
    ...new Set([...(intent.slots.categories ?? []), intent.slots.category].filter(Boolean) as string[]),
  ];
  const transactionFacts = sourceFacts(facts, "finance.transactions").filter((fact) =>
    fact.label.startsWith("transaction_"),
  );
  const totalMatched = numericFact(facts, "total_matched", "finance.transactions") ?? transactionFacts.length;
  const period = textFact(facts, "period", "finance.transactions") ?? "الفترة الحالية";
  const categoryCounts = new Map<string, number>();
  for (const fact of transactionFacts) {
    const category = categoryFromTransactionFact(fact) ?? "uncategorized";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const primaryCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? intent.slots.category;
  const categoryText = primaryCategory ? displayCategoryName(primaryCategory) : "الفئة الأقرب";
  const comparedCategories = categories.length
    ? categories.map((category) => displayCategoryName(category)).join(" / ")
    : "الفئات المذكورة";
  const evidenceLines = transactionEvidenceLines(facts, 5);

  if (totalMatched <= 0) {
    return [
      `مش لاقي عمليات مطابقة في ${period} تكفي أحكم هل دي ${comparedCategories}.`,
      "القاعدة العملية: لو الشراء خضار/لحمة/أكل من كارفور يبقى أكل، ولو ملابس/أجهزة/مشتريات عامة يبقى تسوق.",
      "لو لقيت عملية متصنفة غلط، ابعتها لي أو افتح العملية وعدل الفئة؛ وبعد التأكيد أقدر أجهز لك تعديل آمن.",
    ].join("\n");
  }

  return [
    `حسب العمليات المطابقة في ${period}: الأقرب إنها ${categoryText}.`,
    `راجعت ${totalMatched.toLocaleString("ar-EG")} عملية ضمن ${comparedCategories}.`,
    evidenceLines.length ? `أمثلة دخلت في الحكم:\n${evidenceLines.join("\n")}` : "",
    "لو في عملية معينة طالعة غلط، ابعتها لي بالاسم أو الرقم وأنا أجهز تعديل تصنيف كمسودة، والتنفيذ لا يحصل إلا بعد تأكيدك.",
  ]
    .filter(Boolean)
    .join("\n");
}

function goalProgressLines(facts: ResolvedFact[], source: ResolvedFact["source"]): string[] {
  const lines: string[] = [];

  for (let index = 1; index <= 8; index += 1) {
    const title = textFact(facts, `goal_${index}_title`, source);
    if (!title) continue;

    const target = numericFact(facts, `goal_${index}_target_amount`, source);
    const monthsNeeded = numericFact(facts, `goal_${index}_estimated_months_needed`, source);
    const capacity = numericFact(facts, `goal_${index}_estimated_monthly_capacity`, source);
    const targetDate = textFact(facts, `goal_${index}_target_date`, source);

    const parts = [`- ${title}`];
    if (target && target > 0) parts.push(`المستهدف ${money(target)}`);
    if (targetDate) parts.push(`التاريخ المستهدف ${targetDate}`);
    if (capacity !== undefined) parts.push(`قدرتك الشهرية المقدرة ${money(capacity)}`);
    if (monthsNeeded !== undefined) parts.push(`المدة التقديرية ${monthsNeeded.toLocaleString("ar-EG")} شهر`);
    if (!target || target <= 0) parts.push("محتاج تحديد مبلغ مستهدف عشان أحسب تقدمه");

    lines.push(parts.join(" - "));
  }

  return lines;
}

function buildGroundedAdviceContent(intent: IntentResult, facts: ResolvedFact[]): string {
  const net = numericFact(facts, "net_flow", "finance.summary");
  const totalExpense = numericFact(facts, "total_expense", "finance.summary");
  const expenseCount = numericFact(facts, "expense_count", "finance.summary");
  const memories = uniqueMemoryFacts(
    preferDirectMemoryFacts(facts.filter((fact) => fact.source === "memory.search")),
  ).slice(0, 1);
  const levers = sourceFacts(facts, "finance.breakdown")
    .filter((fact) => /^top_[1-4]_/.test(fact.label))
    .slice(0, 3)
    .map((fact): string | undefined => {
      const category = displayCategoryName(fact.label.replace(/^top_\d+_/, ""));
      if (!category) return undefined;
      const amount = Number(fact.value);
      return Number.isFinite(amount) ? `${category}: ${money(amount)}` : category;
    })
    .filter((item): item is string => Boolean(item));

  const financeLine =
    net !== undefined || totalExpense !== undefined
      ? `من بياناتك المؤكدة: المصروفات ${money(totalExpense)}، والصافي ${money(net)}${expenseCount !== undefined ? countText(expenseCount) : ""}.`
      : "";
  const memoryLine = memories[0] ? `فاكر من كلامنا: ${memoryPlanLine(String(memories[0].value))}` : "";
  const leversLine = levers.length ? `أكتر بنود محتاجة متابعة: ${levers.join("، ")}.` : "";

  return [
    "تمام، هبني لك خطة آمنة على البيانات المؤكدة من غير أرقام مخترعة:",
    financeLine,
    memoryLine,
    leversLine,
    "الخطة العملية: راقب سبب الصرف المتكرر، حدد قرار واضح قبل الشراء، واربط التغيير بعادة يومية سهلة. لو عايز رقم توفير محدد اسألني عن بند واحد، وسأحسبه من العمليات مباشرة.",
  ]
    .filter(Boolean)
    .join("\n");
}

function lowQualityLLMContentReason(intent: IntentResult, content: string): string | undefined {
  if (intent.kind !== "advice_request") return undefined;
  const text = content.trim();
  if (!text) return "llm_response_empty";
  if (
    /^(نحتاج|يجب|سنقدم|سأقدم|لازم\s+ن|المستخدم\s+يطلب|تحليل|we need|need to respond)/i.test(text) ||
    /\b(ResolvedFacts|intent|رسالة المستخدم|اكتب الرد النهائي)\b/i.test(text)
  ) {
    return "llm_returned_meta_reasoning";
  }

  const hasFirstBullet = /(^|\n)\s*(1|١)[.)]/.test(text);
  const hasSecondBullet = /(^|\n)\s*(2|٢)[.)]/.test(text);
  const endsCleanly = /[.!؟]$/.test(text);
  if (hasFirstBullet && !hasSecondBullet) return "llm_response_incomplete";
  if (!endsCleanly && text.length < 420 && /[:\n]/.test(text)) return "llm_response_incomplete";
  return undefined;
}

function buildInvestmentAdviceContent(intent: IntentResult, facts: ResolvedFact[]): string | undefined {
  const query = intent.slots.query ?? "";
  if (!/(استثمر|استثمار|استثمرهم|invest)/i.test(query)) return undefined;

  const amount = amountFromText(query);
  const amountText = amount !== undefined ? money(amount) : "المبلغ الفاضل";
  const net = numericFact(facts, "net_flow", "finance.summary");
  const totalExpense = numericFact(facts, "total_expense", "finance.summary");
  const goals = goalProgressLines(facts, sourceFacts(facts, "finance.goal_progress").length ? "finance.goal_progress" : "goals.active").slice(0, 1);
  const topLevers = sourceFacts(facts, "finance.breakdown")
    .filter((fact) => /^top_[1-3]_/.test(fact.label))
    .map((fact) => displayCategoryName(fact.label.replace(/^top_\d+_/, "")))
    .slice(0, 2);

  return [
    `لو فاض معاك ${amountText} آخر الشهر، خليك محافظ وماتدخلش مخاطرة عالية قبل ما تثبت الطوارئ والأهداف.`,
    net !== undefined || totalExpense !== undefined
      ? `من بياناتك: الصافي الحالي ${money(net)}، والمصروفات ${money(totalExpense)}.`
      : "",
    goals.length ? `أهم هدف ظاهر: ${goals[0]}` : "",
    topLevers.length ? `قبل الاستثمار راجع أكبر بنود الصرف: ${topLevers.join(" و")}.` : "",
    "خطة مختصرة: 1) جزء للطوارئ/سيولة سريعة. 2) جزء يقربك من هدفك النشط. 3) لو هتستثمر، اختار أدوات منخفضة المخاطر وسيولتها واضحة. 4) تجنب الأسهم والعملات عالية التقلب لو المبلغ محتاجه قريب.",
  ]
    .filter(Boolean)
    .join("\n");
}

function shouldKeepFactForIntent(fact: ResolvedFact, intent: IntentResult): boolean {
  if (intent.kind !== "advice_request") return true;
  if (fact.source === "profile.snapshot") return true;
  if (fact.source === "memory.search") return true;
  if (fact.source === "finance.summary") {
    return ["period", "total_income", "total_expense", "net_flow", "expense_count"].includes(fact.label);
  }
  if (fact.source === "finance.breakdown") {
    return fact.label === "period" || fact.label === "total_expense" || /^top_[1-4]_/.test(fact.label);
  }
  if (fact.source === "goals.active" || fact.source === "finance.goal_progress") {
    return fact.label === "active_goal_count" || /^goal_[1-3]_/.test(fact.label);
  }
  return false;
}

function compactAdviceFacts(facts: ResolvedFact[]): ResolvedFact[] {
  const profile = facts.filter((fact) => fact.source === "profile.snapshot").slice(0, 2);
  const summary = facts
    .filter(
      (fact) =>
        fact.source === "finance.summary" &&
        ["period", "total_income", "total_expense", "net_flow", "expense_count"].includes(fact.label),
    )
    .slice(0, 5);
  const breakdown = facts
    .filter((fact) => fact.source === "finance.breakdown" && /^top_[1-4]_/.test(fact.label))
    .slice(0, 4);
  const goals = facts
    .filter(
      (fact) =>
        (fact.source === "goals.active" || fact.source === "finance.goal_progress") &&
        (fact.label === "active_goal_count" || /^goal_[1-2]_/.test(fact.label)),
    )
    .slice(0, 4);
  const memories = preferDirectMemoryFacts(facts.filter((fact) => fact.source === "memory.search")).slice(0, 2);
  return [...profile, ...summary, ...breakdown, ...goals, ...memories].slice(0, 12);
}

function compactGeneralFacts(facts: ResolvedFact[], intent: IntentResult): ResolvedFact[] {
  const selected: ResolvedFact[] = [];
  let transactionEvidenceCount = 0;
  let transactionMetaCount = 0;

  for (const fact of facts) {
    if (!shouldKeepFactForIntent(fact, intent)) continue;

    if (fact.source === "finance.transactions") {
      if (fact.label.startsWith("transaction_")) {
        if (transactionEvidenceCount >= 5) continue;
        transactionEvidenceCount += 1;
      } else {
        if (transactionMetaCount >= 4) continue;
        transactionMetaCount += 1;
      }
    }

    selected.push(fact);
    if (selected.length >= 32) break;
  }

  return selected;
}

function compactFactsForPrompt(facts: ResolvedFact[], intent: IntentResult): Array<Record<string, unknown>> {
  const selected =
    intent.kind === "advice_request"
      ? compactAdviceFacts(facts)
      : compactGeneralFacts(facts, intent);
  return selected.map((fact) => ({
    source: fact.source,
    label: fact.label,
    value: fact.value,
    confidence: fact.confidence,
    evidence: intent.kind === "advice_request" ? undefined : fact.evidence?.slice(0, 3),
  }));
}

function compactArtifactsForPrompt(artifacts: Artifact[]): Array<Record<string, unknown>> {
  return artifacts.slice(0, 6).map((artifact) => ({
    type: artifact.type,
    title: artifact.title,
    payload: artifact.payload,
  }));
}

function buildSiteHelpContent(facts: ResolvedFact[]): string | undefined {
  const guideFacts = facts.filter((fact) => fact.source === "site_guide.search").slice(0, 2);
  if (guideFacts.length === 0) return undefined;

  const areas = new Set(guideFacts.map((fact) => String(fact.evidence?.[0]?.label ?? "")));
  const titles = guideFacts.map((fact) => `- ${fact.label}`).join("\n");

  if (areas.has("card") || areas.has("sms")) {
    return [
      "أيوه، الربط هنا بيتم على خطوتين أساسيتين:",
      titles,
      "ابدأ بإنشاء حساب/بطاقة باسم الفيزا أو البنك، وبعدها فعّل ربط SMS عشان عمليات البنك تتحول لمعاملات قابلة للمراجعة. التفاصيل الدقيقة موجودة في البطاقات تحت الرسالة.",
    ].join("\n");
  }

  return ["لقيت لك الدليل المناسب في التطبيق:", titles, "راجع البطاقات تحت الرسالة للخطوات التفصيلية."].join("\n");
}

function buildDeterministicContent(
  intent: IntentResult,
  facts: ResolvedFact[],
  artifacts: Artifact[],
  proposedActions: ActionDraft[] = [],
): string | undefined {
  if (intent.kind === "smalltalk") {
    return "أهلا بيك. اسألني عن مصاريفك، أهدافك، التقارير، أو أي حاجة محتاج تفهمها في SmartSpend.";
  }

  const actionContent = buildActionConfirmationContent(intent, facts, proposedActions);
  if (actionContent) return actionContent;

  if (intent.kind === "finance_query") {
    const walletBalance = numericFact(facts, "total_balance", "wallet.summary");
    if (walletBalance !== undefined) {
      const walletCount = numericFact(facts, "wallet_count", "wallet.summary") ?? 0;
      if (walletCount === 0) {
        return "مفيش محافظ مسجلة عندك حاليا. تقدر تضيف محفظة أو كارت من صفحة المحافظ، وبعدها أقدر أقولك الرصيد فوراً.";
      }
      const walletLines = sourceFacts(facts, "wallet.summary")
        .filter((fact) => fact.label.startsWith("wallet_"))
        .slice(0, 6)
        .map((fact) => {
          const evidence = fact.evidence?.[0];
          const amount = Number(evidence?.value);
          return evidence?.label && Number.isFinite(amount)
            ? `- ${evidence.label}: ${money(amount)}`
            : `- ${String(fact.value)}`;
        });
      return [
        `إجمالي الرصيد المسجل في محافظك ${money(walletBalance)} عبر ${walletCount.toLocaleString("ar-EG")} محفظة.`,
        walletLines.length ? walletLines.join("\n") : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    const personTotal = numericFact(facts, "person_total_expense", "finance.person_total");
    if (personTotal !== undefined) {
      const personName = textFact(facts, "person_name", "finance.person_total") ?? "الشخص ده";
      const relation = textFact(facts, "person_relation", "finance.person_total");
      const period = textFact(facts, "period", "finance.person_total") ?? "الفترة المطلوبة";
      const count = numericFact(facts, "transaction_count", "finance.person_total") ?? 0;
      return [
        `في ${period}، صرفك المسجّل مع ${personName}${relation ? ` (${relation})` : ""} هو ${money(personTotal)}${countText(count)}.`,
        count === 0
          ? "مهم: الرقم ده مبني على العمليات المربوطة بالشخص ده؛ العمليات القديمة غير المربوطة مش داخلة فيه."
          : "الرقم ده مبني على العمليات المربوطة بالشخص في قائمة الأشخاص والعلاقات.",
      ].join("\n");
    }

    const categoryTotal = numericFact(facts, "category_total_expense", "finance.category_total");
    if (categoryTotal !== undefined) {
      const category = displayCategoryName(
        textFact(facts, "category", "finance.category_total") ?? intent.slots.category,
      );
      const period = textFact(facts, "period", "finance.category_total") ?? "الفترة المطلوبة";
      const count = numericFact(facts, "transaction_count", "finance.category_total");
      const evidenceLines = transactionEvidenceLines(facts);
      return [
        `في ${period}، إجمالي صرفك على ${category} هو ${money(categoryTotal)}${countText(count)}.`,
        evidenceLines.length ? `العمليات اللي دخلت في الرقم:\n${evidenceLines.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    const totalExpense = numericFact(facts, "total_expense", "finance.summary");
    if (totalExpense !== undefined) {
      const period = textFact(facts, "period", "finance.summary") ?? "الفترة المطلوبة";
      const income = numericFact(facts, "total_income", "finance.summary") ?? 0;
      const net = numericFact(facts, "net_flow", "finance.summary") ?? income - totalExpense;
      const count =
        numericFact(facts, "expense_count", "finance.summary") ??
        numericFact(facts, "transaction_count", "finance.summary");
      const evidenceLines = transactionEvidenceLines(facts);
      return [
        `في ${period}، صرفت ${money(totalExpense)}${countText(count)}. الدخل المسجل ${money(income)}، والصافي ${money(net)}.`,
        evidenceLines.length ? `العمليات اللي دخلت في الرقم:\n${evidenceLines.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  if (intent.kind === "finance_analysis") {
    const classificationContent = buildClassificationExplanationContent(intent, facts);
    if (classificationContent) return classificationContent;

    const currentExpense = numericFact(facts, "current_total_expense", "finance.period_comparison");
    if (currentExpense !== undefined) {
      const previousExpense = numericFact(facts, "previous_total_expense", "finance.period_comparison") ?? 0;
      const difference = numericFact(facts, "expense_difference", "finance.period_comparison") ?? currentExpense - previousExpense;
      const percent = numericFact(facts, "expense_change_percent", "finance.period_comparison");
      const currentPeriod = textFact(facts, "current_period", "finance.period_comparison") ?? "الفترة الحالية";
      const previousPeriod = textFact(facts, "previous_period", "finance.period_comparison") ?? "الفترة السابقة";
      const currentNet = numericFact(facts, "current_net_flow", "finance.period_comparison") ?? 0;
      const previousNet = numericFact(facts, "previous_net_flow", "finance.period_comparison") ?? 0;
      const comparisonExplanation =
        previousExpense === 0 && currentExpense > 0
          ? `في ${previousPeriod} مفيش مصروفات مسجلة، فمينفعش نحسب نسبة زيادة عادلة. الفرق الفعلي ${money(Math.abs(difference))}.`
          : currentExpense === 0 && previousExpense === 0
            ? "مفيش مصروفات مسجلة في الفترتين، فمش هينفع نستنتج اتجاه إنفاق من غير بيانات."
            : `الفرق ${money(Math.abs(difference))} (${percentText(percent)}).`;

      return [
        `مقارنة المصروفات: ${currentPeriod} = ${money(currentExpense)}، و${previousPeriod} = ${money(previousExpense)}.`,
        comparisonExplanation,
        `الصافي: ${currentPeriod} ${money(currentNet)} مقابل ${money(previousNet)} في ${previousPeriod}.`,
      ].join("\n");
    }

    const breakdownItems = sourceFacts(facts, "finance.breakdown")
      .filter((fact) => /^top_\d+_/.test(fact.label))
      .slice(0, 5)
      .map((fact) => {
        const name = fact.label.replace(/^top_\d+_/, "");
        const amount = Number(fact.value);
        const count = Number(fact.evidence?.[0]?.value);
        return `- ${displayCategoryName(name)}: ${money(amount)}${Number.isFinite(count) ? countText(count) : ""}`;
      });
    if (breakdownItems.length > 0) {
      const period = textFact(facts, "period", "finance.breakdown") ?? "الفترة المطلوبة";
      const total = numericFact(facts, "total_expense", "finance.breakdown") ?? 0;
      return `في ${period}، إجمالي المصروفات ${money(total)}. أعلى البنود:\n${breakdownItems.join("\n")}`;
    }
  }

  if (intent.kind === "goal_planning" && !intent.slots.actionName) {
    const progressSource: ResolvedFact["source"] = sourceFacts(facts, "finance.goal_progress").length
      ? "finance.goal_progress"
      : "goals.active";
    const activeGoalCount = numericFact(facts, "active_goal_count", progressSource);

    if (activeGoalCount !== undefined) {
      if (activeGoalCount === 0) {
        return "مفيش أهداف ادخار نشطة عندك حاليا. نقدر نبدأ بهدف جديد ونحدده بمبلغ ومدة واضحة قبل أي تنفيذ.";
      }

      const lines = goalProgressLines(facts, progressSource);
      if (lines.length > 0) {
        return [
          `عندك ${activeGoalCount.toLocaleString("ar-EG")} أهداف ادخار نشطة:`,
          lines.join("\n"),
          "ملاحظة مهمة: التطبيق حاليا لا يسجل مبلغ محوش فعلي منفصل داخل كل هدف، فالأرقام دي تقدير من صافي تدفقك الحالي وليست رصيد هدف محفوظ.",
        ].join("\n");
      }
    }
  }

  if (intent.kind === "memory_question") {
    const memoryFacts = focusMemoryFactsForQuery(
      uniqueMemoryFacts(preferDirectMemoryFacts(facts.filter((fact) => fact.source === "memory.search"))),
      intent.slots.query,
    );
    if (memoryFacts.length === 0) {
      return "مش لاقي ذكرى محفوظة واضحة عن النقطة دي. لو تحب، فكّرني بالتفاصيل وهنبني عليها من هنا.";
    }
    return `فاكر الخلاصة دي:\n${memoryFacts
      .slice(0, 4)
      .map((fact, index) => `${index + 1}. ${memoryPlanLine(String(fact.value))}`)
      .join("\n")}`;
  }

  if (intent.kind === "site_help") {
    return buildSiteHelpContent(facts);
  }

  if (intent.kind === "advice_request") {
    return buildInvestmentAdviceContent(intent, facts);
  }

  if (intent.kind === "chart_request" && artifacts.some((artifact) => artifact.type === "chart")) {
    return "جهزت لك الرسم البياني من بياناتك الفعلية. تقدر تراجعه في البطاقة المعروضة تحت الرسالة.";
  }

  if (intent.kind === "expense_capture") {
    return "أقدر أساعدك في تسجيل المصروف، لكن لازم أراجعه كعملية مؤكدة قبل الحفظ عشان التصنيف والأرقام يفضلوا مضبوطين.";
  }

  if (intent.kind === "unknown" && facts.length === 0) {
    return "محتاج توضحلي قصدك شوية: هل بتسأل عن مصاريف، هدف، تقرير، أو طريقة استخدام التطبيق؟";
  }

  return undefined;
}

function shouldUseLLM(intent: IntentResult, deterministicContent: string | undefined): boolean {
  // Never call LLM for classification explanation (pure rule-based evidence)
  if (intent.reason === "classification_explanation_match") return false;

  // Allow LLM for synthesis questions even if deterministic content exists
  const query = intent.slots.query ?? "";
  const needsSynthesis =
    /(ليه|لماذا|السبب|خطة|خطط|اقترح|اعمل ايه|أعمل ايه|نصحنى|نصيحة|نصيحه|حلل)/i.test(query) ||
    intent.reason === "composite_comparison_drivers_match" ||
    intent.reason === "business_cashflow_match" ||
    intent.reason === "goal_with_plan_composite_match" ||
    intent.reason === "finance_planning_composite_match";

  if (deterministicContent && !needsSynthesis) {
    return false;
  }
  return [
    "finance_analysis",
    "goal_planning",
    "action_request",
    "advice_request",
    "report_request",
    "chart_request",
  ].includes(intent.kind);
}

function determineRecipe(intent: IntentResult, facts: ResolvedFact[]): ResponseRecipe {
  if (intent.kind === "smalltalk" || intent.kind === "site_help") return "simple_deterministic";
  if (intent.kind === "action_request") return "action_confirmation";
  if (intent.kind === "memory_question") return "answer_first";
  if (intent.reason === "composite_comparison_drivers_match") return "drivers_then_plan";
  if (intent.reason === "business_cashflow_match") return "drivers_then_plan";
  if (intent.reason === "goal_with_plan_composite_match") return "plan_with_confirmation";
  if (intent.kind === "goal_planning" && intent.slots.actionName) return "plan_with_confirmation";
  if (intent.kind === "advice_request") return "plan_with_confirmation";
  if (intent.slots.needsEvidence) return "evidence_then_answer";
  return "answer_first";
}

function buildActiveMessages(
  request: AIRequest,
  intent: IntentResult,
  facts: ResolvedFact[],
  artifacts: Artifact[],
): ChatMessage[] {
  const recipe = determineRecipe(intent, facts);
  const historyLimit = intent.kind === "advice_request" ? 1 : 3;
  const history = (request.conversationHistory ?? [])
    .slice(-historyLimit)
    .map((message) => `${message.role}: ${message.content.slice(0, 200)}`)
    .join("\n");
  const factsJson = JSON.stringify(compactFactsForPrompt(facts, intent), null, 0).slice(
    0,
    intent.kind === "advice_request" ? 2000 : 4000,
  );
  const recipeGuards: Record<ResponseRecipe, string> = {
    answer_first: "جاوب على السؤال أولا، ثم اذكر السبب أو الدليل بإيجاز. لا تقترح خطة بدون طلب.",
    evidence_then_answer: "قدم الدليل أولا (أعلى 3-5 صفوف)، ثم الجواب. لا تخترع أرقام.",
    drivers_then_plan: "اشرح الفروقات بين الفترات بالدليل، ثم اقترح خطوة واحدة عملية.",
    plan_with_confirmation: "قدم خطة مختصرة بـ 3 نقاط. وضح أن التنفيذ يحتاج تأكيد قبل أي تغيير.",
    action_confirmation: "اعرض الإجراء المقترح والدليل المختصر عليه. وضح بوضوح أنه لن يتنفذ إلا بعد تأكيد المستخدم. لا تقل إنك نفذته.",
    ask_clarification: "اسأل سؤالا توضيحيا واحدا فقط إذا البيانات غير كافية.",
    simple_deterministic: "جاوب مباشرة دون إطالة.",
  };

  return [
    {
      role: "system",
      content:
        "أنت SmartSpend AI. رد باللهجة المصرية الراقية. " +
        "الأرقام المالية تأتي فقط من ResolvedFacts. " +
        recipeGuards[recipe] + " " +
        (intent.kind === "advice_request"
          ? "لا تذكر نسب عوائد أو توقعات رقمية غير موجودة. 4 نقاط كحد أقصى. "
          : ""),
    },
    {
      role: "user",
      content: [
        `سؤال: ${request.message}`,
        `intent=${intent.kind} recipe=${recipe}`,
        history ? `سياق: ${history}` : "",
        `Facts: ${factsJson || "[]"}`,
        artifacts.length ? `Artifacts: ${artifactBriefs(artifacts)}` : "",
        "اكتب الرد النهائي.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

function artifactBriefs(artifacts: Artifact[]): string {
  return artifacts.slice(0, 3).map((a) => `[${a.type}] ${a.title ?? ""}`).join(" | ");
}

function fallbackActiveContent(intent: IntentResult, facts: ResolvedFact[]): string {
  if (facts.length > 0) {
    return "لقيت بيانات مرتبطة بسؤالك، لكن محتاج أعيد صياغتها بشكل أوضح. جرّب تسألني بصيغة أدق أو اطلب تفاصيل محددة.";
  }
  if (intent.kind === "goal_planning") {
    return "تمام، نقدر نبني الخطة. قلّي الهدف كام، والمدة المناسبة، وهل في مبلغ تقدر تحوشه شهريا؟";
  }
  if (intent.kind === "advice_request") {
    return "أقدر أساعدك بخطة عملية، لكن محتاج بيانات مالية أو تفاصيل أكتر عشان النصيحة تبقى مناسبة ليك.";
  }
  return "مش قادر أوصل لإجابة دقيقة من البيانات المتاحة حاليا. جرّب توضح السؤال شوية.";
}

export async function runAIKernelActive(
  request: AIRequest,
  config: AIKernelActiveConfig,
): Promise<AIResponse> {
  const startedAt = Date.now();
  const traceId = request.requestId ?? createTraceId();

  try {
    const plan = planAgentTurn(request.message);
    const intent = plan.intent;
    const dataNeeds = plan.dataNeeds;
    const plannedRequest: AIRequest = {
      ...request,
      conversationHistory: plan.historyMessages > 0
        ? (request.conversationHistory ?? []).slice(-plan.historyMessages)
        : [],
    };
    const contextPack = buildContextPack(plannedRequest, intent, dataNeeds);
    const resolved = await resolveShadowFacts(plannedRequest, dataNeeds);
    const cacheRuntime = getCacheRuntimeStatus();
    const proposedActions = proposedActionsFromFacts(intent, resolved.facts);
    const clarificationArtifacts: Artifact[] = plan.clarification
      ? [{
          id: `clarification:${traceId}`,
          type: "quick_replies",
          title: "سؤال سريع",
          payload: {
            question: plan.clarification.question,
            replies: plan.clarification.quickReplies,
            missing: plan.clarification.missing,
          },
        }]
      : [];
    const allArtifacts = [...resolved.artifacts, ...clarificationArtifacts];
    const deterministicContent = buildDeterministicContent(
      intent,
      resolved.facts,
      allArtifacts,
      proposedActions,
    );
    const retrievalPolicy = retrievalPolicyFor(intent.kind, dataNeeds, resolved.cacheHits);
    const embeddingCalls = embeddingApiCallsFromCacheHits(resolved.cacheHits);
    const embeddingApiStatus = embeddingApiStatusFor(dataNeeds, resolved.cacheHits);
    let content = plan.clarification?.question ?? deterministicContent;
    // `tokensUsed` is provider usage, not an estimate of deterministic local
    // work. The latter stays available in debug.estimatedInputTokens for
    // observability without inflating a user's AI quota.
    let tokensUsed = 0;
    let model: string | undefined;
    let llmCalls = 0;
    let numericGuard:
      | {
          applied: boolean;
          blockedNumbers: string[];
          originalAccuracy: number;
        }
      | undefined;
    let responseQualityGuard:
      | {
          applied: boolean;
          reason: string;
        }
      | undefined;

    if (plan.maxProviderCalls === 1 && shouldUseLLM(intent, deterministicContent) && config.apiKey) {
      const maxOutputTokens =
        intent.kind === "advice_request"
          ? Math.min(220, config.maxTokens ?? contextPack.tokenBudget.maxOutputTokens)
          : Math.min(config.maxTokens ?? contextPack.tokenBudget.maxOutputTokens, contextPack.tokenBudget.maxOutputTokens);
      const llm = await callChatCompletionAPI(config.baseUrl, config.apiKey, {
        model: config.model,
        messages: buildActiveMessages(plannedRequest, intent, resolved.facts, allArtifacts),
        tool_choice: "none",
        max_tokens: maxOutputTokens,
        temperature: 0.35,
      });
      content = llm.text?.trim() || deterministicContent || fallbackActiveContent(intent, resolved.facts);
      // Only bill actual provider usage. A provider that omits usage metadata
      // must be tracked as unknown by observability, never estimated and charged
      // to the user as if it were a real token count.
      tokensUsed = Number.isFinite(llm.tokensUsed) ? Math.max(0, llm.tokensUsed) : 0;
      model = llm.model;
      llmCalls = 1;
    }

    if (!content) {
      content = fallbackActiveContent(intent, resolved.facts);
    }

    if (llmCalls > 0) {
      const originalAccuracy = validateNumbersAgainstFacts(content, resolved.facts);
      const blockedNumbers = materialMissingNumbers(originalAccuracy.missing);
      if (blockedNumbers.length > 0) {
        numericGuard = {
          applied: true,
          blockedNumbers,
          originalAccuracy: originalAccuracy.accuracy,
        };
        content = safeContentAfterUnsupportedNumbers(intent, resolved.facts, blockedNumbers);
      }
    }
    const responseQualityReason =
      !numericGuard?.applied && llmCalls > 0 ? lowQualityLLMContentReason(intent, content) : undefined;
    if (responseQualityReason) {
      responseQualityGuard = {
        applied: true,
        reason: responseQualityReason,
      };
      content = buildGroundedAdviceContent(intent, resolved.facts);
    }

    const risk = hallucinationRiskFor(content, resolved.facts, llmCalls);

    const recipe = determineRecipe(intent, resolved.facts);

    const response = normalizeAIResponse({
      traceId,
      channel: request.channel,
      content,
      intent,
      dataNeeds,
      contextPack,
      facts: resolved.facts,
      artifacts: allArtifacts,
      proposedActions,
      recipe,
      model: model ?? "local-finance-kernel",
      tokensUsed,
      debug: {
        mode: "active",
        plan: {
          mode: plan.mode,
          rationale: plan.rationale,
          historyMessages: plan.historyMessages,
          maxProviderCalls: plan.maxProviderCalls,
          missing: plan.clarification?.missing ?? [],
        },
        deterministic: Boolean(deterministicContent),
        llmCalls,
        estimatedInputTokens: contextPack.estimatedInputTokens,
        resolvedFacts: resolved.facts.length,
        resolvedArtifacts: allArtifacts.length,
        proposedActions: proposedActions.length,
        resolverErrors: resolved.errors,
        cacheHits: resolved.cacheHits,
        embeddingCalls,
        embeddingApiStatus,
        retrievalPolicy,
        cacheRuntime,
        numericAccuracy: {
          accuracy: risk.numericAccuracy.accuracy,
          numbers: risk.numericAccuracy.numbers,
          supported: risk.numericAccuracy.supported,
          missing: risk.numericAccuracy.missing,
        },
        hallucinationRisk: risk.hallucinationRisk,
        hallucinationSignals: risk.hallucinationSignals,
        numericGuard,
        responseQualityGuard,
      },
    });

    logAITrace({
      traceId,
      mode: "active",
      status: "success",
      channel: request.channel,
      userId: request.userId,
      userType: request.userType,
      userPlan: request.userPlan,
      conversationId: request.conversationId,
      intent,
      dataNeeds,
      contextPack,
      cacheHits: resolved.cacheHits,
      cost: {
        estimatedInputTokens: contextPack.estimatedInputTokens,
        estimatedOutputTokens: estimateTokens(content),
        estimatedEmbeddingCalls: embeddingCalls,
        llmCalls,
      },
      latencyMs: Date.now() - startedAt,
      metadata: {
        ...request.metadata,
        activeModel: model ?? config.model,
        deterministic: Boolean(deterministicContent),
        plan: {
          mode: plan.mode,
          rationale: plan.rationale,
          historyMessages: plan.historyMessages,
          maxProviderCalls: plan.maxProviderCalls,
          missing: plan.clarification?.missing ?? [],
        },
        resolvedFacts: resolved.facts.length,
        resolvedArtifacts: allArtifacts.length,
        resolverErrors: resolved.errors,
        cacheRuntime,
        retrievalPolicy,
        embeddingApiStatus,
        numericGuard,
        numericAccuracy: {
          accuracy: risk.numericAccuracy.accuracy,
          missing: risk.numericAccuracy.missing,
        },
        hallucinationRisk: risk.hallucinationRisk,
        hallucinationSignals: risk.hallucinationSignals,
        responseQualityGuard,
      },
    });

    return response;
  } catch (error) {
    const intent = fallbackIntent(error);
    const dataNeeds = compileDataNeeds(intent);
    const contextPack = buildContextPack(request, intent, dataNeeds);
    const content = fallbackActiveContent(intent, []);
    const response = normalizeAIResponse({
      traceId,
      channel: request.channel,
      content,
      intent,
      dataNeeds,
      contextPack,
      debug: {
        mode: "active",
        error: error instanceof Error ? error.message : String(error),
      },
    });

    logAITrace({
      traceId,
      mode: "active",
      status: "error",
      channel: request.channel,
      userId: request.userId,
      userType: request.userType,
      userPlan: request.userPlan,
      conversationId: request.conversationId,
      intent,
      dataNeeds,
      contextPack,
      cacheHits: [],
      cost: {
        estimatedInputTokens: contextPack.estimatedInputTokens,
        estimatedOutputTokens: estimateTokens(content),
        estimatedEmbeddingCalls: 0,
        llmCalls: 0,
      },
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      metadata: request.metadata,
    });

    return response;
  }
}

export async function runAIKernelShadow(request: AIRequest): Promise<AIResponse> {
  const startedAt = Date.now();
  const traceId = request.requestId ?? createTraceId();

  try {
    const intent = routeIntent(request.message);
    const dataNeeds = compileDataNeeds(intent);
    const contextPack = buildContextPack(request, intent, dataNeeds);
    const resolved = await resolveShadowFacts(request, dataNeeds);
    const cacheRuntime = getCacheRuntimeStatus();
    const retrievalPolicy = retrievalPolicyFor(intent.kind, dataNeeds, resolved.cacheHits);
    const embeddingCalls = embeddingApiCallsFromCacheHits(resolved.cacheHits);
    const embeddingApiStatus = embeddingApiStatusFor(dataNeeds, resolved.cacheHits);
    const response = normalizeAIResponse({
      traceId,
      channel: request.channel,
      content: "",
      intent,
      dataNeeds,
      contextPack,
      facts: resolved.facts,
      artifacts: resolved.artifacts,
      debug: {
        mode: "shadow",
        legacyPath: request.metadata?.legacyPath,
        estimatedInputTokens: contextPack.estimatedInputTokens,
        resolvedFacts: resolved.facts.length,
        resolvedArtifacts: resolved.artifacts.length,
        resolverErrors: resolved.errors,
        cacheHits: resolved.cacheHits,
        embeddingCalls,
        embeddingApiStatus,
        retrievalPolicy,
        cacheRuntime,
      },
    });

    logAITrace({
      traceId,
      mode: "shadow",
      status: "success",
      channel: request.channel,
      userId: request.userId,
      userType: request.userType,
      userPlan: request.userPlan,
      conversationId: request.conversationId,
      intent,
      dataNeeds,
      contextPack,
      cacheHits: resolved.cacheHits,
      cost: {
        estimatedInputTokens: contextPack.estimatedInputTokens,
        estimatedOutputTokens: contextPack.tokenBudget.maxOutputTokens,
        estimatedEmbeddingCalls: embeddingCalls,
        llmCalls: 0,
      },
      latencyMs: Date.now() - startedAt,
      metadata: {
        ...request.metadata,
        resolvedFacts: resolved.facts.length,
        resolvedArtifacts: resolved.artifacts.length,
        resolverErrors: resolved.errors,
        cacheRuntime,
        retrievalPolicy,
        embeddingApiStatus,
      },
    });

    return response;
  } catch (error) {
    const intent = fallbackIntent(error);
    const dataNeeds = compileDataNeeds(intent);
    const contextPack = buildContextPack(request, intent, dataNeeds);
    const response = normalizeAIResponse({
      traceId,
      channel: request.channel,
      content: "",
      intent,
      dataNeeds,
      contextPack,
      debug: {
        mode: "shadow",
        error: error instanceof Error ? error.message : String(error),
      },
    });

    logAITrace({
      traceId,
      mode: "shadow",
      status: "error",
      channel: request.channel,
      userId: request.userId,
      userType: request.userType,
      userPlan: request.userPlan,
      conversationId: request.conversationId,
      intent,
      dataNeeds,
      contextPack,
      cacheHits: [],
      cost: {
        estimatedInputTokens: contextPack.estimatedInputTokens,
        estimatedOutputTokens: 0,
        estimatedEmbeddingCalls: 0,
        llmCalls: 0,
      },
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      metadata: request.metadata,
    });

    return response;
  }
}
