/**
 * Biometric Authentication & Local App Lock Utilities
 * Supports WebAuthn Platform Authenticator (Face ID / Touch ID / Windows Hello / Android Biometrics)
 * and local offline app lock with zero network latency.
 */

export interface BiometricAuthResult {
  success: boolean;
  reason?: "cancelled" | "not_allowed" | "timeout" | "not_supported" | "error";
  message: string;
  error?: unknown;
}

export const BIOMETRIC_CONSTANTS = {
  /** First onboarding prompt triggers after exactly 5 minutes of active session */
  INITIAL_SESSION_DELAY_MS: 5 * 60 * 1000,
  /** 10 days cooldown between subsequent onboarding prompts */
  COOLDOWN_MS: 10 * 24 * 60 * 60 * 1000,
  /** Maximum 3 onboarding prompts lifetime per device/user */
  MAX_PROMPTS: 3,
  /** Default grace period on tab switch / background: 30 seconds */
  DEFAULT_GRACE_PERIOD_MS: 30 * 1000,
  /** Safety timeout for biometric verification: 12 seconds */
  SAFETY_TIMEOUT_MS: 12000,
} as const;

/**
 * Returns a device-scoped storage identifier for the user.
 */
export function getUserStorageKey(user?: { id?: number | string; type?: string } | null): string {
  if (!user) return "anonymous";
  return `${user.type || "local"}_${user.id || 0}`;
}

/**
 * Checks if the current hardware/browser supports a platform authenticator (Face ID / Fingerprint).
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
  ) {
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Device-Scoped Storage Accessors
// ─────────────────────────────────────────────────────────────────────────────

export function getBiometricLockEnabled(userKey: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const explicitlyDisabled =
      window.localStorage.getItem(`smartspend_biometric_lock_disabled_${userKey}`) === "1";
    if (explicitlyDisabled) return false;

    const explicitlyEnabled =
      window.localStorage.getItem(`smartspend_biometric_lock_enabled_${userKey}`) === "1";
    if (explicitlyEnabled) return true;

    // Auto-enable app lock whenever user has registered passkey on this device
    const hasPasskey =
      window.localStorage.getItem(`smartspend_has_passkey_${userKey}`) === "1" ||
      window.localStorage.getItem("smartspend_has_passkey") === "1";
    return hasPasskey;
  } catch {
    return false;
  }
}

export function setBiometricLockEnabled(userKey: string, enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (enabled) {
      window.localStorage.setItem(`smartspend_biometric_lock_enabled_${userKey}`, "1");
      window.localStorage.removeItem(`smartspend_biometric_lock_disabled_${userKey}`);
    } else {
      window.localStorage.removeItem(`smartspend_biometric_lock_enabled_${userKey}`);
      window.localStorage.setItem(`smartspend_biometric_lock_disabled_${userKey}`, "1");
    }
  } catch (e) {
    console.error("Failed to write biometric lock state:", e);
  }
}

export function getBiometricGracePeriod(userKey: string): number {
  if (typeof window === "undefined" || !window.localStorage) {
    return BIOMETRIC_CONSTANTS.DEFAULT_GRACE_PERIOD_MS;
  }
  try {
    const raw = window.localStorage.getItem(`smartspend_biometric_grace_period_${userKey}`);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch {}
  return BIOMETRIC_CONSTANTS.DEFAULT_GRACE_PERIOD_MS;
}

export function setBiometricGracePeriod(userKey: string, ms: number): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(`smartspend_biometric_grace_period_${userKey}`, ms.toString());
  } catch (e) {
    console.error("Failed to write grace period:", e);
  }
}

export function getBiometricPinHash(userKey: string): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(`smartspend_biometric_pin_hash_${userKey}`);
  } catch {
    return null;
  }
}

export const PIN_SECURITY_CONSTANTS = {
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 30 * 1000,
} as const;

/**
 * Normalizes Eastern Arabic-Indic and Persian digits (٠-٩, ۰-۹) to standard ASCII 0-9 digits.
 */
