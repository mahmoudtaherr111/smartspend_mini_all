/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSheetManager } from "./useSheetManager";
import { backButtonManager } from "@/lib/back-button-manager";

describe("useSheetManager", () => {
  let historyBackSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    backButtonManager.clear();
    history.replaceState({}, "", window.location.href);
    historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
  });

  it("does not register handler when isOpen is false", () => {
    const onClose = vi.fn();
    renderHook(() => useSheetManager(false, onClose));

    expect(backButtonManager.getStackLength()).toBe(0);
  });

  it("registers handler with backButtonManager when isOpen is true", () => {
    const onClose = vi.fn();
    renderHook(() => useSheetManager(true, onClose));

    expect(backButtonManager.getStackLength()).toBe(1);
    expect(window.history.state.smartSpendOverlay).toMatch(/^smartspend-overlay-/);

    // Trigger back handler execution
    const handled = backButtonManager.executeTopHandler();
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("unregisters handler when unmounted or isOpen changes to false", () => {
    const onClose = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ open }) => useSheetManager(open, onClose),
      { initialProps: { open: true } }
    );

    expect(backButtonManager.getStackLength()).toBe(1);

    // Rerender as closed
    rerender({ open: false });
    expect(backButtonManager.getStackLength()).toBe(0);
    expect(historyBackSpy).toHaveBeenCalledTimes(1);

    // Reopen and unmount
    rerender({ open: true });
    expect(backButtonManager.getStackLength()).toBe(1);
    unmount();
    expect(backButtonManager.getStackLength()).toBe(0);
  });
});
