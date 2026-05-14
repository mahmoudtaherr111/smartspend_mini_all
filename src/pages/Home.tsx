import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, CalendarDays, RefreshCw, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
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

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function HealthBadge({ stats }: { stats: any }) {
  const ratio = stats?.totalIncome > 0 ? Math.round((stats.totalExpense / stats.totalIncome) * 100) : null;
  if (ratio === null) return <Badge variant="secondary">أضف الدخل لقراءة أدق</Badge>;
  if (ratio <= 60) return <Badge className="bg-emerald-600">صحي</Badge>;
  if (ratio <= 90) return <Badge className="bg-amber-600">تحت المتابعة</Badge>;
  return <Badge variant="destructive">ضغط مالي</Badge>;
}

export default function Home() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");
  const [month, setMonth] = useState(searchParams.get("month") || currentMonthValue());

  useEffect(() => {
    const tab = searchParams.get("tab");
    const monthParam = searchParams.get("month");
    if (tab) setActiveTab(tab);
    if (monthParam) setMonth(monthParam);
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value, month });
  };

  const handleMonthChange = (value: string) => {
    setMonth(value);
    setSearchParams({ tab: activeTab, month: value });
  };

  const { data: stats, isFetching: statsFetching } = trpc.expense.getMonthlyStats.useQuery({ month });
  const { data: profile } = trpc.profile.getSmartProfile.useQuery();
  const refreshInferences = trpc.profile.refreshInferences.useMutation({
    onSuccess: () => {
      utils.profile.getSmartProfile.invalidate();
      utils.expense.getMonthlyStats.invalidate({ month });
    },
  });

  const netFlow = stats?.netFlow || 0;
  const previousExpense = stats?.comparativeAnalysis?.previousMonth?.totalExpense || 0;
  const topCategory = stats?.topCategories?.[0];
  const stability = profile?.aiInferredAttributes?.financialStability;

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-slate-950/40">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold">أهلًا، {user?.name || "صديقي"}</h1>
              <HealthBadge stats={stats} />
            </div>
            <p className="text-muted-foreground text-sm">
              لوحة شهرية تربط التسجيل، التصنيف، البروفايل الذكي، والتقارير في مكان واحد.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="month"
              value={month}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            />
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                utils.expense.getMonthlyStats.invalidate({ month });
                refreshInferences.mutate({ month });
              }}
              disabled={statsFetching || refreshInferences.isPending}
            >
              <RefreshCw className={statsFetching || refreshInferences.isPending ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
              تحديث
            </Button>
          </div>
        </div>

        <OnboardingCard />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">الدخل</p>
                <p className="text-2xl font-bold text-emerald-600">{money(stats?.totalIncome)} ج.م</p>
              </div>
              <WalletCards className="w-8 h-8 text-emerald-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">المصروف</p>
                <p className="text-2xl font-bold text-red-500">{money(stats?.totalExpense)} ج.م</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">الصافي</p>
                <p className={`text-2xl font-bold ${netFlow >= 0 ? "text-emerald-600" : "text-red-500"}`}>{money(netFlow)} ج.م</p>
              </div>
              {netFlow >= 0 ? <TrendingUp className="w-8 h-8 text-emerald-600" /> : <TrendingDown className="w-8 h-8 text-red-500" />}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">أعلى فئة</p>
                <p className="text-xl font-bold truncate max-w-36">{topCategory?.name || "لا يوجد"}</p>
              </div>
              <Brain className="w-8 h-8 text-violet-600" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3 space-y-6">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-5 h-12">
                <TabsTrigger value="overview">لوحة</TabsTrigger>
                <TabsTrigger value="record">تسجيل</TabsTrigger>
                <TabsTrigger value="stats">إحصائيات</TabsTrigger>
                <TabsTrigger value="ai">AI</TabsTrigger>
                <TabsTrigger value="calendar">تقويم</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 mt-4">
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
                      <CalendarDays className="w-5 h-5 text-sky-600" />
                      خط الشهر
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
              </TabsContent>

              <TabsContent value="record" className="space-y-6 mt-4">
                <ExpenseForm
                  onSuccess={() => {
                    utils.expense.getMonthlyStats.invalidate({ month });
                    utils.profile.getSmartProfile.invalidate();
                  }}
                />
                <RecentExpenses limit={7} onRefresh={() => utils.expense.getMonthlyStats.invalidate({ month })} />
              </TabsContent>

              <TabsContent value="stats" className="mt-4 space-y-6">
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
                    <CardTitle>تحليل الفئات والتوقيت</CardTitle>
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
              </TabsContent>

              <TabsContent value="ai" className="mt-4">
                <AIInsights month={month} />
              </TabsContent>

              <TabsContent value="calendar" className="mt-4">
                <MonthlyCalendar month={month} dayTrend={stats?.dayTrend || []} />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4">
            <UserIntelligencePanel month={month} />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ملخص البروفايل</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">الدخل المتوقع</span>
                  <span className="font-semibold">{money(profile?.financialInfo?.averageMonthlyIncome)} ج.م</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">الاستقرار</span>
                  <span className="font-semibold">{stability ? String(stability) : "غير محدد"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">أطفال</span>
                  <span className="font-semibold">{profile?.lifestyleInfo?.hasChildren ? "نعم" : "لا/غير محدد"}</span>
                </div>
                <Button variant="outline" className="w-full" onClick={() => setSearchParams({ tab: "ai", month })}>
                  فتح التحليل
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
