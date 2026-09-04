/**
 * The live benchmark: the same 96 cases, against the real providers, with real money.
 *
 * The offline run proves segmentation, number parsing, taxonomy legality, hallucination
 * rate and decision routing — everything deterministic. It cannot prove end-to-end
 * accuracy, because the model never runs. This does, and it is the only thing here that
 * can spend.
 *
 * So it is built to be hard to run by accident. Five independent gates, every one of
 * which must open:
 *
 *   1. `CLASSIFY_BENCH_LIVE=1` in the environment.
 *   2. A real API key — not the literal "test" the unit suite injects.
 *   3. `VITEST` unset, so this can never be triggered from inside a test run.
 *   4. `--confirm-spend`, passed after reading a printed cost estimate.
 *   5. `--max-tokens` / `--max-cases` ceilings that abort mid-run the moment they are
 *      crossed, rather than after.
 *
 * The ceilings abort rather than warn on purpose: a runaway loop against a paid API is
 * the one failure here whose cost keeps growing while nobody is watching.
 *
 * Usage:
 *   npm run bench:classify:live -- --confirm-spend --plan=free --max-cases=96
 */
import "dotenv/config";
import { runSmartPipeline, SMART_PIPELINE_VERSION } from "../lib/smart-pipeline";
import type { PipelineInput } from "../lib/smart-pipeline";
import {
  ALL_BENCHMARK_CASES,
  assertFixtureIntegrity,
  getBenchmarkCases,
  summarizeFixtures,
} from "./fixtures";
import type { BenchmarkCase } from "./fixtures/classification-cases.types";
import {
  aggregate,
  aggregateByTag,
  groupScoresBy,
  scoreCase,
  type CaseScore,
} from "./classification-scorer";
import {
  computeSystemMetrics,
  type SystemMetricInput,
} from "./classification-system-metrics";
import { writeBenchmarkReport } from "./classification-report";
import {
  collectObservations,
  describeTable,
  writeCalibrationTable,
} from "./classification-calibration";
import { defaultGeminiModelForPlan } from "../lib/model-mapper";

// ─── Cost model ─────────────────────────────────────────────────────────────

/**
 * USD per million tokens. Deliberately rounded UP from published prices: an estimate
 * that flatters the run is worse than useless, because it is read to decide whether to
 * spend. Actual cost is reported from real usage at the end.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.1-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.5-flash": { input: 0.3, output: 2.5 },
  "gemini-3.1-pro": { input: 1.25, output: 10.0 },
};

function priceFor(model: string) {
  return PRICES[model] || { input: 1.25, output: 10.0 };
}

/** Arabic runs ~0.65 tokens per character; measured against the offline corpus. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.7) + 40;
}

// ─── Argument parsing ───────────────────────────────────────────────────────

interface Options {
  plan: "free" | "pro" | "ultra";
  maxCases: number;
  maxTokens: number;
  confirmSpend: boolean;
  /** Rebuild the reliability table from THIS run's labelled results. */
  calibrate: boolean;
  bucket?: string;
  model?: string;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };

  return {
    plan: (get("plan") as Options["plan"]) || "free",
    maxCases: Number(get("max-cases") || 96),
    maxTokens: Number(get("max-tokens") || 400_000),
    confirmSpend: argv.includes("--confirm-spend"),
    calibrate: argv.includes("--calibrate"),
    bucket: get("bucket"),
    model: get("model"),
  };
}

// ─── Gates ──────────────────────────────────────────────────────────────────

function resolveApiKey(): string {
  const key = process.env.GEMINI_API_KEY || "";
  // The unit suite injects the literal "test"; running against it would burn the whole
  // corpus producing 401s and look like a catastrophic accuracy regression.
  if (!key || key === "test" || key.length < 20) return "";
  return key;
}

