import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";

const SCROLL_CACHE_STORAGE_KEY = "smartspend_scroll_offsets_v1";

/**
 * The offsets live in memory for speed and are mirrored to sessionStorage when
 * the app goes to the background. Mobile browsers discard a backgrounded PWA to
 * reclaim memory; on the relaunch that follows, this is what lets the user come
 * back to the row they were reading instead of the top of the list.
 */
export const scrollCache = new Map<string, number>();

function readPersistedScrollCache(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const raw = window.sessionStorage.getItem(SCROLL_CACHE_STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as unknown;
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (
        Array.isArray(entry) &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "number" &&
        Number.isFinite(entry[1])
      ) {
        scrollCache.set(entry[0], entry[1]);
      }
    }
  } catch {
    // A corrupt or unavailable store just means starting from the top.
  }
}

export function persistScrollCache(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      SCROLL_CACHE_STORAGE_KEY,
      JSON.stringify([...scrollCache]),
    );
  } catch {
    // Quota or a private-mode store: scroll position is not worth failing over.
  }
}

export function clearScrollCache(): void {
  scrollCache.clear();
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(SCROLL_CACHE_STORAGE_KEY);
  } catch {
    // Nothing to recover from; the in-memory cache is already cleared.
  }
}

if (typeof window !== "undefined") {
  readPersistedScrollCache();
  // `visibilitychange` is the last event a discarded PWA reliably receives;
  // `pagehide` is not dispatched when the process is killed outright.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistScrollCache();
  });
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
