/**
 * A report you cannot check is a report you cannot trust.
 *
 * Two layers, on purpose:
 *
 *   1. Cases scored by the REAL `scoreCase`/`aggregate`, so the report is tested against
 *      the alignment it actually consumes rather than against a hand-written imitation
 *      of it. Every expected number below was worked out on paper from the fixtures.
 *   2. Contract cases on the pure builder, for the shapes a real run cannot easily
 *      produce — a malformed baseline, an empty corpus, a NaN.
 *
 * The first version of this file asserted "every rate is inside [0,1]" and treated that
 * as proof the statistics were right. It was not: the rates were inside [0,1] and the
 * numerators still belonged to the wrong denominators. These check conservation — that a
 * numerator is a subset of its own denominator, and that the pieces add up.
 */
import { describe, expect, it } from "vitest";
import { aggregate, scoreCase, type CaseScore, type ScorableResult } from "./classification-scorer";
import type { BenchmarkCase } from "./fixtures/classification-cases.types";
import {
  buildCoreReport,
  CoreReportContractError,
  fingerprintMismatch,
  REPORT_SCHEMA_VERSION,
  type CoreEvidence,
  type CoreReport,
  type CoreReportProvenance,
} from "./classification-core-report";

// ─── Real-scorer fixtures, hand-computed ────────────────────────────────────

function benchCase(over: Partial<BenchmarkCase> & Pick<BenchmarkCase, "id">): BenchmarkCase {
  return {
    bucket: "single_clause",
    tier: "locked",
    split: "dev",
    text: "",
    expectedItems: [],
    tags: [],
    ...over,
  } as BenchmarkCase;
}

function result(
  items: Array<{ amount: number; category: string; type?: string; subCategory?: string }>,
  decision: "auto_save" | "review" | "clarify" = "auto_save",
): ScorableResult {
  return {
    items: items.map((item) => ({
      amount: item.amount,
      category: item.category,
      subCategory: item.subCategory ?? "عام",
      type: (item.type ?? "expense") as never,
      confidence: 95,
    })),
    decision,
    overallConfidence: 95,
    tokensUsed: 0,
    cachedTokens: 0,
    processingTimeMs: 1,
    parsedBy: "rule_engine",
    actualModelUsed: null,
  } as unknown as ScorableResult;
}

/**
 * Six cases, chosen so every reporting branch is exercised and every figure is derivable
 * by hand:
 *
 *  fuel-ok      200 مواصلات        → 200 مواصلات        matched, accepted
 *  food-wrong   50  أكل وشرب       → 50  مواصلات        matched, category WRONG
 *  anyof-ok     150 سكن|موظفين     → 150 موظفين         matched via categoryAnyOf
 *  missing      90  صحة            → (nothing)          expected with no production
 *  spurious     (nothing expected) → 70  ترفيه          production with no reference
 *  swapped      40 صحة, 40 مواصلات → 40 مواصلات, 40 صحة two EQUAL amounts, positions swapped
 *
 * مواصلات: actual items = 3 (fuel-ok, food-wrong, swapped#1); accepted as produced = 1.
 *          expected items = 2 (fuel-ok, swapped#2);            accepted as expected = 1.
 */
const CASES: Array<{ case: BenchmarkCase; result: ScorableResult }> = [
  {
    case: benchCase({
      id: "fuel-ok",
      text: "دفعت 200 بنزين",
      expectedItems: [{ amount: 200, category: "مواصلات", type: "expense" }],
      expectedDecision: "auto_save",
    }),
    result: result([{ amount: 200, category: "مواصلات" }]),
  },
  {
    case: benchCase({
      id: "food-wrong",
      text: "دفعت 50 أكل",
      expectedItems: [{ amount: 50, category: "أكل وشرب", type: "expense" }],
    }),
    result: result([{ amount: 50, category: "مواصلات" }]),
  },
  {
    case: benchCase({
      id: "anyof-ok",
      split: "frozen",
      text: "دفعت 150 للبواب",
      expectedItems: [
        { amount: 150, category: "سكن", categoryAnyOf: ["سكن", "موظفين"], type: "expense" },
      ],
    }),
    result: result([{ amount: 150, category: "موظفين" }], "review"),
  },
  {
    case: benchCase({
      id: "missing",
      text: "دفعت 90 دوا",
      expectedItems: [{ amount: 90, category: "صحة", type: "expense" }],
    }),
    result: result([], "clarify"),
  },
  {
    case: benchCase({ id: "spurious", bucket: "non_financial", text: "ازيك", expectedItems: [] }),
    result: result([{ amount: 70, category: "ترفيه" }]),
  },
  {
    case: benchCase({
      id: "swapped",
      text: "دفعت 40 دوا و40 مواصلات",
      expectedItems: [
        { amount: 40, category: "صحة", type: "expense" },
        { amount: 40, category: "مواصلات", type: "expense" },
      ],
    }),
    result: result([
      { amount: 40, category: "مواصلات" },
      { amount: 40, category: "صحة" },
    ]),
  },
];

