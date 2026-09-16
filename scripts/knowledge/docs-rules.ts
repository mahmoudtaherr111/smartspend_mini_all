/**
 * Rules for the hand-written documents agents read. They must not point at things that do not exist (a
 * backticked path must resolve, and a backticked `path#name` must name something in that file) and must not
 * quote facts that drift: counts, file lists and relationships belong to docs/atlas and
 * docs/architecture/generated, which `npm run atlas` regenerates from the code.
 *
 * Shared by tests/knowledge/docs.test.ts and `npm run agent:finish`.
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../atlas/lib/util";
import type { RuleResult } from "./types";

const AGENT_DOCS = ["AGENTS.md", "api/AGENTS.md", "api/lib/AGENTS.md", "src/AGENTS.md", "db/AGENTS.md"];
const CLAUDE_FILES = ["CLAUDE.md", "api/CLAUDE.md", "api/lib/CLAUDE.md", "src/CLAUDE.md", "db/CLAUDE.md"];
const FIXED_DOCS = [
  "README.md",
  "docs/README.md",
  "docs/architecture/README.md",
  "docs/ar/README.md",
  "android-app/README.md",
  ".agents/rules/smartspend.md",
];

/** Paths that exist only locally or after a build, so a fresh checkout cannot resolve them. */
const LOCAL_ONLY = /^(?:\.atlas|dist|node_modules|coverage)(?:\/|$)/;

/** Git refs such as `origin/main` look like paths but name branches. */
const GIT_REF = /^(?:origin|upstream|refs)\//;

/** A number followed by a unit whose count lives in the atlas, in English or Arabic. */
const HARD_CODED_COUNT =
  /(?:^|[^\w.])[0-9٠-٩]+\s+(?:tables?|routers?|procedures?|endpoints?|routes?|jobs?|relations?|pages?|tests?|clusters?|modules?|builders?|جدول|جداول|راوتر|اختبار|اختبارات|صفحة|صفحات)(?![\w؀-ۿ])/i;

function markdownIn(root: string, folder: string): string[] {
  const absolute = path.join(root, folder);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => `${folder}/${name}`);
}

/** Every hand-written document these rules cover. */
export function handWrittenDocs(root = REPO_ROOT): string[] {
  return [
    ...AGENT_DOCS,
    ...CLAUDE_FILES,
    ...FIXED_DOCS,
    ...markdownIn(root, "docs/guides"),
    ...markdownIn(root, "docs/decisions"),
    ...markdownIn(root, "docs/systems"),
    ...markdownIn(root, "docs/ar/systems"),
  ];
}

function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
}

/** Backticked tokens that look like repository paths: `a/b/c`, `a/b/`, or `file.ext`. */
export function referencedPaths(text: string): string[] {
  return [...text.matchAll(/`([^`\s]+)`/g)]
    .map((match) => match[1])
    .filter((token) => !/[<>*{}()|:=]/.test(token) && !LOCAL_ONLY.test(token) && !GIT_REF.test(token))
    .filter(
      (token) =>
        /^[\w@.-]+(?:\/[\w@.-]+)+\/?$/.test(token) ||
        /^[\w.-]+\.(?:ts|tsx|md|json|c4|ya?ml|cjs|mjs|css|html)$/.test(token),
    );
}

/** Backticked `path#name` references: a file, and a function, type or constant it declares. */
export function referencedSymbols(text: string): Array<{ file: string; symbol: string }> {
  return [...text.matchAll(/`([\w@.\/-]+\.\w+)#([A-Za-z_$][\w$]*)`/g)].map((match) => ({ file: match[1], symbol: match[2] }));
}

function symbolResolves(root: string, doc: string, reference: { file: string; symbol: string }): boolean {
  const file = [path.join(root, path.dirname(doc), reference.file), path.join(root, reference.file)].find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
  if (!file) return false;
  const name = reference.symbol.replace(/\$/g, "\\$");
  return new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(fs.readFileSync(file, "utf8"));
}

function resolves(root: string, doc: string, reference: string): boolean {
  return [path.join(root, path.dirname(doc), reference), path.join(root, reference)].some((candidate) =>
    fs.existsSync(candidate),
  );
}

export function checkDocs(root = REPO_ROOT): RuleResult[] {
  const docs = handWrittenDocs(root);
  const present = docs.filter((file) => fs.existsSync(path.join(root, file)));
  const instructions = fs.existsSync(path.join(root, ".opencode", "opencode.json"))
    ? ((JSON.parse(read(root, ".opencode/opencode.json")) as { instructions?: string[] }).instructions ?? [])
    : [];

  return [
    {
      id: "docs-exist",
      title: "every hand-written document the agent instructions rely on exists",
      fix: "Restore the file, or remove it from scripts/knowledge/docs-rules.ts together with every mention of it.",
      violations: docs.filter((file) => !present.includes(file)),
    },
    {
      id: "docs-paths-resolve",
      title: "hand-written documents reference only files and folders that exist",
      fix: "Correct the path, or delete the sentence if what it described is gone.",
      violations: present.flatMap((doc) =>
        referencedPaths(read(root, doc))
          .filter((reference) => !resolves(root, doc, reference))
          .map((reference) => `${doc}: ${reference}`),
      ),
    },
    {
      id: "docs-symbols-resolve",
      title: "hand-written documents name only functions, types and constants that exist in the file they cite",
      fix: "Point the `path#name` reference at the current file and name, or delete the sentence if that code is gone.",
      violations: present.flatMap((doc) =>
        referencedSymbols(read(root, doc))
          .filter((reference) => !symbolResolves(root, doc, reference))
          .map((reference) => `${doc}: ${reference.file}#${reference.symbol}`),
      ),
    },
    {
      id: "docs-no-file-urls",
      title: "hand-written documents use repository-relative links, never file:/// URLs",
      fix: "Replace the file:/// URL with a path relative to the repository.",
      violations: present.filter((doc) => /file:\/\//i.test(read(root, doc))),
    },
    {
      id: "docs-no-counts",
      title: "hand-written documents do not hard-code counts that belong to the generated atlas",
      fix: "Remove the number and point at docs/atlas/README.md, which is regenerated from the code.",
      violations: present.flatMap((doc) =>
        read(root, doc)
          .split("\n")
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => HARD_CODED_COUNT.test(line))
          .map(({ line, index }) => `${doc}:${index + 1}: ${line.trim()}`),
      ),
    },
    {
      id: "claude-imports-agents",
      title: "every CLAUDE.md starts with an import of the AGENTS.md beside it",
      fix: "Make @AGENTS.md the first line of the CLAUDE.md.",
      violations: CLAUDE_FILES.filter((file) => present.includes(file) && !read(root, file).startsWith("@AGENTS.md")),
    },
    {
      id: "agents-files-short",
      title: "AGENTS.md files stay short enough to read in full",
      fix: "Move detail into the nearest folder AGENTS.md, docs/guides or docs/decisions; keep rules and pointers only.",
      violations: AGENT_DOCS.filter((file) => present.includes(file))
        .map((file) => ({ file, lines: read(root, file).split("\n").length }))
        .filter(({ file, lines }) => lines > (file === "AGENTS.md" ? 150 : 80))
        .map(({ file, lines }) => `${file}: ${lines} lines`),
    },
    {
      id: "opencode-instructions-exist",
      title: "OpenCode loads only instruction files that exist",
      fix: "Fix the instructions list in .opencode/opencode.json.",
      violations: instructions.filter((file) => !fs.existsSync(path.join(root, file))),
    },
  ];
}
