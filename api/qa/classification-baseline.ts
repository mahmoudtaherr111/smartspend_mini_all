/**
 * Baseline freeze / compare — the regression ratchet.
 *
 *   tsx api/qa/classification-baseline.ts --freeze    (after a bench run)
 *   tsx api/qa/classification-baseline.ts --compare
 *
 * The frozen baseline is the pre-refactor truth. Every later stage must beat it or
 * at least not regress; `--compare` is what turns "I think it got better" into a
 * number, and it fails the process (exit 1) when a gate is crossed.
 *
 * Only `locked`-tier cases enter the ratchet. `aspirational` cases document known
 * taxonomy gaps and `legacy` cases have unreviewed expectations, so neither may gate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AggregateScore } from "./classification-scorer";
import type { BenchmarkRun } from "./classification-report";
import { RAW_DIR } from "./classification-report";

export const BASELINE_PATH = "api/lib/__baselines__/classification-benchmark.baseline.json";

export interface Baseline {
  gitSha: string;
  pipelineVersion: string;
  generatedAt: string;
  mode: string;
  pass: string;
  plan: string;
  overall: AggregateScore;
  byBucket: Record<string, AggregateScore>;
  /** caseId -> was it fully correct. Catches a single case flipping even when aggregates hold. */
  lockedCaseVerdicts: Record<string, boolean>;
  system?: {
    unsafeAutoSaveRate: number;
    expectedCalibrationError: number;
    confidenceSeparation: number;
    numberCompositionErrors: number;
    crashRate: number;
    spuriousOnNonFinancial: number;
  };
}

/**
 * Each gate is a direction plus a tolerance. `higherIsBetter` gates fail on a drop
 * beyond tolerance; the others fail on a rise. `absoluteMax` gates ignore the
 * baseline entirely — taxonomy violations are never acceptable, however many the
 * baseline happened to have.
 */
interface Gate {
  key: string;
  label: string;
  read: (b: Baseline) => number;
  higherIsBetter: boolean;
  tolerance: number;
  absoluteMax?: number;
}

const GATES: Gate[] = [
  { key: "tripleF1", label: "triple F1", read: (b) => b.overall.tripleF1, higherIsBetter: true, tolerance: 0.005 },
  { key: "segmentationExact", label: "تقسيم مضبوط", read: (b) => b.overall.segmentationExact, higherIsBetter: true, tolerance: 0.01 },
  { key: "sumAccuracyMean", label: "دقة المجاميع", read: (b) => b.overall.sumAccuracyMean, higherIsBetter: true, tolerance: 0.01 },
  { key: "hallucinationRate", label: "معدل الهلوسة", read: (b) => b.overall.hallucinationRate, higherIsBetter: false, tolerance: 0.005 },
  { key: "miscFallbackRate", label: "السقوط في متنوعات", read: (b) => b.overall.miscFallbackRate, higherIsBetter: false, tolerance: 0.01 },
  { key: "taxonomyViolationRate", label: "تصنيفات غير شرعية", read: (b) => b.overall.taxonomyViolationRate, higherIsBetter: false, tolerance: 0, absoluteMax: 0 },
  { key: "unsafeAutoSaveRate", label: "حفظ تلقائي رغم خطأ", read: (b) => b.system?.unsafeAutoSaveRate ?? 0, higherIsBetter: false, tolerance: 0.01 },
  { key: "crashRate", label: "انهيارات", read: (b) => b.system?.crashRate ?? 0, higherIsBetter: false, tolerance: 0, absoluteMax: 0 },
  { key: "expectedCalibrationError", label: "خطأ معايرة الثقة", read: (b) => b.system?.expectedCalibrationError ?? 0, higherIsBetter: false, tolerance: 0.02 },
  { key: "confidenceSeparation", label: "فصل الثقة", read: (b) => b.system?.confidenceSeparation ?? 0, higherIsBetter: true, tolerance: 1 },
];

function latestRunPath(mode = "offline"): string {
  return `${RAW_DIR}/latest-${mode}.json`;
}

export function loadLatestRun(mode = "offline"): BenchmarkRun {
  const p = latestRunPath(mode);
  if (!existsSync(p)) {
    throw new Error(`لا يوجد تشغيل محفوظ في ${p} — شغّل "npm run bench:classify" الأول.`);
  }
  return JSON.parse(readFileSync(p, "utf8")) as BenchmarkRun;
}

export function toBaseline(run: BenchmarkRun): Baseline {
  const locked = run.cases.filter((c) => c.tier === "locked");
  return {
    gitSha: run.gitSha,
    pipelineVersion: run.pipelineVersion,
    generatedAt: run.generatedAt,
    mode: run.mode,
    pass: run.pass,
    plan: run.plan,
    overall: run.overall,
    byBucket: run.byBucket as Record<string, AggregateScore>,
    lockedCaseVerdicts: Object.fromEntries(
      locked.map((c) => [
        c.id,
        c.tripleHits === c.expectedCount && c.spurious === 0 && c.countExact,
      ]),
    ),
    system: run.system
      ? {
          unsafeAutoSaveRate: run.system.unsafeAutoSaveRate,
          expectedCalibrationError: run.system.expectedCalibrationError,
          confidenceSeparation: run.system.confidenceSeparation,
          numberCompositionErrors: run.system.segmentation.numberCompositionErrors,
          crashRate: run.system.crashRate,
          spuriousOnNonFinancial: run.system.spuriousOnNonFinancial,
        }
      : undefined,
  };
}

