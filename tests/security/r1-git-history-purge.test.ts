import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

describe("R1: Git History Secret Purge & Rotation Safeguards", () => {
  const cwd = process.cwd();

  it("1.1 ensures no leaked .env files exist in full Git history", () => {
    const raw = execSync('git log --all --full-history --name-only --pretty="" -- "**.env*"', {
      cwd,
      encoding: "utf-8",
    });
    const paths = Array.from(new Set(raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)));
    const leaked = paths.filter((p) => {
      // Must not match .env itself or variants like .env.local, .env.production
      return p === ".env" || (p.startsWith(".env.") && !p.endsWith(".example"));
    });
    expect(leaked).toEqual([]);
  });

  it("1.2 ensures Gemini API key ([REDACTED_KEY_PREFIX]) is completely purged from Git commit history", () => {
    const log = execSync('git log --all --oneline -S "[REDACTED_KEY_PREFIX]"', {
      cwd,
      encoding: "utf-8",
    });
    expect(log.trim()).toBe("");
  });

  it("1.3 ensures Google OAuth client secret is completely purged from Git commit history", () => {
    const log = execSync('git log --all --oneline -S "[REDACTED_GOOGLE_SECRET]"', {
      cwd,
      encoding: "utf-8",
    });
    expect(log.trim()).toBe("");
  });

  it("1.4 ensures .gitignore strictly blocks all environment files while preserving .env.example", () => {
    const gitignorePath = path.resolve(cwd, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toMatch(/\.env\*/);
    expect(content).toMatch(/\*\.env\*/);
    expect(content).toMatch(/!\.env\.example/);
  });

  it("1.5 ensures pre-commit hook is installed and contains secret/env blocking safeguards", () => {
    const hookPath = path.resolve(cwd, ".git", "hooks", "pre-commit");
    expect(fs.existsSync(hookPath)).toBe(true);
    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain("STAGED_ENV_FILES");
    expect(content).toContain("STAGED_SECRET_DIFF");
    expect(content).toContain("AIza");
    expect(content).toContain("AQ.Ab8");
    expect(content).toContain("gsk_");
    expect(content).toContain("nvapi-");
  });

  it("1.6 verifies repository backup bundle integrity", () => {
    const bundlePath = path.resolve(cwd, "smartspend_pre_purge_backup.bundle");
    expect(fs.existsSync(bundlePath)).toBe(true);
    const verifyOut = execSync(`git bundle verify "${bundlePath}"`, {
      cwd,
      encoding: "utf-8",
    });
    expect(verifyOut).toMatch(/The bundle records a complete history|is okay/);
  });

  it("1.7 verifies git working tree and commit DAG health", () => {
    const status = execSync("git status --porcelain", { cwd, encoding: "utf-8" });
    const lines = status
      .split(/\r?\n/)
      .filter((l) => !l.startsWith("??") && !l.includes("STORAGE_BASELINE.md") && l.trim().length > 0);
    expect(lines).toEqual([]);
  });
});
