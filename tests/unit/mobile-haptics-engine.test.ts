/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";
import { useHaptics } from "@/hooks/useHaptics";

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    selectionStart: vi.fn().mockResolvedValue(undefined),
    selectionChanged: vi.fn().mockResolvedValue(undefined),
    selectionEnd: vi.fn().mockResolvedValue(undefined),
    impact: vi.fn().mockResolvedValue(undefined),
    notification: vi.fn().mockResolvedValue(undefined),
  },
  ImpactStyle: {
    Light: "LIGHT",
    Medium: "MEDIUM",
    Heavy: "HEAVY",
  },
  NotificationType: {
    Success: "SUCCESS",
    Warning: "WARNING",
    Error: "ERROR",
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

describe("Tier 1: Multi-Tier Haptics Engine Feature Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Native Capacitor Dispatch", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    });

    it("1.1 selection / selectionChanged triggers Haptics.selectionChanged", async () => {
      const { result } = renderHook(() => useHaptics());
      await act(async () => {
        await result.current.selection();
        await result.current.selectionChanged();
      });

      expect(Haptics.selectionChanged).toHaveBeenCalledTimes(2);
    });

    it("1.2 selectionStart and selectionEnd trigger corresponding native APIs", async () => {
      const { result } = renderHook(() => useHaptics());
      await act(async () => {
        await result.current.selectionStart();
        await result.current.selectionEnd();
      });

      expect(Haptics.selectionStart).toHaveBeenCalledTimes(1);
      expect(Haptics.selectionEnd).toHaveBeenCalledTimes(1);
    });

    it("1.3 lightTap, mediumTap, and heavyTap trigger Haptics.impact with correct ImpactStyle", async () => {
      const { result } = renderHook(() => useHaptics());
      await act(async () => {
        await result.current.lightTap();
        await result.current.mediumTap();
        await result.current.heavyTap();
      });

      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium });
      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Heavy });
      expect(Haptics.impact).toHaveBeenCalledTimes(3);
    });

    it("1.4 success, warning, and error trigger Haptics.notification with correct NotificationType", async () => {
      const { result } = renderHook(() => useHaptics());
      await act(async () => {
        await result.current.success();
        await result.current.warning();
        await result.current.error();
      });

      expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Success });
      expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Warning });
      expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Error });
      expect(Haptics.notification).toHaveBeenCalledTimes(3);
    });

    it("1.5 Reports isSupported as true on Native Capacitor", () => {
      const { result } = renderHook(() => useHaptics());
      expect(result.current.isSupported).toBe(true);
    });
  });

  describe("2. Web Browser Fallback (navigator.vibrate)", () => {
    let vibrateSpy: any;

    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      vibrateSpy = vi.fn().mockReturnValue(true);
      Object.defineProperty(navigator, "vibrate", {
        value: vibrateSpy,
        writable: true,
        configurable: true,
      });
    });

    it("1.6 selection triggers subtle 5ms vibration on Web", async () => {
      const { result } = renderHook(() => useHaptics());
      await act(async () => {
        await result.current.selection();
      });

      expect(vibrateSpy).toHaveBeenCalledWith(5);
    });

    it("1.7 lightTap, mediumTap, and heavyTap trigger 10ms, 30ms, and 50ms vibrations", async () => {
      const { result } = renderHook(() => useHaptics());
      await act(async () => {
        await result.current.lightTap();
        await result.current.mediumTap();
        await result.current.heavyTap();
      });

      expect(vibrateSpy).toHaveBeenCalledWith(10);
      expect(vibrateSpy).toHaveBeenCalledWith(30);
      expect(vibrateSpy).toHaveBeenCalledWith(50);
    });

    it("1.8 success, warning, and error trigger distinctive vibration rhythmic patterns", async () => {
      const { result } = renderHook(() => useHaptics());
      await act(async () => {
        await result.current.success();
        await result.current.warning();
        await result.current.error();
      });

      expect(vibrateSpy).toHaveBeenCalledWith([30, 50, 40]);
      expect(vibrateSpy).toHaveBeenCalledWith([40, 60, 40]);
      expect(vibrateSpy).toHaveBeenCalledWith([50, 100, 50, 100, 50]);
    });
  });
});

