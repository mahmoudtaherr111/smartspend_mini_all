import { useEffect, useMemo, useState, lazy, Suspense, memo, useCallback, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  CalendarDays,
  ReceiptText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { trpc } from "@/providers/trpc";

import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { RecentExpenses } from "@/components/expenses/RecentExpenses";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain } from "lucide-react";
import { OnboardingCard } from "@/components/OnboardingCard";
import { ProductTour } from "@/components/ProductTour";
import { getCategoryColor } from "@/lib/utils";

const ExpenseChart = lazy(() =>
  import("@/components/dashboard/ExpenseChart").then((m) => ({ default: m.ExpenseChart }))
);
import { AIInsights } from "@/components/insights/AIInsights";
import { BehaviorInsights } from "@/components/dashboard/BehaviorInsights";
import { ReceiptCapture } from "@/components/expenses/ReceiptCapture";

const FinancialGoalsPanel = lazy(() =>
  import("@/components/goals/FinancialGoalsPanel").then((m) => ({ default: m.FinancialGoalsPanel }))
);
import { MonthlyCalendar } from "@/components/dashboard/MonthlyCalendar";
import { PlanUsageStrip } from "@/components/layout/PlanUsageStrip";

type HomeTab = "record" | "stats" | "ai" | "calendar";

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeTab(value: string | null): HomeTab {
  if (value === "stats" || value === "ai" || value === "calendar") return value;
  return "record";
}

const HealthBadge = memo(function HealthBadge({ summary }: { summary: any }) {
  const ratio = summary?.totalIncome > 0 ? Math.round((summary.totalExpense / summary.totalIncome) * 100) : null;
  if (ratio === null) return <Badge variant="secondary">أضف الدخل لقراءة أدق</Badge>;
  if (ratio <= 60) return <Badge className="bg-emerald-600">مستقر</Badge>;
  if (ratio <= 90) return <Badge className="bg-amber-600">تحت المتابعة</Badge>;
  return <Badge variant="destructive">ضغط مالي</Badge>;
});

const SummaryChip = memo(function SummaryChip({
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
      ? "border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300"
      : tone === "expense"
        ? "border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300"
        : "border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <div className="shrink-0 p-1.5 rounded-md bg-background/50">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className="text-sm font-bold truncate">{value}</p>
        </div>
      </div>
      {helper && <p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>}
    </div>
  );
});

