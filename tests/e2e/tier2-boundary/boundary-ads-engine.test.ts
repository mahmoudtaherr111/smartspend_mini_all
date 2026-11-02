import { describe, it, expect, beforeEach } from "vitest";
import { AdsEngine, AdCampaign } from "../harness/opaque-context";

/**
 * Tier 2 - Boundary & Corner Cases: Ads Engine & Impressions
 * Requirements: ADS-01, ADS-02, BUG-06
 */

describe("Tier 2 - Boundary & Corner Cases: Ads Engine", () => {
  let engine: AdsEngine;
  const now = 1730000000000;

  beforeEach(() => {
    engine = new AdsEngine();
  });

  it("Test 1: Zero active campaigns returns empty array gracefully without exceptions", () => {
    const ads = engine.getActiveAds({
      platform: "android",
      placement: "home_feed",
      userPlan: "free",
      userId: "usr_no_ads",
      now,
    });
    expect(ads).toEqual([]);
  });

  it("Test 2: Schedule time boundaries at exactly startAt and endAt", () => {
    const startAt = 1000000;
    const endAt = 2000000;
    const campaign: AdCampaign = {
      id: "ad_timing_test",
      title: "Timing Test",
      placement: "home_feed",
      platformTarget: "all",
      planTarget: "all",
      frequencyCapPerDay: 10,
      isKillSwitched: false,
      startAt,
      endAt,
    };
    engine.addCampaign(campaign);

    // 1ms before startAt -> Not active
    expect(engine.getActiveAds({ platform: "android", placement: "home_feed", userPlan: "free", userId: "u1", now: startAt - 1 }).length).toBe(0);
    // At startAt -> Active
    expect(engine.getActiveAds({ platform: "android", placement: "home_feed", userPlan: "free", userId: "u1", now: startAt }).length).toBe(1);
    // At endAt -> Active
    expect(engine.getActiveAds({ platform: "android", placement: "home_feed", userPlan: "free", userId: "u1", now: endAt }).length).toBe(1);
    // 1ms after endAt -> Not active
    expect(engine.getActiveAds({ platform: "android", placement: "home_feed", userPlan: "free", userId: "u1", now: endAt + 1 }).length).toBe(0);
  });

  it("Test 3: Frequency cap of 0 represents unlimited impressions per day", () => {
    const unmeteredAd: AdCampaign = {
      id: "ad_unmetered",
      title: "Unmetered Ad",
      placement: "category_view",
      platformTarget: "all",
      planTarget: "all",
      frequencyCapPerDay: 0, // 0 = unlimited
      isKillSwitched: false,
      startAt: now - 1000,
      endAt: now + 10000,
    };
    engine.addCampaign(unmeteredAd);

    // Record 50 impressions
    for (let i = 0; i < 50; i++) {
      engine.recordImpression({
        adId: "ad_unmetered",
        userId: "usr_unmetered",
        placement: "category_view",
        impressionToken: `tok_${i}`,
        now,
      });
    }

    const ads = engine.getActiveAds({
      platform: "web",
      placement: "category_view",
      userPlan: "free",
      userId: "usr_unmetered",
      now,
    });
    expect(ads.length).toBe(1);
  });

  it("Test 4: Impression recording with empty or whitespace-only token fails with error", () => {
    const resEmpty = engine.recordImpression({
      adId: "ad_1",
      userId: "u1",
      placement: "home_feed",
      impressionToken: "",
    });
    expect(resEmpty.recorded).toBe(false);
    expect(resEmpty.error).toBe("MISSING_IMPRESSION_TOKEN");
  });

  it("Test 5: Platform filter rejects mismatched platforms", () => {
    const iosOnlyAd: AdCampaign = {
      id: "ad_ios_only",
      title: "iOS Exclusive",
      placement: "home_feed",
      platformTarget: "ios",
      planTarget: "all",
      frequencyCapPerDay: 5,
      isKillSwitched: false,
      startAt: now - 1000,
      endAt: now + 1000,
    };
    engine.addCampaign(iosOnlyAd);

    expect(engine.getActiveAds({ platform: "ios", placement: "home_feed", userPlan: "free", userId: "u1", now }).length).toBe(1);
    expect(engine.getActiveAds({ platform: "android", placement: "home_feed", userPlan: "free", userId: "u1", now }).length).toBe(0);
    expect(engine.getActiveAds({ platform: "web", placement: "home_feed", userPlan: "free", userId: "u1", now }).length).toBe(0);
  });
});
