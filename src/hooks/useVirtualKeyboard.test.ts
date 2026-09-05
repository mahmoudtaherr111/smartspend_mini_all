/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keyboard } from "@capacitor/keyboard";
import { Capacitor } from "@capacitor/core";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  useVirtualKeyboard,
  VirtualKeyboardProvider,
} from "./useVirtualKeyboard";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(VirtualKeyboardProvider, null, children);

vi.mock("@capacitor/keyboard", () => ({
  Keyboard: {
    addListener: vi.fn(),
    setAccessoryBarVisible: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

describe("useVirtualKeyboard Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.className = "";
    document.documentElement.style.removeProperty("--keyboard-height");
    document.documentElement.style.removeProperty("--visual-viewport-height");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Native Capacitor Platform", () => {
    it("subscribes to native keyboardWillShow and keyboardWillHide events", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      let showCallback: ((info: { keyboardHeight: number }) => void) | undefined;
      let hideCallback: (() => void) | undefined;

      const removeShow = vi.fn();
      const removeHide = vi.fn();

      vi.mocked(Keyboard.addListener).mockImplementation((event: string, cb: any) => {
        if (event === "keyboardWillShow") {
          showCallback = cb;
          return Promise.resolve({ remove: removeShow }) as any;
        }
        if (event === "keyboardWillHide") {
          hideCallback = cb;
          return Promise.resolve({ remove: removeHide }) as any;
        }
        return Promise.resolve({ remove: vi.fn() }) as any;
      });

      const { result, unmount } = renderHook(() => useVirtualKeyboard(), {
        wrapper,
      });

      expect(Keyboard.setAccessoryBarVisible).toHaveBeenCalledWith({ isVisible: false });
      expect(result.current.isKeyboardOpen).toBe(false);
      expect(result.current.keyboardHeight).toBe(0);

      // Trigger show
      act(() => {
        showCallback?.({ keyboardHeight: 300 });
      });

      expect(result.current.isKeyboardOpen).toBe(true);
      expect(result.current.keyboardHeight).toBe(300);
      expect(document.documentElement.classList.contains("keyboard-active")).toBe(true);
      expect(document.documentElement.style.getPropertyValue("--keyboard-height")).toBe("300px");

      // Trigger hide
      act(() => {
        hideCallback?.();
      });

      expect(result.current.isKeyboardOpen).toBe(false);
      expect(result.current.keyboardHeight).toBe(0);
      expect(document.documentElement.classList.contains("keyboard-active")).toBe(false);
      expect(document.documentElement.style.getPropertyValue("--keyboard-height")).toBe("0px");

      unmount();
    });
  });

  describe("2. Web / Visual Viewport Platform", () => {
    it("handles visual viewport resize events when not on native platform", () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      let resizeListener: (() => void) | undefined;

      const mockVisualViewport = {
        height: 500,
        addEventListener: vi.fn((event: string, cb: any) => {
          if (event === "resize") resizeListener = cb;
        }),
        removeEventListener: vi.fn(),
      };

      Object.defineProperty(window, "visualViewport", {
        value: mockVisualViewport,
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window, "innerHeight", {
        value: 800,
        writable: true,
        configurable: true,
      });

      const { result, unmount } = renderHook(() => useVirtualKeyboard(), {
        wrapper,
      });

      // Trigger viewport shrink (keyboard opening: 800 - 500 = 300px diff > 80px)
      act(() => {
        resizeListener?.();
      });

      expect(result.current.isKeyboardOpen).toBe(true);
      expect(result.current.keyboardHeight).toBe(300);
      expect(document.documentElement.classList.contains("keyboard-active")).toBe(true);

      // Trigger viewport restore (keyboard closing: 800 - 800 = 0px diff)
      mockVisualViewport.height = 800;
      act(() => {
        resizeListener?.();
      });

      expect(result.current.isKeyboardOpen).toBe(false);
      expect(result.current.keyboardHeight).toBe(0);
      expect(document.documentElement.classList.contains("keyboard-active")).toBe(false);

      unmount();
      expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    });
  });
});
