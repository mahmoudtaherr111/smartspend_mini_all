import type { AIIntentKind, IntentResult, PeriodHint } from "./types";

const PATTERNS = {
  greetings: ["اهلا", "اهلين", "هاي", "hi", "hello", "ازيك", "صباح الخير", "مساء الخير"],
  finance: [
    "صرفت",
    "صرف",
    "مصروف",
    "مصاريف",
    "انفاق",
    "دفعت",
    "فلوس",
    "دخل",
    "رصيد",
    "محفظه",
    "محفظتي",
    "كام",
    "فئه",
    "فئات",
    "تصنيف",
    "تصنيفات",
    "بند",
    "بنود",
  ],
  wallet: [
    "محفظه",
    "محفظتي",
    "محافظ",
    "محافظي",
    "wallet",
    "رصيد المحفظه",
    "رصيد محافظي",
    "فاضل كام",
  ],
  analysis: ["حلل", "مقارنه", "قارن", "ترند", "اكتر", "اعلي", "اقل", "نسبه", "ليه"],
  advice: [
    "نصيحه",
    "نصيحة",
    "اقترح",
    "اعمل خطه",
    "خطة",
    "اوفّر",
    "اوفر",
    "وفر",
    "أوفر",
    "استثمر",
    "استثمار",
    "استثمرهم",
    "فلوس زياده",
    "فلوس زيادة",
  ],
  lifestyle: ["نوم", "انام", "أنام", "قهوه", "قهوة", "عادة", "عاده", "روتين", "صحي", "صحة"],
  goals: ["هدف", "اهداف", "احوش", "ادخر", "توفير", "حوش", "عربيه", "شقه", "مقدم"],
  action: ["اعمل", "انشئ", "ضيف", "اضف", "اربط", "نفذ", "سجل", "احفظ", "حط", "ثبت", "add", "create", "link"],
  siteHelp: ["ازاي", "كيف", "اربط", "فيزا", "كارت", "بطاقه", "sms", "رسائل", "استخدم", "الموقع", "التطبيق"],
  memory: [
    "فاكر",
    "تفتكر",
    "اتفقنا",
    "كلمتك",
    "قلتلك",
    "المحادثه",
    "الشات القديم",
    "الشاتات القديمه",
    "ذاكره",
    "الذاكره",
    "من الذاكره",
    "ذكريات",
    "memory",
    "remember",
    "recall",
  ],
  report: ["تقرير", "ملخص الشهر", "التقرير الشهري", "monthly report", "summary"],
  chart: ["رسم", "جراف", "chart", "احصائيه", "احصائيات", "منحني", "بياني"],
  expenseCapture: ["اشتريت", "دفعت", "صرفت", "سجل مصروف", "اضف مصروف"],
  confirmation: ["موافق", "اكد", "أكد", "تمام نفذ", "نفذ", "اعملها", "yes", "confirm"],
  evidence: ["تفاصيل", "عمليات", "ايه اللي", "كل", "بالظبط", "بالضبط", "اثبات"],
  today: ["النهارده", "اليوم", "today", "دلوقتي"],
  yesterday: ["امبارح", "yesterday"],
  week: ["الاسبوع", "اسبوع", "week"],
  month: ["الشهر ده", "هذا الشهر", "الشهر الحالي", "month"],
  previousMonth: ["الشهر اللي فات", "الشهر السابق", "previous month"],
  salaryCycle: ["من المرتب", "دوره المرتب", "salary", "قبض"],
  food: ["اكل", "مطعم", "مطاعم", "قهوه", "سوبر ماركت", "بقاله", "غدا", "فطار", "عشا"],
  transport: ["مواصلات", "اوبر", "كريم", "بنزين", "مترو", "تاكسي"],
  shopping: ["تسوق", "لبس", "ملابس", "شراء", "مشتريات"],
  health: ["صحه", "صحة", "صيدليه", "صيدلية", "دوا", "دواء", "علاج", "دكتور"],
  bills: ["فواتير", "فاتوره", "فاتورة", "قسط", "اقساط", "كهربا", "غاز", "مياه", "انترنت", "نت"],
  income: ["دخل", "مرتب", "راتب", "قبض", "salary"],
  saving: ["ادخار", "تحويش", "جمعيه", "جمعية"],
};

