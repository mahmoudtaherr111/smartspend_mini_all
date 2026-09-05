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
  getBiometricPromptCount,
  incrementBiometricPromptCount,
  getLastBiometricPromptTime,
  setLastBiometricPromptTime,
  isBiometricPromptOptedOut,
  setBiometricPromptOptedOut,
  shouldShowBiometricOnboarding,
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

  describe("4. Onboarding Rules & Frequency Capping", () => {
    const userKey = "oauth_55";
    const FIVE_MINUTES = 5 * 60 * 1000;
    const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;

    it("blocks onboarding when hardware is unavailable or biometrics already enrolled", () => {
      expect(
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: FIVE_MINUTES,
          isHardwareAvailable: false,
          hasBiometricsOrPasskey: false,
        }),
      ).toBe(false);

      expect(
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: FIVE_MINUTES,
          isHardwareAvailable: true,
          hasBiometricsOrPasskey: true,
        }),
      ).toBe(false);
    });

    it("blocks onboarding before 5-minute active session threshold", () => {
      expect(
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: 4 * 60 * 1000, // 4 mins
          isHardwareAvailable: true,
          hasBiometricsOrPasskey: false,
        }),
      ).toBe(false);
    });

    it("allows first suggestion at exactly 5 minutes of active session", () => {
      expect(
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: FIVE_MINUTES,
          isHardwareAvailable: true,
          hasBiometricsOrPasskey: false,
        }),
      ).toBe(true);
    });

    it("enforces 10-day cooldown between subsequent suggestions", () => {
      const lastPrompt = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago
      setLastBiometricPromptTime(userKey, lastPrompt);
      incrementBiometricPromptCount(userKey); // 1 prompt

      // Still in cooldown
      expect(
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: FIVE_MINUTES,
          isHardwareAvailable: true,
          hasBiometricsOrPasskey: false,
        }),
      ).toBe(false);

      // Cooldown expired (11 days ago)
      setLastBiometricPromptTime(userKey, Date.now() - 11 * 24 * 60 * 60 * 1000);
      expect(
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: FIVE_MINUTES,
          isHardwareAvailable: true,
          hasBiometricsOrPasskey: false,
        }),
      ).toBe(true);
    });

    it("enforces hard frequency cap of maximum 3 suggestions lifetime", () => {
      incrementBiometricPromptCount(userKey);
      incrementBiometricPromptCount(userKey);
      incrementBiometricPromptCount(userKey); // Count = 3
      setLastBiometricPromptTime(userKey, Date.now() - 20 * 24 * 60 * 60 * 1000);

      expect(
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: FIVE_MINUTES,
          isHardwareAvailable: true,
          hasBiometricsOrPasskey: false,
        }),
      ).toBe(false);
    });

    it("permanently stops prompts when opted out", () => {
      setBiometricPromptOptedOut(userKey, true);
      expect(isBiometricPromptOptedOut(userKey)).toBe(true);

      expect(
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: FIVE_MINUTES,
          isHardwareAvailable: true,
          hasBiometricsOrPasskey: false,
        }),
      ).toBe(false);
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
