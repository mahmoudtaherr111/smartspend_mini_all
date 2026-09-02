/**
 * Classification benchmark scorer — pure functions, zero I/O.
 *
 * Per-case pass/fail is too coarse for a 14-transaction narrative: "got 13 of 14"
 * and "got 4 of 14" must not look the same. Scoring is therefore item-level.
 *
 * Alignment is anchored on AMOUNT, because amount is the one field the product
 * cannot get wrong without corrupting the ledger, the wallets and the charts.
 */
import type {
  BenchmarkCase,
  BenchBucket,
  BenchTier,
  ExpectedItem,
  TxType,
} from "./fixtures/classification-cases.types";
import { checkTaxonomyPair } from "../lib/benchmark-taxonomy-assert";

/** Survives 50.75, 1250.50, 1.5 and 0.05 without float noise. */
export const AMOUNT_EPS = 0.005;

/** The exact Arabic string smart-pipeline emits when the LLM response was unusable. */
export const TRUNCATION_FINGERPRINT =
  "عذراً، الجملة طويلة ومفصلة ولم أتمكن من استخراج العمليات";

/**
 * Structural shape of what the pipeline returns — kept local so the scorer never
 * imports smart-pipeline (which opens a MySQL pool at module load).
 */
export interface ScorableItem {
  amount: number;
  category: string;
  subCategory?: string | null;
  type?: string;
  person_mentioned?: string | null;
  confidence?: number;
}

export interface ScorableResult {
  items: ScorableItem[];
  decision?: string;
  clarificationQuestion?: string;
  overallConfidence?: number;
  tokensUsed?: number;
  cachedTokens?: number;
  parsedBy?: string;
  actualModelUsed?: string | null;
  processingTimeMs?: number;
}

export type ScorePass = "local" | "scripted" | "live";

export interface ItemMatch {
  expectedIndex: number | null;
  actualIndex: number | null;
  amountOk: boolean;
  typeOk: boolean;
  categoryOk: boolean;
  /** null means not scored (no expectation, or subCategoryMode "soft"). */
  subCategoryOk: boolean | null;
  personOk: boolean | null;
  taxonomyLegal: boolean;
  taxonomyReason?: string;
}

export interface CaseCost {
  processingTimeMs: number;
  tokensUsed: number;
  cachedTokens: number;
  /**
   * DERIVED and undercounting: PipelineResult has no call counter, and the Gemini
   * retry loop (smart-pipeline.ts:1311-1326) can fire 3 requests for one logical call.
   */
  llmCalls: number;
  parsedBy: string;
  actualModelUsed: string | null;
  /** Structural truncation detection — see TRUNCATION_FINGERPRINT. */
  truncationSuspected: boolean;
}

export interface CaseScore {
  id: string;
  bucket: BenchBucket;
  tier: BenchTier;
  pass: ScorePass;
  expectedCount: number;
  actualCount: number;
  countExact: boolean;
  countDelta: number;
  matched: number;
  spurious: number;
  missed: number;
  typeHits: number;
  categoryHits: number;
  /** amount AND type AND category — the headline unit. */
  tripleHits: number;
  subScored: number;
  subHits: number;
  personScored: number;
  personHits: number;
  taxonomyViolations: number;
  /** Landed on the fallback category while something else was expected — the D2 signal. */
  miscFallbacks: number;
  expectedExpenseSum: number;
  actualExpenseSum: number;
  expectedIncomeSum: number;
  actualIncomeSum: number;
  sumErrorEgp: number;
  sumAccuracy: number;
  decisionOk: boolean | null;
  questionOk: boolean | null;
  matches: ItemMatch[];
  cost: CaseCost;
  failures: string[];
}

export interface AggregateScore {
  cases: number;
  expectedItems: number;
  actualItems: number;

  amountPrecision: number;
  amountRecall: number;
  amountF1: number;
  triplePrecision: number;
  tripleRecall: number;
  tripleF1: number;
  typeAccuracy: number;
  categoryAccuracy: number;
  subCategoryAccuracy: number;
  personAccuracy: number;

