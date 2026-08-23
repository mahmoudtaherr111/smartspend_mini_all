import devServer from "@hono/vite-dev-server";
import path from "path";
const __dirname = import.meta.dirname;
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // "frontend" mode = frontend deployed separately; skip Hono dev-server plugin
  const isFrontendOnly = mode === "frontend" || !!env.VITE_API_URL;

  return {
    base: env.VITE_CDN_URL || "/",
    plugins: [
      // Only mount the Hono dev-server in monorepo (full-stack) mode
      ...(!isFrontendOnly
        ? [devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*/] })]
        : []),
      react(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.js",
        // register-sw.ts owns update UX; emitting VitePWA's second registrar
        // caused the same worker to be registered twice in production.
        injectRegister: false,
        registerType: "autoUpdate",
        devOptions: {
          enabled: false,
          type: "module",
        },
        includeAssets: ["icon.png"],
        manifest: {
          id: "/",
          start_url: "/",
          scope: "/",
          name: "SmartSpend AI",
          share_target: {
            action: "/dashboard?tab=record",
            method: "GET",
            params: {
              title: "share_title",
              text: "share_text",
              url: "share_url",
            },
          },
          short_name: "SmartSpend",
          description: "المساعد المالي الذكي وتتبع المصاريف بالصوت والذكاء الاصطناعي",
          theme_color: "#10b981",
          background_color: "#0f172a",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait-primary",
          dir: "rtl",
          lang: "ar",
          categories: ["finance", "productivity"],
          icons: [
            {
              src: "icon.png",
              // The source image is 274×268. Declaring a fictional 192/512
              // size made install surfaces reject or blur it unpredictably.
              sizes: "274x268",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icon.png",
              sizes: "274x268",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          screenshots: [
            {
              src: "screenshots/dashboard.png",
              sizes: "1080x1920",
              type: "image/png",
              form_factor: "narrow",
              label: "الرئيسية والمساعد المالي بالذكاء الاصطناعي",
            },
            {
              src: "screenshots/stats.png",
              sizes: "1080x1920",
              type: "image/png",
              form_factor: "narrow",
              label: "إحصائيات وتحليلات مالية متقدمة",
            },
          ],
        },
      }),
    ],
    server: {
      host: true,
      allowedHosts: true,
      port: isFrontendOnly ? 5173 : 3000,
      // When frontend is standalone, proxy /api/* to the backend server
      ...(isFrontendOnly && env.VITE_API_URL
        ? {
            proxy: {
              "/api": {
                target: env.VITE_API_URL,
                changeOrigin: true,
                secure: false,
                ws: true,
              },
            },
          }
        : {}),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@contracts": path.resolve(__dirname, "./contracts"),
        "@db": path.resolve(__dirname, "./db"),
        db: path.resolve(__dirname, "./db"),
      },
    },
    envDir: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            charts: ["recharts"],
          },
        },
      },
    },
  };
});
