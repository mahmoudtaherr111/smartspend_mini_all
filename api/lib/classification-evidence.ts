/**
 * What the classifier actually knows about an answer — and how that becomes a probability.
 *
 * The field named `confidence` was never one quantity. It carried six unrelated things
 * on a shared 0-100 range, with nothing normalising between them:
 *
 *   - the rule engine wrote hand-picked ranks chosen to clear a threshold
 *     (a code comment reads "Raised from 88 to 93")
 *   - the embedding layer wrote cosines calibrated through three different windows,
 *     so a local 90 and a Fireworks 90 are different evidence
 *   - the model wrote a self-report imitating the numbers in its own prompt
 *   - the intent detector wrote a vote share between four intents
 *   - muscle memory wrote a message-level mean plus a repeat bonus
 *   - business scoring wrote `75 + score`, floored at 90 by construction
 *
 * Comparing those with `>=` is what produced a 90-100 bucket that was only 63% accurate.
 *
 * The fix is to stop asking each resolver for a score and ask it for EVIDENCE — what it
 * matched and how — then map evidence to a probability in one place, using observed
 * accuracy rather than intuition.
 */

/** How the answer was reached. Recorded at the point of decision, never inferred later. */
export type MatchKind =
  | "user_correction"
  | "muscle_memory"
  | "user_dictionary"
  | "merchant_registry"
  | "merchant_disambiguated"
  | "governed_noun"
  | "verb_noun_regex"
  | "synonym_graph"
  | "subcat_trigram"
  | "subcat_bigram"
  | "subcat_unigram"
  | "dict_trigram"
  | "dict_bigram"
  | "dict_unigram"
  | "context_rule"
  | "fuzzy"
  | "embedding"
  | "intent_only"
  | "business_scoring"
  | "llm"
  | "fallback";

/**
 * Families group match kinds that should behave alike statistically. Calibrating per
 * kind would spread the labelled data too thin; per family it stays estimable while
 * still separating an exact dictionary hit from a fuzzy string match.
 */
export type MatchFamily =
  | "exact"
  | "strong_rule"
  | "weak_rule"
  | "semantic"
  | "model"
  | "weak";

const FAMILY_OF: Record<MatchKind, MatchFamily> = {
  user_correction: "exact",
  muscle_memory: "exact",
  user_dictionary: "exact",
  merchant_registry: "exact",
  governed_noun: "exact",

  merchant_disambiguated: "strong_rule",
  verb_noun_regex: "strong_rule",
  synonym_graph: "strong_rule",
  subcat_trigram: "strong_rule",
  dict_trigram: "strong_rule",
  context_rule: "strong_rule",

  subcat_bigram: "weak_rule",
  dict_bigram: "weak_rule",
  subcat_unigram: "weak_rule",
  dict_unigram: "weak_rule",
  business_scoring: "weak_rule",

  embedding: "semantic",
  llm: "model",

  fuzzy: "weak",
  intent_only: "weak",
  fallback: "weak",
};

export function matchFamily(kind: MatchKind): MatchFamily {
  return FAMILY_OF[kind] ?? "weak";
}

export interface Evidence {
  /** What matched. Set where the decision is made. */
  matchKind: MatchKind;
  /** The resolver's own number. Kept for tracing — NOT comparable across resolvers. */
  rawStrength: number;
  /** Independent resolvers that produced the same category. Zero means no second opinion. */
  agreement: number;
  /** Independent resolvers that produced a different category. */
  disagreement: number;
  /** Did this item bind to an amount the user actually said? */
  anchorConsumed: boolean;
  /** Landed on the catch-all category. */
  categoryIsFallback: boolean;
  personResolved: "known" | "unknown" | "none";
  /** The ambiguity penalty fired — the text contained a word with several readings. */
  hasAmbiguityPenalty: boolean;
  ambiguityFlagCount: number;
}

export function emptyEvidence(kind: MatchKind = "fallback", rawStrength = 0): Evidence {
  return {
    matchKind: kind,
    rawStrength,
    agreement: 0,
    disagreement: 0,
    anchorConsumed: false,
    categoryIsFallback: false,
    personResolved: "none",
    hasAmbiguityPenalty: false,
    ambiguityFlagCount: 0,
  };
}

/**
 * The bucket an item is calibrated in. Kept coarse on purpose: with a few hundred
 * labelled items, a finer key would produce buckets of two samples and a probability
 * that is really just noise.
 */
export function bucketKey(e: Evidence): string {
  const family = matchFamily(e.matchKind);
  const quality = e.hasAmbiguityPenalty
    ? "ambiguous"
    : e.disagreement > 0
      ? "disputed"
      : e.agreement > 0
        ? "corroborated"
        : "single";
  return `${family}:${quality}`;
}

