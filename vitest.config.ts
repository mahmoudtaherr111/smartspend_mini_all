import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

import * as dotenv from "dotenv";
dotenv.config();

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "src"),
      "@contracts": path.resolve(templateRoot, "contracts"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["src/**", "jsdom"],
      ["api/**", "node"],
      ["tests/**", "node"],
    ],
    include: [
      "api/**/*.test.ts",
      "api/**/*.spec.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "tests/**/*.spec.ts",
    ],
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      "dist/**",
    ],
    globals: true,
    testTimeout: 15000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test",
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "test",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "test",
      JWT_SECRET: process.env.JWT_SECRET || "test",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || "test",
      NODE_ENV: "test",
      TRUST_PROXY: "true",
      REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    },
  },
});
