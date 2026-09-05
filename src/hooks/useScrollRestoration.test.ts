/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  clearScrollCache,
  getScrollOffset,
  setScrollOffset,
  scrollCache,
  useScrollRestoration,
} from "./useScrollRestoration";

let currentPathname = "/dashboard";
let currentSearch = "";

vi.mock("react-router-dom", () => ({
  useLocation: () => ({
    pathname: currentPathname,
    search: currentSearch,
  }),
}));

describe("useScrollRestoration Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearScrollCache();
    currentPathname = "/dashboard";
    currentSearch = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Cache Utilities", () => {
    it("sets, gets, and clears scroll offsets accurately", () => {
      setScrollOffset("/dashboard", 450);
      expect(getScrollOffset("/dashboard")).toBe(450);

      setScrollOffset("/settings", 120);
      expect(getScrollOffset("/settings")).toBe(120);

      expect(scrollCache.size).toBe(2);

      clearScrollCache();
      expect(getScrollOffset("/dashboard")).toBeUndefined();
      expect(scrollCache.size).toBe(0);
    });
  });

  describe("Scroll Restoration Lifecycle", () => {
    it("handles null/undefined container ref without throwing", () => {
      const emptyRef = { current: null };
      expect(() => {
        renderHook(() => useScrollRestoration(emptyRef));
      }).not.toThrow();
    });

    it("restores cached scroll offset to container element", () => {
      const mockElement = {
        scrollTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLElement;

      const containerRef = { current: mockElement };
      setScrollOffset("/dashboard", 380);

      renderHook(() => useScrollRestoration(containerRef));

      expect(mockElement.scrollTop).toBe(380);
      expect(mockElement.addEventListener).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
        { passive: true },
      );
    });

    it("defaults to 0px if route has no saved scroll offset", () => {
      const mockElement = {
        scrollTop: 200,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLElement;

      const containerRef = { current: mockElement };

      renderHook(() => useScrollRestoration(containerRef));

      expect(mockElement.scrollTop).toBe(0);
    });

    it("supports custom keys for custom scroll containers", () => {
      const mockElement = {
        scrollTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLElement;

      const containerRef = { current: mockElement };
      setScrollOffset("custom-chat-container", 750);

      renderHook(() =>
        useScrollRestoration(containerRef, "custom-chat-container"),
      );

      expect(mockElement.scrollTop).toBe(750);
    });

    it("saves scroll offset on unmount and route change", () => {
      const scrollListeners: Array<() => void> = [];
      const mockElement = {
        scrollTop: 520,
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === "scroll") scrollListeners.push(handler);
        }),
        removeEventListener: vi.fn(),
      } as unknown as HTMLElement;

      const containerRef = { current: mockElement };

      const { unmount } = renderHook(() =>
        useScrollRestoration(containerRef),
      );

      // Trigger scroll event
      scrollListeners.forEach((l) => l());
      expect(getScrollOffset("/dashboard")).toBe(520);

      // Unmount should persist final position
      mockElement.scrollTop = 580;
      unmount();
      expect(getScrollOffset("/dashboard")).toBe(580);
    });
  });
});
