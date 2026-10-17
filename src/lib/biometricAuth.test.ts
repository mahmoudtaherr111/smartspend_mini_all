/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BIOMETRIC_CONSTANTS,
  getUserStorageKey,
  isPlatformAuthenticatorAvailable,
  getBiometricLockEnabled,
  setBiometricLockEnabled,
  getBiometricGracePeriod,
  setBiometricGracePeriod,
  getBiometricPinHash,
  setBiometricPin,
  verifyBiometricPin,
  removeBiometricPin,
  getLastUnlockedTimestamp,
  setLastUnlockedTimestamp,
  getLastActiveTimestamp,
  setLastActiveTimestamp,
  BIOMETRIC_PROMPT,
  readBiometricPromptRecord,
  writeLocalBiometricPromptRecord,
  shouldShowBiometricPrompt,
  authenticateLocalBiometrics,
} from "./biometricAuth";

describe("Biometric Authentication & Local App Lock Utilities", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("1. User Storage Key Isolation", () => {
    it("generates scoped keys for local and oauth users", () => {
      expect(getUserStorageKey({ id: 42, type: "local" })).toBe("local_42");
      expect(getUserStorageKey({ id: 101, type: "oauth" })).toBe("oauth_101");
      expect(getUserStorageKey(null)).toBe("anonymous");
    });
  });

  describe("2. Platform Authenticator Detection", () => {
    it("returns true when PublicKeyCredential platform authenticator is available", async () => {
      const mockIsAvailable = vi.fn().mockResolvedValue(true);
      (globalThis as any).window.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: mockIsAvailable,
      };

      const result = await isPlatformAuthenticatorAvailable();
      expect(result).toBe(true);
      expect(mockIsAvailable).toHaveBeenCalledTimes(1);
    });

    it("returns false when PublicKeyCredential platform authenticator is unavailable", async () => {
      const mockIsAvailable = vi.fn().mockResolvedValue(false);
      (globalThis as any).window.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: mockIsAvailable,
      };

      const result = await isPlatformAuthenticatorAvailable();
      expect(result).toBe(false);
    });

    it("gracefully catches errors and returns false", async () => {
      const mockIsAvailable = vi.fn().mockRejectedValue(new Error("SecurityError"));
      (globalThis as any).window.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: mockIsAvailable,
      };

      const result = await isPlatformAuthenticatorAvailable();
      expect(result).toBe(false);
    });
  });

  describe("3. Device-Scoped Storage Settings", () => {
    const userKey = "local_123";

    it("manages biometric lock enabled state per user and device", () => {
      expect(getBiometricLockEnabled(userKey)).toBe(false);
      setBiometricLockEnabled(userKey, true);
      expect(getBiometricLockEnabled(userKey)).toBe(true);
      setBiometricLockEnabled(userKey, false);
      expect(getBiometricLockEnabled(userKey)).toBe(false);
    });

    it("manages biometric grace period with fallback to 30s", () => {
      expect(getBiometricGracePeriod(userKey)).toBe(30000);
      setBiometricGracePeriod(userKey, 60000);
      expect(getBiometricGracePeriod(userKey)).toBe(60000);
    });

    it("manages and verifies 4-digit PIN hash correctly with Arabic-Indic digit normalization", async () => {
      expect(getBiometricPinHash(userKey)).toBeNull();
      await setBiometricPin(userKey, "١٢٣٤"); // Arabic-Indic digits
      expect(getBiometricPinHash(userKey)).not.toBeNull();

      // Can verify with ASCII or Arabic-Indic
      const isCorrectAscii = await verifyBiometricPin(userKey, "1234");
      const isCorrectArabic = await verifyBiometricPin(userKey, "١٢٣٤");
      const isWrong = await verifyBiometricPin(userKey, "9999");
      expect(isCorrectAscii).toBe(true);
      expect(isCorrectArabic).toBe(true);
      expect(isWrong).toBe(false);

      removeBiometricPin(userKey);
      expect(getBiometricPinHash(userKey)).toBeNull();

      // Reject non-4-digit or invalid PINs
      await setBiometricPin(userKey, "123");
      expect(getBiometricPinHash(userKey)).toBeNull();
      await setBiometricPin(userKey, "12345");
      expect(getBiometricPinHash(userKey)).toBeNull();
      await setBiometricPin(userKey, "abcd");
      expect(getBiometricPinHash(userKey)).toBeNull();
    });

    it("enforces PIN brute-force lockout after 5 consecutive failed attempts", async () => {
      await setBiometricPin(userKey, "1234");

      // 4 wrong attempts
      expect(await verifyBiometricPin(userKey, "0001")).toBe(false);
      expect(await verifyBiometricPin(userKey, "0002")).toBe(false);
      expect(await verifyBiometricPin(userKey, "0003")).toBe(false);
      expect(await verifyBiometricPin(userKey, "0004")).toBe(false);

      // 5th wrong attempt triggers lockout
      expect(await verifyBiometricPin(userKey, "0005")).toBe(false);

      // Even correct PIN is blocked during lockout
      expect(await verifyBiometricPin(userKey, "1234")).toBe(false);
    });

    it("tracks last unlocked and active timestamps with device and user isolation", () => {
      const now = Date.now();
      const userA = "local_1";
      const userB = "local_2";

      setLastUnlockedTimestamp(now, userA);
      expect(getLastUnlockedTimestamp(userA)).toBe(now);
      expect(getLastUnlockedTimestamp(userB)).toBe(0);

      setLastActiveTimestamp(now - 5000, userA);
      expect(getLastActiveTimestamp(userA)).toBe(now - 5000);
      expect(getLastActiveTimestamp(userB)).not.toBe(now - 5000);

      // Unscoped legacy key does not pollute specific userKey
      localStorage.setItem("smartspend_biometric_last_unlocked", (now + 10000).toString());
      expect(getLastUnlockedTimestamp("local_99")).toBe(0);
      expect(getLastUnlockedTimestamp("default")).toBe(now + 10000);
      expect(getLastUnlockedTimestamp("anonymous")).toBe(now + 10000);
    });
  });

  describe("4. The fingerprint / Face ID suggestion", () => {
    const userKey = "oauth_55";
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.UTC(2026, 9, 17);
    const fresh = { dismissals: 0, lastShownAt: null };
    const base = { isHardwareAvailable: true, hasPasskey: false, record: fresh, isSignUpSession: false, shownThisSession: false, now };

    it("appears at once on a capable device without a passkey; no timer", () => {
      expect(shouldShowBiometricPrompt(base)).toBe(true);
    });

    it("never when the device can't, a passkey exists, in the sign-up session, or twice in a session", () => {
      expect(shouldShowBiometricPrompt({ ...base, isHardwareAvailable: false })).toBe(false);
      expect(shouldShowBiometricPrompt({ ...base, hasPasskey: true })).toBe(false);
      expect(shouldShowBiometricPrompt({ ...base, isSignUpSession: true })).toBe(false);
      expect(shouldShowBiometricPrompt({ ...base, shownThisSession: true })).toBe(false);
    });

    it("waits 14 days between appearances and stops after two 'Not now'", () => {
      expect(shouldShowBiometricPrompt({ ...base, record: { dismissals: 1, lastShownAt: now - 5 * DAY } })).toBe(false);
      expect(shouldShowBiometricPrompt({ ...base, record: { dismissals: 1, lastShownAt: now - BIOMETRIC_PROMPT.COOLDOWN_MS } })).toBe(true);
      expect(shouldShowBiometricPrompt({ ...base, record: { dismissals: 2, lastShownAt: now - 60 * DAY } })).toBe(false);
    });

    it("keeps the record in the profile, so a new device does not start over, and takes this device's copy too", () => {
      expect(
        readBiometricPromptRecord({ biometricPromptDismissals: 2, biometricPromptLastShownAt: "2026-10-01T00:00:00.000Z" }, userKey),
      ).toEqual({ dismissals: 2, lastShownAt: Date.parse("2026-10-01T00:00:00.000Z") });
      writeLocalBiometricPromptRecord(userKey, { dismissals: 1, lastShownAt: now });
      expect(readBiometricPromptRecord({}, userKey)).toEqual({ dismissals: 1, lastShownAt: now });
      expect(readBiometricPromptRecord({ biometricPromptDismissals: 2 }, userKey).dismissals).toBe(2);
    });

    it("a passkey on the device no longer turns the app lock on", () => {
      localStorage.setItem(`smartspend_has_passkey_${userKey}`, "1");
      localStorage.setItem("smartspend_has_passkey", "1");
      expect(getBiometricLockEnabled(userKey)).toBe(false);
      setBiometricLockEnabled(userKey, true);
      expect(getBiometricLockEnabled(userKey)).toBe(true);
    });
  });

  describe("5. Zero-Latency Local Biometric Verification & Resilience Matrix", () => {
    beforeEach(() => {
      (globalThis as any).window.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
    });

    it("successfully verifies user locally with navigator.credentials.get", async () => {
      const mockGet = vi.fn().mockResolvedValue({ id: "credential_123" });
      (globalThis as any).navigator.credentials = { get: mockGet };

      const res = await authenticateLocalBiometrics();
      expect(res.success).toBe(true);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it("handles null/falsy credential resolution gracefully as a failure without bypassing auth", async () => {
      const mockGet = vi.fn().mockResolvedValue(null);
      (globalThis as any).navigator.credentials = { get: mockGet };

      const res = await authenticateLocalBiometrics();
      expect(res.success).toBe(false);
      expect(res.reason).toBe("cancelled");
    });

    it("handles user cancellation (AbortError) gracefully without throwing or freezing", async () => {
      const abortErr = new Error("User cancelled");
      abortErr.name = "AbortError";
      (globalThis as any).navigator.credentials = {
        get: vi.fn().mockRejectedValue(abortErr),
      };

      const res = await authenticateLocalBiometrics();
      expect(res.success).toBe(false);
      expect(res.reason).toBe("cancelled");
      expect(res.message).toContain("تم إلغاء التحقق بالبصمة");
    });

    it("handles NotAllowedError gracefully", async () => {
      const notAllowedErr = new Error("The operation either timed out or was not allowed.");
      notAllowedErr.name = "NotAllowedError";
      (globalThis as any).navigator.credentials = {
        get: vi.fn().mockRejectedValue(notAllowedErr),
      };

      const res = await authenticateLocalBiometrics();
      expect(res.success).toBe(false);
      expect(res.reason).toBe("not_allowed");
      expect(res.message).toContain("تم رفض أو إلغاء");
    });

    it("enforces safety timeout without crashing", async () => {
      // Simulating a hanging biometric prompt that gets aborted by the safety timeout
      (globalThis as any).navigator.credentials = {
        get: vi.fn().mockImplementation(
          ({ signal }) =>
            new Promise((_, reject) => {
              signal?.addEventListener("abort", () => {
                const err = new Error("Aborted by timeout");
                err.name = "AbortError";
                reject(err);
              });
            }),
        ),
      };

      const res = await authenticateLocalBiometrics({ timeoutMs: 50 });
      expect(res.success).toBe(false);
      expect(res.reason).toBe("timeout");
      expect(res.message).toContain("مهلة");
    });

    it("returns not_supported when platform authenticator is unavailable", async () => {
      (globalThis as any).window.PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false),
      };

      const res = await authenticateLocalBiometrics();
      expect(res.success).toBe(false);
      expect(res.reason).toBe("not_supported");
    });
  });
});
