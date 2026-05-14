import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarDays, Repeat, TrendingDown, TrendingUp } from "lucide-react";

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function BehaviorInsights({ stats }: { stats: any }) {
  const behavioral = stats?.behavioralInsights || {};
  const comparative = stats?.comparativeAnalysis || {};
  const trend = comparative.trend;
  const topDay = behavioral.topSpendingDay;
  const recurring = behavioral.mostRecurringExpense;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-sky-600" />
            أعلى يوم صرف
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">{topDay ? `${money(topDay.amount)} ج.م` : "لا يوجد"}</p>
          <p className="text-xs text-muted-foreground">{topDay?.date || "سجل مصاريف أكثر لتظهر القراءة"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Repeat className="w-4 h-4 text-violet-600" />
            أكثر بند تكرارًا
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold truncate">{recurring?.name || "لا يوجد"}</p>
          <p className="text-xs text-muted-foreground">{recurring ? `${recurring.count} عمليات` : "لا توجد تكرارات واضحة"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {trend === "up" ? <TrendingUp className="w-4 h-4 text-rose-600" /> : <TrendingDown className="w-4 h-4 text-emerald-600" />}
            مقارنة بالشهر السابق
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold">
              {behavioral.expenseChangePercent === null || behavioral.expenseChangePercent === undefined
                ? "جديد"
                : `${Math.abs(behavioral.expenseChangePercent)}%`}
            </p>
            {trend === "up" && <Badge variant="destructive">زيادة</Badge>}
            {trend === "down" && <Badge className="bg-emerald-600">انخفاض</Badge>}
            {trend === "flat" && <Badge variant="secondary">ثابت</Badge>}
          </div>
          {trend === "up" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              راقب الفئات الأعلى قبل نهاية الشهر.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
