import { Flame } from "lucide-react";
import { cn } from "../../lib/utils";

interface StreakCounterProps {
  currentStreak: number;
}

export function StreakCounter({ currentStreak }: StreakCounterProps) {
  if (currentStreak === 0) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full text-sm font-medium border border-slate-200 dark:border-slate-700">
        <Flame className="w-4 h-4 opacity-50" />
        <span>0 يوم</span>
      </div>
    );
  }

  // Visual Evolution based on streak
  let flameColor = "text-orange-500 fill-orange-500";
  let bgClass =
    "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900";
  let textClass = "text-orange-600 dark:text-orange-400";

  if (currentStreak >= 30) {
    flameColor = "text-purple-500 fill-purple-500 animate-pulse";
    bgClass =
      "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900 shadow-[0_0_10px_rgba(168,85,247,0.3)]";
    textClass = "text-purple-600 dark:text-purple-400 font-bold";
  } else if (currentStreak >= 10) {
    flameColor = "text-blue-500 fill-blue-500";
    bgClass =
      "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900";
    textClass = "text-blue-600 dark:text-blue-400 font-bold";
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-300",
        bgClass,
        textClass,
      )}
    >
      <Flame className={cn("w-4 h-4", flameColor)} />
      <span className="tabular-nums">{currentStreak}</span>
    </div>
  );
}
