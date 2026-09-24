/**
 * Getting to know the user during a call: the same profile questions the Home card asks
 * (api/services/adaptive-question-engine.ts), limited to the ones that change a money answer (no family names,
 * pets or smoking). The next unanswered one goes into the call's facts, the assistant may ask it once when the call
 * allows, and the answer is saved through `profile.submitOnboardingAnswer`, exactly as a tap on the card would be,
 * after it is checked against the question's type.
 */
import { and, eq } from "drizzle-orm";
import { userProfiles } from "../../../../db/schema";
import { parseArabicNumbers } from "../../../lib/arabic-number-parser";
import { db } from "../../../queries/connection";
import { ADAPTIVE_ONBOARDING_QUESTIONS, type AdaptiveQuestion } from "../../adaptive-question-engine";
import type { OnboardingAnswer } from "../../user-profile-service";

/** Asked in this order, each only once answered or skipped questions are out of the way. */
const CALL_QUESTION_KEYS = [
  "income_level", "income_sources", "salary_day", "app_goal", "profession", "has_debt", "debt_monthly",
  "housing_type", "supports_others", "subscription_services", "car_ownership",
] as const;

const DAY_MS = 86_400_000;

export function callQuestion(key: string): AdaptiveQuestion | null {
  if (!(CALL_QUESTION_KEYS as readonly string[]).includes(key)) return null;
  return ADAPTIVE_ONBOARDING_QUESTIONS.find((question) => question.key === key) ?? null;
}

/** The next question worth asking in a call, or null when there is none or the app asked one in the last day. */
export function nextCallQuestion(answers: Record<string, OnboardingAnswer>, lastAskedAt: Date | null, now = new Date()): AdaptiveQuestion | null {
  if (lastAskedAt && now.getTime() - lastAskedAt.getTime() < DAY_MS) return null;
  const value = (key: string) => (answers[key] && !answers[key].skipped ? answers[key].value : undefined);
  for (const key of CALL_QUESTION_KEYS) {
    if (answers[key]) continue;
    if (key === "salary_day" && !(Array.isArray(value("income_sources")) && (value("income_sources") as unknown[]).includes("salary"))) continue;
    if (key === "debt_monthly" && value("has_debt") !== true) continue;
    return callQuestion(key);
  }
  return null;
}

export async function lastAskedAt(userId: number, userType: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: userProfiles.lastAskedAt })
    .from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.userType, userType)))
    .limit(1);
  return row?.at ?? null;
}

/** How the question reads in the call's facts: the words to ask, and what an answer may be. */
export function questionLine(question: AdaptiveQuestion): string {
  const answers =
    question.type === "number" ? "رقم" :
    question.type === "boolean" ? "true أو false" :
    question.options?.length ? question.options.map((option) => `${option.value}=${option.label}`).join("، ") : "كلام قصير";
  return `«${question.text}» (key=${question.key}; الإجابة: ${answers}${question.type === "multi_select" ? "، أكتر من واحدة ممكن" : ""})`;
}

const YES = /^(اه|آه|أه|ايوه|أيوه|ايوة|أيوة|اكيد|أكيد|طبعا|طبعاً|صح|true|yes|نعم)$/;
const NO = /^(لا|لأ|لاء|مفيش|ماعنديش|معنديش|false|no)$/;

/** The model's reading of the answer, held to the question's type; null when it does not fit. */
export function checkedAnswer(question: AdaptiveQuestion, raw: unknown): unknown {
  switch (question.type) {
    case "number": {
      const text = typeof raw === "number" ? String(raw) : parseArabicNumbers(String(raw ?? ""));
      const match = text.match(/\d+(?:\.\d+)?/);
      const value = match ? Number(match[0]) : NaN;
      if (!Number.isFinite(value) || value < 0) return null;
      if (question.key === "salary_day" && (value < 1 || value > 31 || !Number.isInteger(value))) return null;
      return value;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const word = String(raw ?? "").trim();
      return YES.test(word) ? true : NO.test(word) ? false : null;
    }
    case "select": {
      const option = question.options?.find((item) => item.value === raw || item.label === raw);
      return option ? option.value : null;
    }
    case "multi_select": {
      const picked = (Array.isArray(raw) ? raw : String(raw ?? "").split(/[,،]/))
        .map((item) => question.options?.find((option) => option.value === String(item).trim() || option.label === String(item).trim())?.value)
        .filter((value): value is string => Boolean(value));
      return picked.length ? [...new Set(picked)] : null;
    }
    case "text": {
      const text = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      return text.length >= 2 ? text : null;
    }
    default:
      return null;
  }
}
