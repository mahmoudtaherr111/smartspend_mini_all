import { describe, it, expect, beforeEach } from "vitest";
import { EntitlementStateMachine } from "../../../api/lib/store-billing/entitlement-state-machine";
import { verifyGooglePackage, validateTokenInput } from "../../../api/lib/store-billing/google-play-verifier";
import { verifyAppleBundle, decodeAndVerifyJWS } from "../../../api/lib/store-billing/apple-app-store-verifier";
import { GOOGLE_PLAY_FIXTURES, decodePubSubData } from "../fixtures/google-play-rtdn.fixture";
import { APPLE_ASN_FIXTURES } from "../fixtures/apple-asn-v2.fixture";

/**
 * Tier 2 - Boundary & Corner Cases: Store Billing & Entitlements
 * Requirements: PLN-09, PLN-07, PLN-08, PLN-02
 */

describe("Tier 2 - Boundary & Corner Cases: Store Billing & Webhook Verifications", () => {
  let sm: EntitlementStateMachine;
  const userId = "usr_boundary_billing_01";
  const userType = "local";

  beforeEach(() => {
    sm = new EntitlementStateMachine();
  });

  it("Test 1: Replayed webhook payload is detected and handled idempotently without re-triggering transitions", () => {
    const eventTime = 1730000000000;
    const eventPayload = {
      platform: "android" as const,
      originalTxId: "orig_tx_replay_test",
      tokenOrTxId: "token_replay_1",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "PURCHASE" as const,
      eventTime,
      eventId: "event_unique_id_100",
    };

    // First delivery
    const firstDelivery = sm.processStoreEvent(eventPayload);
    expect(firstDelivery.success).toBe(true);
    expect(firstDelivery.state).toBe("ACTIVE");

    // Replay with identical eventId
    const secondDelivery = sm.processStoreEvent(eventPayload);
    expect(secondDelivery.success).toBe(true);
    expect(secondDelivery.state).toBe("ACTIVE");
    expect(secondDelivery.reason).toBe("IDEMPOTENT_REPLAY_IGNORED");
  });

  it("Test 2: Out-of-order webhook events (older event arriving after newer event) are dropped", () => {
    const origTxId = "orig_tx_ooo_test";

    // Newer event (Renewed at T=2000)
    const newerEvent = sm.processStoreEvent({
      platform: "ios",
      originalTxId: origTxId,
      tokenOrTxId: "tx_2000",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "RENEWAL",
      eventTime: 2000,
    });
    expect(newerEvent.success).toBe(true);

    // Delayed older event (Hold at T=1000) arriving after T=2000
    const olderEvent = sm.processStoreEvent({
      platform: "ios",
      originalTxId: origTxId,
      tokenOrTxId: "tx_1000",
      productId: "pro_monthly",
      userId,
      userType,
      eventType: "HOLD",
      eventTime: 1000, // Older timestamp
    });

    expect(olderEvent.success).toBe(false);
    expect(olderEvent.reason).toBe("OUT_OF_ORDER_EVENT_DROPPED");
    // Ensure state remained ACTIVE
    expect(sm.getSubscription(`ios:${origTxId}`)?.status).toBe("ACTIVE");
  });

  it("Test 3: Forged Google Play package name is rejected by server verification", () => {
    const forgedFixture = GOOGLE_PLAY_FIXTURES.forgedPackageName;
    const decoded = decodePubSubData(forgedFixture.message.data);

    expect(decoded.packageName).toBe("com.malicious.fakeapp");
    expect(verifyGooglePackage(decoded.packageName)).toBe(false);
  });

  it("Test 4: Forged Apple ASN v2 bundleId is rejected by server verification", () => {
    const forgedFixture = APPLE_ASN_FIXTURES.forgedBundleId;

    expect(forgedFixture.decodedNotification.data.bundleId).toBe("com.malicious.hackedapp");
    expect(verifyAppleBundle(forgedFixture.decodedNotification.data.bundleId)).toBe(false);
  });

  it("Test 5: Apple JWS signature with untrusted or tampered signature fails verification", () => {
    const validJws = APPLE_ASN_FIXTURES.subscribed.envelope.signedPayload;
    const parts = validJws.split(".");
    // Tamper with payload byte
    const tamperedPayload = Buffer.from(JSON.stringify({ hacked: true })).toString("base64url");
    const forgedPayloadJws = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const forgedSigJws = `${parts[0]}.${parts[1]}.untrusted_random_signature`;

    expect(decodeAndVerifyJWS(validJws)).not.toBeNull();
    expect(decodeAndVerifyJWS(forgedPayloadJws)).toBeNull();
    expect(decodeAndVerifyJWS(forgedSigJws)).toBeNull();
  });

  it("Test 6: Purchase tokens containing null bytes or extreme lengths are rejected", () => {
    expect(validateTokenInput("valid_purchase_token_12345")).toBe(true);
    expect(validateTokenInput("")).toBe(false);
    expect(validateTokenInput("token\0with_null_byte")).toBe(false);
    expect(validateTokenInput("T".repeat(3000))).toBe(false);
  });
});
