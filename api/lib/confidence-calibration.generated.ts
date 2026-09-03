/**
 * GENERATED — do not edit by hand. Run `npm run bench:classify:calibrate`.
 *
 * Observed accuracy per evidence bucket. This is what makes `confidence` a
 * probability instead of a rank: every number below was measured against labelled
 * data, and `prior` is the overall accuracy that thin buckets shrink toward.
 */
import type { ReliabilityTable } from "./classification-evidence";

export const CONFIDENCE_CALIBRATION: ReliabilityTable =
  {
  "version": "v3.0",
  "generatedAt": "2026-09-03T00:18:45.389Z",
  "source": "benchmark:87 cases",
  "prior": 0.8333333333333334,
  "buckets": {
    "exact:single": {
      "n": 25,
      "hits": 21
    },
    "weak:single": {
      "n": 16,
      "hits": 7
    },
    "weak_rule:single": {
      "n": 59,
      "hits": 51
    },
    "strong_rule:single": {
      "n": 34,
      "hits": 33
    },
    "weak_rule:ambiguous": {
      "n": 2,
      "hits": 1
    },
    "semantic:single": {
      "n": 2,
      "hits": 2
    }
  }
};