describe("Tier 2: Haptics Engine Boundary & Corner Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("2.1 Degrades gracefully to silent no-op when neither Capacitor nor navigator.vibrate is available", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    // Remove vibrate from navigator
    delete (navigator as any).vibrate;

    const { result } = renderHook(() => useHaptics());
    expect(result.current.isSupported).toBe(false);

    // Calling methods should execute without throwing
    await expect(
      act(async () => {
        await result.current.selection();
        await result.current.lightTap();
        await result.current.heavyTap();
        await result.current.success();
      })
    ).resolves.not.toThrow();
  });

  it("2.2 Catches and silences native hardware rejections (e.g. permission denied or unsupported device)", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Haptics.impact).mockRejectedValue(new Error("Haptics permission denied"));
    vi.mocked(Haptics.notification).mockRejectedValue(new Error("Hardware failure"));

    const { result } = renderHook(() => useHaptics());

    await expect(
      act(async () => {
        await result.current.lightTap();
        await result.current.warning();
      })
    ).resolves.not.toThrow();
  });

  it("2.3 Survives rapid high-frequency bursts (100 simultaneous calls) without unhandled rejections", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const { result } = renderHook(() => useHaptics());

    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(result.current.selection());
    }

    await expect(Promise.all(promises)).resolves.toBeDefined();
    expect(Haptics.selectionChanged).toHaveBeenCalledTimes(100);
  });
});

describe("Tier 3: Haptics Engine Cross-Feature Wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  it("3.1 Fires tactile selection tick on drawer snap detent transition", async () => {
    const { result } = renderHook(() => useHaptics());

    // Drawer snaps between [0.5, 0.9] detents
    let activeDetent: number = 0.5;
    const onDetentChange = async (newDetent: number) => {
      if (newDetent !== activeDetent) {
        activeDetent = newDetent;
        await result.current.selection();
      }
    };

    await onDetentChange(0.9);
    expect(Haptics.selectionChanged).toHaveBeenCalledTimes(1);

    // No detent change -> no haptic
    await onDetentChange(0.9);
    expect(Haptics.selectionChanged).toHaveBeenCalledTimes(1);
  });
});

describe("Tier 4: Haptics Engine Real-World Workload Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  it("4.1 Simulates live swipe-to-delete threshold crossing workflow", async () => {
    const { result } = renderHook(() => useHaptics());

    let hasCrossedThreshold = false;
    const thresholdPx = 80;

    const onSwipeMove = async (currentDisplacementPx: number) => {
      if (currentDisplacementPx >= thresholdPx && !hasCrossedThreshold) {
        hasCrossedThreshold = true;
        // Reaching destructive threshold -> warning haptic
        await result.current.warning();
      } else if (currentDisplacementPx < thresholdPx && hasCrossedThreshold) {
        hasCrossedThreshold = false;
        // Retracting back below threshold -> selection haptic
        await result.current.selection();
      }
    };

    const onSwipeRelease = async (confirmed: boolean) => {
      if (confirmed) {
        // Successful delete -> success haptic
        await result.current.success();
      } else {
        await result.current.selectionEnd();
      }
    };

    // User drags card 50px (below threshold)
    await onSwipeMove(50);
    expect(Haptics.notification).not.toHaveBeenCalled();

    // User drags past threshold to 95px
    await onSwipeMove(95);
    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Warning });

    // User drags back to 40px
    await onSwipeMove(40);
    expect(Haptics.selectionChanged).toHaveBeenCalledTimes(1);

    // User drags past threshold again and releases
    await onSwipeMove(100);
    await onSwipeRelease(true);

    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Success });
  });
});