function checkGates(opts: Options, apiKey: string): string[] {
  const blocked: string[] = [];
  if (process.env.CLASSIFY_BENCH_LIVE !== "1") {
    blocked.push("CLASSIFY_BENCH_LIVE=1 is not set");
  }
  if (!apiKey) {
    blocked.push("no usable GEMINI_API_KEY (missing, too short, or the test placeholder)");
  }
  if (process.env.VITEST) {
    blocked.push("running inside VITEST — the live benchmark must never spend from a test run");
  }
  if (!opts.confirmSpend) {
    blocked.push("--confirm-spend was not passed");
  }
  if (!Number.isFinite(opts.maxTokens) || opts.maxTokens <= 0) {
    blocked.push("--max-tokens must be a positive number");
  }
  return blocked;
}

// ─── Run ────────────────────────────────────────────────────────────────────

const BENCH_USER_BASE = 940_000;

function inputFor(
  c: BenchmarkCase,
  index: number,
  opts: Options,
  apiKey: string,
  model: string,
): PipelineInput {
  return {
    text: c.text,
    userId: BENCH_USER_BASE + index,
    userType: "local",
    userPlan: opts.plan,
    userDict: [],
    apiKey,
    apiKey2: process.env.GEMINI_API_KEY_2 || "",
    groqApiKey: process.env.GROQ_API_KEY || "",
    fireworksApiKey: process.env.FIREWORKS_API_KEY || "",
    nvidiaApiKey: process.env.NVIDIA_API_KEY || "",
    modelName: model,
    maxTokens: 1024,
    pipelineSettings: {},
    userProfileContext: { knownPeople: c.knownPeople || [] },
  } as PipelineInput;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const apiKey = resolveApiKey();
  const model = opts.model || defaultGeminiModelForPlan(opts.plan);

  assertFixtureIntegrity();
  const all = opts.bucket
    ? getBenchmarkCases({ buckets: [opts.bucket as never] })
    : [...ALL_BENCHMARK_CASES];
  const cases = all.slice(0, Math.max(0, opts.maxCases));

  // Estimate BEFORE the gate check, so a blocked run still tells the operator what it
  // would have cost and what to pass next.
  const promptTokens = cases.reduce((sum, c) => sum + estimateTokens(c.text) + 900, 0);
  const outputTokens = cases.reduce(
    (sum, c) => sum + 60 * Math.max(1, c.expectedItems.length),
    0,
  );
  const price = priceFor(model);
  const estUsd =
    (promptTokens * price.input) / 1e6 + (outputTokens * price.output) / 1e6;

  const s = summarizeFixtures(all);
  console.log("─".repeat(64));
  console.log("Live classification benchmark");
  console.log(`  cases            ${cases.length} of ${s.total}`);
  console.log(`  plan / model     ${opts.plan} / ${model}`);
  console.log(`  est. prompt      ~${promptTokens.toLocaleString()} tokens`);
  console.log(`  est. output      ~${outputTokens.toLocaleString()} tokens`);
  console.log(`  ESTIMATED COST   ~$${estUsd.toFixed(4)}`);
  console.log(`  hard ceilings    ${opts.maxTokens.toLocaleString()} tokens / ${opts.maxCases} cases`);
  console.log("─".repeat(64));

  const blocked = checkGates(opts, apiKey);
  if (blocked.length > 0) {
    console.error("Refusing to spend. Every gate must open:");
    for (const reason of blocked) console.error(`  ✗ ${reason}`);
    console.error(
      "\nTo run:\n  CLASSIFY_BENCH_LIVE=1 npm run bench:classify:live -- --confirm-spend" +
        ` --plan=${opts.plan} --max-cases=${opts.maxCases} --max-tokens=${opts.maxTokens}`,
    );
    process.exitCode = 1;
    return;
  }

  if (estUsd > 5) {
    console.error(`Refusing: estimate $${estUsd.toFixed(2)} exceeds the $5 hard ceiling.`);
    process.exitCode = 1;
    return;
  }

  const scores: CaseScore[] = [];
  const systemRows: SystemMetricInput[] = [];
  let spentTokens = 0;
  let aborted: { reason: string; atCase: string } | undefined;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];

    // Checked BEFORE the call, not after: a ceiling that stops once it is already
    // exceeded has not limited anything.
    if (spentTokens >= opts.maxTokens) {
      aborted = {
        reason: `token ceiling reached (${spentTokens.toLocaleString()} >= ${opts.maxTokens.toLocaleString()})`,
        atCase: c.id,
      };
      console.warn(`\n[abort] ${aborted.reason} at ${c.id}`);
      break;
    }

    let result;
    let crashed = false;
    try {
      result = await runSmartPipeline(inputFor(c, i, opts, apiKey, model));
    } catch (err) {
      crashed = true;
      result = {
        items: [],
        decision: "clarify" as const,
        clarificationQuestion: `THREW: ${(err as Error).message}`,
        overallConfidence: 0,
        tokensUsed: 0,
        parsedBy: "crash",
        modelUsed: model,
        processingTimeMs: 0,
        log: {},
      };
    }

    spentTokens += result.tokensUsed || 0;
    const score = scoreCase(c, result, "live");
    scores.push(score);
    systemRows.push({ case: c, score, result, crashed });

    const served = (result.log as { providerRoute?: { servedBy?: string } })?.providerRoute
      ?.servedBy;
    process.stdout.write(
      `\r  ${i + 1}/${cases.length}  ${c.id.padEnd(10)} ` +
        `tokens=${spentTokens.toLocaleString().padStart(8)} ` +
        `${served ? `via ${served}` : ""}        `,
    );
  }

  console.log("\n");

  const locked = scores.filter((sc) => sc.tier === "locked");
  const overall = aggregate(locked);
  const system = computeSystemMetrics(systemRows);

  const actualUsd =
    (spentTokens * 0.6 * price.input) / 1e6 + (spentTokens * 0.4 * price.output) / 1e6;

  console.log(`  triple F1          ${overall.tripleF1.toFixed(4)}`);
  console.log(`  segmentation       ${(overall.segmentationExact * 100).toFixed(1)}%`);
  console.log(`  hallucination      ${(overall.hallucinationRate * 100).toFixed(2)}%`);
  console.log(`  unsafe auto-save   ${(system.unsafeAutoSaveRate * 100).toFixed(2)}%`);
  console.log(`  tokens spent       ${spentTokens.toLocaleString()}`);
  console.log(`  approx. cost       ~$${actualUsd.toFixed(4)} (estimated $${estUsd.toFixed(4)})`);
  if (aborted) console.log(`  ABORTED            ${aborted.reason}`);

  // Calibrate from THIS distribution, not the offline one.
  //
  // The table shipped in the repo was built from the offline run, where the model never
  // executes — then applied to live traffic where the model produces a third of all
  // items. Calibrating on one distribution and deciding on another is why the live ECE
  // (0.077) was twice the offline ECE (0.035), and why the model path could claim 94.6%
  // while being right 60.5% of the time: its bucket had almost no support in the table.
  if (opts.calibrate && !aborted) {
    const observations = collectObservations(systemRows);
    const table = writeCalibrationTable(observations, {
      source: `live:${scores.length} cases plan=${opts.plan} model=${model}`,
      gitSha: SMART_PIPELINE_VERSION,
      generatedAt: new Date().toISOString(),
    });
    console.log(`\n${describeTable(table)}`);
  } else if (opts.calibrate && aborted) {
    console.warn("[calibrate] skipped — the run aborted, so the corpus is partial.");
  }

  await writeBenchmarkReport({
    mode: "live",
    pass: "live",
    plan: opts.plan,
    model,
    pipelineVersion: SMART_PIPELINE_VERSION,
    overall,
    byBucket: groupScoresBy(scores, (sc) => sc.bucket),
    byTier: groupScoresBy(scores, (sc) => sc.tier),
    byTag: aggregateByTag(scores, cases),
    cases: scores,
    system,
    aborted,
    force: true,
  });
}

main().catch((err) => {
  console.error("[live benchmark] fatal:", err);
  process.exitCode = 1;
});
