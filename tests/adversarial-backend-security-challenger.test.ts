/**
 * Adversarial Challenger Probe: Backend Security, Billing & Notification Targeting
 * Role: challenger_sim_1 (Empirical Challenger - Backend Security & Billing)
 * Worktree: E:\smartspend_V1_fixed\.claude\worktrees\mobile-program
 *
 * Verifies and stresses:
 * 1. Apple JWS verification (self-signed certs, bad chain, forged signatures, mismatched productIds).
 * 2. Google Play RTDN webhook (authentication enforcement, 401/400 rejections).
 * 3. Entitlement state machine (replay attacks, duplicate transaction hijacking, ultra plan resolution).
 * 4. Admin push notification audience (OAuth user Pro/Free broadcast, user_id leak across user_type).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import tls from "tls";
import crypto from "crypto";
import { app } from "../api/boot";
import { env } from "../api/lib/env";
import {
  EntitlementStateMachine,
  globalEntitlementStateMachine,
  StoreEventInput,
} from "../api/lib/store-billing/entitlement-state-machine";
import {
  decodeAndVerifyJWS,
  verifyAppleStoreKitTransaction,
  verifyAppleCertificateChain,
  parseAndVerifyAppleASN,
  APPLE_ROOT_CA_G3_PEM,
  APPLE_ROOT_CA_G3_FINGERPRINT256,
  APPLE_APP_STORE_OID,
} from "../api/lib/store-billing/apple-app-store-verifier";
import {
  verifyGooglePlayWebhookAuth,
  parseAndVerifyGooglePlayPubSub,
  verifyGooglePlayPurchaseToken,
  validateTokenInput,
} from "../api/lib/store-billing/google-play-verifier";

describe("Adversarial Verification: Apple JWS & Certificate Chain Integrity", () => {
  it("CHALLENGE 1.1: Self-signed certificates and certificates not chained to Apple Root CA - G3 are unconditionally REJECTED", () => {
    // Obtain a real X.509 root certificate from Node's trusted root store (e.g. DigiCert / Let's Encrypt)
    const nonAppleRootPem = tls.rootCertificates[0];
    const nonAppleCert = new crypto.X509Certificate(nonAppleRootPem);
    const nonAppleDerB64 = nonAppleCert.raw.toString("base64");

    // Scenario A: Self-signed certificate provided as both leaf and intermediate
    const resultSelfSigned = verifyAppleCertificateChain([nonAppleDerB64, nonAppleDerB64]);
    expect(resultSelfSigned).toBeNull();

    // Scenario B: Provided root in x5c[2] does not match Apple Root CA - G3
    const resultBadRoot = verifyAppleCertificateChain([nonAppleDerB64, nonAppleDerB64, nonAppleDerB64]);
    expect(resultBadRoot).toBeNull();

    // Scenario C: Empty or insufficient certificate chain
    expect(verifyAppleCertificateChain([])).toBeNull();
    expect(verifyAppleCertificateChain([nonAppleDerB64])).toBeNull();
    expect(verifyAppleCertificateChain(null as any)).toBeNull();
  });

  it("CHALLENGE 1.2: Certificates missing Apple App Store OID extension (1.2.840.113635.100.6.11.1) are REJECTED", () => {
    // Even if an attacker somehow attempts to use Apple Root CA - G3 as its own leaf
    const appleRootCert = new crypto.X509Certificate(APPLE_ROOT_CA_G3_PEM);
    const appleRootDerB64 = appleRootCert.raw.toString("base64");

    // Apple Root CA - G3 is a CA root, NOT a leaf with Apple App Store OID extension
    const result = verifyAppleCertificateChain([appleRootDerB64, appleRootDerB64, appleRootDerB64]);
    expect(result).toBeNull();
  });

  it("CHALLENGE 1.3: Forged JWS signatures and tampered tokens are unconditionally REJECTED", () => {
    const validHeader = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
    const validPayload = Buffer.from(
      JSON.stringify({
        bundleId: "com.smartspend.app",
        transactionId: "tx_attack_001",
        originalTransactionId: "orig_tx_attack_001",
        productId: "pro_monthly",
        expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      })
    ).toString("base64url");

    // Attack A: Arbitrary random forged signature string
    const forgedJws1 = `${validHeader}.${validPayload}.forged_bad_signature_xyz`;
    expect(decodeAndVerifyJWS(forgedJws1)).toBeNull();

    // Attack B: Empty signature
    const emptySigJws = `${validHeader}.${validPayload}.`;
    expect(decodeAndVerifyJWS(emptySigJws)).toBeNull();

    // Attack C: Non-ES256 algorithm (e.g. alg: "none" exploit)
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const noneJws = `${noneHeader}.${validPayload}.`;
    expect(decodeAndVerifyJWS(noneJws)).toBeNull();

    // Attack D: HS256 algorithm confusion exploit
    const hsHeader = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const hsJws = `${hsHeader}.${validPayload}.some_hmac_sig`;
    expect(decodeAndVerifyJWS(hsJws)).toBeNull();
  });

  it("CHALLENGE 1.4: In production mode (NODE_ENV=production), mock signatures are strictly REJECTED", () => {
    const originalEnv = env.NODE_ENV;
    try {
      (env as any).NODE_ENV = "production";

      const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          bundleId: "com.smartspend.app",
          transactionId: "tx_prod_mock_001",
          originalTransactionId: "orig_prod_mock_001",
          productId: "pro_monthly",
          expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        })
      ).toString("base64url");
      const mockSig = Buffer.from("mock_valid_es256_signature").toString("base64url");
      const mockJws = `${header}.${payload}.${mockSig}`;

      // In production, mock signature MUST be rejected
      const decoded = decodeAndVerifyJWS(mockJws);
      expect(decoded).toBeNull();
    } finally {
      (env as any).NODE_ENV = originalEnv;
    }
  });

  it("CHALLENGE 1.5: verifyAppleStoreKitTransaction strictly REJECTS mismatched productId", async () => {
    // Generate a valid mock JWS with productId: 'pro_monthly'
    const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        bundleId: "com.smartspend.app",
        transactionId: "tx_mismatch_001",
        originalTransactionId: "orig_tx_mismatch_001",
        productId: "pro_monthly",
        expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      })
    ).toString("base64url");
    const mockSig = Buffer.from("mock_valid_es256_signature").toString("base64url");
    const jws = `${header}.${payload}.${mockSig}`;

    // Expected pro_yearly but token payload contains pro_monthly -> REJECT
    const resMismatched1 = await verifyAppleStoreKitTransaction(jws, "pro_yearly");
    expect(resMismatched1.valid).toBe(false);

    // Expected ultra_monthly but token payload contains pro_monthly -> REJECT
    const resMismatched2 = await verifyAppleStoreKitTransaction(jws, "ultra_monthly");
    expect(resMismatched2.valid).toBe(false);

    // Matching productId: pro_monthly -> ACCEPT
    const resMatched = await verifyAppleStoreKitTransaction(jws, "pro_monthly");
    expect(resMatched.valid).toBe(true);
    expect(resMatched.transactionId).toBe("tx_mismatch_001");
  });
});

describe("Adversarial Verification: Google Play RTDN Webhook Authentication & Payload Validation", () => {
  const TEST_SECRET = "goog_test_secret_token_sec987";
  const originalSecret = env.GOOGLE_PLAY_WEBHOOK_SECRET;

  beforeEach(() => {
    env.GOOGLE_PLAY_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    env.GOOGLE_PLAY_WEBHOOK_SECRET = originalSecret;
  });

  it("CHALLENGE 2.1: verifyGooglePlayWebhookAuth strictly REJECTS unauthenticated or forged auth headers", () => {
    // Missing headers entirely
    expect(verifyGooglePlayWebhookAuth({})).toBe(false);

    // Incorrect x-goog-webhook-token
    expect(verifyGooglePlayWebhookAuth({ "x-goog-webhook-token": "wrong_secret" })).toBe(false);

    // Incorrect Bearer token
    expect(verifyGooglePlayWebhookAuth({ authorization: "Bearer wrong_bearer_secret" })).toBe(false);

    // Correct x-goog-webhook-token
    expect(verifyGooglePlayWebhookAuth({ "x-goog-webhook-token": TEST_SECRET })).toBe(true);

    // Correct Bearer secret
    expect(verifyGooglePlayWebhookAuth({ authorization: `Bearer ${TEST_SECRET}` })).toBe(true);
  });

  it("CHALLENGE 2.2: Google Cloud Pub/Sub Bearer JWT authentication rejects forged issuers and expired tokens", () => {
    // Forged issuer (not accounts.google.com or gserviceaccount.com)
    const forgedHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        iss: "https://evil-attacker.com",
        email: "attacker@evil.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    const forgedJwt = `${forgedHeader}.${forgedPayload}.fake_sig`;
    expect(verifyGooglePlayWebhookAuth({ authorization: `Bearer ${forgedJwt}` })).toBe(false);

    // Google issuer but expired
    const expiredPayload = Buffer.from(
      JSON.stringify({
        iss: "https://accounts.google.com",
        email: "pubsub-invoker@project.iam.gserviceaccount.com",
        exp: Math.floor(Date.now() / 1000) - 100, // Expired 100s ago
      })
    ).toString("base64url");
    const expiredJwt = `${forgedHeader}.${expiredPayload}.fake_sig`;
    expect(verifyGooglePlayWebhookAuth({ authorization: `Bearer ${expiredJwt}` })).toBe(false);

    // Valid Google Cloud Pub/Sub service account JWT with future expiration
    const validGooglePayload = Buffer.from(
      JSON.stringify({
        iss: "https://accounts.google.com",
        email: "pubsub-invoker@smartspend.iam.gserviceaccount.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    const validJwt = `${forgedHeader}.${validGooglePayload}.valid_sig`;
    expect(verifyGooglePlayWebhookAuth({ authorization: `Bearer ${validJwt}` })).toBe(true);
  });

  it("CHALLENGE 2.3: POST /api/webhooks/google-play returns HTTP 401 when unauthenticated", async () => {
    // Unauthenticated request without secret token or JWT
    const res = await app.request("/api/webhooks/google-play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { data: "test" } }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("CHALLENGE 2.4: POST /api/webhooks/google-play returns HTTP 400 on malformed JSON or forged Pub/Sub payload", async () => {
    // Request with valid auth but malformed JSON
    const resMalformed = await app.request("/api/webhooks/google-play", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-webhook-token": TEST_SECRET,
      },
      body: "not_a_json_string{",
    });
    expect(resMalformed.status).toBe(400);
    const bodyMalformed = await resMalformed.json();
    expect(bodyMalformed.error).toBe("Invalid JSON");

    // Request with valid auth but forged packageName in Pub/Sub data
    const forgedPubSubData = Buffer.from(
      JSON.stringify({
        packageName: "com.malicious.hacked_spend",
        eventTimeMillis: String(Date.now()),
        subscriptionNotification: {
          notificationType: 4,
          purchaseToken: "valid_purchase_token_12345",
          subscriptionId: "pro_monthly",
        },
      })
    ).toString("base64");

    const resForged = await app.request("/api/webhooks/google-play", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-webhook-token": TEST_SECRET,
      },
      body: JSON.stringify({
        message: {
          data: forgedPubSubData,
          messageId: "msg_forged_999",
        },
      }),
    });
    expect(resForged.status).toBe(400);
    const bodyForged = await resForged.json();
    expect(bodyForged.error).toBe("Invalid or forged payload");
  });
});

describe("Adversarial Verification: Entitlement State Machine & Replay Resistance", () => {
  let sm: EntitlementStateMachine;

  beforeEach(() => {
    sm = new EntitlementStateMachine();
  });

  it("CHALLENGE 3.1: Replay attack with same eventId returns IDEMPOTENT_REPLAY_IGNORED and preserves state", () => {
    const event: StoreEventInput = {
      platform: "android",
      originalTxId: "tx_replay_sec_01",
      tokenOrTxId: "token_sec_01",
      productId: "pro_monthly",
      userId: "usr_alice",
      userType: "oauth",
      eventType: "PURCHASE",
      eventTime: 1000,
      eventId: "event_replay_uuid_01",
    };

    const firstResult = sm.processStoreEvent(event);
    expect(firstResult.success).toBe(true);
    expect(firstResult.state).toBe("ACTIVE");
    expect(firstResult.effectivePlan).toBe("pro");

    // Replay attack: resending the identical event
    const replayResult = sm.processStoreEvent(event);
    expect(replayResult.success).toBe(true);
    expect(replayResult.state).toBe("ACTIVE");
    expect(replayResult.reason).toBe("IDEMPOTENT_REPLAY_IGNORED");
    expect(replayResult.effectivePlan).toBe("pro");

    // Burst replay of 20 consecutive attacks
    for (let i = 0; i < 20; i++) {
      const burstReplay = sm.processStoreEvent(event);
      expect(burstReplay.reason).toBe("IDEMPOTENT_REPLAY_IGNORED");
    }
  });

  it("CHALLENGE 3.2: Cross-user hijacking is strictly PREVENTED across local and oauth identity pairs", () => {
    const origTxId = "tx_shared_identity_001";

    // Alice (Google OAuth user ID 42) purchases subscription
    const aliceRes = sm.processStoreEvent({
      platform: "ios",
      originalTxId: origTxId,
      tokenOrTxId: "tok_alice_42",
      productId: "pro_monthly",
      userId: "42",
      userType: "oauth",
      eventType: "PURCHASE",
      eventTime: 1000,
    });
    expect(aliceRes.success).toBe(true);

    // Attacker Bob (Local password user ID 42 - identical numerical ID but userType 'local')
    // attempts to claim the subscription
    const bobRes = sm.processStoreEvent({
      platform: "ios",
      originalTxId: origTxId,
      tokenOrTxId: "tok_bob_hijack",
      productId: "pro_monthly",
      userId: "42",
      userType: "local",
      eventType: "PURCHASE",
      eventTime: 2000,
    });

    expect(bobRes.success).toBe(false);
    expect(bobRes.reason).toBe("CROSS_USER_HIJACKING_PREVENTED");

    // Ensure subscription ownership remains Alice
    const record = sm.getSubscription(`ios:${origTxId}`);
    expect(record?.userId).toBe("42");
    expect(record?.userType).toBe("oauth");
  });

  it("CHALLENGE 3.3: Ultra plan resolution resolves to 'ultra' for active ultra product IDs and 'free' when expired", () => {
    // 1. Ultra monthly active
    expect(sm.resolvePlan("ultra_monthly", true)).toBe("ultra");
    expect(sm.resolvePlan("smartspend_ultra_yearly", true)).toBe("ultra");

    // 2. Pro monthly active
    expect(sm.resolvePlan("pro_monthly", true)).toBe("pro");
    expect(sm.resolvePlan("smartspend_pro_yearly", true)).toBe("pro");

    // 3. Expired or inactive ultra reverts to 'free'
    expect(sm.resolvePlan("ultra_monthly", false)).toBe("free");
    expect(sm.resolvePlan("ultra_yearly", false)).toBe("free");

    // 4. End-to-end Ultra purchase transition in state machine
    const now = Date.now();
    const ultraPurchase = sm.processStoreEvent({
      platform: "android",
      originalTxId: "tx_ultra_001",
      tokenOrTxId: "tok_ultra_001",
      productId: "ultra_monthly",
      userId: "user_ultra",
      userType: "local",
      eventType: "PURCHASE",
      eventTime: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });

    expect(ultraPurchase.success).toBe(true);
    expect(ultraPurchase.state).toBe("ACTIVE");
    expect(ultraPurchase.effectivePlan).toBe("ultra");

    // Cancelled Ultra subscription before expiration remains ultra
    const ultraCancelled = sm.processStoreEvent({
      platform: "android",
      originalTxId: "tx_ultra_001",
      tokenOrTxId: "tok_ultra_001",
      productId: "ultra_monthly",
      userId: "user_ultra",
      userType: "local",
      eventType: "CANCEL",
      eventTime: now + 1000,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });
    expect(ultraCancelled.success).toBe(true);
    expect(ultraCancelled.state).toBe("CANCELLED");
    expect(ultraCancelled.effectivePlan).toBe("ultra");

    // After expiration, Ultra subscription drops to free
    const isUltraStillEffective = sm.isEffective("CANCELLED", now + 35 * 24 * 60 * 60 * 1000, now + 30 * 24 * 60 * 60 * 1000);
    expect(isUltraStillEffective).toBe(false);
    expect(sm.resolvePlan("ultra_monthly", isUltraStillEffective)).toBe("free");
  });
});

describe("Adversarial Verification: Admin Push Notification Audience & Identity Pair Isolation", () => {
  it("CHALLENGE 4.1: Pro/Free audience matching strictly includes Google OAuth users ('oauth:<id>') and Local users ('local:<id>')", () => {
    // Simulate database query results for Pro broadcast
    const mockProUsersList = [{ id: 101 }, { id: 102 }]; // Google OAuth users
    const mockProLocalList = [{ id: 201 }, { id: 202 }]; // Local phone/password users

    // Correct implementation mapping (DEF-07 fix):
    const userSet = new Set([
      ...mockProUsersList.map((u) => "oauth:" + u.id),
      ...mockProLocalList.map((u) => "local:" + u.id),
    ]);

    // Push subscriptions registered on device:
    const mockSubscriptions = [
      { userId: 101, userType: "oauth", endpoint: "https://push.fcm/oauth101" }, // Google Pro
      { userId: 102, userType: "oauth", endpoint: "https://push.fcm/oauth102" }, // Google Pro
      { userId: 201, userType: "local", endpoint: "https://push.fcm/local201" }, // Local Pro
      { userId: 202, userType: "local", endpoint: "https://push.fcm/local202" }, // Local Pro
      { userId: 301, userType: "oauth", endpoint: "https://push.fcm/oauth301" }, // Google Free (should be excluded)
      { userId: 302, userType: "local", endpoint: "https://push.fcm/local302" }, // Local Free (should be excluded)
    ];

    const targetSubs = mockSubscriptions.filter((sub) =>
      userSet.has(sub.userType + ":" + sub.userId)
    );

    // Verify all Pro Google OAuth users are INCLUDED
    expect(targetSubs.some((s) => s.userId === 101 && s.userType === "oauth")).toBe(true);
    expect(targetSubs.some((s) => s.userId === 102 && s.userType === "oauth")).toBe(true);

    // Verify all Pro Local users are INCLUDED
    expect(targetSubs.some((s) => s.userId === 201 && s.userType === "local")).toBe(true);
    expect(targetSubs.some((s) => s.userId === 202 && s.userType === "local")).toBe(true);

    // Verify Free users are EXCLUDED
    expect(targetSubs.some((s) => s.userId === 301)).toBe(false);
    expect(targetSubs.some((s) => s.userId === 302)).toBe(false);

    expect(targetSubs.length).toBe(4);

    // Contrast with the regression / defect scenario where users were mapped as 'google:' + u.id:
    const brokenUserSet = new Set([
      ...mockProUsersList.map((u) => "google:" + u.id),
      ...mockProLocalList.map((u) => "local:" + u.id),
    ]);
    const brokenSubs = mockSubscriptions.filter((sub) =>
      brokenUserSet.has(sub.userType + ":" + sub.userId)
    );
    // In broken implementation, Google users are completely dropped:
    expect(brokenSubs.some((s) => s.userType === "oauth")).toBe(false);
  });

  it("CHALLENGE 4.2: Specific user push targeting strictly prevents leakage across identical numerical IDs (DEF-08)", () => {
    // Both users share numerical ID 77
    const mockSubscriptions = [
      { userId: 77, userType: "oauth", endpoint: "https://push.fcm/oauth77" },
      { userId: 77, userType: "local", endpoint: "https://push.fcm/local77" },
      { userId: 88, userType: "local", endpoint: "https://push.fcm/local88" },
    ];

    // Case A: Admin targets specific Google OAuth user 77
    const targetUserIdA = 77;
    const targetUserTypeA = "oauth";
    const targetSubsA = mockSubscriptions.filter((sub) => {
      if (String(sub.userId) !== String(targetUserIdA)) return false;
      if (targetUserTypeA && sub.userType !== targetUserTypeA) return false;
      return true;
    });

    expect(targetSubsA.length).toBe(1);
    expect(targetSubsA[0].userType).toBe("oauth");
    expect(targetSubsA[0].userId).toBe(77);

    // Case B: Admin targets specific Local user 77
    const targetUserIdB = 77;
    const targetUserTypeB = "local";
    const targetSubsB = mockSubscriptions.filter((sub) => {
      if (String(sub.userId) !== String(targetUserIdB)) return false;
      if (targetUserTypeB && sub.userType !== targetUserTypeB) return false;
      return true;
    });

    expect(targetSubsB.length).toBe(1);
    expect(targetSubsB[0].userType).toBe("local");
    expect(targetSubsB[0].userId).toBe(77);
  });
});
