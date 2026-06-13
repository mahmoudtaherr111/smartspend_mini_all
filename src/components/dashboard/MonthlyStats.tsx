import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  Receipt,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

interface MonthlyStatsProps {
  total: number;
  totalIncome?: number;
  netFlow?: number;
  count: number;
  dailyAverage: number;
  previousMonthTotal?: number;
  expenseChangePercent?: number | null;
}

function money(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function MonthlyStats({
  total,
  totalIncome = 0,
  netFlow = 0,
  count,
  dailyAverage,
  previousMonthTotal,
  expenseChangePercent,
}: MonthlyStatsProps) {
  const change =
    typeof expenseChangePercent === "number"
      ? expenseChangePercent
      : previousMonthTotal && previousMonthTotal > 0
        ? ((total - previousMonthTotal) / previousMonthTotal) * 100
        : 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">إجمالي المصروف</CardTitle>
          <Receipt className="w-4 h-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {money(total)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ج.م
            </span>
          </div>
          {change !== 0 && (
            <div
              className={`flex items-center text-xs ${change > 0 ? "text-red-500" : "text-green-600"}`}
            >
              {change > 0 ? (
                <TrendingUp className="w-3 h-3 ms-1" />
              ) : (
                <TrendingDown className="w-3 h-3 ms-1" />
              )}
              {Math.abs(change).toFixed(1)}% عن الشهر السابق
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">إجمالي الدخل</CardTitle>
          <WalletCards className="w-4 h-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600">
            {money(totalIncome)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ج.م
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            الدخل المسجل هذا الشهر
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">صافي الشهر</CardTitle>
          {netFlow >= 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${netFlow >= 0 ? "text-emerald-600" : "text-red-500"}`}
          >
            {money(netFlow)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ج.م
            </span>
          </div>
          <p className="text-xs text-muted-foreground">الدخل ناقص المصروف</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">المتوسط اليومي</CardTitle>
          <Calendar className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {money(dailyAverage)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ج.م
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {count.toLocaleString("en-US")} عملية هذا الشهر
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
