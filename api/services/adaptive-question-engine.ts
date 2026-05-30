import type {
  OnboardingAnswer,
  SmartUserProfile,
} from "./user-profile-service";

export type AdaptiveQuestionType =
  | "number"
  | "select"
  | "multi_select"
  | "boolean"
  | "text"
  | "text_list";

export interface AdaptiveQuestion {
  key: string;
  text: string;
  type: AdaptiveQuestionType;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  /** For text_list: how many items to ask for (can be dynamic from answers) */
  listCount?: number;
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
    key: "salary_day",
    text: "مرتبك بينزل يوم كام من الشهر تقريباً؟",
    type: "number",
    required: false,
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
    key: "children_names",
    text: "إيه أسماء أطفالك؟",
    type: "text_list",
    required: false,
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
    key: "partner_name",
    text: "إيه اسم شريك/شريكة حياتك؟",
    type: "text",
    required: false,
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
    key: "supports_others",
    text: "بتصرف على مين بشكل منتظم؟ (غير زوجتك/أطفالك)",
    type: "multi_select",
    options: [
      { value: "parents", label: "الوالدين" },
      { value: "siblings", label: "إخوة" },
      { value: "extended", label: "أقارب" },
      { value: "none", label: "ما حدش" },
    ],
  },
  {
    key: "siblings_names",
    text: "إيه أسماء إخواتك/أخواتك؟",
    type: "text_list",
    required: false,
  },
  {
    key: "parents_names",
    text: "إيه أسماء أبوك وأمك؟",
    type: "text_list",
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
    key: "profession",
    text: "إيه وظيفتك أو مجال شغلك؟",
    type: "text",
    required: false,
  },
  {
    key: "car_ownership",
    text: "عندك عربية خاصة؟",
    type: "boolean",
  },
  {
    key: "car_type",
    text: "نوع العربية إيه؟",
    type: "text",
    required: false,
  },
  {
    key: "has_pets",
    text: "عندك حيوانات أليفة؟",
    type: "boolean",
  },
  {
    key: "pet_names",
    text: "إيه أسماءهم؟",
    type: "text_list",
    required: false,
  },
  {
    key: "smoking",
    text: "بتدخن؟",
    type: "boolean",
  },
  {
    key: "subscription_services",
    text: "إيه الاشتراكات اللي بتدفعها شهرياً؟",
    type: "multi_select",
    options: [
      { value: "netflix", label: "Netflix / Shahid" },
      { value: "gym", label: "جيم / نادي" },
      { value: "internet", label: "إنترنت منزلي" },
      { value: "phone_plan", label: "باقة موبايل" },
      { value: "insurance", label: "تأمين" },
      { value: "other", label: "أخرى" },
    ],
  },
  {
    key: "regular_contacts",
    text: "مين الأشخاص اللي بتعاملهم ماليًا بانتظام؟ (اكتب أسمائهم)",
    type: "text_list",
    required: false,
  },
];

const QUESTION_BY_KEY = Object.fromEntries(
  ADAPTIVE_ONBOARDING_QUESTIONS.map((question) => [question.key, question]),
);

function answerValue(
  answers: Record<string, OnboardingAnswer>,
  key: string,
): unknown {
  const answer = answers[key];
  if (!answer || answer.skipped) return undefined;
  return answer.value;
}

function hasAnswered(
  answers: Record<string, OnboardingAnswer>,
  key: string,
): boolean {
  return Boolean(answers[key]);
}

