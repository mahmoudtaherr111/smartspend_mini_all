import { defineConfig } from "vitest/config";
import path from "path";
import * as dotenv from "dotenv";

const rootDir = path.resolve(import.meta.dirname, "../..");
dotenv.config({ path: path.resolve(rootDir, ".env") });

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      "@contracts": path.resolve(rootDir, "contracts"),
      "@assets": path.resolve(rootDir, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    globals: true,
    testTimeout: 20000,
  },
});
