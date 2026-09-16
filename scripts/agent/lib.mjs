/**
 * Git helpers shared by the agent hooks, the git hooks and `npm run sync`. Plain Node with no dependencies,
 * because hooks run in worktrees where node_modules may be missing.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Paths whose changes can change the generated atlas or the result of a knowledge rule. */
export const KNOWLEDGE_INPUTS = [
  "api",
  "src",
  "db",
  "contracts",
  "scripts/atlas",
  "scripts/knowledge",
  "docs/architecture",
  "docs/ar",
  "docs/guides",
  "docs/decisions",
  "docs/systems",
  "docs/README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "android-app/README.md",
  ".agents/rules",
  ".opencode/opencode.json",
  "package.json",
];

/** Folders written by `npm run atlas`. */
export const GENERATED_PATHS = ["docs/atlas", "docs/architecture/generated"];

const NON_INTERACTIVE = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };

export function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: NON_INTERACTIVE,
    ...options,
  }).trim();
}

export function tryGit(args, options = {}) {
  try {
    return git(args, options);
  } catch {
    return null;
  }
}

export function lines(text) {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

/** The path in a `git status --porcelain=v1` line (the new path of a rename). */
export function statusPath(line) {
  return line.slice(3).split(" -> ").pop().replace(/^"|"$/g, "");
}

export function repoRoot(cwd = process.cwd()) {
  return tryGit(["rev-parse", "--show-toplevel"], { cwd });
}

/** A per-worktree folder inside the git directory for hook state; never committed. */
export function stateDir(root) {
  const dir = path.resolve(root, git(["rev-parse", "--git-path", "smartspend-agent"], { cwd: root }));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export function tsxAvailable(root) {
  return fs.existsSync(path.join(root, "node_modules", "tsx", "dist", "cli.mjs"));
}

/** Runs a TypeScript script with the repository's own tsx. */
export function runTsx(root, script, args = [], options = {}) {
  return spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), script, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

/** Whether the shared git hooks from .githooks/ are installed in this repository. */
export function gitHooksInstalled(root) {
  const commonDir = tryGit(["rev-parse", "--git-common-dir"], { cwd: root });
  if (!commonDir) return false;
  const hook = path.join(path.resolve(root, commonDir), "hooks", "post-merge");
  return fs.existsSync(hook) && fs.readFileSync(hook, "utf8").includes("smartspend-managed-hook");
}

/**
 * A cheap fingerprint of the knowledge inputs: HEAD plus the status, size and modification time of every
 * changed input file. Generated files are left out, so regenerating the atlas does not change it.
 */
export function inputsFingerprint(root) {
  const parts = [tryGit(["rev-parse", "HEAD"], { cwd: root }) ?? ""];
  for (const line of lines(tryGit(["status", "--porcelain=v1", "-uall", "--", ...KNOWLEDGE_INPUTS], { cwd: root }))) {
    const file = statusPath(line);
    if (GENERATED_PATHS.some((dir) => file.startsWith(`${dir}/`))) continue;
    let stamp = "missing";
    try {
      const stat = fs.statSync(path.join(root, file));
      stamp = `${stat.size}:${Math.round(stat.mtimeMs)}`;
    } catch {
      // Deleted files keep the "missing" stamp.
    }
    parts.push(`${line.slice(0, 2)} ${file} ${stamp}`);
  }
  return createHash("sha1").update(parts.join("\n")).digest("hex");
}
