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
    // Only the user's own choice turns the lock on. A passkey used to turn it on too, with no PIN to fall back on,
    // so a failed fingerprint left signing out as the only way in.
    return explicitlyEnabled;
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
// The suggestion to turn on fingerprint / Face ID sign-in
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How often the sign-in suggestion may appear. The record lives in the user's profile preferences, so a new phone or
 * a cleared browser does not start over; this device keeps a copy only to decide before the profile has loaded.
 */
export const BIOMETRIC_PROMPT = {
  /** After this many "Not now" taps it never appears again (Settings › Security still offers it). */
  MAX_DISMISSALS: 2,
  /** Days between two appearances. */
  COOLDOWN_MS: 14 * 24 * 60 * 60 * 1000,
} as const;

/** Set by the sign-up form: the tab where the account was created never gets the suggestion. */
export const SIGN_UP_SESSION_KEY = "smartspend_signup_session";
/** Set for the session once the suggestion appeared; other first-run prompts (push permission) wait for another session. */
export const BIOMETRIC_PROMPT_SHOWN_KEY = "smartspend_biometric_prompt_shown";

export interface BiometricPromptRecord {
  dismissals: number;
  lastShownAt: number | null;
}

function localPromptKey(userKey: string): string {
  return `smartspend_biometric_prompt_${userKey}`;
}

/** The record from the profile preferences and this device's copy, whichever has seen more. */
export function readBiometricPromptRecord(
  preferences: Record<string, unknown> | null | undefined,
  userKey: string,
): BiometricPromptRecord {
  const server: BiometricPromptRecord = {
    dismissals: Number(preferences?.biometricPromptDismissals) || 0,
    lastShownAt: Date.parse(String(preferences?.biometricPromptLastShownAt ?? "")) || null,
  };
  let local: BiometricPromptRecord = { dismissals: 0, lastShownAt: null };
  try {
    const raw = window.localStorage?.getItem(localPromptKey(userKey));
    if (raw) local = { ...local, ...(JSON.parse(raw) as Partial<BiometricPromptRecord>) };
  } catch {
    // No storage: the profile's record alone decides.
  }
  return {
    dismissals: Math.max(server.dismissals, Number(local.dismissals) || 0),
    lastShownAt: Math.max(server.lastShownAt ?? 0, Number(local.lastShownAt) || 0) || null,
  };
}

export function writeLocalBiometricPromptRecord(userKey: string, record: BiometricPromptRecord): void {
  try {
    window.localStorage?.setItem(localPromptKey(userKey), JSON.stringify(record));
  } catch {
    // The profile's copy is enough.
  }
}

export interface ShouldShowBiometricPromptParams {
  isHardwareAvailable: boolean;
  hasPasskey: boolean;
  record: BiometricPromptRecord;
  /** The tab where the account was just created: the first visit is never interrupted. */
  isSignUpSession: boolean;
  /** Already shown since the app was opened. */
  shownThisSession: boolean;
  now?: number;
}

/** Whether to offer fingerprint / Face ID sign-in now. Pure, so the rules are tested on their own. */
export function shouldShowBiometricPrompt({
  isHardwareAvailable,
  hasPasskey,
  record,
  isSignUpSession,
  shownThisSession,
  now = Date.now(),
}: ShouldShowBiometricPromptParams): boolean {
  if (!isHardwareAvailable || hasPasskey) return false;
  if (isSignUpSession || shownThisSession) return false;
  if (record.dismissals >= BIOMETRIC_PROMPT.MAX_DISMISSALS) return false;
  if (record.lastShownAt !== null && now - record.lastShownAt < BIOMETRIC_PROMPT.COOLDOWN_MS) return false;
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
