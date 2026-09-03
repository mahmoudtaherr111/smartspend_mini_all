/**
 * System-level metrics — the dimensions that item accuracy alone cannot express.
 *
 * Accuracy answers "was the category right". These answer the four product objectives:
 *
 *   1. COST        — tokens per item, cache hit ratio, LLM call count.
 *   2. NEVER BREAK — crash rate, empty-output rate, and UNSAFE AUTO-SAVE: the pipeline
 *                    silently persisting a wrong transaction because its confidence
 *                    said it was sure. That is the failure that corrupts wallets,
 *                    charts and the admin dashboard without anyone noticing.
 *   3. SPEED       — latency distribution, sliced by input length.
 *   4. SOUNDNESS   — is `confidence` actually predictive of correctness? A confidence
 *                    score that does not separate right from wrong makes every
 *                    threshold in smart-pipeline.ts arbitrary.
 *
 * Plus SEGMENTATION DEPTH: counting items is not enough. A merge error (two
 * transactions collapsed into one) and a split error (one compound number torn into
 * two transactions) are different bugs with different fixes, and the raw count delta
 * conflates them.
 */
import type { BenchmarkCase } from "./fixtures/classification-cases.types";
import type { CaseScore, ScorableResult } from "./classification-scorer";

export const AMOUNT_EPS = 0.005;

export interface ConfidenceBin {
  /** Lower bound of the bin, e.g. 0.9 means [90,100]. */
  lower: number;
  count: number;
  meanConfidence: number;
  accuracy: number;
}

export interface SegmentationDiagnosis {
  /** Expected items collapsed into one actual item (sum matched). */
  mergeErrors: number;
  /**
   * One expected amount torn into several actual items that sum back to it.
   * This is the fingerprint of a compound word-number ("ميتين وخمسين") being split
   * on its internal waw.
   */
  splitErrors: number;
  /** Split errors where every fragment is itself a clean number — number composition. */
  numberCompositionErrors: number;
  /** Amounts present in neither direction — genuinely lost or invented. */
  unexplainedMissing: number;
  unexplainedSpurious: number;
}

/**
 * Accuracy per resolver. This is the measurement the calibration table is built from —
 * and the answer to a question the admin dashboard has never been able to answer,
 * because AVG(confidence) GROUP BY parsedBy averages numbers from different generators.
 */
export interface ResolverAccuracy {
  matchKind: string;
  items: number;
  correct: number;
  accuracy: number;
  meanRawStrength: number;
  /** Gap between what the resolver claimed and what it delivered. */
  overconfidence: number;
}

export interface SystemMetrics {
  cases: number;
  /** Empty until the classifier records provenance on its items. */
  byResolver: ResolverAccuracy[];

  // ── objective 2: never break ──
  crashes: number;
  crashRate: number;
  /** Expected transactions but produced none. */
  emptyOnValidInput: number;
  emptyOnValidInputRate: number;
  /** Produced transactions for input that must yield none (negation, queries, chatter). */
  spuriousOnNonFinancial: number;
  /**
   * THE safety metric: decision was auto_save while at least one item was wrong.
   * Every one of these is a wrong row written to expenses without the user
   * being asked, and therefore a wrong row in every downstream report.
   */
  unsafeAutoSaves: number;
  unsafeAutoSaveRate: number;
  /** Asked the user to clarify something it actually got right — friction, not danger. */
  needlessClarifications: number;

  // ── objective 4: is confidence meaningful? ──
  meanConfidenceWhenCorrect: number;
  meanConfidenceWhenWrong: number;
  /** Positive means confidence separates right from wrong. Near zero means it is noise. */
  confidenceSeparation: number;
  /** Expected Calibration Error: |confidence - accuracy| weighted by bin population. */
  expectedCalibrationError: number;
  bins: ConfidenceBin[];
  /** Items the pipeline was >=90 sure about and got wrong — the worst quadrant. */
  confidentlyWrong: number;
  /** confidentlyWrong as a share of all scored items, so it survives dataset growth. */
  confidentlyWrongRate: number;

  // ── segmentation depth ──
  segmentation: SegmentationDiagnosis;

  // ── objective 3: speed ──
  latencyByLength: Array<{ bucket: string; cases: number; p50: number; p95: number }>;

