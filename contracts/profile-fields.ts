/**
 * The questions SmartSpend asks about a user: one definition for the onboarding card on Home, the profile screen,
 * the server's question engine and the voice call, so their wording and answers cannot drift.
 *
 * A question belongs here only while something the user sees depends on its answer (`why` says what). Removing
 * one stops asking and showing it; the answers already stored in `user_profiles` are kept.
 * The texts are shared with the server and the voice call, so they live here rather than in `src/i18n/`.
 */

export type ProfileFieldKey = "income_level" | "salary_day" | "profession";

export interface LocalizedText {
  ar: string;
  en: string;
}

export type ProfileFieldValue = number | string;

export interface ProfileFieldChoice {
  value: ProfileFieldValue;
  label: LocalizedText;
}

export interface ProfileField {
  key: ProfileFieldKey;
  /** Where the answer is stored in the smart profile. */
  section: "financialInfo" | "basicInfo";
  path: "averageMonthlyIncome" | "salaryDay" | "profession";
  /** The row label on the profile screen. */
  label: LocalizedText;
  /** The question on the onboarding card and in a voice call. */
  question: LocalizedText;
  /** One line under the question: what the answer changes for the user. */
  why: LocalizedText;
  unit: "egp" | "day" | "text";
  /** Numbers: the allowed range. Text: the allowed length. */
  min: number;
  max: number;
  /** One-tap answers shown before the free entry. */
  quickChoices: ProfileFieldChoice[];
  /** An answer that means "none": stored as `value`, shown as `label`. */
  noneChoice?: ProfileFieldChoice;
}

export const PROFILE_FIELDS: readonly ProfileField[] = [
  {
    key: "income_level",
    section: "financialInfo",
    path: "averageMonthlyIncome",
    label: { ar: "الدخل الشهري", en: "Monthly income" },
    question: { ar: "دخلك في الشهر حوالي كام؟", en: "Roughly how much do you earn a month?" },
    why: {
      ar: "بنستخدمه كحد لصرفك لحد ما تعمل ميزانية، ونحذّرك لو قرّبت منه.",
      en: "Used as your spending limit until you set a budget, with a warning when you get close.",
    },
    unit: "egp",
    min: 1,
    max: 10_000_000,
    quickChoices: [
      { value: 8_000, label: { ar: "8,000", en: "8,000" } },
      { value: 15_000, label: { ar: "15,000", en: "15,000" } },
      { value: 25_000, label: { ar: "25,000", en: "25,000" } },
      { value: 40_000, label: { ar: "40,000", en: "40,000" } },
    ],
  },
  {
    key: "salary_day",
    section: "financialInfo",
    path: "salaryDay",
    label: { ar: "يوم القبض", en: "Payday" },
    question: { ar: "بتقبض يوم كام في الشهر؟", en: "Which day of the month do you get paid?" },
    why: {
      ar: "شهرك في الإحصائيات والتقويم هيبدأ من يوم القبض لحد اللي بعده.",
      en: "Your stats and calendar will run from one payday to the next.",
    },
    unit: "day",
    min: 1,
    max: 31,
    quickChoices: [
      { value: 1, label: { ar: "1", en: "1st" } },
      { value: 25, label: { ar: "25", en: "25th" } },
      { value: 27, label: { ar: "27", en: "27th" } },
      { value: 30, label: { ar: "30", en: "30th" } },
    ],
    noneChoice: { value: 0, label: { ar: "مافيش يوم ثابت", en: "No fixed day" } },
  },
  {
    // The voice assistant calls the user by the title of their work (honorific.ts), and the feminine form of the
    // word is how it knows to speak to a woman, since gender is never asked or stored.
    key: "profession",
    section: "basicInfo",
    path: "profession",
    label: { ar: "الشغل", en: "Work" },
    question: { ar: "بتشتغل إيه؟", en: "What do you do for work?" },
    why: {
      ar: "سمارت هيناديك بلقبك في المكالمات، زي «يا باشمهندس» أو «يا دكتورة».",
      en: "Smart will address you by your title in calls.",
    },
    unit: "text",
    min: 2,
    max: 60,
    quickChoices: [
      { value: "مهندس", label: { ar: "مهندس", en: "Engineer (m)" } },
      { value: "مهندسة", label: { ar: "مهندسة", en: "Engineer (f)" } },
      { value: "دكتور", label: { ar: "دكتور", en: "Doctor (m)" } },
      { value: "دكتورة", label: { ar: "دكتورة", en: "Doctor (f)" } },
      { value: "محاسب", label: { ar: "محاسب", en: "Accountant" } },
      { value: "مدرس", label: { ar: "مدرس", en: "Teacher" } },
    ],
  },
];

export const PROFILE_FIELD_KEYS: readonly ProfileFieldKey[] = PROFILE_FIELDS.map((field) => field.key);

export function profileField(key: string): ProfileField | undefined {
  return PROFILE_FIELDS.find((field) => field.key === key);
}

/** The answer a user typed or tapped, held to the field's rules; `null` when it does not fit. */
export function normalizeProfileFieldValue(field: ProfileField, raw: unknown): ProfileFieldValue | null {
  if (field.unit === "text") {
    const text = String(raw ?? "").replace(/\s+/g, " ").trim();
    return text.length >= field.min && text.length <= field.max ? text : null;
  }
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[,\s]/g, ""));
  if (!Number.isFinite(value)) return null;
  if (field.noneChoice && value === field.noneChoice.value) return value;
  if (field.unit === "day" && !Number.isInteger(value)) return null;
  return value >= field.min && value <= field.max ? value : null;
}

/** Whether a value can be saved for the field. */
export function isValidProfileFieldValue(
  field: ProfileField,
  value: ProfileFieldValue | undefined,
): value is ProfileFieldValue {
  return value !== undefined && normalizeProfileFieldValue(field, value) !== null;
}

/** The stored value of a field in a smart profile, or undefined when the user never gave it. */
export function profileFieldValue(
  profile: { financialInfo?: Record<string, unknown> | null; basicInfo?: Record<string, unknown> | null } | null | undefined,
  field: ProfileField,
): ProfileFieldValue | undefined {
  const info = profile?.[field.section] ?? undefined;
  const raw = info?.[field.path];
  if (field.unit === "text") return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  if (field.key === "salary_day" && info?.hasFixedSalary === false) return field.noneChoice?.value;
  const value = typeof raw === "number" ? raw : raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** How a stored value reads on the profile screen. */
export function formatProfileFieldValue(
  field: ProfileField,
  value: ProfileFieldValue | undefined,
  lang: "ar" | "en",
): string | null {
  if (value === undefined) return null;
  if (typeof value === "string") return value;
  if (field.noneChoice && value === field.noneChoice.value) return field.noneChoice.label[lang];
  // Western digits, as on every other money figure in the app.
  const number = value.toLocaleString("en-US");
  if (field.unit === "egp") return lang === "en" ? `EGP ${number}` : `${number} ج.م`;
  return lang === "en" ? `Day ${number}` : `يوم ${number}`;
}
