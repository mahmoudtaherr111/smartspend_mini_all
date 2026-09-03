/**
 * Builds the reliability table that turns evidence into a probability.
 *
 * The table is data, not code: it records how often each kind of evidence has actually
 * been right, so the decision layer stops relying on numbers that were hand-picked to
 * clear a threshold. The benchmark's labelled items are the first source; production
 * corrections (`classification_logs.wasCorrected`) are the second and will dominate
 * once there are enough of them.
 *
 * Run via `npm run bench:classify:calibrate` after a benchmark run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildReliabilityTable,
  emptyEvidence,
  type Evidence,
  type ReliabilityTable,
} from "../lib/classification-evidence";
import type { CaseScore, ScorableResult } from "./classification-scorer";
import type { BenchmarkCase } from "./fixtures/classification-cases.types";

export const CALIBRATION_PATH = "api/lib/confidence-calibration.generated.ts";

export interface CalibrationInput {
  case: BenchmarkCase;
  score: CaseScore;
  result: ScorableResult;
}

export interface Observation {
  evidence: Evidence;
  correct: boolean;
}

/**
 * One observation per matched item. Spurious and missing items are excluded on purpose:
 * calibration answers "given this evidence, is the answer right", which only has meaning
 * where there is an answer to judge. Recall failures are measured separately.
 */
export function collectObservations(rows: CalibrationInput[]): Observation[] {
  const observations: Observation[] = [];

  for (const row of rows) {
    for (const m of row.score.matches) {
      if (m.actualIndex === null || m.expectedIndex === null) continue;
      const item = row.result.items[m.actualIndex];
      const raw = item?.evidence;
      if (!raw) continue;

      const evidence: Evidence = {
        ...emptyEvidence(),
        matchKind: raw.matchKind as Evidence["matchKind"],
        rawStrength: Number(raw.rawStrength ?? 0),
        agreement: Number(raw.agreement ?? 0),
        disagreement: Number(raw.disagreement ?? 0),
        hasAmbiguityPenalty: Boolean(raw.hasAmbiguityPenalty),
        categoryIsFallback: Boolean(raw.categoryIsFallback),
      };

      observations.push({
        evidence,
        correct: m.amountOk && m.typeOk && m.categoryOk,
      });
    }
  }

  return observations;
}

/**
 * Emitted as a TypeScript module rather than JSON: it is type-checked, it bundles with
 * no build configuration, and it shows up as a readable diff. The table has to stay
 * inspectable — the whole point is that these numbers were measured, not chosen.
 */
export function writeCalibrationTable(
  observations: Observation[],
  meta: { source: string; gitSha: string; generatedAt: string },
): ReliabilityTable {
  const table = buildReliabilityTable(observations, {
    version: meta.gitSha,
    source: meta.source,
    generatedAt: meta.generatedAt,
  });

  const header = [
    "/**",
    " * GENERATED — do not edit by hand. Run `npm run bench:classify:calibrate`.",
    " *",
    " * Observed accuracy per evidence bucket. This is what makes `confidence` a",
    " * probability instead of a rank: every number below was measured against labelled",
    " * data, and `prior` is the overall accuracy that thin buckets shrink toward.",
    " */",
    'import type { ReliabilityTable } from "./classification-evidence";',
    "",
    "export const CONFIDENCE_CALIBRATION: ReliabilityTable =",
  ].join("\n");

  const body = `${header}\n  ${JSON.stringify(table, null, 2)};\n`;

  mkdirSync(dirname(CALIBRATION_PATH), { recursive: true });
  writeFileSync(CALIBRATION_PATH, body, "utf8");
  return table;
}

/** Human-readable summary, printed after a calibration run. */
export function describeTable(table: ReliabilityTable): string {
  const rows = Object.entries(table.buckets)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([key, b]) => {
      const observed = b.n === 0 ? 0 : b.hits / b.n;
      return `  ${key.padEnd(24)} n=${String(b.n).padStart(4)}  observed=${(observed * 100).toFixed(1)}%`;
    });
  return [
    `calibration table — ${table.source}`,
    `  prior: ${(table.prior * 100).toFixed(1)}%`,
    ...rows,
  ].join("\n");
}
