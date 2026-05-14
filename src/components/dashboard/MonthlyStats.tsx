import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Receipt, Calendar } from "lucide-react";

interface MonthlyStatsProps {
  total: number;
  count: number;
  dailyAverage: number;
  previousMonthTotal?: number;
}

export function MonthlyStats({
  total,
  count,
  dailyAverage,
  previousMonthTotal,
}: MonthlyStatsProps) {
  const change =
    previousMonthTotal && previousMonthTotal > 0
      ? ((total - previousMonthTotal) / previousMonthTotal) * 100
      : 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">إجمالي الشهر</CardTitle>
          <Receipt className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-sm font-normal text-muted-foreground">ج.م</span></div>
          {change !== 0 && (
            <div
              className={`flex items-center text-xs ${
                change > 0 ? "text-red-500" : "text-green-500"
              }`}
            >
              {change > 0 ? (
                <TrendingUp className="w-3 h-3 mr-1" />
              ) : (
                <TrendingDown className="w-3 h-3 mr-1" />
              )}
              {Math.abs(change).toFixed(1)}% عن الشهر اللي فات
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">عدد العمليات</CardTitle>
          <Calendar className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{count.toLocaleString("en-US")}</div>
          <p className="text-xs text-muted-foreground">عملية</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">المتوسط اليومي</CardTitle>
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{dailyAverage.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-sm font-normal text-muted-foreground">ج.م</span></div>
          <p className="text-xs text-muted-foreground">في اليوم</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">المتوسط للعملية</CardTitle>
          <Receipt className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {count > 0 ? (total / count).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 0} <span className="text-sm font-normal text-muted-foreground">ج.م</span>
          </div>
          <p className="text-xs text-muted-foreground">للمصروف الواحد</p>
        </CardContent>
      </Card>
    </div>
  );
}
