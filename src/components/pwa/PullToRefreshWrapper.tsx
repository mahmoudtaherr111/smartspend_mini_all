import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useHaptics } from "@/hooks/useHaptics";
import { cn } from "@/lib/utils";

// Mathematically accurate iOS rubber-banding formula
export function rubberband(
  distance: number,
  dimension: number,
  constant = 0.55,
) {
  return (distance * dimension * constant) / (dimension + constant * distance);
}

export function hasScrollableAncestor(
  target: EventTarget | null,
  root: HTMLElement,
  event?: TouchEvent,
): boolean {
  if (!target) return false;

  if (event && typeof event.composedPath === "function") {
    try {
      const path = event.composedPath();
      for (const item of path) {
        if (item === root) break;
        if (item instanceof HTMLElement) {
          if (item.scrollTop > 0) {
            return true;
          }
        }
      }
      return false;
    } catch {
      // fallback to manual traversal
    }
  }

  let curr: Node | null = target instanceof Node ? target : null;
  while (curr && curr !== root) {
    if (curr instanceof HTMLElement) {
      if (curr.scrollTop > 0) {
        return true;
      }
    }
    curr = curr.parentElement;
  }
  return false;
}

export const PTR_THRESHOLD = 80;
export const PTR_REFRESH_HEIGHT = 60;
export const PTR_MIN_REFRESH_DELAY_MS = 450;

interface PullToRefreshWrapperProps {
  children: React.ReactNode;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export function PullToRefreshWrapper({
  children,
  scrollRef,
  className,
}: PullToRefreshWrapperProps) {
  const [status, setStatus] = useState<"idle" | "pulling" | "refreshing">(
    "idle",
  );

  const indicatorContainerRef = useRef<HTMLDivElement | null>(null);
  const spinnerContainerRef = useRef<HTMLDivElement | null>(null);
  const spinnerIconRef = useRef<SVGSVGElement | null>(null);

  const state = useRef({
    startX: 0,
    startY: 0,
    isTracking: false,
    isPulling: false,
    isDirectionLocked: false,
    thresholdCrossed: false,
    currentProgress: 0,
    refreshing: false,
    rafId: 0,
  });

  const utils = trpc.useUtils();
  const { lightTap, mediumTap } = useHaptics();

  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  const hapticsRef = useRef({ lightTap, mediumTap });
  hapticsRef.current = { lightTap, mediumTap };

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const resetDomStyles = () => {
      if (indicatorContainerRef.current) {
        indicatorContainerRef.current.style.transition =
          "height 0.35s cubic-bezier(0.32, 0.72, 0, 1), transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)";
        indicatorContainerRef.current.style.height = "0px";
      }
      if (spinnerContainerRef.current) {
        spinnerContainerRef.current.style.transition =
          "transform 0.2s ease, opacity 0.2s ease";
        spinnerContainerRef.current.style.transform = "scale(0)";
        spinnerContainerRef.current.style.opacity = "0";
      }
      if (spinnerIconRef.current) {
        spinnerIconRef.current.style.transform = "";
      }
    };

    const cancelPull = () => {
      state.current.isTracking = false;
      state.current.isPulling = false;
      state.current.isDirectionLocked = true;
      state.current.thresholdCrossed = false;
      state.current.currentProgress = 0;

      if (state.current.rafId) {
        cancelAnimationFrame(state.current.rafId);
        state.current.rafId = 0;
      }

      resetDomStyles();
      setStatus((prev) => (prev === "pulling" ? "idle" : prev));
    };

    const scheduleDomUpdate = () => {
      if (state.current.rafId) return;

      state.current.rafId = requestAnimationFrame(() => {
        state.current.rafId = 0;
        const progress = state.current.currentProgress;

        if (indicatorContainerRef.current) {
          indicatorContainerRef.current.style.transition = "none";
          indicatorContainerRef.current.style.height = `${Math.max(0, progress)}px`;
        }

        if (spinnerContainerRef.current) {
          const scale = Math.min(1, progress / PTR_THRESHOLD);
          spinnerContainerRef.current.style.transition = "none";
          spinnerContainerRef.current.style.transform = `scale(${scale})`;
          spinnerContainerRef.current.style.opacity = progress > 20 ? "1" : "0";
        }

        if (spinnerIconRef.current) {
          spinnerIconRef.current.style.transform = `rotate(${progress * 3}deg)`;
        }
      });
    };

    const triggerRefresh = async () => {
      if (state.current.refreshing) return;
      state.current.refreshing = true;
      setStatus("refreshing");
      hapticsRef.current.mediumTap();

      try {
        const minDelay = new Promise((resolve) =>
          setTimeout(resolve, PTR_MIN_REFRESH_DELAY_MS),
        );
        await Promise.all([utilsRef.current.invalidate(), minDelay]);
      } catch (err) {
        console.error("PullToRefreshWrapper: refresh failed", err);
      } finally {
        if (isMountedRef.current) {
          state.current.refreshing = false;
          state.current.currentProgress = 0;
          state.current.thresholdCrossed = false;
          resetDomStyles();
          setStatus("idle");
        }
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (state.current.refreshing) return;

      // Ignore multi-touch events
      if (e.touches.length !== 1) {
        state.current.isTracking = false;
        return;
      }

      // Only initiate pull when scroll position is at the very top
      if (el.scrollTop > 0) {
        state.current.isTracking = false;
        return;
      }

      if (hasScrollableAncestor(e.target, el, e)) {
        state.current.isTracking = false;
        return;
      }

      const touch = e.touches[0];
      state.current.startX = touch.clientX;
      state.current.startY = touch.clientY;
      state.current.isTracking = true;
      state.current.isPulling = false;
      state.current.isDirectionLocked = false;
      state.current.thresholdCrossed = false;
      state.current.currentProgress = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!state.current.isTracking || state.current.refreshing) return;

      // Ignore multi-touch events during gesture
      if (e.touches.length !== 1) {
        cancelPull();
        return;
      }

      // If scroll position is no longer at top, cancel
      if (el.scrollTop > 0) {
        cancelPull();
        return;
      }

      if (hasScrollableAncestor(e.target, el, e)) {
        cancelPull();
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - state.current.startX;
      const dy = touch.clientY - state.current.startY;

      // Direction lock check
      if (!state.current.isDirectionLocked) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        // Ignore small jitter before determining direction
        if (absX < 5 && absY < 5) {
          return;
        }

        state.current.isDirectionLocked = true;

        // Reject horizontal swipe gestures (|dx| > |dy|)
        if (absX > absY) {
          cancelPull();
          return;
        }

        // Reject upward gestures
        if (dy <= 0) {
          cancelPull();
          return;
        }

        // Direction locked to pull-down
        state.current.isPulling = true;
        setStatus("pulling");
      }

      if (!state.current.isPulling) return;

      if (dy <= 0) {
        state.current.currentProgress = 0;
        state.current.thresholdCrossed = false;
        scheduleDomUpdate();
        return;
      }

      // Apply authentic iOS rubber-banding resistance
      const dimension =
        typeof window !== "undefined" && window.innerHeight > 0
          ? window.innerHeight
          : 800;
      const resistance = rubberband(dy, dimension);
      state.current.currentProgress = resistance;

      // Calibrated haptic feedback at threshold
      if (resistance >= PTR_THRESHOLD && !state.current.thresholdCrossed) {
        state.current.thresholdCrossed = true;
        hapticsRef.current.lightTap();
      } else if (resistance < PTR_THRESHOLD && state.current.thresholdCrossed) {
        state.current.thresholdCrossed = false;
      }

      // Direct DOM rendering via rAF (zero React re-renders on move)
      scheduleDomUpdate();

      // Prevent native pull-to-refresh / overscroll while pulling
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const onTouchEnd = async () => {
      if (
        !state.current.isTracking ||
        !state.current.isPulling ||
        state.current.refreshing
      ) {
        state.current.isTracking = false;
        state.current.isPulling = false;
        return;
      }

      state.current.isTracking = false;
      state.current.isPulling = false;

      if (state.current.rafId) {
        cancelAnimationFrame(state.current.rafId);
        state.current.rafId = 0;
      }

      const progress = state.current.currentProgress;

      if (progress >= PTR_THRESHOLD) {
        // Snap to refreshing height position
        if (indicatorContainerRef.current) {
          indicatorContainerRef.current.style.transition =
            "height 0.35s cubic-bezier(0.32, 0.72, 0, 1)";
          indicatorContainerRef.current.style.height = `${PTR_REFRESH_HEIGHT}px`;
        }
        if (spinnerContainerRef.current) {
          spinnerContainerRef.current.style.transition =
            "transform 0.2s ease, opacity 0.2s ease";
          spinnerContainerRef.current.style.transform = "scale(1)";
          spinnerContainerRef.current.style.opacity = "1";
        }
        if (spinnerIconRef.current) {
          spinnerIconRef.current.style.transform = "";
        }
        triggerRefresh();
      } else {
        state.current.thresholdCrossed = false;
        resetDomStyles();
        setStatus("idle");
      }
    };

    const onTouchCancel = () => {
      cancelPull();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
      if (state.current.rafId) {
        cancelAnimationFrame(state.current.rafId);
        state.current.rafId = 0;
      }
    };
  }, [scrollRef]);

