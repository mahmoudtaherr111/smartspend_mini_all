/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
  let listeners: ((e: MediaQueryListEvent) => void)[] = [];

  beforeEach(() => {
    listeners = [];
    vi.restoreAllMocks();
  });

  it("returns true when media query matches", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event, cb) => {
        if (event === "change") listeners.push(cb);
      }),
      removeEventListener: vi.fn((event, cb) => {
        listeners = listeners.filter((l) => l !== cb);
      }),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(result.current).toBe(true);
  });

  it("returns false when media query does not match", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event, cb) => {
        if (event === "change") listeners.push(cb);
      }),
      removeEventListener: vi.fn((event, cb) => {
        listeners = listeners.filter((l) => l !== cb);
      }),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(result.current).toBe(false);
  });

  it("updates reactively when media query change event fires", () => {
    let matchesState = false;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return matchesState;
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event, cb) => {
        if (event === "change") listeners.push(cb);
      }),
      removeEventListener: vi.fn((event, cb) => {
        listeners = listeners.filter((l) => l !== cb);
      }),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(result.current).toBe(false);

    // Simulate media query match change
    act(() => {
      matchesState = true;
      listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    });

    expect(result.current).toBe(true);
  });
});
