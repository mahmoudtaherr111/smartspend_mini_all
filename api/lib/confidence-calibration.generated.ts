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
  "generatedAt": "2026-09-03T00:48:41.015Z",
  "source": "benchmark:87 cases",
  "prior": 0.8226950354609929,
  "buckets": {
    "exact:single": {
      "n": 25,
      "hits": 21
    },
    "weak:single": {
      "n": 20,
      "hits": 8
    },
    "weak_rule:single": {
      "n": 60,
      "hits": 53
    },
    "strong_rule:single": {
      "n": 33,
      "hits": 32
    },
    "weak_rule:ambiguous": {
      "n": 2,
      "hits": 1
    },
    "semantic:single": {
      "n": 1,
      "hits": 1
    }
  }
};
