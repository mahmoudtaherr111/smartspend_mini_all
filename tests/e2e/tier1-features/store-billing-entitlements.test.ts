import { describe, it, expect, beforeEach } from "vitest";
import { EntitlementStateMachine } from "../../../api/lib/store-billing/entitlement-state-machine";
import { validatePromotionalCode } from "../../../api/lib/store-billing/promo-codes";
import { GOOGLE_PLAY_FIXTURES, GOOGLE_PLAY_NOTIFICATION_TYPES, decodePubSubData } from "../fixtures/google-play-rtdn.fixture";
import { APPLE_ASN_FIXTURES, decodeMockJWS, AppleASNServerNotificationV2Payload } from "../fixtures/apple-asn-v2.fixture";

/**
 * Tier 1 - Feature Coverage: Store Billing & Entitlement State Machine
 * Requirements: PLN-09, PLN-07, PLN-08, PLN-02, BUG-07
 * Authoritative source: ORIGINAL_REQUEST.md R2 & PROJECT.md § Interface Contracts #2
 */

describe("Tier 1 - Feature Coverage: Store Billing & Entitlements (PLN-09, PLN-07, PLN-08)", () => {
  let sm: EntitlementStateMachine;
  const userId = "usr_billing_001";
  const userType = "local";

  beforeEach(() => {
    sm = new EntitlementStateMachine();
  });

  it("Test 1 [PLN-07]: Google Play RTDN purchase payload grants Pro with ACTIVE state", () => {
    const rawPubSub = GOOGLE_PLAY_FIXTURES.purchase;
    const decoded = decodePubSubData(rawPubSub.message.data);

    expect(decoded.packageName).toBe("com.smartspend.app");
    expect(decoded.subscriptionNotification?.notificationType).toBe(
      GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_PURCHASED
    );

    const transition = sm.processStoreEvent({
      platform: "android",
      originalTxId: decoded.subscriptionNotification!.purchaseToken,
      tokenOrTxId: decoded.subscriptionNotification!.purchaseToken,
      productId: decoded.subscriptionNotification!.subscriptionId,
      userId,
      userType,
      eventType: "PURCHASE",
      eventTime: Number(decoded.eventTimeMillis),
    });

    expect(transition.success).toBe(true);
    expect(transition.state).toBe("ACTIVE");
    expect(transition.effectivePlan).toBe("pro");
  });

  it("Test 2 [PLN-08]: Apple ASN v2 INITIAL_BUY notification grants Pro with ACTIVE state", () => {
    const fixture = APPLE_ASN_FIXTURES.subscribed;
    const decodedJws = decodeMockJWS<AppleASNServerNotificationV2Payload>(fixture.envelope.signedPayload);

    expect(decodedJws.payload.notificationType).toBe("SUBSCRIBED");
    expect(decodedJws.payload.subtype).toBe("INITIAL_BUY");

    const transition = sm.processStoreEvent({
      platform: "ios",
      originalTxId: fixture.decodedTx.originalTransactionId,
      tokenOrTxId: fixture.decodedTx.transactionId,
      productId: fixture.decodedTx.productId,
      userId,
      userType,
      eventType: "PURCHASE",
      eventTime: fixture.decodedNotification.signedDate,
      expiresAt: fixture.decodedTx.expiresDate,
    });

    expect(transition.success).toBe(true);
    expect(transition.state).toBe("ACTIVE");
    expect(transition.effectivePlan).toBe("pro");
  });

  it("Test 3 [PLN-09]: Renewal event extends subscription while retaining ACTIVE Pro status", () => {
    const origTx = "orig_tx_renew_test";
    sm.processStoreEvent({
      platform: "android",
      originalTxId: origTx,
      tokenOrTxId: "token_1",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "PURCHASE",
      eventTime: 1730000000000,
      expiresAt: 1732600000000,
    });

    const renewal = sm.processStoreEvent({
      platform: "android",
      originalTxId: origTx,
      tokenOrTxId: "token_2",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "RENEWAL",
      eventTime: 1732600000000,
      expiresAt: 1735200000000,
    });

    expect(renewal.success).toBe(true);
    expect(renewal.state).toBe("ACTIVE");
    expect(renewal.effectivePlan).toBe("pro");

    const sub = sm.getSubscription(`android:${origTx}`);
    expect(sub?.expiresAt).toBe(1735200000000);
  });

  it("Test 4 [PLN-09]: Grace period retains Pro access during recovery window", () => {
    const origTx = "orig_tx_grace_test";
    sm.processStoreEvent({
      platform: "ios",
      originalTxId: origTx,
      tokenOrTxId: "tx_1",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "PURCHASE",
      eventTime: 1730000000000,
    });

    const grace = sm.processStoreEvent({
      platform: "ios",
      originalTxId: origTx,
      tokenOrTxId: "tx_2",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "GRACE_PERIOD",
      eventTime: 1732600000000,
    });

    expect(grace.success).toBe(true);
    expect(grace.state).toBe("IN_GRACE_PERIOD");
    // Under grace period, user retains Pro access
    expect(grace.effectivePlan).toBe("pro");
  });

  it("Test 5 [PLN-09]: Account hold suspends Pro access immediately", () => {
    const origTx = "orig_tx_hold_test";
    sm.processStoreEvent({
      platform: "android",
      originalTxId: origTx,
      tokenOrTxId: "token_1",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "PURCHASE",
      eventTime: 1730000000000,
    });

    const hold = sm.processStoreEvent({
      platform: "android",
      originalTxId: origTx,
      tokenOrTxId: "token_2",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "HOLD",
      eventTime: 1732600000000,
    });

    expect(hold.success).toBe(true);
    expect(hold.state).toBe("ON_HOLD");
    // Under account hold, Pro is suspended
    expect(hold.effectivePlan).toBe("free");
  });

  it("Test 6 [PLN-09]: Refund or Revoke reverts user to Free plan immediately", () => {
    const origTx = "orig_tx_refund_test";
    sm.processStoreEvent({
      platform: "ios",
      originalTxId: origTx,
      tokenOrTxId: "tx_1",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "PURCHASE",
      eventTime: 1730000000000,
    });

    const refund = sm.processStoreEvent({
      platform: "ios",
      originalTxId: origTx,
      tokenOrTxId: "tx_refund",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "REFUND",
      eventTime: 1730500000000,
    });

    expect(refund.success).toBe(true);
    expect(refund.state).toBe("REFUNDED");
    expect(refund.effectivePlan).toBe("free");
  });

  it("Test 7 [BUG-07]: Differentiates store promo codes from web discount codes", () => {
    expect(validatePromotionalCode("PLAY_PROMO_2026").validForStore).toBe(true);
    expect(validatePromotionalCode("WEB_SAVE_50").validForStore).toBe(false);
  });
});