  segmentationExact: number;
  countMae: number;
  overSegmentRate: number;
  underSegmentRate: number;

  hallucinationRate: number;
  taxonomyViolationRate: number;
  miscFallbackRate: number;
  decisionAccuracy: number;

  sumAccuracyMean: number;
  totalSumErrorEgp: number;

  cost: {
    totalTokens: number;
    totalCachedTokens: number;
    cachedTokenRatio: number;
    llmCalls: number;
    tokensPerCaseMean: number;
    tokensPerItemMean: number;
    latencyP50: number;
    latencyP95: number;
    latencyMax: number;
    parsedByDistribution: Record<string, number>;
    truncationSuspectedCount: number;
  };
}

/** The fallback category every unresolved classification collapses into. */
const FALLBACK_CATEGORY = "متنوعات";

// ─── Matching ──────────────────────────────────────────────────────

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_EPS;
}

/**
 * Greedy first-fit alignment in narrative order. Ties break by first occurrence,
 * which is what makes a narrative containing two equal amounts align the way a
 * reader would align them.
 */
export function matchItems(
  expected: ExpectedItem[],
  actual: ScorableItem[],
): Array<{ expectedIndex: number | null; actualIndex: number | null }> {
  const used = new Set<number>();
  const pairs: Array<{ expectedIndex: number | null; actualIndex: number | null }> = [];

  for (let i = 0; i < expected.length; i++) {
    let found = -1;
    for (let j = 0; j < actual.length; j++) {
      if (used.has(j)) continue;
      if (amountsEqual(Number(actual[j].amount), expected[i].amount)) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      used.add(found);
      pairs.push({ expectedIndex: i, actualIndex: found });
    } else {
      pairs.push({ expectedIndex: i, actualIndex: null });
    }
  }
  for (let j = 0; j < actual.length; j++) {
    if (!used.has(j)) pairs.push({ expectedIndex: null, actualIndex: j });
  }
  return pairs;
}

function typeMatches(expected: ExpectedItem, actualType: string | undefined): boolean {
  const t = String(actualType || "");
  if (expected.typeAnyOf && expected.typeAnyOf.length > 0) {
    return expected.typeAnyOf.includes(t as TxType);
  }
  return t === expected.type;
}

function categoryMatches(expected: ExpectedItem, actualCategory: string): boolean {
  const c = String(actualCategory || "");
  if (expected.categoryAnyOf && expected.categoryAnyOf.length > 0) {
    return expected.categoryAnyOf.includes(c);
  }
  return c === expected.category;
}

function subMatches(
  expected: ExpectedItem,
  actualSub: string | null | undefined,
): boolean | null {
  if (expected.subCategoryMode === "soft") return null;
  const s = String(actualSub || "");
  if (expected.subCategoryAnyOf && expected.subCategoryAnyOf.length > 0) {
    return expected.subCategoryAnyOf.includes(s);
  }
  if (expected.subCategory) return s === expected.subCategory;
  return null;
}

function sumBy(items: Array<{ amount: number; type?: string }>, type: string): number {
  return items
    .filter((i) => String(i.type || "expense") === type)
    .reduce((acc, i) => acc + Number(i.amount || 0), 0);
}

function sumExpectedBy(items: ExpectedItem[], type: TxType): number {
  return items.filter((i) => i.type === type).reduce((acc, i) => acc + i.amount, 0);
}

// ─── Per-case scoring ──────────────────────────────────────────────

