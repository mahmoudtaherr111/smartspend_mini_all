#!/usr/bin/env node
/**
 * `npm run who`: who else is changing this repository right now, derived from git alone.
 *
 * Several agents work at the same time, and the one thing none of them could see was each other: two sessions
 * can spend an hour in the same file and only meet in a merge. Asking them to announce their work would add a
 * protocol that the tool which forgets it breaks, so nothing here is announced. The facts are already in git:
 *
 *   - every worktree on this machine, its branch, and the files it has changed but not committed;
 *   - every branch pushed to origin that is ahead of main, with the files it changes.
 *
 * Each file is mapped to its systems through docs/atlas/systems/files.md, so the report says which parts of the
 * product are being worked on, not just which paths. Run from a worktree with its own changes, it also names the
 * files both sides touch — the collision, before it happens.
 *
 * Plain Node with no dependencies: the session hook calls it in worktrees where node_modules may be missing.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const DEFAULT_BRANCH = "origin/main";
/** A branch nobody has pushed to for this long is history, not work in progress. */
const BRANCH_ACTIVE_DAYS = 7;
/** Reading a worktree must never hold a session hook. */
const CALL_TIMEOUT_MS = 4_000;

async function git(args, cwd) {
  try {
    const { stdout } = await run("git", args, {
      cwd,
      timeout: CALL_TIMEOUT_MS,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    });
    return stdout;
  } catch {
    return null;
  }
}

const splitLines = (text) => (text ?? "").split(/\r?\n/);
const lines = (text) => splitLines(text).map((line) => line.trim()).filter(Boolean);

/**
 * Path as git reports it, relative to the repository root and with forward slashes.
 *
 * The status field is two columns and a space, so these lines must not be trimmed first: a leading space is
 * data, and trimming it shifts every path by one character.
 */
function statusPaths(status) {
  return splitLines(status)
    .filter((line) => line.length > 3)
    .map((line) => {
      const raw = line.slice(3);
      const renamed = raw.split(" -> ");
      return (renamed[renamed.length - 1] ?? raw).replace(/^"|"$/g, "");
    });
}

/** Which systems own each file, from the generated map; unknown files simply have none. */
export function systemsByFile(root) {
  const file = path.join(root, "docs", "atlas", "systems", "files.md");
  const map = new Map();
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return map;
  }
  for (const line of splitLines(text)) {
    const row = /^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (!row) continue;
    const ids = [...row[2].matchAll(/\[([a-z0-9-]+)\]\(\1\.md\)/g)].map((match) => match[1]);
    if (ids.length > 0) map.set(row[1], [...new Set(ids)]);
  }
  return map;
}

function systemsOf(files, map) {
  const ids = new Set();
  for (const file of files) for (const id of map.get(file) ?? []) ids.add(id);
  return [...ids].sort();
}

async function readWorktrees(root) {
  const text = await git(["worktree", "list", "--porcelain"], root);
  const entries = [];
  let current = null;
  for (const line of splitLines(text)) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length).trim(), branch: null };
      entries.push(current);
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice("branch ".length).trim().replace("refs/heads/", "");
    } else if (line.startsWith("detached") && current) {
      current.branch = "(detached)";
    }
  }
  return entries;
}

async function describeWorktree(entry, root, map, here) {
  const [status, counts] = await Promise.all([
    git(["status", "--porcelain=v1", "--untracked-files=no"], entry.path),
    git(["rev-list", "--left-right", "--count", `HEAD...${DEFAULT_BRANCH}`], entry.path),
  ]);
  const files = statusPaths(status);
  const [ahead, behind] = counts ? counts.trim().split(/\s+/).map(Number) : [0, 0];
  return {
    kind: "worktree",
    here: path.resolve(entry.path) === path.resolve(root),
    label: path.basename(entry.path),
    location: entry.path,
    branch: entry.branch ?? "(unknown)",
    ahead,
    behind,
    files,
    systems: systemsOf(files, map),
    shared: files.filter((file) => here.has(file)),
  };
}

async function readBranches(root, map, here, days) {
  const text = await git(
    ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/remotes/origin"],
    root,
  );
  const cutoff = Date.now() / 1000 - days * 86_400;
  const candidates = lines(text)
    .map((line) => {
      const [name, when] = line.split("\t");
      return { name, when: Number(when) };
    })
    .filter(
      (branch) => branch.name && branch.when >= cutoff && branch.name !== DEFAULT_BRANCH && !branch.name.endsWith("/HEAD"),
    );

  const described = await Promise.all(
    candidates.map(async (branch) => {
      const ahead = await git(["rev-list", "--count", `${DEFAULT_BRANCH}..${branch.name}`], root);
      if (!ahead || Number(ahead.trim()) === 0) return null;
      const [names, last] = await Promise.all([
        git(["diff", "--name-only", `${DEFAULT_BRANCH}...${branch.name}`], root),
        git(["log", "-1", "--format=%s%09%(trailers:key=Agent,valueonly,separator=%x2C)", branch.name], root),
      ]);
      const files = lines(names);
      const [subject, agent] = (last ?? "").split("\t");
      return {
        kind: "branch",
        label: branch.name,
        branch: branch.name,
        ahead: Number(ahead.trim()),
        when: branch.when,
        subject: (subject ?? "").trim(),
        agent: (agent ?? "").trim(),
        files,
        systems: systemsOf(files, map),
        shared: files.filter((file) => here.has(file)),
      };
    }),
  );
  return described.filter(Boolean);
}

