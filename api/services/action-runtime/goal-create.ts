import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { financialGoals } from "../../../db/schema";
import { db } from "../../queries/connection";
import { invalidateFinanceUserCache } from "../finance-semantic-layer";
import type { ActionRuntimeContext, GoalCreatePayload } from "./types";

const FREE_GOALS_LIMIT = 3;

export const goalCreatePayloadSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  targetAmount: z.number().positive().optional(),
  targetDate: z.string().optional(),
});

function normalizeDigits(value: string): string {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = arabic.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    const easternIndex = eastern.indexOf(digit);
    return easternIndex >= 0 ? String(easternIndex) : digit;
  });
}

function extractAmount(message: string): number | undefined {
  const normalized = normalizeDigits(message.toLowerCase());
  const match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(الف|ألف|k|مليون|million)?/i);
  if (!match) return undefined;
  const base = Number(match[1].replace(",", "."));
  if (!Number.isFinite(base) || base <= 0) return undefined;
  const unit = match[2] ?? "";
  if (unit === "مليون" || unit === "million") return Math.round(base * 1_000_000);
  if (unit === "الف" || unit === "ألف" || unit.toLowerCase() === "k") return Math.round(base * 1_000);
  return Math.round(base);
}

function extractTargetDate(message: string): string | undefined {
  const normalized = normalizeDigits(message.toLowerCase());
  const now = new Date();
  if (normalized.includes("سنه") || normalized.includes("سنة") || normalized.includes("year")) {
    const date = new Date(now);
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString().slice(0, 10);
  }
  const months = normalized.match(/(\d+)\s*(شهر|شهور|months?)/i);
  if (months) {
    const date = new Date(now);
    date.setMonth(date.getMonth() + Number(months[1]));
    return date.toISOString().slice(0, 10);
  }
  return undefined;
}

function cleanupGoalTitleCandidate(value: string): string {
  return normalizeDigits(value)
    .replace(/[؟?,،.!]/g, " ")
    .replace(/خلال\s+.*$/i, " ")
    .replace(/في\s+غضون\s+.*$/i, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(جنيه|ج|egp|الف|ألف|k|مليون|million)?/gi, " ")
    .replace(/\b(سنه|سنة|year|شهر|شهور|months?)\b/gi, " ")
    .replace(/\b(هدف|احوش|ادخر|توفير|حوش|اعمل|انشئ|أنشئ|ضيف|حط|سجل|create|add|saving|goal)\b/gi, " ")
    .replace(/\b(اشتري|اشترى|شراء|اجيب|أجيب|جيب|عايز|عاوز)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function knownGoalTitle(candidate: string): string | undefined {
  const normalized = candidate.toLowerCase();
  if (normalized.includes("عربي") || normalized.includes("سياره") || normalized.includes("سيارة")) {
    return "هدف شراء عربية";
  }
  if (normalized.includes("شقه") || normalized.includes("شقة")) {
    return "هدف شراء شقة";
  }
  if (normalized.includes("سفر")) {
    return "هدف السفر";
  }
  return undefined;
}

function extractPurposeTitle(message: string): string | undefined {
  const normalized = normalizeDigits(message);
  const purposePatterns = [
    /(?:عشان|علشان|لجل)\s+(?:اشتري|اشترى|شراء|اجيب|أجيب|جيب)?\s*([^،,.؟\n]+)/i,
    /(?:^|\s)(?:لـ|لل)\s*([^،,.؟\n]+)/i,
    /(?:^|\s)ل\s+([^،,.؟\n]+)/i,
  ];

  for (const pattern of purposePatterns) {
    const match = normalized.match(pattern);
    const candidate = cleanupGoalTitleCandidate(match?.[1] ?? "");
    if (candidate.length >= 2 && candidate.length <= 60) {
      return knownGoalTitle(candidate) ?? `هدف شراء ${candidate}`;
    }
  }

  const cleaned = cleanupGoalTitleCandidate(normalized);
  if (cleaned.length >= 2 && cleaned.length <= 40) {
    return knownGoalTitle(cleaned) ?? `هدف ${cleaned}`;
  }
  return undefined;
}

function titleFromMessage(message: string): string {
  const known = knownGoalTitle(message);
  if (known) return known;
  const extracted = extractPurposeTitle(message);
  if (extracted) return extracted;
  return "هدف ادخار جديد";
}

export function isGoalCreateRequest(message: string): boolean {
  const normalized = message.toLowerCase();
  const hasGoal = /(هدف|احوش|ادخر|توفير|حوش|saving|goal)/i.test(normalized);
  const hasAction = /(اعمل|انشئ|أنشئ|ضيف|حط|سجل|create|add|نفذ)/i.test(normalized);
  return hasGoal && hasAction && extractAmount(message) !== undefined;
}

export function createGoalPayloadFromMessage(message: string): GoalCreatePayload | null {
  if (!isGoalCreateRequest(message)) return null;
  return {
    title: titleFromMessage(message),
    description: message.trim().slice(0, 500),
    targetAmount: extractAmount(message),
    targetDate: extractTargetDate(message),
  };
}

export async function validateGoalCreate(
  ctx: ActionRuntimeContext,
  payload: GoalCreatePayload,
): Promise<GoalCreatePayload> {
  const parsed = goalCreatePayloadSchema.parse(payload);
  const existing = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(financialGoals)
    .where(
      and(
        eq(financialGoals.userId, ctx.userId),
        eq(financialGoals.userType, ctx.userType),
        eq(financialGoals.status, "active"),
      ),
    );

  const isPro = ctx.userPlan === "pro" || ctx.userPlan === "ultra";
  const count = Number(existing[0]?.count || 0);
  if (!isPro && count >= FREE_GOALS_LIMIT) {
    throw new Error(`Free plan supports ${FREE_GOALS_LIMIT} active goals`);
  }

  return parsed;
}

export async function executeGoalCreate(
  ctx: ActionRuntimeContext,
  payload: GoalCreatePayload,
): Promise<{ goalId: number; payload: GoalCreatePayload }> {
  const validated = await validateGoalCreate(ctx, payload);
  const [inserted] = await db.insert(financialGoals).values({
    userId: ctx.userId,
    userType: ctx.userType,
    title: validated.title,
    description: validated.description || null,
    targetAmount: validated.targetAmount?.toString(),
    targetDate: validated.targetDate ? new Date(validated.targetDate) : null,
    status: "active",
  });
  await invalidateFinanceUserCache(ctx.userId, ctx.userType);

  return {
    goalId: Number((inserted as any)?.insertId || 0),
    payload: validated,
  };
}
