import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Store,
  User as UserIcon,
} from "lucide-react";
import { StreakCounter } from "@/components/dashboard/StreakCounter";
import { useLanguage } from "@/i18n/context";
import { formatMonthLabel } from "@/i18n/format";

export type HomeTab = "record" | "stats" | "calendar";

export const HealthBadge = memo(function HealthBadge({
  ratio,
}: {
  ratio: number | null;
}) {
  const { t } = useLanguage();
  if (ratio === null)
    return <Badge variant="secondary">{t("dashboard.health.addIncome")}</Badge>;
  if (ratio <= 60) return <Badge className="bg-emerald-600">{t("dashboard.health.stable")}</Badge>;
  if (ratio <= 90) return <Badge className="bg-amber-600">{t("dashboard.health.monitoring")}</Badge>;
  return <Badge variant="destructive">{t("dashboard.health.stress")}</Badge>;
});

export const getMonthLabelAr = (monthStr: string) => {
  const [year, month] = monthStr.split("-").map(Number);
  const monthNames = [
    "يناير",
    "فبراير",
    "مارس",
    "إبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  return `${monthNames[month - 1]} ${year}`;
};

export const getPreviousMonthString = (monthStr: string) => {
  const [year, month] = monthStr.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const getNextMonthString = (monthStr: string) => {
  const [year, month] = monthStr.split("-").map(Number);
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

interface HomeHeaderProps {
  pageTitle: string;
  businessMode: boolean;
  hasBusiness: boolean;
  businessName?: string;
  toggleBusinessMode: () => void;
  healthRatio: number | null;
  activeTab: HomeTab;
  month: string;
  onMonthChange: (month: string) => void;
  onTabChange: (tab: HomeTab) => void;
  userName?: string;
  currentStreak: number;
}

export function HomeHeader({
  pageTitle,
  businessMode,
  hasBusiness,
  businessName,
  toggleBusinessMode,
  healthRatio,
  activeTab,
  month,
  onMonthChange,
  onTabChange,
  userName,
  currentStreak,
}: HomeHeaderProps) {
  const { language, dir, t } = useLanguage();
  const subtitle =
    activeTab === "stats"
      ? t("dashboard.subtitle.stats")
      : activeTab === "calendar"
        ? t("dashboard.subtitle.calendar")
        : t("dashboard.subtitle.record");

  const PrevMonthIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextMonthIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <header className="flex flex-col gap-2 -mx-1 px-1 py-1 sm:py-2">
      <div className="space-y-1.5 sm:space-y-2">
        <div className="flex items-start justify-between gap-3 w-full">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight text-balance">
              {businessMode && hasBusiness && businessName
                ? businessName
                : pageTitle}
            </h1>
          </div>

          {hasBusiness && (
            <button
              onClick={toggleBusinessMode}
              className={`flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors sm:text-xs ${
                businessMode
                  ? "border-indigo-400 bg-indigo-500 text-white"
                  : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
              title={
                businessMode
                  ? t("dashboard.business.backPersonal")
                  : t("dashboard.business.modeProject")
              }
            >
              {businessMode ? (
                <>
                  <Store className="w-3.5 h-3.5" />
                  <span className="max-w-[88px] truncate">{businessName}</span>
                </>
              ) : (
                <>
                  <UserIcon className="w-3.5 h-3.5" /> {t("dashboard.business.personal")}
                </>
              )}
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {t("dashboard.greeting", {
            name: userName || t("dashboard.defaultUserName"),
            subtitle,
          })}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="flex min-w-0 items-center gap-2">
            <HealthBadge ratio={healthRatio} />
            <StreakCounter currentStreak={currentStreak} />
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Month Navigation Control */}
            {(activeTab === "stats" || activeTab === "calendar") && (
              <div className="flex items-center gap-0.5 bg-slate-100/55 dark:bg-slate-800/30 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/20 rounded-lg p-0.5 shadow-xs">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/40 active-press"
                  onClick={() => onMonthChange(getPreviousMonthString(month))}
                  title={t("dashboard.monthPrev")}
                >
                  <PrevMonthIcon className="w-3 h-3" />
                </Button>

                <div className="relative flex items-center min-w-[85px] justify-center px-1 py-0.5 text-[10px] sm:text-[11px] font-bold select-none text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-200/30 dark:hover:bg-slate-700/20 transition-colors duration-200">
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => onMonthChange(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  />
                  <span className="flex items-center gap-1 cursor-pointer">
                    <CalendarDays className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                    {formatMonthLabel(month, language)}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/40 active-press"
                  onClick={() => onMonthChange(getNextMonthString(month))}
                  title={t("dashboard.monthNext")}
                >
                  <NextMonthIcon className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as HomeTab)}
        className="hidden sm:block w-full"
      >
        <TabsList className="w-full grid grid-cols-3 h-auto p-1">
          <TabsTrigger value="record" className="text-xs sm:text-sm">
            {t("dashboard.tabs.record")}
          </TabsTrigger>
          <TabsTrigger value="stats" className="text-xs sm:text-sm">
            {t("dashboard.tabs.stats")}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs sm:text-sm">
            {t("dashboard.tabs.calendar")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </header>
  );
}
