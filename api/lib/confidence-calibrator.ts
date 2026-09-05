/**
 * Turns each item's recorded evidence into a calibrated probability, and writes that
 * back as `confidence`.
 *
 * After this runs, `confidence` means one thing for the first time: the measured
 * probability that the answer is correct, on a single scale, whatever produced it.
 * Before it, a 90 from the merchant registry (observed 80% accurate) and a 90 from a
 * trigram (observed 97%) were the same number and the same decision.
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

/** Marker so a second pass cannot recalibrate an already-calibrated item. */
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

    return {
      ...item,
      confidence: Math.round(result.probability * 100),
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
