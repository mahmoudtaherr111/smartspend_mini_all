/**
 * The interface language. Arabic is the product's language and the default; English is an
 * opt-in for the interface only (buttons, titles, messages). What the user writes or says,
 * how it is classified and what is stored stay Arabic. Why: docs/decisions/0020-optional-english-interface.md.
 *
 * `index.html` repeats `LANGUAGE_STORAGE_KEY` and `directionOf` in a script that runs before
 * React, so a returning English user never sees one right-to-left frame
 * (`src/i18n/language.test.ts` keeps the two in step).
 */
export type UiLanguage = "ar" | "en";
export type UiDirection = "rtl" | "ltr";

export const DEFAULT_LANGUAGE: UiLanguage = "ar";
export const LANGUAGE_STORAGE_KEY = "smartspend_lang";

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === "ar" || value === "en";
}

export function directionOf(language: UiLanguage): UiDirection {
  return language === "ar" ? "rtl" : "ltr";
}

/** The choice made on this device, or `null` when none was made here. */
export function readStoredLanguage(): UiLanguage | null {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isUiLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLanguage(language: UiLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Private mode or a full quota: the choice still applies for this visit.
  }
}

export function applyDocumentLanguage(language: UiLanguage): void {
  const root = document.documentElement;
  root.lang = language;
  root.dir = directionOf(language);
}
