import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assessRelease, describeObservedRun, lowerConfidenceLimit } from "./release-acceptance";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const candidateSha256 = hash("fixture campaign candidate");
const asOf = "2026-10-31";
const critical = () => ({
  doubleWrites: 0, isolationFailures: 0, wrongAutomaticSettlements: 0,
  unsupportedAmounts: 0, unexplainedReconciliationDeltas: 0,
});
const fixture = () => {
  function cohort(kind: "text" | "audio") {
    return {
      candidateSha256, lockedLabelsSha256: hash(`${kind} labels`),
      reviewEvidenceSha256: hash(`${kind} independent review`),
      independentBlindLabels: true, billingComplete: true, critical: critical(),
      source: kind === "text" ? "independent-human-authored" : "independent-real-audio",
      timing: kind === "text" ? "submit-to-response" : "upload-complete-to-response",
      samples: Array.from({ length: 598 }, (_, i) => ({
        id: `${kind}-input-${i}`, clusterId: `${kind}-author-${i}`, sourceSha256: hash(`${kind} input ${i}`),
        short: true, status: "complete", clearSafeItems: 1, autoSavedItems: 1,
        allFieldsCorrectAutoSaves: 1, correctlyAutoSavedClearSafeItems: 1,
        elapsedMs: kind === "text" ? 4_000 : 7_000,
        cost: { successfulReadingUsd: 0.01, failedReadingUsd: 0.01, speechToTextUsd: kind === "text" ? 0 : 0.02 },
      })),
    };
  }
  return {
    version: 1,
    candidateSha256,
    text: cohort("text"),
    audio: cohort("audio"),
    budget: { configuredUsd: 100, forecastTextRequests: 1_000, forecastAudioRequests: 1_000, evidenceSha256: hash("budget") },
    pilot: {
      candidateSha256, evidenceSha256: hash("production pilot"),
      days: Array.from({ length: 16 }, (_, i) => ({
        day: `2026-10-${String(i + 1).padStart(2, "0")}`, rolloutPercent: i === 0 ? 5 : i === 1 ? 25 : 100,
        recordingRequests: 50, telemetryComplete: true, reconciliationComplete: true, critical: critical(),
        legacy: { requestPaths: i < 2 ? 10 : 0, queues: 0, jobs: 0 },
      })),
      rollback: { performed: true, day: "2026-10-15", evidenceSha256: hash("rollback drill") },
    },
  };
};

const held = (evidence: unknown, label: string) => {
  const result = assessRelease(evidence, asOf);
  expect(result.eligibleForManualReview).toBe(false);
  expect(result.gates.find(gate => gate.label === label)?.passed).toBe(false);
};

