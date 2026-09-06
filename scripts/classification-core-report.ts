/**
 * Runs the offline quality corpus and writes a comparable report.
 *
 *   npx tsx scripts/classification-core-report.ts [--out <path>] [--baseline <path>] [--details <path>]
 *
 * The classifier is not touched. This spawns the existing quality test with
 * `CLASSIFY_CORE_EVIDENCE_PATH` set — the same run the gate performs — then hands the
 * evidence it writes to `buildCoreReport`. Nothing here re-scores or re-aligns anything;
 * a reporting layer that disagrees with the gate is worse than no report.
 *
 * ── R1: a failed run must not leave a previous run's numbers looking current ──
 *
 * The first version wrote to a TRACKED path and returned non-zero on failure without
 * touching what was already there. Combined with `if: always()` on the CI upload, a red
 * attempt could publish an artifact, named after that attempt, containing the previous
 * attempt's figures — with its own older `generatedAt` buried in the file. The job stayed
 * red; the evidence beside it lied.
 *
 * Three changes, and each is doing separate work:
 *
 *   1. The default output is an UNTRACKED per-attempt path. Nothing is in the repo for a
 *      checkout to resurrect.
 *   2. Every report carries `status`, the commit, the tree, whether the tree was dirty,
 *      and the CI run id and attempt. An artifact that does not belong to this attempt is
 *      now visibly so.
 *   3. On failure a `status: "failed"` diagnostic is written — carrying the stage that
 *      failed and NO metrics — and any stale success file at the output path is removed.
 *      Refusing to write at all was what let the old file pass for the new one.
 *
 * Writes are atomic: a temp file in the same directory, then a rename. A process killed
 * mid-write leaves the previous file or none, never half a JSON document that the next
 * reader will parse as truth.
 */
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  buildCoreReport,
  CoreReportContractError,
  REPORT_SCHEMA_VERSION,
  type CoreReportProvenance,
} from "../api/qa/classification-core-report";

/**
 * Files whose content can move a metric.
 *
 * Split in two because they answer different questions. `SCORER_FILES` are the ruler —
 * a change to them means two runs measured differently and must not be subtracted.
 * `CLASSIFIER_FILES` are the thing being measured; a change to them is the WHOLE POINT
 * of a comparison, so it is recorded and never blocks one.
 */
const SCORER_FILES = [
  "api/qa/classification-scorer.ts",
  "api/qa/classification-system-metrics.ts",
  "api/qa/classification-core-report.ts",
  "api/lib/financial-event-quality.test.ts",
];

const CLASSIFIER_FILES = [
  "api/lib/smart-pipeline.ts",
  "api/lib/financial-event-plan.ts",
  "api/lib/final-acceptance.ts",
  "api/lib/classification-decision.ts",
  "api/lib/classification-merge.ts",
  "api/lib/classification-evidence.ts",
  "api/lib/classification-prompt.ts",
  "api/lib/classifier-contract.ts",
  "api/lib/confidence-calibrator.ts",
  "api/lib/confidence-calibration.generated.ts",
  "api/lib/post-classifier-verifier.ts",
  "api/lib/rule-engine.ts",
  "api/lib/entity-extractor.ts",
  "api/lib/arabic-number-parser.ts",
  "api/lib/negation-detector.ts",
  "api/lib/normalizer-v2.ts",
  "api/lib/text-normalizer.ts",
  "api/lib/narrative-decomposer.ts",
  "api/lib/admissibility-gate.ts",
  "api/lib/amount-ledger.ts",
  "api/lib/category-registry.ts",
  "api/lib/taxonomy-ssot.ts",
  "api/lib/direction-governed-taxonomy.ts",
  "api/lib/correction-rules.ts",
  "api/lib/intent-detector.ts",
  "api/lib/egyptian-dictionary.ts",
  "api/lib/model-mapper.ts",
  "api/lib/llm-provider-chain.ts",
  "api/lib/llm-router.ts",
];

const QUALITY_TEST = "api/lib/financial-event-quality.test.ts";

/** Where a per-attempt report goes when the caller does not choose. Untracked. */
const DEFAULT_OUT_DIR = ".artifacts/classification-core";

type FailureStage =
  | "spawn"
  | "quality-gate"
  | "evidence-missing"
  | "contract"
  | "write";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hashFiles(root: string, files: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of files) {
    try {
      out[file] = sha256(readFileSync(resolve(root, file), "utf8"));
    } catch {
      // Reported as absent rather than omitted: which files were hashed is provenance.
      out[file] = "absent";
    }
  }
  return out;
}

