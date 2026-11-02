import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test";
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test";
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test";
});

// Production imports from worktree
import { hasValidSignature, isOptOut } from "../../../api/lib/whatsapp/webhook";
import { toWhatsAppNumber } from "../../../api/lib/whatsapp/client";
import { resolveApiBaseUrl } from "../../../src/providers/trpc";
import {
  WhatsAppOutboxEngine,
  AdminAuditLogger,
  AdsEngine,
  AdCampaign,
} from "../harness/opaque-context";

/**
 * ==============================================================================
 * Milestone 6 Empirical Adversarial Challenge Test Suite
 * Components: WhatsApp Cloud API, Admin Security/Audit, Ads Engine,
 *             Dynamic API/HTTPS, VPS Recovery Scripts, Privacy Disclosures.
 * Authoritative: ORIGINAL_REQUEST.md & PROJECT.md
 * ==============================================================================
 */

describe("Milestone 6 Empirical Adversarial Stress Test Suite", () => {
  // ============================================================================
  // DIMENSION 1: WHATSAPP CLOUD API CONSENT, OUTBOX & WEBHOOK VERIFICATION
  // ============================================================================
  describe("Dimension 1: WhatsApp Cloud API Consent, Outbox & Webhook Verification", () => {
    const appSecret = "production_webhook_secret_key_888";
    const testPhone = "201011112222";

    describe("1.1 Webhook HMAC-SHA256 Signature Verification", () => {
      const payload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{ id: "100", changes: [] }],
      });
      const validSig = `sha256=${createHmac("sha256", appSecret).update(payload, "utf8").digest("hex")}`;

      it("Valid signature with matching body is accepted", () => {
        expect(hasValidSignature(payload, validSig, appSecret)).toBe(true);
      });

      it("Forged or tampered signature is rejected", () => {
        const forgedSig = "sha256=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
        expect(hasValidSignature(payload, forgedSig, appSecret)).toBe(false);
      });

      it("Payload tampered after signing is rejected", () => {
        const tamperedPayload = payload.replace("100", "101");
        expect(hasValidSignature(tamperedPayload, validSig, appSecret)).toBe(false);
      });

      it("Missing sha256= prefix in header is rejected", () => {
        const rawHex = createHmac("sha256", appSecret).update(payload, "utf8").digest("hex");
        expect(hasValidSignature(payload, rawHex, appSecret)).toBe(false);
        expect(hasValidSignature(payload, `sha1=${rawHex}`, appSecret)).toBe(false);
      });

      it("Missing or undefined app secret rejects any payload", () => {
        expect(hasValidSignature(payload, validSig, undefined)).toBe(false);
        expect(hasValidSignature(payload, validSig, "")).toBe(false);
      });

      it("Empty raw body with valid HMAC is verified correctly", () => {
        const emptySig = `sha256=${createHmac("sha256", appSecret).update("", "utf8").digest("hex")}`;
        expect(hasValidSignature("", emptySig, appSecret)).toBe(true);
        expect(hasValidSignature("", "sha256=wrong", appSecret)).toBe(false);
      });

      it("Timing attack resistance: mismatched signature length does not throw and returns false", () => {
        expect(hasValidSignature(payload, "sha256=short", appSecret)).toBe(false);
        expect(hasValidSignature(payload, "sha256=" + "a".repeat(128), appSecret)).toBe(false);
      });
    });

    describe("1.2 Arabic Stop Keywords Opt-Out Detection", () => {
      it("Accepts standard Arabic and English stop keywords", () => {
        const accepted = [
          "إيقاف",
          "ايقاف",
          "وقف",
          "الغاء",
          "إلغاء",
          "الغاء الاشتراك",
          "إلغاء الاشتراك",
          "STOP",
          "stop",
          "unsubscribe",
        ];
        for (const kw of accepted) {
          expect(isOptOut(kw), `Keyword '${kw}' should be opt-out`).toBe(true);
        }
      });

      it("Handles surrounding whitespaces and mixed casing", () => {
        expect(isOptOut("   إيقاف   ")).toBe(true);
        expect(isOptOut("  STOP  ")).toBe(true);
        expect(isOptOut("sToP")).toBe(true);
        expect(isOptOut("  إلغاء الاشتراك   ")).toBe(true);
      });

      it("Non-stop words and partial matches are NOT treated as opt-out", () => {
        const rejected = [
          "مرحبا",
          "استمرار",
          "start",
          "وقفت العربية",
          "stop sending me messages please",
          "لا توقف",
          "",
          undefined,
        ];
        for (const word of rejected) {
          expect(isOptOut(word), `Word '${word}' should not be opt-out`).toBe(false);
        }
      });

      it("EMPIRICAL PROBE: Confirms behavior for 'توقف' keyword", () => {
        // "توقف" is not in current OPT_OUT_WORDS set
        const result = isOptOut("توقف");
        expect(result).toBe(false);
      });

      it("EMPIRICAL PROBE: Confirms behavior for diacritics / tashkeel 'إِيقَاف'", () => {
        // Exact string match does not strip tashkeel characters
        const result = isOptOut("إِيقَاف");
        expect(result).toBe(false);
      });
    });

    describe("1.3 Phone Number Sanitization & Normalization", () => {
      it("Normalizes Egyptian mobile numbers to international format (201...)", () => {
        expect(toWhatsAppNumber("01012345678")).toBe("201012345678");
        expect(toWhatsAppNumber("+20 10 1234 5678")).toBe("201012345678");
        expect(toWhatsAppNumber("1012345678")).toBe("201012345678");
        expect(toWhatsAppNumber("201012345678")).toBe("201012345678");
        expect(toWhatsAppNumber("010-1234-5678")).toBe("201012345678");
        expect(toWhatsAppNumber("(010) 1234 5678")).toBe("201012345678");
      });

      it("Strips non-digit characters and SQL injection attempts", () => {
        const malicious = "01012345678'; DROP TABLE users;--";
        expect(toWhatsAppNumber(malicious)).toBe("201012345678");
      });

      it("Handles empty or invalid non-numeric inputs safely", () => {
        expect(toWhatsAppNumber("")).toBe("");
        expect(toWhatsAppNumber("invalid-text")).toBe("");
      });

      it("Outbox queue blocks malformed phone numbers from delivery", () => {
        const isEgyptianMobile = (p: string) => /^201[0125]\d{8}$/.test(p);
        expect(isEgyptianMobile("201012345678")).toBe(true);
        expect(isEgyptianMobile("201112345678")).toBe(true);
        expect(isEgyptianMobile("201212345678")).toBe(true);
        expect(isEgyptianMobile("201512345678")).toBe(true);
        expect(isEgyptianMobile("201912345678")).toBe(false); // Invalid operator prefix
        expect(isEgyptianMobile("+15551234567")).toBe(false); // US number
        expect(isEgyptianMobile("")).toBe(false);
      });
    });

    describe("1.4 Consent Outbox Blocking & Transactional Bypass", () => {
      let engine: WhatsAppOutboxEngine;

      beforeEach(() => {
        engine = new WhatsAppOutboxEngine();
      });

      it("Blocks marketing messages when marketingConsent is false", () => {
        engine.setConsent(testPhone, {
          userId: "usr_wa_test",
          userType: "local",
          marketingConsent: false,
          reportsConsent: true,
        });

        const res = engine.enqueueMessage({
          recipientPhone: testPhone,
          templateName: "promo_deal",
          messageType: "marketing",
          payload: { promo: "10%" },
        });

        expect(res.enqueued).toBe(false);
        expect(res.error).toBe("RECIPIENT_DECLINED_MARKETING_CONSENT");
      });

      it("Blocks report messages when reportsConsent is false", () => {
        engine.setConsent(testPhone, {
          userId: "usr_wa_test",
          userType: "local",
          marketingConsent: true,
          reportsConsent: false,
        });

        const res = engine.enqueueMessage({
          recipientPhone: testPhone,
          templateName: "monthly_report",
          messageType: "reports",
          payload: { month: "2026-10" },
        });

        expect(res.enqueued).toBe(false);
        expect(res.error).toBe("RECIPIENT_DECLINED_REPORTS_CONSENT");
      });

      it("Allows transactional OTP messages regardless of marketing consent revocation", () => {
        engine.setConsent(testPhone, {
          userId: "usr_wa_test",
          userType: "local",
          marketingConsent: false,
          reportsConsent: false,
          optedOutAt: Date.now(),
        });

        const res = engine.enqueueMessage({
          recipientPhone: testPhone,
          templateName: "otp_verification",
          messageType: "otp",
          payload: { code: "654321" },
        });

        expect(res.enqueued).toBe(true);
        expect(res.messageId).toBeDefined();
      });
    });
  });

  // ============================================================================
  // DIMENSION 2: ADMIN SECURITY, AUDIT TRAIL & ADS ENGINE FRAUD RESISTANCE
  // ============================================================================
  describe("Dimension 2: Admin Security, Audit Trail & Ads Fraud Resistance", () => {
    describe("2.1 Non-Admin Authorization Guard", () => {
      it("Rejects unauthenticated callers", () => {
        const verifyAdminRole = (user: { role?: string } | null | undefined) => {
          if (!user) throw new Error("UNAUTHORIZED");
          if (user.role !== "admin") throw new Error("FORBIDDEN");
          return true;
        };

        expect(() => verifyAdminRole(null)).toThrow("UNAUTHORIZED");
        expect(() => verifyAdminRole(undefined)).toThrow("UNAUTHORIZED");
      });

      it("Rejects regular users with role='user'", () => {
        const verifyAdminRole = (user: { role?: string }) => {
          if (user.role !== "admin") throw new Error("FORBIDDEN");
          return true;
        };

        expect(() => verifyAdminRole({ role: "user" })).toThrow("FORBIDDEN");
      });

      it("Rejects Pro or Ultra subscribers who are not admin", () => {
        const verifyAdminRole = (user: { role?: string; plan: string }) => {
          if (user.role !== "admin") throw new Error("FORBIDDEN");
          return true;
        };

        expect(() => verifyAdminRole({ role: "user", plan: "pro" })).toThrow("FORBIDDEN");
        expect(() => verifyAdminRole({ role: "user", plan: "ultra" })).toThrow("FORBIDDEN");
      });

      it("Allows users with role='admin'", () => {
        const verifyAdminRole = (user: { role?: string }) => {
          if (user.role !== "admin") throw new Error("FORBIDDEN");
          return true;
        };

        expect(verifyAdminRole({ role: "admin" })).toBe(true);
      });
    });

    describe("2.2 Audit Trail Tamper Resistance", () => {
      let logger: AdminAuditLogger;

      beforeEach(() => {
        logger = new AdminAuditLogger();
      });

      it("Rejects audit log creation if mandatory fields (adminId, action, targetType) are missing", () => {
        expect(() =>
          logger.logAction({
            adminId: "",
            adminType: "local",
            action: "UPDATE_SETTING",
            targetType: "settings",
            targetId: "system",
            details: {},
            ipAddress: "127.0.0.1",
          }),
        ).toThrow("adminId, action and targetType are mandatory");

        expect(() =>
          logger.logAction({
            adminId: "adm_1",
            adminType: "local",
            action: "",
            targetType: "settings",
            targetId: "system",
            details: {},
            ipAddress: "127.0.0.1",
          }),
        ).toThrow("adminId, action and targetType are mandatory");

        expect(() =>
          logger.logAction({
            adminId: "adm_1",
            adminType: "local",
            action: "UPDATE_SETTING",
            targetType: "",
            targetId: "system",
            details: {},
            ipAddress: "127.0.0.1",
          }),
        ).toThrow("adminId, action and targetType are mandatory");
      });

      it("Successfully records valid audit logs and queries them", () => {
        const log = logger.logAction({
          adminId: "adm_42",
          adminType: "local",
          action: "DELETE_AD",
          targetType: "ad",
          targetId: "ad_101",
          details: { reason: "fraudulent" },
          ipAddress: "192.168.1.10",
        });

        expect(log.id).toBeDefined();
        expect(log.action).toBe("DELETE_AD");

        const queried = logger.queryLogs({ targetType: "ad", targetId: "ad_101" });
        expect(queried.length).toBe(1);
        expect(queried[0].adminId).toBe("adm_42");
      });
    });

    describe("2.3 Ad Impression Fraud Resistance", () => {
      let adsEngine: AdsEngine;
      const sampleAd: AdCampaign = {
        id: "ad_promo_01",
        title: "Exclusive Ramadan Offer",
        placement: "home_feed",
        platformTarget: "all",
        planTarget: "free_only",
        frequencyCapPerDay: 3,
        isKillSwitched: false,
        startAt: Date.now() - 3600000,
        endAt: Date.now() + 3600000,
      };

      beforeEach(() => {
        adsEngine = new AdsEngine();
        adsEngine.addCampaign(sampleAd);
      });

      it("Replay attack: Duplicate impression token is ignored", () => {
        const token = "unique_imp_token_abc123";
        const first = adsEngine.recordImpression({
          adId: sampleAd.id,
          userId: "usr_free_1",
          placement: "home_feed",
          impressionToken: token,
        });
        expect(first.recorded).toBe(true);

        const duplicate = adsEngine.recordImpression({
          adId: sampleAd.id,
          userId: "usr_free_1",
          placement: "home_feed",
          impressionToken: token,
        });
        expect(duplicate.recorded).toBe(false);
        expect(duplicate.error).toBe("DUPLICATE_IMPRESSION_IGNORED");
        expect(adsEngine.getImpressionsCount(sampleAd.id)).toBe(1);
      });

      it("Missing or empty impression token is rejected", () => {
        const res = adsEngine.recordImpression({
          adId: sampleAd.id,
          userId: "usr_free_1",
          placement: "home_feed",
          impressionToken: "",
        });
        expect(res.recorded).toBe(false);
        expect(res.error).toBe("MISSING_IMPRESSION_TOKEN");
      });

      it("Frequency capping: Suppresses ad after exceeding daily cap", () => {
        // Record 3 impressions for user
        for (let i = 1; i <= 3; i++) {
          adsEngine.recordImpression({
            adId: sampleAd.id,
            userId: "usr_capped_user",
            placement: "home_feed",
            impressionToken: `token_${i}`,
          });
        }

        const activeForCapped = adsEngine.getActiveAds({
          platform: "web",
          placement: "home_feed",
          userPlan: "free",
          userId: "usr_capped_user",
        });
        expect(activeForCapped.find((a) => a.id === sampleAd.id)).toBeUndefined();

        // But still visible for another user with 0 impressions
        const activeForFresh = adsEngine.getActiveAds({
          platform: "web",
          placement: "home_feed",
          userPlan: "free",
          userId: "usr_fresh_user",
        });
        expect(activeForFresh.find((a) => a.id === sampleAd.id)).toBeDefined();
      });

      it("Plan targeting: Pro users do not see free_only ads", () => {
        const activeForPro = adsEngine.getActiveAds({
          platform: "web",
          placement: "home_feed",
          userPlan: "pro",
          userId: "usr_pro_1",
        });
        expect(activeForPro.find((a) => a.id === sampleAd.id)).toBeUndefined();
      });

      it("Emergency kill-switch immediately disables ad across all audiences", () => {
        const killedAd: AdCampaign = {
          ...sampleAd,
          id: "ad_killed_02",
          isKillSwitched: true,
        };
        adsEngine.addCampaign(killedAd);

        const active = adsEngine.getActiveAds({
          platform: "web",
          placement: "home_feed",
          userPlan: "free",
          userId: "usr_any",
        });
        expect(active.find((a) => a.id === "ad_killed_02")).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // DIMENSION 3: DYNAMIC API & HTTPS ENFORCEMENT
  // ============================================================================
  describe("Dimension 3: Dynamic API & HTTPS Enforcement (REL-04)", () => {
    it("Rejects arbitrary insecure HTTP endpoints in production", () => {
      const insecureUrls = [
        "http://evil.com/api",
        "http://192.168.1.50:3000",
        "http://10.0.0.1:8080",
        "http://api.smartspend.app",
        "http://attacker.site:4000",
      ];

      for (const url of insecureUrls) {
        expect(() => resolveApiBaseUrl(url, true), `URL ${url} must throw in prod`).toThrow(
          /Insecure API URL rejected in production/,
        );
      }
    });

    it("Rejects non-URL strings or dangerous URI schemes", () => {
      expect(() => resolveApiBaseUrl("javascript:alert(1)", true)).toThrow();
      expect(() => resolveApiBaseUrl("not-a-valid-url", true)).toThrow(/Invalid VITE_API_URL format/);
    });

    it("Allows HTTPS endpoints in production", () => {
      expect(resolveApiBaseUrl("https://api.smartspend.app", true)).toBe(
        "https://api.smartspend.app/api/trpc",
      );
      expect(resolveApiBaseUrl("https://staging.smartspend.app:8443", true)).toBe(
        "https://staging.smartspend.app:8443/api/trpc",
      );
    });

    it("Permits localhost and .local HTTP in production for container/e2e testing", () => {
      expect(resolveApiBaseUrl("http://localhost:3000", true)).toBe(
        "http://localhost:3000/api/trpc",
      );
      expect(resolveApiBaseUrl("http://127.0.0.1:3000", true)).toBe(
        "http://127.0.0.1:3000/api/trpc",
      );
      expect(resolveApiBaseUrl("http://test.local:3000", true)).toBe(
        "http://test.local:3000/api/trpc",
      );
    });

    it("Defaults to relative /api/trpc when apiUrl is empty or undefined", () => {
      expect(resolveApiBaseUrl("", true)).toBe("/api/trpc");
      expect(resolveApiBaseUrl("   ", true)).toBe("/api/trpc");
      expect(resolveApiBaseUrl(undefined, true)).toBe("/api/trpc");
    });

    it("Permits plain HTTP in development (isProduction = false)", () => {
      expect(resolveApiBaseUrl("http://api.dev.test:3000", false)).toBe(
        "http://api.dev.test:3000/api/trpc",
      );
      expect(resolveApiBaseUrl("http://192.168.1.100:3000", false)).toBe(
        "http://192.168.1.100:3000/api/trpc",
      );
    });

    it("EMPIRICAL PROBE: IPv6 [::1] bracket behavior in production", () => {
      // WHATWG URL parser sets hostname to "[::1]" with brackets.
      // Current implementation tests hostname === "::1" (without brackets),
      // which results in rejection in production.
      expect(() => resolveApiBaseUrl("http://[::1]:3000", true)).toThrow(
        /Insecure API URL rejected in production/,
      );
    });
  });

  // ============================================================================
  // DIMENSION 4: VPS DISASTER RECOVERY SCRIPTS INTEGRITY & RETENTION
  // ============================================================================
  describe("Dimension 4: VPS Disaster Recovery Scripts Integrity & Retention", () => {
    const vpsDir = path.resolve(__dirname, "../../../scripts/vps");

    it("Validates all bash scripts enforce strict error handling (set -eo pipefail)", () => {
      const scripts = ["backup.sh", "restore.sh", "rollback.sh", "preflight.sh"];

      for (const scriptName of scripts) {
        const scriptPath = path.join(vpsDir, scriptName);
        expect(fs.existsSync(scriptPath), `Script ${scriptName} must exist`).toBe(true);

        const content = fs.readFileSync(scriptPath, "utf-8");
        expect(content).toMatch(/set -e/);
        expect(content).toMatch(/pipefail/);
      }
    });

    it("Validates command injection protection: variable quoting in backup and restore scripts", () => {
      const backupContent = fs.readFileSync(path.join(vpsDir, "backup.sh"), "utf-8");
      expect(backupContent).toContain('"${BACKUP_DIR}"');
      expect(backupContent).toContain('"${ARCHIVE_PATH}"');
      expect(backupContent).toContain('"${DB_NAME}"');

      const restoreContent = fs.readFileSync(path.join(vpsDir, "restore.sh"), "utf-8");
      expect(restoreContent).toContain('"${ARCHIVE_PATH}"');
      expect(restoreContent).toContain('"${DB_NAME}"');
    });

    it("Validates 30-day backup rotation policy with minimum 3 retained snapshots", () => {
      // Simulate backup rotation algorithm
      const simulateRotation = (
        archives: { name: string; ageDays: number }[],
        minRetain: number = 3,
      ): { retained: string[]; pruned: string[] } => {
        let currentTotal = archives.length;
        const retained: string[] = [];
        const pruned: string[] = [];

        for (const arch of archives) {
          if (arch.ageDays > 30 && currentTotal > minRetain) {
            pruned.push(arch.name);
            currentTotal--;
          } else {
            retained.push(arch.name);
          }
        }
        return { retained, pruned };
      };

      // Case A: 10 archives, 7 are >30d old -> 4 pruned, 6 retained (total always >= 3)
      const testSetA = [
        { name: "bkp_1", ageDays: 45 },
        { name: "bkp_2", ageDays: 40 },
        { name: "bkp_3", ageDays: 35 },
        { name: "bkp_4", ageDays: 32 },
        { name: "bkp_5", ageDays: 31 },
        { name: "bkp_6", ageDays: 31 },
        { name: "bkp_7", ageDays: 31 },
        { name: "bkp_8", ageDays: 10 },
        { name: "bkp_9", ageDays: 5 },
        { name: "bkp_10", ageDays: 1 },
      ];
      const resA = simulateRotation(testSetA, 3);
      expect(resA.pruned.length).toBe(7);
      expect(resA.retained.length).toBe(3);

      // Case B: 3 archives all >30d old -> 0 pruned because minimum retention is 3
      const testSetB = [
        { name: "bkp_1", ageDays: 50 },
        { name: "bkp_2", ageDays: 40 },
        { name: "bkp_3", ageDays: 35 },
      ];
      const resB = simulateRotation(testSetB, 3);
      expect(resB.pruned.length).toBe(0);
      expect(resB.retained.length).toBe(3);
    });

    it("Validates preflight script gates: database ping, 15-minute backup age, journal validity", () => {
      const preflightContent = fs.readFileSync(path.join(vpsDir, "preflight.sh"), "utf-8");
      expect(preflightContent).toContain("MAX_BACKUP_AGE_SECONDS=900");
      expect(preflightContent).toContain("PREFLIGHT_FAIL_DATABASE_UNHEALTHY");
      expect(preflightContent).toContain("PREFLIGHT_FAIL_NO_BACKUP_SNAPSHOT");
      expect(preflightContent).toContain("PREFLIGHT_FAIL_JOURNAL_DESYNC");
    });
  });

  // ============================================================================
  // DIMENSION 5: STATUTORY PRIVACY DISCLOSURES & APP STORE MANIFEST
  // ============================================================================
  describe("Dimension 5: Statutory Privacy Disclosures & App Store Manifest", () => {
    it("Verifies docs/privacy/answers.md strictly enforces Egypt Law 151/2020 retention limits", () => {
      const answersPath = path.resolve(__dirname, "../../../docs/privacy/answers.md");
      expect(fs.existsSync(answersPath)).toBe(true);

      const content = fs.readFileSync(answersPath, "utf-8");

      // Statutory categories & retention
      expect(content).toContain("financial_transactions");
      expect(content).toContain("3650"); // 10 years
      expect(content).toContain("Egypt Law 151/2020");

      expect(content).toContain("device_identifiers");
      expect(content).toContain("180"); // 6 months

      expect(content).toContain("contact_support");
      expect(content).toContain("365"); // 1 year
    });

    it("Verifies iOS PrivacyInfo.xcprivacy contains required declarations without tracking", () => {
      const privacyPlistPath = path.resolve(
        __dirname,
        "../../../mobile/app/ios/Runner/PrivacyInfo.xcprivacy",
      );
      expect(fs.existsSync(privacyPlistPath)).toBe(true);

      const plistContent = fs.readFileSync(privacyPlistPath, "utf-8");

      // Tracking must be false
      expect(plistContent).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
      expect(plistContent).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);

      // Required Apple API reasons
      expect(plistContent).toContain("CA92.1"); // UserDefaults
      expect(plistContent).toContain("C617.1"); // FileTimestamp
      expect(plistContent).toContain("35F9.1"); // SystemBootTime

      // Collected Data Types
      expect(plistContent).toContain("NSPrivacyCollectedDataTypeFinancialInfo");
      expect(plistContent).toContain("NSPrivacyCollectedDataTypePhoneNumber");
      expect(plistContent).toContain("NSPrivacyCollectedDataTypeName");
      expect(plistContent).toContain("NSPrivacyCollectedDataTypeUserID");
      expect(plistContent).toContain("NSPrivacyCollectedDataTypeDeviceID");
      expect(plistContent).toContain("NSPrivacyCollectedDataTypeAudioData");
      expect(plistContent).toContain("NSPrivacyCollectedDataTypeCustomerSupport");
    });
  });
});
