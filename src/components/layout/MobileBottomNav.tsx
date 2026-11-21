import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BarChart3,
  CalendarDays,
  Menu,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";
import { useVirtualKeyboard } from "@/hooks/useVirtualKeyboard";
import {
  classifyIosScrubIntent,
  detectMobileNavPlatform,
  findContinuousTabPosition,
  findTabIndexWithHysteresis,
  supportsIphoneNavScrub,
  type HorizontalTabRect,
} from "./mobile-nav-platform";
import { useLanguage } from "@/i18n/context";
import type { MessageKey } from "@/i18n/ar";
import { useBiometricLock } from "@/providers/BiometricLockProvider";
import { useVoiceCallView } from "@/lib/voice/call-store";
import {
  addNativeHotActionListener,
  addNativeTabSelectedListener,
  configureNativeTabBar,
  getNativeTabBarMetrics,
  isNativeIosCapacitor,
  setNativeActiveTab,
  setNativeTabBarVisible,
  syncNativeTabBarHeightCssVar,
  type LiquidGlassHotAction,
  type LiquidGlassTabItem,
  type LiquidGlassTheme,
} from "@/lib/native-ios-bridge";

interface TabItem {
  id: string;
  labelKey: MessageKey;
  icon: typeof PlusCircle;
  sfSymbol: string;
  tab: string;
  href: string;
}

const MOBILE_NAV_TABS: TabItem[] = [
  {
    id: "record",
    labelKey: "nav.record",
    icon: PlusCircle,
    sfSymbol: "plus.circle.fill",
    tab: "record",
    href: "/dashboard?tab=record",
  },
  {
    id: "stats",
    labelKey: "nav.stats",
    icon: BarChart3,
    sfSymbol: "chart.bar.fill",
    tab: "stats",
    href: "/dashboard?tab=stats",
  },
  {
    id: "ai",
    labelKey: "nav.ai",
    icon: Sparkles,
    sfSymbol: "sparkles",
    tab: "ai",
    href: "/ai",
  },
  {
    id: "calendar",
    labelKey: "nav.calendar",
    icon: CalendarDays,
    sfSymbol: "calendar",
    tab: "calendar",
    href: "/dashboard?tab=calendar",
  },
  {
    id: "more",
    labelKey: "nav.more",
    icon: Menu,
    sfSymbol: "line.3.horizontal",
    tab: "more",
    href: "/more",
  },
];

// Mirrors BOTTOM_NAV_ROUTES in src/App.tsx
const VISIBLE_ROUTES = [
  "/dashboard",
  "/ai",
  "/settings",
  "/support",
  "/pro",
  "/wallets",
  "/plan",
  "/more",
];

const MORE_TAB_ROUTES = [
  "/more",
  "/settings",
  "/support",
  "/pro",
  "/wallets",
  "/plan",
];

const NATIVE_TABBAR_BREATHING_PX = 12;

function resolveTabHref(item: TabItem, month: string | null): string {
  return item.href.includes("?") && month
    ? `${item.href}&month=${month}`
    : item.href;
}

function focusQuickExpenseInput(): void {
  if (typeof document === "undefined") return;
  const tryFocus = (): boolean => {
    const el = document.getElementById("expense-input");
    if (!el || !(el instanceof HTMLElement)) return false;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      // jsdom or unsupported smooth scroll
    }
    el.focus();
    return true;
  };

  if (tryFocus()) return;
  window.setTimeout(() => {
    if (!tryFocus()) {
      window.setTimeout(tryFocus, 250);
    }
  }, 120);
}

