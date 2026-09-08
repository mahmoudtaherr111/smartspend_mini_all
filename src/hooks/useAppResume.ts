import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * How long the app must have been in the background before returning to it is
 * treated as a new visit rather than a glance. Below this, the data on screen
 * is still the data the user left, and refetching only costs them a stall.
 */
export const RESUME_REFRESH_AFTER_MS = 90_000;

/**
 * Re-syncs the screen when the user comes back from a real absence.
 *
 * `refetchOnWindowFocus` used to do this, but it fired on every focus event —
 * dismissing a notification, answering a call, switching apps for two seconds —
 * and refetched every mounted query at once. Resuming should be free; only a
 * genuine absence is worth a round trip, and only for the queries that are
 * actually on screen.
 */
export function useAppResume(): void {
  const queryClient = useQueryClient();
  const hiddenSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        return;
      }

      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (hiddenSince === null) return;
      if (Date.now() - hiddenSince < RESUME_REFRESH_AFTER_MS) return;

      // Only what is mounted. Everything else stays cached and revalidates if
      // and when the user navigates back to it.
      void queryClient.invalidateQueries({ refetchType: "active" });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);
}