const SCORES: CaseScore[] = CASES.map((entry) => scoreCase(entry.case, entry.result, "local"));

/**
 * Deep-cloned per call.
 *
 * An earlier version handed out references to the module-level fixtures, and one test
 * that flipped every decision to "review" silently changed the input of every test after
 * it. The report's own consistency check is what surfaced it — a run with zero
 * auto-saves still carrying one unsafe auto-save.
 */
function evidenceFromRealScorer(): CoreEvidence {
  const rows = CASES.map((entry, index) => ({
    case: structuredClone(entry.case),
    result: structuredClone(entry.result),
    score: structuredClone(SCORES[index]),
    crashed: false,
  }));
  const decisions: Record<string, number> = {};
  for (const entry of CASES) {
    const decision = (entry.result as unknown as { decision: string }).decision;
    decisions[decision] = (decisions[decision] || 0) + 1;
  }
  return {
    mode: "offline",
    overall: aggregate(SCORES),
    dev: aggregate(SCORES.filter((score) => score.split === "dev")),
    frozen: aggregate(SCORES.filter((score) => score.split === "frozen")),
    // Hand-counted: `food-wrong` auto-saved with a wrong category.
    system: { unsafeAutoSaves: 1, spuriousOnNonFinancial: 1 },
    decisions,
    rows,
  } as unknown as CoreEvidence;
}

const FINGERPRINT = {
  fixtureSha256: "a".repeat(64),
  caseCount: 6,
  mode: "offline",
  scorerSha256: "b".repeat(64),
  calibrationVersion: "v3.0",
  schemaVersion: REPORT_SCHEMA_VERSION,
  experiment: { userPlan: "free", modelName: "flash" },
};

const PROVENANCE: CoreReportProvenance = {
  fingerprint: FINGERPRINT,
  sourceSha256: { "api/lib/smart-pipeline.ts": "c".repeat(64) },
  git: { commit: "d".repeat(40), tree: "e".repeat(40), dirty: false, dirtyFiles: [] },
  generatedAt: "2026-09-05T00:00:00.000Z",
  runtimeMs: 1234,
  node: "v22.0.0",
  platform: "linux",
  ci: null,
  status: "success",
};

function build(over: Partial<Parameters<typeof buildCoreReport>[0]> = {}): CoreReport {
  return buildCoreReport({ evidence: evidenceFromRealScorer(), provenance: PROVENANCE, ...over });
}

// ─── Category arithmetic, against the real scorer ───────────────────────────

