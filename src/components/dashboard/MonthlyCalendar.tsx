import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function MonthlyCalendar({ month, dayTrend = [] }: { month: string; dayTrend?: any[] }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const leading = firstDay.getDay();
  const trendMap = new Map(dayTrend.map((day: any) => [String(day.date).slice(-2), day]));
  const maxSpend = Math.max(1, ...dayTrend.map((day: any) => Number(day.amount || 0)));
  const cells = [
    ...Array.from({ length: leading }, (_, index) => ({ empty: true, key: `empty-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return { day, key: day, data: trendMap.get(day) };
    }),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-sky-600" />
          التقويم المالي
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground mb-2">
          {["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((cell: any) => {
            const amount = Number(cell.data?.amount || 0);
            const intensity = amount / maxSpend;
            return (
              <div
                key={cell.key}
                className={cn(
                  "min-h-20 rounded-md border p-2 text-right transition-colors",
                  cell.empty && "border-transparent",
                  !cell.empty && amount === 0 && "bg-background",
                  amount > 0 && "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900"
                )}
                style={amount > 0 ? { opacity: 0.55 + intensity * 0.45 } : undefined}
              >
                {!cell.empty && (
                  <>
                    <div className="font-semibold text-sm">{Number(cell.day)}</div>
                    {amount > 0 && (
                      <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                        {money(amount)} ج.م
                      </div>
                    )}
                    {Number(cell.data?.income || 0) > 0 && (
                      <div className="text-[11px] text-sky-700 dark:text-sky-300">
                        دخل {money(cell.data.income)}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
