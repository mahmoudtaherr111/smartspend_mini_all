import { it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

it("executes full history purge and verifies zero leaks", () => {
  const cwd = process.cwd();
  const scriptPath = path.resolve(cwd, "scripts", "execute_purge.cjs");
  
  const out = execSync(`node "${scriptPath}"`, { cwd, encoding: "utf-8" });
  console.log("EXECUTE_PURGE_OUTPUT:\n", out);

  const reportPath = path.resolve(cwd, ".agents", "worker_sec_m5", "purge_execution_results.json");
  expect(fs.existsSync(reportPath)).toBe(true);

  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  console.log("PURGE_REPORT_SUMMARY:\n", {
    filterSuccess: report.steps?.filter_repo?.success,
    isEnvPurged: report.verification?.isEnvPurged,
    leakedEnvOccurrences: report.verification?.leakedEnvOccurrences,
    isKeyPurged: report.verification?.isKeyPurged,
    keyMatches: report.verification?.keyMatches,
  });

  expect(report.verification.isEnvPurged).toBe(true);
  expect(report.verification.isKeyPurged).toBe(true);
});