describe("per-category figures, scored by the real scorer", () => {
  const report = build();
  const byName = (name: string) => report.categories.find((c) => c.category === name);

  it("credits precision to the category produced", () => {
    // Three actual مواصلات items; only the petrol one was accepted.
    expect(byName("مواصلات")).toMatchObject({
      acceptedAsProduced: 1,
      precisionDenominator: 3,
      precision: 1 / 3,
    });
  });

  it("credits recall to the category expected", () => {
    expect(byName("أكل وشرب")).toMatchObject({
      acceptedAsExpected: 0,
      recallDenominator: 1,
      recall: 0,
      precisionDenominator: 0,
      precision: null,
    });
  });

  it("splits an anyOf answer between the two categories it satisfies", () => {
    expect(byName("موظفين")).toMatchObject({ acceptedAsProduced: 1, precision: 1, recall: null });
    expect(byName("سكن")).toMatchObject({ acceptedAsExpected: 1, recall: 1, precision: null });
  });

  it("never lets a numerator exceed its own denominator", () => {
    // The invariant the first version broke: أصدقاء came back with recall 1.25.
    for (const entry of [...report.categories, ...report.strictCategories]) {
      expect(entry.acceptedAsProduced, entry.category).toBeLessThanOrEqual(
        entry.precisionDenominator,
      );
      expect(entry.acceptedAsExpected, entry.category).toBeLessThanOrEqual(
        entry.recallDenominator,
      );
      expect(entry.falsePositives, entry.category).toBeGreaterThanOrEqual(0);
      expect(entry.falseNegatives, entry.category).toBeGreaterThanOrEqual(0);
    }
  });

  it("accounts for every produced and every expected item exactly once", () => {
    const produced = report.categories.reduce((sum, c) => sum + c.precisionDenominator, 0);
    const expected = report.categories.reduce((sum, c) => sum + c.recallDenominator, 0);
    // produced: 200, 50, 150, 70, 40, 40 — expected: 200, 50, 150, 90, 40, 40.
    expect(produced).toBe(6);
    expect(expected).toBe(6);
  });

  it("reports a measured total failure as 0, not as missing data", () => {
    // Both rates measured at zero must give 0. The first version returned null and hid
    // a category that got everything wrong.
    const bothZero = buildCoreReport({
      evidence: {
        ...evidenceFromRealScorer(),
        rows: [
          {
            case: { id: "z", expectedItems: [{ category: "صحة" }] },
            result: { decision: "auto_save", items: [{ category: "صحة" }] },
            score: {
              id: "z",
              expectedCount: 1,
              actualCount: 1,
              tripleHits: 0,
              spurious: 0,
              countExact: true,
              matches: [{ expectedIndex: 0, actualIndex: 0, categoryOk: false }],
              failures: ["category"],
            },
          },
        ],
      },
      provenance: PROVENANCE,
    });
    expect(bothZero.categories.find((c) => c.category === "صحة")).toMatchObject({
      precision: 0,
      recall: 0,
      f1: 0,
    });

    // And an unmeasurable rate stays null, which is a different claim.
    expect(byName("أكل وشرب")?.f1).toBeNull();
  });

  it("separates the strict subset from the lenient one", () => {
    // `anyof-ok` is the only multi-target case, so موظفين vanishes from strict.
    expect(report.strictCategories.some((c) => c.category === "موظفين")).toBe(false);
    expect(report.categories.some((c) => c.category === "موظفين")).toBe(true);
  });

  it("puts an unmatched expectation in missed and an unmatched answer in spurious", () => {
    expect(report.confusion.missedByCategory["صحة"]).toBe(1);
    expect(report.confusion.spuriousByCategory["ترفيه"]).toBe(1);
    expect(report.confusion.matrix["أكل وشرب"]).toEqual({ "مواصلات": 1 });
  });

  it("cannot see a swap between two equal amounts, and says so", () => {
    // The scorer aligns equal amounts by position, so the swapped case reads as two
    // category errors rather than as a reordering. Documented rather than papered over.
    expect(report.confusion.matrix["صحة"]).toMatchObject({ "مواصلات": 1 });
    expect(report.definitions.match).toContain("two equal amounts");
  });
});

// ─── Decision safety: the 4-vs-7 distinction ────────────────────────────────

