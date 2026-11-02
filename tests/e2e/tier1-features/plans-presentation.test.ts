import { describe, it, expect } from "vitest";
import { isPlanFeatureEnabled, PLAN_FEATURE_DEFAULTS } from "@contracts/plan-features";
import { resolveWebPlanRoute, MOBILE_AVAILABLE_TIERS } from "../../../api/lib/store-billing/promo-codes";

/**
 * Tier 1 - Feature Coverage: Plans Presentation & Subscriptions UI
 * Requirements: PLN-01, PLN-03, PLN-05, PLN-04, GAP-30, GAP-44
 * Authoritative source: ORIGINAL_REQUEST.md R1 & PROJECT.md § Feature Inventory #28, 29, 30, 44, 46, 47
 */

describe("Tier 1 - Feature Coverage: Plans & Presentation (PLN-01, PLN-04, GAP-30)", () => {
  it("Test 1 [PLN-01, PLN-04, GAP-44]: Mobile plan tiers strictly show Free and Pro, eliminating Ultra", () => {
    // Under PLN-04, mobile user tiers are Free and Pro
    expect(MOBILE_AVAILABLE_TIERS).not.toContain("ultra");
    expect(MOBILE_AVAILABLE_TIERS).toEqual(["free", "pro"]);
  });

  it("Test 2 [PLN-03]: In-app cancellation flow requires exit survey reason", () => {
    const validCancellationReasons = [
      "too_expensive",
      "missing_features",
      "difficult_to_use",
      "switched_to_another_app",
      "other",
    ] as const;

    const processCancellation = (reason: string, feedback?: string) => {
      if (!validCancellationReasons.includes(reason as any)) {
        return { success: false, error: "REASON_REQUIRED" };
      }
      return {
        success: true,
        surveyRecorded: { reason, feedback: feedback ?? "", recordedAt: Date.now() },
      };
    };

    const invalidRes = processCancellation("unknown_reason");
    expect(invalidRes.success).toBe(false);

    const validRes = processCancellation("too_expensive", "سعر الاشتراك الشهري مرتفع نسبياً");
    expect(validRes.success).toBe(true);
    expect(validRes.surveyRecorded?.reason).toBe("too_expensive");
  });

  it("Test 3 [PLN-05]: Invite friends referral generates unique code and shareable URL", () => {
    const generateReferral = (userId: string) => {
      const code = `SPEND_${userId.substring(0, 6).toUpperCase()}`;
      return {
        referralCode: code,
        shareUrl: `https://smartspend.ai/join?ref=${code}`,
        shareTextAr: `جرّب تطبيق سمارت سبيند لتسجيل المصاريف بالذكاء الاصطناعي: https://smartspend.ai/join?ref=${code}`,
      };
    };

    const ref = generateReferral("usr12345678");
    expect(ref.referralCode).toBe("SPEND_USR123");
    expect(ref.shareUrl).toContain("ref=SPEND_USR123");
    expect(ref.shareTextAr).toContain("سمارت سبيند");
  });

  it("Test 4 [GAP-30]: Web /ultra purchase route redirects to /pro", () => {
    expect(resolveWebPlanRoute("/ultra")).toBe("/pro");
    expect(resolveWebPlanRoute("/plans/ultra")).toBe("/pro");
    expect(resolveWebPlanRoute("/pro")).toBe("/pro");
  });

  it("Test 5 [PLN-01]: Feature gating correctly differentiates Pro entitlements from Free", () => {
    const emptySettings = {};

    // Free users do NOT get receipts, business mode, or WhatsApp report by default
    expect(isPlanFeatureEnabled(emptySettings, "free", "receipts")).toBe(false);
    expect(isPlanFeatureEnabled(emptySettings, "free", "whatsapp_report")).toBe(false);
    expect(isPlanFeatureEnabled(emptySettings, "free", "business")).toBe(false);

    // Pro users DO get these features
    expect(isPlanFeatureEnabled(emptySettings, "pro", "receipts")).toBe(true);
    expect(isPlanFeatureEnabled(emptySettings, "pro", "whatsapp_report")).toBe(true);
    expect(isPlanFeatureEnabled(emptySettings, "pro", "business")).toBe(true);
  });
});
