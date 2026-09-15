#!/usr/bin/env node
/**
 * The logic behind the shared git hooks in .githooks/. Every agent tool and every person changes this
 * repository through git, so this is where generated knowledge and change history stay right no matter
 * who made the change.
 *
 *   pre-commit           regenerate the atlas into the commit when staged code changes it
 *   prepare-commit-msg   add an `Agent:` trailer naming the tool that made the commit
 *   post-merge           after a merge or pull, regenerate the atlas and commit it when it changed
 *   post-rewrite         the same after a rebase
 *   pre-push             refuse a push while a knowledge rule is broken (SMARTSPEND_SKIP_PREPUSH=1 skips it)
 *
 * Only pre-push can stop git. The other hooks report a problem and let the commit or merge go on.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { GENERATED_PATHS, git, lines, repoRoot, runTsx, stateDir, statusPath, tryGit, tsxAvailable } from "./lib.mjs";

/** Files whose change can change the generated atlas. */
const ATLAS_INPUT = /^(api|src|db|contracts)\/|^docs\/architecture\/(clusters|externals)\.json$|^scripts\/atlas\//;
/** Folder notes such as db/AGENTS.md sit beside the code but never change the atlas. */
const isAtlasInput = (name) => ATLAS_INPUT.test(name) && !name.endsWith(".md");
const isGenerated = (name) => GENERATED_PATHS.some((dir) => name.startsWith(`${dir}/`));

const root = repoRoot();
const [command, ...args] = process.argv.slice(2);

function canRegenerate() {
  return Boolean(root) && fs.existsSync(path.join(root, "scripts", "atlas", "index.ts")) && tsxAvailable(root);
}

function regenerate() {
  return runTsx(root, "scripts/atlas/index.ts", [], { timeout: 300_000 }).status === 0;
}

function generatedChanged() {
  return lines(tryGit(["status", "--porcelain=v1", "-uall", "--", ...GENERATED_PATHS], { cwd: root })).length > 0;
}

/** Code files whose working copy differs from HEAD: staged, unstaged or untracked. */
function uncommittedInputs() {
  return lines(tryGit(["status", "--porcelain=v1", "-uall"], { cwd: root }))
    .map(statusPath)
    .filter((file) => isAtlasInput(file));
}

function preCommit() {
  if (process.env.SMARTSPEND_SKIP_ATLAS === "1" || !canRegenerate()) return 0;
  const staged = lines(tryGit(["diff", "--cached", "--name-only", "--diff-filter=ACMRD"], { cwd: root }));
  if (!staged.some((file) => isAtlasInput(file))) return 0;

  const notStaged = [
    ...lines(tryGit(["diff", "--name-only"], { cwd: root })),
    ...lines(tryGit(["ls-files", "--others", "--exclude-standard"], { cwd: root })),
  ].filter((file) => isAtlasInput(file));
  if (notStaged.length > 0) {
    console.log(
      `[atlas] Not regenerated: ${notStaged.length} code file(s) have changes outside this commit (first: ${notStaged[0]}), ` +
        "so the atlas would describe code the commit does not contain. Stage them, or run npm run atlas yourself.",
    );
    return 0;
  }
  if (!regenerate()) {
    console.log("[atlas] Could not regenerate the atlas; committing without it. Run npm run atlas to see why.");
    return 0;
  }
  if (generatedChanged()) {
    git(["add", "--", ...GENERATED_PATHS], { cwd: root });
    console.log("[atlas] Regenerated docs/atlas and docs/architecture/generated into this commit.");
  }
  return 0;
}

/** The tool that is making the commit, when it can be told from the environment, branch or worktree. */
function detectAgent() {
  if (process.env.SMARTSPEND_AGENT) return process.env.SMARTSPEND_AGENT;
  if (process.env.CLAUDECODE) return "claude-code";
  if (process.env.CODEX_SANDBOX || process.env.CODEX_SANDBOX_NETWORK_DISABLED) return "codex";
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root }) ?? "";
  const byBranch = [
    ["codex/", "codex"],
    ["claude/", "claude-code"],
    ["cursor/", "cursor"],
    ["opencode/", "opencode"],
  ].find(([prefix]) => branch.startsWith(prefix));
  if (byBranch) return byBranch[1];
  const top = (root ?? "").replace(/\\/g, "/").toLowerCase();
  if (top.includes("/antigravity/")) return "antigravity";
  if (top.includes("/opencode/")) return "opencode";
  if (top.includes("/.cursor/")) return "cursor";
  if (top.includes("/.claude/worktrees/")) return "claude-code";
  return null;
}

