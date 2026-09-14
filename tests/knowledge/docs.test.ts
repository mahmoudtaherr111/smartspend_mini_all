/**
 * The documents agents read must not point at things that do not exist, and must not quote facts that
 * drift. Counts, file lists and relationships belong to docs/atlas and docs/architecture/generated,
 * which `npm run atlas:check` keeps honest; this test covers the hand-written files around them.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const AGENT_DOCS = ["AGENTS.md", "api/AGENTS.md", "api/lib/AGENTS.md", "src/AGENTS.md", "db/AGENTS.md"];
const CLAUDE_FILES = ["CLAUDE.md", "api/CLAUDE.md", "api/lib/CLAUDE.md", "src/CLAUDE.md", "db/CLAUDE.md"];
const HAND_WRITTEN = [
  ...AGENT_DOCS,
  ...CLAUDE_FILES,
  "README.md",
  "docs/README.md",
  "docs/architecture/README.md",
  "docs/ar/README.md",
  "android-app/README.md",
  ...markdownIn("docs/guides"),
  ...markdownIn("docs/decisions"),
];

function markdownIn(folder: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, folder))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => `${folder}/${name}`);
}

/** Paths that exist only locally or after a build, so a fresh checkout cannot resolve them. */
const LOCAL_ONLY = /^(?:\.atlas|dist|node_modules|coverage)(?:\/|$)/;

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
}

/** Backticked tokens that look like repository paths: `a/b/c`, `a/b/`, or `file.ext`. */
function referencedPaths(text: string): string[] {
  return [...text.matchAll(/`([^`\s]+)`/g)]
    .map((match) => match[1])
    .filter((token) => !/[<>*{}()|:=]/.test(token) && !LOCAL_ONLY.test(token))
    .filter(
      (token) =>
        /^[\w@.-]+(?:\/[\w@.-]+)+\/?$/.test(token) ||
        /^[\w.-]+\.(?:ts|tsx|md|json|c4|ya?ml|cjs|mjs|css|html)$/.test(token),
    );
}

function exists(doc: string, reference: string): boolean {
  const candidates = [path.join(ROOT, path.dirname(doc), reference), path.join(ROOT, reference)];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

describe("hand-written documentation", () => {
  it("exists where AGENTS.md says it does", () => {
    const missing = HAND_WRITTEN.filter((file) => !fs.existsSync(path.join(ROOT, file)));
    expect(missing).toEqual([]);
  });

  it("only references files and folders that exist", () => {
    const broken = HAND_WRITTEN.flatMap((doc) =>
      referencedPaths(read(doc))
        .filter((reference) => !exists(doc, reference))
        .map((reference) => `${doc}: ${reference}`),
    );
    expect(broken).toEqual([]);
  });

  it("uses repository-relative links, never file:/// URLs", () => {
    const offenders = HAND_WRITTEN.filter((doc) => /file:\/\//i.test(read(doc)));
    expect(offenders).toEqual([]);
  });

  it("does not hard-code counts that belong to the generated atlas", () => {
    const count =
      /(?:^|[^\w.])[0-9٠-٩]+\s+(?:tables?|routers?|procedures?|endpoints?|routes?|jobs?|relations?|pages?|tests?|clusters?|modules?|builders?|جدول|جداول|راوتر|اختبار|اختبارات|صفحة|صفحات)(?![\w؀-ۿ])/i;
    const offenders = HAND_WRITTEN.flatMap((doc) =>
      read(doc)
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => count.test(line))
        .map(({ line, index }) => `${doc}:${index + 1}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("starts every CLAUDE.md with an import of the AGENTS.md beside it", () => {
    const offenders = CLAUDE_FILES.filter((file) => !read(file).startsWith("@AGENTS.md"));
    expect(offenders).toEqual([]);
  });

  it("keeps AGENTS.md files short enough to read in full", () => {
    const tooLong = AGENT_DOCS.map((file) => ({ file, lines: read(file).split("\n").length }))
      .filter(({ file, lines }) => lines > (file === "AGENTS.md" ? 150 : 80))
      .map(({ file, lines }) => `${file}: ${lines} lines`);
    expect(tooLong).toEqual([]);
  });

  it("loads only instruction files that exist in the OpenCode config", () => {
    const config = JSON.parse(read(".opencode/opencode.json")) as { instructions?: string[] };
    const missing = (config.instructions ?? []).filter((file) => !fs.existsSync(path.join(ROOT, file)));
    expect(missing).toEqual([]);
  });
});
