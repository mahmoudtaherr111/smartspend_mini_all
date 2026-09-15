#!/usr/bin/env node
/**
 * `npm run sync`: bring the current branch up to date with origin/main, so every agent builds on the same
 * code.
 *
 * Fetches origin and merges origin/main (fast-forward only on main itself). Generated knowledge does not
 * conflict: the merge driver keeps one side and the post-merge hook regenerates it; when the hooks are not
 * installed, this script regenerates and commits it itself. It ends by saying what arrived and what to do
 * next.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { gitHooksInstalled, lines, repoRoot, tryGit } from "./lib.mjs";

const root = repoRoot();
if (!root) {
  console.error("Not inside a git checkout.");
  process.exit(1);
}

const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
const run = (args) => spawnSync("git", args, { cwd: root, stdio: "inherit", env });

if (run(["fetch", "origin"]).status !== 0) {
  console.error("git fetch origin failed. Check the network and your GitHub credentials, then run npm run sync again.");
  process.exit(1);
}

const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root });
const before = tryGit(["rev-parse", "HEAD"], { cwd: root });
const behind = Number(tryGit(["rev-list", "--count", "HEAD..origin/main"], { cwd: root }) ?? "0");
const ahead = Number(tryGit(["rev-list", "--count", "origin/main..HEAD"], { cwd: root }) ?? "0");

if (behind === 0) {
  console.log(`${branch} already contains origin/main (${ahead} local commit(s) not on main).`);
  console.log(ahead > 0 ? "Next: npm run agent:finish, then push." : "Nothing to do.");
  process.exit(0);
}

const incoming = lines(tryGit(["log", "--format=  %h %s", "HEAD..origin/main"], { cwd: root }));
const merge = branch === "main" && ahead === 0 ? run(["merge", "--ff-only", "origin/main"]) : run(["merge", "--no-edit", "origin/main"]);
if (merge.status !== 0) {
  const conflicts = lines(tryGit(["diff", "--name-only", "--diff-filter=U"], { cwd: root }));
  if (conflicts.length > 0) {
    console.error(
      `\nThe merge stopped on conflicts in:\n${conflicts.map((file) => `  ${file}`).join("\n")}\n` +
        "Resolve them and commit. For files under docs/atlas or docs/architecture/generated, take either side and run npm run atlas. " +
        "Then run npm run agent:finish.",
    );
  } else {
    console.error("\nThe merge did not start. Commit or stash the local changes git names above, then run npm run sync again.");
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
console.log("Next: continue your task. Before you push, run npm run agent:finish.");
