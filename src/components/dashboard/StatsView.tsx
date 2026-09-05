import { memo, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { cn, getCategoryColor } from "@/lib/utils";
import { money } from "./HomeSummaryCards";
import { BehaviorInsights } from "@/components/dashboard/BehaviorInsights";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";

const ExpenseChart = lazy(() =>
  import("@/components/dashboard/ExpenseChart").then((m) => ({
    default: m.ExpenseChart,
  })),
);

interface StatsViewProps {
  month: string;
  stats: any;
  loading: boolean;
  refreshInferences?: () => void;
  refreshingInferences?: boolean;
}

export const StatsView = memo(function StatsView({
  month: _month,
  stats,
  loading,
  refreshInferences: _refreshInferences,
  refreshingInferences: _refreshingInferences,
}: StatsViewProps) {
  const topCategory = stats?.topCategories?.[0];
  const changePercent = stats?.behavioralInsights?.expenseChangePercent;
  const isUp = typeof changePercent === "number" && changePercent > 0;
  const comparisonType =
    stats?.behavioralInsights?.comparisonType || "monthly";
  const weekNumber = stats?.behavioralInsights?.weekNumber || 1;
  const dailyAvg = stats?.dailyAverage || 0;
  const topCategories = stats?.topCategories?.slice(0, 5) || [];
  const totalExpense = stats?.totalExpense || 0;

  if (loading && !stats) {
    return (
      <section className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="premium-card p-4 flex flex-col gap-2 h-[90px] justify-center border-slate-200/50 bg-white/70 dark:bg-slate-900/40"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-2 w-12" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 sm:gap-5 items-start">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[320px] w-full rounded-lg" />
              </CardContent>
            </Card>
          </div>
          <aside className="space-y-4">
            <Card>
              <CardHeader className="pb-3 pt-4">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full rounded-lg" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-36" />
              </CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Daily Average */}
        <div className="premium-card p-4 flex flex-col gap-1">
          <p className="text-[11px] text-muted-foreground">متوسط يومي</p>
          <p className="text-xl font-bold">{money(dailyAvg)}</p>
          <p className="text-[10px] text-muted-foreground">ج.م / يوم</p>
        </div>

        {/* Month change */}
        <div
          className={cn(
            "premium-card p-4 flex flex-col gap-1",
            changePercent == null
              ? "text-muted-foreground"
              : isUp
                ? "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300"
                : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
          )}
        >
          <p className="text-[11px] font-medium">
            {comparisonType === "weekly"
              ? `مقارنة بالأسبوع المماثل (${weekNumber})`
              : "مقارنة بالشهر السابق"}
          </p>
          <p className="text-xl font-bold" dir="ltr">
            {changePercent != null
              ? `${isUp ? "+" : ""}${changePercent.toFixed(1)}%`
              : "—"}
          </p>
          <div className="flex items-center gap-1 text-[10px] opacity-90">
            {changePercent != null ? (
              <>
                {isUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {isUp ? "زيادة في الصرف" : "انخفاض في الصرف"}
              </>
            ) : (
              "لا يوجد بيانات مقارنة"
            )}
          </div>
        </div>

        {/* Top category */}
        <div className="premium-card p-4 flex flex-col gap-1">
          <p className="text-[11px] text-muted-foreground">أعلى فئة</p>
          <p className="text-base font-bold truncate">
            {topCategory?.name || "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {topCategory ? `${money(topCategory.value)} ج.م` : ""}
          </p>
        </div>

        {/* Behavior tag */}
        <div className="premium-card bg-violet-500/5 border-violet-500/20 p-4 flex flex-col gap-1">
          <p className="text-[11px] text-violet-600 dark:text-violet-400">
            الشخصية المالية
          </p>
          <p className="text-base font-bold text-violet-700 dark:text-violet-300">
            {stats?.behavioralInsights?.spendingBehavior === "emotional"
              ? "صرف عاطفي"
              : stats?.behavioralInsights?.spendingBehavior === "impulsive"
                ? "مندفع"
                : stats?.behavioralInsights?.spendingBehavior === "planned"
                  ? "مخطط"
                  : stats?.behavioralInsights?.spendingBehavior ===
                      "conservative"
                    ? "محافظ"
                    : "متوازن"}
          </p>
          <p className="text-[10px] text-violet-500">بناءً على السلوك الشهري</p>
        </div>
      </div>

      {/* Main content: charts + sidebar — stack on mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 sm:gap-5 items-start">
        {/* Left: Charts */}
        <div className="space-y-5 flex flex-col">
          <Card className="order-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-5 h-5 text-sky-600" />
                تحليل الفئات والتوقيت
              </CardTitle>
            </CardHeader>
            <CardContent className="no-swipe">
              <Suspense
                fallback={<Skeleton className="h-[320px] w-full rounded-lg" />}
              >
                <ExpenseChart
                  categoryData={stats?.categoryBreakdown || []}
                  subCategoryData={stats?.subCategoryBreakdown || []}
                  familyBreakdown={stats?.familyBreakdown || []}
                  hourTrend={stats?.hourTrend || []}
                  dayOfWeekTrend={stats?.dayOfWeekTrend || []}
                  dayTrend={stats?.dayTrend || []}
                  items={stats?.items || []}
                />
              </Suspense>
            </CardContent>
          </Card>

          <div className="order-2">
            <BehaviorInsights stats={stats} />
          </div>
        </div>

        {/* Right: Sidebar */}
        <aside className="space-y-4">
          {/* Global Search Bar */}
          <Card className="border shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <span>البحث عن أي عملية 🔍</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 pt-0">
              <GlobalSearch />
            </CardContent>
          </Card>

          {/* Automated Bank Tracking */}
          {(stats?.automatedExpense > 0 || stats?.automatedIncome > 0) && (
            <Card className="bg-slate-900 text-slate-50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 font-medium">
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  التتبع الآلي للبنوك
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-slate-400">
                  المعاملات التي تم تسجيلها تلقائياً عبر SmartSpend Sync من
                  إشعارات ورسائل البنك.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500">مصروفات آلية</p>
                    <p className="text-lg font-bold text-rose-400">
                      {money(stats.automatedExpense)}{" "}
                      <span className="text-xs font-normal">ج</span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500">مقبوضات آلية</p>
                    <p className="text-lg font-bold text-emerald-400">
                      {money(stats.automatedIncome)}{" "}
                      <span className="text-xs font-normal">ج</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Categories */}
          {topCategories.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <WalletCards className="w-4 h-4 text-sky-600" />
                  أعلى 5 فئات إنفاق
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topCategories.map((cat: any, i: number) => {
                  const pct =
                    totalExpense > 0
                      ? Math.round((cat.value / totalExpense) * 100)
                      : 0;
                  const catColor = getCategoryColor(cat.name, i);
                  return (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4 text-center font-bold">
                            {i + 1}
                          </span>
                          <span className="font-medium truncate max-w-32">
                            {cat.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {pct}%
                          </span>
                          <span className="text-xs font-semibold">
                            {money(cat.value)} ج
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: catColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </section>
  );
});
