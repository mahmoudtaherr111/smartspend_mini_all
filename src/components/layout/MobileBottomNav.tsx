import { Link, useLocation, useSearchParams } from "react-router-dom";
import { BarChart3, Brain, CalendarDays, LayoutDashboard, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "record", label: "تسجيل", icon: LayoutDashboard, tab: "record" },
  { id: "stats", label: "إحصائيات", icon: BarChart3, tab: "stats" },
  { id: "ai", label: "ذكاء AI", icon: Brain, tab: "ai" },
  { id: "calendar", label: "تقويم", icon: CalendarDays, tab: "calendar" },
] as const;

interface MobileBottomNavProps {
  onOpenMenu: () => void;
}

export function MobileBottomNav({ onOpenMenu }: MobileBottomNavProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  if (location.pathname !== "/dashboard") return null;

  const activeTab = searchParams.get("tab") || "record";
  const month = searchParams.get("month") || new Date().toISOString().slice(0, 7);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md pb-safe"
      aria-label="التنقل الرئيسي"
    >
      <div className="grid grid-cols-5 gap-0.5 px-1 pt-1 max-w-lg mx-auto">
        {tabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.tab;
          return (
            <Link
              key={item.id}
              to={`/dashboard?tab=${item.tab}&month=${month}`}
              className={cn(
                "tap-target flex flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
                  : "text-muted-foreground active:bg-muted/60"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "scale-110")} />
              <span className="truncate max-w-full px-0.5">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="tap-target flex flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[10px] font-medium text-muted-foreground active:bg-muted/60"
          aria-label="فتح القائمة"
        >
          <Menu className="w-5 h-5" />
          <span>المزيد</span>
        </button>
      </div>
    </nav>
  );
}
