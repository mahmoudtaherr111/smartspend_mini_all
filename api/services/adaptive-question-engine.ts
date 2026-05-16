import type { OnboardingAnswer, SmartUserProfile } from "./user-profile-service";

export type AdaptiveQuestionType = "number" | "select" | "multi_select" | "boolean" | "text";

export interface AdaptiveQuestion {
  key: string;
  text: string;
  type: AdaptiveQuestionType;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
}

export const ADAPTIVE_ONBOARDING_QUESTIONS: AdaptiveQuestion[] = [
  {
    key: "income_level",
    text: "كام تقريباً دخلك الشهري؟",
    type: "number",
    required: false,
  },
  {
    key: "income_sources",
    text: "إيه مصادر دخلك الأساسية؟",
    type: "multi_select",
    options: [
      { value: "salary", label: "وظيفة / مرتب" },
      { value: "freelance", label: "فريلانس / عمل حر" },
      { value: "business", label: "مشروع خاص" },
      { value: "investments", label: "استثمارات / أرباح" },
      { value: "rental", label: "إيجارات" },
      { value: "other", label: "أخرى" },
    ],
  },
  {
    key: "family_responsibility",
    text: "هل أنت مسؤول مادياً عن أسرتك أو حد تاني؟",
    type: "boolean",
  },
  {
    key: "children",
    text: "عندك أطفال؟",
    type: "boolean",
  },
  {
    key: "children_count",
    text: "كام طفل عندك؟",
    type: "number",
  },
  {
    key: "living_situation",
    text: "إيه وضع سكنك الحالي؟",
    type: "select",
    options: [
      { value: "alone", label: "ساكن لوحدي" },
      { value: "family", label: "مع العيلة" },
      { value: "shared", label: "سكن مشترك" },
      { value: "married", label: "مع زوج/زوجة" },
    ],
  },
  {
    key: "housing_type",
    text: "سكنك إيجار ولا ملك؟",
    type: "select",
    options: [
      { value: "rent", label: "إيجار" },
      { value: "owned", label: "ملك" },
      { value: "family_owned", label: "بيت العيلة" },
    ],
  },
  {
    key: "monthly_rent",
    text: "لو إيجار، كام بيبلغ شهرياً؟",
    type: "number",
    required: false,
  },
  {
    key: "spending_pattern",
    text: "إزاي بتوصف طريقة صرفك؟",
    type: "select",
    options: [
      { value: "stable", label: "صرف ثابت ومنتظم" },
      { value: "variable", label: "متغير حسب الظروف" },
      { value: "impulsive", label: "بشتري كتير بدون تخطيط" },
      { value: "saver", label: "بحاول أوفر قد ما أقدر" },
    ],
  },
  {
    key: "supports_others",
    text: "بتصرف على مين بشكل منتظم؟",
    type: "multi_select",
    options: [
      { value: "parents", label: "الوالدين" },
      { value: "siblings", label: "إخوة" },
      { value: "partner", label: "شريك/زوج" },
      { value: "extended", label: "أقارب" },
      { value: "none", label: "ما حدش" },
    ],
  },
  {
    key: "fixed_commitments",
    text: "كام التزام ثابت شهري عندك؟ (إيجار، أقساط، اشتراكات)",
    type: "number",
  },
  {
    key: "fixed_commitments_total",
    text: "إجمالي التزاماتك الثابتة الشهرية تقريباً كام؟",
    type: "number",
    required: false,
  },
  {
    key: "has_debt",
    text: "عندك أي ديون أو أقساط؟",
    type: "boolean",
  },
  {
    key: "debt_monthly",
    text: "لو عندك ديون، بتدفع كام شهرياً تقريباً؟",
    type: "number",
    required: false,
  },
  {
    key: "has_savings",
    text: "عندك ادخار أو صندوق طوارئ؟",
    type: "select",
    options: [
      { value: "yes_regular", label: "أيوا بادخر بانتظام" },
      { value: "yes_irregular", label: "بادخر أحياناً" },
      { value: "no", label: "لا مش بادخر" },
      { value: "trying", label: "بحاول أبدأ" },
    ],
  },
  {
    key: "biggest_expense_category",
    text: "إيه أكبر بند بيستهلك فلوسك شهرياً؟",
    type: "select",
    options: [
      { value: "food", label: "أكل ومشروبات" },
      { value: "transport", label: "مواصلات / بنزين" },
      { value: "housing", label: "سكن / إيجار" },
      { value: "shopping", label: "تسوق وملابس" },
      { value: "entertainment", label: "ترفيه وخروجات" },
      { value: "education", label: "تعليم ودورات" },
      { value: "health", label: "صحة وأدوية" },
      { value: "bills", label: "فواتير واشتراكات" },
    ],
  },
  {
    key: "app_goal",
    text: "إيه أهم حاجة عايز SmartSpend يساعدك فيها؟",
    type: "select",
    options: [
      { value: "organize_expenses", label: "أنظم مصاريفي" },
      { value: "reduce_spending", label: "أقلل صرفي" },
      { value: "track_income", label: "أتتبع دخلي" },
      { value: "save_money", label: "أبدأ أدخر" },
      { value: "manage_business", label: "أدير مشروعي" },
      { value: "pay_debt", label: "أسدد ديوني" },
    ],
  },
  {
    key: "profession",
    text: "إيه وظيفتك أو مجال شغلك؟",
    type: "text",
    required: false,
  },
  {
    key: "age_range",
    text: "إيه فئتك العمرية؟",
    type: "select",
    options: [
      { value: "18-24", label: "18-24" },
      { value: "25-34", label: "25-34" },
      { value: "35-44", label: "35-44" },
      { value: "45-54", label: "45-54" },
      { value: "55+", label: "55+" },
    ],
    required: false,
  },
];