export default function Home() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<HomeTab>(normalizeTab(searchParams.get("tab")));
  const [month, setMonth] = useState(searchParams.get("month") || currentMonthValue());

  useEffect(() => {
    setActiveTab(normalizeTab(searchParams.get("tab")));
    setMonth(searchParams.get("month") || currentMonthValue());
  }, [searchParams]);

  const shouldLoadStats = activeTab === "stats" || activeTab === "calendar";
  
  const { data: profile } = trpc.profile.getSmartProfile.useQuery();
  const salaryDay = profile?.financialInfo?.hasFixedSalary && profile?.financialInfo?.salaryDay 
    ? Number(profile.financialInfo.salaryDay) 
    : undefined;

  const { data: summary, isFetching: summaryFetching } = trpc.expense.getMonthSummary.useQuery(
    { month, salaryDay },
    { staleTime: 30_000 }
  );
  const {
    data: stats,
    isFetching: statsFetching,
    isError: statsError,
    error: statsQueryError,
    refetch: refetchStats,
  } = trpc.expense.getMonthlyStats.useQuery(
    { month, salaryDay },
    { enabled: shouldLoadStats, staleTime: 30_000, retry: 1 }
  );
  const refreshInferences = trpc.profile.refreshInferences.useMutation({
    onSuccess: () => {
      utils.profile.getSmartProfile.invalidate();
      utils.expense.getMonthlyStats.invalidate({ month });
    },
  });

  const handleRefreshInferences = useCallback(() => {
    refreshInferences.mutate({ month });
  }, [month, refreshInferences.mutate]);

  const pageTitle = useMemo(() => {
    if (activeTab === "stats") return "الإحصائيات المالية";
    if (activeTab === "ai") return "تحليل الذكاء الاصطناعي";
    if (activeTab === "calendar") return "تقويم الشهر";
    return "تسجيل العمليات";
  }, [activeTab]);

  const updateView = (tab: HomeTab, nextMonth = month) => {
    setActiveTab(tab);
    setSearchParams({ tab, month: nextMonth });
  };

  const handleMonthChange = (value: string) => {
    setMonth(value);
    setSearchParams({ tab: activeTab, month: value });
  };

  const handleRefresh = () => {
    utils.expense.getMonthSummary.invalidate({ month });
    if (shouldLoadStats) utils.expense.getMonthlyStats.invalidate({ month });
  };

  const netFlow = summary?.netFlow || 0;

  return (
    <div className="min-h-dvh min-h-screen bg-slate-50/70 dark:bg-slate-950/40">
      <ProductTour />
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-5">
        <OnboardingCard />
        <PlanUsageStrip />
        <header className="flex flex-col gap-3 sticky top-[calc(3.5rem+env(safe-area-inset-top))] lg:static z-30 -mx-1 px-1 py-2 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{pageTitle}</h1>
              <HealthBadge summary={summary} />
            </div>
            <p className="text-muted-foreground text-sm">
              أهلاً {user?.name || "صديقي"}، ابدأ بتسجيل العملية بسرعة واترك التحليلات لقسم الإحصائيات.
            </p>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => updateView(v as HomeTab)} className="hidden sm:block w-full">
            <TabsList className="w-full grid grid-cols-4 h-auto p-1">
              <TabsTrigger value="record" className="text-xs sm:text-sm">تسجيل</TabsTrigger>
              <TabsTrigger value="stats" className="text-xs sm:text-sm">إحصائيات</TabsTrigger>
              <TabsTrigger value="ai" className="text-xs sm:text-sm gap-1">
                <Brain className="w-3.5 h-3.5" />
                ذكاء اصطناعي
              </TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs sm:text-sm">تقويم</TabsTrigger>
            </TabsList>
          </Tabs>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <SummaryChip
            label="دخل الشهر"
            value={`${money(summary?.totalIncome)} ج.م`}
            tone="income"
            icon={<WalletCards className="w-4 h-4" />}
          />
          <SummaryChip
            label="مصروف الشهر"
            value={`${money(summary?.totalExpense)} ج.م`}
            tone="expense"
            icon={<TrendingDown className="w-4 h-4" />}
          />
        </section>

        {activeTab === "record" && (
          <section className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] gap-5 items-start">
              <ExpenseForm
                onSuccess={() => {
                  utils.expense.getMonthSummary.invalidate({ month });
                  utils.expense.getMonthlyStats.invalidate({ month });
                  utils.profile.getSmartProfile.invalidate();
                }}
              />
              <div className="space-y-4">
                <ReceiptCapture
                  onSaved={() => {
                    utils.expense.getMonthSummary.invalidate({ month });
                    utils.expense.getMonthlyStats.invalidate({ month });
                  }}
                />
                <RecentExpenses limit={7} onRefresh={() => utils.expense.getMonthSummary.invalidate({ month })} />
              </div>
            </div>

            <Suspense fallback={<Card><CardContent className="py-8"><Skeleton className="h-24 w-full" /></CardContent></Card>}>
              <FinancialGoalsPanel />
            </Suspense>

            <div className="pt-6 pb-2 border-t flex justify-center">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto gap-2 min-h-[48px] active-press"
                onClick={() => updateView("stats")}
              >
                <BarChart3 className="w-5 h-5" />
                عرض الإحصائيات الكاملة
              </Button>
            </div>
          </section>
        )}

        {activeTab === "stats" && (
          statsError ? (
            <Card className="border-destructive/30">
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm font-medium text-destructive">تعذّر تحميل الإحصائيات</p>
                <p className="text-xs text-muted-foreground">{statsQueryError?.message || "تحقق من الاتصال بقاعدة البيانات ثم أعد المحاولة."}</p>
                <Button variant="outline" size="sm" onClick={() => refetchStats()}>إعادة المحاولة</Button>
              </CardContent>
            </Card>
          ) : (
            <StatsView
              month={month}
              stats={stats}
              loading={statsFetching}
              refreshInferences={handleRefreshInferences}
              refreshingInferences={refreshInferences.isPending}
            />
          )
        )}

        {activeTab === "ai" && <AIInsights month={month} />}

        {activeTab === "calendar" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="w-5 h-5 text-sky-600" />
                تقويم الشهر
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsFetching && !stats ? (
                <div className="py-10 text-center text-sm text-muted-foreground">جاري تحميل التقويم...</div>
              ) : (
                <MonthlyCalendar month={month} dayTrend={stats?.dayTrend || []} salaryDay={salaryDay} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const StatsView = memo(function StatsView({
  month,
  stats,
  loading,
  refreshInferences,
  refreshingInferences,
}: {
  month: string;
  stats: any;
  loading: boolean;
  refreshInferences: () => void;
  refreshingInferences: boolean;
}) {
  const topCategory = stats?.topCategories?.[0];
  const changePercent = stats?.behavioralInsights?.expenseChangePercent;
  const isUp = typeof changePercent === "number" && changePercent > 0;
  const dailyAvg = stats?.dailyAverage || 0;
  const topCategories = stats?.topCategories?.slice(0, 5) || [];
  const totalExpense = topCategories.reduce((s: number, c: any) => s + (c.value || 0), 0);

  if (loading && !stats) {
    return (
      <section className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="py-8"><Skeleton className="h-8 w-full" /></CardContent></Card>
        ))}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Daily Average */}
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-1 shadow-sm">
          <p className="text-[11px] text-muted-foreground">متوسط يومي</p>
          <p className="text-xl font-bold">{money(dailyAvg)}</p>
          <p className="text-[10px] text-muted-foreground">ج.م / يوم</p>
        </div>

        {/* Month change */}
        <div className={`rounded-xl border p-4 flex flex-col gap-1 shadow-sm ${
          isUp
            ? "bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900"
            : "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900"
        }`}>
          <p className={`text-[11px] ${isUp ? "text-rose-600" : "text-emerald-600"}`}>مقارنة بالشهر السابق</p>
          <p className={`text-xl font-bold ${isUp ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`} dir="ltr">
            {changePercent != null ? `${isUp ? "+" : ""}${changePercent.toFixed(1)}%` : "—"}
          </p>
          <div className={`flex items-center gap-1 text-[10px] ${isUp ? "text-rose-500" : "text-emerald-500"}`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isUp ? "زيادة في الصرف" : "انخفاض في الصرف"}
          </div>
        </div>

        {/* Top category */}
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-1 shadow-sm">
          <p className="text-[11px] text-muted-foreground">أعلى فئة</p>
          <p className="text-base font-bold truncate">{topCategory?.name || "—"}</p>
          <p className="text-[10px] text-muted-foreground">{topCategory ? `${money(topCategory.value)} ج.م` : ""}</p>
        </div>

        {/* Behavior tag */}
        <div className="rounded-xl border bg-violet-50 dark:bg-violet-950/20 border-violet-100 dark:border-violet-900 p-4 flex flex-col gap-1 shadow-sm">
          <p className="text-[11px] text-violet-600 dark:text-violet-400">الشخصية المالية</p>
          <p className="text-base font-bold text-violet-700 dark:text-violet-300">
            {stats?.behavioralInsights?.spendingBehavior === "emotional" ? "صرف عاطفي"
              : stats?.behavioralInsights?.spendingBehavior === "impulsive" ? "مندفع"
              : stats?.behavioralInsights?.spendingBehavior === "planned" ? "مخطط"
              : stats?.behavioralInsights?.spendingBehavior === "conservative" ? "محافظ"
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
            <CardContent>
              <Suspense fallback={<Skeleton className="h-[320px] w-full rounded-lg" />}>
                <ExpenseChart
                  categoryData={stats?.categoryBreakdown || []}
                  subCategoryData={stats?.subCategoryBreakdown || []}
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
                  المعاملات التي تم تسجيلها تلقائياً عبر SmartSpend Sync من إشعارات ورسائل البنك.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500">مصروفات آلية</p>
                    <p className="text-lg font-bold text-rose-400">
                      {money(stats.automatedExpense)} <span className="text-xs font-normal">ج</span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500">مقبوضات آلية</p>
                    <p className="text-lg font-bold text-emerald-400">
                      {money(stats.automatedIncome)} <span className="text-xs font-normal">ج</span>
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
                  const pct = totalExpense > 0 ? Math.round((cat.value / totalExpense) * 100) : 0;
                  const catColor = getCategoryColor(cat.name, i);
                  return (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4 text-center font-bold">{i + 1}</span>
                          <span className="font-medium truncate max-w-32">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                          <span className="text-xs font-semibold">{money(cat.value)} ج</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: catColor }}
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
