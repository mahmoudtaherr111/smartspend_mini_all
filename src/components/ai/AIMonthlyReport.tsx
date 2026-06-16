import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AIInsights } from "@/components/insights/AIInsights";
import { Button } from "@/components/ui/button";
import { useHaptics } from "@/hooks/useHaptics";

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function queryMonthValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(key);
  return value && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

const MONTH_NAMES_AR = [
  "يناير", "فبراير", "مارس", "إبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES_AR[m - 1]} ${y}`;
}

export default function AIMonthlyReport() {
  const [month, setMonth] = useState(() => queryMonthValue("report_qa_month") ?? currentMonthValue());
  const { lightTap } = useHaptics();

  const prevMonth = () => {
    lightTap();
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(d.toISOString().slice(0, 7));
  };

  const nextMonth = () => {
    lightTap();
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m, 1);
    const next = d.toISOString().slice(0, 7);
    if (next <= currentMonthValue()) {
      setMonth(next);
    }
  };

  const isCurrentMonth = month === currentMonthValue();

  return (
    <div className="h-full overflow-y-auto chat-scroll px-4 py-4 space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between glass-card p-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={prevMonth}
          className="tap-target h-9 w-9 rounded-lg"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <span className="text-sm font-bold">{formatMonth(month)}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className="tap-target h-9 w-9 rounded-lg"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Existing AIInsights component */}
      <AIInsights month={month} />
    </div>
  );
}
