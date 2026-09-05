import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// Mock React's useCallback for pure unit testing without DOM renderers
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

import { useHaptics } from "./useHaptics";

describe("useHaptics Hook", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. STATIC CODE AUDIT & INVARIANTS
  // =========================================================================
  describe("1. Static Code Invariants & No DOM Overlays", () => {
    const filePath = path.resolve(process.cwd(), "src/hooks/useHaptics.ts");
    const sourceCode = fs.readFileSync(filePath, "utf-8");

    it("does not contain triggerVisualFallback or DOM overlay creation", () => {
      expect(sourceCode).not.toContain("triggerVisualFallback");
      expect(sourceCode).not.toContain("createElement");
      expect(sourceCode).not.toContain("document.body.appendChild");
      expect(sourceCode).not.toContain("9999");
      expect(sourceCode).not.toContain("offsetWidth");
    });

    it("does not contain full-screen flash styling", () => {
      expect(sourceCode).not.toContain("100vw");
      expect(sourceCode).not.toContain("100vh");
      expect(sourceCode).not.toContain("rgba(255, 0, 0");
      expect(sourceCode).not.toContain("rgba(0, 255, 0");
    });
  });

  // =========================================================================
  // 2. NATIVE CAPACITOR PLATFORM (iOS / Android Native)
  // =========================================================================
  describe("2. Native Platform via Capacitor", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    });

    it("reports isSupported = true on native platforms", () => {
      const haptics = useHaptics();
      expect(haptics.isSupported).toBe(true);
    });

    it("dispatches selection to Haptics.selectionChanged()", async () => {
      const haptics = useHaptics();
      await haptics.selection();
      expect(Haptics.selectionChanged).toHaveBeenCalledTimes(1);
    });

    it("dispatches selectionStart to Haptics.selectionStart()", async () => {
      const haptics = useHaptics();
      await haptics.selectionStart();
      expect(Haptics.selectionStart).toHaveBeenCalledTimes(1);
    });

    it("dispatches selectionChanged to Haptics.selectionChanged()", async () => {
      const haptics = useHaptics();
      await haptics.selectionChanged();
      expect(Haptics.selectionChanged).toHaveBeenCalledTimes(1);
    });

    it("dispatches selectionEnd to Haptics.selectionEnd()", async () => {
      const haptics = useHaptics();
      await haptics.selectionEnd();
      expect(Haptics.selectionEnd).toHaveBeenCalledTimes(1);
    });

    it("dispatches lightTap to Haptics.impact({ style: ImpactStyle.Light })", async () => {
      const haptics = useHaptics();
      await haptics.lightTap();
      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
    });

    it("dispatches mediumTap to Haptics.impact({ style: ImpactStyle.Medium })", async () => {
      const haptics = useHaptics();
      await haptics.mediumTap();
      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium });
    });

    it("dispatches heavyTap to Haptics.impact({ style: ImpactStyle.Heavy })", async () => {
      const haptics = useHaptics();
      await haptics.heavyTap();
      expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Heavy });
    });

    it("dispatches success to Haptics.notification({ type: NotificationType.Success })", async () => {
      const haptics = useHaptics();
      await haptics.success();
      expect(Haptics.notification).toHaveBeenCalledWith({
        type: NotificationType.Success,
      });
    });

    it("dispatches warning to Haptics.notification({ type: NotificationType.Warning })", async () => {
      const haptics = useHaptics();
      await haptics.warning();
      expect(Haptics.notification).toHaveBeenCalledWith({
        type: NotificationType.Warning,
      });
    });

    it("dispatches error to Haptics.notification({ type: NotificationType.Error })", async () => {
      const haptics = useHaptics();
      await haptics.error();
      expect(Haptics.notification).toHaveBeenCalledWith({
        type: NotificationType.Error,
      });
    });

    it("handles native Capacitor rejection gracefully without throwing", async () => {
      vi.mocked(Haptics.impact).mockRejectedValueOnce(new Error("Native haptic error"));
      vi.mocked(Haptics.notification).mockRejectedValueOnce(new Error("Native notification error"));
      vi.mocked(Haptics.selectionChanged).mockRejectedValueOnce(new Error("Native selection error"));
      vi.mocked(Haptics.selectionStart).mockRejectedValueOnce(new Error("Native start error"));
      vi.mocked(Haptics.selectionEnd).mockRejectedValueOnce(new Error("Native end error"));

      const haptics = useHaptics();

      await expect(
        (async () => {
          await haptics.selection();
          await haptics.selectionStart();
          await haptics.selectionChanged();
          await haptics.selectionEnd();
          await haptics.lightTap();
          await haptics.mediumTap();
          await haptics.heavyTap();
          await haptics.success();
          await haptics.warning();
          await haptics.error();
        })(),
      ).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // 3. SUPPORTED WEB PLATFORM (e.g. Android Chrome with navigator.vibrate)
  // =========================================================================
  describe("3. Supported Web Browser (navigator.vibrate)", () => {
    let mockVibrate: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      (globalThis as unknown as { window: unknown }).window = globalThis;
      mockVibrate = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis, "navigator", {
        value: {
          ...originalNavigator,
          vibrate: mockVibrate,
        },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      delete (globalThis as unknown as { window?: unknown }).window;
    });

    it("reports isSupported = true when navigator.vibrate is available", () => {
      const haptics = useHaptics();
      expect(haptics.isSupported).toBe(true);
    });

    it("calls navigator.vibrate(5) on selection", async () => {
      const haptics = useHaptics();
      await haptics.selection();

      expect(mockVibrate).toHaveBeenCalledWith(5);
      expect(Haptics.selectionChanged).not.toHaveBeenCalled();
    });

    it("calls navigator.vibrate(5) on selectionStart and selectionChanged", async () => {
      const haptics = useHaptics();
      await haptics.selectionStart();
      await haptics.selectionChanged();

      expect(mockVibrate).toHaveBeenCalledWith(5);
      expect(Haptics.selectionStart).not.toHaveBeenCalled();
    });

    it("does not throw on selectionEnd on web", async () => {
      const haptics = useHaptics();
      await expect(haptics.selectionEnd()).resolves.not.toThrow();
      expect(Haptics.selectionEnd).not.toHaveBeenCalled();
    });

    it("calls navigator.vibrate(10) on lightTap", async () => {
      const haptics = useHaptics();
      await haptics.lightTap();

      expect(mockVibrate).toHaveBeenCalledWith(10);
      expect(Haptics.impact).not.toHaveBeenCalled();
    });

    it("calls navigator.vibrate(30) on mediumTap", async () => {
      const haptics = useHaptics();
      await haptics.mediumTap();

      expect(mockVibrate).toHaveBeenCalledWith(30);
      expect(Haptics.impact).not.toHaveBeenCalled();
    });

    it("calls navigator.vibrate(50) on heavyTap", async () => {
      const haptics = useHaptics();
      await haptics.heavyTap();

      expect(mockVibrate).toHaveBeenCalledWith(50);
      expect(Haptics.impact).not.toHaveBeenCalled();
    });

    it("calls navigator.vibrate([30, 50, 40]) on success", async () => {
      const haptics = useHaptics();
      await haptics.success();

      expect(mockVibrate).toHaveBeenCalledWith([30, 50, 40]);
      expect(Haptics.notification).not.toHaveBeenCalled();
    });

    it("calls navigator.vibrate([40, 60, 40]) on warning", async () => {
      const haptics = useHaptics();
      await haptics.warning();

      expect(mockVibrate).toHaveBeenCalledWith([40, 60, 40]);
      expect(Haptics.notification).not.toHaveBeenCalled();
    });

    it("calls navigator.vibrate([50, 100, 50, 100, 50]) on error", async () => {
      const haptics = useHaptics();
      await haptics.error();

      expect(mockVibrate).toHaveBeenCalledWith([50, 100, 50, 100, 50]);
      expect(Haptics.notification).not.toHaveBeenCalled();
    });

    it("handles vibration exceptions gracefully without throwing", async () => {
      mockVibrate.mockImplementation(() => {
        throw new Error("Vibration permission blocked by browser");
      });

      const haptics = useHaptics();

      await expect(
        (async () => {
          await haptics.selection();
          await haptics.selectionStart();
          await haptics.selectionChanged();
          await haptics.selectionEnd();
          await haptics.lightTap();
          await haptics.mediumTap();
          await haptics.heavyTap();
          await haptics.success();
          await haptics.warning();
          await haptics.error();
        })(),
      ).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // 4. UNSUPPORTED PLATFORMS (iOS Safari / iOS Web PWA / Desktop Web)
  // =========================================================================
  describe("4. Unsupported Platforms (Silent Degradation / No Flash Overlays)", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      (globalThis as unknown as { window: unknown }).window = globalThis;
      // Remove vibrate from navigator to emulate iOS Safari
      const navWithoutVibrate = { ...originalNavigator };
      delete (navWithoutVibrate as Record<string, unknown>).vibrate;
      Object.defineProperty(globalThis, "navigator", {
        value: navWithoutVibrate,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      delete (globalThis as unknown as { window?: unknown }).window;
    });

    it("reports isSupported = false on unsupported browsers", () => {
      const haptics = useHaptics();
      expect(haptics.isSupported).toBe(false);
    });

    it("executes all tiers and session methods silently with zero side effects", async () => {
      const haptics = useHaptics();
      await expect(
        (async () => {
          await haptics.selection();
          await haptics.selectionStart();
          await haptics.selectionChanged();
          await haptics.selectionEnd();
          await haptics.lightTap();
          await haptics.mediumTap();
          await haptics.heavyTap();
          await haptics.success();
          await haptics.warning();
          await haptics.error();
        })(),
      ).resolves.not.toThrow();

      expect(Haptics.impact).not.toHaveBeenCalled();
      expect(Haptics.notification).not.toHaveBeenCalled();
      expect(Haptics.selectionChanged).not.toHaveBeenCalled();
      expect(Haptics.selectionStart).not.toHaveBeenCalled();
      expect(Haptics.selectionEnd).not.toHaveBeenCalled();
    });
  });
});
