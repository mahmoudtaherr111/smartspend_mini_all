import { memo, useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function compactMoney(value: unknown) {
  const num = Number(value || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "m";
  if (num >= 10000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function DayTransactionsDialog({
  isOpen,
  onClose,
  dateStr,
}: {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string | null;
}) {
  if (!dateStr) return null;

  // Use local timezone boundaries (no Z suffix) to prevent day-boundary shifts
  // e.g., for UTC+2 (Egypt), "2026-01-15T00:00:00.000Z" would actually be 2am local time
  const startDate = `${dateStr}T00:00:00.000`;
  const endDate = `${dateStr}T23:59:59.999`;

  const { data, isLoading, isFetching } = trpc.expense.list.useQuery(
    { startDate, endDate, limit: 100 },
    { enabled: isOpen }
  );

  const formattedDate = new Date(dateStr).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-w-[92vw] rounded-2xl" dir="rtl">
        <DialogHeader className="text-end pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle className="text-base sm:text-lg font-black flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span>معاملات {formattedDate}</span>
            {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 max-h-[60vh] overflow-y-auto space-y-3 pe-1 hide-scrollbar">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              جاري تحميل المعاملات...
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              لا توجد أي معاملات مسجلة في هذا اليوم. 🪙
            </div>
          ) : (
            <div className="space-y-2">
              {data.items.map((item) => {
                const isIncome = item.type === "income";
                const isTransfer = item.type === "transfer";
                const isInvestment = item.type === "investment";
                
                const amountColor = isIncome
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isTransfer
                    ? "text-sky-600 dark:text-sky-400"
                    : isInvestment
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400";

                const typeLabel = isIncome
                  ? "دخل"
                  : isTransfer
                    ? "تحويل"
                    : isInvestment
                      ? "استثمار"
                      : "مصروف";

                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-3 text-end"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                          {item.category}
                        </span>
                        {item.subCategory && item.subCategory !== "عام" && (
                          <span className="text-[10px] text-muted-foreground px-1 bg-slate-100 dark:bg-slate-800 rounded">
                            {item.subCategory}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] py-0.25 px-1.5 border-0 font-bold",
                            isIncome
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                              : isTransfer
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
                                : isInvestment
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                          )}
                        >
                          {typeLabel}
                        </Badge>
                      </div>
                      {item.description && item.description !== "?" && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <div className={`font-extrabold text-base shrink-0 ${amountColor}`} dir="ltr">
                      {isIncome ? "+" : isTransfer ? "" : isInvestment ? "" : "-"}
                      {Number(item.amount).toLocaleString("en-US", { maximumFractionDigits: 0 })} ج
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  const [year, monthNumber] = month.split("-").map(Number);
  const month0 = monthNumber - 1;

  let start: Date;
  let end: Date;

  if (salaryDay && salaryDay > 1) {
    const clampDay = (y: number, m: number, d: number) => {
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      return Math.min(d, daysInMonth);
    };

    const clampedStart = clampDay(year, month0, salaryDay);
    start = new Date(year, month0, clampedStart, 0, 0, 0, 0);

    const nextMonth0 = month0 + 1;
    const nextYear = nextMonth0 > 11 ? year + 1 : year;
    const nextMonth0Clamped = nextMonth0 > 11 ? 0 : nextMonth0;
    const clampedEnd = clampDay(nextYear, nextMonth0Clamped, salaryDay);
    end = new Date(
      nextYear,
      nextMonth0Clamped,
      clampedEnd - 1,
      23,
      59,
      59,
      999,
    );
  } else {
    start = new Date(year, month0, 1, 0, 0, 0, 0);
    end = new Date(year, month0 + 1, 0, 23, 59, 59, 999);
  }

  const daysTotal = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const leading = start.getDay();

  const trendMap = new Map(
    dayTrend.map((day: any) => [day.date, day]),
  );

  const maxSpend = Math.max(
    1,
    ...dayTrend.map((day: any) => Number(day.amount || 0)),
  );

  const cells = [
    ...Array.from({ length: leading }, (_, index) => ({
      empty: true,
      key: `empty-${index}`,
      fullDateStr: null,
      day: null,
    })),
    ...Array.from({ length: daysTotal }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);

      const dayStr = String(date.getDate()).padStart(2, "0");
      const monthStr = String(date.getMonth() + 1).padStart(2, "0");
      const key = `${monthStr}-${dayStr}`; // MM-DD
      const fullDateStr = `${date.getFullYear()}-${monthStr}-${dayStr}`;

      return {
        day: String(date.getDate()),
        key: fullDateStr,
        fullDateStr,
        data: trendMap.get(key),
      };
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
            const income = Number(cell.data?.income || 0);
            const intensity = amount / maxSpend;
            const hasData = amount > 0 || income > 0;

            if (cell.empty) {
              return (
                <div
                  key={cell.key}
                  className="min-h-[3.75rem] xs:min-h-[4.5rem] sm:min-h-[5rem] border border-transparent"
                />
              );
            }

            const fullDateStr = cell.fullDateStr;
            const isSalaryDay = salaryDay && Number(cell.day) === salaryDay;

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDate(fullDateStr)}
                className={cn(
                  "min-h-[3.75rem] xs:min-h-[4.5rem] sm:min-h-[5rem] rounded-lg border text-end transition-all overflow-hidden flex flex-col justify-between p-0.5 xs:p-1 sm:p-2 cursor-pointer active-press select-none",
                  amount === 0 && income === 0 && "bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900/50 border-slate-200 dark:border-slate-800",
                  amount > 0 && "bg-rose-500/5 border-rose-500/10 hover:bg-rose-500/10 dark:bg-rose-500/10 dark:border-rose-500/20",
                  income > 0 && amount === 0 && "bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10 dark:bg-emerald-500/10 dark:border-emerald-500/20",
                  isSalaryDay && "border-amber-400 dark:border-amber-600/80 shadow-md shadow-amber-500/5 bg-amber-50/10 dark:bg-amber-950/5 ring-1 ring-amber-400/30"
                )}
                style={
                  amount > 0 ? { opacity: 0.65 + intensity * 0.35 } : undefined
                }
              >
                <div className="flex justify-between items-center w-full">
                  <span className={cn(
                    "font-extrabold text-[10px] xs:text-xs sm:text-sm",
                    isSalaryDay ? "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/50 px-1 rounded font-black" : "text-slate-800 dark:text-slate-200"
                  )}>
                    {Number(cell.day)}
                  </span>
                  {isSalaryDay ? (
                    <span className="text-[10px] sm:text-xs" title="يوم القبض">💰</span>
                  ) : hasData ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 sm:hidden animate-pulse" />
                  ) : null}
                </div>
                <div className="w-full mt-auto space-y-0.5 text-start" dir="ltr">
                  {amount > 0 && (
                    <div
                      className="text-[8px] xs:text-[9px] sm:text-[11px] font-black text-rose-600 dark:text-rose-400 truncate leading-tight"
                      title={`${amount} ج.م`}
                    >
                      {compactMoney(amount)}
                      <span className="hidden xs:inline"> ج</span>
                    </div>
                  )}
                  {income > 0 && (
                    <div
                      className="text-[8px] xs:text-[9px] sm:text-[11px] font-black text-emerald-600 dark:text-emerald-400 truncate leading-tight"
                      title={`دخل ${income}`}
                    >
                      +{compactMoney(income)}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <DayTransactionsDialog
        isOpen={selectedDate !== null}
        onClose={() => setSelectedDate(null)}
        dateStr={selectedDate}
      />
    </div>
  );
});
