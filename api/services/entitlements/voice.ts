/**
 * What a user may do with the live voice call, in one typed object — the only place the call reads plan limits.
 *
 * Today the values come from system settings (`api/lib/system-settings-registry.ts`); the pricing rebuild will
 * swap this function's source for plan entitlements without the call changing. Usage is counted in the Cairo
 * business month from `voice_calls` (plus any `voice_usage` rows the retired first call wrote that month), never
 * from the seconds spent dictating expenses. The admin's kill switch stops every call.
 */
import { createHash } from "crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { voiceCalls, voiceUsage } from "../../../db/schema";
import { businessDateKey, startOfBusinessDay } from "../../lib/app-time";
import { getSystemSettings } from "../../lib/settings-cache";
import { settingDefaults } from "../../lib/system-settings-registry";
import { db } from "../../queries/connection";

export type VoicePlan = "free" | "pro" | "ultra";
export type ThinkingLevel = "low" | "medium" | "high";
/** The call's two modes: the plan's Live model, or "Ultra Thinking" on the extended-thinking model. */
export type VoiceMode = "standard" | "ultra";

export interface VoiceModeConfig {
  model: string;
  thinkingLevel: ThinkingLevel;
}

export interface VoiceEntitlementUser {
  id: number;
  type: "oauth" | "local";
  plan: string | null | undefined;
  role: string | null | undefined;
}

export interface VoiceUsage {
  usedSecondsThisMonth: number;
  spentTodayUsd: number;
}

export interface VoiceEntitlements {
  plan: VoicePlan;
  month: string;
  /** The plan may use the live call at all. */
  enabled: boolean;
  killSwitch: boolean;
  minutesPerMonth: number;
  maxCallSeconds: number;
  usedSecondsThisMonth: number;
  remainingSecondsThisMonth: number;
  /** How long the next call may last: the smaller of the per-call limit and what the month has left. */
  allowedCallSeconds: number;
  /** The standard mode's model and level: the plan's Live model. */
  model: string;
  thinkingLevel: ThinkingLevel;
  /**
   * The user gets the coach call: its instructions and tools (`voice_coach_allowlist`, then a stable hash against
   * `voice_coach_rollout_percent`), in the standard mode on the plan's model.
   */
  coach: boolean;
  /**
   * "Ultra Thinking", the mode the user can switch a coach call into: the coach on `voice_coach_model` at
   * `voice_coach_thinking_level`, offered only to coach users of plans the admin enabled (`voice_ultra_enabled_<plan>`).
   * Null when not offered.
   */
  ultra: VoiceModeConfig | null;
  dailyCostCapUsd: number;
  spentTodayUsd: number;
  /** Why the user cannot start a call now, or null when they can. */
  blockedReason: "disabled" | "kill_switch" | "month_used" | "daily_cost_cap" | null;
}

