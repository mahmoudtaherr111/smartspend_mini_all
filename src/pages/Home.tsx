import {
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
  memo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useSearchParams } from "react-router-dom";
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
  ChevronLeft,
  ChevronRight,
  Store,
  User as UserIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";

import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { RecentExpenses } from "@/components/expenses/RecentExpenses";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain } from "lucide-react";
import { OnboardingCard } from "@/components/OnboardingCard";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { cn, getCategoryColor } from "@/lib/utils";

const ExpenseChart = lazy(() =>
  import("@/components/dashboard/ExpenseChart").then((m) => ({
    default: m.ExpenseChart,
  })),
);
import { AIInsights } from "@/components/insights/AIInsights";
import { BehaviorInsights } from "@/components/dashboard/BehaviorInsights";
import { ReceiptCapture } from "@/components/expenses/ReceiptCapture";

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
import { PlanUsageStrip } from "@/components/layout/PlanUsageStrip";
import { StreakCounter } from "@/components/dashboard/StreakCounter";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

type HomeTab = "record" | "stats" | "calendar";

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeTab(value: string | null): HomeTab {
  if (value === "stats" || value === "calendar") return value;
  return "record";
}

const HealthBadge = memo(function HealthBadge({ ratio }: { ratio: number | null }) {
  if (ratio === null)
    return <Badge variant="secondary">أضف الدخل لقراءة أدق</Badge>;
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
      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 shadow-sm"
      : tone === "expense"
        ? "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300 shadow-sm"
        : "border-slate-200/50 bg-white/70 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 shadow-sm";

  return (
    <div
      className={`premium-card px-2 xs:px-3 py-2.5 transition-all duration-300 hover:scale-[1.02] hover:translate-y-0 ${toneClass}`}
    >
      <div className="flex items-center gap-1.5 xs:gap-2">
        <div className="shrink-0 p-1 xs:p-1.5 rounded-md bg-background/50">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] xs:text-[10px] text-muted-foreground">{label}</p>
          <p className="text-xs xs:text-sm font-bold break-words">{value}</p>
        </div>
      </div>
      {helper && (
        <p className="mt-1 text-[9px] xs:text-[10px] text-muted-foreground">{helper}</p>
      )}
    </div>
  );
});

