import { fileURLToPath } from "node:url";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Lint what git tracks. Everything .gitignore excludes (builds, nested worktrees, scratch folders, local data)
  // is skipped, so a local run reports the same files as CI.
  includeIgnoreFile(fileURLToPath(new URL(".gitignore", import.meta.url)), "Patterns from .gitignore"),
  // Copies of the web build inside the native shells, and the separate architecture tooling.
  globalIgnores(["dev-dist", "android", "ios", "tools"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // @typescript-eslint/no-unused-vars reports the same problems with type information.
      "no-unused-vars": "off",
    },
  },
  {
    // React rules only where React runs. Server code and Playwright fixtures call functions named use* that are
    // not React hooks (Baileys' useMultiFileAuthState, Playwright's use).
    files: ["src/**/*.{ts,tsx}", "tests/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
]);
