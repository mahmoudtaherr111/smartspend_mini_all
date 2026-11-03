import { TRPCError } from "@trpc/server";
import { ledgerTotalCostUsdSince } from "./ai-ledger";
import { startOfBusinessDay } from "./app-time";
import { createLogger } from "./log";
import { getSystemSettings } from "./settings-cache";
import { settingDefaults } from "./system-settings-registry";

const log = createLogger("feature-switches");

/** What an admin can stop for everyone without a deployment, each named as the app knows it. */
export const AI_SWITCHES = ["parse", "chat", "speech", "image", "report", "goal", "business"] as const;
export type AiSwitch = (typeof AI_SWITCHES)[number];

/** How long one process trusts its reading of the day's cost: the cap needs no query per request. */
const COST_READING_MS = 60_000;

let costReading: { usd: number; at: number; day: number } | null = null;

export function aiSwitchKey(name: AiSwitch): string {
  return `ai_off_${name}`;
}

export function aiSwitchesOff(settings: Record<string, string>): AiSwitch[] {
  return AI_SWITCHES.filter((name) => settings[aiSwitchKey(name)] === "true");
}

/** Refuses when an admin stopped [name], in words a person can act on. */
export async function assertAiSwitchOn(name: AiSwitch, settings?: Record<string, string>): Promise<void> {
  const config = settings ?? (await getSystemSettings());
  if (config[aiSwitchKey(name)] === "true") {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "الميزة دي متوقفة مؤقتًا. جرّب تاني بعد شوية.",
    });
  }
}

/**
 * The ceiling on what all AI costs in a Cairo day, across users (`ai_daily_cost_cap_usd`, 0 means none): a bug or an
 * abuser costs at most one day's cap. Past it AI stops until midnight and the ledger keeps working by hand. A failed
 * reading lets the call through: the per-user budgets still hold, and the app must not stop because of this check.
 */
export async function assertDailyAiCost(settings?: Record<string, string>): Promise<void> {
  const config = settings ?? (await getSystemSettings());
  const capUsd = dailyAiCapUsd(config);
  if (capUsd <= 0) return;

  const now = Date.now();
  const dayStart = startOfBusinessDay(new Date(now));
  try {
    if (!costReading || costReading.day !== dayStart.getTime() || now - costReading.at > COST_READING_MS) {
      costReading = { usd: await ledgerTotalCostUsdSince(dayStart), at: now, day: dayStart.getTime() };
    }
  } catch (error) {
    log.warn({ err: error, event: "ai.daily_cost_unread" }, "Could not read the day's AI cost");
    return;
  }
  if (costReading.usd >= capUsd) {
    log.error({ event: "ai.daily_cost_cap_reached", capUsd, usd: costReading.usd }, "Daily AI cost cap reached");
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "المساعد واخد راحة النهارده. سجّل مصاريفك يدوي، وهيرجع بكره.",
    });
  }
}

/** The day's ceiling in USD: the admin's value, or the registry's default when none was ever saved. 0 means none. */
export function dailyAiCapUsd(settings: Record<string, string>): number {
  return Number(settings.ai_daily_cost_cap_usd ?? settingDefaults().ai_daily_cost_cap_usd) || 0;
}

/** For tests. */
export function forgetDailyCostReading(): void {
  costReading = null;
}