export interface ReliabilityBucket {
  /** Items observed in this bucket. */
  n: number;
  /** How many were correct. */
  hits: number;
}

export interface ReliabilityTable {
  version: string;
  generatedAt: string;
  /** Source of the labels — benchmark run, production corrections, or both. */
  source: string;
  /** Overall accuracy, used as the prior that thin buckets shrink toward. */
  prior: number;
  buckets: Record<string, ReliabilityBucket>;
}

/**
 * Strength of the shrinkage prior, in pseudo-observations.
 *
 * A bucket with five samples and five hits is not evidence of certainty; without
 * shrinkage it would report p = 1.0 and auto-save everything that lands in it.
 * At SHRINKAGE = 8 that bucket reports roughly the prior plus a nudge, and only earns
 * a confident number once it has the observations to support one.
 */
const SHRINKAGE = 8;

/** Probability is never reported as absolute — nothing here is ever certain. */
const P_MIN = 0.02;
const P_MAX = 0.99;

export interface CalibrationResult {
  probability: number;
  bucket: string;
  /** How many labelled observations back this estimate. Surfaced in the admin view. */
  support: number;
  /** True when the table had no data for this bucket and the prior carried the estimate. */
  fellBackToPrior: boolean;
}

/**
 * Maps evidence to the probability that the answer is correct.
 *
 * With no table loaded this returns the resolver's raw number scaled to [0,1], so the
 * system behaves exactly as before calibration existed. That is deliberate: the table
 * is data, and the code must be correct before the data arrives.
 */
export function calibrate(
  evidence: Evidence,
  table: ReliabilityTable | null,
): CalibrationResult {
  const bucket = bucketKey(evidence);

  if (!table) {
    return {
      probability: clamp(evidence.rawStrength / 100),
      bucket,
      support: 0,
      fellBackToPrior: true,
    };
  }

  const observed = table.buckets[bucket];
  const n = observed?.n ?? 0;
  const hits = observed?.hits ?? 0;
  const probability = (hits + SHRINKAGE * table.prior) / (n + SHRINKAGE);

  return {
    probability: clamp(probability),
    bucket,
    support: n,
    fellBackToPrior: n === 0,
  };
}

function clamp(p: number): number {
  if (!Number.isFinite(p)) return P_MIN;
  return Math.min(P_MAX, Math.max(P_MIN, p));
}

/** Builds a table from labelled observations. Used by the benchmark, not at runtime. */
export function buildReliabilityTable(
  observations: Array<{ evidence: Evidence; correct: boolean }>,
  meta: { version: string; source: string; generatedAt: string },
): ReliabilityTable {
  const buckets: Record<string, ReliabilityBucket> = {};
  let hits = 0;

  for (const o of observations) {
    const key = bucketKey(o.evidence);
    const b = (buckets[key] ??= { n: 0, hits: 0 });
    b.n++;
    if (o.correct) {
      b.hits++;
      hits++;
    }
  }

  return {
    version: meta.version,
    generatedAt: meta.generatedAt,
    source: meta.source,
    prior: observations.length === 0 ? 0.5 : hits / observations.length,
    buckets,
  };
}

/**
 * Does an independent resolver agree with this answer?
 *
 * The strongest feature available, and until now the only one never computed: `agreement`
 * was declared on `Evidence`, threaded through the bucket key, and hardcoded to 0 at
 * every site that produced evidence. The live benchmark shows what that cost — the model
 * path is 60.5% accurate while claiming 94.6%, and nothing in the record distinguished
 * "the model and the rule engine independently reached the same answer" from "the model
 * overruled a local answer that disagreed".
 *
 * It is free. The local pass has already run on exactly the segments that were escalated,
 * so the second opinion is sitting in memory; it was simply never consulted.
 *
 * Matching is by amount, because that is the one field both resolvers anchor to the same
 * spoken number. Comparing by description would compare two different writing styles.
 */
export function crossCheck(
  item: { amount: number; category?: string; type?: string },
  others: ReadonlyArray<{ amount: number; category?: string; type?: string }>,
): { agreement: number; disagreement: number } {
  const cents = Math.round((Number(item.amount) || 0) * 100);
  if (cents === 0) return { agreement: 0, disagreement: 0 };

  let agreement = 0;
  let disagreement = 0;

  for (const other of others) {
    if (Math.round((Number(other.amount) || 0) * 100) !== cents) continue;

    // A second opinion that also gave up is not corroboration. Counting "متنوعات"
    // as agreement would make the fallback category look like the most reliable
    // answer in the system, because it is the one two resolvers most often share.
    if (other.category === "متنوعات" || item.category === "متنوعات") continue;

    if (other.category === item.category && other.type === item.type) {
      agreement++;
    } else {
      disagreement++;
    }
  }

  return { agreement, disagreement };
}
