import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/context";
import { PROFILE_FIELDS, normalizeProfileFieldValue, profileField, type ProfileFieldValue } from "@contracts/profile-fields";
import { ProfileFieldInput, isValidProfileFieldValue } from "@/components/profile/ProfileFieldInput";

/** "Not now" hides the card on this device for a week; the server pause (a day) covers other devices and calls. */
const LOCAL_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;
const SERVER_PAUSE_MS = 24 * 60 * 60 * 1000;

interface OnboardingCardProps {
  /** Shown only once the user has recorded something, so the first visit is never interrupted. */
  hasActivity: boolean;
}

/**
 * The profile questions on Home, one at a time, inline (never a pop-up). The questions, their order and the
 * "why we ask" line come from `contracts/profile-fields.ts`, like the profile screen and the voice call.
 */
export function OnboardingCard({ hasActivity }: OnboardingCardProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const utils = trpc.useUtils();
  const pauseKey = `onboarding_card_paused_${user ? `${user.type}_${user.id}` : "anonymous"}`;
  const [pausedLocally, setPausedLocally] = useState(() => {
    try {
      const at = Number(localStorage.getItem(pauseKey) || 0);
      return Date.now() - at < LOCAL_PAUSE_MS;
    } catch {
      return false;
    }
  });
  const [value, setValue] = useState<ProfileFieldValue | undefined>(undefined);

  const next = trpc.profile.getNextOnboardingQuestion.useQuery(undefined, {
    enabled: hasActivity && !pausedLocally,
    retry: false,
  });
  const field = next.data?.question ? profileField(next.data.question.key) : undefined;

  useEffect(() => setValue(undefined), [field?.key]);

  const submit = trpc.profile.submitOnboardingAnswer.useMutation({
    onSuccess: (data) => {
      if (!data.nextQuestion) toast.success(t("onboarding.card.done"));
      utils.profile.getNextOnboardingQuestion.invalidate();
      utils.profile.getSmartProfile.invalidate();
    },
    onError: () => toast.error(t("onboarding.card.saveError")),
  });
  const dismiss = trpc.profile.dismissOnboarding.useMutation();

  const lastAskedAt = next.data?.lastAskedAt ? new Date(next.data.lastAskedAt).getTime() : 0;
  const pausedOnServer = Date.now() - lastAskedAt < SERVER_PAUSE_MS;
  if (!hasActivity || pausedLocally || pausedOnServer || !field) return null;

  const step = PROFILE_FIELDS.findIndex((item) => item.key === field.key) + 1;
  const canSave = isValidProfileFieldValue(field, value) && !submit.isPending;

  const notNow = () => {
    try {
      localStorage.setItem(pauseKey, String(Date.now()));
    } catch {
      // Without storage the server pause still applies.
    }
    setPausedLocally(true);
    dismiss.mutate();
  };

  return (
    <section
      aria-labelledby="onboarding-card-question"
      className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">
          {t("onboarding.card.title")} · {t("onboarding.card.step", { current: step, total: PROFILE_FIELDS.length })}
        </p>
        <button
          type="button"
          onClick={notNow}
          aria-label={t("onboarding.card.later")}
          className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <h2 id="onboarding-card-question" className="mt-1 text-base font-bold">
        {field.question[language]}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{field.why[language]}</p>

      <div className="mt-4">
        <ProfileFieldInput field={field} value={value} onChange={setValue} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          className="h-11 flex-1"
          disabled={!canSave}
          onClick={() => submit.mutate({ key: field.key, value: normalizeProfileFieldValue(field, value) ?? undefined, skipped: false })}
        >
          {t("onboarding.card.save")}
        </Button>
        <Button
          variant="ghost"
          className="h-11 px-4 text-muted-foreground"
          disabled={submit.isPending}
          onClick={() => submit.mutate({ key: field.key, skipped: true })}
        >
          {t("onboarding.card.skip")}
        </Button>
      </div>
    </section>
  );
}
