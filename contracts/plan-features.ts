/**
 * What each plan may do, as settings the admin edits — one definition for the registry,
 * the server gates and the admin console.
 *
 * Before this file, several plan decisions lived in code: receipts, business mode, the
 * printable Pro report and the goal analysis were hard-wired to Pro and Ultra, the free
 * plan's three active goals and the per-minute burst guard were constants, and only Pro
 * users received the WhatsApp report. The defaults below are exactly those old values,
 * so adding the settings changes nothing until an admin changes one.
 */

export type PlanId = "free" | "pro" | "ultra";
export const PLAN_IDS: readonly PlanId[] = ["free", "pro", "ultra"];

export type PlanFeature =
  | "business"
  | "receipts"
  | "pro_report"
  | "goal_analysis"
  | "whatsapp_report";

/** On/off per plan. Setting key: `feature_<feature>_<plan>`, value "true" or "false". */
export const PLAN_FEATURE_DEFAULTS: Record<PlanFeature, Record<PlanId, boolean>> = {
  business: { free: false, pro: true, ultra: true },
  receipts: { free: false, pro: true, ultra: true },
  pro_report: { free: false, pro: true, ultra: true },
  goal_analysis: { free: false, pro: true, ultra: true },
  // Only Pro received it; Ultra was left out by the job's query, not by a decision.
  whatsapp_report: { free: false, pro: true, ultra: false },
};

/** Numbers per plan that had no setting. Setting key: `<name>_<plan>`. 0 means no limit. */
export const PLAN_NUMBER_DEFAULTS = {
  goals_active_limit: { free: 3, pro: 0, ultra: 0 },
  burst_limit_per_minute: { free: 20, pro: 60, ultra: 100 },
  chatbot_daily_limit: { free: 20, pro: 200, ultra: 999999 },
  chatbot_max_tokens: { free: 1000, pro: 3000, ultra: 5000 },
  image_max_tokens: { free: 0, pro: 1500, ultra: 2500 },
  goal_max_tokens: { free: 300, pro: 1800, ultra: 3500 },
  offline_limit: { free: 3, pro: 30, ultra: 30 },
} as const satisfies Record<string, Record<PlanId, number>>;

export type PlanNumber = keyof typeof PLAN_NUMBER_DEFAULTS;

export function asPlanId(plan: string | null | undefined): PlanId {
  return plan === "pro" || plan === "ultra" ? plan : "free";
}

export function planFeatureKey(feature: PlanFeature, plan: PlanId): string {
  return `feature_${feature}_${plan}`;
}

export function planNumberKey(name: PlanNumber, plan: PlanId): string {
  return `${name}_${plan}`;
}

export function isPlanFeatureEnabled(
  settings: Record<string, string | undefined>,
  plan: string | null | undefined,
  feature: PlanFeature,
): boolean {
  const id = asPlanId(plan);
  const raw = settings[planFeatureKey(feature, id)];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return PLAN_FEATURE_DEFAULTS[feature][id];
}

export function planNumber(
  settings: Record<string, string | undefined>,
  plan: string | null | undefined,
  name: PlanNumber,
): number {
  const id = asPlanId(plan);
  const parsed = Number.parseInt(String(settings[planNumberKey(name, id)] ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : PLAN_NUMBER_DEFAULTS[name][id];
}

/** Registry rows for every key above, with the defaults as strings. */
export function planSettingDefinitions(): Array<{ key: string; default: string }> {
  const rows: Array<{ key: string; default: string }> = [];
  for (const feature of Object.keys(PLAN_FEATURE_DEFAULTS) as PlanFeature[]) {
    for (const plan of PLAN_IDS) {
      rows.push({ key: planFeatureKey(feature, plan), default: String(PLAN_FEATURE_DEFAULTS[feature][plan]) });
    }
  }
  for (const name of Object.keys(PLAN_NUMBER_DEFAULTS) as PlanNumber[]) {
    for (const plan of PLAN_IDS) {
      rows.push({ key: planNumberKey(name, plan), default: String(PLAN_NUMBER_DEFAULTS[name][plan]) });
    }
  }
  return rows;
}

/** Arabic labels the console and the plans page share. */
export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  business: "وضع البيزنس",
  receipts: "قراءة الإيصالات بالصور",
  pro_report: "تقرير Pro للطباعة",
  goal_analysis: "تحليل الأهداف بالذكاء الاصطناعي",
  whatsapp_report: "التقرير الشهري على واتساب",
};