export function freeze(mode = "offline"): Baseline {
  const run = loadLatestRun(mode);
  const baseline = toBaseline(run);
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
  return baseline;
}

export function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

export interface GateResult {
  label: string;
  baseline: number;
  current: number;
  delta: number;
  passed: boolean;
  reason?: string;
}

export interface ComparisonResult {
  ok: boolean;
  gates: GateResult[];
  regressedCases: string[];
  fixedCases: string[];
  newCases: string[];
}

export function compare(current: Baseline, baseline: Baseline): ComparisonResult {
  const gates: GateResult[] = GATES.map((g) => {
    const b = g.read(baseline);
    const c = g.read(current);
    const delta = c - b;

    if (g.absoluteMax !== undefined) {
      const passed = c <= g.absoluteMax;
      return {
        label: g.label,
        baseline: b,
        current: c,
        delta,
        passed,
        reason: passed ? undefined : `يجب أن يكون ≤ ${g.absoluteMax}`,
      };
    }

    const passed = g.higherIsBetter ? delta >= -g.tolerance : delta <= g.tolerance;
    return {
      label: g.label,
      baseline: b,
      current: c,
      delta,
      passed,
      reason: passed
        ? undefined
        : g.higherIsBetter
          ? `انخفض أكثر من ${g.tolerance}`
          : `ارتفع أكثر من ${g.tolerance}`,
    };
  });

  const regressedCases: string[] = [];
  const fixedCases: string[] = [];
  const newCases: string[] = [];

  for (const [id, nowOk] of Object.entries(current.lockedCaseVerdicts)) {
    if (!(id in baseline.lockedCaseVerdicts)) {
      newCases.push(id);
      continue;
    }
    const wasOk = baseline.lockedCaseVerdicts[id];
    if (wasOk && !nowOk) regressedCases.push(id);
    if (!wasOk && nowOk) fixedCases.push(id);
  }

  return {
    ok: gates.every((g) => g.passed) && regressedCases.length === 0,
    gates,
    regressedCases,
    fixedCases,
    newCases,
  };
}

function formatComparison(r: ComparisonResult): string {
  // Arabic labels have no reliable monospace width, so columns are delimited rather
  // than padded — padding mixed-direction text produces the ragged output it is
  // meant to prevent.
  const lines: string[] = [
    "",
    "مقارنة بخط الأساس المجمَّد",
    "",
    "| | المقياس | الأساس | الحالي | الفرق |",
    "|---|---|---|---|---|",
  ];
  for (const g of r.gates) {
    const sign = g.delta >= 0 ? "+" : "";
    lines.push(
      `| ${g.passed ? "ok" : "FAIL"} | ${g.label} | ${g.baseline.toFixed(4)} | ` +
        `${g.current.toFixed(4)} | ${sign}${g.delta.toFixed(4)}` +
        `${g.reason ? ` — ${g.reason}` : ""} |`,
    );
  }
  lines.push("");
  if (r.fixedCases.length) lines.push(`أُصلحت (${r.fixedCases.length}): ${r.fixedCases.join(", ")}`);
  if (r.regressedCases.length) lines.push(`تراجعت (${r.regressedCases.length}): ${r.regressedCases.join(", ")}`);
  if (r.newCases.length) lines.push(`جديدة (${r.newCases.length}): ${r.newCases.join(", ")}`);
  lines.push("");
  lines.push(r.ok ? "النتيجة: PASS" : "النتيجة: FAIL");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const modeArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "offline";

  if (args.includes("--freeze")) {
    const b = freeze(modeArg);
    console.log(`تم تجميد خط الأساس -> ${BASELINE_PATH}`);
    console.log(
      `  ${b.gitSha} · ${b.pipelineVersion} · tripleF1=${b.overall.tripleF1.toFixed(4)} · ` +
        `${Object.keys(b.lockedCaseVerdicts).length} حالة مقفلة`,
    );
    return;
  }

  if (args.includes("--compare")) {
    const baseline = loadBaseline();
    if (!baseline) {
      console.error(`لا يوجد خط أساس في ${BASELINE_PATH} — شغّل --freeze الأول.`);
      process.exit(1);
    }
    const current = toBaseline(loadLatestRun(modeArg));
    const result = compare(current, baseline);
    console.log(formatComparison(result));
    process.exit(result.ok ? 0 : 1);
  }

  console.log("الاستخدام: classification-baseline.ts --freeze | --compare [--mode=offline|live]");
}

const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("classification-baseline.ts");
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
