import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import {
  normalizeProfileFieldValue,
  type ProfileField,
  type ProfileFieldValue,
} from "@contracts/profile-fields";

interface ProfileFieldInputProps {
  field: ProfileField;
  /** The current answer, or undefined while there is none. */
  value: ProfileFieldValue | undefined;
  onChange: (value: ProfileFieldValue | undefined) => void;
  autoFocus?: boolean;
}

/**
 * The one control for a profile question: quick answers, then free entry. The onboarding card and the profile's
 * edit sheet both use it, so a question reads and answers the same in both places.
 */
export function ProfileFieldInput({ field, value, onChange, autoFocus }: ProfileFieldInputProps) {
  const { language, t } = useLanguage();
  const inputId = useId();
  const isText = field.unit === "text";
  const choices = field.noneChoice ? [...field.quickChoices, field.noneChoice] : field.quickChoices;
  const isQuick = value !== undefined && choices.some((choice) => choice.value === value);
  const typed = value !== undefined && !isQuick ? String(value) : "";
  const otherLabel =
    field.unit === "egp" ? t("profileField.otherAmount") : field.unit === "day" ? t("profileField.otherDay") : t("profileField.otherText");

  return (
    <div className="space-y-3">
      <div className={cn("grid gap-2", isText ? "grid-cols-3" : "grid-cols-4")} role="group" aria-label={field.question[language]}>
        {choices.map((choice) => {
          const selected = value === choice.value;
          return (
            <button
              key={String(choice.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? undefined : choice.value)}
              className={cn(
                "min-h-11 rounded-xl border px-2 text-sm font-semibold tabular-nums transition-colors",
                choice === field.noneChoice && "col-span-full",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                selected
                  ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
              )}
            >
              {choice.label[language]}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          {otherLabel}
        </label>
        <Input
          id={inputId}
          inputMode={isText ? "text" : "numeric"}
          dir={isText ? "auto" : "ltr"}
          autoFocus={autoFocus}
          value={typed}
          maxLength={isText ? field.max : 12}
          placeholder={field.unit === "egp" ? "20000" : field.unit === "day" ? "15" : t("profileField.textPlaceholder")}
          onChange={(event) => {
            const text = event.target.value;
            if (!text.trim()) return onChange(undefined);
            if (isText) return onChange(text);
            // Keep what the user is typing visible even while it is out of range; saving checks it again.
            const digits = text.replace(/[^\d.]/g, "");
            const typedNumber = Number(digits);
            onChange(digits && Number.isFinite(typedNumber) ? typedNumber : undefined);
          }}
          className="h-11 text-base tabular-nums"
        />
      </div>
    </div>
  );
}

/** Whether a value can be saved for the field. */
export function isValidProfileFieldValue(
  field: ProfileField,
  value: ProfileFieldValue | undefined,
): value is ProfileFieldValue {
  return value !== undefined && normalizeProfileFieldValue(field, value) !== null;
}
