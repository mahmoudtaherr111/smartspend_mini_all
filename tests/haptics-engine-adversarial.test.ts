import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// Pure React mock
vi.mock("react", () => ({
  useCallback: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Mock Capacitor modules
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: vi.fn().mockResolvedValue(undefined),
    notification: vi.fn().mockResolvedValue(undefined),
    selectionStart: vi.fn().mockResolvedValue(undefined),
    selectionChanged: vi.fn().mockResolvedValue(undefined),
    selectionEnd: vi.fn().mockResolvedValue(undefined),
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

import { useHaptics } from "../src/hooks/useHaptics";

describe("Adversarial Micro-Haptics Engine Stress Test", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Concurrency Hammer Stress Testing", () => {
    it("handles 500 concurrent triggers across all tiers on Native Capacitor without deadlocks", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const haptics = useHaptics();

      const promises: Promise<void>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(haptics.selection());
        promises.push(haptics.selectionStart());
        promises.push(haptics.selectionChanged());
        promises.push(haptics.selectionEnd());
        promises.push(haptics.lightTap());
        promises.push(haptics.mediumTap());
        promises.push(haptics.heavyTap());
        promises.push(haptics.success());
        promises.push(haptics.warning());
        promises.push(haptics.error());
      }

      await expect(Promise.all(promises)).resolves.toBeDefined();
      expect(Haptics.selectionChanged).toHaveBeenCalledTimes(100); // selection + selectionChanged
      expect(Haptics.selectionStart).toHaveBeenCalledTimes(50);
      expect(Haptics.selectionEnd).toHaveBeenCalledTimes(50);
      expect(Haptics.impact).toHaveBeenCalledTimes(150); // light + medium + heavy
      expect(Haptics.notification).toHaveBeenCalledTimes(150); // success + warning + error
    });

    it("handles 500 concurrent triggers across all tiers on Supported Web without race conditions", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      (globalThis as unknown as { window: unknown }).window = globalThis;
      const mockVibrate = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, vibrate: mockVibrate },
        writable: true,
        configurable: true,
      });

      const haptics = useHaptics();
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(haptics.selection());
        promises.push(haptics.selectionStart());
        promises.push(haptics.selectionChanged());
        promises.push(haptics.selectionEnd());
        promises.push(haptics.lightTap());
        promises.push(haptics.mediumTap());
        promises.push(haptics.heavyTap());
        promises.push(haptics.success());
        promises.push(haptics.warning());
        promises.push(haptics.error());
      }

      await expect(Promise.all(promises)).resolves.toBeDefined();
      // 50*3 (selection, start, changed) + 50*3 (light, med, heavy) + 50*3 (success, warn, error) = 450 vibrate calls (selectionEnd is no-op on web)
      expect(mockVibrate).toHaveBeenCalledTimes(450);

      delete (globalThis as unknown as { window?: unknown }).window;
    });
  });

  describe("2. Error & Exception Suppression Robustness", () => {
    it("suppresses exotic native errors (DOMException, rejected strings, null, undefined)", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Haptics.impact).mockRejectedValue(new DOMException("Native Bridge Broken", "AbortError"));
      vi.mocked(Haptics.notification).mockRejectedValue("String error rejection");
      vi.mocked(Haptics.selectionChanged).mockRejectedValue(null);
      vi.mocked(Haptics.selectionStart).mockRejectedValue(undefined);
      vi.mocked(Haptics.selectionEnd).mockRejectedValue({ code: 500 });

      const haptics = useHaptics();

      await expect(haptics.lightTap()).resolves.toBeUndefined();
      await expect(haptics.mediumTap()).resolves.toBeUndefined();
      await expect(haptics.heavyTap()).resolves.toBeUndefined();
      await expect(haptics.success()).resolves.toBeUndefined();
      await expect(haptics.warning()).resolves.toBeUndefined();
      await expect(haptics.error()).resolves.toBeUndefined();
      await expect(haptics.selection()).resolves.toBeUndefined();
      await expect(haptics.selectionStart()).resolves.toBeUndefined();
      await expect(haptics.selectionChanged()).resolves.toBeUndefined();
      await expect(haptics.selectionEnd()).resolves.toBeUndefined();
    });

    it("suppresses web navigator.vibrate permission/security errors and non-standard throws", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      (globalThis as unknown as { window: unknown }).window = globalThis;
      const mockVibrate = vi.fn().mockImplementation(() => {
        throw new DOMException("Vibration is disabled in cross-origin iframe", "SecurityError");
      });
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, vibrate: mockVibrate },
        writable: true,
        configurable: true,
      });

      const haptics = useHaptics();

      await expect(haptics.lightTap()).resolves.toBeUndefined();
      await expect(haptics.mediumTap()).resolves.toBeUndefined();
      await expect(haptics.heavyTap()).resolves.toBeUndefined();
      await expect(haptics.success()).resolves.toBeUndefined();
      await expect(haptics.warning()).resolves.toBeUndefined();
      await expect(haptics.error()).resolves.toBeUndefined();
      await expect(haptics.selection()).resolves.toBeUndefined();
      await expect(haptics.selectionStart()).resolves.toBeUndefined();
      await expect(haptics.selectionChanged()).resolves.toBeUndefined();
      await expect(haptics.selectionEnd()).resolves.toBeUndefined();

      delete (globalThis as unknown as { window?: unknown }).window;
    });
  });

  describe("3. SSR & Headless Environment Safety", () => {
    it("safely instantiates and executes without error when window is undefined", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      // Simulate SSR where window is undefined
      delete (globalThis as unknown as { window?: unknown }).window;

      const haptics = useHaptics();
      expect(haptics.isSupported).toBe(false);

      await expect(haptics.selection()).resolves.toBeUndefined();
      await expect(haptics.lightTap()).resolves.toBeUndefined();
      await expect(haptics.mediumTap()).resolves.toBeUndefined();
      await expect(haptics.heavyTap()).resolves.toBeUndefined();
      await expect(haptics.success()).resolves.toBeUndefined();
      await expect(haptics.warning()).resolves.toBeUndefined();
      await expect(haptics.error()).resolves.toBeUndefined();
    });
  });

  describe("4. Pattern & Timing Accuracy Verification", () => {
    it("verifies exact vibration patterns for all tiers on web", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      (globalThis as unknown as { window: unknown }).window = globalThis;
      const mockVibrate = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, vibrate: mockVibrate },
        writable: true,
        configurable: true,
      });

      const haptics = useHaptics();

      await haptics.selection();
      expect(mockVibrate).toHaveBeenLastCalledWith(5);

      await haptics.lightTap();
      expect(mockVibrate).toHaveBeenLastCalledWith(10);

      await haptics.mediumTap();
      expect(mockVibrate).toHaveBeenLastCalledWith(30);

      await haptics.heavyTap();
      expect(mockVibrate).toHaveBeenLastCalledWith(50);

      await haptics.success();
      expect(mockVibrate).toHaveBeenLastCalledWith([30, 50, 40]);

      await haptics.warning();
      expect(mockVibrate).toHaveBeenLastCalledWith([40, 60, 40]);

      await haptics.error();
      expect(mockVibrate).toHaveBeenLastCalledWith([50, 100, 50, 100, 50]);

      delete (globalThis as unknown as { window?: unknown }).window;
    });
  });
});
