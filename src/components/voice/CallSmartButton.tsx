/**
 * The ways into the live call: a button for Home and the AI Center's call tab. Both show only to users the rebuilt
 * call is open to (`voice.eligibility`), with the minutes left this month; everyone else keeps the old call tab.
 */
import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStartCall, useVoiceEligibility } from "@/hooks/useVoiceCallEntry";
import { cn } from "@/lib/utils";
import { preferredVoice, setPreferredVoice, useVoiceCallView } from "@/lib/voice/call-store";

const BLOCKED: Record<string, string> = {
  disabled: "مش متاحة في باقتك",
  month_used: "خلصت دقايق الشهر",
  daily_cost_cap: "وصلت لحد النهارده",
};

/** Loads the call's code while a way into it is on screen, so the tap starts the call at once. */
function useWarmCall(enabled: boolean): void {
  useEffect(() => {
    if (enabled) void import("@/lib/voice/call-controller").catch(() => undefined);
  }, [enabled]);
}

function minutesLabel(minutes: number): string {
  if (minutes === 1) return "دقيقة فاضلة";
  if (minutes === 2) return "دقيقتين فاضلين";
  if (minutes >= 3 && minutes <= 10) return `${minutes} دقايق فاضلين`;
  return `${minutes} دقيقة فاضلة`;
}

/** Home's entry: one line, prominent, only for users the rebuilt call is open to. */
export function CallSmartButton({ className }: { className?: string }) {
  const { data } = useVoiceEligibility();
  const start = useStartCall();
  const view = useVoiceCallView();
  useWarmCall(Boolean(data?.v2));
  if (!data?.v2) return null;

  const inCall = view.phase === "starting" || view.phase === "live" || view.phase === "reconnecting";
  const detail = data.blockedReason ? BLOCKED[data.blockedReason] : minutesLabel(data.minutesLeft);
  return (
    <button
      type="button"
      onClick={() => start()}
      className={cn(
        "tap-target active-press flex w-full items-center gap-3 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-600 px-4 py-3 text-start text-white shadow-md",
        className,
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Phone className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{inCall ? "ارجع للمكالمة" : "كلّم سمارت"}</span>
        <span className="block truncate text-xs text-white/85">
          {inCall ? "المكالمة شغالة" : "اسأله عن فلوسك أو سجّل مصروفك بصوتك"}
        </span>
      </span>
      {!inCall && detail && <span className="shrink-0 text-xs text-white/85">{detail}</span>}
    </button>
  );
}

/** The AI Center's call tab for users the rebuilt call is open to: pick a voice and start. */
export function VoiceCallLauncher({
  voices,
  defaultVoice,
  minutesLeft,
  blockedReason,
}: {
  voices: Array<{ id: string; label: string; gender: string }>;
  defaultVoice: string;
  minutesLeft: number;
  blockedReason: string | null;
}) {
  const start = useStartCall();
  const [voice, setVoice] = useState(() => {
    const saved = preferredVoice();
    return saved && voices.some((option) => option.id === saved) ? saved : defaultVoice;
  });
  useWarmCall(true);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-6 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-2xl">
        <Phone className="h-11 w-11 text-white" />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="text-lg font-bold">كلّم سمارت</h3>
        <p className="text-sm text-muted-foreground">
          اسأله عن مصاريفك، سجّل اللي صرفته بصوتك، أو خد رأيه في قرار. بيرد من أرقامك، ومش بيسجل حاجة غير بموافقتك.
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-2" role="radiogroup" aria-label="صوت سمارت">
        {voices.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={voice === option.id}
            onClick={() => {
              setVoice(option.id);
              setPreferredVoice(option.id);
            }}
            className={cn(
              "rounded-xl border p-2.5 text-sm transition-colors",
              voice === option.id
                ? "border-emerald-500/50 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300"
                : "border-border/60 hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Button
        size="lg"
        onClick={() => start(voice)}
        className="tap-target active-press h-14 w-full max-w-sm rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-base font-bold text-white shadow-lg"
      >
        <Phone className="me-2 h-5 w-5" />
        ابدأ المكالمة
      </Button>
      <p className="text-xs text-muted-foreground">
        {blockedReason ? BLOCKED[blockedReason] ?? "" : `${minutesLabel(minutesLeft)} الشهر ده`}
      </p>
    </div>
  );
}
