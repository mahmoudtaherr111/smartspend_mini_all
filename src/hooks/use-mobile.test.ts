/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

describe("useIsMobile Hook", () => {
  let matchMediaListeners: Array<() => void> = [];

  beforeEach(() => {
    matchMediaListeners = [];
    vi.clearAllMocks();

    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      return {
        matches: window.innerWidth < 1024,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === "change") matchMediaListeners.push(handler);
        }),
        removeEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === "change") {
            matchMediaListeners = matchMediaListeners.filter((h) => h !== handler);
          }
        }),
        dispatchEvent: vi.fn(),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true for mobile viewports (< 1024px, e.g. 375px, 768px, 1023px)", () => {
    window.innerWidth = 375;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns true for tablet viewports synchronized with layout shell (e.g. 820px, 1023px)", () => {
    window.innerWidth = 820;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    window.innerWidth = 1023;
    const { result: tabletResult } = renderHook(() => useIsMobile());
    expect(tabletResult.current).toBe(true);
  });

  it("returns false for desktop viewports (>= 1024px, e.g. 1024px, 1280px)", () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    window.innerWidth = 1440;
    const { result: desktopResult } = renderHook(() => useIsMobile());
    expect(desktopResult.current).toBe(false);
  });

  it("dynamically updates state on window resize / matchMedia change", () => {
    window.innerWidth = 500;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    // Resize to desktop
    act(() => {
      window.innerWidth = 1200;
      matchMediaListeners.forEach((listener) => listener());
    });

    expect(result.current).toBe(false);

    // Resize back to tablet/mobile
    act(() => {
      window.innerWidth = 800;
      matchMediaListeners.forEach((listener) => listener());
    });

    expect(result.current).toBe(true);
  });
});
