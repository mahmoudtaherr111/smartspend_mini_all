import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  // "frontend" mode = frontend deployed separately; skip Hono dev-server plugin
  const isFrontendOnly = mode === "frontend" || !!env.VITE_API_URL

  return {
    plugins: [
      // Only mount the Hono dev-server in monorepo (full-stack) mode
      ...(!isFrontendOnly
        ? [devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*/] })]
        : []),
      react(),
    ],
    server: {
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
        "db": path.resolve(__dirname, "./db"),
      },
    },
    envDir: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
  }
});
