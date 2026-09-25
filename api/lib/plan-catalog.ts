/**
 * What each plan includes, read from the same settings the server enforces, so the
 * plans screen can never promise more than the limits allow.
 *
 * The screen used to list fixed text — "10 طلبات/يوم" for Free, "استخدام AI غير محدود",
 * "تصدير Excel" and "تبديل نماذج AI" for the paid plans — none of which matched the
 * limits (Pro is 100 entries a day and a token budget), the export screen or any model
 * switch. Every row here comes from a setting the admin edits in the console.
 */
import { settingDefaults } from "./system-settings-registry";
import {
  PLAN_FEATURE_LABELS,
  PLAN_IDS,
  isPlanFeatureEnabled,
  planNumber,
  type PlanFeature,
  type PlanId,
} from "../../contracts/plan-features";

/** A value at or above this reads as "no limit" (the settings use 999999 for it). */
const NO_LIMIT = 999_999;

export interface PlanCatalogRow {
  key: string;
  label: string;
  /** false: not included. true: included. A string: included, with this amount. */
  value: boolean | string;
}

function count(value: number, unit: string): string {
  if (value >= NO_LIMIT) return "بدون حد";
  return `${value.toLocaleString("en-US")} ${unit}`;
}

function intSetting(settings: Record<string, string>, key: string): number {
  const parsed = Number.parseInt(String(settings[key] ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildPlanCatalogEntry(
  stored: Record<string, string>,
  plan: PlanId,
): PlanCatalogRow[] {
  // The stored values over the registry defaults: the same numbers the server applies.
  const settings: Record<string, string> = { ...settingDefaults(), ...stored };
  const rows: PlanCatalogRow[] = [];

  const parseOn = settings[`${plan}_ai_parse`] !== "false";
  rows.push({
    key: "daily_entries",
    label: "تسجيل ذكي بالكلام",
    value: parseOn ? `${count(intSetting(settings, `${plan}_daily_limit`), "في اليوم")}` : false,
  });
  rows.push({
    key: "ai_tokens",
    label: "رصيد الذكاء الاصطناعي",
    value: `${count(intSetting(settings, `${plan}_token_limit`), "توكن في الشهر")}`,
  });

  const voiceMonthly = intSetting(settings, `voice_limit_${plan}`);
  rows.push({
    key: "voice",
    label: "التسجيل الصوتي",
    value: voiceMonthly <= 0 ? "بدون حد" : `${Math.round(voiceMonthly / 60)} دقيقة في الشهر`,
  });

  rows.push({
    key: "bank_messages",
    label: "رسايل البنك والمحافظ",
    value: count(intSetting(settings, `sms_limit_${plan}`), "رسالة في الشهر"),
  });

  const chatOn = settings[`chatbot_enabled_${plan}`] !== "false";
  rows.push({
    key: "chat",
    label: "الشات مع المساعد",
    value: chatOn ? count(planNumber(settings, plan, "chatbot_daily_limit"), "رسالة في اليوم") : false,
  });

  const callOn = settings[`voice_call_enabled_${plan}`] !== "false";
  rows.push({
    key: "voice_call",
    label: "مكالمة مع المساعد",
    value: callOn ? count(intSetting(settings, `voice_call_limit_${plan}`), "دقيقة في الشهر") : false,
  });

  const analysisOn = settings[`${plan}_ai_analysis`] !== "false";
  const everyDays = intSetting(settings, `report_limit_${plan}`);
  rows.push({
    key: "monthly_analysis",
    label: "التحليل الشهري بالذكاء الاصطناعي",
    value: analysisOn ? (everyDays > 1 ? `مرة كل ${everyDays} يوم` : true) : false,
  });

  const goals = planNumber(settings, plan, "goals_active_limit");
  rows.push({
    key: "goals",
    label: "الأهداف المالية النشطة",
    value: goals === 0 ? "بدون حد" : `${goals} أهداف`,
  });

  for (const feature of Object.keys(PLAN_FEATURE_LABELS) as PlanFeature[]) {
    rows.push({
      key: feature,
      label: PLAN_FEATURE_LABELS[feature],
      value: isPlanFeatureEnabled(settings, plan, feature),
    });
  }
  return rows;
}

export function buildPlanCatalog(stored: Record<string, string>): Record<PlanId, PlanCatalogRow[]> {
  return Object.fromEntries(
    PLAN_IDS.map((plan) => [plan, buildPlanCatalogEntry(stored, plan)]),
  ) as Record<PlanId, PlanCatalogRow[]>;
}
