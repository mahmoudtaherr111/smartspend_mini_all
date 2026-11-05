import devServer from "@hono/vite-dev-server";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { defineConfig, loadEnv } from "vite";
import { createOriginPolicy } from "../api/lib/origin-policy";
import { voiceDevServer } from "../scripts/vite-voice";

const root = path.resolve(import.meta.dirname, "..");
const originPolicy = createOriginPolicy({ ...loadEnv("development", root, ""), NODE_ENV: "development" });

// The development server of the product without the website (decision 0050): the API (`api/boot.ts`, with the voice
// call's WebSocket) and the admin console at /admin, on port 3000 where the phone apps' debug builds look.
// `npm run dev`. The server serves the console's build at /admin in production.
export default defineConfig({
  root: import.meta.dirname,
  base: "/admin/",
  envDir: root,
  // Its own dependency cache: sharing the web app's makes two dev servers invalidate each other in a reload loop.
  cacheDir: path.join(root, "node_modules/.vite-admin"),
  plugins: [
    devServer({ entry: path.join(root, "api/boot.ts"), exclude: [/^\/(?!api\/).*/] }),
    voiceDevServer(originPolicy.isAllowedWebSocketOrigin),
    react(),
  ],
  // The console's own Tailwind config scans only admin/, so the website's classes stay out of its stylesheet.
  css: { postcss: { plugins: [tailwindcss({ config: path.join(import.meta.dirname, "tailwind.config.cjs") }), autoprefixer()] } },
  resolve: {
    alias: {
      "@admin": path.resolve(import.meta.dirname, "src"),
      "@contracts": path.join(root, "contracts"),
      "@db": path.join(root, "db"),
      db: path.join(root, "db"),
    },
  },
  server: { port: 3000, strictPort: true },
  build: {
    outDir: path.join(root, "dist/admin"),
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { vendor: ["react", "react-dom", "react-router-dom"], charts: ["recharts"] } } },
  },
});