export function normalizeDigits(str: string): string {
  if (!str) return "";
  return str
    .replace(/[٠۰]/g, "0")
    .replace(/[١۱]/g, "1")
    .replace(/[٢۲]/g, "2")
    .replace(/[٣۳]/g, "3")
    .replace(/[٤۴]/g, "4")
    .replace(/[٥۵]/g, "5")
    .replace(/[٦۶]/g, "6")
    .replace(/[٧۷]/g, "7")
    .replace(/[٨۸]/g, "8")
    .replace(/[٩۹]/g, "9");
}

export function getPinFailedAttempts(userKey: string): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  try {
    const raw = window.localStorage.getItem(`smartspend_pin_failed_attempts_${userKey}`);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch {}
  return 0;
}

export function incrementPinFailedAttempts(userKey: string): number {
  const current = getPinFailedAttempts(userKey);
  const next = current + 1;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`smartspend_pin_failed_attempts_${userKey}`, next.toString());
      if (next >= PIN_SECURITY_CONSTANTS.MAX_FAILED_ATTEMPTS) {
        const lockoutUntil = Date.now() + PIN_SECURITY_CONSTANTS.LOCKOUT_DURATION_MS;
        window.localStorage.setItem(
          `smartspend_pin_lockout_until_${userKey}`,
          lockoutUntil.toString(),
        );
      }
    } catch {}
  }
  return next;
}

export function resetPinFailedAttempts(userKey: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(`smartspend_pin_failed_attempts_${userKey}`);
    window.localStorage.removeItem(`smartspend_pin_lockout_until_${userKey}`);
  } catch {}
}

export function getPinLockoutRemainingMs(userKey: string): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  try {
    const raw = window.localStorage.getItem(`smartspend_pin_lockout_until_${userKey}`);
    if (raw) {
      const lockoutUntil = parseInt(raw, 10);
      if (!isNaN(lockoutUntil)) {
        const remaining = lockoutUntil - Date.now();
        if (remaining > 0) return remaining;
        window.localStorage.removeItem(`smartspend_pin_lockout_until_${userKey}`);
      }
    }
  } catch {}
  return 0;
}

export function isPinLockedOut(userKey: string): boolean {
  return getPinLockoutRemainingMs(userKey) > 0;
}

export async function hashPin(pin: string): Promise<string> {
  const normalized = normalizeDigits(pin);
  const salted = `smartspend_pin_salt_${normalized}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const msgUint8 = new TextEncoder().encode(salted);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {}
  }
  // Simple deterministic fallback for non-crypto-subtle environments (e.g. test runner)
  let hash = 0;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fallback_${Math.abs(hash).toString(16)}`;
}

export async function setBiometricPin(userKey: string, pin: string): Promise<void> {
  const normalized = normalizeDigits(pin);
  if (!normalized || !/^\d{4}$/.test(normalized)) return;
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const hashed = await hashPin(normalized);
    window.localStorage.setItem(`smartspend_biometric_pin_hash_${userKey}`, hashed);
    resetPinFailedAttempts(userKey);
  } catch (e) {
    console.error("Failed to set PIN:", e);
  }
}

export async function verifyBiometricPin(userKey: string, pin: string): Promise<boolean> {
  if (isPinLockedOut(userKey)) return false;
  const normalized = normalizeDigits(pin);
  if (!normalized || !/^\d{4}$/.test(normalized)) return false;
  const storedHash = getBiometricPinHash(userKey);
  if (!storedHash) return false;
  const currentHash = await hashPin(normalized);
  const isMatch = storedHash === currentHash;
  if (isMatch) {
    resetPinFailedAttempts(userKey);
    return true;
  } else {
    incrementPinFailedAttempts(userKey);
    return false;
  }
}