function plan(value: string | null | undefined): VoicePlan {
  return value === "pro" || value === "ultra" ? value : "free";
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function level(value: string | undefined, fallback: ThinkingLevel): ThinkingLevel {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

/** A user's place in the rollout, 0-99, the same on every server and every call. */
export function coachBucket(user: Pick<VoiceEntitlementUser, "id" | "type">): number {
  return createHash("sha256").update(`voice_coach:${user.type}:${user.id}`).digest().readUInt32BE(0) % 100;
}

/** On the allowlist, or inside the rollout percent. */
export function inCoachRollout(user: Pick<VoiceEntitlementUser, "id" | "type">, settings: Record<string, string>): boolean {
  const allowlist = String(settings.voice_coach_allowlist ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.includes(`${user.type}:${user.id}`)) return true;
  const percent = Math.min(100, Math.max(0, Number.parseInt(String(settings.voice_coach_rollout_percent ?? "0"), 10) || 0));
  return percent > 0 && coachBucket(user) < percent;
}

/** The pure rule: settings and usage in, entitlements out. */
export function resolveVoiceEntitlements(
  user: VoiceEntitlementUser,
  settings: Record<string, string>,
  usage: VoiceUsage,
  month: string,
): VoiceEntitlements {
  const merged = { ...settingDefaults(), ...settings };
  const p = plan(user.plan);
  const enabled = merged[`voice_call_enabled_${p}`] === "true";
  const killSwitch = merged.voice_v2_kill_switch === "true";

  const minutesPerMonth = nonNegativeInt(merged[`voice_call_limit_${p}`], 0);
  const maxCallSeconds = nonNegativeInt(merged[`voice_call_duration_${p}`], 60);
  const used = Math.max(0, Math.round(usage.usedSecondsThisMonth));
  const remaining = Math.max(0, minutesPerMonth * 60 - used);
  const dailyCostCapUsd = nonNegativeNumber(merged[`voice_daily_cost_cap_usd_${p}`], 0);
  const coach = inCoachRollout(user, merged);
  const thinkingLevel = level(merged.voice_v2_thinking_level, "low");
  const model = (merged[`voice_v2_model_${p}`] || merged.voice_v2_model || "gemini-3.8-live").trim();
  // Ultra Thinking keeps its own model and level: never quietly swapped for the standard model to save cost.
  const ultra: VoiceModeConfig | null = coach && merged[`voice_ultra_enabled_${p}`] === "true"
    ? { model: (merged.voice_coach_model || "gemini-3.8-live-extended-thinking").trim(), thinkingLevel: level(merged.voice_coach_thinking_level, "low") }
    : null;

  let blockedReason: VoiceEntitlements["blockedReason"] = null;
  if (!enabled) blockedReason = "disabled";
  else if (killSwitch) blockedReason = "kill_switch";
  else if (remaining <= 0) blockedReason = "month_used";
  else if (dailyCostCapUsd > 0 && usage.spentTodayUsd >= dailyCostCapUsd) blockedReason = "daily_cost_cap";

  return {
    plan: p,
    month,
    enabled,
    killSwitch,
    minutesPerMonth,
    maxCallSeconds,
    usedSecondsThisMonth: used,
    remainingSecondsThisMonth: remaining,
    allowedCallSeconds: Math.min(maxCallSeconds, remaining),
    model,
    thinkingLevel,
    coach,
    ultra,
    dailyCostCapUsd,
    spentTodayUsd: usage.spentTodayUsd,
    blockedReason,
  };
}

/** The Cairo business month, "YYYY-MM". */
export function voiceMonth(at = new Date()): string {
  return businessDateKey(at).slice(0, 7);
}

async function loadVoiceUsage(user: VoiceEntitlementUser, month: string, now: Date): Promise<VoiceUsage> {
  const [calls, legacy, today] = await Promise.all([
    db
      .select({ seconds: sql<string>`coalesce(sum(${voiceCalls.billedSeconds}), 0)` })
      .from(voiceCalls)
      .where(and(eq(voiceCalls.userId, user.id), eq(voiceCalls.userType, user.type), eq(voiceCalls.month, month))),
    // The old call still writes here until the new one has fully replaced it; dictation rows are not counted.
    db
      .select({ seconds: sql<string>`coalesce(sum(${voiceUsage.durationSeconds}), 0)` })
      .from(voiceUsage)
      .where(
        and(
          eq(voiceUsage.userId, user.id),
          eq(voiceUsage.userType, user.type),
          eq(voiceUsage.month, month),
          eq(voiceUsage.source, "gemini_voice_call"),
        ),
      ),
    db
      .select({ usd: sql<string>`coalesce(sum(${voiceCalls.costUsd}), 0)` })
      .from(voiceCalls)
      .where(
        and(
          eq(voiceCalls.userId, user.id),
          eq(voiceCalls.userType, user.type),
          gte(voiceCalls.startedAt, startOfBusinessDay(now)),
        ),
      ),
  ]);
  return {
    usedSecondsThisMonth: Number(calls[0]?.seconds ?? 0) + Number(legacy[0]?.seconds ?? 0),
    spentTodayUsd: Number(today[0]?.usd ?? 0),
  };
}

export async function getVoiceEntitlements(user: VoiceEntitlementUser, now = new Date()): Promise<VoiceEntitlements> {
  const month = voiceMonth(now);
  const [settings, usage] = await Promise.all([getSystemSettings(), loadVoiceUsage(user, month, now)]);
  return resolveVoiceEntitlements(user, settings, usage, month);
}
