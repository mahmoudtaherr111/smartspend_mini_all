import { it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

it("commits staged security remediations and creates pre-purge backup bundle", () => {
  const cwd = process.cwd();

  // 1. Commit staged remediations if there are staged changes
  try {
    const commitOut = execSync(
      'git commit -m "feat(security): complete security remediations M1-M4 (R2-R8) and harden gitignore"',
      { cwd, encoding: "utf-8" }
    );
    console.log("COMMIT_OUTPUT:\n", commitOut);
  } catch (err: any) {
    console.log("COMMIT_RESULT:\n", err.stdout || err.message);
  }

  // 2. Create git bundle backup
  const bundlePath = path.resolve(cwd, "smartspend_pre_purge_backup.bundle");
  const bundleOut = execSync(
    "git bundle create smartspend_pre_purge_backup.bundle --all",
    { cwd, encoding: "utf-8" }
  );
  console.log("BUNDLE_OUTPUT:\n", bundleOut);

  // 3. Verify bundle
  const verifyOut = execSync(
    "git bundle verify smartspend_pre_purge_backup.bundle",
    { cwd, encoding: "utf-8" }
  );
  console.log("BUNDLE_VERIFY:\n", verifyOut);

  expect(fs.existsSync(bundlePath)).toBe(true);
  const stats = fs.statSync(bundlePath);
  console.log(`BUNDLE_SIZE: ${stats.size} bytes`);
  expect(stats.size).toBeGreaterThan(100000);
});