export function getNextOnboardingQuestion(
  answers: Record<string, OnboardingAnswer>,
): AdaptiveQuestion | null {
  // Phase 1: Core financial data
  if (!hasAnswered(answers, "income_level"))
    return QUESTION_BY_KEY.income_level;
  if (!hasAnswered(answers, "income_sources"))
    return QUESTION_BY_KEY.income_sources;

  // Salary day question — only if income includes salary
  const incomeSources = answerValue(answers, "income_sources") as
    | string[]
    | undefined;
  const hasSalarySource =
    Array.isArray(incomeSources) && incomeSources.includes("salary");
  if (hasSalarySource && !hasAnswered(answers, "salary_day")) {
    return QUESTION_BY_KEY.salary_day;
  }

  if (!hasAnswered(answers, "app_goal")) return QUESTION_BY_KEY.app_goal;

  // Phase 2: Family & responsibilities
  if (!hasAnswered(answers, "children")) return QUESTION_BY_KEY.children;
  if (answerValue(answers, "children") === true) {
    if (!hasAnswered(answers, "children_count"))
      return QUESTION_BY_KEY.children_count;
    if (!hasAnswered(answers, "children_names")) {
      const count = Number(answerValue(answers, "children_count")) || 1;
      return { ...QUESTION_BY_KEY.children_names, listCount: count };
    }
  }

  // Phase 3: Living situation
  if (!hasAnswered(answers, "living_situation"))
    return QUESTION_BY_KEY.living_situation;
  const livingSituation = answerValue(answers, "living_situation");
  if (
    (livingSituation === "married" || livingSituation === "family") &&
    !hasAnswered(answers, "partner_name")
  ) {
    return QUESTION_BY_KEY.partner_name;
  }
  if (!hasAnswered(answers, "housing_type"))
    return QUESTION_BY_KEY.housing_type;
  if (!hasAnswered(answers, "supports_others"))
    return QUESTION_BY_KEY.supports_others;

  // Siblings & parents names — conditional on supports_others
  const supportsOthers = answerValue(answers, "supports_others") as
    | string[]
    | undefined;
  if (
    Array.isArray(supportsOthers) &&
    supportsOthers.includes("siblings") &&
    !hasAnswered(answers, "siblings_names")
  ) {
    return QUESTION_BY_KEY.siblings_names;
  }
  if (
    Array.isArray(supportsOthers) &&
    supportsOthers.includes("parents") &&
    !hasAnswered(answers, "parents_names")
  ) {
    return QUESTION_BY_KEY.parents_names;
  }

  // Phase 4: Debt
  if (!hasAnswered(answers, "has_debt")) return QUESTION_BY_KEY.has_debt;
  if (
    answerValue(answers, "has_debt") === true &&
    !hasAnswered(answers, "debt_monthly")
  ) {
    return QUESTION_BY_KEY.debt_monthly;
  }

  // Phase 5: Personal & Car
  if (!hasAnswered(answers, "profession")) return QUESTION_BY_KEY.profession;
  if (!hasAnswered(answers, "car_ownership"))
    return QUESTION_BY_KEY.car_ownership;
  if (answerValue(answers, "car_ownership") === true) {
    if (!hasAnswered(answers, "car_type")) return QUESTION_BY_KEY.car_type;
  }

  // Phase 6: Pets, Smoking, Subscriptions, Contacts
  if (!hasAnswered(answers, "has_pets")) return QUESTION_BY_KEY.has_pets;
  if (
    answerValue(answers, "has_pets") === true &&
    !hasAnswered(answers, "pet_names")
  ) {
    return QUESTION_BY_KEY.pet_names;
  }
  if (!hasAnswered(answers, "smoking")) return QUESTION_BY_KEY.smoking;
  if (!hasAnswered(answers, "subscription_services"))
    return QUESTION_BY_KEY.subscription_services;
  if (!hasAnswered(answers, "regular_contacts"))
    return QUESTION_BY_KEY.regular_contacts;

  return null;
}

export function applyOnboardingAnswer(
  profile: SmartUserProfile,
  key: string,
  value: unknown,
  skipped = false,
  now = new Date(),
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
    if (key === "app_goal") financialInfo.primaryGoal = value;
    if (key === "has_debt") financialInfo.hasDebt = value;
    if (key === "salary_day") financialInfo.salaryDay = value;
    if (key === "debt_monthly") financialInfo.monthlyDebtPayment = value;

    // Lifestyle info mapping
    if (key === "children") lifestyleInfo.hasChildren = value;
    if (key === "children_count") lifestyleInfo.childrenCount = value;
    if (key === "living_situation") lifestyleInfo.livingSituation = value;
    if (key === "housing_type") lifestyleInfo.housingType = value;
    if (key === "supports_others") lifestyleInfo.supportsOthers = value;
    if (key === "siblings_names") lifestyleInfo.siblingsNames = value; // string[]
    if (key === "parents_names") lifestyleInfo.parentsNames = value; // string[]

    // Basic info mapping
    if (key === "profession") basicInfo.profession = value;

    // Deep personal data mapping
    if (key === "children_names") lifestyleInfo.childrenNames = value; // string[]
    if (key === "partner_name") lifestyleInfo.partnerName = value;
    if (key === "car_ownership") lifestyleInfo.carOwnership = value;
    if (key === "car_type") lifestyleInfo.carType = value;
    if (key === "has_pets") lifestyleInfo.hasPets = value;
    if (key === "pet_names") lifestyleInfo.petNames = value; // string[]
    if (key === "smoking") lifestyleInfo.smoking = value;
    if (key === "subscription_services") lifestyleInfo.subscriptions = value;
    if (key === "regular_contacts") lifestyleInfo.regularContacts = value; // string[]
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
