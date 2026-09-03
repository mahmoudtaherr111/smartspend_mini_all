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
}

/** Marker so a second pass cannot recalibrate an already-calibrated item. */
const CALIBRATED_FLAG = "calibrated";

export function applyCalibration(items: ParsedTransaction[]): CalibrationOutcome {
  let calibrated = 0;
  let uncalibrated = 0;

  const out = items.map((item) => {
    const evidence = item.evidence as Evidence | undefined;
    if (!evidence) {
      uncalibrated++;
      return item;
    }

    // Calibration runs once per segment and once over the finished result. Without this
    // guard the second pass would overwrite rawStrength with the already-calibrated
    // value, destroying the record of what the resolver originally claimed — the exact
    // number the reliability table is built from.
    if ((item.ambiguityFlags || []).some((f) => f.startsWith(`${CALIBRATED_FLAG}:`))) {
      calibrated++;
      return item;
    }

    const result = calibrate(
      { ...evidence, categoryIsFallback: item.category === "متنوعات" },
      CONFIDENCE_CALIBRATION,
    );
    calibrated++;

    return {
      ...item,
      confidence: Math.round(result.probability * 100),
      evidence: { ...evidence, rawStrength: item.confidence },
      ambiguityFlags: [
        ...(item.ambiguityFlags || []),
        `${CALIBRATED_FLAG}:${result.bucket}:n=${result.support}`,
      ],
    };
  });

  return { items: out, calibrated, uncalibrated };
}
