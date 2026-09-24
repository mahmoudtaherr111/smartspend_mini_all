import { describe, expect, it } from "vitest";
import {
  PLAN_IDS,
  isPlanFeatureEnabled,
  planFeatureKey,
  planNumber,
  planSettingDefinitions,
} from "../../contracts/plan-features";
import { SETTING_KEYS, settingDefaults } from "./system-settings-registry";
import { buildPlanCatalog } from "./plan-catalog";

describe("plan features as admin settings", () => {
  it("keeps the behaviour that was hard-coded before, until an admin changes it", () => {
    const none = {};
    for (const feature of ["business", "receipts", "pro_report", "goal_analysis"] as const) {
      expect(isPlanFeatureEnabled(none, "free", feature)).toBe(false);
      expect(isPlanFeatureEnabled(none, "pro", feature)).toBe(true);
      expect(isPlanFeatureEnabled(none, "ultra", feature)).toBe(true);
    }
    expect(isPlanFeatureEnabled(none, "pro", "whatsapp_report")).toBe(true);
    expect(isPlanFeatureEnabled(none, "ultra", "whatsapp_report")).toBe(false);
    expect(planNumber(none, "free", "goals_active_limit")).toBe(3);
    expect(planNumber(none, "pro", "goals_active_limit")).toBe(0);
    expect(planNumber(none, "free", "burst_limit_per_minute")).toBe(20);
    expect(planNumber(none, "ultra", "offline_limit")).toBe(30);
  });

  it("obeys the admin's switch and number", () => {
    const settings = { [planFeatureKey("receipts", "free")]: "true", goals_active_limit_free: "5" };
    expect(isPlanFeatureEnabled(settings, "free", "receipts")).toBe(true);
    expect(planNumber(settings, "free", "goals_active_limit")).toBe(5);
    // An unknown plan is treated as free, never as paid.
    expect(isPlanFeatureEnabled({}, "gold", "business")).toBe(false);
  });

  it("makes every per-plan key saveable from the console", () => {
    for (const { key } of planSettingDefinitions()) {
      expect(SETTING_KEYS.has(key), `${key} must be in the registry`).toBe(true);
    }
    // The chat switches and limits were rendered per plan and silently dropped on save.
    for (const plan of PLAN_IDS) {
      for (const key of [`chatbot_enabled_${plan}`, `chatbot_daily_limit_${plan}`, `chatbot_max_tokens_${plan}`]) {
        expect(SETTING_KEYS.has(key), `${key} must be saveable`).toBe(true);
      }
      for (const key of [`${plan}_daily_limit`, `${plan}_token_limit`, `voice_limit_${plan}`,
        `sms_limit_${plan}`, `offline_limit_${plan}`, `report_limit_${plan}`]) {
        expect(SETTING_KEYS.has(key), `${key} must be saveable for ${plan}`).toBe(true);
      }
    }
  });
});

describe("the plans screen", () => {
  it("shows the limits the server enforces, not fixed text", () => {
    const catalog = buildPlanCatalog({});
    const value = (plan: "free" | "pro" | "ultra", key: string) =>
      catalog[plan].find((row) => row.key === key)?.value;
    expect(value("free", "daily_entries")).toBe(`${settingDefaults().free_daily_limit} في اليوم`);
    expect(value("pro", "daily_entries")).toBe("100 في اليوم");
    expect(value("free", "receipts")).toBe(false);
    expect(value("pro", "receipts")).toBe(true);
    expect(value("free", "bank_messages")).toBe("5 رسالة في الشهر");
    expect(value("pro", "bank_messages")).toBe("بدون حد");
  });

  it("follows an admin change", () => {
    const catalog = buildPlanCatalog({ free_daily_limit: "25", feature_business_free: "true" });
    expect(catalog.free.find((row) => row.key === "daily_entries")?.value).toBe("25 في اليوم");
    expect(catalog.free.find((row) => row.key === "business")?.value).toBe(true);
  });
});
