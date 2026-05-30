import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

function compactMoney(value: unknown) {
  const num = Number(value || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "m";
  if (num >= 10000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export const MonthlyCalendar = memo(function MonthlyCalendar({
  month,
  dayTrend = [],
  salaryDay,
}: {
  month: string;
  dayTrend?: any[];
  salaryDay?: number;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const leading = firstDay.getDay();
  const trendMap = new Map(
    dayTrend.map((day: any) => [String(day.date).slice(-2), day]),
  );
  const maxSpend = Math.max(
    1,
    ...dayTrend.map((day: any) => Number(day.amount || 0)),
  );
  const cells = [
    ...Array.from({ length: leading }, (_, index) => ({
      empty: true,
      key: `empty-${index}`,
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return { day, key: day, data: trendMap.get(day) };
    }),
  ];

  return (
    <div className="space-y-4">
      {salaryDay && salaryDay > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/50 border rounded-md p-2">
          💡 <strong>ملاحظة:</strong> مرتبك ينزل يوم {salaryDay} من كل شهر.
          إحصائيات هذا الشهر تُحسب بناءً على هذا اليوم (من {salaryDay} الشهر
          الحالي إلى {salaryDay - 1} الشهر القادم).
        </div>
      )}
      <div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs text-muted-foreground mb-2">
          {["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map(
            (day) => (
              <span key={day} className="truncate">
                {day}
              </span>
            ),
          )}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {cells.map((cell: any) => {
            const amount = Number(cell.data?.amount || 0);
            const intensity = amount / maxSpend;
            return (
              <div
                key={cell.key}
                className={cn(
                  "min-h-16 sm:min-h-20 rounded-md border p-1 sm:p-2 text-right transition-colors overflow-hidden flex flex-col justify-between",
                  cell.empty && "border-transparent",
                  !cell.empty && amount === 0 && "bg-background",
                  amount > 0 &&
                    "bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900",
                )}
                style={
                  amount > 0 ? { opacity: 0.55 + intensity * 0.45 } : undefined
                }
              >
                {!cell.empty && (
                  <>
                    <div className="font-semibold text-xs sm:text-sm mb-1">
                      {Number(cell.day)}
                    </div>
                    <div className="mt-auto space-y-0.5">
                      {amount > 0 && (
                        <div
                          className="text-[9px] sm:text-[11px] font-bold text-red-700 dark:text-red-400 truncate leading-tight"
                          title={`${amount} ج.م`}
                        >
                          {compactMoney(amount)}
                          <span className="hidden sm:inline"> ج</span>
                        </div>
                      )}
                      {Number(cell.data?.income || 0) > 0 && (
                        <div
                          className="text-[9px] sm:text-[11px] font-bold text-emerald-700 dark:text-emerald-400 truncate leading-tight"
                          title={`دخل ${cell.data.income}`}
                        >
                          +{compactMoney(cell.data.income)}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
