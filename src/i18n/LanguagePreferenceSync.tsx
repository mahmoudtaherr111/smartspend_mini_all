import { useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useLanguage } from "./context";
import { isUiLanguage, readStoredLanguage } from "./language";

/**
 * Carries the account's language to a new device: when this device has never stored a choice,
 * the one saved in the smart profile (`preferences.uiLanguage`) is adopted once. A choice made on
 * this device always wins, so a slow answer can never undo a switch the user just made.
 */
export function LanguagePreferenceSync() {
  const { canChooseLanguage, setLanguage } = useLanguage();
  const [deviceHasNoChoice] = useState(() => readStoredLanguage() === null);
  const enabled = canChooseLanguage && deviceHasNoChoice;
  const profile = trpc.profile.getSmartProfile.useQuery(undefined, { enabled });
  const saved = profile.data?.preferences?.uiLanguage;
  const adopted = useRef(false);

  useEffect(() => {
    if (!enabled || adopted.current || !isUiLanguage(saved)) return;
    adopted.current = true;
    setLanguage(saved);
  }, [enabled, saved, setLanguage]);

  return null;
}