describe("auto-save safety reports two different questions", () => {
  const report = build();
  const safety = report.decisions.autoSaveSafety;

  it("keeps the triple/count measure and the any-error measure apart", () => {
    // auto_save cases: fuel-ok, food-wrong, spurious, swapped.
    expect(safety.autoSavedCases).toBe(4);
    expect(safety.totalCases).toBe(6);
    expect(safety.tripleUnsafeAutoSaveCases).toBe(1);
    // The wider measure is a superset by construction, and the report refuses to emit
    // a state where it is not.
    expect(safety.autoSaveCasesWithAnyScoredError).toBeGreaterThanOrEqual(
      safety.tripleUnsafeAutoSaveCases,
    );
  });

  it("gives each rate its own named denominator", () => {
    expect(safety.tripleUnsafeRateOfAutoSaved).toBeCloseTo(1 / 4, 10);
    expect(safety.tripleUnsafeRateOfAllCases).toBeCloseTo(1 / 6, 10);
  });

  it("states what neither measure covers", () => {
    expect(safety.doesNotCover.join(" ")).toContain("currency");
    expect(safety.doesNotCover.join(" ")).toContain("date");
  });

  it("reports the error rate inside each decision", () => {
    const autoSave = report.decisions.breakdown.find((d) => d.decision === "auto_save");
    expect(autoSave).toMatchObject({ cases: 4, denominator: 4 });
    expect(autoSave?.errorRateWithinDecision).not.toBeNull();
  });
});

// ─── Comparability ──────────────────────────────────────────────────────────

describe("two runs are only subtracted when they measured the same way", () => {
  const first = build();

  it("compares against a baseline with an identical fingerprint", () => {
    const second = build({ baseline: first });
    expect(second.comparability.compared).toBe(true);
    expect(second.headline.delta?.tripleF1).toBe(0);
    expect(second.splits.dev.delta).not.toBeNull();
    expect(second.splits.frozen.delta).not.toBeNull();
    expect(second.categoryDelta?.length).toBeGreaterThan(0);
    expect(second.decisions.countsDelta).not.toBeNull();
    expect(second.decisions.baselineAutoSaveSafety).not.toBeNull();
    expect(second.cost.baselineDerivedLlmRoutes).not.toBeNull();
  });

  it.each([
    ["mode", { mode: "live" }],
    ["scorerSha256", { scorerSha256: "9".repeat(64) }],
    ["calibrationVersion", { calibrationVersion: "v3.1" }],
    ["fixtureSha256", { fixtureSha256: "9".repeat(64) }],
    ["caseCount", { caseCount: 5 }],
    ["schemaVersion", { schemaVersion: "0.0.1" }],
  ])("withholds every delta when %s differs", (field, patch) => {
    const stale = {
      ...first,
      provenance: { ...first.provenance, fingerprint: { ...FINGERPRINT, ...patch } },
    };
    const report = build({ baseline: stale });
    expect(report.comparability.compared).toBe(false);
    expect(report.headline.delta).toBeNull();
    expect(report.categoryDelta).toBeNull();
    expect(report.decisions.countsDelta).toBeNull();
    expect(report.comparability.mismatched.join(" ")).toContain(field);
    expect(report.warnings.join(" ")).toContain("NOT COMPARABLE");
  });

  it("withholds the delta when the experiment settings differ", () => {
    const stale = {
      ...first,
      provenance: {
        ...first.provenance,
        fingerprint: { ...FINGERPRINT, experiment: { userPlan: "ultra", modelName: "flash" } },
      },
    };
    const report = build({ baseline: stale });
    expect(report.comparability.compared).toBe(false);
    expect(report.comparability.mismatched.join(" ")).toContain("experiment.userPlan");
  });

  it("does not refuse a comparison merely because the classifier changed", () => {
    // The whole purpose of comparing. Classifier hashes live outside the fingerprint.
    const stale = {
      ...first,
      provenance: {
        ...first.provenance,
        sourceSha256: { "api/lib/smart-pipeline.ts": "9".repeat(64) },
      },
    };
    expect(build({ baseline: stale }).comparability.compared).toBe(true);
  });

  it("names the fields that differ, baseline → candidate", () => {
    expect(fingerprintMismatch(FINGERPRINT, { ...FINGERPRINT, mode: "live" })).toEqual([
      "mode: live → offline",
    ]);
  });
});

// ─── Contracts ──────────────────────────────────────────────────────────────

