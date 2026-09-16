/**
 * The parts that keep system pages honest, tested without building the atlas: the merge driver of the check
 * record, fingerprints of declarations in a shared file, who answers for an unchecked page, and `path#name`
 * references in documents.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AtlasGraph } from "../../scripts/atlas/graph";
import { formatLedger, mergeLedgers, parseLedger } from "../../scripts/agent/verified-ledger.mjs";
import { referencedSymbols } from "../../scripts/knowledge/docs-rules";
import { checkSystemDocs, coverageFingerprints, fingerprint } from "../../scripts/knowledge/systems-docs";
import type { RuleResult } from "../../scripts/knowledge/types";

function tempRoot(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartspend-systems-docs-"));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe("merging the check record", () => {
  const base = { systems: { money: { files: { "a.ts": "1", "b.ts": "1" }, arabic: "x" } } };

  it("takes the side that changed an entry", () => {
    const ours = { systems: { money: { files: { "a.ts": "2", "b.ts": "1" }, arabic: "x" } } };
    const theirs = { systems: { money: { files: { "a.ts": "1", "b.ts": "3" }, arabic: "y" } } };
    expect(mergeLedgers(base, ours, theirs)).toEqual({
      systems: { money: { files: { "a.ts": "2", "b.ts": "3" }, arabic: "y" } },
    });
  });

  it("carries the day each page was recorded, from whichever side re-checked it", () => {
    const withStamps = {
      systems: { money: { files: { "a.ts": "1", "b.ts": "1" }, arabic: "x", checked: "2026-09-01 aaaaaaa" } },
    };
    const ours = {
      systems: { money: { files: { "a.ts": "2", "b.ts": "1" }, arabic: "x", checked: "2026-09-16 bbbbbbb" } },
    };
    const theirs = {
      systems: { money: { files: { "a.ts": "1", "b.ts": "1" }, arabic: "y", checked: "2026-09-01 aaaaaaa", arabicChecked: "2026-09-10 ccccccc" } },
    };
    expect(mergeLedgers(withStamps, ours, theirs)).toEqual({
      systems: {
        money: {
          files: { "a.ts": "2", "b.ts": "1" },
          arabic: "y",
          checked: "2026-09-16 bbbbbbb",
          arabicChecked: "2026-09-10 ccccccc",
        },
      },
    });
  });

  it("keeps ours when both sides changed an entry, drops what one side removed and adds what one side added", () => {
    const ours = { systems: { money: { files: { "a.ts": "2" }, arabic: "x" } } };
    const theirs = {
      systems: { money: { files: { "a.ts": "4", "b.ts": "1" }, arabic: "x" }, billing: { files: { "c.ts": "5" } } },
    };
    expect(mergeLedgers(base, ours, theirs)).toEqual({
      systems: { money: { files: { "a.ts": "2" }, arabic: "x" }, billing: { files: { "c.ts": "5" } } },
    });
  });

  it("writes stable text that reads back to the same text", () => {
    const text = formatLedger({ systems: { zeta: { files: { "b.ts": "2", "a.ts": "1" } }, alpha: { files: {}, arabic: "z" } } });
    expect(Object.keys(JSON.parse(text).systems)).toEqual(["alpha", "zeta"]);
    expect(Object.keys(JSON.parse(text).systems.zeta.files)).toEqual(["a.ts", "b.ts"]);
    expect(formatLedger(parseLedger(text))).toBe(text);
  });
});

describe("fingerprints of a file several systems share", () => {
  const lines = ["const helper = 1;", "export const router = {", "  one: build(1),", "  two: build(2),", "};"];
  const units = [
    { id: "r.ts#one", file: "r.ts", lines: [3, 3] as [number, number] },
    { id: "r.ts#two", file: "r.ts", lines: [4, 4] as [number, number] },
    { id: "r.ts#rest-of-file", file: "r.ts", cut: [[3, 3], [4, 4]] as Array<[number, number]> },
    { id: "gone.ts", file: "gone.ts" },
  ];

  it("fingerprints each declaration, the rest of the file and a missing file on their own", () => {
    const prints = coverageFingerprints(tempRoot({ "r.ts": lines.join("\r\n") }), units);
    expect(prints["r.ts#one"]).toBe(fingerprint("  one: build(1),"));
    expect(prints["r.ts#rest-of-file"]).toBe(fingerprint(["const helper = 1;", "export const router = {", "};"].join("\n")));
    expect(prints["gone.ts"]).toBe("missing");
  });

  it("a change inside one declaration leaves the other units alone", () => {
    const before = coverageFingerprints(tempRoot({ "r.ts": lines.join("\n") }), units);
    const after = coverageFingerprints(tempRoot({ "r.ts": lines.join("\n").replace("build(2)", "build(22)") }), units);
    expect(after["r.ts#two"]).not.toBe(before["r.ts#two"]);
    expect(after["r.ts#one"]).toBe(before["r.ts#one"]);
    expect(after["r.ts#rest-of-file"]).toBe(before["r.ts#rest-of-file"]);
  });
});

describe("who answers for an unchecked page", () => {
  const root = tempRoot({
    "api/money.ts": "export const total = 1;\n",
    "docs/systems/README.md": "[Money](money.md)\n",
    "docs/ar/systems/README.md": "[الفلوس](money.md)\n",
    "docs/systems/money.md": "# Money\n",
    "docs/ar/systems/money.md": "# الفلوس\n",
    "docs/systems/verified.json": formatLedger({
      systems: { money: { files: { "api/money.ts": "000000000000" }, arabic: fingerprint("# Money\n") } },
    }),
  });
  const graph = {
    systems: { systems: [{ id: "money", coverage: [{ id: "api/money.ts", file: "api/money.ts" }] }] },
  } as unknown as AtlasGraph;
  const rule = (results: RuleResult[], id: string) => results.find((result) => result.id === id)!;

  it("without a baseline, an unchecked page is a violation", () => {
    const results = checkSystemDocs(graph, root);
    expect(rule(results, "system-docs-checked").violations).toHaveLength(1);
    expect(rule(results, "system-plain-docs-checked").violations).toEqual([]);
    expect(rule(results, "system-docs-exist").violations).toEqual([]);
  });

  it("the branch that changed the code has to check the page again", () => {
    const results = checkSystemDocs(graph, root, { changedSinceBaseline: new Set(["api/money.ts"]) });
    expect(rule(results, "system-docs-checked").violations).toHaveLength(1);
  });

  it("a page left unchecked by another branch's change is only a notice", () => {
    const checked = rule(checkSystemDocs(graph, root, { changedSinceBaseline: new Set(["src/other.ts"]) }), "system-docs-checked");
    expect(checked.violations).toEqual([]);
    expect(checked.notices).toHaveLength(1);
  });
});

describe("path#name references", () => {
  it("reads file and name pairs in backticks only", () => {
    expect(referencedSymbols("See `api/lib/smart-pipeline.ts#runSmartPipeline`, `AGENTS.md#golden-rules` and api/x.ts#y.")).toEqual([
      { file: "api/lib/smart-pipeline.ts", symbol: "runSmartPipeline" },
    ]);
  });
});
