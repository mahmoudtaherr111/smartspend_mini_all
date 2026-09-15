#!/usr/bin/env node
/**
 * SessionStart hook for Claude Code (.claude/settings.json) and Codex (.codex/hooks.json).
 *
 * Before an agent starts, it learns whether its branch is behind origin/main, which changes on main it does
 * not have, and the steps every tool follows here. The hook also installs the shared git hooks when they are
 * missing. It never blocks a session.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { lines, readStdin, repoRoot, tryGit } from "./lib.mjs";

function installGitHooks(root) {
  const installer = path.join(root, "scripts", "agent", "install-git-hooks.cjs");
  if (fs.existsSync(installer)) {
    spawnSync(process.execPath, [installer, "--quiet"], { cwd: root, timeout: 15_000, stdio: "ignore" });
  }
}

async function main() {
  const input = JSON.parse((await readStdin()) || "{}");
  const root = repoRoot(input.cwd || process.cwd());
  if (!root) return;

  installGitHooks(root);
  if (process.env.SMARTSPEND_NO_FETCH !== "1") {
    spawnSync("git", ["fetch", "--quiet", "origin", "main"], {
      cwd: root,
      timeout: 10_000,
      stdio: "ignore",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    });
  }

  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root }) ?? "unknown";
  const counts = tryGit(["rev-list", "--left-right", "--count", "HEAD...origin/main"], { cwd: root });
  const [ahead, behind] = counts ? counts.split(/\s+/).map(Number) : [0, 0];
  const uncommitted = lines(tryGit(["status", "--porcelain=v1"], { cwd: root })).length;

  const report = ["SmartSpend session check (automatic, scripts/agent/session-start.mjs):"];
  if (!counts) {
    report.push(`- Branch ${branch}: origin/main is not available here, so the sync status is unknown.`);
  } else if (behind > 0) {
    report.push(
      `- Branch ${branch} is ${behind} commit(s) behind origin/main and ${ahead} ahead. ` +
        "Run `npm run sync` before editing, so you build on the latest main.",
    );
  } else {
    report.push(`- Branch ${branch} contains origin/main; ${ahead} local commit(s) are not on main yet.`);
  }
  if (uncommitted > 0) report.push(`- ${uncommitted} uncommitted change(s) here. Commit finished work in small steps.`);
  report.push(
    "- Read AGENTS.md and the AGENTS.md of each folder you edit (api/, api/lib/, src/, db/); not every tool loads them on its own.",
    "- Before reporting a task done: `npm run agent:finish`, commit the code with the regenerated files, then `npm run ship` (merges origin/main and pushes to main).",
  );

  if (behind > 0) {
    const recent = lines(
      tryGit(["log", "-n", "8", "--format=%h %s [%(trailers:key=Agent,valueonly,separator=%x2C)]", "HEAD..origin/main"], {
        cwd: root,
      }),
    ).map((line) => `  ${line.replace(/ \[\]$/, "")}`);
    if (recent.length > 0) report.push("Changes on main you do not have yet:", ...recent);
  }

  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: report.join("\n") } })}\n`,
  );
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
