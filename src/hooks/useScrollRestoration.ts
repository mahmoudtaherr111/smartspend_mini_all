import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";

export const scrollCache = new Map<string, number>();

export function clearScrollCache(): void {
  scrollCache.clear();
}

export function getScrollOffset(key: string): number | undefined {
  return scrollCache.get(key);
}

export function setScrollOffset(key: string, offset: number): void {
  scrollCache.set(key, offset);
}

// Isomorphic layout effect for test and SSR safety
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Caches and restores the scroll offset of a scroll container across route navigation.
 * Keys default to `${location.pathname}${location.search}`.
 */
export function useScrollRestoration(
  containerRef: RefObject<HTMLElement | null>,
  customKey?: string,
): void {
  const location = useLocation();
  const key = customKey ?? `${location.pathname}${location.search}`;
  const keyRef = useRef(key);
  keyRef.current = key;

  // Restore scroll position before paint
  useIsomorphicLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const saved = scrollCache.get(key);
    if (typeof saved === "number") {
      el.scrollTop = saved;
    } else {
      el.scrollTop = 0;
    }
  }, [key, containerRef]);

  // Track and save scroll offset
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const currentKey = key;
    const handleScroll = () => {
      if (containerRef.current) {
        scrollCache.set(currentKey, containerRef.current.scrollTop);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      // Save current scroll position on cleanup / route change
      if (containerRef.current) {
        scrollCache.set(currentKey, containerRef.current.scrollTop);
      }
      el.removeEventListener("scroll", handleScroll);
    };
  }, [key, containerRef]);
}
