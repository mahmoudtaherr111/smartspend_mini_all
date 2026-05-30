import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useHaptics } from "@/hooks/useHaptics";
import { cn } from "@/lib/utils";

// Mathematically accurate iOS rubber-banding formula
function rubberband(distance: number, dimension: number, constant = 0.55) {
  return (distance * dimension * constant) / (dimension + constant * distance);
}

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
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPullingState, setIsPullingState] = useState(false);

  const state = useRef({
    startY: 0,
    isPulling: false,
    refreshing: false,
  });

  const utils = trpc.useUtils();
  const { lightTap, mediumTap } = useHaptics();

  const THRESHOLD = 80;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (state.current.refreshing) return;
      // Only activate if we are exactly at the top of the scroll container
      if (el.scrollTop <= 0) {
        state.current.startY = e.touches[0].clientY;
        state.current.isPulling = true;
        setIsPullingState(true);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!state.current.isPulling || state.current.refreshing) return;

      // If user scrolls down normally during the gesture, cancel the pull
      if (el.scrollTop > 0) {
        state.current.isPulling = false;
        setIsPullingState(false);
        setPullProgress(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const pullDistance = currentY - state.current.startY;

      if (pullDistance > 0) {
        // Apply authentic iOS rubber banding resistance
        const resistance = rubberband(pullDistance, window.innerHeight);

        setPullProgress((prev) => {
          // Trigger light tap exactly once when crossing the threshold
          if (resistance >= THRESHOLD && prev < THRESHOLD) {
            lightTap();
          }
          return resistance;
        });

        // CRITICAL: Prevent browser pull-to-refresh and normal scrolling while pulling
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    const onTouchEnd = async () => {
      if (!state.current.isPulling) return;
      state.current.isPulling = false;
      setIsPullingState(false);

      setPullProgress((current) => {
        if (current >= THRESHOLD) {
          triggerRefresh();
          return 60; // Snap to refreshing position height
        }
        return 0; // Snap back to 0 immediately
      });
    };

    const triggerRefresh = async () => {
      if (state.current.refreshing) return;
      state.current.refreshing = true;
      setIsRefreshing(true);
      mediumTap();

      try {
        await utils.invalidate();
        // Enforce a minimum display time for the loader to ensure smooth UX
        await new Promise((r) => setTimeout(r, 1200));
      } finally {
        state.current.refreshing = false;
        setIsRefreshing(false);
        setPullProgress(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    // passive: false is strictly required to prevent scroll via preventDefault
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [scrollRef, utils, lightTap, mediumTap]);

  // Determine transition styles based on whether the user is actively dragging
  const transitionStyle =
    isRefreshing || !isPullingState
      ? "height 0.35s cubic-bezier(0.32, 0.72, 0, 1), transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)"
      : "none";

  return (
    <div
      className={cn(
        "relative w-full flex flex-col",
        className,
      )}
    >
      {/* 
        Pull Indicator Area 
        Unlike standard PWA loaders, this pushes the content down,
        revealing the spinner underneath, matching native iOS behavior.
      */}
      <div
        className="w-full flex justify-center items-end overflow-hidden z-0 bg-background shrink-0"
        style={{
          height: `${Math.max(0, pullProgress)}px`,
          transition: transitionStyle,
        }}
      >
        <div
          className="mb-4 bg-white dark:bg-slate-800 rounded-full shadow-sm flex items-center justify-center border border-slate-200 dark:border-slate-700"
          style={{
            width: "40px",
            height: "40px",
            transform: `scale(${Math.min(1, pullProgress / THRESHOLD)})`,
            transition: isRefreshing ? "none" : "transform 0.1s linear",
            opacity: pullProgress > 20 || isRefreshing ? 1 : 0,
          }}
        >
          <Loader2
            className={cn(
              "w-5 h-5 text-emerald-500",
              isRefreshing && "animate-spin",
            )}
            style={{
              transform: isRefreshing
                ? "none"
                : `rotate(${pullProgress * 3}deg)`,
            }}
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="w-full relative z-10 bg-background">
        {children}
      </div>
    </div>
  );
}
