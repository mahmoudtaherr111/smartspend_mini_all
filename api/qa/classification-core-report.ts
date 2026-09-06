/**
 * Turns a scored corpus run into a report you can compare against another one.
 *
 * Safe to paste into a ticket by construction: nothing below copies a fixture sentence,
 * an item description, a person name or a key into the output. The report is metric
 * names, category names and numbers. That is a property of what this builds, not a
 * scrubbing pass afterwards — and `classification-core-report.test.ts` asserts it holds.
 *
 * A PURE function over rows that `classification-scorer` already produced. It classifies
 * nothing, re-aligns nothing, re-scores nothing; every number is derived from
 * `CaseScore.matches`, the alignment the scorer committed to. A reporting layer that did
 * its own matching would be a second classifier with no tests, and the first
 * disagreement between the two would be invisible.
 *
 * ── What the independent review of the first version found, and what changed ──
 *
 * R3  A baseline missing almost every field was accepted, subtracted, and printed `NaN`
 *     beside a green run. Everything crossing this boundary — evidence, baseline, and
 *     the report itself — now passes a Zod contract, and a baseline that was ASKED for
 *     and is unusable is an error rather than a shrug.
 * R4  Two runs were compared on a matching fixture hash alone, so an offline/free run
 *     was diffed against a live/ultra one under a different scorer and produced a
 *     confident delta. Comparability is now an `evaluationFingerprint` over everything
 *     that defines the measurement — and the classifier is deliberately NOT in it,
 *     because changing the classifier is the thing a comparison exists to measure.
 * R5  `unsafeAutoSaves` was documented as "any scoring failure" but populated from a
 *     counter that looks only at amount/direction/category/count. Both are reported now,
 *     separately, each with its denominator. On the current corpus they are 4 and 7.
 * R6  F1 returned null when precision and recall were both 0 with positive support,
 *     reporting a measured total failure as missing data. Zero is zero; null is unmeasured.
 * R7  Only the headline was compared. Categories, decisions and cost are compared too,
 *     because a flat average is exactly how a per-category regression hides.
 */
import { z } from "zod";

/** Bumped when the shape or the meaning of a field changes. Part of comparability. */
export const REPORT_SCHEMA_VERSION = "2.0.0";

// ─── Contracts ──────────────────────────────────────────────────────────────
//
// Narrow on purpose: only the fields this module reads. Validating the scorer's whole
// output here would duplicate its type and drift from it.

const finite = z.number().finite();
const rate = finite.min(0).max(1);
const count = z.number().int().min(0);

const itemMatchSchema = z.object({
  expectedIndex: z.number().int().nullable(),
  actualIndex: z.number().int().nullable(),
  categoryOk: z.boolean(),
});

const caseScoreSchema = z.object({
  id: z.string(),
  expectedCount: count,
  actualCount: count,
  tripleHits: count,
  spurious: count,
  countExact: z.boolean(),
  matches: z.array(itemMatchSchema),
  failures: z.array(z.string()),
});

const aggregateSchema = z.object({
  cases: count,
  expectedItems: count,
  actualItems: count,
  tripleF1: rate,
  triplePrecision: rate,
  tripleRecall: rate,
  amountF1: rate,
  typeAccuracy: rate,
  categoryAccuracy: rate,
  segmentationExact: rate,
  decisionAccuracy: rate,
  taxonomyViolationRate: rate,
  cost: z.object({
    totalTokens: finite.min(0),
    totalCachedTokens: finite.min(0),
    llmCalls: finite.min(0),
    latencyP50: finite.min(0),
    latencyP95: finite.min(0),
  }),
});

const evidenceRowSchema = z.object({
  case: z
    .object({
      id: z.string(),
      expectedItems: z.array(z.looseObject({ category: z.string().optional() })).optional(),
    })
    .loose(),
  result: z
    .object({
      decision: z.string(),
      items: z.array(z.looseObject({ category: z.string().optional() })),
    })
    .loose(),
  score: caseScoreSchema,
  crashed: z.boolean().optional(),
});

