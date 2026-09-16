/**
 * `npm run issues:sync`: the known issues of the system pages, as GitHub issues.
 *
 * The explanations already hold the real backlog — every problem was found by reading the code — but a page
 * cannot be assigned, discussed or closed, and no agent can pick one up. This turns the serious ones into
 * issues, and keeps doing it: an item that disappears from a page (because it was fixed, and the page was
 * corrected in the same change) closes its issue.
 *
 * Nothing is written by hand on either side. Each issue carries a hidden marker with the system and a
 * fingerprint of the item's text, so running this twice changes nothing, and rewording an item retires the old
 * issue and opens the reworded one. The severity comes from the page itself (`scripts/atlas/emit/state.ts`).
 *
 * Usage:
 *   npm run issues:sync                     what it would do, and why (default: security and bugs)
 *   npm run issues:sync -- --apply          create and close for real; needs GITHUB_TOKEN
 *   npm run issues:sync -- --severity all   every severity, including gaps and debt
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AtlasGraph } from "../atlas/graph";
import { REPO_ROOT } from "../atlas/lib/util";
import { SEVERITIES, collectState, type Severity, type SystemState } from "../atlas/emit/state";

const MARKER = "smartspend:issue";
const LABEL = "agent-ready";
const API = "https://api.github.com";

interface Planned {
  key: string;
  system: SystemState;
  severity: Severity;
  text: string;
  title: string;
  body: string;
}

interface OpenIssue {
  number: number;
  key: string;
  title: string;
}

/** owner/repo from the Actions environment, or from the origin remote when run by hand. */
function repoSlug(): string | null {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: REPO_ROOT, encoding: "utf8" });
    const match = /github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?\s*$/i.exec(url.trim());
    return match ? `${match[1]}/${match[2]}` : null;
  } catch {
    return null;
  }
}

/**
 * The systems and their pages, without building the whole atlas.
 *
 * `collectState` needs the list of systems and nothing else from the graph, and reading the map directly keeps
 * this a two-second command instead of a twenty-second one.
 */
function statesFromMap(): SystemState[] {
  const file = path.join(REPO_ROOT, "docs", "architecture", "systems.json");
  const systems = JSON.parse(fs.readFileSync(file, "utf8")) as AtlasGraph["systems"];
  return collectState({ systems } as AtlasGraph);
}

/** Stable while the text is: rewording an item is a new issue, and the old one closes. */
const keyOf = (systemId: string, text: string) =>
  `${systemId}/${createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 10)}`;

function titleOf(state: SystemState, text: string): string {
  const plain = text.replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const sentence = /^(.*?[.;:])\s/.exec(plain)?.[1] ?? plain;
  const short = sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}...` : sentence;
  return `[${state.id}] ${short.replace(/[.;:]$/, "")}`;
}

function bodyOf(state: SystemState, severity: Severity, text: string, key: string): string {
  return [
    `<!-- ${MARKER} ${key} -->`,
    `**System:** ${state.title} (\`${state.id}\`) · **Severity:** ${severity}`,
    "",
    text,
    "",
    "### Where to start",
    `- How it works, with this item in its "Known issues": \`docs/systems/${state.id}.md\``,
    `- The same without code, in Arabic: \`docs/ar/systems/${state.id}.md\``,
    `- Generated facts and diagrams: \`docs/atlas/systems/${state.id}.md\``,
    "",
    "### Done means",
    "1. The code is fixed and a test fails on the old behaviour.",
    `2. \`npm run agent:finish\` is clean, the page no longer lists this item, and the check is recorded:`,
    `   \`npm run docs:verify -- ${state.id}\` and \`npm run docs:verify -- ${state.id} --ar\`.`,
    "3. `npm run ship`.",
    "",
    "_Opened from `docs/atlas/systems/state.md` by `npm run issues:sync`. Leave the first line alone: it is how",
    "this issue is matched to the page, and how it closes itself when the item is gone._",
  ].join("\n");
}

