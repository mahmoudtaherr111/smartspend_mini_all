import { describe, it, expect, beforeEach } from "vitest";
import { AdsEngine, AdCampaign } from "../harness/opaque-context";

/**
 * Tier 1 - Feature Coverage: Sponsored Ads Engine & Impression Tracking
 * Requirements: ADS-01, ADS-02, BUG-06
 * Authoritative source: ORIGINAL_REQUEST.md R4 & PROJECT.md § Interface Contracts #4
 */

describe("Tier 1 - Feature Coverage: Ads Engine & Impression Tracking (ADS-01, ADS-02, BUG-06)", () => {
  let adsEngine: AdsEngine;
  const now = 1730000000000;

  beforeEach(() => {
    adsEngine = new AdsEngine();
    const sampleCampaign: AdCampaign = {
      id: "ad_bank_promo_01",
      title: "بطاقة البنك الأهلي الائتمانية",
      placement: "home_feed",
      platformTarget: "all",
      planTarget: "free_only",
      frequencyCapPerDay: 3,
      isKillSwitched: false,
      startAt: now - 3600000,
      endAt: now + 86400000,
    };
    adsEngine.addCampaign(sampleCampaign);
  });

  it("Test 1 [ADS-01]: Query active ads returns campaign matching placement and platform", () => {
    const ads = adsEngine.getActiveAds({
      platform: "android",
      placement: "home_feed",
      userPlan: "free",
      userId: "usr_free_01",
      now,
    });

    expect(ads.length).toBe(1);
    expect(ads[0].id).toBe("ad_bank_promo_01");
  });

  it("Test 2 [ADS-01]: Ads with planTarget=free_only are withheld from Pro subscribers", () => {
    const ads = adsEngine.getActiveAds({
      platform: "android",
      placement: "home_feed",
      userPlan: "pro", // Pro user
      userId: "usr_pro_01",
      now,
    });

    expect(ads.length).toBe(0);
  });

  it("Test 3 [ADS-01]: Kill switch suppresses ad immediately across all platforms", () => {
    const killSwitchedAd: AdCampaign = {
      id: "ad_promo_killed",
      title: "عرض مؤقت",
      placement: "reports_banner",
      platformTarget: "all",
      planTarget: "all",
      frequencyCapPerDay: 5,
      isKillSwitched: true, // Kill-switched
      startAt: now - 1000,
      endAt: now + 10000,
    };
    adsEngine.addCampaign(killSwitchedAd);

    const ads = adsEngine.getActiveAds({
      platform: "ios",
      placement: "reports_banner",
      userPlan: "free",
      userId: "usr_free_02",
      now,
    });

    expect(ads.length).toBe(0);
  });

  it("Test 4 [ADS-01]: Frequency capping halts serving ad when user exceeds daily cap", () => {
    const userId = "usr_freq_capped";

    // Record 3 impressions for user (daily cap is 3)
    adsEngine.recordImpression({ adId: "ad_bank_promo_01", userId, placement: "home_feed", impressionToken: "tok_1", now });
    adsEngine.recordImpression({ adId: "ad_bank_promo_01", userId, placement: "home_feed", impressionToken: "tok_2", now });
    adsEngine.recordImpression({ adId: "ad_bank_promo_01", userId, placement: "home_feed", impressionToken: "tok_3", now });

    const ads = adsEngine.getActiveAds({
      platform: "android",
      placement: "home_feed",
      userPlan: "free",
      userId,
      now,
    });

    expect(ads.length).toBe(0);
  });

  it("Test 5 [BUG-06]: Impression token prevents duplicate counting of same card view", () => {
    const res1 = adsEngine.recordImpression({
      adId: "ad_bank_promo_01",
      userId: "usr_10",
      placement: "home_feed",
      impressionToken: "unique_token_view_01",
      now,
    });
    expect(res1.recorded).toBe(true);

    const res2 = adsEngine.recordImpression({
      adId: "ad_bank_promo_01",
      userId: "usr_10",
      placement: "home_feed",
      impressionToken: "unique_token_view_01", // Duplicate token
      now,
    });
    expect(res2.recorded).toBe(false);
    expect(res2.error).toBe("DUPLICATE_IMPRESSION_IGNORED");

    expect(adsEngine.getImpressionsCount("ad_bank_promo_01")).toBe(1);
  });

  it("Test 6 [ADS-01]: Ads outside schedule window are suppressed", () => {
    const futureAd: AdCampaign = {
      id: "ad_future",
      title: "عرض قادم",
      placement: "category_view",
      platformTarget: "all",
      planTarget: "all",
      frequencyCapPerDay: 1,
      isKillSwitched: false,
      startAt: now + 50000, // Starts in the future
      endAt: now + 100000,
    };
    adsEngine.addCampaign(futureAd);

    const ads = adsEngine.getActiveAds({
      platform: "web",
      placement: "category_view",
      userPlan: "free",
      userId: "usr_11",
      now,
    });

    expect(ads.length).toBe(0);
  });
});
