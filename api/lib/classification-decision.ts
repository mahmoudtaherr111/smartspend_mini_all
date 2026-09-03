/**
 * The three questions a classifier has to answer, kept apart.
 *
 *   1. Do we need the model?      — a question about EVIDENCE COMPLETENESS
 *   2. Save, review, or ask?      — a question about PROBABILITY
 *   3. How much may we spend?     — a question about the user's PLAN
 *
 * One `confidence >= 85` comparison used to answer all three. That is why raising the
 * threshold made the system expensive and lowering it made it unsafe: the same number
 * was being asked to mean "is this worth paying a model for" and "is this safe to write
 * to the database", which are different questions with different right answers.
 *
 * The most important consequence is that some conditions must escalate to the model no
 * matter how confident the local path is — a category the classifier could not name, an
 * amount it could not attach — and some must never escalate however unsure it is,
 * because the user has already told us the answer.
 */
import type { Evidence } from "./classification-evidence";

export interface DecisionThresholds {
  /** At or above this probability, a transaction may be written without review. */
  autoSave: number;
  /** At or above this, show it for review; below it, ask instead. */
  review: number;
  /** Below this, the local answer is not worth keeping — ask the model. */
  escalate: number;
}

/**
 * Defaults expressed as probabilities, not ranks.
 *
 * autoSave sits high on purpose: an unreviewed write that is wrong corrupts the wallet,
 * the charts and the admin dashboard at once, and the user never sees it happen. The
 * cost of being wrong here is far higher than the cost of one extra confirmation tap.
 */
export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  autoSave: 0.9,
  review: 0.5,
  escalate: 0.85,
};

export interface EscalationInput {
  evidence?: Evidence;
  /** The category the local path settled on. */
  category: string;
  /** Calibrated probability that the local answer is right. */
  probability: number;
  /** A person was named but not recognised. */
  hasUnknownPerson: boolean;
  /** Every amount the user said was attached to a transaction. */
  amountsFullyConsumed: boolean;
}

export interface EscalationDecision {
  escalate: boolean;
  /** Machine-readable reasons, surfaced in the trace and the admin funnel. */
  reasons: string[];
}

/** Resolvers whose answer came from the user, so a model has nothing to add. */
const USER_TAUGHT = new Set(["user_correction", "user_dictionary", "muscle_memory"]);

/**
 * Should this segment go to the model?
 *
 * Deliberately NOT a threshold on a score. Two classes of condition dominate it:
 * completeness failures that the local path cannot fix however sure it feels, and
 * user-taught answers that must never be second-guessed however unsure it feels.
 */
export function shouldEscalate(
  input: EscalationInput,
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS,
): EscalationDecision {
  const reasons: string[] = [];

  // The user already told us this one. Paying a model to disagree would be both a waste
  // and a regression — it is the single strongest signal available.
  if (input.evidence && USER_TAUGHT.has(input.evidence.matchKind)) {
    return { escalate: false, reasons: ["user_taught"] };
  }

  // Completeness failures. These are not "low confidence" — they are the local path
  // reporting that it could not finish, which no threshold can express.
  if (input.category === "متنوعات") reasons.push("category_unresolved");
  if (!input.amountsFullyConsumed) reasons.push("amount_unattached");
  if (input.hasUnknownPerson) reasons.push("unknown_person");
  if (input.evidence?.hasAmbiguityPenalty) reasons.push("ambiguous_wording");
  if (input.evidence && input.evidence.disagreement > 0) reasons.push("resolvers_disagree");

  // Only then does the probability get a say.
  if (input.probability < thresholds.escalate) reasons.push("below_escalation_bar");

  return { escalate: reasons.length > 0, reasons };
}

export type Decision = "auto_save" | "review" | "clarify";

export interface DecisionInput {
  /** Lowest calibrated probability across the items in this result. */
  probability: number;
  /** Every amount the user said was attached to a transaction. */
  amountsFullyConsumed: boolean;
  /** The verifier raised something that must be seen. */
  hasBlockingFlag: boolean;
  /** There is a question we genuinely need answered before we can record anything. */
  needsAnswer: boolean;
}

export interface DecisionOutcome {
  decision: Decision;
  reason: string;
}

/**
 * Save, review, or ask.
 *
 * The arithmetic condition is not negotiable by confidence: if the user named an amount
 * that no transaction claimed, something is missing regardless of how sure we are about
 * the transactions we did find, and silently saving the rest loses money from the ledger.
 */
export function decide(
  input: DecisionInput,
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS,
): DecisionOutcome {
  if (input.needsAnswer) {
    return { decision: "clarify", reason: "question_pending" };
  }
  if (!input.amountsFullyConsumed) {
    return { decision: "clarify", reason: "amount_unattached" };
  }
  if (input.hasBlockingFlag) {
    return { decision: "review", reason: "verifier_flag" };
  }
  if (input.probability >= thresholds.autoSave) {
    return { decision: "auto_save", reason: "high_probability" };
  }
  if (input.probability >= thresholds.review) {
    return { decision: "review", reason: "moderate_probability" };
  }
  return { decision: "clarify", reason: "low_probability" };
}

/**
 * Reads admin overrides, which are stored as 0-100 for backwards compatibility with the
 * existing settings UI, and converts them to probabilities.
 */
export function resolveThresholds(
  settings: Record<string, string> | undefined,
  read: (key: string, fallback: number) => number,
): DecisionThresholds {
  return {
    autoSave: read("parser_auto_save_threshold", DEFAULT_THRESHOLDS.autoSave * 100) / 100,
    review: read("parser_review_threshold", DEFAULT_THRESHOLDS.review * 100) / 100,
    escalate: read("parser_escalate_threshold", DEFAULT_THRESHOLDS.escalate * 100) / 100,
  };
}