  // ── admin dashboard data integrity ──
  admin: {
    /** parsedBy values actually observed. Anything outside the known set breaks grouping. */
    parsedByValues: Record<string, number>;
    /** Results carrying no usable decision — a hole in the funnel report. */
    missingDecision: number;
    /** Results whose confidence is absent or out of the 0-100 range. */
    invalidConfidence: number;
    /** actualModelUsed null while an LLM path was taken (cost attribution hole). */
    missingModelAttribution: number;
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}

/**
 * Classify the count mismatch instead of merely reporting it.
 *
 * A missing expected amount that equals the sum of >=2 spurious actual amounts is a
 * SPLIT. A spurious actual amount that equals the sum of >=2 missing expected amounts
 * is a MERGE. Anything left over is genuinely lost or invented.
 */
export function diagnoseSegmentation(
  c: BenchmarkCase,
  score: CaseScore,
  result: ScorableResult,
): SegmentationDiagnosis {
  const missing = score.matches
    .filter((m) => m.actualIndex === null && m.expectedIndex !== null)
    .map((m) => c.expectedItems[m.expectedIndex as number].amount);
  const spurious = score.matches
    .filter((m) => m.expectedIndex === null && m.actualIndex !== null)
    .map((m) => Number(result.items[m.actualIndex as number].amount));

  const usedSpurious = new Set<number>();
  const usedMissing = new Set<number>();
  let splitErrors = 0;
  let numberCompositionErrors = 0;
  let mergeErrors = 0;

  // SPLIT: one expected amount == sum of a subset of spurious amounts.
  for (let mi = 0; mi < missing.length; mi++) {
    const target = missing[mi];
    const pool = spurious
      .map((v, i) => ({ v, i }))
      .filter((x) => !usedSpurious.has(x.i) && x.v < target + AMOUNT_EPS);
    const combo = findSubsetSummingTo(pool, target);
    if (combo && combo.length >= 2) {
      combo.forEach((x) => usedSpurious.add(x.i));
      usedMissing.add(mi);
      splitErrors++;
      // Every fragment being a round contributor to the whole is the signature of a
      // compound numeral torn apart, not of two real transactions.
      if (combo.every((x) => Number.isFinite(x.v) && x.v > 0)) {
        numberCompositionErrors++;
      }
    }
  }

  // MERGE: one spurious amount == sum of a subset of remaining expected amounts.
  for (let si = 0; si < spurious.length; si++) {
    if (usedSpurious.has(si)) continue;
    const target = spurious[si];
    const pool = missing
      .map((v, i) => ({ v, i }))
      .filter((x) => !usedMissing.has(x.i) && x.v < target + AMOUNT_EPS);
    const combo = findSubsetSummingTo(pool, target);
    if (combo && combo.length >= 2) {
      combo.forEach((x) => usedMissing.add(x.i));
      usedSpurious.add(si);
      mergeErrors++;
    }
  }

  return {
    mergeErrors,
    splitErrors,
    numberCompositionErrors,
    unexplainedMissing: missing.length - usedMissing.size,
    unexplainedSpurious: spurious.length - usedSpurious.size,
  };
}

/** Small exhaustive subset search — capped, because these arrays are tiny. */
function findSubsetSummingTo(
  pool: Array<{ v: number; i: number }>,
  target: number,
): Array<{ v: number; i: number }> | null {
  const n = Math.min(pool.length, 12);
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    const picked: Array<{ v: number; i: number }> = [];
    for (let b = 0; b < n; b++) {
      if (mask & (1 << b)) {
        sum += pool[b].v;
        picked.push(pool[b]);
      }
    }
    if (picked.length >= 2 && Math.abs(sum - target) <= AMOUNT_EPS * picked.length) {
      return picked;
    }
  }
  return null;
}

export interface SystemMetricInput {
  case: BenchmarkCase;
  score: CaseScore;
  result: ScorableResult;
  crashed?: boolean;
}

