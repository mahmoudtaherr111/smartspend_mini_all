/**
 * The parsers behind `docs/atlas/systems/state.md`: the page is only as true as its reading of the
 * explanations, and a heading it fails to recognise turns a well-tested system into "no tests at all".
 */
import { describe, expect, it } from "vitest";
import { __testing } from "../../scripts/atlas/emit/state";

const { section, numberedItems, testsNamed, classify } = __testing;

const PAGE = [
  "# Money",
  "",
  "## Tests and benchmarks",
  "- Pipeline: `api/lib/smart-pipeline.test.ts`, `api/lib/amount-ledger.test.ts`.",
  "- Benchmark: `npm run bench:classify` runs `api/lib/classification-benchmark.test.ts`.",
  "",
  "## Known issues",
  "Checked against the code; each one names where it lives.",
  "1. **Gap.** Budgets can be set but no screen shows them, and nothing warns when one is passed;",
  "   `api/budget-router.ts` has no caller.",
  "2. The daily average divides by thirty whatever the month.",
  "",
  "## Related systems",
  "- [Recording spending](expense-capture.md)",
].join("\n");

describe("reading a system page for the state report", () => {
  it("finds a section whose heading was widened", () => {
    expect(section(PAGE, "## Tests").filter(Boolean)).toHaveLength(2);
    expect(section(PAGE, "## Known issues")[0]).toContain("Checked against the code");
  });

  it("returns nothing for a section the page does not have", () => {
    expect(section(PAGE, "## Where to change what")).toEqual([]);
  });

  it("folds an issue written across several lines back into one item", () => {
    const issues = numberedItems(section(PAGE, "## Known issues"));
    expect(issues).toHaveLength(2);
    expect(issues[0]).toBe(
      "**Gap.** Budgets can be set but no screen shows them, and nothing warns when one is passed; `api/budget-router.ts` has no caller.",
    );
    expect(issues[1]).toBe("The daily average divides by thirty whatever the month.");
  });

  it("stops at the next section instead of swallowing it", () => {
    expect(numberedItems(section(PAGE, "## Known issues")).join(" ")).not.toContain("Related systems");
  });

  it("counts every test file the page names, once", () => {
    expect(testsNamed(PAGE)).toEqual([
      "api/lib/smart-pipeline.test.ts",
      "api/lib/amount-ledger.test.ts",
      "api/lib/classification-benchmark.test.ts",
    ]);
  });

  it("counts no tests for a page that says it has none", () => {
    expect(testsNamed("## Tests\nNo test covers this system.\n")).toEqual([]);
  });

  it("reads the severity word and takes it off the text", () => {
    expect(classify("**Security.** The token is readable by any script.")).toEqual({
      severity: "security",
      text: "The token is readable by any script.",
    });
    expect(classify("**أمن.** التوكن متخزن في ذاكرة المتصفح.")).toEqual({
      severity: "security",
      text: "التوكن متخزن في ذاكرة المتصفح.",
    });
    expect(classify("**دين تقني.** x").severity).toBe("debt");
    expect(classify("**عطل.** x").severity).toBe("bug");
    expect(classify("**Gap.** No screen calls it.").severity).toBe("gap");
  });

  it("treats an item with no severity word as debt, keeping its text whole", () => {
    expect(classify("Nobody wrote a word in front of this one.")).toEqual({
      severity: "debt",
      text: "Nobody wrote a word in front of this one.",
    });
  });
});