describe("bad input fails loudly instead of producing NaN", () => {
  it("rejects a baseline that is missing its fields", () => {
    // The reviewer's counterexample: `{cases: 172}` produced exit 0 and NaN deltas.
    expect(() => build({ baseline: { headline: { candidate: { cases: 172 } } } })).toThrow(
      CoreReportContractError,
    );
  });

  it.each([
    ["null evidence", null],
    ["evidence with no rows", { mode: "offline" }],
    ["an empty object", {}],
  ])("rejects %s", (_label, evidence) => {
    expect(() => buildCoreReport({ evidence, provenance: PROVENANCE })).toThrow(
      CoreReportContractError,
    );
  });

  it("rejects an aggregate carrying NaN", () => {
    const broken = evidenceFromRealScorer();
    (broken.overall as { tripleF1: number }).tripleF1 = Number.NaN;
    expect(() => buildCoreReport({ evidence: broken, provenance: PROVENANCE })).toThrow(/tripleF1/);
  });

  it("treats no baseline as a legitimate first run", () => {
    const report = build();
    expect(report.comparability.compared).toBe(false);
    expect(report.comparability.reason).toContain("establishes one");
    expect(report.headline.delta).toBeNull();
  });

  it("handles an empty corpus without inventing rates", () => {
    const report = buildCoreReport({
      evidence: {
        mode: "offline",
        overall: aggregate([]),
        dev: aggregate([]),
        frozen: aggregate([]),
        system: { unsafeAutoSaves: 0, spuriousOnNonFinancial: 0 },
        decisions: {},
        rows: [],
      },
      provenance: PROVENANCE,
    });
    expect(report.categories).toEqual([]);
    expect(report.decisions.autoSaveSafety.autoSavedCases).toBe(0);
    expect(report.decisions.autoSaveSafety.tripleUnsafeRateOfAutoSaved).toBeNull();
  });

  it("handles a corpus with no auto-saved case", () => {
    const evidence = evidenceFromRealScorer();
    for (const row of evidence.rows) (row.result as { decision: string }).decision = "review";
    // Nothing auto-saved, so nothing can be an unsafe auto-save. Leaving the counter at
    // 1 would be inconsistent evidence, which the check below covers separately.
    (evidence.system as { unsafeAutoSaves: number }).unsafeAutoSaves = 0;
    const report = buildCoreReport({ evidence, provenance: PROVENANCE });
    expect(report.decisions.autoSaveSafety.autoSavedCases).toBe(0);
    expect(report.decisions.autoSaveSafety.anyErrorRateOfAutoSaved).toBeNull();
    expect(report.decisions.autoSaveSafety.tripleUnsafeRateOfAutoSaved).toBeNull();
  });

  it("refuses evidence claiming more unsafe auto-saves than auto-saves", () => {
    // The wider measure is computed here and the narrow one is supplied, so they can
    // disagree if the evidence is wrong. A report that emitted that would invite someone
    // to quote a rate above 100%.
    const evidence = evidenceFromRealScorer();
    for (const row of evidence.rows) (row.result as { decision: string }).decision = "review";
    expect(() => buildCoreReport({ evidence, provenance: PROVENANCE })).toThrow(/superset/);
  });
});

// ─── Provenance and disclosure ──────────────────────────────────────────────

describe("the report does not overstate what it measured", () => {
  const report = build();

  it("renames the derived route count and keeps the old field working", () => {
    expect(report.cost.derivedLlmRoutes).toBe(report.cost.llmCalls);
    expect(report.cost.note).toContain("Not a request counter");
  });

  it("warns that offline zero-token figures are not a production cost", () => {
    expect(report.warnings.join(" ")).toContain("no provider is reached");
  });

  it("warns when the tree was dirty", () => {
    const dirty = build({
      provenance: {
        ...PROVENANCE,
        git: { ...PROVENANCE.git, dirty: true, dirtyFiles: ["api/lib/rule-engine.ts"] },
      },
    });
    expect(dirty.warnings.join(" ")).toContain("not reproducible from the commit alone");
  });

  it("carries commit, tree, status and schema version", () => {
    expect(report.provenance.git.commit).toHaveLength(40);
    expect(report.provenance.status).toBe("success");
    expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
  });

  it("contains no transaction text, by construction", () => {
    const serialised = JSON.stringify(report);
    for (const entry of CASES) {
      if (!entry.case.text) continue;
      expect(serialised, `"${entry.case.text}" leaked`).not.toContain(entry.case.text);
    }
    expect(serialised).not.toContain("fuel-ok");
  });
});
