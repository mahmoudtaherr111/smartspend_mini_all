#!/usr/bin/env node
/**
 * Installs the shared git hooks from .githooks/ into the repository's common hooks folder, so every worktree
 * and every tool that commits (Claude Code, Codex, Antigravity, Cursor, OpenCode, people) runs them, and
 * registers the merge driver that lets generated files merge without conflicts.
 *
 * Runs from `npm run hooks:install`, from `npm install` and `npm ci` (package.json "prepare"), and from the
 * agent SessionStart hook. It skips CI and folders that are not git checkouts. CommonJS, so "prepare" can
 * load it before any dependency is installed.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MARKER = "smartspend-managed-hook";
const quiet = process.argv.includes("--quiet");

function log(message) {
  if (!quiet) console.log(message);
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function main() {
  if (process.env.CI) {
    log("[hooks] CI detected; git hooks are not installed there.");
    return;
  }
  let root;
  try {
    root = git(["rev-parse", "--show-toplevel"], process.cwd());
  } catch {
    return;
  }
  const source = path.join(root, ".githooks");
  if (!fs.existsSync(source)) return;

  let customHooksPath = "";
  try {
    customHooksPath = git(["config", "--get", "core.hooksPath"], root);
  } catch {
    // Not set: git uses the hooks folder of the common git directory.
  }
  if (customHooksPath) {
    log(`[hooks] core.hooksPath is set to ${customHooksPath}; git will not run hooks installed here.`);
  }

  const hooksDir = path.join(path.resolve(root, git(["rev-parse", "--git-common-dir"], root)), "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  let installed = 0;
  for (const name of fs.readdirSync(source)) {
    const content = fs.readFileSync(path.join(source, name), "utf8").replace(/\r\n/g, "\n");
    const target = path.join(hooksDir, name);
    if (fs.existsSync(target)) {
      const current = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
      if (current === content) continue;
      const backup = `${target}.pre-smartspend`;
      if (!current.includes(MARKER) && !fs.existsSync(backup)) fs.copyFileSync(target, backup);
    }
    fs.writeFileSync(target, content, { mode: 0o755 });
    try {
      fs.chmodSync(target, 0o755);
    } catch {
      // Windows keeps no execute bit; Git for Windows runs the hook anyway.
    }
    installed += 1;
  }

  git(["config", "merge.smartspend-generated.name", "generated knowledge: keep one side, the post-merge hook regenerates it"], root);
  git(["config", "merge.smartspend-generated.driver", "true"], root);
  log(installed > 0 ? `[hooks] Installed ${installed} git hook(s) into ${hooksDir}.` : "[hooks] Git hooks are up to date.");
}

try {
  main();
} catch (error) {
  if (!quiet) console.warn(`[hooks] Could not install the git hooks: ${error.message}`);
}
