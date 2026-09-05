/**
 * The one gate a classification has to pass before it may be written without review.
 *
 * Three layers used to grant themselves that permission directly — the result cache, the
 * muscle-memory shortcut and the business-scoring shortcut each returned
 * `decision: "auto_save"` from their own branch, having answered none of the questions
 * the slow path answers. The consequences were not theoretical: a business keyword match
 * auto-saved "ماشتريتش خامات ب500" as a 500 expense at confidence 100, took only the
 * FIRST amount out of "دفعت 500 خامات و300 معدات", and read its direction off the
 * category's type so "قبضت 500 خامات" became an expense.
 *
 * Being fast is not the same as being sure. A shortcut may skip the work; it may not
 * skip the conclusion. Everything that can reach the database now converges here:
 *
 *   1. Is this a financial statement at all?  — the admissibility gate, not a keyword hit
 *   2. Did every amount the user said find an owner?  — the ledger, not a count
 *   3. Is each item individually safe to write?  — `decide` per item, never an average
 *
 * Blockers are sticky by construction. `needsReview` and `reviewReasons` only ever gain
 * entries here; a later layer that thinks an item looks fine cannot un-flag it, which is
 * what let the verifier clear a `category_reply_unresolved` it knew nothing about.
 */
import { checkAdmissibility } from "./admissibility-gate";
import { buildAnchors, reconcileAmounts, describeUnconsumed } from "./amount-ledger";
import { applyCalibration } from "./confidence-calibrator";
import {
  decide,
  DEFAULT_THRESHOLDS,
  type Decision,
  type DecisionThresholds,
} from "./classification-decision";
import { extractAmounts } from "./entity-extractor";
import type { ParsedTransaction } from "./rule-engine";

/**
 * Stable machine codes for why an item cannot be saved silently.
 *
 * Strings, not booleans, because "needs review" without a reason is untriageable: the
 * admin funnel cannot tell a model that returned nothing from a person we could not
 * identify, and the user gets the same blank prompt for both.
 */
export const BlockerReason = {
  /** The model was asked for a category and did not usably answer for this clause. */
  CATEGORY_REPLY_UNRESOLVED: "category_reply_unresolved",
  /** The model's reply was structurally invalid or incomplete. */
  MODEL_REPLY_INVALID: "model_reply_invalid",
  /** An amount the user said is not owned by any item. */
  AMOUNT_UNATTACHED: "amount_unattached",
  /** The calibration bucket for this item's evidence has no observations behind it. */
  UNPRICED_EVIDENCE: "unpriced_evidence",
  /** A shortcut produced this and the slow path never saw it. */
  SHORTCUT_UNVERIFIED: "shortcut_unverified",
  /** Local layers disagreed about the category. */
  RESOLVERS_DISAGREE: "resolvers_disagree",
} as const;

export type BlockerReasonCode = (typeof BlockerReason)[keyof typeof BlockerReason];

/**
 * Adds a blocker without ever removing one.
 *
 * Returns a new item — the pipeline mutates items in several places and a shared
 * reference that silently gains flags is how a blocker ended up on the wrong row.
 */
export function withBlocker(
  item: ParsedTransaction,
  ...reasons: string[]
): ParsedTransaction {
  if (reasons.length === 0) return item;
  return {
    ...item,
    needsReview: true,
    reviewReasons: [...new Set([...(item.reviewReasons || []), ...reasons])],
  };
}

/**
 * Applies a later layer's opinion of an item without letting it clear an earlier one.
 *
 * `needsReview` is a disjunction over every layer that looked at the item, so a verifier
 * that finds nothing wrong leaves an existing flag exactly where it was. It used to
 * assign `needsReview: adjustedConfidence < 85 || flagged`, which overwrote — an item
 * arriving from the model merge already flagged, scoring 90 and drawing no verifier
 * objection, came out clean and auto-saveable.
 */
export function mergeReviewState(
  next: ParsedTransaction,
  previous: Pick<ParsedTransaction, "needsReview" | "reviewReasons">,
  ...addedReasons: string[]
): ParsedTransaction {
  const reasons = [
    ...new Set([...(previous.reviewReasons || []), ...(next.reviewReasons || []), ...addedReasons]),
  ];
  return {
    ...next,
    needsReview: Boolean(previous.needsReview) || Boolean(next.needsReview) || reasons.length > 0,
    reviewReasons: reasons.length > 0 ? reasons : undefined,
  };
}

/** True when this item carries a blocker that no confidence score may override. */
export function hasBlockingReason(item: ParsedTransaction): boolean {
  return Boolean(item.reviewReasons && item.reviewReasons.length > 0);
}

export interface AcceptanceInput {
  /** Items a layer proposes to save. */
  items: ParsedTransaction[];
  /** The raw utterance, for admissibility and the amount ledger. */
  text: string;
  /** Normalized form the local layers matched against, if the caller has one. */
  normalizedText?: string;
  thresholds?: DecisionThresholds;
  /**
   * Skip the "ask about the missing amount" branch. Set by callers that have already
   * asked a question this turn, so the user is not asked two things at once.
   */
  skipClarification?: boolean;
}

export interface AcceptanceOutcome {
  /**
   * False when the utterance is not a recordable financial event at all. The caller must
   * not fall through to its own answer: there is nothing to classify.
   */
  admitted: boolean;
  /**
   * True when these items account for every amount in the utterance.
   *
   * A shortcut may only ANSWER when this holds. A learned 500-shopping pattern matching
   * "ماشتريتش جزمة 500 ودفعت 200 بنزين" covers one number out of two, and the full
   * pipeline reads that sentence correctly — so a partial shortcut should stand aside,
   * not ask the user a question the pipeline would not have needed to ask.
   */
  coversUtterance: boolean;
  items: ParsedTransaction[];
  decision: Decision;
  /** Machine-readable, mirrors `DecisionOutcome.reason` plus the gate's own codes. */
  reason: string;
  overallConfidence: number;
  clarificationQuestion?: string;
  /** Every blocker the gate raised, for the trace. */
  blockers: string[];
}

