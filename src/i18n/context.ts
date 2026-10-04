import { createContext, useContext } from "react";
import { ar, type Dictionary, type MessageKey } from "./ar";
import { DEFAULT_LANGUAGE, directionOf, type UiDirection, type UiLanguage } from "./language";

export type MessageVars = Record<string, string | number>;

export interface LanguageContextValue {
  /** The language the interface is shown in now. */
  language: UiLanguage;
  dir: UiDirection;
  /** Whether this user may switch languages (English is admin-only until the main screens are translated). */
  canChooseLanguage: boolean;
  setLanguage: (language: UiLanguage) => void;
  t: (key: MessageKey, vars?: MessageVars) => string;
}

/** `{name}` in a text is replaced by `vars.name`; an unknown name is left as it is. */
export function formatMessage(text: string, vars?: MessageVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** A text in the chosen dictionary, falling back to Arabic while English is still loading. */
export function translate(
  dictionary: Dictionary | null,
  key: MessageKey,
  vars?: MessageVars,
): string {
  return formatMessage(dictionary?.[key] ?? ar[key], vars);
}

const arabicFallback: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  dir: directionOf(DEFAULT_LANGUAGE),
  canChooseLanguage: false,
  setLanguage: () => {},
  t: (key, vars) => translate(null, key, vars),
};

export const LanguageContext = createContext<LanguageContextValue>(arabicFallback);

/** The interface language, its direction and `t()`. Outside a provider: Arabic. */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