export const coreEvidenceSchema = z.object({
  generatedAt: z.string().optional(),
  mode: z.string().optional(),
  overall: aggregateSchema,
  dev: aggregateSchema,
  frozen: aggregateSchema,
  system: z
    .object({ unsafeAutoSaves: count, spuriousOnNonFinancial: count })
    .loose(),
  decisions: z.record(z.string(), count),
  rows: z.array(evidenceRowSchema),
});

export type CoreEvidence = z.infer<typeof coreEvidenceSchema>;
export type CoreEvidenceRow = z.infer<typeof evidenceRowSchema>;

/**
 * Everything that has to match before two runs may be subtracted from each other.
 *
 * Deliberately EXCLUDES the classifier's own source. Changing the classifier is what a
 * comparison measures; refusing to compare across it would make the report useless.
 * What must not change is how the measurement was taken.
 */
export const evaluationFingerprintSchema = z.object({
  /** sha256 over the fixture objects, in order. */
  fixtureSha256: z.string().length(64),
  /** Case count, so a truncated corpus is caught even if a hash somehow matched. */
  caseCount: count,
  /** offline | scripted | live. An offline number is not a live number. */
  mode: z.string(),
  /** sha256 of the scorer and metric modules — the ruler itself. */
  scorerSha256: z.string(),
  /**
   * Version of the confidence calibration table.
   *
   * Moved INTO the fingerprint after the first version of this file left it out.
   * Regenerating the table changes the probability written on every item, and therefore
   * the decision each one receives — so a rebuilt table is a change in how the system is
   * measured, not a change in the classifier. Left outside, it would show up as a
   * classifier improvement that nobody made.
   */
  calibrationVersion: z.string(),
  /** Shape and meaning of the fields below. */
  schemaVersion: z.string(),
  /** Plan, model, thresholds — the experiment's own settings. */
  experiment: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

export type EvaluationFingerprint = z.infer<typeof evaluationFingerprintSchema>;

export const provenanceSchema = z.object({
  fingerprint: evaluationFingerprintSchema,
  /** sha256 per in-scope source file, so a metric change can be attributed. */
  sourceSha256: z.record(z.string(), z.string()),
  git: z.object({
    commit: z.string(),
    tree: z.string(),
    dirty: z.boolean(),
    dirtyFiles: z.array(z.string()),
  }),
  generatedAt: z.string(),
  runtimeMs: finite.min(0),
  node: z.string(),
  platform: z.string(),
  /** Present in CI. Ties an artifact to the attempt that produced it. */
  ci: z
    .object({ runId: z.string(), attempt: z.string(), workflow: z.string() })
    .nullable(),
  status: z.enum(["success", "failed"]),
});

export type CoreReportProvenance = z.infer<typeof provenanceSchema>;

// ─── Metrics ────────────────────────────────────────────────────────────────

const metricsSchema = z.object({
  cases: count,
  expectedItems: count,
  actualItems: count,
  tripleF1: rate,
  triplePrecision: rate,
  tripleRecall: rate,
  amountF1: rate,
  typeAccuracy: rate,
  categoryAccuracy: rate,
  segmentationExact: rate,
  decisionAccuracy: rate,
  taxonomyViolationRate: rate,
});

export type CoreReportMetrics = z.infer<typeof metricsSchema>;

export interface CategoryScore {
  category: string;
  /** Accepted answers the classifier PRODUCED as this category. Numerator of precision. */
  acceptedAsProduced: number;
  /**
   * Accepted answers this category was EXPECTED for. Numerator of recall.
   *
   * Differs from `acceptedAsProduced` wherever a fixture accepts several categories
   * (`categoryAnyOf`, 39 cases in the current corpus): one correct answer is a
   * produced-credit for the category given and an expected-credit for the category
   * asked. Sharing a numerator between the two denominators produces rates above 1.
   */
  acceptedAsExpected: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  /**
   * Harmonic mean of the two rates above.
   *
   * NOT textbook F1 wherever `categoryAnyOf` applies, because the two rates have
   * different numerators there. Called `lenientF1` in `definitions` for that reason;
   * `strictCategories` carries the conventional figures over the single-target subset.
   */
  f1: number | null;
  precisionDenominator: number;
  recallDenominator: number;
}

export interface DecisionBreakdown {
  decision: string;
  cases: number;
  casesWithError: number;
  errorRateWithinDecision: number | null;
  denominator: number;
}

export interface AutoSaveSafety {
  /**
   * Auto-saved cases whose amount, direction, category or item count was wrong.
   * This is `SystemMetrics.unsafeAutoSaves`, unchanged, kept for continuity.
   */
  tripleUnsafeAutoSaveCases: number;
  /**
   * Auto-saved cases with ANY scored failure, subcategory included. Strictly a superset.
   * On the current corpus: 7 against the 4 above, the difference being three
   * subcategory mistakes — real, and not the same severity as a wrong amount.
   */
  autoSaveCasesWithAnyScoredError: number;
  autoSavedCases: number;
  totalCases: number;
  tripleUnsafeRateOfAutoSaved: number | null;
  tripleUnsafeRateOfAllCases: number | null;
  anyErrorRateOfAutoSaved: number | null;
  /** Neither figure says anything about currency, date, or a correct database write. */
  doesNotCover: string[];
}

export interface CategoryDelta {
  category: string;
  precisionDelta: number | null;
  recallDelta: number | null;
  f1Delta: number | null;
}

export interface ComparedMetrics {
  baseline: CoreReportMetrics | null;
  candidate: CoreReportMetrics;
  delta: Record<string, number> | null;
}

export interface CoreReport {
  schemaVersion: string;
  provenance: CoreReportProvenance;
  definitions: Record<string, string>;
  warnings: string[];
  comparability: {
    compared: boolean;
    reason: string;
    /** Fingerprint fields that differ, when a comparison was refused. */
    mismatched: string[];
  };
  headline: ComparedMetrics;
  splits: { dev: ComparedMetrics; frozen: ComparedMetrics };
  decisions: {
    counts: Record<string, number>;
    baselineCounts: Record<string, number> | null;
    countsDelta: Record<string, number> | null;
    breakdown: DecisionBreakdown[];
    baselineBreakdown: DecisionBreakdown[] | null;
    autoSaveSafety: AutoSaveSafety;
    baselineAutoSaveSafety: AutoSaveSafety | null;
  };
  categories: CategoryScore[];
  categoryDelta: CategoryDelta[] | null;
  /** Conventional precision/recall over cases with a single acceptable category. */
  strictCategories: CategoryScore[];
  confusion: {
    matrix: Record<string, Record<string, number>>;
    missedByCategory: Record<string, number>;
    spuriousByCategory: Record<string, number>;
    convention: string;
  };
  cost: {
    totalTokens: number;
    totalCachedTokens: number;
    /** Renamed. Derived from parsedBy; NOT a network request counter. */
    derivedLlmRoutes: number;
    /** Kept under the old name so existing consumers keep working. */
    llmCalls: number;
    latencyP50: number;
    latencyP95: number;
    baselineDerivedLlmRoutes: number | null;
    note: string;
  };
}

const UNRESOLVED = "متنوعات";
const UNCATEGORISED = "(none)";

const DEFINITIONS: Record<string, string> = {
  match:
    "Pairs come from CaseScore.matches, which the scorer built by greedy first-fit on amount in narrative order. Reporting does not re-align. Where a case contains two equal amounts the alignment is positional, so a swap between them is invisible to every category figure here — BND-006, MON-002, MON-003 and FBND-002 are the cases in the current corpus with that property.",
  categoryOk:
    "An actual category is accepted when it equals the expected category, or is any member of the fixture's categoryAnyOf.",
  categoryPrecision:
    "acceptedAsProduced / every actual item of this category. Asks: when the classifier said this category, how often was that accepted?",
  categoryRecall:
    "acceptedAsExpected / every expected item of this category. Asks: when this category was expected, how often did the answer satisfy it?",
  lenientF1:
    "The harmonic mean of those two rates. Where categoryAnyOf applies they have different numerators, so this is an acceptance figure, not textbook F1. strictCategories reports the conventional numbers over cases with exactly one acceptable category.",
  nullVsZero:
    "null means the rate was not measurable — no denominator. 0 means it was measured and nothing was right. The first version of this report returned null for a measured total failure.",
  tripleUnsafeAutoSaveCases:
    "Auto-saved cases where amount, direction, category or item count was wrong. Unchanged from SystemMetrics.unsafeAutoSaves.",
  autoSaveCasesWithAnyScoredError:
    "Auto-saved cases with any scored failure, subcategory included. A superset of the above; the two differ by three subcategory errors on the current corpus.",
  derivedLlmRoutes:
    "Inferred from parsedBy after the run. Not a request counter: it cannot see retries, provider failover, or a chain that tried three routes for one logical call.",
  zeroTokensOffline:
    "In offline mode no provider is reached, so token and cost figures are zero by construction. They are not a production cost estimate, and local latency is not a production p95.",
  comparability:
    "Two runs are subtracted only when their evaluationFingerprint matches: same fixtures, count, mode, scorer, calibration table version, schema version and experiment settings. The classifier's own source is deliberately excluded — changing it is what a comparison measures. The calibration table is NOT: rebuilding it changes the probability on every item and so changes the measurement, which is why it sits inside the fingerprint and not beside it.",
};

/**
 * Takes the CONTRACT-parsed aggregate, not the scorer's own type.
 *
 * The schema above is narrow on purpose — only the fields this module reads — so
 * validating an evidence file does not require the scorer's full `AggregateScore`
 * to be reproduced here, where it would drift.
 */
type ParsedAggregate = z.infer<typeof aggregateSchema>;

function metricsOf(aggregate: ParsedAggregate): CoreReportMetrics {
  return {
    cases: aggregate.cases,
    expectedItems: aggregate.expectedItems,
    actualItems: aggregate.actualItems,
    tripleF1: aggregate.tripleF1,
    triplePrecision: aggregate.triplePrecision,
    tripleRecall: aggregate.tripleRecall,
    amountF1: aggregate.amountF1,
    typeAccuracy: aggregate.typeAccuracy,
    categoryAccuracy: aggregate.categoryAccuracy,
    segmentationExact: aggregate.segmentationExact,
    decisionAccuracy: aggregate.decisionAccuracy,
    taxonomyViolationRate: aggregate.taxonomyViolationRate,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Harmonic mean, with zero distinguished from unmeasured.
 *
 * Both rates measured and both zero is a MEASURED total failure, and the answer is 0.
 * Returning null there — as the first version did — reports a category that got
 * everything wrong as a category nobody looked at.
 */
function harmonic(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null) return null;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function bump(target: Record<string, number>, key: string): void {
  target[key] = (target[key] || 0) + 1;
}

function scoreCategoriesFromMatches(
  rows: CoreEvidenceRow[],
  onlySingleTarget: boolean,
): { categories: CategoryScore[]; confusion: CoreReport["confusion"] } {
  const actualTotals: Record<string, number> = {};
  const expectedTotals: Record<string, number> = {};
  const precisionHits: Record<string, number> = {};
  const recallHits: Record<string, number> = {};
  const matrix: Record<string, Record<string, number>> = {};
  const missedByCategory: Record<string, number> = {};
  const spuriousByCategory: Record<string, number> = {};

  for (const row of rows) {
    const expected = (row.case.expectedItems || []) as Array<{
      category?: string;
      categoryAnyOf?: string[];
    }>;
    const actual = row.result.items as Array<{ category?: string }>;

    // The strict view drops cases whose fixture accepts more than one category, which is
    // exactly where precision and recall stop sharing a numerator.
    if (onlySingleTarget && expected.some((item) => (item.categoryAnyOf || []).length > 1)) {
      continue;
    }

    for (const item of actual) bump(actualTotals, item.category || UNCATEGORISED);
    for (const item of expected) bump(expectedTotals, item.category || UNCATEGORISED);

    for (const match of row.score.matches) {
      const expectedItem =
        match.expectedIndex === null ? undefined : expected[match.expectedIndex];
      const actualItem = match.actualIndex === null ? undefined : actual[match.actualIndex];

      if (expectedItem && actualItem) {
        const expectedCategory = expectedItem.category || UNCATEGORISED;
        const actualCategory = actualItem.category || UNCATEGORISED;
        matrix[expectedCategory] = matrix[expectedCategory] || {};
        matrix[expectedCategory][actualCategory] =
          (matrix[expectedCategory][actualCategory] || 0) + 1;
        if (match.categoryOk) {
          bump(precisionHits, actualCategory);
          bump(recallHits, expectedCategory);
        }
        continue;
      }
      if (expectedItem) bump(missedByCategory, expectedItem.category || UNCATEGORISED);
      if (actualItem) bump(spuriousByCategory, actualItem.category || UNCATEGORISED);
    }
  }

  const names = [
    ...new Set([...Object.keys(actualTotals), ...Object.keys(expectedTotals)]),
  ].sort();

  const categories = names.map((category) => {
    const produced = precisionHits[category] || 0;
    const recovered = recallHits[category] || 0;
    const precisionDenominator = actualTotals[category] || 0;
    const recallDenominator = expectedTotals[category] || 0;
    const precision = ratio(produced, precisionDenominator);
    const recall = ratio(recovered, recallDenominator);
    return {
      category,
      acceptedAsProduced: produced,
      acceptedAsExpected: recovered,
      falsePositives: precisionDenominator - produced,
      falseNegatives: recallDenominator - recovered,
      precision,
      recall,
      f1: harmonic(precision, recall),
      precisionDenominator,
      recallDenominator,
    };
  });

  return {
    categories,
    confusion: {
      matrix,
      missedByCategory,
      spuriousByCategory,
      convention:
        "matrix[expected][actual] counts matched pairs only. An expected item with no counterpart appears in missedByCategory; an actual item with no counterpart appears in spuriousByCategory. The three together account for every item on both sides.",
    },
  };
}

function scoreDecisions(rows: CoreEvidenceRow[]): DecisionBreakdown[] {
  const byDecision = new Map<string, { cases: number; casesWithError: number }>();
  for (const row of rows) {
    const entry = byDecision.get(row.result.decision) || { cases: 0, casesWithError: 0 };
    entry.cases++;
    if (row.score.failures.length > 0) entry.casesWithError++;
    byDecision.set(row.result.decision, entry);
  }
  return [...byDecision.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([decision, entry]) => ({
      decision,
      cases: entry.cases,
      casesWithError: entry.casesWithError,
      errorRateWithinDecision: ratio(entry.casesWithError, entry.cases),
      denominator: entry.cases,
    }));
}

function autoSaveSafety(evidence: CoreEvidence): AutoSaveSafety {
  const rows = evidence.rows;
  const autoSaved = rows.filter((row) => row.result.decision === "auto_save");
  const anyError = autoSaved.filter((row) => row.score.failures.length > 0).length;
  const triple = evidence.system.unsafeAutoSaves;

  return {
    tripleUnsafeAutoSaveCases: triple,
    autoSaveCasesWithAnyScoredError: anyError,
    autoSavedCases: autoSaved.length,
    totalCases: rows.length,
    tripleUnsafeRateOfAutoSaved: ratio(triple, autoSaved.length),
    tripleUnsafeRateOfAllCases: ratio(triple, rows.length),
    anyErrorRateOfAutoSaved: ratio(anyError, autoSaved.length),
    doesNotCover: [
      "currency",
      "transaction date",
      "whether the row was written correctly to the database",
      "whether the user would have accepted it",
    ],
  };
}

function deltaOf(candidate: CoreReportMetrics, baseline: CoreReportMetrics): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(candidate) as Array<keyof CoreReportMetrics>) {
    out[key] = candidate[key] - baseline[key];
  }
  return out;
}

/** Which fingerprint fields differ. Empty means the two runs are comparable. */
export function fingerprintMismatch(
  candidate: EvaluationFingerprint,
  baseline: EvaluationFingerprint,
): string[] {
  const out: string[] = [];
  const simple: Array<keyof EvaluationFingerprint> = [
    "fixtureSha256",
    "caseCount",
    "mode",
    "scorerSha256",
    "calibrationVersion",
    "schemaVersion",
  ];
  for (const key of simple) {
    if (candidate[key] !== baseline[key]) {
      out.push(`${key}: ${String(baseline[key])} → ${String(candidate[key])}`);
    }
  }
  const keys = [
    ...new Set([...Object.keys(candidate.experiment), ...Object.keys(baseline.experiment)]),
  ].sort();
  for (const key of keys) {
    if (candidate.experiment[key] !== baseline.experiment[key]) {
      out.push(
        `experiment.${key}: ${String(baseline.experiment[key])} → ${String(candidate.experiment[key])}`,
      );
    }
  }
  return out;
}

/** A previous report, reduced to what a comparison needs. */
export const baselineSchema = z.object({
  schemaVersion: z.string(),
  provenance: z.looseObject({ fingerprint: evaluationFingerprintSchema }),
  headline: z.looseObject({ candidate: metricsSchema }),
  splits: z.object({
    dev: z.looseObject({ candidate: metricsSchema }),
    frozen: z.looseObject({ candidate: metricsSchema }),
  }),
  decisions: z.looseObject({
    counts: z.record(z.string(), count),
    breakdown: z.array(
      z.object({
        decision: z.string(),
        cases: count,
        casesWithError: count,
        errorRateWithinDecision: rate.nullable(),
        denominator: count,
      }),
    ),
    autoSaveSafety: z.object({
      tripleUnsafeAutoSaveCases: count,
      autoSaveCasesWithAnyScoredError: count,
      autoSavedCases: count,
      totalCases: count,
      tripleUnsafeRateOfAutoSaved: rate.nullable(),
      tripleUnsafeRateOfAllCases: rate.nullable(),
      anyErrorRateOfAutoSaved: rate.nullable(),
      doesNotCover: z.array(z.string()),
    }),
  }),
  categories: z.array(
    z.looseObject({
      category: z.string(),
      precision: rate.nullable(),
      recall: rate.nullable(),
      f1: rate.nullable(),
    }),
  ),
  cost: z.looseObject({ derivedLlmRoutes: finite.min(0) }),
});

export type CoreReportBaseline = z.infer<typeof baselineSchema>;

export interface BuildCoreReportInput {
  evidence: unknown;
  provenance: CoreReportProvenance;
  /** A previous report. Undefined means a first run; that is legitimate. */
  baseline?: unknown;
}

/** Thrown for a contract violation the caller must not paper over. */
export class CoreReportContractError extends Error {
  constructor(
    readonly subject: "evidence" | "baseline" | "report",
    message: string,
  ) {
    super(`${subject}: ${message}`);
    this.name = "CoreReportContractError";
  }
}

function describeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
    .join("; ");
}

export function buildCoreReport(input: BuildCoreReportInput): CoreReport {
  const parsedEvidence = coreEvidenceSchema.safeParse(input.evidence);
  if (!parsedEvidence.success) {
    throw new CoreReportContractError("evidence", describeZodError(parsedEvidence.error));
  }
  const evidence = parsedEvidence.data;
  const { provenance } = input;
  const warnings: string[] = [];

  // A baseline that was ASKED for and is unusable is an error.
  //
  // The first version type-asserted it, checked two properties existed, and subtracted.
  // A baseline containing only `{cases: 172}` produced `NaN` deltas beside a green run.
  let baseline: CoreReportBaseline | null = null;
  if (input.baseline !== undefined && input.baseline !== null) {
    const parsed = baselineSchema.safeParse(input.baseline);
    if (!parsed.success) {
      throw new CoreReportContractError("baseline", describeZodError(parsed.error));
    }
    baseline = parsed.data;
  }

  const candidate = metricsOf(evidence.overall);
  const devCandidate = metricsOf(evidence.dev);
  const frozenCandidate = metricsOf(evidence.frozen);

  let compared = false;
  let reason = "no baseline supplied; this run establishes one";
  let mismatched: string[] = [];

  if (baseline) {
    mismatched = fingerprintMismatch(provenance.fingerprint, baseline.provenance.fingerprint);
    if (mismatched.length > 0) {
      reason = "the two runs did not measure the same thing the same way; delta withheld";
      warnings.push(`NOT COMPARABLE — ${mismatched.join(" | ")}`);
    } else {
      compared = true;
      reason = "evaluationFingerprint matches on every field";
    }
  }

  if (provenance.fingerprint.mode === "offline") warnings.push(DEFINITIONS.zeroTokensOffline);
  if (provenance.git.dirty) {
    warnings.push(
      `Working tree was dirty at ${provenance.git.commit.slice(0, 12)} (${provenance.git.dirtyFiles.length} file(s)); this run is not reproducible from the commit alone.`,
    );
  }

  const unresolvedProduced = evidence.rows.reduce(
    (sum, row) =>
      sum +
      (row.result.items as Array<{ category?: string }>).filter(
        (item) => item.category === UNRESOLVED,
      ).length,
    0,
  );
  if (unresolvedProduced > 0) {
    warnings.push(
      `${unresolvedProduced} produced item(s) landed on the unresolved category "${UNRESOLVED}". They count against precision for that category, not as a separate failure mode.`,
    );
  }

  const lenient = scoreCategoriesFromMatches(evidence.rows, false);
  const strict = scoreCategoriesFromMatches(evidence.rows, true);
  const previousCategories =
    compared && baseline ? new Map(baseline.categories.map((c) => [c.category, c])) : null;

  const report: CoreReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    provenance,
    definitions: DEFINITIONS,
    warnings,
    comparability: { compared, reason, mismatched },
    headline: {
      baseline: compared && baseline ? baseline.headline.candidate : null,
      candidate,
      delta: compared && baseline ? deltaOf(candidate, baseline.headline.candidate) : null,
    },
    splits: {
      dev: {
        baseline: compared && baseline ? baseline.splits.dev.candidate : null,
        candidate: devCandidate,
        delta: compared && baseline ? deltaOf(devCandidate, baseline.splits.dev.candidate) : null,
      },
      frozen: {
        baseline: compared && baseline ? baseline.splits.frozen.candidate : null,
        candidate: frozenCandidate,
        delta:
          compared && baseline
            ? deltaOf(frozenCandidate, baseline.splits.frozen.candidate)
            : null,
      },
    },
    decisions: {
      counts: evidence.decisions,
      baselineCounts: compared && baseline ? baseline.decisions.counts : null,
      countsDelta:
        compared && baseline
          ? Object.fromEntries(
              [
                ...new Set([
                  ...Object.keys(evidence.decisions),
                  ...Object.keys(baseline.decisions.counts),
                ]),
              ]
                .sort()
                .map((key) => [
                  key,
                  (evidence.decisions[key] || 0) - (baseline.decisions.counts[key] || 0),
                ]),
            )
          : null,
      breakdown: scoreDecisions(evidence.rows),
      baselineBreakdown: compared && baseline ? baseline.decisions.breakdown : null,
      autoSaveSafety: autoSaveSafety(evidence),
      baselineAutoSaveSafety: compared && baseline ? baseline.decisions.autoSaveSafety : null,
    },
    categories: lenient.categories,
    categoryDelta: previousCategories
      ? lenient.categories.map((current) => {
          const previous = previousCategories.get(current.category);
          const diff = (a: number | null, b: number | null | undefined): number | null =>
            a === null || b === null || b === undefined ? null : a - b;
          return {
            category: current.category,
            precisionDelta: diff(current.precision, previous?.precision),
            recallDelta: diff(current.recall, previous?.recall),
            f1Delta: diff(current.f1, previous?.f1),
          };
        })
      : null,
    strictCategories: strict.categories,
    confusion: lenient.confusion,
    cost: {
      totalTokens: evidence.overall.cost.totalTokens,
      totalCachedTokens: evidence.overall.cost.totalCachedTokens,
      derivedLlmRoutes: evidence.overall.cost.llmCalls,
      llmCalls: evidence.overall.cost.llmCalls,
      latencyP50: evidence.overall.cost.latencyP50,
      latencyP95: evidence.overall.cost.latencyP95,
      baselineDerivedLlmRoutes: compared && baseline ? baseline.cost.derivedLlmRoutes : null,
      note: DEFINITIONS.derivedLlmRoutes,
    },
  };

  assertReportSane(report);
  return report;
}

