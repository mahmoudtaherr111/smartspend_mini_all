import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../queries/connection";
import { businessDayRange } from "./app-time";
import {
  classificationLogs,
  localUsers,
  systemSettings,
  userAnalytics,
  users,
} from "../../db/schema";

export type PlanId = "free" | "pro" | "ultra";
export type UserType = "oauth" | "local";
export type AiUsageChannel =
  | "parse"
  | "speech"
  | "report"
  | "image"
  | "sms"
  | "goal";

export interface AiUsageUser {
  id: number;
  type: UserType;
  plan?: string;
}

export interface AiBudget {
  limit: number;
  used: number;
  remaining: number;
  plan: PlanId;
  perRequestMax: number;
}

/** Hard per-request token ceiling — prevents 10k+ spikes regardless of admin settings */
const HARD_REQUEST_TOKEN_CAP: Record<PlanId, Record<AiUsageChannel, number>> = {
  free: {
    parse: 1_500,
    speech: 2_000,
    report: 2_000,
    image: 0,
    sms: 800,
    goal: 500,
  },
  pro: {
    parse: 6_000,
    speech: 4_000,
    report: 8_000,
    image: 2_500,
    sms: 1_500,
    goal: 3_500,
  },
  ultra: {
    parse: 8_000,
    speech: 5_000,
    report: 10_000,
    image: 3_500,
    sms: 2_000,
    goal: 5_000,
  },
};

/** Max AI channel events per user per minute (abuse guard) */
const BURST_LIMIT_PER_MINUTE: Record<PlanId, number> = {
  free: 20,
  pro: 60,
  ultra: 100,
};

export function asPlan(plan: string | undefined): PlanId {
  return plan === "pro" || plan === "ultra" ? plan : "free";
}

export function parseSafeInt(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

import { getSystemSettings } from "./settings-cache";

export async function loadSystemConfig(): Promise<Record<string, string>> {
  return await getSystemSettings();
}

export function estimateTokensFromText(text: string): number {
  const compact = String(text || "").trim();
  if (!compact) return 0;
  // Arabic text uses ~1.5 chars per token (vs English ~4 chars per token)
  // due to multibyte Unicode encoding in LLM tokenizers.
  const arabicCharCount = (compact.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const nonArabicCharCount = compact.length - arabicCharCount;
  const arabicTokens = Math.ceil(arabicCharCount * 0.65);
  const nonArabicTokens = Math.ceil(nonArabicCharCount / 4);
  return arabicTokens + nonArabicTokens + Math.ceil(compact.split(/\s+/).length * 0.35);
}

function userLimitKey(user: AiUsageUser): string {
  return `user_token_limit_${user.type}_${user.id}`;
}

async function getStoredTokenUsage(user: AiUsageUser): Promise<number> {
  if (user.type === "oauth") {
    const [row] = await db
      .select({ tokens: users.aiTokensUsed })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return Number(row?.tokens || 0);
  }
  const [row] = await db
    .select({ tokens: localUsers.aiTokensUsed })
    .from(localUsers)
    .where(eq(localUsers.id, user.id))
    .limit(1);
  return Number(row?.tokens || 0);
}

export function resolvePlanTokenLimit(
  cfg: Record<string, string>,
  plan: PlanId,
): number {
  const defaults: Record<PlanId, number> = {
    free: 50_000,
    pro: 500_000,
    ultra: 2_000_000,
  };
  return parseSafeInt(cfg[`${plan}_token_limit`], defaults[plan]);
}

export function resolvePlanMaxPerRequest(
  cfg: Record<string, string>,
  plan: PlanId,
  channel: AiUsageChannel,
): number {
  if (channel === "report") {
    const defaults: Record<PlanId, number> = {
      free: 1_200,
      pro: 3_500,
      ultra: 8_192,
    };
    return parseSafeInt(cfg[`report_max_tokens_${plan}`], defaults[plan]);
  }
  if (channel === "image") {
    const defaults: Record<PlanId, number> = {
      free: 0,
      pro: 1_500,
      ultra: 2_500,
    };
    return parseSafeInt(cfg[`image_max_tokens_${plan}`], defaults[plan]);
  }
  if (channel === "goal") {
    const defaults: Record<PlanId, number> = {
      free: 300,
      pro: 1_800,
      ultra: 3_500,
    };
    return parseSafeInt(cfg[`goal_max_tokens_${plan}`], defaults[plan]);
  }
  const defaults: Record<PlanId, number> = {
    free: 384,
    pro: 1_024,
    ultra: 1_536,
  };
  return parseSafeInt(cfg[`${plan}_max_per_request`], defaults[plan]);
}

/** Apply admin cap + hard anti-spike ceiling */
export function capRequestOutputTokens(
  plan: PlanId,
  channel: AiUsageChannel,
  adminMax: number,
): number {
  const hard = HARD_REQUEST_TOKEN_CAP[plan][channel];
  if (hard <= 0) return 0;
  return Math.min(adminMax, hard);
}

export async function countBurstAiEvents(
  user: AiUsageUser,
  channel: AiUsageChannel,
  windowMs = 60_000,
): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(userAnalytics)
    .where(
      and(
        eq(userAnalytics.userId, user.id),
        eq(userAnalytics.userType, user.type),
        eq(userAnalytics.event, `ai_${channel}`),
        gte(userAnalytics.createdAt, since),
      ),
    );
  return Number(row?.count || 0);
}

export async function assertAiAbuseGuard(
  user: AiUsageUser,
  channel: AiUsageChannel,
): Promise<void> {
  const plan = asPlan(user.plan);
  const limit = BURST_LIMIT_PER_MINUTE[plan];
  const burst = await countBurstAiEvents(user, channel);
  if (burst >= limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "طلبات ذكاء اصطناعي سريعة جداً. انتظر دقيقة وحاول مرة أخرى.",
    });
  }
}

