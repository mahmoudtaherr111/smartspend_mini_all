import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Brain,
  CalendarDays,
  ReceiptText,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { trpc } from "@/providers/trpc";

import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { RecentExpenses } from "@/components/expenses/RecentExpenses";
import { MonthlyStats } from "@/components/dashboard/MonthlyStats";
import { ExpenseChart } from "@/components/dashboard/ExpenseChart";
import { AIInsights } from "@/components/insights/AIInsights";
import { OnboardingCard } from "@/components/OnboardingCard";
import { UserIntelligencePanel } from "@/components/dashboard/UserIntelligencePanel";
import { BehaviorInsights } from "@/components/dashboard/BehaviorInsights";
import { MonthlyCalendar } from "@/components/dashboard/MonthlyCalendar";

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

function HealthBadge({ summary }: { summary: any }) {
  const ratio = summary?.totalIncome > 0 ? Math.round((summary.totalExpense / summary.totalIncome) * 100) : null;
  if (ratio === null) return <Badge variant="secondary">أضف الدخل لقراءة أدق</Badge>;
  if (ratio <= 60) return <Badge className="bg-emerald-600">مستقر</Badge>;
  if (ratio <= 90) return <Badge className="bg-amber-600">تحت المتابعة</Badge>;
  return <Badge variant="destructive">ضغط مالي</Badge>;
}

function SummaryChip({
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
        </div>
        <div className="shrink-0">{icon}</div>
      </div>
      {helper && <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );
}

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
  const { data: summary, isFetching: summaryFetching } = trpc.expense.getMonthSummary.useQuery(
    { month },
    { staleTime: 30_000 }
  );
  const { data: stats, isFetching: statsFetching } = trpc.expense.getMonthlyStats.useQuery(
    { month },
    { enabled: shouldLoadStats, staleTime: 30_000 }
  );
  const refreshInferences = trpc.profile.refreshInferences.useMutation({
    onSuccess: () => {
      utils.profile.getSmartProfile.invalidate();
      utils.expense.getMonthlyStats.invalidate({ month });
    },
  });

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
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950/40">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold">{pageTitle}</h1>
              <HealthBadge summary={summary} />
            </div>
            <p className="text-muted-foreground text-sm">
              أهلاً {user?.name || "صديقي"}، ابدأ بتسجيل العملية بسرعة واترك التحليلات لقسم الإحصائيات.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="month"
              value={month}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            />
            <Button variant="outline" className="gap-2" onClick={handleRefresh} disabled={summaryFetching || statsFetching}>
              <RefreshCw className={summaryFetching || statsFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
              تحديث
            </Button>
            {activeTab !== "record" ? (
              <Button variant="outline" className="gap-2" onClick={() => updateView("record")}>
                <ReceiptText className="w-4 h-4" />
                التسجيل
              </Button>
            ) : (
              <Button variant="outline" className="gap-2" onClick={() => updateView("stats")}>
                <BarChart3 className="w-4 h-4" />
                الإحصائيات
              </Button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryChip
            label="دخل الشهر"
            value={`${money(summary?.totalIncome)} ج.م`}
            tone="income"
            icon={<WalletCards className="w-5 h-5" />}
          />
          <SummaryChip
            label="مصروف الشهر"
            value={`${money(summary?.totalExpense)} ج.م`}
            tone="expense"
            icon={<TrendingDown className="w-5 h-5" />}
          />
          <SummaryChip
            label="الصافي"
            value={`${money(netFlow)} ج.م`}
            tone="neutral"
            helper={`${summary?.count || 0} عملية هذا الشهر`}
            icon={netFlow >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-rose-600" />}
          />
        </section>

        {activeTab === "record" && (
          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] gap-5 items-start">
            <ExpenseForm
              onSuccess={() => {
                utils.expense.getMonthSummary.invalidate({ month });
                utils.expense.getMonthlyStats.invalidate({ month });
                utils.profile.getSmartProfile.invalidate();
              }}
            />
            <RecentExpenses limit={7} onRefresh={() => utils.expense.getMonthSummary.invalidate({ month })} />
          </section>
        )}

        {activeTab === "stats" && (
          <StatsView
            month={month}
            stats={stats}
            loading={statsFetching}
            refreshInferences={() => refreshInferences.mutate({ month })}
            refreshingInferences={refreshInferences.isPending}
          />
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
                <MonthlyCalendar month={month} dayTrend={stats?.dayTrend || []} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatsView({
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
  const previousExpense = stats?.comparativeAnalysis?.previousMonth?.totalExpense || 0;
  const topCategory = stats?.topCategories?.[0];

  if (loading && !stats) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">جاري تحميل الإحصائيات...</CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="space-y-5">
          <MonthlyStats
            total={stats?.totalExpense || 0}
            totalIncome={stats?.totalIncome || 0}
            netFlow={stats?.netFlow || 0}
            count={stats?.count || 0}
            dailyAverage={stats?.dailyAverage || 0}
            previousMonthTotal={previousExpense}
            expenseChangePercent={stats?.behavioralInsights?.expenseChangePercent}
          />

          <BehaviorInsights stats={stats} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-5 h-5 text-sky-600" />
                تحليل الفئات والتوقيت
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ExpenseChart
                categoryData={stats?.categoryBreakdown || []}
                subCategoryData={stats?.subCategoryBreakdown || []}
                hourTrend={stats?.hourTrend || []}
                dayOfWeekTrend={stats?.dayOfWeekTrend || []}
                dayTrend={stats?.dayTrend || []}
                items={stats?.items || []}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-5 h-5 text-violet-600" />
                ملخص ذكي
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">أعلى فئة</span>
                <span className="font-semibold truncate max-w-44">{topCategory?.name || "لا يوجد"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">قيمة أعلى فئة</span>
                <span className="font-semibold">{money(topCategory?.value)} ج.م</span>
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={refreshInferences} disabled={refreshingInferences}>
                <Sparkles className={refreshingInferences ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                تحديث ذكاء المستخدم
              </Button>
            </CardContent>
          </Card>

          <UserIntelligencePanel month={month} />
          <OnboardingCard />
        </aside>
      </div>
    </section>
  );
}
