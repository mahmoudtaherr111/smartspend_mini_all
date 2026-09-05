import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import {
  getBiometricLockEnabled,
  getUserStorageKey,
  incrementBiometricPromptCount,
  isBiometricPromptOptedOut,
  isPlatformAuthenticatorAvailable,
  setBiometricPromptOptedOut,
  setLastBiometricPromptTime,
  shouldShowBiometricOnboarding,
} from "@/lib/biometricAuth";

export function useBiometricOnboarding() {
  const { user } = useAuth();
  const userKey = getUserStorageKey(user);
  const [showModal, setShowModal] = useState(false);
  const [isHardwareAvailable, setIsHardwareAvailable] = useState<
    boolean | null
  >(null);

  const { data: passkeyInfo } = trpc.webauthn.checkHasPasskey.useQuery(
    undefined,
    {
      enabled: !!user,
      staleTime: 60000,
    },
  );
  const { data: smartProfile } = trpc.profile.getSmartProfile.useQuery(
    undefined,
    {
      enabled: !!user,
      staleTime: 60000,
    },
  );

  const sendNotificationMutation =
    trpc.profile.sendBiometricPromptNotification.useMutation();

  const sessionStartTime = useRef<number>(Date.now());
  const activeDurationMs = useRef<number>(0);
  const hasTriggeredPromptThisSession = useRef<boolean>(false);

  // 1. Silent hardware capability detection in background
  useEffect(() => {
    let isMounted = true;
    void isPlatformAuthenticatorAvailable().then((available) => {
      if (isMounted) {
        setIsHardwareAvailable(available);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const hasBiometrics =
    !!passkeyInfo?.hasPasskey ||
    (typeof window !== "undefined" &&
      (window.localStorage.getItem(`smartspend_has_passkey_${userKey}`) ===
        "1" ||
        getBiometricLockEnabled(userKey) ||
        (userKey === "anonymous" &&
          window.localStorage.getItem("smartspend_has_passkey") === "1")));

  const sendNotificationRef = useRef(sendNotificationMutation.mutate);
  useEffect(() => {
    sendNotificationRef.current = sendNotificationMutation.mutate;
  });

  // Reset session duration and trigger status when user switches accounts
  useEffect(() => {
    sessionStartTime.current = Date.now();
    activeDurationMs.current = 0;
    hasTriggeredPromptThisSession.current = false;
  }, [userKey]);

  // 2. Active session tracker & 5-minute threshold trigger
  useEffect(() => {
    if (
      !user ||
      smartProfile?.profileCompleted !== true ||
      isHardwareAvailable !== true ||
      hasBiometrics
    )
      return;
    if (isBiometricPromptOptedOut(userKey)) return;

    sessionStartTime.current = Date.now();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        activeDurationMs.current += 1000;
      }

      if (
        !hasTriggeredPromptThisSession.current &&
        shouldShowBiometricOnboarding({
          userKey,
          sessionDurationMs: activeDurationMs.current,
          isHardwareAvailable: true,
          hasBiometricsOrPasskey: hasBiometrics,
        })
      ) {
        hasTriggeredPromptThisSession.current = true;
        setShowModal(true);

        // Record prompt frequency metrics
        incrementBiometricPromptCount(userKey);
        setLastBiometricPromptTime(userKey, Date.now());

        // Dispatch in-app notification via tRPC
        sendNotificationRef.current();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    user,
    userKey,
    smartProfile?.profileCompleted,
    isHardwareAvailable,
    hasBiometrics,
  ]);

  const postponePrompt = useCallback(() => {
    setShowModal(false);
    setLastBiometricPromptTime(userKey, Date.now());
  }, [userKey]);

  const optOutPermanently = useCallback(() => {
    setShowModal(false);
    setBiometricPromptOptedOut(userKey, true);
  }, [userKey]);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return {
    showModal,
    isHardwareAvailable,
    hasBiometrics,
    closeModal,
    postponePrompt,
    optOutPermanently,
  };
}
