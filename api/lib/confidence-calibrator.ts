/**
 * Turns each item's recorded evidence into a calibrated probability, and writes that
 * back as `confidence`.
 *
 * This is a resolver estimate fitted to the calibration corpus. It is not a measured
 * probability that every financial field is correct in production. Semantic blockers
 * and unobserved evidence buckets must still be checked by the acceptance gate.
 *
 * Items with no recorded evidence — the model path, muscle memory — keep their raw
 * score rather than being guessed at. They are the next resolvers to instrument.
 */
import { calibrate, type Evidence } from "./classification-evidence";
import { CONFIDENCE_CALIBRATION } from "./confidence-calibration.generated";
import type { ParsedTransaction } from "./rule-engine";

export interface CalibrationOutcome {
  /** Items with their `confidence` replaced by the calibrated probability. */
  items: ParsedTransaction[];
  /** How many items had evidence to calibrate from. */
  calibrated: number;
  /** How many fell through on raw score because no resolver recorded provenance. */
  uncalibrated: number;
  /**
   * Items whose evidence bucket has NO observed data, so the probability written back
   * is the corpus prior rather than a measurement of this path.
   *
   * The decision layer needs this separately from the number itself: a 95 we measured
   * and a 95 we inherited from the prior are the same value and not the same claim.
   */
  unpriced: number;
}

/** Human-readable trace marker; the signature below controls estimate reuse. */
const CALIBRATED_FLAG = "calibrated";

export function applyCalibration(items: ParsedTransaction[]): CalibrationOutcome {
  let calibrated = 0;
  let uncalibrated = 0;
  let unpriced = 0;

  const out = items.map((item) => {
    const evidence = item.evidence as Evidence | undefined;
    if (!evidence) {
      uncalibrated++;
      unpriced++;
      return item;
    }

    // A marker alone is insufficient: the category/evidence can change after the
    // first pass. Bind the estimate to the actual answer and calibration version.
    const signature = JSON.stringify([CONFIDENCE_CALIBRATION.version, item.amount,
      item.category, item.subCategory, item.type, item.currency, evidence]);
    if (item.calibration?.signature === signature) {
      calibrated++;
      if (item.calibration.support === 0) unpriced++;
      return item;
    }

    const result = calibrate(
      { ...evidence, categoryIsFallback: item.category === "متنوعات" },
      CONFIDENCE_CALIBRATION,
    );
    calibrated++;
    if (result.support === 0) unpriced++;
    // Only the resolver's raw-score uncertainty is replaced by calibration. Semantic
    // blockers and unexplained needsReview flags are never cleared by a category score.
    const resolvesRawScore = result.support > 0 &&
      item.reviewReasons?.includes("raw_category_confidence") &&
      !evidence.hasAmbiguityPenalty && evidence.personResolved !== "unknown";
    const reviewReasons = resolvesRawScore
      ? item.reviewReasons?.filter((reason) => reason !== "raw_category_confidence") : item.reviewReasons;

    return {
      ...item,
      confidence: Math.round(result.probability * 100),
      reviewReasons,
      needsReview: resolvesRawScore ? Boolean(reviewReasons?.length) : item.needsReview,
      evidence,
      calibration: { signature, support: result.support, probability: result.probability },
      ambiguityFlags: [
        ...(item.ambiguityFlags || []).filter((flag) => !flag.startsWith(`${CALIBRATED_FLAG}:`)),
        `${CALIBRATED_FLAG}:${result.bucket}:n=${result.support}`,
      ],
    };
  });

  return { items: out, calibrated, uncalibrated, unpriced };
}
