import { useEffect } from "react";
import { useTheme } from "next-themes";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";

export function useNativeThemeSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const isDark = resolvedTheme === "dark";
    const bgHex = isDark ? "#090d16" : "#f8fafc";

    // 1. Update HTML meta tags for Web/PWA
    if (typeof document !== "undefined") {
      const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
      themeMetas.forEach((meta) => {
        meta.setAttribute("content", bgHex);
      });

      const appleMeta = document.querySelector(
        'meta[name="apple-mobile-web-app-status-bar-style"]',
      );
      if (appleMeta) {
        appleMeta.setAttribute(
          "content",
          isDark ? "black-translucent" : "default",
        );
      }
    }

    // 2. Update Native Status Bar for iOS & Android Capacitor Shells
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({
        style: isDark ? Style.Dark : Style.Light,
      }).catch(() => {});

      if (Capacitor.getPlatform() === "android") {
        StatusBar.setBackgroundColor({ color: bgHex }).catch(() => {});
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      }
    }
  }, [resolvedTheme]);
}
