/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import {
  backButtonManager,
  registerBackButtonHandler,
  initBackButtonListener,
} from "./back-button-manager";

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

describe("BackButtonManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Registration & Stack Lifecycle", () => {
    it("registers a handler and increases stack length", () => {
      expect(backButtonManager.getStackLength()).toBe(0);

      const handler = vi.fn().mockReturnValue(true);
      const unregister = registerBackButtonHandler(handler);

      expect(backButtonManager.getStackLength()).toBe(1);

      unregister();
      expect(backButtonManager.getStackLength()).toBe(0);
    });

    it("unregisters correctly even if multiple handlers are present", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const h3 = vi.fn();

      const unregister1 = registerBackButtonHandler(h1, 5);
      const unregister2 = registerBackButtonHandler(h2, 10);
      const unregister3 = registerBackButtonHandler(h3, 15);

      expect(backButtonManager.getStackLength()).toBe(3);

      unregister2();
      expect(backButtonManager.getStackLength()).toBe(2);

      unregister1();
      unregister3();
      expect(backButtonManager.getStackLength()).toBe(0);
    });
  });

  describe("2. LIFO and Priority Ordering", () => {
    it("executes highest priority handler first", () => {
      const lowPriorityHandler = vi.fn().mockReturnValue(true);
      const highPriorityHandler = vi.fn().mockReturnValue(true);

      registerBackButtonHandler(lowPriorityHandler, 5);
      registerBackButtonHandler(highPriorityHandler, 20);

      const handled = backButtonManager.executeTopHandler();

      expect(handled).toBe(true);
      expect(highPriorityHandler).toHaveBeenCalledTimes(1);
      expect(lowPriorityHandler).not.toHaveBeenCalled();
      expect(backButtonManager.getStackLength()).toBe(1);
    });

    it("executes in LIFO order when priorities are identical", () => {
      const firstRegistered = vi.fn().mockReturnValue(true);
      const secondRegistered = vi.fn().mockReturnValue(true);

      registerBackButtonHandler(firstRegistered, 10);
      registerBackButtonHandler(secondRegistered, 10);

      const handled = backButtonManager.executeTopHandler();

      expect(handled).toBe(true);
      expect(secondRegistered).toHaveBeenCalledTimes(1);
      expect(firstRegistered).not.toHaveBeenCalled();
    });

    it("cascades to next handler if top handler returns false", () => {
      const bottomHandler = vi.fn().mockReturnValue(true);
      const topHandler = vi.fn().mockReturnValue(false); // Does not consume event

      registerBackButtonHandler(bottomHandler, 5);
      registerBackButtonHandler(topHandler, 10);

      const handled = backButtonManager.executeTopHandler();

      expect(handled).toBe(true);
      expect(topHandler).toHaveBeenCalledTimes(1);
      expect(bottomHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Error Resilience", () => {
    it("catches thrown handler errors gracefully without crashing", () => {
      const errorThrowingHandler = vi.fn().mockImplementation(() => {
        throw new Error("Modal dismiss exception");
      });

      registerBackButtonHandler(errorThrowingHandler, 10);

      const result = backButtonManager.executeTopHandler();
      expect(result).toBe(true);
      expect(errorThrowingHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Root Route and Back Navigation", () => {
    it("shows toast on first back button press on root route", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      backButtonManager.handleBack(() => true, false);

      expect(toast.info).toHaveBeenCalledWith("اضغط مرة أخرى للخروج", {
        duration: 2000,
      });
      expect(App.exitApp).not.toHaveBeenCalled();
    });

    it("exits app when pressed twice within 2000ms on root route", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      // First press
      backButtonManager.handleBack(() => true, false);
      expect(toast.info).toHaveBeenCalledTimes(1);

      // Second press immediately
      backButtonManager.handleBack(() => true, false);
      expect(App.exitApp).toHaveBeenCalledTimes(1);
    });

    it("calls window.history.back() when not on root route", () => {
      const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

      backButtonManager.handleBack(() => false, true);

      expect(historyBackSpy).toHaveBeenCalled();
      expect(App.exitApp).not.toHaveBeenCalled();
      historyBackSpy.mockRestore();
    });
  });

  describe("5. Listener Initialization", () => {
    it("registers Capacitor App backButton listener when on native platform", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      initBackButtonListener();

      expect(App.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    });
  });
});
