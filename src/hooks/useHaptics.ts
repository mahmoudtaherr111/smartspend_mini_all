import { useCallback } from "react";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";
import {
  isNativeIosCapacitor,
  triggerNativeIosHaptic,
} from "@/lib/native-ios-bridge";

export type UseHapticsReturn = {
  selection: () => Promise<void>;
  selectionStart: () => Promise<void>;
  selectionChanged: () => Promise<void>;
  selectionEnd: () => Promise<void>;
  lightTap: () => Promise<void>;
  mediumTap: () => Promise<void>;
  heavyTap: () => Promise<void>;
  success: () => Promise<void>;
  warning: () => Promise<void>;
  error: () => Promise<void>;
  isSupported: boolean;
};

export { ImpactStyle, NotificationType };

/**
 * A hook to trigger native device haptic feedback (vibrations) on supported devices.
 * Uses @capacitor/haptics natively and navigator.vibrate for supported web browsers (e.g. Android Web).
 * Silently degrades to a no-op on unsupported platforms (e.g. iOS Safari / iOS Web PWA).
 */
export function useHaptics(): UseHapticsReturn {
  const isSupportedWeb =
    typeof window !== "undefined" && "vibrate" in navigator;
  const isCapacitor = Capacitor.isNativePlatform();
  const isIosNative = isNativeIosCapacitor();

  // Subtle tick for discrete item selection, tab switches, slider increments, snap detents
  const selection = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("selection"))) return;
    if (isCapacitor) {
      try {
        await Haptics.selectionChanged();
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(5);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  const selectionStart = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("selection"))) return;
    if (isCapacitor) {
      try {
        await Haptics.selectionStart();
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(5);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  const selectionChanged = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("selection"))) return;
    if (isCapacitor) {
      try {
        await Haptics.selectionChanged();
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(5);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  const selectionEnd = useCallback(async () => {
    if (isCapacitor) {
      try {
        await Haptics.selectionEnd();
      } catch {}
    }
  }, [isCapacitor]);

  const lightTap = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("light"))) return;
    if (isCapacitor) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  const mediumTap = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("medium"))) return;
    if (isCapacitor) {
      try {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(30);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  const heavyTap = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("heavy"))) return;
    if (isCapacitor) {
      try {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(50);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  const success = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("success"))) return;
    if (isCapacitor) {
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate([30, 50, 40]);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  const warning = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("warning"))) return;
    if (isCapacitor) {
      try {
        await Haptics.notification({ type: NotificationType.Warning });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate([40, 60, 40]);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  const error = useCallback(async () => {
    if (isIosNative && (await triggerNativeIosHaptic("error"))) return;
    if (isCapacitor) {
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate([50, 100, 50, 100, 50]);
      } catch {}
    }
  }, [isCapacitor, isIosNative, isSupportedWeb]);

  return {
    selection,
    selectionStart,
    selectionChanged,
    selectionEnd,
    lightTap,
    mediumTap,
    heavyTap,
    success,
    warning,
    error,
    isSupported: isCapacitor || isSupportedWeb,
  };
}