/**
 * The calibration table's declared version.
 *
 * Parsed out of the generated module rather than imported, because this wrapper runs
 * under tsx in a plain Node process and importing the classifier's module graph here
 * would drag the whole pipeline in to read one string.
 */
function calibrationVersion(root: string): string {
  try {
    const source = readFileSync(
      resolve(root, "api/lib/confidence-calibration.generated.ts"),
      "utf8",
    );
    return /"version"\s*:\s*"([^"]+)"/.exec(source)?.[1] ?? "unknown";
  } catch {
    return "absent";
  }
}

function git(root: string, args: string[]): string {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : "";
}

function gitState(root: string): CoreReportProvenance["git"] {
  const dirtyFiles = git(root, ["status", "--porcelain=v1", "-uall"])
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  return {
    commit: git(root, ["rev-parse", "HEAD"]) || "unknown",
    tree: git(root, ["rev-parse", "HEAD^{tree}"]) || "unknown",
    dirty: dirtyFiles.length > 0,
    dirtyFiles: dirtyFiles.slice(0, 50),
  };
}

function ciContext(): CoreReportProvenance["ci"] {
  const runId = process.env.GITHUB_RUN_ID;
  if (!runId) return null;
  return {
    runId,
    attempt: process.env.GITHUB_RUN_ATTEMPT || "1",
    workflow: process.env.GITHUB_WORKFLOW || "unknown",
  };
}

/**
 * Write, or leave what was there untouched — never a partial file.
 *
 * `writeFileSync` straight to the destination can be interrupted between truncate and
 * flush, and the next reader parses whatever landed. A rename within the same directory
 * is atomic on both platforms this runs on.
 */
function writeJsonAtomic(path: string, value: unknown): void {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, target);
}

/**
 * A failure artifact: says what broke and carries no metrics at all.
 *
 * Deliberately not shaped like a report. Anything reading these files for numbers finds
 * none, which is the correct answer for a run that did not produce any.
 */
function writeFailure(
  outPath: string,
  stage: FailureStage,
  detail: string,
  provenance: Partial<CoreReportProvenance>,
): void {
  // A stale SUCCESS file at this path would otherwise be picked up by the artifact
  // upload and read as this attempt's result.
  if (existsSync(resolve(outPath))) {
    try {
      unlinkSync(resolve(outPath));
    } catch {
      /* best effort; the failure file below replaces it anyway */
    }
  }
  writeJsonAtomic(outPath, {
    schemaVersion: REPORT_SCHEMA_VERSION,
    status: "failed",
    failedStage: stage,
    detail,
    generatedAt: new Date().toISOString(),
    git: provenance.git ?? null,
    ci: provenance.ci ?? null,
    note: "No metrics are reported for a failed run. Do not compare against this file.",
  });
}