export function scoreCase(
  c: BenchmarkCase,
  result: ScorableResult,
  pass: ScorePass,
): CaseScore {
  const expected = c.expectedItems;
  const actual = result.items || [];
  const pairs = matchItems(expected, actual);
  const failures: string[] = [];

  const matches: ItemMatch[] = pairs.map((p) => {
    if (p.expectedIndex !== null && p.actualIndex !== null) {
      const e = expected[p.expectedIndex];
      const a = actual[p.actualIndex];
      const tax = checkTaxonomyPair(a.category, a.subCategory);
      const typeOk = typeMatches(e, a.type);
      const categoryOk = categoryMatches(e, a.category);
      const subOk = subMatches(e, a.subCategory);
      const personOk = e.personMentioned
        ? String(a.person_mentioned || "") === e.personMentioned
        : null;

      const n = p.expectedIndex + 1;
      if (!typeOk) {
        failures.push(`#${n} (${e.amount}) اتجاه: متوقع ${e.type} — الناتج ${a.type}`);
      }
      if (!categoryOk) {
        failures.push(`#${n} (${e.amount}) فئة: متوقع ${e.category} — الناتج ${a.category}`);
      }
      if (subOk === false) {
        failures.push(
          `#${n} (${e.amount}) فرعية: متوقع ${e.subCategory} — الناتج ${a.subCategory}`,
        );
      }
      if (!tax.legal) failures.push(`#${n} تصنيف غير شرعي: ${tax.reason}`);

      return {
        expectedIndex: p.expectedIndex,
        actualIndex: p.actualIndex,
        amountOk: true,
        typeOk,
        categoryOk,
        subCategoryOk: subOk,
        personOk,
        taxonomyLegal: tax.legal,
        taxonomyReason: tax.reason,
      };
    }

    if (p.expectedIndex !== null) {
      const e = expected[p.expectedIndex];
      failures.push(
        `#${p.expectedIndex + 1} مفقود: ${e.amount} · ${e.type} · ${e.category}` +
          (e.why ? ` (${e.why})` : ""),
      );
      return {
        expectedIndex: p.expectedIndex,
        actualIndex: null,
        amountOk: false,
        typeOk: false,
        categoryOk: false,
        subCategoryOk: null,
        personOk: null,
        taxonomyLegal: true,
      };
    }

    const a = actual[p.actualIndex as number];
    const tax = checkTaxonomyPair(a.category, a.subCategory);
    failures.push(`زائد (هلوسة): ${a.amount} · ${a.type} · ${a.category}`);
    return {
      expectedIndex: null,
      actualIndex: p.actualIndex,
      amountOk: false,
      typeOk: false,
      categoryOk: false,
      subCategoryOk: null,
      personOk: null,
      taxonomyLegal: tax.legal,
      taxonomyReason: tax.reason,
    };
  });

  const matched = matches.filter(
    (m) => m.expectedIndex !== null && m.actualIndex !== null,
  ).length;
  const missed = matches.filter((m) => m.actualIndex === null).length;
  const spurious = matches.filter((m) => m.expectedIndex === null).length;

  const typeHits = matches.filter((m) => m.amountOk && m.typeOk).length;
  const categoryHits = matches.filter((m) => m.amountOk && m.categoryOk).length;
  const tripleHits = matches.filter((m) => m.amountOk && m.typeOk && m.categoryOk).length;

  const subScoredMatches = matches.filter((m) => m.subCategoryOk !== null);
  const personScoredMatches = matches.filter((m) => m.personOk !== null);

  const miscFallbacks = matches.filter((m) => {
    if (m.expectedIndex === null || m.actualIndex === null) return false;
    const e = expected[m.expectedIndex];
    const a = actual[m.actualIndex];
    return a.category === FALLBACK_CATEGORY && e.category !== FALLBACK_CATEGORY;
  }).length;

  const expectedExpenseSum = sumExpectedBy(expected, "expense");
  const expectedIncomeSum = sumExpectedBy(expected, "income");
  const actualExpenseSum = sumBy(actual, "expense");
  const actualIncomeSum = sumBy(actual, "income");
  const sumErrorEgp =
    Math.abs(expectedExpenseSum - actualExpenseSum) +
    Math.abs(expectedIncomeSum - actualIncomeSum);
  const expectedGross = Math.max(expectedExpenseSum + expectedIncomeSum, 1);
  const sumAccuracy = Math.max(0, Math.min(1, 1 - sumErrorEgp / expectedGross));

  const expectedCount = c.expectedItemCount ?? expected.length;
  const countDelta = actual.length - expectedCount;
  if (countDelta !== 0) {
    failures.push(`عدد العمليات: متوقع ${expectedCount} — الناتج ${actual.length}`);
  }

  let decisionOk: boolean | null = null;
  if (c.allowedDecisions && c.allowedDecisions.length > 0) {
    decisionOk = (c.allowedDecisions as string[]).includes(String(result.decision));
  } else if (c.expectedDecision) {
    decisionOk = result.decision === c.expectedDecision;
  }
  if (decisionOk === false) {
    const want = c.expectedDecision ?? (c.allowedDecisions || []).join("|");
    failures.push(`القرار: متوقع ${want} — الناتج ${result.decision}`);
  }

  let questionOk: boolean | null = null;
  if (c.expectedQuestionIncludes) {
    questionOk = String(result.clarificationQuestion || "").includes(
      c.expectedQuestionIncludes,
    );
    if (!questionOk) {
      failures.push(`سؤال التوضيح لا يحتوي: "${c.expectedQuestionIncludes}"`);
    }
  }

  const parsedBy = String(result.parsedBy || "unknown");
  const truncationSuspected =
    actual.length === 0 &&
    result.decision === "clarify" &&
    String(result.clarificationQuestion || "").includes(TRUNCATION_FINGERPRINT);

  return {
    id: c.id,
    bucket: c.bucket,
    tier: c.tier,
    pass,
    expectedCount,
    actualCount: actual.length,
    countExact: countDelta === 0,
    countDelta,
    matched,
    spurious,
    missed,
    typeHits,
    categoryHits,
    tripleHits,
    subScored: subScoredMatches.length,
    subHits: subScoredMatches.filter((m) => m.subCategoryOk === true).length,
    personScored: personScoredMatches.length,
    personHits: personScoredMatches.filter((m) => m.personOk === true).length,
    taxonomyViolations: matches.filter((m) => !m.taxonomyLegal).length,
    miscFallbacks,
    expectedExpenseSum,
    actualExpenseSum,
    expectedIncomeSum,
    actualIncomeSum,
    sumErrorEgp,
    sumAccuracy,
    decisionOk,
    questionOk,
    matches,
    cost: {
      processingTimeMs: Number(result.processingTimeMs || 0),
      tokensUsed: Number(result.tokensUsed || 0),
      cachedTokens: Number(result.cachedTokens || 0),
      llmCalls: parsedBy === "hybrid" || parsedBy === "ai" ? 1 : 0,
      parsedBy,
      actualModelUsed: result.actualModelUsed ?? null,
      truncationSuspected,
    },
    failures,
  };
}