function prepareCommitMsg([messageFile]) {
  if (!messageFile) return 0;
  if (/^Agent:/im.test(fs.readFileSync(messageFile, "utf8"))) return 0;
  const agent = detectAgent();
  if (!agent) return 0;
  spawnSync("git", ["interpret-trailers", "--in-place", "--if-exists", "doNothing", "--trailer", `Agent: ${agent}`, messageFile], {
    cwd: root,
    stdio: "ignore",
  });
  return 0;
}

/**
 * Commits the regenerated atlas on top of HEAD and leaves the rest of the index alone. Plumbing, because
 * post-merge runs while MERGE_HEAD still exists, and there `git commit` refuses a commit of chosen paths.
 */
function commitGenerated(message) {
  const head = git(["rev-parse", "HEAD"], { cwd: root });
  const indexFile = path.join(stateDir(root), "atlas-index");
  const withIndex = { cwd: root, env: { ...process.env, GIT_INDEX_FILE: indexFile } };
  try {
    git(["read-tree", head], withIndex);
    git(["add", "--", ...GENERATED_PATHS], withIndex);
    const tree = git(["write-tree"], withIndex);
    if (tree === git(["rev-parse", `${head}^{tree}`], { cwd: root })) return false;
    const commit = git(["commit-tree", tree, "-p", head, "-m", message, "-m", "Agent: git-hook"], { cwd: root });
    git(["update-ref", "-m", message, "HEAD", commit, head], { cwd: root });
  } finally {
    fs.rmSync(indexFile, { force: true });
  }
  git(["add", "--", ...GENERATED_PATHS], { cwd: root });
  return true;
}

function afterHistoryChange(event) {
  if (process.env.SMARTSPEND_SKIP_ATLAS === "1" || !canRegenerate()) return 0;
  // Generated files count as well: the merge driver keeps one side of them, which leaves them stale even
  // when the merged code is the same as before.
  const diff = tryGit(["diff", "--name-only", "ORIG_HEAD", "HEAD"], { cwd: root });
  if (diff !== null && !lines(diff).some((file) => isAtlasInput(file) || isGenerated(file))) return 0;
  const uncommitted = uncommittedInputs();
  if (uncommitted.length > 0) {
    console.log(
      `[atlas] Not regenerated after the ${event}: ${uncommitted.length} code file(s) have uncommitted changes (first: ${uncommitted[0]}). ` +
        "The pre-commit hook regenerates it with your next commit, or run npm run atlas.",
    );
    return 0;
  }
  if (!regenerate()) {
    console.log(`[atlas] Could not regenerate the atlas after the ${event}. Run npm run atlas.`);
    return 0;
  }
  if (generatedChanged() && commitGenerated(`chore(atlas): regenerate after ${event}`)) {
    console.log(`[atlas] Regenerated the atlas for the code after the ${event} and committed it.`);
  }
  return 0;
}

function prePush() {
  if (process.env.SMARTSPEND_SKIP_PREPUSH === "1") return 0;
  if (!root || !fs.existsSync(path.join(root, "scripts", "agent", "finish.ts")) || !tsxAvailable(root)) return 0;
  const uncommitted = lines(tryGit(["status", "--porcelain=v1"], { cwd: root })).filter((line) => {
    const file = statusPath(line);
    return isAtlasInput(file) || file.startsWith("docs/architecture/");
  });
  if (uncommitted.length > 0) {
    console.log("[knowledge] Uncommitted code or model changes: the check reads the files on disk, which may differ from what you push.");
  }
  const run = runTsx(root, "scripts/agent/finish.ts", ["--check"], { timeout: 300_000 });
  if (run.status === 0) return 0;
  if (run.status === 1) {
    process.stdout.write(run.stdout);
    console.log(
      "\n[knowledge] Push refused: fix the rules above (npm run agent:finish), commit, and push again." +
        "\nA person can skip this check for one push with SMARTSPEND_SKIP_PREPUSH=1.",
    );
    return 1;
  }
  console.log("[knowledge] The knowledge check could not run, so the push goes ahead. Run npm run agent:finish to see why.");
  return 0;
}

const handlers = {
  "pre-commit": preCommit,
  "prepare-commit-msg": () => prepareCommitMsg(args),
  "post-merge": () => afterHistoryChange("merge"),
  "post-rewrite": () => (args[0] === "rebase" ? afterHistoryChange("rebase") : 0),
  "pre-push": prePush,
};

let exitCode = 0;
try {
  exitCode = handlers[command]?.() ?? 0;
} catch (error) {
  console.log(`[hooks] ${command} skipped: ${error.message}`);
}
process.exit(exitCode);
