import devServer from "@hono/vite-dev-server";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.resolve(import.meta.dirname, "..");

// The admin console is its own small site: no service worker, no install, no offline. The server serves the build at
// /admin (api/boot.ts), so it runs without the web app. `npm run admin:dev` mounts the same API on port 3100.
export default defineConfig({
  root: import.meta.dirname,
  base: "/admin/",
  envDir: root,
  plugins: [devServer({ entry: path.join(root, "api/boot.ts"), exclude: [/^\/(?!api\/).*/] }), react()],
  css: { postcss: root },
  resolve: {
    alias: {
      "@admin": path.resolve(import.meta.dirname, "src"),
      "@": path.join(root, "src"),
      "@contracts": path.join(root, "contracts"),
      "@db": path.join(root, "db"),
      db: path.join(root, "db"),
    },
  },
  server: { port: 3100, strictPort: true },
  build: {
    outDir: path.join(root, "dist/admin"),
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { vendor: ["react", "react-dom", "react-router-dom"], charts: ["recharts"] } } },
  },
});