// ─── Aggregation ───────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function ratio(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

function f1(p: number, r: number): number {
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

export function aggregate(scores: CaseScore[]): AggregateScore {
  const expectedItems = scores.reduce((a, s) => a + s.expectedCount, 0);
  const actualItems = scores.reduce((a, s) => a + s.actualCount, 0);
  const matched = scores.reduce((a, s) => a + s.matched, 0);
  const tripleHits = scores.reduce((a, s) => a + s.tripleHits, 0);
  const spurious = scores.reduce((a, s) => a + s.spurious, 0);

  const amountPrecision = ratio(matched, actualItems);
  const amountRecall = ratio(matched, expectedItems);
  const triplePrecision = ratio(tripleHits, actualItems);
  const tripleRecall = ratio(tripleHits, expectedItems);

  const subScored = scores.reduce((a, s) => a + s.subScored, 0);
  const personScored = scores.reduce((a, s) => a + s.personScored, 0);
  const decisionScored = scores.filter((s) => s.decisionOk !== null);

  const latencies = scores.map((s) => s.cost.processingTimeMs).sort((a, b) => a - b);
  const totalTokens = scores.reduce((a, s) => a + s.cost.tokensUsed, 0);
  const totalCachedTokens = scores.reduce((a, s) => a + s.cost.cachedTokens, 0);

  const parsedByDistribution: Record<string, number> = {};
  for (const s of scores) {
    parsedByDistribution[s.cost.parsedBy] = (parsedByDistribution[s.cost.parsedBy] || 0) + 1;
  }

  return {
    cases: scores.length,
    expectedItems,
    actualItems,

    amountPrecision,
    amountRecall,
    amountF1: f1(amountPrecision, amountRecall),
    triplePrecision,
    tripleRecall,
    tripleF1: f1(triplePrecision, tripleRecall),
    typeAccuracy: ratio(
      scores.reduce((a, s) => a + s.typeHits, 0),
      matched,
    ),
    categoryAccuracy: ratio(
      scores.reduce((a, s) => a + s.categoryHits, 0),
      matched,
    ),
    subCategoryAccuracy: ratio(
      scores.reduce((a, s) => a + s.subHits, 0),
      subScored,
    ),
    personAccuracy: ratio(
      scores.reduce((a, s) => a + s.personHits, 0),
      personScored,
    ),

    segmentationExact: ratio(scores.filter((s) => s.countExact).length, scores.length),
    countMae: ratio(
      scores.reduce((a, s) => a + Math.abs(s.countDelta), 0),
      scores.length,
    ),
    overSegmentRate: ratio(scores.filter((s) => s.countDelta > 0).length, scores.length),
    underSegmentRate: ratio(scores.filter((s) => s.countDelta < 0).length, scores.length),

    hallucinationRate: ratio(spurious, actualItems),
    taxonomyViolationRate: ratio(
      scores.reduce((a, s) => a + s.taxonomyViolations, 0),
      actualItems,
    ),
    miscFallbackRate: ratio(
      scores.reduce((a, s) => a + s.miscFallbacks, 0),
      matched,
    ),
    decisionAccuracy: ratio(
      decisionScored.filter((s) => s.decisionOk === true).length,
      decisionScored.length,
    ),

    sumAccuracyMean: ratio(
      scores.reduce((a, s) => a + s.sumAccuracy, 0),
      scores.length,
    ),
    totalSumErrorEgp: scores.reduce((a, s) => a + s.sumErrorEgp, 0),

    cost: {
      totalTokens,
      totalCachedTokens,
      cachedTokenRatio: ratio(totalCachedTokens, totalTokens),
      llmCalls: scores.reduce((a, s) => a + s.cost.llmCalls, 0),
      tokensPerCaseMean: ratio(totalTokens, scores.length),
      tokensPerItemMean: ratio(totalTokens, actualItems),
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
      latencyMax: latencies.length ? latencies[latencies.length - 1] : 0,
      parsedByDistribution,
      truncationSuspectedCount: scores.filter((s) => s.cost.truncationSuspected).length,
    },
  };
}

export function groupScoresBy<K extends string>(
  scores: CaseScore[],
  key: (s: CaseScore) => K,
): Partial<Record<K, AggregateScore>> {
  const buckets = new Map<K, CaseScore[]>();
  for (const s of scores) {
    const k = key(s);
    if (!buckets.has(k)) buckets.set(k, []);
    (buckets.get(k) as CaseScore[]).push(s);
  }
  const out: Partial<Record<K, AggregateScore>> = {};
  for (const [k, v] of buckets) out[k] = aggregate(v);
  return out;
}

export function aggregateByTag(
  scores: CaseScore[],
  cases: BenchmarkCase[],
): Record<string, AggregateScore> {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const tagBuckets = new Map<string, CaseScore[]>();
  for (const s of scores) {
    const c = byId.get(s.id);
    if (!c) continue;
    for (const tag of c.tags) {
      if (!tagBuckets.has(tag)) tagBuckets.set(tag, []);
      (tagBuckets.get(tag) as CaseScore[]).push(s);
    }
  }
  const out: Record<string, AggregateScore> = {};
  for (const [tag, v] of tagBuckets) out[tag] = aggregate(v);
  return out;
}
