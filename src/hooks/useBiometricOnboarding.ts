import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { usePasskeyEnrolment } from "@/hooks/usePasskeyEnrolment";
import {
  getUserStorageKey,
  isPlatformAuthenticatorAvailable,
  readBiometricPromptRecord,
  shouldShowBiometricPrompt,
  SIGN_UP_SESSION_KEY,
  BIOMETRIC_PROMPT_SHOWN_KEY,
  writeLocalBiometricPromptRecord,
} from "@/lib/biometricAuth";

/** Lets Home finish drawing first, so the sheet arrives as part of opening the app, not over a task. */
const OPEN_DELAY_MS = 1200;

function sessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * The suggestion to turn on fingerprint / Face ID sign-in: once, when the app opens on Home, never in the sign-up
 * session, never when the device cannot or a passkey exists, 14 days apart, and never again after two "Not now".
 */
export function useBiometricOnboarding() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const userKey = getUserStorageKey(user);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [hardware, setHardware] = useState<boolean | null>(null);
  const { prefetch, enrol, isEnrolling } = usePasskeyEnrolment();
  const openRef = useRef(false);

  const { data: passkeyInfo } = trpc.webauthn.checkHasPasskey.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60_000,
  });
  const { data: profile } = trpc.profile.getSmartProfile.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60_000,
  });
  const savePreferences = trpc.profile.updateSmartProfile.useMutation({
    onSuccess: () => utils.profile.getSmartProfile.invalidate(),
  });

  useEffect(() => {
    let alive = true;
    void isPlatformAuthenticatorAvailable().then((available) => alive && setHardware(available));
    return () => {
      alive = false;
    };
  }, []);

  const record = readBiometricPromptRecord(profile?.preferences as Record<string, unknown> | undefined, userKey);

  const remember = useCallback(
    (next: typeof record) => {
      writeLocalBiometricPromptRecord(userKey, next);
      savePreferences.mutate({
        preferences: {
          biometricPromptDismissals: next.dismissals,
          biometricPromptLastShownAt: next.lastShownAt ? new Date(next.lastShownAt).toISOString() : null,
        },
      });
    },
    [savePreferences, userKey],
  );

  const ready = Boolean(user) && pathname === "/dashboard" && hardware !== null && passkeyInfo !== undefined && profile !== undefined;
  const show =
    ready &&
    !open &&
    shouldShowBiometricPrompt({
      isHardwareAvailable: hardware === true,
      hasPasskey: Boolean(passkeyInfo?.hasPasskey),
      record,
      isSignUpSession: sessionFlag(SIGN_UP_SESSION_KEY),
      shownThisSession: sessionFlag(BIOMETRIC_PROMPT_SHOWN_KEY),
    });

  useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(BIOMETRIC_PROMPT_SHOWN_KEY, "1");
      } catch {
        // Without session storage the 14-day pause still holds.
      }
      prefetch();
      openRef.current = true;
      setOpen(true);
      remember({ ...record, lastShownAt: Date.now() });
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
    // record is derived from profile; re-running on it would reschedule after our own save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const notNow = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    remember({ ...record, dismissals: record.dismissals + 1 });
  }, [record, remember]);

  const turnOn = useCallback(async () => {
    if (await enrol()) {
      openRef.current = false;
      setOpen(false);
    }
  }, [enrol]);

  return { open, notNow, turnOn, isEnrolling };
}