/**
 * Last check before the report leaves this module.
 *
 * Every number here gets quoted by someone who will not re-derive it, so a NaN, an
 * Infinity, a negative count or a rate above one must not reach the file. The first
 * version shipped `recall: 1.25` and `falseNegatives: -3`.
 */
export function assertReportSane(report: CoreReport): void {
  const problems: string[] = [];

  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        walk(value, path ? `${path}.${key}` : key);
      }
      return;
    }
    if (typeof node === "number" && !Number.isFinite(node)) {
      problems.push(`${path} is ${String(node)}`);
    }
  };
  walk(report, "");

  for (const entry of [...report.categories, ...report.strictCategories]) {
    for (const [name, value] of [
      ["precision", entry.precision],
      ["recall", entry.recall],
      ["f1", entry.f1],
    ] as const) {
      if (value !== null && (value < 0 || value > 1)) {
        problems.push(`${entry.category}.${name} = ${value} is outside [0,1]`);
      }
    }
    if (entry.falsePositives < 0) problems.push(`${entry.category}.falsePositives is negative`);
    if (entry.falseNegatives < 0) problems.push(`${entry.category}.falseNegatives is negative`);
    if (entry.acceptedAsProduced > entry.precisionDenominator) {
      problems.push(`${entry.category}: precision numerator exceeds its denominator`);
    }
    if (entry.acceptedAsExpected > entry.recallDenominator) {
      problems.push(`${entry.category}: recall numerator exceeds its denominator`);
    }
  }

  const safety = report.decisions.autoSaveSafety;
  if (safety.autoSaveCasesWithAnyScoredError < safety.tripleUnsafeAutoSaveCases) {
    problems.push(
      "autoSaveCasesWithAnyScoredError is smaller than tripleUnsafeAutoSaveCases; the wider measure must be a superset",
    );
  }
  if (safety.autoSavedCases > safety.totalCases) {
    problems.push("more auto-saved cases than cases");
  }

  if (problems.length > 0) {
    throw new CoreReportContractError("report", problems.slice(0, 8).join("; "));
  }
}
