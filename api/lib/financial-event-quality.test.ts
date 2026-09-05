/** Local quality gates on the unchanged 172-case regression corpus. No network/DB. */
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runSmartPipeline, type PipelineResult } from "./smart-pipeline";
import { ALL_BENCHMARK_CASES } from "../qa/fixtures/index";
import { scoreCase, aggregate } from "../qa/classification-scorer";
import { computeSystemMetrics, type SystemMetricInput } from "../qa/classification-system-metrics";
import { mapModelName } from "./model-mapper";

vi.mock("../queries/connection", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, { from: self, where: self, orderBy: self, values: self, set: self,
    limit: async () => [], then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve) });
  return { db: { select: self, insert: self, update: self, query: {} }, pool: {} };
});
vi.mock("./muscle-memory", () => ({ muscleMemoryLookup: async () => null }));
vi.mock("./ai-gateway", () => ({ resolveAdminRoutes: async () => ({ preferred: null, routes: [] }) }));
vi.mock("./llm-router", async (original) => ({ ...await original<object>(),
  executeLlmChain: async () => { throw new Error("offline quality gate: no provider"); } }));

const rows: Array<SystemMetricInput & { result: PipelineResult }> = [];
beforeAll(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const [index, fixture] of ALL_BENCHMARK_CASES.entries()) {
    const result = await runSmartPipeline({ text: fixture.text, userId: 982000 + index,
      userType: "local", userPlan: "free", userDict: [], apiKey: "",
      modelName: mapModelName("flash"), maxTokens: 512,
      userProfileContext: { knownPeople: fixture.knownPeople || [] } });
    rows.push({ case: fixture, result, score: scoreCase(fixture, result, "local"), crashed: false });
  }
}, 60_000);

function metrics() {
  return {
    overall: aggregate(rows.map((row) => row.score)),
    dev: aggregate(rows.filter((row) => row.score.tier === "locked" && row.score.split === "dev").map((row) => row.score)),
    frozen: aggregate(rows.filter((row) => row.score.tier === "locked" && row.score.split === "frozen").map((row) => row.score)),
    system: computeSystemMetrics(rows),
    decisions: rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.result.decision] = (counts[row.result.decision] || 0) + 1;
      return counts;
    }, {}),
  };
}

it("does not regress the recorded audit's overall record F1", () => {
  expect(metrics().overall.tripleF1).toBeGreaterThanOrEqual(0.8730);
});
it("does not regress the recorded audit's dev record F1", () => {
  expect(metrics().dev.tripleF1).toBeGreaterThanOrEqual(0.9634);
});
it("does not regress the recorded audit's frozen record F1", () => {
  expect(metrics().frozen.tripleF1).toBeGreaterThanOrEqual(0.7825);
});
it("reduces unsafe auto saves without routing every clear input to review", () => {
  expect(metrics().system.unsafeAutoSaves).toBeLessThan(6);
  expect(metrics().decisions.auto_save).toBeGreaterThanOrEqual(65);
});
it("keeps the corpus free of taxonomy violations and nonfinancial phantom records", () => {
  expect(rows.reduce((sum, row) => sum + row.score.taxonomyViolations, 0)).toBe(0);
  expect(metrics().system.spuriousOnNonFinancial).toBe(0);
});

afterAll(() => {
  const output = process.env.CLASSIFY_CORE_EVIDENCE_PATH;
  if (output) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), mode: "offline",
      ...metrics(), rows }, null, 2));
  }
  vi.restoreAllMocks();
});
