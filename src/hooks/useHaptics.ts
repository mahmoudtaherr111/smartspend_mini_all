import { useCallback } from "react";

/**
 * A hook to trigger native device haptic feedback (vibrations) on supported devices.
 */
export function useHaptics() {
  const isSupported = typeof window !== "undefined" && "vibrate" in navigator;

  // Light tap, typically for UI interactions like pressing a bottom nav tab
  const lightTap = useCallback(() => {
    if (isSupported) {
      try {
        navigator.vibrate(10);
      } catch (e) {
        // Ignore errors (e.g. user hasn't interacted with document yet)
      }
    }
  }, [isSupported]);

  // Medium tap, for actions like opening a modal or expanding an item
  const mediumTap = useCallback(() => {
    if (isSupported) {
      try {
        navigator.vibrate(30);
      } catch (e) {}
    }
  }, [isSupported]);

  // Success pattern, for saving an expense or completing a goal
  const success = useCallback(() => {
    if (isSupported) {
      try {
        navigator.vibrate([30, 50, 40]);
      } catch (e) {}
    }
  }, [isSupported]);

  // Error pattern, for validation failures or server errors
  const error = useCallback(() => {
    if (isSupported) {
      try {
        navigator.vibrate([50, 100, 50, 100, 50]);
      } catch (e) {}
    }
  }, [isSupported]);

  return { lightTap, mediumTap, success, error, isSupported };
}
