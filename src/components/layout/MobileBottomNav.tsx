import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Menu,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";

interface TabItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  tab: string;
  href: string;
  isMenu?: boolean;
}

const navTabs: TabItem[] = [
  { id: "record", label: "تسجيل", icon: LayoutDashboard, tab: "record", href: "/dashboard?tab=record" },
  { id: "stats", label: "إحصائيات", icon: BarChart3, tab: "stats", href: "/dashboard?tab=stats" },
  { id: "ai", label: "مركز AI", icon: Sparkles, tab: "ai", href: "/ai" },
  { id: "calendar", label: "تقويم", icon: CalendarDays, tab: "calendar", href: "/dashboard?tab=calendar" },
  { id: "more", label: "المزيد", icon: Menu, tab: "more", href: "#more", isMenu: true },
];

interface MobileBottomNavProps {
  onOpenMenu: () => void;
}

export function MobileBottomNav({ onOpenMenu }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { lightTap, mediumTap } = useHaptics();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);
  const lastHapticIndexRef = useRef<number | null>(null);

  // Keyboard avoidance
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
  const activeTab = isAiPage ? "ai" : isMoreActive ? "more" : (searchParams.get("tab") || "record");
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = searchParams.get("month") || currentMonth;

  const activeIndex = navTabs.findIndex((t) => t.tab === activeTab);
  const displayIndex = draggingIndex !== null ? draggingIndex : (activeIndex >= 0 ? activeIndex : 0);

  const calculateIndexFromTouch = useCallback((clientX: number): number | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right) return null;
    
    // In RTL, index 0 (تسجيل) is at the far right of the grid
    const isRtl = document.dir === "rtl";
    const relativeX = clientX - rect.left;
    const itemWidth = rect.width / navTabs.length;
    
    let slot = Math.floor(relativeX / itemWidth);
    slot = Math.max(0, Math.min(navTabs.length - 1, slot));
    
    const tabIndex = isRtl ? (navTabs.length - 1 - slot) : slot;
    return tabIndex;
  }, []);

  const executeTabSelection = useCallback((targetIndex: number) => {
    const item = navTabs[targetIndex];
    if (!item) return;

    if (item.isMenu) {
      mediumTap();
      onOpenMenu();
    } else {
      lightTap();
      const targetHref = item.href.includes("?") ? `${item.href}&month=${month}` : item.href;
      navigate(targetHref);
    }
  }, [month, navigate, onOpenMenu, lightTap, mediumTap]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || touchStartXRef.current === null) return;
    const touch = e.touches[0];
    const diff = Math.abs(touch.clientX - touchStartXRef.current);
    
    // Only activate drag mode if finger moved past threshold
    if (diff > 10) {
      isDraggingRef.current = true;
      const idx = calculateIndexFromTouch(touch.clientX);
      if (idx !== null && idx !== lastHapticIndexRef.current) {
        setDraggingIndex(idx);
        lastHapticIndexRef.current = idx;
        lightTap();
      }
    }
  };

  const handleTouchEnd = () => {
    if (isDraggingRef.current && draggingIndex !== null) {
      executeTabSelection(draggingIndex);
    }
    isDraggingRef.current = false;
    touchStartXRef.current = null;
    setDraggingIndex(null);
    lastHapticIndexRef.current = null;
  };

  return (
    <AnimatePresence>
      {!isKeyboardOpen && (
        <motion.nav
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 32 }}
          className="lg:hidden fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-50 select-none touch-none"
          aria-label="التنقل الرئيسي"
        >
          {/* Floating Liquid Glass Capsule Island */}
          <div
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className="relative grid grid-cols-5 gap-1 p-1.5 rounded-3xl bg-slate-900/80 dark:bg-slate-950/85 backdrop-blur-2xl backdrop-saturate-200 border border-white/20 dark:border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] overflow-hidden"
          >
            {/* Specular Rim Light Top Sheen */}
            <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />

            {navTabs.map((item, index) => {
              const Icon = item.icon;
              const isSelected = activeIndex === index;
              const isHovered = displayIndex === index;

              return item.isMenu ? (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    mediumTap();
                    onOpenMenu();
                  }}
                  className={cn(
                    "tap-target active-press relative flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold transition-all duration-200 z-10",
                    isSelected
                      ? "text-emerald-400 font-bold"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                  aria-label="فتح القائمة"
                >
                  {isHovered && (
                    <motion.div
                      layoutId="activeGlassIndicator"
                      className="absolute inset-0 bg-gradient-to-b from-emerald-500/25 to-emerald-600/10 dark:from-emerald-400/20 dark:to-emerald-500/5 rounded-2xl border border-emerald-400/30 shadow-[0_0_15px_rgba(16,185,129,0.25)] z-[-1]"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                    />
                  )}
                  <Icon className={cn("w-5 h-5 transition-transform duration-200", isHovered && "scale-110")} />
                  <span className="truncate max-w-full px-0.5">{item.label}</span>
                </button>
              ) : (
                <Link
                  key={item.id}
                  to={item.href.includes("?") ? `${item.href}&month=${month}` : item.href}
                  onClick={(e) => {
                    if (isDraggingRef.current) {
                      e.preventDefault();
                      return;
                    }
                    if (!isSelected) lightTap();
                  }}
                  className={cn(
                    "tap-target active-press relative flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold transition-all duration-200 z-10",
                    isSelected
                      ? "text-emerald-400 font-bold"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  {isHovered && (
                    <motion.div
                      layoutId="activeGlassIndicator"
                      className="absolute inset-0 bg-gradient-to-b from-emerald-500/25 to-emerald-600/10 dark:from-emerald-400/20 dark:to-emerald-500/5 rounded-2xl border border-emerald-400/30 shadow-[0_0_15px_rgba(16,185,129,0.25)] z-[-1]"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                    />
                  )}
                  <Icon className={cn("w-5 h-5 transition-transform duration-200", isHovered && "scale-110")} />
                  <span className="truncate max-w-full px-0.5">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