function main(): number {
  const root = resolve(import.meta.dirname, "..");
  const outPath =
    arg("out") ||
    resolve(
      root,
      DEFAULT_OUT_DIR,
      `report-${process.env.GITHUB_RUN_ID || "local"}-${process.env.GITHUB_RUN_ATTEMPT || Date.now()}.json`,
    );
  const detailsPath = arg("details");
  const baselinePath = arg("baseline");

  const git = gitState(root);
  const ci = ciContext();
  const partial = { git, ci };

  const scratch = mkdtempSync(resolve(tmpdir(), "classify-core-"));
  const evidencePath = resolve(scratch, "evidence.json");
  const cleanup = () => rmSync(scratch, { recursive: true, force: true });

  // A baseline that was ASKED for is required to be usable. Read it BEFORE spending a
  // corpus run on a comparison that cannot happen.
  let baseline: unknown;
  if (baselinePath) {
    try {
      baseline = JSON.parse(readFileSync(resolve(baselinePath), "utf8"));
    } catch (err) {
      console.error(
        `[core-report] --baseline ${baselinePath} could not be read: ${(err as Error).message}`,
      );
      writeFailure(outPath, "contract", `baseline unreadable: ${(err as Error).message}`, partial);
      cleanup();
      return 2;
    }
  }

  // Resolved from node_modules rather than through `npx`: the npx shim is a .cmd on
  // Windows, which spawnSync cannot execute without a shell, and the failure surfaces as
  // `status: null` — indistinguishable, from the caller's side, from the gate failing.
  const vitestBin = resolve(root, "node_modules/vitest/vitest.mjs");
  const startedAt = Date.now();
  const run = spawnSync(process.execPath, [vitestBin, "run", QUALITY_TEST, "--reporter=dot"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CLASSIFY_CORE_EVIDENCE_PATH: evidencePath },
  });
  const runtimeMs = Date.now() - startedAt;

  if (run.error) {
    console.error(`[core-report] could not start vitest: ${run.error.message}`);
    writeFailure(outPath, "spawn", run.error.message, partial);
    cleanup();
    return 1;
  }

  if (run.status !== 0) {
    const how =
      run.status === null ? `killed by ${run.signal || "a signal"}` : `exit ${run.status}`;
    console.error(`\n[core-report] quality gate failed (${how}). No metrics written.`);
    writeFailure(outPath, "quality-gate", how, partial);
    cleanup();
    return run.status ?? 1;
  }

  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (err) {
    console.error(
      `[core-report] the quality run passed but wrote no usable evidence: ${(err as Error).message}`,
    );
    writeFailure(outPath, "evidence-missing", (err as Error).message, partial);
    cleanup();
    return 1;
  }

  const rows = (evidence as { rows?: Array<{ case: unknown }> }).rows || [];
  const mode = (evidence as { mode?: string }).mode || "offline";

  const provenance: CoreReportProvenance = {
    fingerprint: {
      fixtureSha256: sha256(JSON.stringify(rows.map((row) => row.case))),
      caseCount: rows.length,
      mode,
      // The ruler. A change here means the two runs measured differently.
      scorerSha256: sha256(JSON.stringify(hashFiles(root, SCORER_FILES))),
      // Read from the generated table itself rather than from its file hash, so the
      // reason a comparison is refused reads as "v3.0 -> v3.1" instead of two hashes.
      calibrationVersion: calibrationVersion(root),
      schemaVersion: REPORT_SCHEMA_VERSION,
      experiment: {
        command: `vitest run ${QUALITY_TEST}`,
        provider: "none",
        database: "mocked",
        userPlan: "free",
        modelName: "flash",
        maxTokens: 512,
      },
    },
    // The classifier's own hashes travel with the report but not in the fingerprint:
    // this is how a metric change gets attributed, not how a comparison gets refused.
    sourceSha256: hashFiles(root, CLASSIFIER_FILES),
    git,
    generatedAt: new Date().toISOString(),
    runtimeMs,
    node: process.version,
    platform: process.platform,
    ci,
    status: "success",
  };

  let report;
  try {
    report = buildCoreReport({ evidence, baseline, provenance });
  } catch (err) {
    const message =
      err instanceof CoreReportContractError ? err.message : (err as Error).message;
    console.error(`[core-report] ${message}`);
    writeFailure(outPath, "contract", message, partial);
    cleanup();
    return 2;
  }

  try {
    writeJsonAtomic(outPath, report);
    if (detailsPath) writeJsonAtomic(detailsPath, evidence);
  } catch (err) {
    console.error(`[core-report] could not write the report: ${(err as Error).message}`);
    writeFailure(outPath, "write", (err as Error).message, partial);
    cleanup();
    return 1;
  }
  cleanup();

  const { candidate, delta } = report.headline;
  const safety = report.decisions.autoSaveSafety;
  const pct = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(2)}%`);

  console.log(`\n[core-report] ${outPath}`);
  console.log(`  status               success  (${git.commit.slice(0, 12)}${git.dirty ? ", dirty" : ""})`);
  console.log(`  cases                ${candidate.cases}`);
  console.log(
    `  record triple F1     ${candidate.tripleF1.toFixed(4)}${
      delta ? ` (${delta.tripleF1 >= 0 ? "+" : ""}${delta.tripleF1.toFixed(4)})` : ""
    }`,
  );
  console.log(`  amount F1            ${candidate.amountF1.toFixed(4)}`);
  console.log(
    `  auto-save, wrong triple/count   ${safety.tripleUnsafeAutoSaveCases} — ` +
      `${pct(safety.tripleUnsafeRateOfAutoSaved)} of ${safety.autoSavedCases} auto-saved, ` +
      `${pct(safety.tripleUnsafeRateOfAllCases)} of ${safety.totalCases} cases`,
  );
  console.log(
    `  auto-save, any scored error     ${safety.autoSaveCasesWithAnyScoredError} — ` +
      `${pct(safety.anyErrorRateOfAutoSaved)} of ${safety.autoSavedCases} auto-saved`,
  );
  console.log(`  comparability        ${report.comparability.reason}`);
  for (const warning of report.warnings) console.log(`  ! ${warning}`);
  if (detailsPath) console.log(`  details (synthetic fixtures) -> ${detailsPath}`);
  return 0;
}

process.exit(main());
