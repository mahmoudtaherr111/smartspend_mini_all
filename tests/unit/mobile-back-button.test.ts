/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import {
  backButtonManager,
  registerBackButtonHandler,
  initBackButtonListener,
} from "@/lib/back-button-manager";
import { useSheetManager } from "@/hooks/useSheetManager";

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

describe("Tier 1: BackButtonManager Priority & LIFO Stack Feature Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1.1 Registers handlers with unique IDs and returns unregister callback", () => {
    const handler1 = vi.fn().mockReturnValue(true);
    const unregister1 = registerBackButtonHandler(handler1, 10);

    expect(backButtonManager.getStackLength()).toBe(1);

    unregister1();
    expect(backButtonManager.getStackLength()).toBe(0);
  });

  it("1.2 Resolves handlers strictly in LIFO order for identical priorities", () => {
    const executionOrder: string[] = [];

    registerBackButtonHandler(() => { executionOrder.push("first"); return true; }, 10);
    registerBackButtonHandler(() => { executionOrder.push("second"); return true; }, 10);
    registerBackButtonHandler(() => { executionOrder.push("third"); return true; }, 10);

    expect(backButtonManager.getStackLength()).toBe(3);

    backButtonManager.executeTopHandler();
    backButtonManager.executeTopHandler();
    backButtonManager.executeTopHandler();

    expect(executionOrder).toEqual(["third", "second", "first"]);
  });

  it("1.3 Executes higher priority handlers before lower priority handlers", () => {
    const log: string[] = [];

    registerBackButtonHandler(() => { log.push("low"); return true; }, 5);
    registerBackButtonHandler(() => { log.push("high"); return true; }, 50);
    registerBackButtonHandler(() => { log.push("medium"); return true; }, 20);

    backButtonManager.executeTopHandler();
    backButtonManager.executeTopHandler();
    backButtonManager.executeTopHandler();

    expect(log).toEqual(["high", "medium", "low"]);
  });

  it("1.4 initBackButtonListener attaches Capacitor native listener and web popstate", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    initBackButtonListener();

    expect(App.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("popstate", expect.any(Function));

    addEventListenerSpy.mockRestore();
  });
});

describe("Tier 2: BackButtonManager Boundary & Corner Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  it("2.1 Returns false when executeTopHandler is invoked on an empty stack", () => {
    expect(backButtonManager.getStackLength()).toBe(0);
    const handled = backButtonManager.executeTopHandler();
    expect(handled).toBe(false);
  });

  it("2.2 Idempotent clear() operation on empty and populated stacks", () => {
    backButtonManager.clear();
    expect(backButtonManager.getStackLength()).toBe(0);

    registerBackButtonHandler(() => true, 10);
    registerBackButtonHandler(() => true, 20);
    expect(backButtonManager.getStackLength()).toBe(2);

    backButtonManager.clear();
    expect(backButtonManager.getStackLength()).toBe(0);

    // Repeated clear
    backButtonManager.clear();
    expect(backButtonManager.getStackLength()).toBe(0);
  });

  it("2.3 Cascades past handlers returning false to find an active consumer", () => {
    const log: string[] = [];

    registerBackButtonHandler(() => { log.push("h1_consumer"); return true; }, 10);
    registerBackButtonHandler(() => { log.push("h2_passthrough"); return false; }, 20);
    registerBackButtonHandler(() => { log.push("h3_passthrough"); return false; }, 30);

    const handled = backButtonManager.executeTopHandler();
    expect(handled).toBe(true);
    expect(log).toEqual(["h3_passthrough", "h2_passthrough", "h1_consumer"]);
    expect(backButtonManager.getStackLength()).toBe(0);
  });

  it("2.4 Catches exceptions thrown by handlers without breaking stack state", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const faultyHandler = vi.fn().mockImplementation(() => {
      throw new Error("UI Component Crash");
    });
    const fallbackHandler = vi.fn().mockReturnValue(true);

    registerBackButtonHandler(fallbackHandler, 5);
    registerBackButtonHandler(faultyHandler, 10);

    const handled = backButtonManager.executeTopHandler();
    expect(handled).toBe(true);
    expect(faultyHandler).toHaveBeenCalledTimes(1);

    // Fallback handler is still intact and ready
    expect(backButtonManager.getStackLength()).toBe(1);
    const nextHandled = backButtonManager.executeTopHandler();
    expect(nextHandled).toBe(true);
    expect(fallbackHandler).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it("2.5 Unregistering non-existent ID does not mutate stack or throw", () => {
    registerBackButtonHandler(() => true, 10);
    expect(backButtonManager.getStackLength()).toBe(1);

    backButtonManager.unregister("fake_id_12345");
    expect(backButtonManager.getStackLength()).toBe(1);
  });
});

