import { describe, it, expect } from "vitest";
import { planNumber, isPlanFeatureEnabled, PLAN_NUMBER_DEFAULTS } from "@contracts/plan-features";

/**
 * Tier 2 - Boundary & Corner Cases: Plans & Entitlements Definition
 * Requirements: PLN-01, PLN-04, GAP-44
 */

describe("Tier 2 - Boundary & Corner Cases: Plans & Features Definition", () => {
  it("Test 1: planNumber handles non-numeric and negative values safely with defaults", () => {
    const corruptSettings = {
      goals_active_limit_free: "invalid_string",
      burst_limit_per_minute_pro: "-50",
      chatbot_daily_limit_free: "NaN",
    };

    expect(planNumber(corruptSettings, "free", "goals_active_limit")).toBe(
      PLAN_NUMBER_DEFAULTS.goals_active_limit.free
    );
    expect(planNumber(corruptSettings, "pro", "burst_limit_per_minute")).toBe(
      PLAN_NUMBER_DEFAULTS.burst_limit_per_minute.pro
    );
    expect(planNumber(corruptSettings, "free", "chatbot_daily_limit")).toBe(
      PLAN_NUMBER_DEFAULTS.chatbot_daily_limit.free
    );
  });

  it("Test 2: Unknown plan strings default safely to 'free' plan", () => {
    const settings = {};
    // Should treat "enterprise", "unknown", null, undefined as "free"
    expect(isPlanFeatureEnabled(settings, "unknown_plan", "receipts")).toBe(false);
    expect(isPlanFeatureEnabled(settings, null, "receipts")).toBe(false);
    expect(isPlanFeatureEnabled(settings, undefined, "receipts")).toBe(false);
  });

  it("Test 3: Zero limit represents unlimited feature access", () => {
    // 0 in PLAN_NUMBER_DEFAULTS represents unmetered/unlimited
    const settings = {};
    expect(planNumber(settings, "pro", "goals_active_limit")).toBe(0); // Pro has 0 = unlimited goals
    expect(planNumber(settings, "free", "goals_active_limit")).toBe(3); // Free has limit 3
  });

  it("Test 4: Referral code generation boundary handles minimum and maximum user ID formats", () => {
    const createReferralCode = (userId: string): string => {
      const sanitized = userId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const codePart = sanitized.length >= 4 ? sanitized.substring(0, 6) : "USER";
      return `SPEND_${codePart}`;
    };

    expect(createReferralCode("12")).toBe("SPEND_USER");
    expect(createReferralCode("usr_super_long_identifier_123456")).toBe("SPEND_USRSUP");
    expect(createReferralCode("")).toBe("SPEND_USER");
  });

  it("Test 5: Explicit feature overrides ('true' / 'false') in settings take precedence over defaults", () => {
    const overrideSettings = {
      feature_receipts_free: "true", // Admin enables receipts for Free users
      feature_pro_report_pro: "false", // Admin disables pro_report for Pro users
    };

    expect(isPlanFeatureEnabled(overrideSettings, "free", "receipts")).toBe(true);
    expect(isPlanFeatureEnabled(overrideSettings, "pro", "pro_report")).toBe(false);
  });
});
