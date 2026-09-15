/**
 * Keeps secrets out of the repository. Scans the files git tracks now (not the history) for the token
 * shapes .githooks/pre-commit refuses, and checks that .gitignore and the tracked hook keep their guards.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

// Same shapes as .githooks/pre-commit.
const SECRET_SHAPES =
  /(AIza[0-9A-Za-z_-]{30,}|AQ\.Ab8[0-9A-Za-z_-]{30,}|gsk_[0-9A-Za-z_-]{20,}|nvapi-[0-9A-Za-z_-]{40,}|fw_[0-9A-Za-z_-]{15,}|GOCSPX-[0-9A-Za-z_-]{20,})/;

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

/** Paths the pre-commit hook does not scan either: tests, examples and samples may hold fake keys. */
function exemptFromSecretScan(file: string): boolean {
  const name = path.posix.basename(file);
  return /\.test\./.test(name) || /\.example/.test(name) || name.endsWith(".sample") || file.startsWith(".agents/");
}

describe("secrets stay out of the repository", () => {
  it("tracks no environment files except examples", () => {
    const envFiles = tracked.filter((file) => {
      const name = path.posix.basename(file);
      return (name === ".env" || name.startsWith(".env.")) && !name.endsWith(".example");
    });
    expect(envFiles).toEqual([]);
  });

  it("has no secret-shaped values in tracked files", () => {
    const hits: string[] = [];
    for (const file of tracked) {
      if (exemptFromSecretScan(file)) continue;
      let content: Buffer;
      try {
        content = fs.readFileSync(path.join(ROOT, file));
      } catch {
        continue; // deleted in the working tree
      }
      if (content.length > 5_000_000 || content.subarray(0, 8000).includes(0)) continue; // huge or binary
      content
        .toString("utf8")
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (SECRET_SHAPES.test(line)) hits.push(`${file}:${index + 1}`);
        });
    }
    expect(hits, "Replace the value with a process.env reference, then rotate the key.").toEqual([]);
  });

  it("keeps .gitignore blocking environment files while allowing .env.example", () => {
    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.env\*\r?$/m);
    expect(gitignore).toMatch(/^\*\.env\*\r?$/m);
    expect(gitignore).toMatch(/^!\.env\.example\r?$/m);
  });

  it("keeps the tracked pre-commit hook refusing environment files and secret-shaped values", () => {
    const hook = fs.readFileSync(path.join(ROOT, ".githooks", "pre-commit"), "utf8");
    expect(hook).toContain("STAGED_ENV_FILES");
    expect(hook).toContain("STAGED_SECRET_DIFF");
    for (const marker of ["AIza", "AQ\\.Ab8", "gsk_", "nvapi-", "fw_", "GOCSPX-"]) {
      expect(hook).toContain(marker);
    }
  });
});
