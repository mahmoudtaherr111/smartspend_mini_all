import {
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
  useCallback,
  useRef,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { RecentExpenses } from "@/components/expenses/RecentExpenses";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingCard } from "@/components/OnboardingCard";
import { cn } from "@/lib/utils";
import { NativeTabPanels } from "@/components/dashboard/NativeTabPanels";
import {
  HomeHeader,
  type HomeTab,
  getPreviousMonthString,
  getNextMonthString,
} from "@/components/dashboard/HomeHeader";
import { HomeSummaryCards } from "@/components/dashboard/HomeSummaryCards";
import { StatsView } from "@/components/dashboard/StatsView";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { toast } from "sonner";

const FinancialGoalsPanel = lazy(() =>
  import("@/components/goals/FinancialGoalsPanel").then((m) => ({
    default: m.FinancialGoalsPanel,
  })),
);

const MonthlyCalendar = lazy(() =>
  import("@/components/dashboard/MonthlyCalendar").then((m) => ({
    default: m.MonthlyCalendar,
  })),
);

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeTab(value: string | null): HomeTab {
  if (value === "stats" || value === "calendar") return value;
  return "record";
}

const TAB_ORDER: HomeTab[] = ["record", "stats", "calendar"];

export default function Home() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );

  const [activeTab, setActiveTab] = useState<HomeTab>(
    normalizeTab(currentParams.get("tab")),
  );
  const [month, setMonth] = useState(
    currentParams.get("month") || currentMonthValue(),
  );
  const [sharedText, setSharedText] = useState<string>("");

  // Handle Web Share Target API query parameters
  useEffect(() => {
    const textParam = currentParams.get("share_text");
    const titleParam = currentParams.get("share_title");
    const urlParam = currentParams.get("share_url");
    const foundText = textParam || titleParam || urlParam;

    if (foundText) {
      setSharedText(foundText);
      const newParams = new URLSearchParams(currentParams);
      newParams.delete("share_text");
      newParams.delete("share_title");
      newParams.delete("share_url");
      setSearchParams(newParams, { replace: true });
      toast.success("تم تلقي النص المشارك بنجاح. المساعد جاهز للتحليل!");
    }
  }, [currentParams, setSearchParams]);

  const updateView = useCallback(
    (tab: HomeTab, nextMonth = month) => {
      setActiveTab(tab);
      setMonth(nextMonth);
      const newParams = new URLSearchParams(location.search);
      newParams.set("tab", tab);
      newParams.set("month", nextMonth);
      setSearchParams(newParams, { replace: true });
    },
    [location.search, month, setSearchParams],
  );

  const { data: profile } = trpc.profile.getSmartProfile.useQuery();
  const salaryDay =
    profile?.financialInfo?.hasFixedSalary && profile?.financialInfo?.salaryDay
      ? Number(profile.financialInfo.salaryDay)
      : undefined;

  // Business Mode State
  const businessQuery = trpc.business.get.useQuery(undefined, {
    staleTime: 60_000,
  });
  const hasBusiness = !!businessQuery.data?.business;
  const [businessMode, setBusinessMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("smartspend_business_mode");
    if (stored === "true" && hasBusiness) {
      setBusinessMode(true);
    }
  }, [hasBusiness]);

  const toggleBusinessMode = useCallback(() => {
    setBusinessMode((prev) => {
      const next = !prev;
      localStorage.setItem("smartspend_business_mode", String(next));
      return next;
    });
  }, []);

  const activeBusinessId =
    businessMode && hasBusiness ? businessQuery.data!.business!.id : undefined;

  // Sync tab & month from URL
  useEffect(() => {
    const nextTab = normalizeTab(currentParams.get("tab"));
    const nextMonth = currentParams.get("month") || currentMonthValue();
    setActiveTab((current) => (current === nextTab ? current : nextTab));
    setMonth((current) => (current === nextMonth ? current : nextMonth));
  }, [currentParams]);

  // Prefetch Adjacent Months
  useEffect(() => {
    if (!month) return;
    const prevMonth = getPreviousMonthString(month);
    const nextMonth = getNextMonthString(month);

    utils.expense.getMonthSummary.prefetch({ month: prevMonth, salaryDay });
    utils.expense.getMonthSummary.prefetch({ month: nextMonth, salaryDay });

    if (activeTab === "stats") {
      utils.expense.getMonthlyStats.prefetch({ month: prevMonth, salaryDay });
      utils.expense.getMonthlyStats.prefetch({ month: nextMonth, salaryDay });
    } else if (activeTab === "calendar") {
      utils.expense.getMonthlyStats.prefetch({
        month: prevMonth,
        salaryDay: null,
      });
      utils.expense.getMonthlyStats.prefetch({
        month: nextMonth,
        salaryDay: null,
      });
    }
  }, [month, salaryDay, activeTab, utils]);

  const isPastMonth = month < currentMonthValue();
  const statsStaleTime = isPastMonth ? 60 * 60 * 1000 : 60_000;

  const { data: summary } = trpc.expense.getMonthSummary.useQuery(
    { month, salaryDay } as any,
    { staleTime: statsStaleTime },
  );

  const shouldLoadStats = activeTab === "stats";
  const {
    data: stats,
    isFetching: statsFetching,
    isError: statsError,
    error: statsQueryError,
    refetch: refetchStats,
  } = trpc.expense.getMonthlyStats.useQuery(
    { month, salaryDay, businessId: activeBusinessId ?? null } as any,
    { enabled: shouldLoadStats, staleTime: statsStaleTime, retry: 1 },
  );

  const { data: calendarStats, isFetching: calendarFetching } =
    trpc.expense.getMonthlyStats.useQuery(
      { month, salaryDay: null, businessId: activeBusinessId ?? null } as any,
      { enabled: activeTab === "calendar", staleTime: statsStaleTime, retry: 1 },
    );

  const pageTitle = useMemo(() => {
    if (activeTab === "stats") return "الإحصائيات المالية";
    if (activeTab === "calendar") return "تقويم الشهر";
    return "تسجيل العمليات";
  }, [activeTab]);

  const handleMonthChange = (value: string) => {
    setMonth(value);
    const newParams = new URLSearchParams(location.search);
    newParams.set("tab", activeTab);
    newParams.set("month", value);
    setSearchParams(newParams, { replace: true });
  };

  const healthRatio =
    (summary?.totalIncome ?? 0) > 0
      ? Math.round(
          ((summary?.totalExpense ?? 0) / (summary?.totalIncome ?? 1)) * 100,
        )
      : null;

  return (
    <div className="min-h-full bg-slate-50/70 dark:bg-slate-950/40">
      <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-3 sm:space-y-4">
        <OnboardingCard />
        <HomeHeader
          pageTitle={pageTitle}
          businessMode={businessMode}
          hasBusiness={hasBusiness}
          businessName={businessQuery.data?.business?.name}
          toggleBusinessMode={toggleBusinessMode}
          healthRatio={healthRatio}
          activeTab={activeTab}
          month={month}
          onMonthChange={handleMonthChange}
          onTabChange={updateView}
          userName={user?.name?.split(" ")[0]}
          currentStreak={profile?.gamification?.currentStreak || 0}
        />

        <HomeSummaryCards
          totalIncome={summary?.totalIncome}
          totalExpense={summary?.totalExpense}
        />

        <NativeTabPanels activeTab={activeTab} tabOrder={TAB_ORDER}>
          {{
            record: (
              <div className="space-y-5">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] gap-5 items-start">
                  <ExpenseForm
                    initialText={sharedText}
                    draftKey={
                      user
                        ? `smartspend_expense_draft_${user.type}_${user.id}_${activeBusinessId ?? "personal"}`
                        : undefined
                    }
                    businessMode={businessMode}
                    businessId={activeBusinessId}
                    onSuccess={() => {
                      utils.expense.getMonthSummary.invalidate({
                        month,
                        salaryDay,
                      });
                      utils.expense.getMonthlyStats.invalidate({
                        month,
                        salaryDay,
                      });
                      utils.expense.getMonthlyStats.invalidate({
                        month,
                        salaryDay: null,
                      });
                      utils.profile.getSmartProfile.invalidate();
                      setSharedText("");
                      window.dispatchEvent(
                        new Event("smartspend-value-achieved"),
                      );
                    }}
                  />
                  <div className="space-y-4">
                    <RecentExpenses
                      limit={7}
                      month={month}
                      salaryDay={salaryDay}
                      onRefresh={() =>
                        utils.expense.getMonthSummary.invalidate({
                          month,
                          salaryDay,
                        })
                      }
                    />
                    <Suspense
                      fallback={
                        <Card>
                          <CardContent className="py-8">
                            <Skeleton className="h-24 w-full" />
                          </CardContent>
                        </Card>
                      }
                    >
                      <div
                        id="goals-panel-widget"
                        className="no-swipe"
                        data-no-swipe
                      >
                        <FinancialGoalsPanel />
                      </div>
                    </Suspense>
                  </div>
                </div>

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
              </div>
            ),
            stats: (
              <div>
                {statsError ? (
                  <Card className="border-destructive/30">
                    <CardContent className="py-8 text-center space-y-3">
                      <p className="text-sm font-medium text-destructive">
                        تعذّر تحميل الإحصائيات
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {statsQueryError?.message ||
                          "تحقق من الاتصال بقاعدة البيانات ثم أعد المحاولة."}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="active-press"
                        onClick={() => refetchStats()}
                      >
                        إعادة المحاولة
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <StatsView
                    month={month}
                    stats={stats}
                    loading={statsFetching}
                  />
                )}
              </div>
            ),
            calendar: (
              <div>
                <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
                  <CardContent className="p-3 sm:p-4 no-swipe" data-no-swipe>
                    {calendarFetching && !calendarStats ? (
                      <div className="py-12 text-center text-sm text-muted-foreground">
                        جاري تحميل التقويم...
                      </div>
                    ) : (
                      <Suspense
                        fallback={
                          <div className="py-12 text-center text-sm text-muted-foreground">
                            جاري تحميل التقويم...
                          </div>
                        }
                      >
                        <MonthlyCalendar
                          month={month}
                          dayTrend={calendarStats?.dayTrend || []}
                          salaryDay={salaryDay}
                        />
                      </Suspense>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          }}
        </NativeTabPanels>
      </div>

      <PushNotificationPrompt />
    </div>
  );
}
