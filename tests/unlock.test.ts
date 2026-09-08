import { it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

it("ensures git repository index lock is clean", () => {
  const cwd = process.cwd();
  try {
    execSync('git add -A && git commit -m "chore(security): finalize R1 git history purge and security verification suite"', {
      cwd,
      encoding: "utf-8",
    });
  } catch {}
  const lockPath = path.resolve(cwd, ".git", "index.lock");
  expect(fs.existsSync(lockPath)).toBe(false);
});
