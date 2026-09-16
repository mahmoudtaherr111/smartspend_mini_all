/**
 * Rules that keep each system's explanation true to its code.
 *
 * Every system of docs/architecture/systems.json has an explanation for engineers and agents, docs/systems/<id>.md,
 * and the same story for people who do not read code, docs/ar/systems/<id>.md. docs/systems/verified.json records
 * what each page was last checked against: the English page, the fingerprint of every unit of source it describes
 * (SystemFacts.coverage); the Arabic page, the fingerprint of the English page. When one of those changes, the
 * page has to be read again against the change and the check recorded with `npm run docs:verify`, so an
 * explanation cannot outlive its code unnoticed.
 *
 * A branch answers for its own changes. Given the files that differ from a baseline (origin/main), a page left
 * unchecked by code the branch did not touch is reported as a notice instead of a violation.
 *
 * Shared by tests/knowledge/systems.test.ts, `npm run agent:finish` and `npm run docs:verify`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AtlasGraph } from "../atlas/graph";
import { SYSTEMS_FILE, type CoverageUnit } from "../atlas/extract/systems";
import { REPO_ROOT } from "../atlas/lib/util";
import { LEDGER_FILE, parseLedger } from "../agent/verified-ledger.mjs";
import type { RuleResult } from "./types";

export { LEDGER_FILE };
export const narrativePath = (id: string): string => `docs/systems/${id}.md`;
export const plainPath = (id: string): string => `docs/ar/systems/${id}.md`;
/** Both indexes link every system's page. */
export const SYSTEM_INDEXES = ["docs/systems/README.md", "docs/ar/systems/README.md"];
const CLUSTERS_FILE = "docs/architecture/clusters.json";

export interface LedgerEntry {
  /** Fingerprint of every unit of source the English page was last checked against. */
  files: Record<string, string>;
  /** Fingerprint of the English page the Arabic page was last brought in line with. */
  arabic?: string;
}

export interface Ledger {
  systems: Record<string, LedgerEntry>;
}

export interface SystemDocsOptions {
  /** Files that differ from the baseline branch, committed or not. Without it every problem is a violation. */
  changedSinceBaseline?: Set<string>;
}

export function fingerprint(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex").slice(0, 12);
}

export function readText(root: string, file: string): string | null {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n") : null;
}

/** Throws when the record is not JSON, for example after a merge left conflict markers in it. */
export function readLedger(root = REPO_ROOT): Ledger {
  const text = readText(root, LEDGER_FILE);
  return text === null ? { systems: {} } : (parseLedger(text) as Ledger);
}

/** The fingerprint of each unit of source, reading every file once. Trailing spaces do not count. */
export function coverageFingerprints(root: string, units: CoverageUnit[]): Record<string, string> {
  const cache = new Map<string, string[] | null>();
  const linesOf = (file: string) => {
    if (!cache.has(file)) cache.set(file, readText(root, file)?.split("\n") ?? null);
    return cache.get(file)!;
  };
  return Object.fromEntries(
    units.map((unit) => {
      const lines = linesOf(unit.file);
      if (lines === null) return [unit.id, "missing"];
      const kept = unit.lines
        ? lines.slice(unit.lines[0] - 1, unit.lines[1])
        : unit.cut
          ? lines.filter((_, index) => !unit.cut!.some(([start, end]) => index + 1 >= start && index + 1 <= end))
          : lines;
      return [unit.id, fingerprint(kept.map((line) => line.trimEnd()).join("\n"))];
    }),
  );
}