export function MobileBottomNav() {
  const { t, dir, language } = useLanguage();
  const { resolvedTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { lightTap, mediumTap } = useHaptics();
  const { isKeyboardOpen } = useVirtualKeyboard();
  const biometricLock = useBiometricLock({ optional: true });
  const voiceCallView = useVoiceCallView();

  // Only a month the user picked travels between tabs; otherwise Home opens the month holding today, which with a
  // payday is not always the calendar month.
  const month = searchParams.get("month");
  const isNativeIos = isNativeIosCapacitor();
  const isIos = detectMobileNavPlatform() === "ios";
  const isIphoneScrubEnabled = supportsIphoneNavScrub();

  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 1024px)").matches
      : false,
  );

  useEffect(() => {
    if (
      !isNativeIos ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktopViewport(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [isNativeIos]);

  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [optimisticSelection, setOptimisticSelection] = useState<{
    index: number;
    locationKey: string;
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const [gesturePhase, setGesturePhase] = useState<
    "idle" | "pressed" | "scrubbing"
  >("idle");
  const activePointerRef = useRef<number | null>(null);
  const scrubIndexRef = useRef<number | null>(null);
  const gesturePhaseRef = useRef<"idle" | "pressed" | "scrubbing">("idle");
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const tabRectsRef = useRef<HorizontalTabRect[]>([]);
  const suppressNextPointerClickRef = useRef(false);
  const pointerHapticHandledRef = useRef(false);

  const isRouteVisible =
    !location.pathname.startsWith("/settings/") &&
    VISIBLE_ROUTES.some((route) => location.pathname.startsWith(route));

  const isMoreActive = MORE_TAB_ROUTES.some((route) =>
    location.pathname.startsWith(route),
  );
  const isAiPage = location.pathname.startsWith("/ai");
  const activeTab = isAiPage
    ? "ai"
    : isMoreActive
      ? "more"
      : searchParams.get("tab") || "record";

  const isBiometricOverlayActive = Boolean(
    biometricLock?.isLocked || biometricLock?.isPrivacyMaskActive,
  );
  const isVoiceCallFullscreen =
    voiceCallView.phase !== "idle" && !voiceCallView.minimized;

  const shouldShowNativeBar =
    isNativeIos &&
    isRouteVisible &&
    !isKeyboardOpen &&
    !isDesktopViewport &&
    !isBiometricOverlayActive &&
    !isVoiceCallFullscreen;

  const nativeTheme: LiquidGlassTheme =
    resolvedTheme === "dark" ? "dark" : "light";

  const nativeTabItems = useMemo<LiquidGlassTabItem[]>(
    () =>
      MOBILE_NAV_TABS.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        route: item.href,
        sfSymbol: item.sfSymbol,
      })),
    [t],
  );

  const nativeHotAction = useMemo<LiquidGlassHotAction>(
    () => ({
      id: "quick-action",
      label: t("nav.quickRecord"),
      sfSymbol: "mic.fill",
      accessibilityLabel: t("nav.quickRecordAria"),
    }),
    [t],
  );

  const monthRef = useRef(month);
  const navigateRef = useRef(navigate);
  const activeTabRef = useRef(activeTab);
  const shouldShowNativeBarRef = useRef(shouldShowNativeBar);
  const mediumTapRef = useRef(mediumTap);
  const measuredNativeHeightRef = useRef<number | null>(null);
  const hasConfiguredNativeBarRef = useRef(false);

  useEffect(() => {
    monthRef.current = month;
    navigateRef.current = navigate;
    activeTabRef.current = activeTab;
    shouldShowNativeBarRef.current = shouldShowNativeBar;
    mediumTapRef.current = mediumTap;
  }, [month, navigate, activeTab, shouldShowNativeBar, mediumTap]);

  // 1. Register native LiquidGlassTabBar event listeners and tear down cleanly on unmount
  useEffect(() => {
    if (!isNativeIos) return;

    const tabHandlePromise = addNativeTabSelectedListener((event) => {
      const matched =
        MOBILE_NAV_TABS.find((item) => item.id === event.id) ??
        MOBILE_NAV_TABS.find((item) => item.href === event.route);
      if (matched) {
        navigateRef.current(resolveTabHref(matched, monthRef.current));
      } else if (event.route) {
        navigateRef.current(event.route);
      }
    });

    const hotActionHandlePromise = addNativeHotActionListener((event) => {
      void mediumTapRef.current();
      const recordTab = MOBILE_NAV_TABS[0];
      navigateRef.current(resolveTabHref(recordTab, monthRef.current));
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(
            new CustomEvent("smartspend:quick-action", {
              detail: { id: event.id },
            }),
          );
        } catch {
          // Ignore CustomEvent dispatch failures on restricted webviews
        }
      }
      focusQuickExpenseInput();
    });

    return () => {
      void tabHandlePromise.then((handle) => handle.remove()).catch(() => {});
      void hotActionHandlePromise
        .then((handle) => handle.remove())
        .catch(() => {});
      hasConfiguredNativeBarRef.current = false;
      measuredNativeHeightRef.current = null;
      void setNativeTabBarVisible(false, false);
      syncNativeTabBarHeightCssVar(null);
    };
  }, [isNativeIos]);

  // 2. Configure native LiquidGlassTabBar on mount and whenever language / RTL / theme changes
  useEffect(() => {
    if (!isNativeIos) return;

    let cancelled = false;
    const configuredActiveId = activeTabRef.current;
    void configureNativeTabBar({
      items: nativeTabItems,
      activeId: configuredActiveId,
      hotAction: nativeHotAction,
      theme: nativeTheme,
      rtl: dir === "rtl",
      visible: shouldShowNativeBarRef.current,
    }).then(async (result) => {
      if (cancelled) return;
      hasConfiguredNativeBarRef.current = true;
      if (activeTabRef.current !== configuredActiveId) {
        void setNativeActiveTab(activeTabRef.current, false);
      }
      const metrics = result ?? (await getNativeTabBarMetrics());
      if (cancelled) return;
      if (metrics && metrics.totalHeight > 0) {
        measuredNativeHeightRef.current = metrics.totalHeight;
        syncNativeTabBarHeightCssVar(
          shouldShowNativeBarRef.current
            ? metrics.totalHeight + NATIVE_TABBAR_BREATHING_PX
            : null,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isNativeIos, nativeTabItems, nativeHotAction, nativeTheme, dir, language]);

  // 3. Sync active tab selection to native LiquidGlassTabBar on route/searchParam changes
  useEffect(() => {
    if (!isNativeIos || !hasConfiguredNativeBarRef.current) return;
    void setNativeActiveTab(activeTab, true);
  }, [isNativeIos, activeTab]);

  // 4. Sync native visibility + CSS bottom clearance variable on route, keyboard, lock, or voice call changes
  useEffect(() => {
    if (!isNativeIos) return;

    let cancelled = false;
    void setNativeTabBarVisible(shouldShowNativeBar, true);

    if (!shouldShowNativeBar) {
      syncNativeTabBarHeightCssVar(null);
    } else if (measuredNativeHeightRef.current) {
      syncNativeTabBarHeightCssVar(
        measuredNativeHeightRef.current + NATIVE_TABBAR_BREATHING_PX,
      );
    } else {
      void getNativeTabBarMetrics().then((metrics) => {
        if (cancelled || !metrics || metrics.totalHeight <= 0) return;
        measuredNativeHeightRef.current = metrics.totalHeight;
        if (shouldShowNativeBarRef.current) {
          syncNativeTabBarHeightCssVar(
            metrics.totalHeight + NATIVE_TABBAR_BREATHING_PX,
          );
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isNativeIos, shouldShowNativeBar]);

  // On Capacitor iOS, the native UIKit LiquidGlassTabBar owns the tab bar surface; do not render a duplicate DOM bar.
  if (isNativeIos) return null;
  if (!isRouteVisible) return null;

  const matchingActiveIndex = MOBILE_NAV_TABS.findIndex(
    (tabItem) => tabItem.tab === activeTab,
  );
  const activeIndex = matchingActiveIndex >= 0 ? matchingActiveIndex : 0;
  const optimisticIndex =
    optimisticSelection?.locationKey === location.key
      ? optimisticSelection.index
      : null;
  const visualActiveIndex = scrubIndex ?? optimisticIndex ?? activeIndex;
  const indicatorPosition = dragPosition ?? visualActiveIndex;
  const trailOrigin = pressedIndex ?? activeIndex;
  const trailStart = Math.min(trailOrigin, indicatorPosition);
  const trailWidth = Math.abs(indicatorPosition - trailOrigin) + 1;
  const tabHref = (item: TabItem) => resolveTabHref(item, month);

  const resetGesture = () => {
    activePointerRef.current = null;
    scrubIndexRef.current = null;
    tabRectsRef.current = [];
    gesturePhaseRef.current = "idle";
    setScrubIndex(null);
    setDragPosition(null);
    setPressedIndex(null);
    setGesturePhase("idle");
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isIphoneScrubEnabled || !event.isPrimary || event.button !== 0) {
      return;
    }
    const tab = (event.target as Element).closest<HTMLElement>(
      "[data-nav-index]",
    );
    const index = Number(tab?.dataset.navIndex);
    if (!Number.isInteger(index)) return;

    activePointerRef.current = event.pointerId;
    scrubIndexRef.current = index;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    tabRectsRef.current = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-nav-index]"),
    ).map((navTab) => {
      const rect = navTab.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    });
    suppressNextPointerClickRef.current = false;
    pointerHapticHandledRef.current = true;
    gesturePhaseRef.current = "pressed";
    setDragPosition(index);
    setPressedIndex(index);
    setGesturePhase("pressed");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Safari can already hold implicit capture for direct-touch pointers.
    }
    lightTap();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isIphoneScrubEnabled || activePointerRef.current !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - pointerStartRef.current.x;
    const deltaY = event.clientY - pointerStartRef.current.y;
    const continuousPosition = findContinuousTabPosition(
      event.clientX,
      tabRectsRef.current,
    );

    if (gesturePhaseRef.current === "pressed") {
      if (
        continuousPosition >= 0 &&
        Math.abs(deltaX) >= 2 &&
        Math.abs(deltaX) > Math.abs(deltaY)
      ) {
        setDragPosition(continuousPosition);
      }
      const intent = classifyIosScrubIntent(deltaX, deltaY);
      if (intent === "vertical") {
        suppressNextPointerClickRef.current = true;
        pointerHapticHandledRef.current = false;
        resetGesture();
        return;
      }
      if (intent === "pending") return;

      gesturePhaseRef.current = "scrubbing";
      setScrubIndex(scrubIndexRef.current);
      setGesturePhase("scrubbing");
    }

    if (gesturePhaseRef.current !== "scrubbing") return;

    event.preventDefault();
    if (continuousPosition >= 0) {
      setDragPosition(continuousPosition);
    }
    const nextIndex = findTabIndexWithHysteresis(
      event.clientX,
      tabRectsRef.current,
      scrubIndexRef.current ?? activeIndex,
    );
    if (nextIndex >= 0 && nextIndex !== scrubIndexRef.current) {
      scrubIndexRef.current = nextIndex;
      setScrubIndex(nextIndex);
      setPressedIndex(nextIndex);
      lightTap();
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isIphoneScrubEnabled || activePointerRef.current !== event.pointerId) {
      return;
    }
    const wasScrubbing = gesturePhaseRef.current === "scrubbing";
    const targetIndex = scrubIndexRef.current;
    const wasTap = gesturePhaseRef.current === "pressed";
    if ((wasTap || wasScrubbing) && targetIndex !== null) {
      event.preventDefault();
      suppressNextPointerClickRef.current = true;
      setOptimisticSelection({ index: targetIndex, locationKey: location.key });
      if (targetIndex !== activeIndex) {
        navigate(tabHref(MOBILE_NAV_TABS[targetIndex]));
      }
    }
    resetGesture();
  };

  const handlePointerCancel = () => {
    suppressNextPointerClickRef.current = false;
    pointerHapticHandledRef.current = false;
    resetGesture();
  };

  const handleNavClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!isIphoneScrubEnabled || !suppressNextPointerClickRef.current) return;

    suppressNextPointerClickRef.current = false;
    pointerHapticHandledRef.current = false;
    if (event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <AnimatePresence>
      {!isKeyboardOpen && (
        <motion.nav
          initial={false}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className={cn(
            "mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 select-none lg:hidden",
            isIphoneScrubEnabled ? "touch-pan-y" : "touch-manipulation",
            isIos && "px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
            isIos ? "mobile-bottom-nav-ios" : "mobile-bottom-nav-android",
          )}
          data-testid="mobile-bottom-nav"
          data-ios-scrub-enabled={isIphoneScrubEnabled ? "true" : "false"}
          data-gesture-state={gesturePhase}
          data-scrubbing={gesturePhase === "scrubbing" ? "true" : "false"}
          data-preview-index={visualActiveIndex}
          aria-label="التنقل الرئيسي"
          dir="rtl"
          onClickCapture={
            isIphoneScrubEnabled ? handleNavClickCapture : undefined
          }
          onPointerDown={isIphoneScrubEnabled ? handlePointerDown : undefined}
          onPointerMove={isIphoneScrubEnabled ? handlePointerMove : undefined}
          onPointerUp={isIphoneScrubEnabled ? handlePointerUp : undefined}
          onPointerCancel={
            isIphoneScrubEnabled ? handlePointerCancel : undefined
          }
        >
          <div
            className={cn(
              "relative grid grid-cols-5 px-1",
              isIos
                ? "min-h-[56px] overflow-hidden rounded-[24px] border border-white/50 bg-white/70 pb-0 shadow-[0_12px_40px_rgba(15,23,42,0.2),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/15 dark:bg-slate-900/70"
                : "min-h-[calc(80px+env(safe-area-inset-bottom))] bg-slate-50/95 pt-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] dark:bg-slate-950/95",
            )}
          >
            {isIos && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-5 top-px h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/30"
              />
            )}
            {isIos && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-1 z-0"
              >
                <div
                  data-testid="ios-nav-trail"
                  className="absolute top-[8%] h-[84%] rounded-[18px] border border-emerald-200/10 bg-gradient-to-l from-emerald-300/5 via-white/20 to-emerald-300/5 opacity-0 blur-[4px] transition-[right,width,opacity] motion-reduce:transition-none dark:via-emerald-100/10"
                  style={{
                    right: `${trailStart * 20}%`,
                    width: `${trailWidth * 20}%`,
                    opacity: gesturePhase === "scrubbing" ? 1 : 0,
                    transitionDuration:
                      gesturePhase === "scrubbing" ? "55ms" : "90ms",
                    transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                  }}
                />
                <div
                  data-testid="ios-nav-indicator"
                  data-indicator-index={visualActiveIndex}
                  data-indicator-position={indicatorPosition.toFixed(3)}
                  className="absolute right-0 top-0 h-full w-1/5 transform-gpu overflow-hidden rounded-[18px] border border-white/45 bg-white/40 shadow-[0_5px_18px_rgba(16,185,129,0.10),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl transition-transform will-change-transform motion-reduce:transition-none dark:border-white/10 dark:bg-white/10"
                  style={{
                    transform: `translate3d(-${indicatorPosition * 100}%, 0, 0)`,
                    transitionDuration:
                      gesturePhase === "scrubbing" ? "28ms" : "90ms",
                    transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                  }}
                >
                  <div className="absolute inset-x-2 top-px h-px rounded-full bg-white/75 shadow-[0_0_8px_rgba(255,255,255,0.75)] dark:bg-white/35" />
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-emerald-300/10" />
                </div>
              </div>
            )}
            {MOBILE_NAV_TABS.map((item, index) => {
              const Icon = item.icon;
              const isSelected = activeIndex === index;
              const isVisualSelected = visualActiveIndex === index;
              const isPressed =
                isIphoneScrubEnabled &&
                gesturePhase !== "idle" &&
                (gesturePhase === "scrubbing"
                  ? isVisualSelected
                  : pressedIndex === index);
              return (
                <Link
                  key={item.id}
                  data-testid={`nav-tab-${item.id}`}
                  data-nav-index={index}
                  draggable={false}
                  to={tabHref(item)}
                  onDragStart={(event) => event.preventDefault()}
                  onClick={(event) => {
                    if (
                      !isIphoneScrubEnabled ||
                      event.detail === 0 ||
                      !pointerHapticHandledRef.current
                    ) {
                      if (!isSelected) lightTap();
                    } else {
                      pointerHapticHandledRef.current = false;
                    }
                    if (isIphoneScrubEnabled) {
                      setOptimisticSelection({
                        index,
                        locationKey: location.key,
                      });
                    }
                  }}
                  className={cn(
                    "tap-target relative z-10 flex flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[10px] transition-[color,transform] duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/70 motion-reduce:transition-none",
                    isIos ? "min-h-[49px] py-1" : "min-h-[64px] py-1.5",
                    isVisualSelected
                      ? "text-emerald-600 dark:text-emerald-400 font-bold"
                      : "text-slate-500 dark:text-slate-400",
                    isPressed && "scale-[1.025] -translate-y-px",
                  )}
                  aria-current={isSelected ? "page" : undefined}
                  aria-label={t(item.labelKey)}
                >
                  {isVisualSelected && !isIos && (
                    <motion.div
                      layoutId="activeGlassIndicator"
                      className="absolute inset-x-1 inset-y-1.5 -z-10 rounded-[18px] bg-emerald-500/15 dark:bg-emerald-400/15"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "w-[22px] h-[22px] transition-transform duration-150",
                      isVisualSelected && !isIos && "scale-105",
                    )}
                  />
                  <span className="truncate max-w-full px-0.5">
                    {t(item.labelKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
