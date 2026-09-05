import { useEffect, useRef, type RefObject } from "react";

export interface UseSwipeNavigationOptions {
  containerRef: RefObject<HTMLElement | null>;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeNext?: () => void;
  onSwipePrev?: () => void;
  threshold?: number;
  disabled?: boolean;
}

export function useSwipeNavigation({
  containerRef,
  onSwipeLeft,
  onSwipeRight,
  onSwipeNext,
  onSwipePrev,
  threshold = 75,
  disabled = false,
}: UseSwipeNavigationOptions) {
  const swipeState = useRef({
    startX: 0,
    startY: 0,
    isSwiping: false,
    directionLocked: false,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      while (target && target !== el) {
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
          e.preventDefault(); // Lock vertical scroll during horizontal swipe
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

      if (Math.abs(deltaX) >= threshold) {
        const isRtl =
          document.dir === "rtl" || document.documentElement.dir === "rtl";

        if (deltaX < 0) {
          // Swipe Left gesture
          onSwipeLeft?.();
          if (isRtl) {
            onSwipePrev?.();
          } else {
            onSwipeNext?.();
          }
        } else {
          // Swipe Right gesture
          onSwipeRight?.();
          if (isRtl) {
            onSwipeNext?.();
          } else {
            onSwipePrev?.();
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
  }, [
    containerRef,
    onSwipeLeft,
    onSwipeRight,
    onSwipeNext,
    onSwipePrev,
    threshold,
    disabled,
  ]);
}