export async function getAiBudget(
  user: AiUsageUser,
  channel: AiUsageChannel,
  cfg?: Record<string, string>,
): Promise<AiBudget> {
  const plan = asPlan(user.plan);
  const config = cfg ?? (await loadSystemConfig());
  const overrideLimit = parseSafeInt(config[userLimitKey(user)], -1);
  const limit =
    overrideLimit >= 0 ? overrideLimit : resolvePlanTokenLimit(config, plan);
  const used = await getStoredTokenUsage(user);
  const remaining =
    limit > 0 ? Math.max(0, limit - used) : Number.MAX_SAFE_INTEGER;
  const adminMax = resolvePlanMaxPerRequest(config, plan, channel);
  return {
    limit,
    used,
    remaining,
    plan,
    perRequestMax: capRequestOutputTokens(plan, channel, adminMax),
  };
}

export function clampOutputTokens(
  perRequestMax: number,
  remaining: number,
  estimatedInputTokens = 0,
): number {
  if (remaining === Number.MAX_SAFE_INTEGER) return perRequestMax;
  const safeRemaining = Math.max(64, remaining - estimatedInputTokens - 64);
  return Math.max(64, Math.min(perRequestMax, safeRemaining));
}

export async function assertAiBudget(
  user: AiUsageUser,
  channel: AiUsageChannel,
  estimatedInputTokens = 0,
  cfg?: Record<string, string>,
): Promise<AiBudget> {
  await assertAiAbuseGuard(user, channel);
  const budget = await getAiBudget(user, channel, cfg);

  if (budget.limit === 0 || budget.perRequestMax === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذه الميزة غير مفعلة في خطتك الحالية.",
    });
  }

  const hardCap = HARD_REQUEST_TOKEN_CAP[budget.plan][channel];
  if (estimatedInputTokens > hardCap) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "حجم الطلب كبير جداً. قلّل النص أو الصورة وحاول مرة أخرى.",
    });
  }

  if (budget.remaining <= 0 || estimatedInputTokens > budget.remaining) {
    const upgradeTo = budget.plan === "free" ? "Pro" : "Ultra";
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `استهلكت حد الذكاء الاصطناعي المتاح (${budget.limit.toLocaleString()} توكن). الترقية إلى ${upgradeTo} تفتح حدًا أعلى.`,
    });
  }
  return budget;
}

export async function countDailyAiRequests(
  user: AiUsageUser,
  channel?: AiUsageChannel,
): Promise<number> {
  const today = businessDayRange().start;

  if (!channel || channel === "parse") {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(classificationLogs)
      .where(
        and(
          eq(classificationLogs.userId, user.id),
          eq(classificationLogs.userType, user.type),
          gte(classificationLogs.createdAt, today),
        ),
      );
    return Number(row?.count || 0);
  }

  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(userAnalytics)
    .where(
      and(
        eq(userAnalytics.userId, user.id),
        eq(userAnalytics.userType, user.type),
        eq(userAnalytics.event, `ai_${channel}`),
        gte(userAnalytics.createdAt, today),
      ),
    );
  return Number(row?.count || 0);
}

export async function recordAiUsageEvent(input: {
  userId: number;
  userType: UserType;
  channel: AiUsageChannel;
  model?: string;
  tokens: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!input.tokens || input.tokens <= 0) return;
  await db
    .insert(userAnalytics)
    .values({
      userId: input.userId,
      userType: input.userType,
      event: `ai_${input.channel}`,
      metadata: {
        tokens: input.tokens,
        model: input.model || null,
        ...(input.metadata || {}),
      },
    })
    .catch(() => {});
}
