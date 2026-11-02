/**
 * Opaque-Box E2E Test Suite Runner
 * Executes the complete 4-tier test suite under Vitest and outputs summary metrics.
 * Usage:
 *   npx vitest run --config tests/e2e/vitest.config.ts
 *   or: npx tsx tests/e2e/runner.ts
 */

import { spawn } from "child_process";
import path from "path";

const configPath = path.resolve(import.meta.dirname, "vitest.config.ts");
const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npx.cmd" : "npx";

console.log("================================================================================");
console.log("SmartSpend AI - Mobile Program & Production Readiness (Sessions 5 & 6)");
console.log("Opaque-Box E2E Test Suite Runner (Tiers 1-4)");
console.log("================================================================================");
console.log(`Using Vitest Config: ${configPath}\n`);

const child = spawn(npmCmd, ["vitest", "run", "--config", configPath], {
  stdio: "inherit",
  shell: isWindows,
  cwd: path.resolve(import.meta.dirname, "../.."),
});

child.on("close", (code) => {
  if (code === 0) {
    console.log("\n[SUCCESS] All E2E test suites (Tiers 1-4) passed cleanly!");
    process.exit(0);
  } else {
    console.error(`\n[FAILURE] E2E test suite exited with error code: ${code}`);
    process.exit(code ?? 1);
  }
});
