import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  authenticateLocalBiometrics,
  getBiometricGracePeriod,
  getBiometricLockEnabled,
  getBiometricPinHash,
  getLastActiveTimestamp,
  getLastUnlockedTimestamp,
  getUserStorageKey,
  setBiometricGracePeriod as storeBiometricGracePeriod,
  setBiometricLockEnabled as storeBiometricLockEnabled,
  setBiometricPin as storeBiometricPin,
  setLastActiveTimestamp,
  setLastUnlockedTimestamp,
  verifyBiometricPin,
  type BiometricAuthResult,
} from "@/lib/biometricAuth";

interface BiometricLockContextType {
  isLocked: boolean;
  isLockEnabled: boolean;
  hasPin: boolean;
  isPrivacyMaskActive: boolean;
  gracePeriod: number;
  lastAuthResult: BiometricAuthResult | null;
  isAuthenticating: boolean;
  setGracePeriod: (ms: number) => void;
  enableLock: (pin?: string) => Promise<void>;
  disableLock: () => void;
  setPin: (pin: string) => Promise<void>;
  unlockWithBiometrics: () => Promise<BiometricAuthResult>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lockNow: () => void;
  retryBiometrics: () => Promise<BiometricAuthResult>;
}

const BiometricLockContext = createContext<BiometricLockContextType | null>(null);