export function computeSystemMetrics(rows: SystemMetricInput[]): SystemMetrics {
  const confCorrect: number[] = [];
  const confWrong: number[] = [];
  const binMap = new Map<number, { correct: number; total: number; conf: number[] }>();

  let crashes = 0;
  let emptyOnValidInput = 0;
  let spuriousOnNonFinancial = 0;
  let unsafeAutoSaves = 0;
  let needlessClarifications = 0;
  let confidentlyWrong = 0;

  const seg: SegmentationDiagnosis = {
    mergeErrors: 0,
    splitErrors: 0,
    numberCompositionErrors: 0,
    unexplainedMissing: 0,
    unexplainedSpurious: 0,
  };

  const parsedByValues: Record<string, number> = {};
  let missingDecision = 0;
  let invalidConfidence = 0;
  let missingModelAttribution = 0;

  const lengthBuckets: Record<string, number[]> = {
    "قصير (<40 حرف)": [],
    "متوسط (40-150)": [],
    "طويل (150-400)": [],
    "سرد (>400)": [],
  };

  for (const row of rows) {
    const { case: c, score, result } = row;
    if (row.crashed) crashes++;

    const expectsItems = c.expectedItems.length > 0;
    if (expectsItems && score.actualCount === 0) emptyOnValidInput++;
    if (!expectsItems && score.actualCount > 0) spuriousOnNonFinancial++;

    const allCorrect =
      score.tripleHits === score.expectedCount && score.spurious === 0 && score.countExact;

    if (result.decision === "auto_save" && !allCorrect) unsafeAutoSaves++;
    if (result.decision === "clarify" && allCorrect) needlessClarifications++;

    // Per-item confidence calibration.
    for (const m of score.matches) {
      if (m.actualIndex === null) continue;
      const item = result.items[m.actualIndex];
      const conf = Number(item?.confidence);
      if (!Number.isFinite(conf) || conf < 0 || conf > 100) {
        invalidConfidence++;
        continue;
      }
      const correct = m.amountOk && m.typeOk && m.categoryOk;
      if (correct) confCorrect.push(conf);
      else confWrong.push(conf);
      if (!correct && conf >= 90) confidentlyWrong++;

      const lower = Math.min(0.9, Math.floor(conf / 10) / 10);
      const bin = binMap.get(lower) ?? { correct: 0, total: 0, conf: [] };
      bin.total++;
      if (correct) bin.correct++;
      bin.conf.push(conf);
      binMap.set(lower, bin);
    }

    const d = diagnoseSegmentation(c, score, result);
    seg.mergeErrors += d.mergeErrors;
    seg.splitErrors += d.splitErrors;
    seg.numberCompositionErrors += d.numberCompositionErrors;
    seg.unexplainedMissing += d.unexplainedMissing;
    seg.unexplainedSpurious += d.unexplainedSpurious;

    const pb = String(result.parsedBy || "MISSING");
    parsedByValues[pb] = (parsedByValues[pb] || 0) + 1;
    if (!result.decision) missingDecision++;
    if ((pb === "hybrid" || pb === "ai") && !result.actualModelUsed) {
      missingModelAttribution++;
    }

    const len = c.text.length;
    const key =
      len < 40
        ? "قصير (<40 حرف)"
        : len < 150
          ? "متوسط (40-150)"
          : len < 400
            ? "طويل (150-400)"
            : "سرد (>400)";
    lengthBuckets[key].push(score.cost.processingTimeMs);
  }

  const bins: ConfidenceBin[] = [...binMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lower, b]) => ({
      lower,
      count: b.total,
      meanConfidence: mean(b.conf) / 100,
      accuracy: b.total === 0 ? 0 : b.correct / b.total,
    }));

  const totalBinned = bins.reduce((a, b) => a + b.count, 0);
  const expectedCalibrationError =
    totalBinned === 0
      ? 0
      : bins.reduce(
          (a, b) => a + (b.count / totalBinned) * Math.abs(b.meanConfidence - b.accuracy),
          0,
        );

  const mc = mean(confCorrect);
  const mw = mean(confWrong);

  const resolverStats = new Map<string, { items: number; correct: number; strength: number[] }>();
  for (const row of rows) {
    for (const m of row.score.matches) {
      if (m.actualIndex === null) continue;
      const item = row.result.items[m.actualIndex];
      const kind = item?.evidence?.matchKind;
      if (!kind) continue;
      const st = resolverStats.get(kind) ?? { items: 0, correct: 0, strength: [] };
      st.items++;
      if (m.amountOk && m.typeOk && m.categoryOk) st.correct++;
      st.strength.push(Number(item.evidence?.rawStrength ?? 0));
      resolverStats.set(kind, st);
    }
  }
  const byResolver: ResolverAccuracy[] = [...resolverStats.entries()]
    .map(([matchKind, st]) => {
      const accuracy = st.items === 0 ? 0 : st.correct / st.items;
      const meanRawStrength = mean(st.strength);
      return {
        matchKind,
        items: st.items,
        correct: st.correct,
        accuracy,
        meanRawStrength,
        overconfidence: meanRawStrength / 100 - accuracy,
      };
    })
    .sort((a, b) => b.overconfidence - a.overconfidence);

  return {
    cases: rows.length,
    byResolver,

    crashes,
    crashRate: rows.length === 0 ? 0 : crashes / rows.length,
    emptyOnValidInput,
    emptyOnValidInputRate: rows.length === 0 ? 0 : emptyOnValidInput / rows.length,
    spuriousOnNonFinancial,
    unsafeAutoSaves,
    unsafeAutoSaveRate: rows.length === 0 ? 0 : unsafeAutoSaves / rows.length,
    needlessClarifications,

    meanConfidenceWhenCorrect: mc,
    meanConfidenceWhenWrong: mw,
    confidenceSeparation: mc - mw,
    expectedCalibrationError,
    bins,
    confidentlyWrong,
    confidentlyWrongRate: totalBinned === 0 ? 0 : confidentlyWrong / totalBinned,

    segmentation: seg,

    latencyByLength: Object.entries(lengthBuckets)
      .filter(([, v]) => v.length > 0)
      .map(([bucket, v]) => ({
        bucket,
        cases: v.length,
        p50: percentile(v, 50),
        p95: percentile(v, 95),
      })),

    admin: {
      parsedByValues,
      missingDecision,
      invalidConfidence,
      missingModelAttribution,
    },
  };
}
