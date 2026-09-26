import { JOURNEYS } from "./corpus";
import type { Journey } from "./corpus";

export interface ReleaseEvidence {
  scope: "provider_only_synthetic" | "application";
  humanClips: number;
  humanSpeakers: number;
  journeyResults: Partial<Record<Journey, { attempted: number; succeeded: number }>>;
  inventedNumbers: number | null;
  unintendedWrites: number | null;
  firstAudioP95Ms: number | null;
  measuredUsdPerMinute: number | null;
  adminCostCapUsdPerMinute: number | null;
  egyptianSpeechReviewed: boolean;
  interruptionTested: boolean;
}

/** Missing evidence fails closed. Synthetic repetitions never become human speakers or launch proof. */
export function evaluateRelease(evidence: ReleaseEvidence) {
  const finiteNonnegative = (v: number | null): v is number => v !== null && Number.isFinite(v) && v >= 0;
  const checks = {
    application: evidence.scope === "application",
    humanAudio: Number.isInteger(evidence.humanClips) && evidence.humanClips >= 300 && Number.isInteger(evidence.humanSpeakers) && evidence.humanSpeakers >= 40,
    journeys: JOURNEYS.every(journey => {
      const result = evidence.journeyResults[journey];
      return result !== undefined && Number.isInteger(result.attempted) && result.attempted > 0 &&
        Number.isInteger(result.succeeded) && result.succeeded <= result.attempted && result.succeeded / result.attempted >= 0.85;
    }),
    numbers: evidence.inventedNumbers === 0,
    writes: evidence.unintendedWrites === 0,
    latency: finiteNonnegative(evidence.firstAudioP95Ms) && evidence.firstAudioP95Ms <= 1500,
    cost: finiteNonnegative(evidence.measuredUsdPerMinute) && finiteNonnegative(evidence.adminCostCapUsdPerMinute) &&
      evidence.adminCostCapUsdPerMinute > 0 && evidence.measuredUsdPerMinute <= evidence.adminCostCapUsdPerMinute,
    egyptianSpeech: evidence.egyptianSpeechReviewed,
    interruption: evidence.interruptionTested,
  };
  return { ready: Object.values(checks).every(Boolean), checks,
    blockers: Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name) };
}