function plan(states: SystemState[], severities: Set<Severity>): Planned[] {
  const planned: Planned[] = [];
  for (const state of states) {
    for (const issue of state.issues) {
      if (!severities.has(issue.severity)) continue;
      const key = keyOf(state.id, issue.text);
      planned.push({
        key,
        system: state,
        severity: issue.severity,
        text: issue.text,
        title: titleOf(state, issue.text),
        body: bodyOf(state, issue.severity, issue.text, key),
      });
    }
  }
  return planned;
}

async function api(slug: string, route: string, token: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${API}/repos/${slug}/${route}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "smartspend-issues-sync",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${route} -> ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

/** Every open issue this script has opened before, by marker. */
async function openIssues(slug: string, token: string): Promise<OpenIssue[]> {
  const found: OpenIssue[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = (await api(slug, `issues?state=open&labels=${LABEL}&per_page=100&page=${page}`, token)) as Array<{
      number: number;
      title: string;
      body: string | null;
      pull_request?: unknown;
    }>;
    for (const issue of batch) {
      if (issue.pull_request) continue;
      const key = new RegExp(`<!-- ${MARKER} ([^\\s]+) -->`).exec(issue.body ?? "")?.[1];
      if (key) found.push({ number: issue.number, key, title: issue.title });
    }
    if (batch.length < 100) break;
  }
  return found;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const asked = /^--severity=?(.*)$/.exec(args.find((arg) => arg.startsWith("--severity")) ?? "")?.[1];
  const raw = asked || args[args.indexOf("--severity") + 1] || "security,bug";
  const severities = new Set<Severity>(
    raw === "all" ? SEVERITIES : (raw.split(",").map((part) => part.trim()) as Severity[]).filter((part) => SEVERITIES.includes(part)),
  );
  if (severities.size === 0) {
    console.error(`Unknown severity. Use one or more of: ${SEVERITIES.join(", ")}, or "all".`);
    process.exitCode = 1;
    return;
  }

  const states = statesFromMap();
  const planned = plan(states, severities);
  const slug = repoSlug();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

  console.log(`${planned.length} issue(s) of severity ${[...severities].join(", ")} in the system pages.`);

  if (!slug) {
    console.error("No GitHub repository found (no GITHUB_REPOSITORY and no github.com origin).");
    process.exitCode = 1;
    return;
  }
  if (!token) {
    // Without a token the listing cannot be read, so the plan is printed in full instead of a diff.
    console.log(`\nNo GITHUB_TOKEN, so this is the whole list rather than what is missing from ${slug}:\n`);
    for (const item of planned) console.log(`  + ${item.title}`);
    console.log("\nSet GITHUB_TOKEN to compare with the open issues, and add --apply to write.");
    return;
  }

  const existing = await openIssues(slug, token);
  const byKey = new Map(existing.map((issue) => [issue.key, issue]));
  const wanted = new Map(planned.map((item) => [item.key, item]));

  const create = planned.filter((item) => !byKey.has(item.key));
  // An issue whose item is gone from the page: fixed, or reworded into a new one. Only issues this script
  // opened are ever touched, because only those carry the marker.
  const close = existing.filter((issue) => !wanted.has(issue.key));

  console.log(`\nAgainst ${slug}: ${existing.length} open, ${create.length} to create, ${close.length} to close.\n`);
  for (const item of create) console.log(`  + ${item.title}`);
  for (const issue of close) console.log(`  - #${issue.number} ${issue.title}`);

  if (!apply) {
    console.log("\nNothing was written. Add --apply to create and close these.");
    return;
  }

  for (const item of create) {
    const created = await api(slug, "issues", token, {
      method: "POST",
      body: JSON.stringify({
        title: item.title,
        body: item.body,
        labels: [LABEL, `system:${item.system.id}`, `severity:${item.severity}`],
      }),
    });
    console.log(`created #${created.number} ${item.title}`);
  }

  for (const issue of close) {
    await api(slug, `issues/${issue.number}/comments`, token, {
      method: "POST",
      body: JSON.stringify({
        body: "This item is no longer listed in its system page — it was fixed, or reworded into another issue. Closing automatically; reopen if that is wrong.",
      }),
    });
    await api(slug, `issues/${issue.number}`, token, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "completed" }),
    });
    console.log(`closed #${issue.number} ${issue.title}`);
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
