import { useCallback } from "react";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

/**
 * A hook to trigger native device haptic feedback (vibrations) on supported devices.
 * Uses @capacitor/haptics natively, navigator.vibrate for web Android, and visual fallbacks for web iOS.
 */
const isIOS = () => {
  if (typeof window === "undefined") return false;
  return (
    [
      "iPad Simulator",
      "iPhone Simulator",
      "iPod Simulator",
      "iPad",
      "iPhone",
      "iPod",
    ].includes(navigator.platform) ||
    // iPad on iOS 13 detection
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  );
};

const triggerVisualFallback = (
  type: "light" | "medium" | "success" | "error"
) => {
  if (typeof document === "undefined") return;

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "9999";

  if (type === "error") {
    overlay.style.backgroundColor = "rgba(255, 0, 0, 0.15)";
  } else if (type === "success") {
    overlay.style.backgroundColor = "rgba(0, 255, 0, 0.15)";
  } else {
    // light / medium tap
    overlay.style.backgroundColor = "rgba(128, 128, 128, 0.1)";
  }

  overlay.style.transition = "opacity 0.2s ease-out";
  document.body.appendChild(overlay);

  // force reflow to ensure the transition applies
  void overlay.offsetWidth;

  overlay.style.opacity = "0";

  setTimeout(() => {
    overlay.remove();
  }, 200);
};

export function useHaptics() {
  const isSupportedWeb =
    typeof window !== "undefined" && "vibrate" in navigator;
  const isCapacitor = Capacitor.isNativePlatform();
  const needsFallback = isIOS() && !isCapacitor && !isSupportedWeb;

  const lightTap = useCallback(async () => {
    if (isCapacitor) {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(10);
      } catch (e) {}
    } else if (needsFallback) {
      triggerVisualFallback("light");
    }
  }, [isCapacitor, isSupportedWeb, needsFallback]);

  const mediumTap = useCallback(async () => {
    if (isCapacitor) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(30);
      } catch (e) {}
    } else if (needsFallback) {
      triggerVisualFallback("medium");
    }
  }, [isCapacitor, isSupportedWeb, needsFallback]);

  const success = useCallback(async () => {
    if (isCapacitor) {
      await Haptics.notification({ type: NotificationType.Success });
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate([30, 50, 40]);
      } catch (e) {}
    } else if (needsFallback) {
      triggerVisualFallback("success");
    }
  }, [isCapacitor, isSupportedWeb, needsFallback]);

  const error = useCallback(async () => {
    if (isCapacitor) {
      await Haptics.notification({ type: NotificationType.Error });
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate([50, 100, 50, 100, 50]);
      } catch (e) {}
    } else if (needsFallback) {
      triggerVisualFallback("error");
    }
  }, [isCapacitor, isSupportedWeb, needsFallback]);

  return {
    lightTap,
    mediumTap,
    success,
    error,
    isSupported: isCapacitor || isSupportedWeb || needsFallback,
  };
}