export function BiometricLockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userKey = getUserStorageKey(user);

  const [isLockEnabled, setIsLockEnabled] = useState<boolean>(() =>
    user ? getBiometricLockEnabled(userKey) : false,
  );
  const [hasPin, setHasPin] = useState<boolean>(() =>
    user ? !!getBiometricPinHash(userKey) : false,
  );
  const [gracePeriod, setGracePeriodState] = useState<number>(() =>
    user ? getBiometricGracePeriod(userKey) : 30000,
  );

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    if (!user) return false;
    const enabled = getBiometricLockEnabled(userKey);
    if (!enabled) return false;
    const lastUnlocked = getLastUnlockedTimestamp(userKey);
    const currentGrace = getBiometricGracePeriod(userKey);
    return Date.now() - lastUnlocked > currentGrace;
  });

  const [isPrivacyMaskActive, setIsPrivacyMaskActive] = useState<boolean>(false);
  const [lastAuthResult, setLastAuthResult] = useState<BiometricAuthResult | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const isAuthInProgress = useRef(false);
  const wasHiddenRef = useRef<boolean>(
    typeof document !== "undefined" ? document.visibilityState === "hidden" : false,
  );

  // Sync state when user logs in or switches account
  useEffect(() => {
    if (user) {
      const enabled = getBiometricLockEnabled(userKey);
      setIsLockEnabled(enabled);
      setHasPin(!!getBiometricPinHash(userKey));
      const gp = getBiometricGracePeriod(userKey);
      setGracePeriodState(gp);
      setLastAuthResult(null);

      if (enabled) {
        const lastUnlocked = getLastUnlockedTimestamp(userKey);
        if (Date.now() - lastUnlocked > gp) {
          setIsLocked(true);
        } else {
          setIsLocked(false);
        }
      } else {
        setIsLocked(false);
      }
    } else {
      setIsLockEnabled(false);
      setHasPin(false);
      setIsLocked(false);
      setIsPrivacyMaskActive(false);
      setLastAuthResult(null);
    }
  }, [user, userKey]);

  const unlockWithBiometrics = useCallback(async (): Promise<BiometricAuthResult> => {
    if (isAuthInProgress.current) {
      return {
        success: false,
        reason: "cancelled",
        message: "عملية التحقق جارية بالفعل",
      };
    }

    isAuthInProgress.current = true;
    setIsAuthenticating(true);

    try {
      const result = await authenticateLocalBiometrics();
      setLastAuthResult(result);
      if (result.success) {
        const now = Date.now();
        setLastUnlockedTimestamp(now, userKey);
        setLastActiveTimestamp(now, userKey);
        setIsLocked(false);
      }
      return result;
    } finally {
      isAuthInProgress.current = false;
      setIsAuthenticating(false);
    }
  }, [userKey]);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      const isValid = await verifyBiometricPin(userKey, pin);
      if (isValid) {
        const now = Date.now();
        setLastUnlockedTimestamp(now, userKey);
        setLastActiveTimestamp(now, userKey);
        setIsLocked(false);
        setLastAuthResult({
          success: true,
          message: "تم التحقق بواسطة رمز PIN بنجاح",
        });
        return true;
      }
      return false;
    },
    [userKey],
  );

  const enableLock = useCallback(
    async (pin?: string) => {
      if (!user) return;
      if (pin) {
        await storeBiometricPin(userKey, pin);
        setHasPin(true);
      }
      storeBiometricLockEnabled(userKey, true);
      setIsLockEnabled(true);
      const now = Date.now();
      setLastUnlockedTimestamp(now, userKey);
      setLastActiveTimestamp(now, userKey);
    },
    [user, userKey],
  );

  const disableLock = useCallback(() => {
    if (!user) return;
    storeBiometricLockEnabled(userKey, false);
    setIsLockEnabled(false);
    setIsLocked(false);
  }, [user, userKey]);

  const setPin = useCallback(
    async (pin: string) => {
      if (!user) return;
      await storeBiometricPin(userKey, pin);
      setHasPin(true);
    },
    [user, userKey],
  );

  const setGracePeriod = useCallback(
    (ms: number) => {
      if (!user) return;
      storeBiometricGracePeriod(userKey, ms);
      setGracePeriodState(ms);
    },
    [user, userKey],
  );

  const lockNow = useCallback(() => {
    if (isLockEnabled) {
      setIsLocked(true);
    }
  }, [isLockEnabled]);

  // Lifecycle listeners: tab switch / minimizing / app switcher privacy masking & grace period re-locking
  useEffect(() => {
    if (!user || !isLockEnabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (!wasHiddenRef.current) {
          setLastActiveTimestamp(Date.now(), userKey);
          wasHiddenRef.current = true;
        }
        setIsPrivacyMaskActive(true);
      } else {
        wasHiddenRef.current = false;
        setIsPrivacyMaskActive(false);
        const lastActive = getLastActiveTimestamp(userKey);
        const elapsed = Date.now() - lastActive;
        if (elapsed >= gracePeriod) {
          setIsLocked(true);
        } else {
          setLastActiveTimestamp(Date.now(), userKey);
        }
      }
    };

    const handleBlur = () => {
      if (document.visibilityState === "hidden") {
        if (!wasHiddenRef.current) {
          setLastActiveTimestamp(Date.now(), userKey);
          wasHiddenRef.current = true;
        }
        setIsPrivacyMaskActive(true);
      }
    };

    const handleFocus = () => {
      wasHiddenRef.current = false;
      setIsPrivacyMaskActive(false);
      const lastActive = getLastActiveTimestamp(userKey);
      const elapsed = Date.now() - lastActive;
      if (elapsed >= gracePeriod) {
        setIsLocked(true);
      } else {
        setLastActiveTimestamp(Date.now(), userKey);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === `smartspend_biometric_lock_enabled_${userKey}`) {
        const enabled = e.newValue === "1";
        setIsLockEnabled(enabled);
        if (!enabled) setIsLocked(false);
      } else if (e.key === `smartspend_biometric_last_unlocked_${userKey}`) {
        if (e.newValue) {
          const ts = parseInt(e.newValue, 10);
          if (!isNaN(ts) && Date.now() - ts <= gracePeriod) {
            setIsLocked(false);
          }
        }
      } else if (e.key === `smartspend_biometric_grace_period_${userKey}`) {
        if (e.newValue) {
          const parsed = parseInt(e.newValue, 10);
          if (!isNaN(parsed) && parsed >= 0) setGracePeriodState(parsed);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, [user, userKey, isLockEnabled, gracePeriod]);

  // Automatically trigger biometric unlock prompt upon entering locked state
  useEffect(() => {
    if (isLocked && user && isLockEnabled && !isAuthInProgress.current) {
      // Immediate asynchronous prompt upon lock
      void unlockWithBiometrics();
    }
  }, [isLocked, user, isLockEnabled, unlockWithBiometrics]);

  return (
    <BiometricLockContext.Provider
      value={{
        isLocked,
        isLockEnabled,
        hasPin,
        isPrivacyMaskActive,
        gracePeriod,
        lastAuthResult,
        isAuthenticating,
        setGracePeriod,
        enableLock,
        disableLock,
        setPin,
        unlockWithBiometrics,
        unlockWithPin,
        lockNow,
        retryBiometrics: unlockWithBiometrics,
      }}
    >
      {children}
    </BiometricLockContext.Provider>
  );
}

export function useBiometricLock(): BiometricLockContextType {
  const context = useContext(BiometricLockContext);
  if (!context) {
    throw new Error("useBiometricLock must be used within a BiometricLockProvider");
  }
  return context;
}