/** Files that differ between `baseline` and the working tree, untracked ones included; null without the baseline. */
export function filesChangedSince(baseline: string, root = REPO_ROOT): Set<string> | null {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  try {
    git(["rev-parse", "--verify", "--quiet", `${baseline}^{commit}`]);
    const names = [...git(["diff", "--name-only", baseline]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard"]).split("\n")];
    return new Set(names.map((name) => name.trim()).filter(Boolean));
  } catch {
    return null;
  }
}

interface Findings {
  violations: string[];
  notices: string[];
}

export function checkSystemDocs(graph: AtlasGraph, root = REPO_ROOT, options: SystemDocsOptions = {}): RuleResult[] {
  const changed = options.changedSinceBaseline;
  const touched = (...files: string[]) => !changed || files.some((file) => changed.has(file));
  const membershipTouched = touched(SYSTEMS_FILE, CLUSTERS_FILE);
  const exist: Findings = { violations: [], notices: [] };
  const checked: Findings = { violations: [], notices: [] };
  const plain: Findings = { violations: [], notices: [] };
  const report = (findings: Findings, ours: boolean, message: string) =>
    (ours ? findings.violations : findings.notices).push(message);

  let ledger: Ledger | null = null;
  try {
    ledger = readLedger(root);
  } catch (error) {
    checked.violations.push(
      `${LEDGER_FILE} is not valid JSON (${(error as Error).message}). After a merge conflict, take either side of the file and run npm run agent:finish again.`,
    );
  }

  const indexes = SYSTEM_INDEXES.map((file) => ({ file, text: readText(root, file) }));
  for (const { file, text } of indexes) {
    if (text === null) report(exist, touched(file) || membershipTouched, `${file} is missing`);
  }

  for (const system of graph.systems.systems) {
    const english = readText(root, narrativePath(system.id));
    const arabic = readText(root, plainPath(system.id));
    if (english === null) report(exist, touched(narrativePath(system.id)) || membershipTouched, `${narrativePath(system.id)} is missing`);
    if (arabic === null) report(exist, touched(plainPath(system.id)) || membershipTouched, `${plainPath(system.id)} is missing`);
    for (const { file, text } of indexes) {
      if (text !== null && !text.includes(`(${system.id}.md)`)) {
        report(exist, touched(file) || membershipTouched, `${file} has no link to ${system.id}.md`);
      }
    }
    if (english === null || ledger === null) continue;

    const recorded = ledger.systems[system.id]?.files ?? {};
    const current = coverageFingerprints(root, system.coverage);
    const fileOf = (id: string) => id.split("#")[0];
    const changes: Array<{ text: string; ours: boolean }> = [];
    for (const [id, hash] of Object.entries(current)) {
      if (!(id in recorded)) changes.push({ text: `new ${id}`, ours: touched(fileOf(id)) || membershipTouched });
      else if (recorded[id] !== hash) changes.push({ text: `changed ${id}`, ours: touched(fileOf(id)) });
    }
    for (const id of Object.keys(recorded)) {
      if (!(id in current)) changes.push({ text: `gone ${id}`, ours: touched(fileOf(id)) || membershipTouched });
    }
    if (changes.length > 0) {
      const listed = [...changes.filter((change) => change.ours), ...changes.filter((change) => !change.ours)].map((change) => change.text);
      report(
        checked,
        changes.some((change) => change.ours),
        `${narrativePath(system.id)}: ${listed.length} change(s) since it was checked: ${listed.slice(0, 10).join(", ")}${listed.length > 10 ? ", ..." : ""}`,
      );
    }

    if (arabic !== null && ledger.systems[system.id]?.arabic !== fingerprint(english)) {
      report(
        plain,
        touched(narrativePath(system.id), plainPath(system.id)),
        `${plainPath(system.id)}: ${narrativePath(system.id)} changed since the Arabic page was brought in line with it`,
      );
    }
  }

  return [
    {
      id: "system-docs-exist",
      title: "every system has its explanation, its plain Arabic page and a link in both system indexes",
      fix: "Write the missing page or index link (docs/systems/README.md describes the pages), then record the check with npm run docs:verify -- <id>, and with --ar for the Arabic page.",
      ...exist,
    },
    {
      id: "system-docs-checked",
      title: "every system explanation was checked after the code it describes last changed",
      fix: "Read what changed (git diff origin/main -- <file>; a name after # is one procedure, route or job of that file), correct docs/systems/<id>.md wherever it no longer matches the code, then run npm run docs:verify -- <id>.",
      ...checked,
    },
    {
      id: "system-plain-docs-checked",
      title: "every plain Arabic page was brought in line with its English explanation after that last changed",
      fix: "Bring docs/ar/systems/<id>.md in line with docs/systems/<id>.md (git diff shows what changed in the English page), then run npm run docs:verify -- <id> --ar.",
      ...plain,
    },
  ];
}
