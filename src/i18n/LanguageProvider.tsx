import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import type { Dictionary } from "./ar";
import { LanguageContext, translate, type LanguageContextValue } from "./context";
import {
  DEFAULT_LANGUAGE,
  applyDocumentLanguage,
  directionOf,
  readStoredLanguage,
  storeLanguage,
  type UiLanguage,
} from "./language";

/**
 * Whether this user may use English: `"unknown"` while the session is not verified yet (the
 * device's choice is trusted, so an English admin does not flash back to Arabic on every start),
 * `"denied"` forces Arabic.
 */
export type EnglishAccess = "allowed" | "denied" | "unknown";

export function LanguageProvider({
  englishAccess,
  children,
}: {
  englishAccess: EnglishAccess;
  children: ReactNode;
}) {
  const [requested, setRequested] = useState<UiLanguage>(
    () => readStoredLanguage() ?? DEFAULT_LANGUAGE,
  );
  const [english, setEnglish] = useState<Dictionary | null>(null);

  const language: UiLanguage = englishAccess === "denied" ? DEFAULT_LANGUAGE : requested;

  useEffect(() => {
    if (language !== "en" || english) return;
    let cancelled = false;
    void import("./en").then((module) => {
      if (!cancelled) setEnglish(module.en);
    });
    return () => {
      cancelled = true;
    };
  }, [language, english]);

  // Before paint, so the shell never renders one frame in the wrong direction.
  useLayoutEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  const setLanguage = useCallback((next: UiLanguage) => {
    storeLanguage(next);
    setRequested(next);
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = language === "en" ? english : null;
    return {
      language,
      dir: directionOf(language),
      canChooseLanguage: englishAccess === "allowed",
      setLanguage,
      t: (key, vars) => translate(dictionary, key, vars),
    };
  }, [language, english, englishAccess, setLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      <DirectionProvider dir={value.dir}>
        {children}
      </DirectionProvider>
    </LanguageContext.Provider>
  );
}
