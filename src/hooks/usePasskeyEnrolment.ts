import { useCallback, useRef, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { getUserStorageKey } from "@/lib/biometricAuth";

type RegistrationOptions = Awaited<ReturnType<ReturnType<typeof trpc.webauthn.generateRegistrationOptions.useMutation>["mutateAsync"]>>;

/**
 * Turns on fingerprint / Face ID sign-in (a passkey) for this account. `prefetch()` asks the server for the
 * registration options ahead of time: iPhones only show the Face ID sheet when it starts right from the tap, so the
 * tap must not wait for the network first.
 */
export function usePasskeyEnrolment() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const generateOptions = trpc.webauthn.generateRegistrationOptions.useMutation();
  const verifyRegistration = trpc.webauthn.verifyRegistration.useMutation();
  const prefetched = useRef<Promise<RegistrationOptions> | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const prefetch = useCallback(() => {
    prefetched.current ??= generateOptions.mutateAsync();
    prefetched.current.catch(() => {
      prefetched.current = null;
    });
  }, [generateOptions]);

  /** True when the passkey was registered. Errors are told to the user here. */
  const enrol = useCallback(async (): Promise<boolean> => {
    setIsEnrolling(true);
    try {
      const options = await (prefetched.current ?? generateOptions.mutateAsync());
      prefetched.current = null;
      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: options });
      } catch (err) {
        const name = (err as Error).name;
        if (name === "InvalidStateError") toast.error("البصمة مسجلة بالفعل على الجهاز ده.");
        else if (name === "NotAllowedError") toast.info("اتلغى تسجيل البصمة.");
        else toast.error("ماقدرناش نسجل البصمة. اتأكد إن البصمة متفعلة في جهازك وجرّب تاني.");
        return false;
      }
      await verifyRegistration.mutateAsync({ response: attestation });
      try {
        // Lets the sign-in page offer quick sign-in on this device. It does not turn on the app lock.
        localStorage.setItem("smartspend_has_passkey", "1");
        localStorage.setItem(`smartspend_has_passkey_${getUserStorageKey(user)}`, "1");
      } catch {
        // Private browsing: quick sign-in is just not offered.
      }
      await utils.webauthn.checkHasPasskey.invalidate();
      toast.success("الدخول بالبصمة اتفعّل.");
      return true;
    } catch {
      toast.error("ماقدرناش نفعّل الدخول بالبصمة. جرّب تاني.");
      return false;
    } finally {
      setIsEnrolling(false);
    }
  }, [generateOptions, verifyRegistration, user, utils]);

  return { prefetch, enrol, isEnrolling };
}
