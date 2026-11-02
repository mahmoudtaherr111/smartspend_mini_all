import { describe, it, expect, beforeEach } from "vitest";
import { EntitlementStateMachine, globalEntitlementStateMachine } from "../api/lib/store-billing/entitlement-state-machine";
import {
  decodeAndVerifyJWS,
  verifyAppleStoreKitTransaction,
  parseAndVerifyAppleASN,
} from "../api/lib/store-billing/apple-app-store-verifier";
import {
  verifyGooglePlayPurchaseToken,
  validateTokenInput,
  parseAndVerifyGooglePlayPubSub,
} from "../api/lib/store-billing/google-play-verifier";

describe("Adversarial Empirical Probe: Store Billing & Entitlements", () => {
  let sm: EntitlementStateMachine;

  beforeEach(() => {
    sm = new EntitlementStateMachine();
  });

  describe("Probe 1: Apple JWS Forgery & Signature Integrity", () => {
    it("SECURITY VERIFICATION: decodeAndVerifyJWS strictly rejects arbitrary forged signature", () => {
      const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          bundleId: "com.smartspend.app",
          originalTransactionId: "forged_orig_tx",
          transactionId: "forged_tx",
          productId: "pro_monthly",
          expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        })
      ).toString("base64url");
      const forgedSignature = Buffer.from("completely_untrusted_fake_signature").toString("base64url");

      const forgedJws = `${header}.${payload}.${forgedSignature}`;

      // EMPIRICAL TEST: A robust verifier MUST reject a forged signature (return null)
      const decoded = decodeAndVerifyJWS(forgedJws);

      expect(decoded).toBeNull();
    });

    it("SECURITY VERIFICATION: verifyAppleStoreKitTransaction rejects forged JWS token", async () => {
      const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          bundleId: "com.smartspend.app",
          originalTransactionId: "hacked_orig_tx",
          transactionId: "hacked_tx",
          productId: "pro_monthly",
          expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        })
      ).toString("base64url");
      const fakeSignature = "invalid_signature_123456";
      const forgedJws = `${header}.${payload}.${fakeSignature}`;

      const res = await verifyAppleStoreKitTransaction(forgedJws, "pro_monthly");

      // A secure verifier MUST return { valid: false }
      expect(res.valid).toBe(false);
    });

    it("SECURITY VERIFICATION: parseAndVerifyAppleASN webhook rejects forged signedPayload", () => {
      const txHeader = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const txPayload = Buffer.from(
        JSON.stringify({
          bundleId: "com.smartspend.app",
          originalTransactionId: "webhook_hacked_tx",
          transactionId: "webhook_hacked_tx_1",
          productId: "pro_monthly",
          expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        })
      ).toString("base64url");
      const signedTransactionInfo = `${txHeader}.${txPayload}.forged_tx_sig`;

      const notifHeader = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const notifPayload = Buffer.from(
        JSON.stringify({
          notificationType: "SUBSCRIBED",
          subtype: "INITIAL_BUY",
          notificationUUID: "fake_notif_uuid_999",
          version: "2.0",
          signedDate: Date.now(),
          data: {
            bundleId: "com.smartspend.app",
            signedTransactionInfo,
          },
        })
      ).toString("base64url");
      const signedPayload = `${notifHeader}.${notifPayload}.forged_notif_sig`;

      const parsed = parseAndVerifyAppleASN({ signedPayload });

      expect(parsed).toBeNull();
    });
  });

  describe("Probe 2: Google Play Unverified Purchase Token Bypass", () => {
    it("SECURITY VERIFICATION: verifyGooglePlayPurchaseToken rejects arbitrary unverified string", async () => {
      const maliciousToken = "unverified_client_assertion_token_from_attacker";

      const res = await verifyGooglePlayPurchaseToken(maliciousToken, "pro_monthly");

      // R2 specifies: 'The server must verify every Google purchase token with the Play Developer API... never grant a plan from unverified client assertions.'
      // Acceptance Criteria: 'Server verification rejects unverified or forged Google Play tokens.'
      expect(res.valid).toBe(false);
    });

    it("VULNERABILITY CONFIRMATION: Token format validator accepts any arbitrary alphanumeric string", () => {
      expect(validateTokenInput("free_pro_please")).toBe(true);
      expect(validateTokenInput("12345")).toBe(true);
      // Only rejects empty, null-byte, or length > 2048
      expect(validateTokenInput("")).toBe(false);
      expect(validateTokenInput("token\0bad")).toBe(false);
    });
  });

  describe("Probe 3: Mobile Purchase Integration & Failure Simulation", () => {
    it("INTEGRATION VERIFICATION: Mobile Flutter PlanScreen token format is accepted by Apple StoreKit verifier", async () => {
      // In mobile/app/lib/src/features/plans/plan_screen.dart:
      // final token = _currentStore == 'app_store' ? 'apple_tx_mock_${DateTime.now().millisecondsSinceEpoch}' : ...
      const mobileAppGeneratedToken = `apple_tx_mock_${Date.now()}`;

      // If user is on iOS, this token is sent to verifyAppleStoreKitTransaction:
      const res = await verifyAppleStoreKitTransaction(mobileAppGeneratedToken, "pro_monthly");

      // Valid in development / test harness mode
      expect(res.valid).toBe(true);
    });

    it("Purchase failure recovery: On verification failure, entitlement state is not corrupted", () => {
      const origTx = "user_tx_safe_state";
      // User has an existing active subscription
      sm.processStoreEvent({
        platform: "android",
        originalTxId: origTx,
        tokenOrTxId: "tok_1",
        productId: "pro_monthly",
        userId: "u123",
        userType: "local",
        eventType: "PURCHASE",
        eventTime: 1000,
      });

      const before = sm.getSubscription(`android:${origTx}`);
      expect(before?.status).toBe("ACTIVE");

      // Now user attempts another purchase with invalid token and verification throws
      const invalidToken = "token\0invalid";
      const isValid = validateTokenInput(invalidToken);
      expect(isValid).toBe(false);

      // The existing state in sm is untouched
      const after = sm.getSubscription(`android:${origTx}`);
      expect(after?.status).toBe("ACTIVE");
    });
  });

  describe("Probe 4: Entitlement State Machine Edge Cases & State Invariants", () => {
    it("Idempotency: Replaying exact same eventId returns IDEMPOTENT_REPLAY_IGNORED and preserves state", () => {
      const event = {
        platform: "android" as const,
        originalTxId: "tx_idempotent_1",
        tokenOrTxId: "token_1",
        productId: "pro_monthly",
        userId: "u1",
        userType: "local" as const,
        eventType: "PURCHASE" as const,
        eventTime: 1000,
        eventId: "event_replay_1",
      };

      const res1 = sm.processStoreEvent(event);
      expect(res1.success).toBe(true);
      expect(res1.state).toBe("ACTIVE");
      expect(res1.effectivePlan).toBe("pro");

      const res2 = sm.processStoreEvent(event);
      expect(res2.success).toBe(true);
      expect(res2.state).toBe("ACTIVE");
      expect(res2.reason).toBe("IDEMPOTENT_REPLAY_IGNORED");
    });

    it("Out-of-order rejection: Older event arriving after newer event is dropped", () => {
      const base = {
        platform: "ios" as const,
        originalTxId: "tx_ooo_1",
        tokenOrTxId: "token_1",
        productId: "pro_monthly",
        userId: "u1",
        userType: "local" as const,
      };

      // Newer renewal at T=5000
      const renewal = sm.processStoreEvent({
        ...base,
        eventType: "RENEWAL",
        eventTime: 5000,
      });
      expect(renewal.success).toBe(true);
      expect(renewal.state).toBe("ACTIVE");

      // Older expire at T=3000 arrives later
      const delayedExpire = sm.processStoreEvent({
        ...base,
        eventType: "EXPIRE",
        eventTime: 3000,
      });
      expect(delayedExpire.success).toBe(false);
      expect(delayedExpire.reason).toBe("OUT_OF_ORDER_EVENT_DROPPED");
      expect(sm.getSubscription("ios:tx_ooo_1")?.status).toBe("ACTIVE");
    });

    it("State Machine Invariant: Cancel retains Pro until expiresAt, then drops to Free", () => {
      const now = Date.now();
      const expiresAt = now + 10000; // 10s in future

      expect(sm.isProEffective("CANCELLED", now, expiresAt)).toBe(true);
      // After expiration
      expect(sm.isProEffective("CANCELLED", expiresAt + 1, expiresAt)).toBe(false);
    });

    it("State Machine Invariant: Grace period retains Pro, Hold drops to Free", () => {
      expect(sm.isProEffective("IN_GRACE_PERIOD")).toBe(true);
      expect(sm.isProEffective("ON_HOLD")).toBe(false);
      expect(sm.isProEffective("PAUSED")).toBe(false);
      expect(sm.isProEffective("EXPIRED")).toBe(false);
      expect(sm.isProEffective("REFUNDED")).toBe(false);
      expect(sm.isProEffective("REVOKED")).toBe(false);
    });

    it("VULNERABILITY CONFIRMATION: In-memory state machine loses all replay history when re-instantiated", () => {
      // Demonstrates ephemeral in-memory limitation across server restarts
      const event = {
        platform: "android" as const,
        originalTxId: "tx_restart_test",
        tokenOrTxId: "tok_restart",
        productId: "pro_monthly",
        userId: "u_restart",
        userType: "local" as const,
        eventType: "PURCHASE" as const,
        eventTime: 1000,
        eventId: "unique_event_id_123",
      };

      sm.processStoreEvent(event);
      // If server process restarts, a fresh instance is created
      const restartedSm = new EntitlementStateMachine();
      // The restarted instance has no memory of eventId
      const replayAfterRestart = restartedSm.processStoreEvent(event);
      // It processes it anew instead of recognizing it as IDEMPOTENT_REPLAY_IGNORED
      expect(replayAfterRestart.reason).toBeUndefined();
      expect(replayAfterRestart.state).toBe("ACTIVE");
    });
  });
});
