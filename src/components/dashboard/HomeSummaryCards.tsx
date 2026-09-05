import { memo, type ReactNode } from "react";
import { TrendingDown, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

export function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

export const SummaryChip = memo(function SummaryChip({
  label,
  value,
  icon,
  tone,
  helper,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: "income" | "expense" | "neutral";
  helper?: string;
}) {
  const toneClass =
    tone === "income"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      : tone === "expense"
        ? "border-rose-500/20 bg-rose-500/10 text-rose-800 dark:text-rose-300"
        : "border-slate-200/60 bg-white/70 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 rounded-xl border backdrop-blur-md transition-all duration-200 shadow-xs",
        toneClass,
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0 opacity-75">{icon}</span>
        <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <span className="text-xs sm:text-sm font-bold tabular-nums shrink-0">
        {value}
      </span>
      {helper && <span className="sr-only">{helper}</span>}
    </div>
  );
});

interface HomeSummaryCardsProps {
  totalIncome?: number;
  totalExpense?: number;
}

export function HomeSummaryCards({
  totalIncome = 0,
  totalExpense = 0,
}: HomeSummaryCardsProps) {
  return (
    <section className="grid grid-cols-2 gap-2">
      <SummaryChip
        label="دخل الشهر"
        value={`${money(totalIncome)} ج.م`}
        tone="income"
        icon={<WalletCards className="w-3.5 h-3.5" />}
      />
      <SummaryChip
        label="مصروف الشهر"
        value={`${money(totalExpense)} ج.م`}
        tone="expense"
        icon={<TrendingDown className="w-3.5 h-3.5" />}
      />
    </section>
  );
}
