/**
 * Egyptian-dialect classification benchmark — hermetic offline pass.
 *
 * Lives under api/lib/ deliberately: vi.mock resolves specifiers relative to the
 * test file, so "../queries/connection" here resolves to the exact module id that
 * smart-pipeline.ts:20 imports.
 *
 * WHY THE DB MOCK IS NOT OPTIONAL: vitest.config.ts injects
 * DATABASE_URL=mysql://test:test@localhost:3306/test, and both muscle-memory's
 * loadUserPatterns (reached on every call) and smart-pipeline's RAG history read
 * issue real queries. The existing classification suites only pass quickly because
 * MySQL refuses that user fast. On any machine or CI where those credentials
 * resolve, the "golden" results silently change. This mock removes that variable.
 *
 * This suite MEASURES; it does not assert absolute correctness. Failing to extract
 * a transaction is data, not a broken build. The only hard gates are the ratchet
 * (in the report step) and taxonomy legality.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const { dbMock } = vi.hoisted(() => {
  const empty: unknown[] = [];
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    from: self,
    where: self,
    orderBy: self,
    innerJoin: self,
    leftJoin: self,
    groupBy: self,
    values: self,
    set: self,
    onDuplicateKeyUpdate: self,
    limit: () => Promise.resolve(empty),
    offset: () => Promise.resolve(empty),
    execute: () => Promise.resolve(empty),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(empty).then(resolve),
    catch: () => Promise.resolve(empty),
  });
  const query = new Proxy(
    {},
    {
      get: () => ({
        findMany: async () => [],
        findFirst: async () => undefined,
      }),
    },
  );
  return {
    dbMock: {
      select: self,
      insert: self,
      update: self,
      delete: self,
      transaction: async (fn: (tx: unknown) => unknown) => fn(chain),
      query,
    },
  };
});

vi.mock("../queries/connection", () => ({
  db: dbMock,
  getDb: () => dbMock,
  pool: { query: async () => [[], []], end: async () => {} },
}));

import {
  runSmartPipeline,
  invalidateUserClassificationCache,
  SMART_PIPELINE_VERSION,
  type PipelineInput,
} from "./smart-pipeline";
import {
  ALL_BENCHMARK_CASES,
  assertFixtureIntegrity,
  summarizeFixtures,
  type BenchmarkCase,
} from "../qa/fixtures/index";
import {
  scoreCase,
  aggregate,
  aggregateByTag,
  groupScoresBy,
  type CaseScore,
} from "../qa/classification-scorer";
import { writeBenchmarkReport } from "../qa/classification-report";
import {
  computeSystemMetrics,
  type SystemMetricInput,
} from "../qa/classification-system-metrics";
import {
  collectObservations,
  writeCalibrationTable,
  describeTable,
} from "../qa/classification-calibration";

/**
 * Each case gets its own synthetic user id so the pipeline's own 7-day LRU
 * (smart-pipeline.ts:29-32) and the per-user muscle-memory cache cannot serve one
 * case's answer to another.
 */
const BENCH_USER_BASE = 900_000;

function inputFor(c: BenchmarkCase, index: number): PipelineInput {
  return {
    text: c.text,
    userId: BENCH_USER_BASE + index,
    userType: "local",
    userPlan: "free",
    userDict: [],
    apiKey: "",
    apiKey2: "",
    modelName: "gemini-3.1-flash-lite",
    maxTokens: 1024,
    pipelineSettings: {},
    userProfileContext: { knownPeople: c.knownPeople || [] },
  };
}

const scores: CaseScore[] = [];
const systemRows: SystemMetricInput[] = [];

describe("Egyptian dialect classification benchmark (offline, local pass)", () => {
  beforeAll(() => {
    assertFixtureIntegrity();
    const s = summarizeFixtures();
    console.log(
      `[bench] ${s.total} cases / ${s.items} expected items — ` +
        Object.entries(s.byBucket)
          .map(([k, v]) => `${k}:${v}`)
          .join(" "),
    );
  });

  it.each(ALL_BENCHMARK_CASES.map((c, i) => [c.id, c, i] as const))(
    "%s",
    async (_id, c, index) => {
      let result;
      let crashed = false;
      try {
        result = await runSmartPipeline(inputFor(c, index));
      } catch (err) {
        // Objective: the pipeline must never break on ANY input. A throw is itself
        // a finding, so record it and keep measuring instead of aborting the run.
        crashed = true;
        result = {
          items: [],
          decision: "clarify" as const,
          clarificationQuestion: `THREW: ${(err as Error).message}`,
          overallConfidence: 0,
          tokensUsed: 0,
          parsedBy: "crash",
          modelUsed: "",
          processingTimeMs: 0,
          log: {},
        };
      }
      const score = scoreCase(c, result, "local");
      scores.push(score);
      systemRows.push({ case: c, score, result, crashed });

      // The one non-negotiable: the pipeline must never emit a (category, subCategory)
      // pair the application cannot store.
      expect(
        score.taxonomyViolations,
        `${c.id} أنتج تصنيفاً غير شرعي:\n` + score.failures.join("\n"),
      ).toBe(0);
    },
    60_000,
  );

  afterAll(async () => {
    if (scores.length === 0) return;
    for (let i = 0; i < ALL_BENCHMARK_CASES.length; i++) {
      invalidateUserClassificationCache(BENCH_USER_BASE + i, "local");
    }

    // The headline aggregate — and therefore the frozen baseline the ratchet compares
    // against — is the DEV pool. The held-out pool is reported beside it, never mixed in:
    // an aggregate that blends the cases we tuned on with the cases we did not is a
    // number that answers neither question.
    const locked = scores.filter((s) => s.tier === "locked" && s.split === "dev");
    const overall = aggregate(locked);
    const bySplit = groupScoresBy(
      scores.filter((s) => s.tier === "locked"),
      (s) => s.split,
    );
    const byBucket = groupScoresBy(scores, (s) => s.bucket);
    const byTier = groupScoresBy(scores, (s) => s.tier);
    const byTag = aggregateByTag(scores, [...ALL_BENCHMARK_CASES]);
    const system = computeSystemMetrics(systemRows);

    // The labelled run is also the calibration corpus. Writing the table is opt-in so a
    // plain test run never mutates a committed artefact.
    if (process.env.CLASSIFY_BENCH_CALIBRATE === "1") {
      const observations = collectObservations(systemRows);
      const table = writeCalibrationTable(observations, {
        source: `benchmark:${ALL_BENCHMARK_CASES.length} cases`,
        gitSha: SMART_PIPELINE_VERSION,
        generatedAt: new Date().toISOString(),
      });
      console.log(describeTable(table));
    }

    await writeBenchmarkReport({
      system,
      mode: "offline",
      pass: "local",
      plan: "free",
      pipelineVersion: SMART_PIPELINE_VERSION,
      model: "none (rule/local layers only)",
      overall,
      byBucket,
      byTier,
      bySplit,
      byTag,
      cases: scores,
    });
  });
});