const QUESTION_BY_KEY = Object.fromEntries(
  ADAPTIVE_ONBOARDING_QUESTIONS.map((question) => [question.key, question])
);

function answerValue(answers: Record<string, OnboardingAnswer>, key: string): unknown {
  const answer = answers[key];
  if (!answer || answer.skipped) return undefined;
  return answer.value;
}

function hasAnswered(answers: Record<string, OnboardingAnswer>, key: string): boolean {
  return Boolean(answers[key]);
}

export function getNextOnboardingQuestion(
  answers: Record<string, OnboardingAnswer>
): AdaptiveQuestion | null {
  // Phase 1: Core financial data (most important for AI)
  if (!hasAnswered(answers, "income_level")) return QUESTION_BY_KEY.income_level;
  if (!hasAnswered(answers, "income_sources")) return QUESTION_BY_KEY.income_sources;
  if (!hasAnswered(answers, "app_goal")) return QUESTION_BY_KEY.app_goal;

  // Phase 2: Family & responsibilities
  if (!hasAnswered(answers, "family_responsibility")) return QUESTION_BY_KEY.family_responsibility;
  const familyResponsibility = answerValue(answers, "family_responsibility");
  if (familyResponsibility === true) {
    if (!hasAnswered(answers, "children")) return QUESTION_BY_KEY.children;
    if (answerValue(answers, "children") === true && !hasAnswered(answers, "children_count")) {
      return QUESTION_BY_KEY.children_count;
    }
    if (!hasAnswered(answers, "supports_others")) return QUESTION_BY_KEY.supports_others;
  }

  // Phase 3: Living situation
  if (!hasAnswered(answers, "living_situation")) return QUESTION_BY_KEY.living_situation;
  if (!hasAnswered(answers, "housing_type")) return QUESTION_BY_KEY.housing_type;
  if (answerValue(answers, "housing_type") === "rent" && !hasAnswered(answers, "monthly_rent")) {
    return QUESTION_BY_KEY.monthly_rent;
  }

  // Phase 4: Spending behavior  
  if (!hasAnswered(answers, "spending_pattern")) return QUESTION_BY_KEY.spending_pattern;
  if (!hasAnswered(answers, "biggest_expense_category")) return QUESTION_BY_KEY.biggest_expense_category;
  if (!hasAnswered(answers, "fixed_commitments")) return QUESTION_BY_KEY.fixed_commitments;
  if (!hasAnswered(answers, "fixed_commitments_total")) return QUESTION_BY_KEY.fixed_commitments_total;

  // Phase 5: Debt & savings
  if (!hasAnswered(answers, "has_debt")) return QUESTION_BY_KEY.has_debt;
  if (answerValue(answers, "has_debt") === true && !hasAnswered(answers, "debt_monthly")) {
    return QUESTION_BY_KEY.debt_monthly;
  }
  if (!hasAnswered(answers, "has_savings")) return QUESTION_BY_KEY.has_savings;

  // Phase 6: Personal info (optional)
  if (!hasAnswered(answers, "profession")) return QUESTION_BY_KEY.profession;
  if (!hasAnswered(answers, "age_range")) return QUESTION_BY_KEY.age_range;

  return null;
}

export function applyOnboardingAnswer(
  profile: SmartUserProfile,
  key: string,
  value: unknown,
  skipped = false,
  now = new Date()
): SmartUserProfile {
  const answer: OnboardingAnswer = {
    value: skipped ? null : value,
    skipped,
    answeredAt: profile.onboardingAnswers[key]?.answeredAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const onboardingAnswers = { ...profile.onboardingAnswers, [key]: answer };
  const financialInfo = { ...profile.financialInfo };
  const lifestyleInfo = { ...profile.lifestyleInfo };
  const basicInfo = { ...profile.basicInfo };

  if (!skipped) {
    // Financial info mapping
    if (key === "income_level") financialInfo.averageMonthlyIncome = value;
    if (key === "income_sources") financialInfo.incomeSources = value;
    if (key === "spending_pattern") financialInfo.spendingPattern = value;
    if (key === "app_goal") financialInfo.primaryGoal = value;
    if (key === "has_debt") financialInfo.hasDebt = value;
    if (key === "debt_monthly") financialInfo.monthlyDebtPayment = value;
    if (key === "has_savings") financialInfo.savingsStatus = value;
    if (key === "biggest_expense_category") financialInfo.biggestExpenseCategory = value;
    if (key === "fixed_commitments_total") financialInfo.fixedCommitmentsTotal = value;

    // Lifestyle info mapping
    if (key === "family_responsibility") lifestyleInfo.responsibleForFamily = value;
    if (key === "children") lifestyleInfo.hasChildren = value;
    if (key === "children_count") lifestyleInfo.childrenCount = value;
    if (key === "living_situation") lifestyleInfo.livingSituation = value;
    if (key === "housing_type") lifestyleInfo.housingType = value;
    if (key === "monthly_rent") lifestyleInfo.monthlyRent = value;
    if (key === "supports_others") lifestyleInfo.supportsOthers = value;
    if (key === "fixed_commitments") lifestyleInfo.fixedMonthlyCommitments = value;
    if (key === "age_range") lifestyleInfo.ageRange = value;

    // Basic info mapping
    if (key === "profession") basicInfo.profession = value;
  }

  const complete = getNextOnboardingQuestion(onboardingAnswers) === null;
  return {
    ...profile,
    onboardingAnswers,
    financialInfo,
    lifestyleInfo,
    basicInfo,
    profileCompleted: complete || profile.profileCompleted,
  };
}