const getPreviousMonthString = (monthStr: string) => {
  const [year, month] = monthStr.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getNextMonthString = (monthStr: string) => {
  const [year, month] = monthStr.split("-").map(Number);
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthLabelAr = (monthStr: string) => {
  const [year, month] = monthStr.split("-").map(Number);
  const monthNames = [
    "يناير", "فبراير", "مارس", "إبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];
  return `${monthNames[month - 1]} ${year}`;
};

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

  const containerRef = useRef<HTMLDivElement>(null);
  const swipeState = useRef({
    startX: 0,
    startY: 0,
    isSwiping: false,
    directionLocked: false,
  });

  // Content Swipe Tab Transition Engine with directional locking & exclusions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      while (target) {
        if (
          target.classList.contains("no-swipe") ||
          target.classList.contains("recharts-wrapper") ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
        target = target.parentElement;
      }

      swipeState.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        isSwiping: true,
        directionLocked: false,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const state = swipeState.current;
      if (!state.isSwiping) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - state.startX;
      const deltaY = currentY - state.startY;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!state.directionLocked) {
        if (absY > absX && absY > 10) {
          state.isSwiping = false;
          return;
        }
        if (absX > absY && absX > 10) {
          state.directionLocked = true;
        }
      }

      if (state.directionLocked) {
        if (e.cancelable) {
          e.preventDefault(); // Lock vertical scroll
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const state = swipeState.current;
      if (!state.isSwiping || !state.directionLocked) {
        state.isSwiping = false;
        return;
      }

      state.isSwiping = false;
      const endX = e.changedTouches[0].clientX;
      const deltaX = endX - state.startX;
      const SWIPE_THRESHOLD = 75;

      if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
        const tabOrder: HomeTab[] = ["record", "stats", "calendar"];
        const currentIndex = tabOrder.indexOf(activeTab);
        const isRtl = document.dir === 'rtl' || document.documentElement.dir === 'rtl';

        if (isRtl) {
          if (deltaX < 0) {
            // Swipe left in RTL -> previous tab
            if (currentIndex > 0) {
              updateView(tabOrder[currentIndex - 1]);
            }
          } else {
            // Swipe right in RTL -> next tab
            if (currentIndex < tabOrder.length - 1) {
              updateView(tabOrder[currentIndex + 1]);
            }
          }
        } else {
          if (deltaX < 0) {
            // Swipe left in LTR -> next tab
            if (currentIndex < tabOrder.length - 1) {
              updateView(tabOrder[currentIndex + 1]);
            }
          } else {
            // Swipe right in LTR -> previous tab
            if (currentIndex > 0) {
              updateView(tabOrder[currentIndex - 1]);
            }
          }
        }
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [activeTab, month]);

  const { subscribeToPush } = usePushNotifications();

  const [showPushPrompt, setShowPushPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    
    if (Notification.permission === "default") {
      const dismissedTime = localStorage.getItem("smartspend_push_prompt_dismissed");
      const isCoolDownOver = !dismissedTime || (Date.now() - Number(dismissedTime) > 7 * 24 * 60 * 60 * 1000);
      
      if (isCoolDownOver) {
        const timer = setTimeout(() => {
          setShowPushPrompt(true);
        }, 8000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleEnablePush = async () => {
    setShowPushPrompt(false);
    try {
      await subscribeToPush();
      toast.success("تم تفعيل التنبيهات الذكية بنجاح! 🔔");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تفعيل التنبيهات.");
    }
  };

  const handleDismissPush = () => {
    setShowPushPrompt(false);
    localStorage.setItem("smartspend_push_prompt_dismissed", String(Date.now()));
  };

  const { data: goalsData } = trpc.goals.list.useQuery(undefined, {
    staleTime: 60_000,
  });

  useEffect(() => {
    // Show premium, helpful welcome toast reminder if user has 0 goals and account is at least 24 hours old
    if (goalsData && goalsData.goals.length === 0 && user) {
      const createdTime = user.createdAt
        ? new Date(user.createdAt).getTime()
        : null;
      const isOlderThan24h = createdTime
        ? Date.now() - createdTime >= 24 * 60 * 60 * 1000
        : true;

      if (isOlderThan24h) {
        const timer = setTimeout(() => {
          toast("🎯 اكتب هدفك المالي وإحنا هنساعدك تحققه!", {
            description:
              "حدد حلمك المالي وسيب الباقي علينا، هنعملك خطة مخصصة تمشي مع دخلك ومصاريفك بمنتهى الاحترافية والسهولة.",
            duration: 4500,
            action: {
              label: "اكتب هدفك",
              onClick: () => {
                document
                  .getElementById("goals-panel-widget")
                  ?.scrollIntoView({ behavior: "smooth" });
              },
            },
          });
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [goalsData, user]);

  useEffect(() => {
    const nextTab = normalizeTab(currentParams.get("tab"));
    const nextMonth = currentParams.get("month") || currentMonthValue();

    setActiveTab((current) => (current === nextTab ? current : nextTab));
    setMonth((current) => (current === nextMonth ? current : nextMonth));
  }, [currentParams]);

  const shouldLoadStats = activeTab === "stats";

  const { data: profile } = trpc.profile.getSmartProfile.useQuery();
  const salaryDay =
    profile?.financialInfo?.hasFixedSalary && profile?.financialInfo?.salaryDay
      ? Number(profile.financialInfo.salaryDay)
      : undefined;

  // ── Business Mode Toggle ──
  const businessQuery = trpc.business.get.useQuery(undefined, { staleTime: 60_000 });
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

  const activeBusinessId = businessMode && hasBusiness ? businessQuery.data!.business!.id : undefined;

  // --- 1. Session Restoration & Default Active Financial Month ---
  useEffect(() => {
    const sessionInitialized = sessionStorage.getItem("dashboard_session_initialized");
    
    if (profile !== undefined) {
      const salaryDayVal = profile?.financialInfo?.hasFixedSalary && profile?.financialInfo?.salaryDay
        ? Number(profile.financialInfo.salaryDay)
        : null;

      const now = new Date();
      const currentDay = now.getDate();
      let activeFinancialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      if (salaryDayVal && salaryDayVal > 1 && currentDay < salaryDayVal) {
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        activeFinancialMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!sessionInitialized) {
        sessionStorage.setItem("dashboard_session_initialized", "true");
        
        const currentUrlMonth = currentParams.get("month");
        if (!currentUrlMonth) {
          const newParams = new URLSearchParams(currentParams);
          newParams.set("month", activeFinancialMonth);
          setSearchParams(newParams, { replace: true });
          setMonth(activeFinancialMonth);
        }
      } else {
        if (!currentParams.get("month")) {
          const newParams = new URLSearchParams(currentParams);
          newParams.set("month", activeFinancialMonth);
          setSearchParams(newParams, { replace: true });
          setMonth(activeFinancialMonth);
        }
      }
    }
  }, [profile, currentParams, setSearchParams]);

  // --- 2. Prefetch Adjacent Months (Performance Optimization) ---
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
      utils.expense.getMonthlyStats.prefetch({ month: prevMonth, salaryDay: null });
      utils.expense.getMonthlyStats.prefetch({ month: nextMonth, salaryDay: null });
    }
  }, [month, salaryDay, activeTab, utils]);

  const { data: summary, isFetching: summaryFetching } =
    trpc.expense.getMonthSummary.useQuery(
      { month, salaryDay } as any,
      { staleTime: 30_000 },
    );
  const {
    data: stats,
    isFetching: statsFetching,
    isError: statsError,
    error: statsQueryError,
    refetch: refetchStats,
  } = trpc.expense.getMonthlyStats.useQuery(
      { month, salaryDay, businessId: activeBusinessId ?? null } as any,
      { enabled: shouldLoadStats, staleTime: 30_000, retry: 1 },
    );
  const { data: calendarStats, isFetching: calendarFetching } =
    trpc.expense.getMonthlyStats.useQuery(
      { month, salaryDay: null, businessId: activeBusinessId ?? null } as any,
      { enabled: activeTab === "calendar", staleTime: 30_000, retry: 1 },
    );
  const refreshInferences = trpc.profile.refreshInferences.useMutation({
    onSuccess: () => {
      utils.profile.getSmartProfile.invalidate();
      utils.expense.getMonthlyStats.invalidate({ month, salaryDay });
      utils.expense.getMonthlyStats.invalidate({ month, salaryDay: null });
    },
  });

  const handleRefreshInferences = useCallback(() => {
    refreshInferences.mutate({ month });
  }, [month, refreshInferences.mutate]);

  const pageTitle = useMemo(() => {
    if (activeTab === "stats") return "الإحصائيات المالية";
    if (activeTab === "calendar") return "تقويم الشهر";
    return "تسجيل العمليات";
  }, [activeTab]);

  const updateView = (tab: HomeTab, nextMonth = month) => {
    setActiveTab(tab);
    setMonth(nextMonth);
    const newParams = new URLSearchParams(location.search);
    newParams.set("tab", tab);
    newParams.set("month", nextMonth);
    setSearchParams(newParams, { replace: true });
  };

  const handleMonthChange = (value: string) => {
    setMonth(value);
    const newParams = new URLSearchParams(location.search);
    newParams.set("tab", activeTab);
    newParams.set("month", value);
    setSearchParams(newParams, { replace: true });
  };

  const handleRefresh = () => {
    utils.expense.getMonthSummary.invalidate({ month, salaryDay });
    if (activeTab === "stats" || activeTab === "calendar") {
      utils.expense.getMonthlyStats.invalidate({ month, salaryDay });
    }
  };

  const netFlow = summary?.netFlow || 0;

  return (
    <div ref={containerRef} className="min-h-full bg-slate-50/70 dark:bg-slate-950/40">
      <OnboardingFlow />
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-5">
        <OnboardingCard />
        <header className="flex flex-col gap-3 -mx-1 px-1 py-2">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
                  {businessMode && hasBusiness ? businessQuery.data!.business!.name : pageTitle}
                </h1>
                <HealthBadge
                  ratio={
                    (summary?.totalIncome ?? 0) > 0
                      ? Math.round(
                          ((summary?.totalExpense ?? 0) /
                            (summary?.totalIncome ?? 1)) *
                            100,
                        )
                      : null
                  }
                />
                {/* Business Mode Toggle */}
                {hasBusiness && (
                  <button
                    onClick={toggleBusinessMode}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-300 shadow-sm ${
                      businessMode
                        ? "bg-indigo-500 text-white border border-indigo-400"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                    }`}
                    title={businessMode ? "ارجع للحساب الشخصي" : "لوضع المشروع"}
                  >
                    {businessMode ? (
                      <><Store className="w-3.5 h-3.5" /> {businessQuery.data!.business!.name}</>
                    ) : (
                      <><UserIcon className="w-3.5 h-3.5" /> شخصي</>
                    )}
                  </button>
                )}
              </div>

              {/* Month Navigation Control */}
              {(activeTab === "stats" || activeTab === "calendar") && (
                <div className="flex items-center gap-0.5 self-start sm:self-auto bg-slate-100/55 dark:bg-slate-800/30 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/20 rounded-lg p-0.5 shadow-sm">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/40 active-press"
                    onClick={() => handleMonthChange(getPreviousMonthString(month))}
                    title="الشهر السابق"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                  
                  <div className="relative flex items-center min-w-[105px] justify-center px-1.5 py-1 text-[11px] font-bold select-none text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-200/30 dark:hover:bg-slate-700/20 transition-colors duration-200">
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => handleMonthChange(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    />
                    <span className="flex items-center gap-1 cursor-pointer">
                      <CalendarDays className="w-3 h-3 text-sky-600 shrink-0" />
                      {getMonthLabelAr(month)}
                    </span>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/40 active-press"
                    onClick={() => handleMonthChange(getNextMonthString(month))}
                    title="الشهر التالي"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <StreakCounter
                  currentStreak={profile?.gamification?.currentStreak || 0}
                />
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              أهلاً {user?.name || "صديقي"}، ابدأ بتسجيل العملية بسرعة واترك
              التحليلات لقسم الإحصائيات.
            </p>
          </div>
          <Tabs
            value={activeTab}
            onValueChange={(v) => updateView(v as HomeTab)}
            className="hidden sm:block w-full"
          >
            <TabsList className="w-full grid grid-cols-3 h-auto p-1">
              <TabsTrigger value="record" className="text-xs sm:text-sm">
                تسجيل
              </TabsTrigger>
              <TabsTrigger value="stats" className="text-xs sm:text-sm">
                إحصائيات
              </TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs sm:text-sm">
                تقويم
              </TabsTrigger>
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

        <AnimatePresence mode="wait">
          {activeTab === "record" && (
            <motion.div
              key="record"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-5"
            >
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] gap-5 items-start">
                <ExpenseForm
                  initialText={sharedText}
                  businessMode={businessMode}
                  businessId={activeBusinessId}
                  onSuccess={() => {
                    utils.expense.getMonthSummary.invalidate({ month, salaryDay });
                    utils.expense.getMonthlyStats.invalidate({ month, salaryDay });
                    utils.expense.getMonthlyStats.invalidate({ month, salaryDay: null });
                    utils.profile.getSmartProfile.invalidate();
                    setSharedText("");
                  }}
                />
                <div className="space-y-4">
                  <RecentExpenses
                    limit={7}
                    month={month}
                    salaryDay={salaryDay}
                    onRefresh={() =>
                      utils.expense.getMonthSummary.invalidate({ month, salaryDay })
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
                    <div id="goals-panel-widget" className="no-swipe">
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
            </motion.div>
          )}

          {activeTab === "stats" && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
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
                  refreshInferences={handleRefreshInferences}
                  refreshingInferences={refreshInferences.isPending}
                />
              )}
            </motion.div>
          )}



          {activeTab === "calendar" && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="w-5 h-5 text-sky-600" />
                    تقويم الشهر
                  </CardTitle>
                </CardHeader>
                <CardContent className="no-swipe">
                  {calendarFetching && !calendarStats ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      جاري تحميل التقويم...
                    </div>
                  ) : (
                    <Suspense fallback={<div className="py-10 text-center text-sm text-muted-foreground">جاري تحميل التقويم...</div>}>
                      <MonthlyCalendar
                        month={month}
                        dayTrend={calendarStats?.dayTrend || []}
                        salaryDay={salaryDay}
                      />
                    </Suspense>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Double-Prompt Push Notification Modal */}
      {showPushPrompt && (
        <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-300" dir="rtl">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-350 ease-out">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
                <span className="text-2xl">🔔</span>
              </div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">فَعّل التنبيهات المالية الذكية</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">
                تابع مصاريفك أسبوعياً، واحصل على نصائح تحليلات الذكاء الاصطناعي لميزانيتك وتذكير يومي لتسجيل مصاريفك بصوتك.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-700 dark:text-slate-300">
                <span className="text-base">🎯</span>
                <div className="text-right">
                  <p className="font-bold">تذكير التسجيل اليومي</p>
                  <p className="text-[10px] text-slate-400">تذكيرك في نهاية اليوم لتسجيل معاملاتك بصوتك في ثوانٍ.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-700 dark:text-slate-300">
                <span className="text-base">💡</span>
                <div className="text-right">
                  <p className="font-bold">تحليلات وتنبيهات فورية</p>
                  <p className="text-[10px] text-slate-400">تنبيه فوري عند تخطي ميزانية الفئات أو حدوث نمط صرف شاذ.</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button
                onClick={handleEnablePush}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 rounded-xl py-3 font-bold text-sm shadow-md active-press"
              >
                تفعيل التنبيهات الآن
              </Button>
              <button
                onClick={handleDismissPush}
                className="w-full text-center py-2 text-xs font-semibold text-slate-400 hover:text-slate-650 dark:hover:text-slate-350 transition-colors"
              >
                ليس الآن، تذكيري لاحقاً
              </button>
            </div>
          </div>
        </div>
      )}
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
  const comparisonType = stats?.behavioralInsights?.comparisonType || "monthly";
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
          {/* Global Search Bar - Relocated for a cleaner UX */}
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
