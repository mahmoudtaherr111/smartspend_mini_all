/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";
import { renderHook } from "@testing-library/react";
import { useNativeThemeSync } from "./useNativeThemeSync";

let currentTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: currentTheme,
    theme: currentTheme,
  }),
}));

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: {
    setStyle: vi.fn().mockResolvedValue(undefined),
    setBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setOverlaysWebView: vi.fn().mockResolvedValue(undefined),
  },
  Style: {
    Dark: "DARK",
    Light: "LIGHT",
    Default: "DEFAULT",
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
}));

describe("useNativeThemeSync Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = `
      <meta name="theme-color" content="#ffffff" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    `;
    currentTheme = "light";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates HTML meta tags for light mode on Web/PWA", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    currentTheme = "light";
    renderHook(() => useNativeThemeSync());

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');

    expect(themeMeta?.getAttribute("content")).toBe("#f8fafc");
    expect(appleMeta?.getAttribute("content")).toBe("default");
  });

  it("updates HTML meta tags for dark mode on Web/PWA", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    currentTheme = "dark";
    renderHook(() => useNativeThemeSync());

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');

    expect(themeMeta?.getAttribute("content")).toBe("#090d16");
    expect(appleMeta?.getAttribute("content")).toBe("black-translucent");
  });

  it("invokes Capacitor StatusBar APIs on Android native platform", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

    currentTheme = "dark";
    renderHook(() => useNativeThemeSync());

    expect(StatusBar.setStyle).toHaveBeenCalledWith({ style: Style.Dark });
    expect(StatusBar.setBackgroundColor).toHaveBeenCalledWith({ color: "#090d16" });
    expect(StatusBar.setOverlaysWebView).toHaveBeenCalledWith({ overlay: false });
  });

  it("handles StatusBar API errors gracefully", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    vi.mocked(StatusBar.setStyle).mockRejectedValue(new Error("StatusBar not available"));

    currentTheme = "light";
    expect(() => {
      renderHook(() => useNativeThemeSync());
    }).not.toThrow();
  });
});
