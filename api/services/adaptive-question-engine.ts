import type {
  OnboardingAnswer,
  SmartUserProfile,
} from "./user-profile-service";
import { PROFILE_FIELDS } from "../../contracts/profile-fields";

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

/**
 * The questions asked today, in order: the shared definition in `contracts/profile-fields.ts`. The keys asked before
 * (income sources, goal, family, housing, debt, car, pets, smoking, subscriptions, names) are no longer asked; their
 * stored answers stay, and `applyOnboardingAnswer` still files them for an app version that sends one.
 */
export const ADAPTIVE_ONBOARDING_QUESTIONS: AdaptiveQuestion[] = PROFILE_FIELDS.map((field) => ({
  key: field.key,
  text: field.question.ar,
  type: field.unit === "text" ? "text" : "number",
  required: false,
}));

export function getNextOnboardingQuestion(
  answers: Record<string, OnboardingAnswer>,
): AdaptiveQuestion | null {
  return ADAPTIVE_ONBOARDING_QUESTIONS.find((question) => !answers[question.key]) ?? null;
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
    if (key === "salary_day") {
      // Home, the calendar and the stats use the payday only when hasFixedSalary is set; 0 means "no fixed day".
      const day = Number(value);
      const fixed = Number.isInteger(day) && day >= 1 && day <= 31;
      financialInfo.hasFixedSalary = fixed;
      financialInfo.salaryDay = fixed ? day : null;
    }
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

/** The relationship each onboarding question's names are saved under in the contacts. */
const NAMED_PEOPLE_QUESTIONS: Record<string, string> = {
  children_names: "ابن/ابنة",
  partner_name: "زوج/زوجة",
  siblings_names: "أخ/أخت",
  parents_names: "والد/والدة",
  regular_contacts: "شخص معروف",
};

/**
 * The people an onboarding answer names, with the relationship the question implies. They
 * are added to the contacts when the answer is saved, so the app does not later ask "مين
 * أحمد؟" about someone the user already named. A name shorter than two letters is dropped.
 */
export function namedPeopleOfAnswer(key: string, value: unknown): Array<{ name: string; relationship: string }> {
  const relationship = NAMED_PEOPLE_QUESTIONS[key];
  if (!relationship) return [];
  const names = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[،,\n]+/) : [];
  const seen = new Set<string>();
  const people: Array<{ name: string; relationship: string }> = [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (name.length < 2 || seen.has(name)) continue;
    seen.add(name);
    people.push({ name, relationship });
  }
  return people;
}