  return (
    <div className={cn("relative w-full flex flex-col min-h-full", className)}>
      {/* 
        Pull Indicator Area 
        Direct DOM & rAF-manipulated height pushes content down,
        revealing the spinner underneath, matching native iOS behavior.
      */}
      <div
        ref={indicatorContainerRef}
        className="w-full flex justify-center items-end overflow-hidden z-0 bg-transparent shrink-0 pointer-events-none"
        style={
          status === "refreshing"
            ? {
                height: `${PTR_REFRESH_HEIGHT}px`,
                transition:
                  "height 0.35s cubic-bezier(0.32, 0.72, 0, 1), transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
              }
            : status === "idle"
              ? {
                  height: "0px",
                  transition:
                    "height 0.35s cubic-bezier(0.32, 0.72, 0, 1), transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
                }
              : {
                  transition: "none",
                }
        }
      >
        <div
          ref={spinnerContainerRef}
          className="mb-4 bg-white dark:bg-slate-800 rounded-full shadow-sm flex items-center justify-center border border-slate-200 dark:border-slate-700"
          style={
            status === "refreshing"
              ? {
                  width: "40px",
                  height: "40px",
                  transform: "scale(1)",
                  opacity: 1,
                  transition: "transform 0.2s ease, opacity 0.2s ease",
                }
              : status === "idle"
                ? {
                    width: "40px",
                    height: "40px",
                    transform: "scale(0)",
                    opacity: 0,
                    transition: "transform 0.2s ease, opacity 0.2s ease",
                  }
                : {
                    width: "40px",
                    height: "40px",
                    transition: "none",
                  }
          }
        >
          <Loader2
            ref={spinnerIconRef}
            className={cn(
              "w-5 h-5 text-emerald-500",
              status === "refreshing" && "animate-spin",
            )}
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="w-full relative z-10 bg-transparent">{children}</div>
    </div>
  );
}
