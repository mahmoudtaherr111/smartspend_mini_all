/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  backButtonManager,
  registerBackButtonHandler,
  initBackButtonListener,
} from "../src/lib/back-button-manager";

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    exitApp: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Adversarial Stress Test: BackButtonManager Priority & LIFO Stack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Complex Priority Interleaving & Monotonic LIFO Resolution", () => {
    it("strictly respects priority tiers and resolves same-priority handlers in LIFO order", () => {
      const executionOrder: string[] = [];

      // Register handlers in arbitrary order with mixed priorities
      registerBackButtonHandler(() => { executionOrder.push("P10_first"); return true; }, 10);
      registerBackButtonHandler(() => { executionOrder.push("P20_first"); return true; }, 20);
      registerBackButtonHandler(() => { executionOrder.push("P10_second"); return true; }, 10);
      registerBackButtonHandler(() => { executionOrder.push("P5_only"); return true; }, 5);
      registerBackButtonHandler(() => { executionOrder.push("P20_second"); return true; }, 20);
      registerBackButtonHandler(() => { executionOrder.push("P50_highest"); return true; }, 50);
      registerBackButtonHandler(() => { executionOrder.push("P10_third"); return true; }, 10);

      expect(backButtonManager.getStackLength()).toBe(7);

      // Expected execution order:
      // 1. P50_highest (Priority 50)
      // 2. P20_second (Priority 20, registered after P20_first)
      // 3. P20_first (Priority 20, registered earlier)
      // 4. P10_third (Priority 10, registered last among P10)
      // 5. P10_second (Priority 10)
      // 6. P10_first (Priority 10, registered first)
      // 7. P5_only (Priority 5)

      const expectedSequence = [
        "P50_highest",
        "P20_second",
        "P20_first",
        "P10_third",
        "P10_second",
        "P10_first",
        "P5_only",
      ];

      for (let i = 0; i < expectedSequence.length; i++) {
        const handled = backButtonManager.executeTopHandler();
        expect(handled).toBe(true);
        expect(executionOrder[i]).toBe(expectedSequence[i]);
      }

      expect(backButtonManager.getStackLength()).toBe(0);
      expect(backButtonManager.executeTopHandler()).toBe(false);
    });

    it("handles negative and zero priority levels correctly", () => {
      const log: string[] = [];

      registerBackButtonHandler(() => { log.push("P_neg10"); return true; }, -10);
      registerBackButtonHandler(() => { log.push("P_0"); return true; }, 0);
      registerBackButtonHandler(() => { log.push("P_pos10"); return true; }, 10);

      backButtonManager.executeTopHandler();
      backButtonManager.executeTopHandler();
      backButtonManager.executeTopHandler();

      expect(log).toEqual(["P_pos10", "P_0", "P_neg10"]);
    });

    it("supports high volume registration (100 handlers) maintaining invariant order", () => {
      const count = 100;
      const orderTracker: number[] = [];

      for (let i = 0; i < count; i++) {
        const prio = i % 5; // Priorities 0..4
        const idx = i;
        registerBackButtonHandler(() => {
          orderTracker.push(idx);
          return true;
        }, prio);
      }

      expect(backButtonManager.getStackLength()).toBe(count);

      // Execute all
      while (backButtonManager.getStackLength() > 0) {
        backButtonManager.executeTopHandler();
      }

      expect(orderTracker.length).toBe(count);

      // Verify that all priority 4 handlers executed before priority 3, etc.
      // And within each priority, higher idx (later registered) executed before lower idx
      for (let i = 0; i < orderTracker.length - 1; i++) {
        const currIdx = orderTracker[i];
        const nextIdx = orderTracker[i + 1];
        const currPrio = currIdx % 5;
        const nextPrio = nextIdx % 5;

        if (currPrio === nextPrio) {
          expect(currIdx).toBeGreaterThan(nextIdx); // LIFO check
        } else {
          expect(currPrio).toBeGreaterThan(nextPrio); // Priority check
        }
      }
    });
  });

  describe("2. Empty Stack & Boundary Conditions", () => {
    it("returns false from executeTopHandler when stack is empty without side effects", () => {
      expect(backButtonManager.getStackLength()).toBe(0);
      const handled = backButtonManager.executeTopHandler();
      expect(handled).toBe(false);
      expect(backButtonManager.getStackLength()).toBe(0);
    });

    it("clear() is idempotent on empty and populated stacks", () => {
      backButtonManager.clear();
      expect(backButtonManager.getStackLength()).toBe(0);

      registerBackButtonHandler(() => true, 10);
      registerBackButtonHandler(() => true, 20);
      expect(backButtonManager.getStackLength()).toBe(2);

      backButtonManager.clear();
      expect(backButtonManager.getStackLength()).toBe(0);

      // Subsequent clear should not fail
      backButtonManager.clear();
      expect(backButtonManager.getStackLength()).toBe(0);
    });

    it("unregistering unknown ID does not throw or mutate stack", () => {
      const handler = vi.fn().mockReturnValue(true);
      registerBackButtonHandler(handler, 10);

      expect(backButtonManager.getStackLength()).toBe(1);
      backButtonManager.unregister("non_existent_id_9999");
      expect(backButtonManager.getStackLength()).toBe(1);

      const handled = backButtonManager.executeTopHandler();
      expect(handled).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Unregister & In-Flight Stack Mutation Edge Cases", () => {
    it("handles double unregister calls without errors or unintended removals", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      const unregister1 = registerBackButtonHandler(h1, 10);
      const unregister2 = registerBackButtonHandler(h2, 10);

      expect(backButtonManager.getStackLength()).toBe(2);

      // Call unregister1 twice
      unregister1();
      expect(backButtonManager.getStackLength()).toBe(1);
      unregister1();
      expect(backButtonManager.getStackLength()).toBe(1);

      unregister2();
      expect(backButtonManager.getStackLength()).toBe(0);
    });

    it("allows a handler to unregister another pending handler during execution", () => {
      let unregisterTarget: (() => void) | null = null;
      const targetHandler = vi.fn().mockReturnValue(true);

      const sourceHandler = vi.fn().mockImplementation(() => {
        // Unregister targetHandler while executing
        if (unregisterTarget) unregisterTarget();
        return true;
      });

      registerBackButtonHandler(sourceHandler, 20);
      unregisterTarget = registerBackButtonHandler(targetHandler, 10);

      expect(backButtonManager.getStackLength()).toBe(2);

      // Trigger back button
      backButtonManager.executeTopHandler();

      expect(sourceHandler).toHaveBeenCalledTimes(1);
      // Stack should now be 0 because sourceHandler ran (shifted) and unregistered targetHandler
      expect(backButtonManager.getStackLength()).toBe(0);

      // Next back press should find empty stack
      const nextHandled = backButtonManager.executeTopHandler();
      expect(nextHandled).toBe(false);
      expect(targetHandler).not.toHaveBeenCalled();
    });

    it("allows a handler to register a new handler during execution", () => {
      const nestedHandler = vi.fn().mockReturnValue(true);
      const parentHandler = vi.fn().mockImplementation(() => {
        registerBackButtonHandler(nestedHandler, 15);
        return true;
      });

      registerBackButtonHandler(parentHandler, 10);

      expect(backButtonManager.getStackLength()).toBe(1);

      // Execute parent
      backButtonManager.executeTopHandler();
      expect(parentHandler).toHaveBeenCalledTimes(1);

      // Nested handler is now in stack
      expect(backButtonManager.getStackLength()).toBe(1);

      backButtonManager.executeTopHandler();
      expect(nestedHandler).toHaveBeenCalledTimes(1);
      expect(backButtonManager.getStackLength()).toBe(0);
    });
  });

  describe("4. Cascading & Exception Resilience", () => {
    it("cascades through multiple false-returning handlers to find a consuming handler", () => {
      const h1 = vi.fn().mockReturnValue(false); // Does not consume
      const h2 = vi.fn().mockReturnValue(false); // Does not consume
      const h3 = vi.fn().mockReturnValue(true);  // Consumes
      const h4 = vi.fn().mockReturnValue(true);  // Remaining

      registerBackButtonHandler(h4, 5);
      registerBackButtonHandler(h3, 10);
      registerBackButtonHandler(h2, 20);
      registerBackButtonHandler(h1, 30);

      const handled = backButtonManager.executeTopHandler();

      expect(handled).toBe(true);
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
      expect(h3).toHaveBeenCalledTimes(1);
      expect(h4).not.toHaveBeenCalled(); // h4 is still in stack
      expect(backButtonManager.getStackLength()).toBe(1);
    });

    it("survives thrown exceptions in handlers without breaking stack state", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const errorThrower = vi.fn().mockImplementation(() => {
        throw new TypeError("Simulated UI error");
      });
      const backupHandler = vi.fn().mockReturnValue(true);

      registerBackButtonHandler(backupHandler, 5);
      registerBackButtonHandler(errorThrower, 10);

      const handled = backButtonManager.executeTopHandler();

      expect(handled).toBe(true);
      expect(errorThrower).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();
      // Stack should have 1 remaining handler
      expect(backButtonManager.getStackLength()).toBe(1);

      const nextHandled = backButtonManager.executeTopHandler();
      expect(nextHandled).toBe(true);
      expect(backupHandler).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });

  describe("5. Root Navigation & Rapid Click Stress-Testing", () => {
    it("handles rapid double back clicks (< 2000ms) on root route to exit app", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      const isRootRoute = () => true;

      // Click 1: Shows toast
      backButtonManager.handleBack(isRootRoute, false);
      expect(toast.info).toHaveBeenCalledWith("اضغط مرة أخرى للخروج", { duration: 2000 });
      expect(App.exitApp).not.toHaveBeenCalled();

      // Click 2 (within 2000ms): Calls exitApp
      backButtonManager.handleBack(isRootRoute, false);
      expect(App.exitApp).toHaveBeenCalledTimes(1);
    });

    it("resets double-click timer if gap exceeds 2000ms", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const isRootRoute = () => true;

      const dateNowSpy = vi.spyOn(Date, "now");
      dateNowSpy.mockReturnValue(10000);

      // Press 1 at t=10000
      backButtonManager.handleBack(isRootRoute, false);
      expect(toast.info).toHaveBeenCalledTimes(1);
      expect(App.exitApp).not.toHaveBeenCalled();

      // Press 2 at t=12500 (2500ms later > 2000ms window)
      dateNowSpy.mockReturnValue(12500);
      backButtonManager.handleBack(isRootRoute, false);
      expect(toast.info).toHaveBeenCalledTimes(2);
      expect(App.exitApp).not.toHaveBeenCalled();

      // Press 3 at t=13000 (500ms after Press 2 < 2000ms)
      dateNowSpy.mockReturnValue(13000);
      backButtonManager.handleBack(isRootRoute, false);
      expect(App.exitApp).toHaveBeenCalledTimes(1);

      dateNowSpy.mockRestore();
    });

    it("dismisses stack items before evaluating root exit", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const isRootRoute = () => true;

      const modalHandler = vi.fn().mockReturnValue(true);
      registerBackButtonHandler(modalHandler, 10);

      // Back press while modal open
      backButtonManager.handleBack(isRootRoute, false);

      expect(modalHandler).toHaveBeenCalledTimes(1);
      expect(toast.info).not.toHaveBeenCalled();
      expect(App.exitApp).not.toHaveBeenCalled();

      // Subsequent back press on now-empty stack hits root exit toast
      backButtonManager.handleBack(isRootRoute, false);
      expect(toast.info).toHaveBeenCalledTimes(1);
    });

    it("routes to window.history.back() on non-root routes", () => {
      const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
      const isRootRoute = () => false;

      backButtonManager.handleBack(isRootRoute, true);

      expect(historyBackSpy).toHaveBeenCalledTimes(1);
      expect(App.exitApp).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();

      historyBackSpy.mockRestore();
    });
  });

  describe("6. Default Root Route Detection", () => {
    it("correctly classifies root paths vs subroutes", () => {
      const rootPaths = ["/", "/dashboard", "/login", "/home"];
      const nonRootPaths = ["/ai", "/settings", "/pro", "/support", "/bank-sync", "/expenses", "/admin"];

      rootPaths.forEach((path) => {
        window.history.pushState({}, "", path);
        // Using default root route checker (customRootChecker = undefined)
        vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
        backButtonManager.clear();

        backButtonManager.handleBack(undefined, false);
        expect(toast.info).toHaveBeenCalled();
        vi.clearAllMocks();
      });

      nonRootPaths.forEach((path) => {
        window.history.pushState({}, "", path);
        const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
        backButtonManager.clear();

        backButtonManager.handleBack(undefined, true);
        expect(historyBackSpy).toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
        historyBackSpy.mockRestore();
        vi.clearAllMocks();
      });
    });
  });
});

