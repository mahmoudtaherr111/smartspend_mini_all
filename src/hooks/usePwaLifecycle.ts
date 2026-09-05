import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";

export function usePwaLifecycle() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  // 1. App Badging Reset
  useEffect(() => {
    if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) {
      try {
        navigator.clearAppBadge().catch(() => {});
      } catch (e) {}
    }
  }, []);

  // 2. Sync PWA status bar style and theme-color meta tags with next-themes
  useEffect(() => {
    if (typeof document === "undefined") return;

    const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
    const color = resolvedTheme === "dark" ? "#090d16" : "#f8fafc";
    themeColorMetas.forEach((meta) => {
      meta.setAttribute("content", color);
    });

    const statusBarMeta = document.querySelector(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
    );
    if (statusBarMeta) {
      statusBarMeta.setAttribute(
        "content",
        resolvedTheme === "dark" ? "black-translucent" : "default",
      );
    }
  }, [resolvedTheme]);

  // 3. Service Worker Notification Navigation Listener
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "NAVIGATE_TO") {
        try {
          const urlObj = new URL(event.data.url, window.location.origin);
          navigate(urlObj.pathname + urlObj.search + urlObj.hash);
        } catch (e) {
          console.error("Failed to parse navigation URL:", e);
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [navigate]);
}