export function removeBiometricPin(userKey: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(`smartspend_biometric_pin_hash_${userKey}`);
    resetPinFailedAttempts(userKey);
  } catch {}
}

export function getLastUnlockedTimestamp(userKey: string = "default"): number {
  if (typeof window === "undefined") return 0;
  try {
    let raw =
      window.sessionStorage?.getItem(`smartspend_biometric_last_unlocked_${userKey}`) ||
      window.localStorage?.getItem(`smartspend_biometric_last_unlocked_${userKey}`);
    if (!raw && (userKey === "default" || userKey === "anonymous")) {
      raw =
        window.sessionStorage?.getItem("smartspend_biometric_last_unlocked") ||
        window.localStorage?.getItem("smartspend_biometric_last_unlocked");
    }
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) return parsed;
    }
  } catch {}
  return 0;
}

export function setLastUnlockedTimestamp(ts: number, userKey: string = "default"): void {
  if (typeof window === "undefined") return;
  try {
    const str = ts.toString();
    window.sessionStorage?.setItem(`smartspend_biometric_last_unlocked_${userKey}`, str);
    window.localStorage?.setItem(`smartspend_biometric_last_unlocked_${userKey}`, str);
  } catch {}
}

export function getLastActiveTimestamp(userKey: string = "default"): number {
  if (typeof window === "undefined") return Date.now();
  try {
    let raw = window.localStorage?.getItem(`smartspend_biometric_last_active_${userKey}`);
    if (!raw && (userKey === "default" || userKey === "anonymous")) {
      raw = window.localStorage?.getItem("smartspend_biometric_last_active");
    }
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) return parsed;
    }
  } catch {}
  return Date.now();
}

export function setLastActiveTimestamp(ts: number, userKey: string = "default"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(`smartspend_biometric_last_active_${userKey}`, ts.toString());
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding & Frequency Capping Storage
// ─────────────────────────────────────────────────────────────────────────────

export function getBiometricPromptCount(userKey: string): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  try {
    const raw = window.localStorage.getItem(`smartspend_biometric_prompt_count_${userKey}`);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) return parsed;
    }
  } catch {}
  return 0;
}

export function incrementBiometricPromptCount(userKey: string): number {
  const current = getBiometricPromptCount(userKey);
  const next = current + 1;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`smartspend_biometric_prompt_count_${userKey}`, next.toString());
    } catch {}
  }
  return next;
}

export function getLastBiometricPromptTime(userKey: string): number | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(`smartspend_biometric_last_prompt_time_${userKey}`);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) return parsed;
    }
  } catch {}
  return null;
}

export function setLastBiometricPromptTime(userKey: string, ts: number): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      `smartspend_biometric_last_prompt_time_${userKey}`,
      ts.toString(),
    );
  } catch {}
}

export function isBiometricPromptOptedOut(userKey: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    return (
      window.localStorage.getItem(`smartspend_biometric_prompt_opted_out_${userKey}`) === "1"
    );
  } catch {
    return false;
  }
}

export function setBiometricPromptOptedOut(userKey: string, optedOut: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (optedOut) {
      window.localStorage.setItem(`smartspend_biometric_prompt_opted_out_${userKey}`, "1");
    } else {
      window.localStorage.removeItem(`smartspend_biometric_prompt_opted_out_${userKey}`);
    }
  } catch {}
}

export interface ShouldShowOnboardingParams {
  userKey: string;
  sessionDurationMs: number;
  isHardwareAvailable: boolean;
  hasBiometricsOrPasskey: boolean;
}

/**
 * Pure evaluation of whether the biometric onboarding modal/prompt should be displayed.
 */
