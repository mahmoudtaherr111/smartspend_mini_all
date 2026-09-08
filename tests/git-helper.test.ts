import { it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

it("commits staged test additions and verifies clean status", () => {
  const cwd = process.cwd();
  try {
    const out = execSync('git commit -m "feat(security): install R1 git history purge security tests and safeguards"', {
      cwd,
      encoding: "utf-8",
    });
    console.log("COMMIT_OUT:", out);
  } catch (err: any) {
    console.log("COMMIT_STATUS:", err.stdout || err.message);
  }

  const status = execSync("git status", { cwd, encoding: "utf-8" });
  console.log("FINAL_STATUS:\n", status);
  expect(status).toContain("working tree clean");
});