/**
 * Everything git knows about work in flight.
 *
 * The files this worktree has changed are what make an overlap detectable rather than merely possible.
 */
export async function activeWork(root, { days = BRANCH_ACTIVE_DAYS } = {}) {
  const map = systemsByFile(root);
  const mine = statusPaths(await git(["status", "--porcelain=v1", "--untracked-files=no"], root));
  const here = new Set(mine);
  const worktrees = await readWorktrees(root);
  const [described, branches] = await Promise.all([
    Promise.all(worktrees.map((entry) => describeWorktree(entry, root, map, here))),
    readBranches(root, map, here, days),
  ]);
  const others = described.filter((entry) => !entry.here && entry.files.length > 0);
  return {
    mine: { files: mine, systems: systemsOf(mine, map) },
    worktrees: others.sort((a, b) => b.files.length - a.files.length),
    branches: branches.sort((a, b) => b.when - a.when),
  };
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

function describe(entry) {
  const systems = entry.systems.length > 0 ? ` in ${entry.systems.join(", ")}` : "";
  if (entry.kind === "worktree") {
    const behind = entry.behind > 0 ? `, ${entry.behind} behind main` : "";
    return `worktree ${entry.label} (${entry.branch}${behind}): ${plural(entry.files.length, "uncommitted file")}${systems}`;
  }
  const hours = Math.max(0, Math.round((Date.now() / 1000 - entry.when) / 3600));
  const when = hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
  const who = entry.agent ? ` by ${entry.agent}` : "";
  return `branch ${entry.label} (${plural(entry.ahead, "commit")} ahead, pushed ${when}${who}): ${plural(entry.files.length, "file")}${systems}`;
}

/** The short form for a session hook: overlaps first, and never more than `limit` lines. */
export function summarize(work, limit = 6) {
  const all = [...work.worktrees, ...work.branches];
  if (all.length === 0) return [];
  const ordered = [
    ...all.filter((entry) => entry.shared.length > 0),
    ...all.filter((entry) => entry.shared.length === 0),
  ];
  const report = ordered.slice(0, limit).map((entry) => {
    const overlap =
      entry.shared.length > 0
        ? ` <- also changed here: ${entry.shared.slice(0, 3).join(", ")}${entry.shared.length > 3 ? ", ..." : ""}`
        : "";
    return `  ${describe(entry)}${overlap}`;
  });
  if (ordered.length > limit) report.push(`  ... and ${ordered.length - limit} more; run npm run who`);
  return report;
}

async function main() {
  const root = (await git(["rev-parse", "--show-toplevel"], process.cwd()))?.trim();
  if (!root) {
    console.error("Not a git repository.");
    process.exitCode = 1;
    return;
  }
  const work = await activeWork(root);
  console.log("Work in flight, as git sees it (nobody has to announce anything):\n");
  console.log(
    work.mine.files.length > 0
      ? `Here: ${plural(work.mine.files.length, "uncommitted file")}${work.mine.systems.length > 0 ? ` in ${work.mine.systems.join(", ")}` : ""}`
      : "Here: nothing uncommitted.",
  );
  const sections = [
    ["Other worktrees with uncommitted work", work.worktrees],
    [`Branches pushed in the last ${BRANCH_ACTIVE_DAYS} days that are ahead of main`, work.branches],
  ];
  for (const [title, entries] of sections) {
    console.log(`\n${title}:`);
    if (entries.length === 0) {
      console.log("  none");
      continue;
    }
    for (const entry of entries) {
      console.log(`- ${describe(entry)}`);
      if (entry.shared.length > 0) console.log(`    shared with your changes: ${entry.shared.join(", ")}`);
    }
  }
  const clashes = [...work.worktrees, ...work.branches].filter((entry) => entry.shared.length > 0);
  console.log(
    clashes.length > 0
      ? `\n${plural(clashes.length, "other piece")} of work touches files you have changed. Ship early, or agree who takes the file.`
      : "\nNo one else has touched the files you changed.",
  );
}

if (/who\.mjs$/.test(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
