import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Crown, Mic, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

function pct(used: number, limit: number) {
  if (limit <= 0 || limit === -1) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function PlanUsageStrip({ className }: { className?: string }) {
  const { user } = useAuth();
  const { data: limits, isLoading } = trpc.ai.getUserLimits.useQuery(
    undefined,
    {
      staleTime: 60_000,
    },
  );

  if (!user || isLoading || !limits) return null;

  const planLabel =
    user.plan === "ultra" ? "Ultra" : user.plan === "pro" ? "Pro" : "مجاني";
  const aiPct = pct(limits.ai.used, limits.ai.limit);
  const voicePct =
    limits.voice.remaining === -1
      ? null
      : limits.voice.limit > 0
        ? pct(limits.voice.limit - limits.voice.remaining, limits.voice.limit)
        : null;

  const warnAi = aiPct !== null && aiPct >= 85;
  const warnVoice = voicePct !== null && voicePct >= 85;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/90 dark:bg-slate-900/90 px-3 py-2.5 shadow-sm flex flex-wrap items-center gap-2 sm:gap-3 text-xs",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold shrink-0 min-h-[28px]",
          user.plan === "free"
            ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
        )}
      >
        {user.plan !== "free" && <Crown className="w-3.5 h-3.5" />}
        {planLabel}
      </span>

      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Sparkles className="w-3.5 h-3.5 shrink-0 text-violet-500" />
        <span
          className={cn(
            "truncate",
            warnAi && "text-amber-700 dark:text-amber-400 font-medium",
          )}
        >
          AI اليوم: {limits.ai.used}/
          {limits.ai.limit === -1 ? "∞" : limits.ai.limit}
        </span>
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <Mic className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
        <span
          className={cn(
            "truncate",
            warnVoice && "text-amber-700 dark:text-amber-400 font-medium",
          )}
        >
          صوت:{" "}
          {limits.voice.remaining === -1
            ? "غير محدود"
            : `${Math.max(0, limits.voice.remaining)}ث متبقية`}
        </span>
      </div>

      {user.plan === "free" && (warnAi || warnVoice) && (
        <Link
          to="/pro"
          className="ms-auto shrink-0 rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 min-h-[36px] inline-flex items-center font-medium active:scale-[0.98]"
        >
          ترقية
        </Link>
      )}
    </div>
  );
}