/**
 * The strictest of the per-item decisions, never the average.
 *
 * An average is the specific arithmetic that let a 3-item narrative auto-save on 82/87/90
 * against an 85 line: the mean is 86.3 and the 82 disappears into it. A group is exactly
 * as saveable as its weakest member, so this reduces by precedence — clarify beats
 * review beats auto_save — rather than by summing.
 */
export function decidePerItem(
  items: ParsedTransaction[],
  context: {
    amountsFullyConsumed: boolean;
    needsAnswer: boolean;
    thresholds?: DecisionThresholds;
  },
): { decision: Decision; reason: string; weakestConfidence: number } {
  const thresholds = context.thresholds || DEFAULT_THRESHOLDS;
  const rank: Record<Decision, number> = { auto_save: 0, review: 1, clarify: 2 };

  let worst: { decision: Decision; reason: string } = {
    decision: "auto_save",
    reason: "high_probability",
  };
  let weakest = items.length > 0 ? 100 : 0;

  for (const item of items) {
    const confidence = item.confidence || 0;
    if (confidence < weakest) weakest = confidence;

    const outcome = decide(
      {
        probability: confidence / 100,
        amountsFullyConsumed: context.amountsFullyConsumed,
        // A blocker on THIS item, not a flag somewhere in the batch.
        hasBlockingFlag: hasBlockingReason(item) || Boolean(item.needsReview),
        needsAnswer: context.needsAnswer,
        // `calibration.support === 0` means the probability written on this item is the
        // corpus prior, not a measurement of the path that produced it. An item with no
        // calibration record at all has never been priced either.
        hasUnpricedItem: !item.calibration || item.calibration.support === 0,
      },
      thresholds,
    );

    if (rank[outcome.decision] > rank[worst.decision]) {
      worst = outcome;
    }
  }

  return { ...worst, weakestConfidence: weakest };
}

/**
 * The gate every zero-token shortcut must pass before it may claim `auto_save`.
 *
 * Deliberately does NOT re-run classification: a shortcut is allowed to be the source of
 * the answer. What it is not allowed to do is skip the checks that decide whether an
 * answer may be written without a human seeing it.
 */
export function gateShortcutResult(input: AcceptanceInput): AcceptanceOutcome {
  const thresholds = input.thresholds || DEFAULT_THRESHOLDS;
  const blockers: string[] = [];

  // 1. Is this a financial statement at all?
  //
  // A keyword match is not an event. "ماشتريتش خامات ب500" matches the business category
  // "خامات" exactly as strongly as "اشتريت خامات ب500" does, and the difference between
  // them is the whole point.
  const admissibility = checkAdmissibility(input.normalizedText || input.text);
  if (admissibility.verdict !== "financial") {
    return {
      admitted: false,
      coversUtterance: false,
      items: [],
      decision: "clarify",
      reason: `not_admissible:${admissibility.verdict}`,
      overallConfidence: 0,
      clarificationQuestion: admissibility.userMessage,
      blockers: [`not_admissible:${admissibility.reason}`],
    };
  }

  if (input.items.length === 0) {
    return {
      admitted: true,
      coversUtterance: false,
      items: [],
      decision: "clarify",
      reason: "no_items",
      overallConfidence: 0,
      blockers: ["no_items"],
    };
  }

  // 2. Price the evidence before judging it.
  //
  // Shortcut items historically arrived carrying a hand-written 100. Calibration turns
  // whatever a layer wrote into the measured probability that it is right, so the
  // comparison below means the same thing for every layer.
  const calibration = applyCalibration(input.items);
  let items = calibration.items;

  // 3. Did every amount the user said find an owner?
  //
  // Counting items against amounts is not this check — "دفعت 500 خامات و300 معدات"
  // produced one item for two amounts and the count comparison it replaced never looked.
  const anchors = buildAnchors(extractAmounts(input.text).map((a) => a.amount));
  const ledger = reconcileAmounts(anchors, items);
  const amountsFullyConsumed = ledger.unconsumed.length === 0;

  if (!amountsFullyConsumed) {
    blockers.push(BlockerReason.AMOUNT_UNATTACHED);
    items = items.map((item) => withBlocker(item, BlockerReason.AMOUNT_UNATTACHED));
    if (!input.skipClarification) {
      return {
        admitted: true,
        coversUtterance: false,
        items,
        decision: "clarify",
        reason: "amount_unattached",
        overallConfidence: 0,
        clarificationQuestion: describeUnconsumed(ledger.unconsumed),
        blockers,
      };
    }
  }

  // 4. Per item, never averaged.
  const outcome = decidePerItem(items, {
    amountsFullyConsumed,
    needsAnswer: false,
    thresholds,
  });

  if (outcome.decision !== "auto_save") {
    items = items.map((item) =>
      item.needsReview ? item : { ...item, needsReview: true },
    );
    if (calibration.unpriced > 0) blockers.push(BlockerReason.UNPRICED_EVIDENCE);
  }

  return {
    admitted: true,
    coversUtterance: amountsFullyConsumed,
    items,
    decision: outcome.decision,
    reason: outcome.reason,
    overallConfidence: outcome.weakestConfidence,
    blockers,
  };
}