describe("recording release acceptance", () => {
  it("uses an exact one-sided lower bound and the correct perfect-sample threshold", () => {
    expect(lowerConfidenceLimit(0, 0)).toBeNull();
    expect(lowerConfidenceLimit(1, 0)).toBeNull();
    expect(lowerConfidenceLimit(0, 10)).toBe(0);
    expect(lowerConfidenceLimit(1, 2)).toBeCloseTo(1 - Math.sqrt(0.95), 12);
    expect(lowerConfidenceLimit(2, 2)).toBeCloseTo(Math.sqrt(0.05), 12);
    expect(lowerConfidenceLimit(597, 597)).toBeLessThan(0.995);
    expect(lowerConfidenceLimit(598, 598)).toBeGreaterThanOrEqual(0.995);
  });

  it("requires an independent manifest and does not qualify synthetic parser scores", () => {
    held(undefined, "Release evidence manifest");
    const synthetic = fixture();
    synthetic.audio.source = "synthetic-gold-transcript";
    held(synthetic, "Release evidence manifest");
    const output = describeObservedRun({
      set: "synthetic-egyptian-transcript", route: null, prompt: { configured: "compact" },
      coverage: { eligible: 36, completed: 10, failed: 1, unrun: 25 },
      aggregate: { allLabelledFieldsAutoSaveError: { count: 0, of: 9 }, latencyMs: { p95: 1351 }, tokens: { total: { prompt: 0, completion: 0, cached: 0 } } },
    });
    expect(output).toContain("Synthetic gold transcript | compact | 10/36 (1 failed, 25 unrun) | 0/9 | 1351 ms");
  });

  it("counts each speaker once and keeps the text and audio cohorts apart", () => {
    const repeated = fixture();
    repeated.audio.samples.forEach(sample => { sample.clusterId = "same-speaker"; });
    held(repeated, "audio one-sided 95% lower bound");
    const wrong = fixture();
    wrong.audio.samples[0].allFieldsCorrectAutoSaves = 0;
    wrong.audio.samples[0].correctlyAutoSavedClearSafeItems = 0;
    held(wrong, "audio one-sided 95% lower bound");
    const overlap = fixture();
    overlap.audio.samples[0].clusterId = overlap.text.samples[0].clusterId;
    held(overlap, "Independent text and audio cohorts");
    const reused = fixture();
    reused.text.samples[1].sourceSha256 = reused.text.samples[0].sourceSha256;
    held(reused, "text cohort provenance and coverage of input cases");
  });

  it("blocks high-volume item errors even when the cluster limit is sufficient", () => {
    const evidence = fixture();
    for (let i = 0; i < 600; i++) {
      evidence.audio.samples.push({
        ...evidence.audio.samples[i % 598], id: `added-${i}`, clusterId: `added-${i}`, sourceSha256: hash(`added-${i}`),
      });
    }
    evidence.audio.samples[0].autoSavedItems = 1_000;
    expect(lowerConfidenceLimit(1_197, 1_198)).toBeGreaterThan(0.995);
    held(evidence, "audio one-sided 95% lower bound");
  });

  it("fails for poor clear-item coverage, unrun inputs and slow real audio", () => {
    const low = fixture();
    low.text.samples.forEach(sample => { sample.clearSafeItems = 2; });
    held(low, "text clear/safe item coverage");
    const incomplete = fixture();
    incomplete.text.samples[0].status = "unrun";
    held(incomplete, "text cohort provenance and coverage of input cases");
    const slow = fixture();
    slow.audio.samples.forEach(sample => { sample.elapsedMs = 8_001; });
    held(slow, "audio short-passage p95");
  });

  it("counts failed reading and speech charges and requires complete billing evidence", () => {
    const expensive = fixture();
    expensive.budget.configuredUsd = 50;
    held(expensive, "Forecast cost including failures and speech-to-text");
    const incomplete = fixture();
    incomplete.audio.billingComplete = false;
    held(incomplete, "Forecast cost including failures and speech-to-text");
  });

  it("requires zero critical failures, genuine rollout stages, fourteen complete days, zero legacy traffic and a rollback drill", () => {
    const failed = fixture();
    failed.audio.critical.unsupportedAmounts = 1;
    held(failed, "Critical failures and reconciliation");
    const skippedStage = fixture();
    skippedStage.pilot.days.splice(1, 1);
    held(skippedStage, "Monitored 5%, 25%, 100% stages");
    const gap = fixture();
    gap.pilot.days.splice(8, 1);
    held(gap, "Fourteen consecutive reconciled full-pilot days");
    const legacy = fixture();
    legacy.pilot.days[3].legacy.jobs = 1;
    held(legacy, "Zero legacy request, queue and job calls");
    const noRollback = fixture();
    noRollback.pilot.rollback.performed = false;
    held(noRollback, "Rollback tested");
  });

  it("reports eligibility for manual review only when every gate passes", () => {
    const result = assessRelease(fixture(), asOf);
    expect(result.gates.filter(gate => !gate.passed)).toEqual([]);
    expect(result.eligibleForManualReview).toBe(true);
  });
});
