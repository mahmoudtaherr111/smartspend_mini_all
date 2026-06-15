import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Brain,
  CalendarDays,
  LayoutDashboard,
  Menu,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";

const tabs = [
  { id: "record", label: "تسجيل", icon: LayoutDashboard, tab: "record", href: "/dashboard?tab=record" },
  { id: "stats", label: "إحصائيات", icon: BarChart3, tab: "stats", href: "/dashboard?tab=stats" },
  { id: "ai", label: "مركز AI", icon: Sparkles, tab: "ai", href: "/ai" },
  { id: "calendar", label: "تقويم", icon: CalendarDays, tab: "calendar", href: "/dashboard?tab=calendar" },
] as const;

interface MobileBottomNavProps {
  onOpenMenu: () => void;
}

export function MobileBottomNav({ onOpenMenu }: MobileBottomNavProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { lightTap, mediumTap } = useHaptics();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Ultimate reliable keyboard avoidance: detect active input focus
  // visualViewport is buggy across different OS/Browsers.
  // focusin/focusout on input elements is standard native practice.
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const visibleRoutes = ["/dashboard", "/settings", "/support", "/pro", "/bank-sync", "/ai"];
  if (!visibleRoutes.includes(location.pathname)) return null;

  const isMoreActive = ["/settings", "/support", "/pro", "/bank-sync"].includes(location.pathname);
  const isAiPage = location.pathname === "/ai";
  const activeTab = isAiPage ? "ai" : isMoreActive ? "" : (searchParams.get("tab") || "record");
  const month =
    searchParams.get("month") || new Date().toISOString().slice(0, 7);

  return (
    <AnimatePresence>
      {!isKeyboardOpen && (
        <motion.nav
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-slate-200/50 dark:border-white/10 bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] pt-2 mobile-bottom-nav"
          aria-label="التنقل الرئيسي"
        >
          <div className="grid grid-cols-5 gap-1 p-1 max-w-md mx-auto">
            {tabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.tab;
              return (
                <Link
                  key={item.id}
                  to={item.href.includes("?") ? `${item.href}&month=${month}` : item.href}
                  onClick={() => {
                    if (!isActive) lightTap();
                  }}
                  className={cn(
                    "tap-target active-press relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition-colors duration-200 z-10",
                    isActive
                      ? "text-emerald-600 dark:text-emerald-400 font-bold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute inset-0 bg-emerald-500/10 dark:bg-emerald-400/10 rounded-xl z-[-1] border border-emerald-500/10 dark:border-emerald-400/5"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-transform duration-300",
                      isActive && "scale-110",
                    )}
                  />
                  <span className="truncate max-w-full px-0.5">
                    {item.label}
                  </span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => {
                mediumTap();
                onOpenMenu();
              }}
              className={cn(
                "tap-target active-press relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition-colors duration-200 z-10",
                isMoreActive
                  ? "text-emerald-600 dark:text-emerald-400 font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="فتح القائمة"
            >
              {isMoreActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-emerald-500/10 dark:bg-emerald-400/10 rounded-xl z-[-1] border border-emerald-500/10 dark:border-emerald-400/5"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 30,
                  }}
                />
              )}
              <Menu className="w-5 h-5" />
              <span>المزيد</span>
            </button>
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
