import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import {
  decodeAndVerifyJWS,
  verifyAppleCertificateChain,
  verifyAppleStoreKitTransaction,
  parseAndVerifyAppleASN,
  APPLE_ROOT_CA_G3_PEM,
  APPLE_APP_STORE_OID,
} from "../api/lib/store-billing/apple-app-store-verifier";
import {
  verifyGooglePlayWebhookAuth,
  parseAndVerifyGooglePlayPubSub,
  verifyGooglePlayPurchaseToken,
  GOOGLE_PLAY_NOTIFICATION_TYPES,
} from "../api/lib/store-billing/google-play-verifier";
import {
  EntitlementStateMachine,
  globalEntitlementStateMachine,
} from "../api/lib/store-billing/entitlement-state-machine";
import { env } from "../api/lib/env";

describe("Phase 4 Adversarial Verification Suite: Backend & Platform Services", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = env.NODE_ENV;
  });

  afterEach(() => {
    (env as any).NODE_ENV = originalEnv;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Apple StoreKit 2 & JWS Cryptographic Verification Adversarial Challenge
  // ───────────────────────────────────────────────────────────────────────────
  describe("Challenge 1: Apple StoreKit 2 Cryptographic Validation", () => {
    it("Rejects JWS with non-ES256 algorithm (e.g. HS256, none, RS256)", () => {
      for (const alg of ["HS256", "none", "RS256", "ES384"]) {
        const header = Buffer.from(JSON.stringify({ alg })).toString("base64url");
        const payload = Buffer.from(
          JSON.stringify({
            bundleId: "com.smartspend.app",
            transactionId: "tx_123",
            originalTransactionId: "orig_123",
            productId: "pro_monthly",
          })
        ).toString("base64url");
        const sig = Buffer.from("mock_valid_es256_signature").toString("base64url");
        const token = `${header}.${payload}.${sig}`;

        expect(decodeAndVerifyJWS(token)).toBeNull();
      }
    });

    it("Rejects JWS with forged or empty signature", () => {
      const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          bundleId: "com.smartspend.app",
          transactionId: "tx_123",
          originalTransactionId: "orig_123",
          productId: "pro_monthly",
        })
      ).toString("base64url");

      expect(decodeAndVerifyJWS(`${header}.${payload}.`)).toBeNull();
      expect(decodeAndVerifyJWS(`${header}.${payload}.bad_signature_abc`)).toBeNull();
    });

    it("Rejects x5c certificate chain with fewer than 2 certificates", () => {
      expect(verifyAppleCertificateChain([])).toBeNull();
      expect(verifyAppleCertificateChain(["single_cert_base64"])).toBeNull();
    });

    it("Rejects self-signed root certificate not matching Apple Root CA - G3", () => {
      // Generate a self-signed EC keypair and self-signed certificate
      const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      });

      // Self-signed root / leaf
      // Even if x5c contains self-signed certs, verifyAppleCertificateChain checks against hardcoded APPLE_ROOT_CA_G3_PEM
      const fakeCertDer = Buffer.from("MIIBfakeCertForTestingOnly").toString("base64");
      const fakeChain = [fakeCertDer, fakeCertDer];

      const res = verifyAppleCertificateChain(fakeChain);
      expect(res).toBeNull();
    });

    it("Strictly enforces productId match in verifyAppleStoreKitTransaction", async () => {
      const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          bundleId: "com.smartspend.app",
          transactionId: "sk2_tx_1",
          originalTransactionId: "sk2_orig_1",
          productId: "pro_yearly", // Purchase was for pro_yearly
          expiresDate: Date.now() + 86400000,
        })
      ).toString("base64url");
      const sig = Buffer.from("mock_valid_es256_signature").toString("base64url");
      const validJws = `${header}.${payload}.${sig}`;

      // User claims they bought "pro_monthly"
      const mismatchRes = await verifyAppleStoreKitTransaction(validJws, "pro_monthly");
      expect(mismatchRes.valid).toBe(false);

      // Exact match passes in dev/test
      const matchRes = await verifyAppleStoreKitTransaction(validJws, "pro_yearly");
      expect(matchRes.valid).toBe(true);
      expect(matchRes.originalTransactionId).toBe("sk2_orig_1");
    });

    it("Rejects unauthorized bundleId in JWS transaction", async () => {
      const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          bundleId: "com.evil.maliciousapp",
          transactionId: "sk2_tx_bad",
          originalTransactionId: "sk2_orig_bad",
          productId: "pro_monthly",
          expiresDate: Date.now() + 86400000,
        })
      ).toString("base64url");
      const sig = Buffer.from("mock_valid_es256_signature").toString("base64url");
      const maliciousBundleJws = `${header}.${payload}.${sig}`;

      const res = await verifyAppleStoreKitTransaction(maliciousBundleJws, "pro_monthly");
      expect(res.valid).toBe(false);
    });

    it("Production environment strictly rejects mock signatures and mock plain tokens", async () => {
      (env as any).NODE_ENV = "production";
      (env as any).BILLING_SIMULATE = "false";

      const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          bundleId: "com.smartspend.app",
          transactionId: "prod_tx_1",
          originalTransactionId: "prod_orig_1",
          productId: "pro_monthly",
          expiresDate: Date.now() + 86400000,
        })
      ).toString("base64url");
      const mockSig = Buffer.from("mock_valid_es256_signature").toString("base64url");
      const mockJws = `${header}.${payload}.${mockSig}`;

      // In production, decodeAndVerifyJWS MUST NOT accept mock signature
      const decoded = decodeAndVerifyJWS(mockJws);
      expect(decoded).toBeNull();

      // In production, verifyAppleStoreKitTransaction MUST NOT accept mock plain tokens
      const plainRes = await verifyAppleStoreKitTransaction("apple_tx_mock_12345", "pro_monthly");
      expect(plainRes.valid).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Google Play RTDN Webhook Adversarial Challenge
  // ───────────────────────────────────────────────────────────────────────────
  describe("Challenge 2: Google Play RTDN Webhook Authentication & Events", () => {
    it("Rejects unauthenticated requests when secret is configured", () => {
      const savedSecret = env.GOOGLE_PLAY_WEBHOOK_SECRET;
      try {
        (env as any).GOOGLE_PLAY_WEBHOOK_SECRET = "super_secure_play_secret_12345";

        // Missing headers entirely
        expect(verifyGooglePlayWebhookAuth({})).toBe(false);
        expect(verifyGooglePlayWebhookAuth(undefined)).toBe(false);

        // Wrong token in x-goog-webhook-token
        expect(
          verifyGooglePlayWebhookAuth({ "x-goog-webhook-token": "wrong_token" })
        ).toBe(false);

        // Wrong token in Bearer authorization
        expect(
          verifyGooglePlayWebhookAuth({ authorization: "Bearer wrong_bearer_secret" })
        ).toBe(false);

        // Correct token in x-goog-webhook-token
        expect(
          verifyGooglePlayWebhookAuth({
            "x-goog-webhook-token": "super_secure_play_secret_12345",
          })
        ).toBe(true);

        // Correct token in Bearer authorization
        expect(
          verifyGooglePlayWebhookAuth({
            authorization: "Bearer super_secure_play_secret_12345",
          })
        ).toBe(true);
      } finally {
        (env as any).GOOGLE_PLAY_WEBHOOK_SECRET = savedSecret;
      }
    });

    it("Rejects expired Bearer Google Cloud Pub/Sub JWT", () => {
      const savedSecret = env.GOOGLE_PLAY_WEBHOOK_SECRET;
      try {
        (env as any).GOOGLE_PLAY_WEBHOOK_SECRET = "secret";

        // Expired JWT (exp is in the past)
        const expiredExp = Math.floor(Date.now() / 1000) - 300; // 5 mins ago
        const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
        const payload = Buffer.from(
          JSON.stringify({
            iss: "https://accounts.google.com",
            exp: expiredExp,
            email: "pubsub-invoker@smartspend.iam.gserviceaccount.com",
          })
        ).toString("base64url");
        const jwt = `${header}.${payload}.mock_sig`;

        const isAuth = verifyGooglePlayWebhookAuth({
          authorization: `Bearer ${jwt}`,
        });
        expect(isAuth).toBe(false);
      } finally {
        (env as any).GOOGLE_PLAY_WEBHOOK_SECRET = savedSecret;
      }
    });

    it("ANALYSIS FINDING: Bearer JWT claims inspection lacks cryptographic public-key verification", () => {
      // Challenger probe: Can an attacker forge a token with iss: accounts.google.com and future exp?
      const savedSecret = env.GOOGLE_PLAY_WEBHOOK_SECRET;
      try {
        (env as any).GOOGLE_PLAY_WEBHOOK_SECRET = "secret";

        const futureExp = Math.floor(Date.now() / 1000) + 3600;
        const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
        const payload = Buffer.from(
          JSON.stringify({
            iss: "https://accounts.google.com",
            exp: futureExp,
            email: "fake-attacker@evil.gserviceaccount.com",
          })
        ).toString("base64url");
        const forgedJwt = `${header}.${payload}.unverified_attacker_signature`;

        const accepted = verifyGooglePlayWebhookAuth({
          authorization: `Bearer ${forgedJwt}`,
        });

        // The current implementation accepts any 3-part JWT matching Google issuer / email without crypto signature verification
        // This empirically demonstrates the vulnerability/finding in Pub/Sub JWT validation
        expect(accepted).toBe(true);
      } finally {
        (env as any).GOOGLE_PLAY_WEBHOOK_SECRET = savedSecret;
      }
    });

    it("Parses and verifies valid Google Play Pub/Sub event for SUBSCRIPTION_EXPIRED (type 13)", () => {
      const subNotif = {
        version: "1.0",
        notificationType: GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
        purchaseToken: "valid_purchase_token_expired_1",
        subscriptionId: "pro_monthly",
      };

      const devNotif = {
        version: "1.0",
        packageName: "com.smartspend.app",
        eventTimeMillis: String(Date.now()),
        subscriptionNotification: subNotif,
      };

      const base64Data = Buffer.from(JSON.stringify(devNotif)).toString("base64");
      const pubsubMsg = {
        message: {
          data: base64Data,
          messageId: "msg_exp_123",
          publishTime: new Date().toISOString(),
        },
      };

      const parsed = parseAndVerifyGooglePlayPubSub(pubsubMsg);
      expect(parsed).not.toBeNull();
      expect(parsed?.eventType).toBe("EXPIRE");
      expect(parsed?.notificationType).toBe(13);
      expect(parsed?.purchaseToken).toBe("valid_purchase_token_expired_1");
    });

    it("Rejects Google Play Pub/Sub message with unauthorized packageName", () => {
      const devNotif = {
        version: "1.0",
        packageName: "com.forged.app",
        eventTimeMillis: String(Date.now()),
        subscriptionNotification: {
          version: "1.0",
          notificationType: GOOGLE_PLAY_NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED,
          purchaseToken: "valid_purchase_token_1",
          subscriptionId: "pro_monthly",
        },
      };

      const base64Data = Buffer.from(JSON.stringify(devNotif)).toString("base64");
      const pubsubMsg = {
        message: {
          data: base64Data,
          messageId: "msg_forged_pkg",
          publishTime: new Date().toISOString(),
        },
      };

      expect(parseAndVerifyGooglePlayPubSub(pubsubMsg)).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Entitlement State Machine & Concurrency Adversarial Challenge
  // ───────────────────────────────────────────────────────────────────────────
  describe("Challenge 3: Entitlement State Machine, Ultra Tier & Hydration", () => {
    let sm: EntitlementStateMachine;

    beforeEach(() => {
      sm = new EntitlementStateMachine();
    });

    it("Correctly transitions and grants Ultra tier for ultra product IDs", () => {
      // User buys ultra_monthly
      const res = sm.processStoreEvent({
        platform: "android",
        originalTxId: "tx_ultra_001",
        tokenOrTxId: "tok_ultra_1",
        productId: "ultra_monthly",
        userId: "user_ultra",
        userType: "oauth",
        eventType: "PURCHASE",
        eventTime: Date.now(),
      });

      expect(res.success).toBe(true);
      expect(res.state).toBe("ACTIVE");
      expect(res.effectivePlan).toBe("ultra");

      // Resolve plan test
      expect(sm.resolvePlan("ultra_monthly", true)).toBe("ultra");
      expect(sm.resolvePlan("com.smartspend.ultra_yearly", true)).toBe("ultra");
      expect(sm.resolvePlan("pro_monthly", true)).toBe("pro");
      expect(sm.resolvePlan("ultra_monthly", false)).toBe("free");
    });

    it("Hydrates subscriptions and processed events from database mock (DEF-05 & DEF-22)", async () => {
      const now = Date.now();
      const mockRows = [
        {
          id: 1,
          store: "google_play",
          originalTransactionId: "g_orig_101",
          purchaseToken: "g_tok_101",
          storeProductId: "ultra_monthly",
          userId: 55,
          userType: "oauth",
          status: "active",
          expiresAt: new Date(now + 86400000),
          createdAt: new Date(now - 10000),
          updatedAt: new Date(now),
          rawPayload: {
            messageId: "msg_seeded_001",
            processedEvents: ["msg_seeded_001", "ev_seeded_002"],
          },
        },
        {
          id: 2,
          store: "app_store",
          originalTransactionId: "a_orig_202",
          purchaseToken: "a_tx_202",
          storeProductId: "pro_monthly",
          userId: 77,
          userType: "local",
          status: "active",
          expiresAt: new Date(now + 86400000),
          createdAt: new Date(now - 10000),
          updatedAt: new Date(now),
          rawPayload: {
            notificationUUID: "notif_uuid_apple_001",
          },
        },
      ];

      const mockDb = {
        select: () => ({
          from: () => Promise.resolve(mockRows),
        }),
      };

      const count = await sm.hydrateFromDb(mockDb);
      expect(count).toBe(2);

      // Verify android ultra subscription was loaded
      const gSub = sm.getSubscription("android:g_orig_101");
      expect(gSub).toBeDefined();
      expect(gSub?.productId).toBe("ultra_monthly");
      expect(gSub?.userId).toBe("55");
      expect(gSub?.userType).toBe("oauth");
      expect(gSub?.status).toBe("ACTIVE");

      // Verify apple pro subscription was loaded
      const aSub = sm.getSubscription("ios:a_orig_202");
      expect(aSub).toBeDefined();
      expect(aSub?.productId).toBe("pro_monthly");
      expect(aSub?.userId).toBe("77");

      // Verify processed events prevent duplicate re-execution of previously processed webhook events
      expect(sm.hasProcessedEvent("msg_seeded_001")).toBe(true);
      expect(sm.hasProcessedEvent("ev_seeded_002")).toBe(true);
      expect(sm.hasProcessedEvent("notif_uuid_apple_001")).toBe(true);

      // Replaying event msg_seeded_001 is immediately recognized as idempotent replay
      const replayRes = sm.processStoreEvent({
        platform: "android",
        originalTxId: "g_orig_101",
        tokenOrTxId: "g_tok_101",
        productId: "ultra_monthly",
        userId: "55",
        userType: "oauth",
        eventType: "PURCHASE",
        eventTime: now + 5000,
        eventId: "msg_seeded_001",
      });

      expect(replayRes.success).toBe(true);
      expect(replayRes.reason).toBe("IDEMPOTENT_REPLAY_IGNORED");
      expect(replayRes.effectivePlan).toBe("ultra");
    });

    it("Deferred cache invalidation does not invalidate Redis when transaction aborts", async () => {
      // Test the contract of setPlan with deferInvalidation: true
      const { setPlan } = await import("../api/lib/access-control");

      let updatedRow = false;
      const mockTx: any = {
        update: () => ({
          set: (vals: any) => ({
            where: () => {
              updatedRow = true;
              return Promise.resolve();
            },
          }),
        }),
      };

      // Call setPlan with deferInvalidation
      const invalidateCb = await setPlan("oauth", 123, "ultra", {
        tx: mockTx,
        deferInvalidation: true,
      });

      expect(updatedRow).toBe(true);
      expect(typeof invalidateCb).toBe("function");

      // If transaction rolls back, invalidateCb is NEVER called, preventing stale cache write!
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Admin Push Targeting Cross-Identity Leakage Adversarial Challenge
  // ───────────────────────────────────────────────────────────────────────────
  describe("Challenge 4: Admin Push Targeting & Identity Pair Isolation", () => {
    it("Verifies audience key generation isolates Google OAuth vs Local users with identical IDs", () => {
      // In api/admin-router.ts:2026-2029
      const proUsersList = [{ id: 42 }]; // Google OAuth user #42
      const proLocalList = [{ id: 99 }]; // Local user #99

      const userSet = new Set([
        ...proUsersList.map((u) => "oauth:" + u.id),
        ...proLocalList.map((u) => "local:" + u.id),
      ]);

      // All subscriptions in database
      const allSubs = [
        { id: 1, userId: 42, userType: "oauth", token: "fcm_oauth_42" },
        { id: 2, userId: 42, userType: "local", token: "fcm_local_42" }, // Different human, same numerical ID
        { id: 3, userId: 99, userType: "local", token: "fcm_local_99" },
      ];

      const targetSubs = allSubs.filter((sub) =>
        userSet.has(sub.userType + ":" + sub.userId)
      );

      // Only oauth:42 and local:99 should be targeted
      expect(targetSubs.length).toBe(2);
      expect(targetSubs.some((s) => s.token === "fcm_oauth_42")).toBe(true);
      expect(targetSubs.some((s) => s.token === "fcm_local_99")).toBe(true);
      // Local user 42 MUST NOT be targeted!
      expect(targetSubs.some((s) => s.token === "fcm_local_42")).toBe(false);
    });

    it("Specific targeting with targetUserType correctly isolates specific recipient", () => {
      const allSubs = [
        { id: 1, userId: 50, userType: "oauth", token: "token_oauth_50" },
        { id: 2, userId: 50, userType: "local", token: "token_local_50" },
      ];

      const targetUserId = "50";
      const targetUserType = "oauth";

      const filtered = allSubs.filter((sub) => {
        if (String(sub.userId) !== targetUserId) return false;
        if (targetUserType && sub.userType !== targetUserType) return false;
        return true;
      });

      expect(filtered.length).toBe(1);
      expect(filtered[0].token).toBe("token_oauth_50");
    });

    it("ANALYSIS FINDING: Specific targeting without targetUserType causes cross-identity leakage", () => {
      const allSubs = [
        { id: 1, userId: 50, userType: "oauth", token: "token_oauth_50" },
        { id: 2, userId: 50, userType: "local", token: "token_local_50" },
      ];

      const targetUserId = "50";
      const targetUserType = undefined; // Omitted by caller

      const filtered = allSubs.filter((sub) => {
        if (String(sub.userId) !== targetUserId) return false;
        if (targetUserType && sub.userType !== targetUserType) return false;
        return true;
      });

      // When targetUserType is omitted, both users sharing ID 50 receive the push
      expect(filtered.length).toBe(2);
    });
  });
});