export function shouldShowBiometricOnboarding({
  userKey,
  sessionDurationMs,
  isHardwareAvailable,
  hasBiometricsOrPasskey,
}: ShouldShowOnboardingParams): boolean {
  // 1. Must have hardware biometrics (Face ID / Fingerprint)
  if (!isHardwareAvailable) return false;

  // 2. Must not already have enrolled biometrics / passkey
  if (hasBiometricsOrPasskey) return false;

  // 3. Must not have opted out permanently
  if (isBiometricPromptOptedOut(userKey)) return false;

  // 4. Hard frequency cap: maximum 3 suggestions lifetime
  const promptCount = getBiometricPromptCount(userKey);
  if (promptCount >= BIOMETRIC_CONSTANTS.MAX_PROMPTS) return false;

  // 5. Must have completed active initial session threshold (5 minutes)
  if (sessionDurationMs < BIOMETRIC_CONSTANTS.INITIAL_SESSION_DELAY_MS) return false;

  // 6. Cooldown enforcement: 10-12 days between subsequent suggestions
  const lastPromptTime = getLastBiometricPromptTime(userKey);
  if (lastPromptTime !== null) {
    const elapsedSinceLastPrompt = Date.now() - lastPromptTime;
    if (elapsedSinceLastPrompt < BIOMETRIC_CONSTANTS.COOLDOWN_MS) {
      return false;
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zero-Latency Local Biometric Verification & Resilience Matrix
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authenticates user locally with hardware biometrics (WebAuthn Platform Authenticator).
 * Operates completely offline with 0 network latency and a strict safety timeout.
 */
export async function authenticateLocalBiometrics(options?: {
  timeoutMs?: number;
}): Promise<BiometricAuthResult> {
  const timeoutMs = options?.timeoutMs || BIOMETRIC_CONSTANTS.SAFETY_TIMEOUT_MS;

  if (typeof window === "undefined" || !navigator.credentials) {
    return {
      success: false,
      reason: "not_supported",
      message: "التحقق بالبصمة غير مدعوم في هذا المتصفح",
    };
  }

  const isAvailable = await isPlatformAuthenticatorAvailable();
  if (!isAvailable) {
    return {
      success: false,
      reason: "not_supported",
      message: "لا توجد بصمة مفعلة على هذا الجهاز",
    };
  }

  const abortController = new AbortController();
  let isTimedOut = false;

  const timeoutId = setTimeout(() => {
    isTimedOut = true;
    abortController.abort();
  }, timeoutMs);

  try {
    // Generate a local 32-byte dummy challenge for zero-latency local user verification
    const challenge = new Uint8Array(32);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(challenge);
    }

    const rpId =
      typeof window !== "undefined" && window.location.hostname
        ? window.location.hostname
        : "localhost";

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: timeoutMs,
        userVerification: "required",
        rpId,
      },
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (credential) {
      return {
        success: true,
        message: "تم التحقق بنجاح",
      };
    }

    return {
      success: false,
      reason: "cancelled",
      message: "تم إلغاء التحقق بالبصمة",
    };
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (isTimedOut) {
      return {
        success: false,
        reason: "timeout",
        message: "انتهت مهلة التحقق بالبصمة، استغرق وقتاً أطول من المعتاد. اضغط لإعادة المحاولة أو أدخل رمز PIN",
        error: err,
      };
    }

    const errorName = err?.name || "";
    if (errorName === "AbortError") {
      return {
        success: false,
        reason: "cancelled",
        message: "تم إلغاء التحقق بالبصمة",
        error: err,
      };
    }

    if (errorName === "NotAllowedError") {
      return {
        success: false,
        reason: "not_allowed",
        message: "تم رفض أو إلغاء التحقق بالبصمة",
        error: err,
      };
    }

    if (errorName === "NotSupportedError" || errorName === "InvalidStateError") {
      return {
        success: false,
        reason: "not_supported",
        message: "البصمة غير متوافقة أو غير مفعلة على هذا الجهاز",
        error: err,
      };
    }

    return {
      success: false,
      reason: "error",
      message: err?.message || "فشل التحقق بالبصمة",
      error: err,
    };
  }
}
