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
  "generatedAt": "2026-09-04T01:42:30.930Z",
  "source": "live:87 cases plan=free model=gemini-3.1-flash-lite",
  "prior": 0.8741258741258742,
  "buckets": {
    "model:corroborated": {
      "n": 23,
      "hits": 19
    },
    "model:single": {
      "n": 11,
      "hits": 10
    },
    "model:disputed": {
      "n": 13,
      "hits": 8
    },
    "weak_rule:single": {
      "n": 59,
      "hits": 53
    },
    "strong_rule:single": {
      "n": 33,
      "hits": 32
    },
    "weak:single": {
      "n": 3,
      "hits": 2
    },
    "semantic:single": {
      "n": 1,
      "hits": 1
    }
  }
};