describe("Tier 3: useSheetManager Hook & Root Route Cross-Feature Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  it("3.1 useSheetManager registers when isOpen is true and unregisters on false/unmount", () => {
    const onClose = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ isOpen }) => useSheetManager(isOpen, onClose, 10),
      { initialProps: { isOpen: false } }
    );

    expect(backButtonManager.getStackLength()).toBe(0);

    // Open sheet
    rerender({ isOpen: true });
    expect(backButtonManager.getStackLength()).toBe(1);

    // Back press triggers onClose
    backButtonManager.executeTopHandler();
    expect(onClose).toHaveBeenCalledTimes(1);

    // Close sheet
    rerender({ isOpen: false });
    expect(backButtonManager.getStackLength()).toBe(0);

    // Open and unmount
    rerender({ isOpen: true });
    expect(backButtonManager.getStackLength()).toBe(1);
    unmount();
    expect(backButtonManager.getStackLength()).toBe(0);
  });

  it("3.2 Root route double back press within 2000ms triggers exitApp on Capacitor", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const isRootRoute = () => true;

    // 1st press: shows Arabic exit toast
    backButtonManager.handleBack(isRootRoute, false);
    expect(toast.info).toHaveBeenCalledWith("اضغط مرة أخرى للخروج", { duration: 2000 });
    expect(App.exitApp).not.toHaveBeenCalled();

    // 2nd press within 2000ms: exits app
    backButtonManager.handleBack(isRootRoute, false);
    expect(App.exitApp).toHaveBeenCalledTimes(1);
  });

  it("3.3 Root route back press timer resets if time between presses exceeds 2000ms", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const isRootRoute = () => true;
    const dateNowSpy = vi.spyOn(Date, "now");

    // Press 1 at t = 10,000
    dateNowSpy.mockReturnValue(10000);
    backButtonManager.handleBack(isRootRoute, false);
    expect(toast.info).toHaveBeenCalledTimes(1);

    // Press 2 at t = 13,000 (> 2000ms delta)
    dateNowSpy.mockReturnValue(13000);
    backButtonManager.handleBack(isRootRoute, false);
    expect(toast.info).toHaveBeenCalledTimes(2);
    expect(App.exitApp).not.toHaveBeenCalled();

    // Press 3 at t = 14,000 (< 2000ms delta from Press 2)
    dateNowSpy.mockReturnValue(14000);
    backButtonManager.handleBack(isRootRoute, false);
    expect(App.exitApp).toHaveBeenCalledTimes(1);

    dateNowSpy.mockRestore();
  });
});

describe("Tier 4: BackButtonManager Real-World Workload Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  it("4.1 Simulates 4-tier deep nested modal stack dismissal in strict reverse sequence", () => {
    const closedModals: string[] = [];

    // Layer 1: Expense Details Sheet (Priority 10)
    registerBackButtonHandler(() => { closedModals.push("ExpenseDetails"); return true; }, 10);
    // Layer 2: Edit Form Sheet (Priority 10)
    registerBackButtonHandler(() => { closedModals.push("EditForm"); return true; }, 10);
    // Layer 3: Category Picker Sub-sheet (Priority 10)
    registerBackButtonHandler(() => { closedModals.push("CategoryPicker"); return true; }, 10);
    // Layer 4: Custom Category Dialog (Priority 20 - higher priority alert modal)
    registerBackButtonHandler(() => { closedModals.push("CustomCategoryDialog"); return true; }, 20);

    expect(backButtonManager.getStackLength()).toBe(4);

    // Back 1: Closes CustomCategoryDialog (Priority 20)
    backButtonManager.executeTopHandler();
    expect(closedModals).toEqual(["CustomCategoryDialog"]);

    // Back 2: Closes CategoryPicker (LIFO of Priority 10)
    backButtonManager.executeTopHandler();
    expect(closedModals).toEqual(["CustomCategoryDialog", "CategoryPicker"]);

    // Back 3: Closes EditForm (LIFO of Priority 10)
    backButtonManager.executeTopHandler();
    expect(closedModals).toEqual(["CustomCategoryDialog", "CategoryPicker", "EditForm"]);

    // Back 4: Closes ExpenseDetails
    backButtonManager.executeTopHandler();
    expect(closedModals).toEqual(["CustomCategoryDialog", "CategoryPicker", "EditForm", "ExpenseDetails"]);

    // Stack is now empty
    expect(backButtonManager.getStackLength()).toBe(0);
    expect(backButtonManager.executeTopHandler()).toBe(false);
  });
});
