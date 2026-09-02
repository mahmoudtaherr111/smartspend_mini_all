/**
 * Benchmark case schema for the Egyptian-dialect classification suite.
 *
 * Invariants:
 *  - `category` / `subCategory` are EXACT `name_ar` strings from
 *    api/lib/category-registry.ts CATEGORIES. Never rename a name_ar: it is the
 *    value physically stored in expenses.category (db/schema.ts:88-89).
 *  - For العائلة / أصدقاء / موظفين the `subCategory` is the smuggled person label
 *    (category-registry.ts:893 returns the raw subcategory verbatim).
 *  - Amounts are EXACT. There is deliberately no "minimum items" escape hatch —
 *    that weakness is what made api/scripts/scratch/test-comprehensive-pipeline.ts
 *    unable to fail (`items.length >= 0` is a tautology).
 */

export type TxType = "income" | "expense" | "transfer" | "investment";
export type Decision = "auto_save" | "review" | "clarify";

export type BenchBucket =
  | "single_clause"
  | "compound"
  | "monologue"
  | "mixed_direction"
  | "numeric_forms"
  | "direction_traps"
  | "noise_stt_franco"
  | "entity_ambiguity"
  | "non_financial"
  | "boundary";

/**
 * locked       → part of the CI regression ratchet. Human-verified expectations.
 * aspirational → measured and reported, NEVER fails the build. For cases the current
 *                taxonomy cannot express correctly yet (e.g. debt direction).
 * legacy       → salvaged from api/scripts/scratch/*, expectations not yet reviewed.
 */
export type BenchTier = "locked" | "aspirational" | "legacy";

export interface ExpectedItem {
  /** EXACT EGP amount. Matched with |actual - expected| <= 0.005. */
  amount: number;
  /** Exact main-category name_ar from CATEGORIES. */
  category: string;
  /** Only where the taxonomy genuinely admits two legal slots. Documents ambiguity. */
  categoryAnyOf?: string[];
  /** Exact sub name_ar, or the person label for العائلة/أصدقاء/موظفين. */
  subCategory?: string;
  subCategoryAnyOf?: string[];
  /** "strict" counts toward subCategoryAccuracy; "soft" is reported but never fails. */
  subCategoryMode?: "strict" | "soft";
  type: TxType;
  typeAnyOf?: TxType[];
  /** ParsedTransaction.person_mentioned (rule-engine.ts:37). */
  personMentioned?: string;
  /** Why this is the right answer. Printed verbatim in failure output. */
  why?: string;
}

export interface KnownPersonFixture {
  name: string;
  relationship: string;
  /** One of العائلة / أصدقاء / موظفين, to exercise the person-name path. */
  category: string;
  subCategory: string;
}

export interface BenchmarkCase {
  /** Stable, never reused. `<BUCKET3>-<NNN>`, e.g. "MON-001", "DIR-004". */
  id: string;
  bucket: BenchBucket;
  tier: BenchTier;
  /** The raw utterance exactly as STT or the keyboard would deliver it. */
  text: string;
  /** In narrative order. `[]` means the pipeline MUST return zero items. */
  expectedItems: ExpectedItem[];
  /** Defaults to expectedItems.length. Set explicitly only to document intent. */
  expectedItemCount?: number;
  expectedDecision?: Decision;
  allowedDecisions?: Decision[];
  expectedQuestionIncludes?: string;
  knownPeople?: KnownPersonFixture[];
  /** Linguistic phenomena exercised — drives the per-phenomenon report slice. */
  tags: string[];
  note?: string;
  /** Skip in offline mode (only answerable with a live LLM). */
  offlineSkip?: boolean;
}

export interface CaseFilter {
  buckets?: BenchBucket[];
  tiers?: BenchTier[];
  ids?: string[];
  tags?: string[];
  mode?: "offline" | "live";
  limit?: number;
}
