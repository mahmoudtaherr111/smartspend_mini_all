import * as React from "react";

/**
 * A custom React hook that evaluates a CSS media query string and returns whether it matches.
 * Fully SSR-safe and reactive to window resize and orientation changes.
 *
 * @param query The media query string to match (e.g. "(max-width: 768px)")
 * @returns boolean indicating if the media query currently matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQueryList = window.matchMedia(query);
    setMatches(mediaQueryList.matches);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern browsers support addEventListener on MediaQueryList
    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", listener);
      return () => mediaQueryList.removeEventListener("change", listener);
    } else if (typeof (mediaQueryList as any).addListener === "function") {
      // Legacy fallback
      (mediaQueryList as any).addListener(listener);
      return () => (mediaQueryList as any).removeListener(listener);
    }
  }, [query]);

  return matches;
}
