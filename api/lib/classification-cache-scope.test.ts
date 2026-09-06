/**
 * A2 acceptance for M11 and the billing half of M10.
 *
 * The result cache stored a finished financial answer, together with the token count of
 * the call that produced it, under a key that named neither the model nor the thresholds
 * nor the calibration version — for seven days. Two consequences, both measurable:
 * changing a setting changed nothing for any phrase already cached, and every subsequent
 * hit re-billed tokens for a request that made no call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSmartPipeline, type PipelineInput } from "./smart-pipeline";
import { mapModelName } from "./model-mapper";

const io = vi.hoisted(() => ({ llm: vi.fn(), memory: vi.fn() }));

vi.mock("../queries/connection", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    from: self, where: self, orderBy: self, values: self, set: self,
    limit: async () => [],
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  });
  return { db: { select: self, insert: self, update: self, query: {} }, pool: {} };
});
vi.mock("./muscle-memory", () => ({ muscleMemoryLookup: io.memory }));
vi.mock("./ai-gateway", () => ({
  resolveAdminRoutes: async () => ({ preferred: null, routes: [] }),
}));
vi.mock("./llm-router", async (original) => ({
  ...(await original<object>()),
  executeLlmChain: io.llm,
}));

/** One fixed user, because the cache is scoped per user and we want hits. */
const USER = { userId: 975_100, userType: "local" as const };

function classify(text: string, overrides: Partial<PipelineInput> = {}) {
  return runSmartPipeline({
    text,
    ...USER,
    userPlan: "pro",
    userDict: [],
    apiKey: "synthetic-key",
    modelName: mapModelName("flash"),
    maxTokens: 512,
    ...overrides,
  });
}

beforeEach(() => {
  io.memory.mockReset().mockResolvedValue(null);
  io.llm.mockReset().mockRejectedValue(new Error("no provider in this test"));
});

describe("M11 — the cache key names everything the answer depends on", () => {
  it("does not serve an answer computed under a different auto-save threshold", async () => {
    const text = "دفعت 200 بنزين";
    const strict = await classify(text, {
      pipelineSettings: { parser_auto_save_threshold: "99" },
    });
    const lenient = await classify(text, {
      pipelineSettings: { parser_auto_save_threshold: "50" },
    });

    // The admin saved a new threshold, the dashboard showed it, and every phrase already
    // in the cache went on answering under the old one for the rest of the week.
    expect(strict.decision).not.toBe(lenient.decision);
  });

  it("does not serve an answer computed for a different model", async () => {
    const text = "دفعت 200 بنزين";
    const first = await classify(text, { modelName: mapModelName("flash") });
    const second = await classify(text, { modelName: mapModelName("pro") });

    expect(first.modelUsed).not.toBe(second.modelUsed);
    expect(second.log.routing?.route).not.toBe("classification_cache_hit");
  });

  it("keeps two businesses apart even in business mode", async () => {
    const settings = {
      businessMode: true,
      businessCategories: [
        { id: 1, name: "materials", nameAr: "خامات", type: "expense", keywords: ["خامات"], matchExamples: [] },
      ],
    };
    const shopA = await classify("دفعت 500 خامات", { ...settings, businessId: 7 });
    const shopB = await classify("دفعت 500 خامات", { ...settings, businessId: 9 });

    // The same sentence in two businesses is two different transactions.
    expect(shopA.items[0]?.businessId).toBe(7);
    expect(shopB.items[0]?.businessId).toBe(9);
  });

  it("still hits the cache for a genuinely identical request (positive control)", async () => {
    const text = "دفعت 150 أكل";
    const first = await classify(text);
    const second = await classify(text);

    expect(first.log.routing?.route).not.toBe("classification_cache_hit");
    expect(second.log.routing?.route).toBe("classification_cache_hit");
    expect(second.items.map((x) => x.amount)).toEqual(first.items.map((x) => x.amount));
  });
});

describe("M10 — a cache hit spends nothing", () => {
  it("bills zero new tokens when the answer came from the cache", async () => {
    io.llm.mockResolvedValue({
      text: JSON.stringify({ items: [{ i: 1, category: "shopping", sub: "عام" }] }),
      totalTokens: 120,
      cachedTokens: 0,
      attempts: [{ slug: "test", model: mapModelName("flash"), ok: true, latencyMs: 4 }],
      route: { slug: "test", model: mapModelName("flash") },
      degradedSchema: false,
      attemptTotals: { promptTokens: 100, completionTokens: 20, cachedTokens: 0, totalTokens: 120 },
    });

    const text = "دفعت 250 لحاجة مجهولة جدا";
    const first = await classify(text);
    expect(first.tokensUsed).toBeGreaterThan(0);

    io.llm.mockClear();
    const second = await classify(text);

    expect(second.log.routing?.route).toBe("classification_cache_hit");
    expect(io.llm).not.toHaveBeenCalled();
    // The stored result carried 120 tokens and the caller billed them again on every hit.
    expect(second.tokensUsed).toBe(0);
    // Reported as cached rather than erased, so the saving stays visible.
    expect(second.cachedTokens).toBe(0);
    expect(second.resultCacheSavedTokens).toBe(first.tokensUsed);
    expect(second.actualModelUsed).toBeNull();
    expect(second.log.providerRoute).toBeUndefined();
  });

  it("reports zero for a locally-answered phrase too (positive control)", async () => {
    const text = "دفعت 90 قهوة";
    await classify(text);
    const second = await classify(text);
    expect(second.log.routing?.route).toBe("classification_cache_hit");
    expect(second.tokensUsed).toBe(0);
  });
});
