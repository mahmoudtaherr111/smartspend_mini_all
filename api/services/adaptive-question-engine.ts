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
    text: "Approximate monthly income",
    type: "number",
    required: false,
  },
  {
    key: "income_sources",
    text: "Primary income sources",
    type: "multi_select",
    options: [
      { value: "salary", label: "Salary" },
      { value: "freelance", label: "Freelance" },
      { value: "business", label: "Business" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "family_responsibility",
    text: "Are you financially responsible for family members?",
    type: "boolean",
  },
  {
    key: "children",
    text: "Do you have children?",
    type: "boolean",
  },
  {
    key: "children_details",
    text: "Children count and approximate ages",
    type: "text",
  },
  {
    key: "living_situation",
    text: "Living situation",
    type: "select",
    options: [
      { value: "alone", label: "Living alone" },
      { value: "family", label: "With family" },
      { value: "shared", label: "Shared housing" },
    ],
  },
  {
    key: "spending_pattern",
    text: "Spending pattern",
    type: "select",
    options: [
      { value: "stable", label: "Stable" },
      { value: "variable", label: "Variable" },
      { value: "unclear", label: "Not sure" },
    ],
  },
  {
    key: "supports_others",
    text: "People you support financially",
    type: "multi_select",
    options: [
      { value: "parents", label: "Parents" },
      { value: "siblings", label: "Siblings" },
      { value: "partner", label: "Partner" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "fixed_commitments",
    text: "Approximate number of fixed monthly commitments",
    type: "number",
  },
  {
    key: "app_goal",
    text: "Main goal from SmartSpend",
    type: "select",
    options: [
      { value: "organize_expenses", label: "Organize expenses" },
      { value: "reduce_spending", label: "Reduce spending" },
      { value: "track_income", label: "Track income" },
      { value: "manage_business", label: "Manage business" },
    ],
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
  if (!hasAnswered(answers, "income_level")) return QUESTION_BY_KEY.income_level;
  if (!hasAnswered(answers, "income_sources")) return QUESTION_BY_KEY.income_sources;
  if (!hasAnswered(answers, "family_responsibility")) return QUESTION_BY_KEY.family_responsibility;

  const familyResponsibility = answerValue(answers, "family_responsibility");
  if (familyResponsibility === true) {
    if (!hasAnswered(answers, "children")) return QUESTION_BY_KEY.children;
    if (answerValue(answers, "children") === true && !hasAnswered(answers, "children_details")) {
      return QUESTION_BY_KEY.children_details;
    }
    if (!hasAnswered(answers, "supports_others")) return QUESTION_BY_KEY.supports_others;
  } else if (!hasAnswered(answers, "living_situation")) {
    return QUESTION_BY_KEY.living_situation;
  }

  if (!hasAnswered(answers, "spending_pattern")) return QUESTION_BY_KEY.spending_pattern;
  if (!hasAnswered(answers, "fixed_commitments")) return QUESTION_BY_KEY.fixed_commitments;
  if (!hasAnswered(answers, "app_goal")) return QUESTION_BY_KEY.app_goal;
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

  if (!skipped) {
    if (key === "income_level") financialInfo.averageMonthlyIncome = value;
    if (key === "income_sources") financialInfo.incomeSources = value;
    if (key === "spending_pattern") financialInfo.spendingPattern = value;
    if (key === "app_goal") financialInfo.primaryGoal = value;
    if (key === "family_responsibility") lifestyleInfo.responsibleForFamily = value;
    if (key === "children") lifestyleInfo.hasChildren = value;
    if (key === "children_details") lifestyleInfo.childrenDetails = value;
    if (key === "living_situation") lifestyleInfo.livingSituation = value;
    if (key === "supports_others") lifestyleInfo.supportsOthers = value;
    if (key === "fixed_commitments") lifestyleInfo.fixedMonthlyCommitments = value;
  }

  const complete = getNextOnboardingQuestion(onboardingAnswers) === null;
  return {
    ...profile,
    onboardingAnswers,
    financialInfo,
    lifestyleInfo,
    profileCompleted: complete || profile.profileCompleted,
  };
}