describe("Adversarial Stress Test: Viewport Zoom Lock & Meta Configuration", () => {
  const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const indexCss = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

  it("locks viewport scale parameters to prevent synthetic and manual zooming", () => {
    expect(indexHtml).toMatch(/name="viewport"[^>]*content="[^"]*width=device-width/);
    expect(indexHtml).toMatch(/name="viewport"[^>]*content="[^"]*initial-scale=1\.0/);
    expect(indexHtml).toMatch(/name="viewport"[^>]*content="[^"]*maximum-scale=1\.0/);
    expect(indexHtml).toMatch(/name="viewport"[^>]*content="[^"]*minimum-scale=1\.0/);
    expect(indexHtml).toMatch(/name="viewport"[^>]*content="[^"]*user-scalable=no/);
    expect(indexHtml).toMatch(/name="viewport"[^>]*content="[^"]*viewport-fit=cover/);
    expect(indexHtml).toMatch(/name="viewport"[^>]*content="[^"]*interactive-widget=resizes-visual/);
  });

  it("intercepts mobile WebKit pinch gestures via passive:false event listeners in index.html", () => {
    expect(indexHtml).toContain("document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });");
    expect(indexHtml).toContain("document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });");
    expect(indexHtml).toContain("document.addEventListener('gestureend', function(e) { e.preventDefault(); }, { passive: false });");
  });

  it("configures touch-action: manipulation across html, inputs, buttons and links to eliminate double-tap zoom delay", () => {
    expect(indexCss).toContain("touch-action: manipulation;");
    expect(indexCss).toMatch(/input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px;/);
  });

  it("enforces overscroll-behavior-y: none to prevent browser elastic rubber-banding", () => {
    expect(indexCss).toContain("overscroll-behavior-y: none;");
  });
});