export function normalizeForIntent(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[؟?،,.!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandIntentToken(token: string): string[] {
  const variants = new Set([token]);
  const queue = [token];
  for (const current of queue) {
    const next: string[] = [];
    if (current.startsWith("بال") && current.length > 5) next.push(current.slice(3));
    if (current.startsWith("لل") && current.length > 4) next.push(current.slice(2));
    if (current.startsWith("ال") && current.length > 4) next.push(current.slice(2));
    if (/^[وبفل]/.test(current) && current.length > 4) next.push(current.slice(1));
    for (const variant of next) {
      if (!variants.has(variant)) {
        variants.add(variant);
        queue.push(variant);
      }
    }
  }
  return [...variants];
}

function hasAny(text: string, patterns: string[]): boolean {
  const tokens = new Set(text.split(/\s+/).flatMap(expandIntentToken));
  return patterns.some((pattern) => {
    const normalized = normalizeForIntent(pattern);
    if (!normalized) return false;
    if (normalized === "كام" || normalized === "كم") {
      return tokens.has(normalized);
    }
    return text.includes(normalized);
  });
}

function detectPeriod(text: string): PeriodHint | undefined {
  if (hasAny(text, PATTERNS.today)) return "today";
  if (hasAny(text, PATTERNS.yesterday)) return "yesterday";
  if (hasAny(text, PATTERNS.previousMonth)) return "previous_month";
  if (hasAny(text, PATTERNS.month)) return "current_month";
  if (hasAny(text, PATTERNS.week)) return "current_week";
  if (hasAny(text, PATTERNS.salaryCycle)) return "salary_cycle";
  return undefined;
}

function detectCategory(text: string): string | undefined {
  return detectCategories(text)[0];
}

function detectCategories(text: string): string[] {
  const categories: string[] = [];
  if (hasAny(text, PATTERNS.food)) categories.push("food");
  if (hasAny(text, PATTERNS.transport)) categories.push("transport");
  if (hasAny(text, PATTERNS.shopping)) categories.push("shopping");
  if (hasAny(text, PATTERNS.health)) categories.push("health");
  if (hasAny(text, PATTERNS.bills)) categories.push("bills");
  if (hasAny(text, PATTERNS.income)) categories.push("income");
  if (hasAny(text, PATTERNS.saving)) categories.push("saving");
  return [...new Set(categories)];
}

function isClassificationExplanation(text: string): boolean {
  const categories = detectCategories(text);
  const hasCategoryChoice = categories.length > 1 && /\b(ولا|او|أو|or)\b/.test(text);
  const hasDirectClassificationLanguage = hasAny(text, [
    "اتصنف",
    "مصنف",
    "تصنيف",
    "الفئة",
    "الفئه",
    "غلط",
    "صح",
  ]);
  const hasCalculatedClassificationLanguage =
    hasAny(text, ["اتحسب", "محسوب"]) &&
    (hasCategoryChoice || hasDirectClassificationLanguage);

  return (categories.length > 0 && (hasDirectClassificationLanguage || hasCalculatedClassificationLanguage)) || hasCategoryChoice;
}

function detectMetric(text: string): IntentResult["slots"]["metric"] {
  if (hasAny(text, ["قارن", "مقارنه", "فرق"])) return "comparison";
  if (hasAny(text, ["ترند", "اتجاه", "زاد", "قل"])) return "trend";
  if (hasAny(text, ["متوسط", "average"])) return "average";
  if (hasAny(text, ["عدد", "كام مره"])) return "count";
  return "total";
}

function baseIntent(
  kind: AIIntentKind,
  confidence: number,
  reason: string,
  text: string,
  secondaryIntents: AIIntentKind[] = [],
): IntentResult {
  const period = detectPeriod(text);
  const categories = detectCategories(text);
  const category = categories[0];

  return {
    kind,
    confidence,
    reason,
    slots: {
      period,
      category,
      categories: categories.length > 1 ? categories : undefined,
      metric: detectMetric(text),
      wallet: hasAny(text, PATTERNS.wallet),
      needsEvidence: hasAny(text, PATTERNS.evidence),
      needsChart: hasAny(text, PATTERNS.chart),
      query: text,
    },
    secondaryIntents,
  };
}

export function routeIntent(message: string): IntentResult {
  const text = normalizeForIntent(message);
  const isShortGreeting = text.length <= 24 && hasAny(text, PATTERNS.greetings);

  if (!text) {
    return baseIntent("unknown", 0.2, "empty_message", text);
  }

  if (isShortGreeting) {
    return baseIntent("smalltalk", 0.9, "short_greeting", text);
  }

  const hasGoal = hasAny(text, PATTERNS.goals);
  const hasAction = hasAny(text, PATTERNS.action);
  const hasFinance = hasAny(text, PATTERNS.finance);
  const hasAnalysis = hasAny(text, PATTERNS.analysis);
  const hasAdvice = hasAny(text, PATTERNS.advice);
  const hasLifestyle = hasAny(text, PATTERNS.lifestyle);
  const hasMemory = hasAny(text, PATTERNS.memory);
  const hasSiteHelp = hasAny(text, PATTERNS.siteHelp);
  const asksHowTo = hasAny(text, ["ازاي", "كيف", "شرح", "طريقة", "خطوات", "how to"]) || /[؟?]/.test(message);
  const directSiteAction = hasAction && hasSiteHelp && !asksHowTo;
  const hasAmount = /\d|[٠-٩۰-۹]/.test(text);
  const asksAmount = /(كام|كم|قد ايه|اجمالي|مجموع|ملخص)/i.test(text);
  const explicitExpenseCapture =
    hasAmount &&
    !asksAmount &&
    (hasAny(text, ["سجل", "احفظ", "اضف", "ضيف", "سجل مصروف", "اشتريت"]) ||
      /(دفعت|صرفت)\s+.*(\d|[٠-٩۰-۹])/i.test(text));
  const startsWithMemoryRecall = /^(فاكر|تفتكر|افتكر|remember)(\s|$)/i.test(text);
  const referencesOldConversation = hasAny(text, [
    "اتكلمنا",
    "كلمتك",
    "قلتلك",
    "الشات القديم",
    "الشاتات القديمه",
    "ذاكره",
    "الذاكره",
    "ذكريات",
  ]);
  const memoryOnlyQuestion =
    hasMemory &&
    !hasAction &&
    !hasFinance &&
    !hasAnalysis &&
    !explicitExpenseCapture &&
    (startsWithMemoryRecall || referencesOldConversation);

  if (memoryOnlyQuestion) {
    return baseIntent("memory_question", 0.9, "memory_keyword_match", text);
  }

  if (explicitExpenseCapture) {
    return baseIntent("expense_capture", 0.86, "expense_capture_amount_action_match", text);
  }

  if (hasAny(text, PATTERNS.report)) {
    return baseIntent("report_request", 0.88, "report_keyword_match", text);
  }

  if (hasAny(text, PATTERNS.chart)) {
    return baseIntent("chart_request", 0.86, "chart_keyword_match", text, hasFinance ? ["finance_query"] : []);
  }

  if (isClassificationExplanation(text)) {
    return baseIntent(
      "finance_analysis",
      0.88,
      "classification_explanation_match",
      text,
      ["finance_query"],
    );
  }

  if (hasAdvice || (hasLifestyle && (hasAnalysis || hasAny(text, ["خطة", "اقلل", "نظم", "ظبط"])))) {
    return baseIntent(
      "advice_request",
      hasFinance || hasLifestyle ? 0.82 : 0.74,
      hasLifestyle ? "lifestyle_or_financial_advice_match" : "financial_advice_match",
      text,
      hasFinance ? ["finance_analysis"] : [],
    );
  }

  if (hasGoal) {
    const intent = baseIntent(
      "goal_planning",
      hasAction ? 0.92 : 0.84,
      hasAction ? "goal_planning_with_action_words" : "goal_keyword_match",
      text,
      hasAction ? ["action_request"] : [],
    );
    intent.slots.actionName = hasAction ? "goal.create" : undefined;
    return intent;
  }

  if (hasSiteHelp && !hasFinance && asksHowTo) {
    return baseIntent("site_help", 0.86, "site_help_keyword_match", text);
  }

  if (directSiteAction) {
    return baseIntent("action_request", 0.82, "direct_site_action_keyword_match", text);
  }

  if (hasAction && !hasFinance) {
    return baseIntent("action_request", 0.72, "generic_action_keyword_match", text);
  }

  if (hasFinance && hasAnalysis) {
    return baseIntent("finance_analysis", 0.88, "finance_analysis_keyword_match", text);
  }

  if (hasFinance) {
    return baseIntent("finance_query", 0.84, "finance_keyword_match", text);
  }

  if (hasAny(text, PATTERNS.expenseCapture)) {
    return baseIntent("expense_capture", 0.7, "expense_capture_keyword_match", text);
  }

  return baseIntent("unknown", 0.35, "no_deterministic_route", text);
}
