#!/usr/bin/env node
/**
 * `npm run sync`: bring the current branch up to date with origin/main, so every agent builds on the same code.
 * `npm run ship` (--push): sync, then push the branch to main, so the work reaches everyone.
 *
 * Syncing fetches origin and merges origin/main (fast-forward only on main itself). Generated knowledge does
 * not conflict: the merge driver keeps one side and the post-merge hook regenerates it; when the hooks are not
 * installed, this script does that work itself.
 *
 * Shipping refuses uncommitted changes to tracked files, syncs, and pushes HEAD to main, where the pre-push
 * hook checks the knowledge rules first. When main moved in the meantime, it syncs and pushes again.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { gitHooksInstalled, lines, repoRoot, tryGit } from "./lib.mjs";

const ATTEMPTS = 3;

const root = repoRoot();
if (!root) {
  console.error("Not inside a git checkout.");
  process.exit(1);
}

const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
const run = (args) => spawnSync("git", args, { cwd: root, stdio: "inherit", env });
const count = (range) => Number(tryGit(["rev-list", "--count", range], { cwd: root }) ?? "0");

function fetchOrigin() {
  if (run(["fetch", "--quiet", "origin"]).status !== 0) {
    console.error("git fetch origin failed. Check the network and your GitHub credentials, then try again.");
    process.exit(1);
  }
}

/** Merges origin/main into HEAD and returns how many commits arrived; exits when the merge stops. */
function mergeOriginMain() {
  const behind = count("HEAD..origin/main");
  if (behind === 0) return 0;
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root });
  const before = tryGit(["rev-parse", "HEAD"], { cwd: root });
  const incoming = lines(tryGit(["log", "--format=  %h %s", "HEAD..origin/main"], { cwd: root }));
  const fastForward = branch === "main" && count("origin/main..HEAD") === 0;
  const merge = run(fastForward ? ["merge", "--ff-only", "origin/main"] : ["merge", "--no-edit", "origin/main"]);
  if (merge.status !== 0) {
    const conflicts = lines(tryGit(["diff", "--name-only", "--diff-filter=U"], { cwd: root }));
    if (conflicts.length > 0) {
      console.error(
        `\nThe merge stopped on conflicts in:\n${conflicts.map((file) => `  ${file}`).join("\n")}\n` +
          "Resolve them and commit. For files under docs/atlas or docs/architecture/generated, take either side and run npm run atlas. " +
          "Then run npm run agent:finish.",
      );
    } else {
      console.error("\nThe merge did not start. Commit or stash the local changes git names above, then try again.");
    }
    process.exit(1);
  }
  console.log(`\nMerged ${behind} commit(s) from origin/main:\n${incoming.join("\n")}`);

  if (!gitHooksInstalled(root)) {
    // Without the installed post-merge hook, do its work here: regenerate the atlas for the merged code and commit it.
    spawnSync(process.execPath, [path.join(root, "scripts", "agent", "git-hook.mjs"), "post-merge"], { cwd: root, stdio: "inherit", env });
    console.log("Tip: run npm run hooks:install once so merges regenerate the atlas on their own.");
  }
  const changed = lines(tryGit(["diff", "--name-only", before, "HEAD"], { cwd: root }));
  if (changed.some((file) => file === "package.json" || file === "package-lock.json")) {
    console.log("package.json changed on main: run npm ci before you continue.");
  }
  return behind;
}

function sync() {
  fetchOrigin();
  if (mergeOriginMain() === 0) {
    console.log(`Already up to date with origin/main (${count("origin/main..HEAD")} local commit(s) not on main).`);
  }
  console.log("Next: continue your task. When it is done: npm run agent:finish, commit, then npm run ship.");
}

function ship() {
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root });
  if (!branch || branch === "HEAD") {
    console.error("Shipping needs a branch, and HEAD is detached. Create a branch for the work, then run npm run ship.");
    process.exit(1);
  }
  const uncommitted = lines(tryGit(["status", "--porcelain=v1", "--untracked-files=no"], { cwd: root }));
  if (uncommitted.length > 0) {
    console.error(`${uncommitted.length} tracked file(s) have uncommitted changes. Run npm run agent:finish, commit, then npm run ship.`);
    process.exit(1);
  }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    fetchOrigin();
    mergeOriginMain();
    if (count("origin/main..HEAD") === 0) {
      console.log("Nothing to ship: main already has every commit of this branch.");
      return;
    }
    if (run(["push", "origin", "HEAD:main"]).status === 0) {
      console.log(`\nShipped: main is now ${tryGit(["rev-parse", "--short", "HEAD"], { cwd: root })}.`);
      return;
    }
    fetchOrigin();
    if (count("HEAD..origin/main") === 0) {
      console.error("\nThe push was refused, and not because main moved: read the message above, fix it, and run npm run ship again.");
      process.exit(1);
    }
    if (attempt < ATTEMPTS) console.log(`\nmain moved while shipping; merging it and pushing again (attempt ${attempt + 1}).`);
  }
  console.error("main kept moving while shipping; run npm run ship again in a moment.");
  process.exit(1);
}

if (process.argv.includes("--push")) ship();
else sync();
