import { Check, Globe2, Languages } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useLanguage } from "@/i18n/context";
import type { UiLanguage } from "@/i18n/language";

/** Each language is named in itself, so someone who switched by mistake can find the way back. */
const OPTIONS: { language: UiLanguage; name: string; hintKey: "settings.language.arabicHint" | "settings.language.englishHint" }[] = [
  { language: "ar", name: "العربية", hintKey: "settings.language.arabicHint" },
  { language: "en", name: "English", hintKey: "settings.language.englishHint" },
];

/**
 * The interface language on the Appearance screen. Renders nothing for users who may not choose
 * yet (`canChooseLanguage`). The choice applies at once on this device and is saved to the
 * smart profile so the account's other devices pick it up (`LanguagePreferenceSync`).
 */
export function LanguageSettings() {
  const { language, setLanguage, canChooseLanguage, t } = useLanguage();
  const utils = trpc.useUtils();
  const save = trpc.profile.updateSmartProfile.useMutation({
    onSuccess: () => void utils.profile.getSmartProfile.invalidate(),
  });

  if (!canChooseLanguage) return null;

  const choose = (next: UiLanguage) => {
    if (next === language) return;
    setLanguage(next);
    save.mutate({ preferences: { uiLanguage: next } });
  };

  return (
    <section aria-labelledby="interface-language-title" className="space-y-3 pt-4">
      <div className="space-y-1">
        <h2
          id="interface-language-title"
          className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-200"
        >
          <Languages className="h-5 w-5 text-indigo-500" />
          {t("settings.language.title")}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("settings.language.description")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = option.language === language;
          return (
            <button
              key={option.language}
              type="button"
              onClick={() => choose(option.language)}
              aria-pressed={selected}
              lang={option.language}
              dir={option.language === "ar" ? "rtl" : "ltr"}
              className={`flex items-center gap-3 rounded-3xl border bg-white p-5 shadow-sm transition-all duration-300 active-press cursor-pointer dark:bg-slate-950 ${selected ? "border-indigo-500 ring-2 ring-indigo-500/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/30"}`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors ${selected ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400" : "bg-slate-100 text-slate-500 dark:bg-slate-900"}`}
              >
                {option.language === "ar" ? (
                  <span className="text-lg font-black">ع</span>
                ) : (
                  <Globe2 className="h-6 w-6" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-start">
                <span className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                  {option.name}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                  {t(option.hintKey)}
                </span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0 text-indigo-500" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
