import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { runSmartPipeline, type PipelineInput } from "./smart-pipeline";
import { resetCircuitBreakers, type LlmRoute } from "./llm-router";

const io = vi.hoisted(() => ({ insert: vi.fn(), routes: [] as LlmRoute[] }));
vi.mock("../queries/connection", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    from: self,
    where: self,
    orderBy: self,
    set: self,
    limit: async () => [],
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve([]).then(resolve),
    values: io.insert.mockResolvedValue([]),
  });
  return {
    db: { select: self, insert: self, update: self, query: {} },
    pool: {},
  };
});
vi.mock("./settings-cache", () => ({
  getSystemSettings: async () => ({ usd_to_egp_rate: "50" }),
}));
vi.mock("./muscle-memory", () => ({ muscleMemoryLookup: async () => null }));
vi.mock("./ai-gateway", () => ({
  resolveAdminRoutes: async () => ({
    preferred: io.routes[0],
    routes: io.routes,
  }),
}));
let userId = 910000;
const route = (slug: string, priority: number, rate = 2): LlmRoute => ({
  slug,
  protocol: "openai",
  model: `test-${slug}`,
  baseUrl: `https://${slug}.example/v1`,
  apiKey: "test-key-never-sent",
  priority,
  prices: {
    inputPricePer1M: rate,
    outputPricePer1M: rate * 4,
    cachedPricePer1M: rate / 10,
  },
});
function classify(overrides: Partial<PipelineInput> = {}) {
  return runSmartPipeline({
    text: "دفعت 250 لحاجة مجهولة جدا",
    userId: ++userId,
    userType: "local",
    userPlan: "pro",
    userDict: [],
    apiKey: "",
    modelName: "flash",
    maxTokens: 512,
    ...overrides,
  });
}
function body(
  items: unknown[] = [{ i: 1, category: "shopping", sub: "عام" }],
  extra: object = {},
) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content: JSON.stringify({ items }) },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 100,
        total_tokens: 1100,
        prompt_cache_hit_tokens: 800,
      },
      ...extra,
    }),
    { status: 200 },
  );
}
beforeEach(() => {
  resetCircuitBreakers();
  io.routes = [route("primary", 0)];
  io.insert.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("classification -> actual provider adapter -> immutable ledger", () => {
  it("records provider counts and configured prices, including cached input", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(body());
    const result = await classify();
    expect(result.tokensUsed).toBe(1100);
    expect(result.cachedTokens).toBe(800);
    const rows = io.insert.mock.calls.at(-1)?.[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      providerSlug: "primary",
      modelId: "test-primary",
      promptTokens: 1000,
      completionTokens: 100,
      cachedTokens: 800,
      costUsd: "0.00136000",
      costEgp: "0.068000",
      userType: "local",
    });
    expect(rows[0].metadata.accounting.cost.rates).toEqual({
      inputPricePer1M: 2,
      outputPricePer1M: 8,
      cachedPricePer1M: 0.2,
    });
    expect(JSON.stringify(rows)).not.toMatch(/لحاجة|test-key-never-sent/);
  });
  it("records both a truncated paid attempt and its successful fallback at their own rates", async () => {
    io.routes.push(route("fallback", 1, 4));
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        body([], {
          choices: [{ finish_reason: "length", message: { content: "{" } }],
        }),
      )
      .mockResolvedValueOnce(body());
    const result = await classify();
    expect(result.tokensUsed).toBe(2200);
    const rows = io.insert.mock.calls.at(-1)?.[0];
    expect(rows.map((r: { costUsd: string }) => r.costUsd)).toEqual([
      "0.00136000",
      "0.00272000",
    ]);
    expect(rows[0].metadata.accounting.status).toBe("failed");
    expect(rows[0].metadata.accounting.operationId).toBe(
      rows[1].metadata.accounting.operationId,
    );
  });
  it("retains usage even when every provider fails, and does not cache the failure", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        body([], {
          choices: [{ finish_reason: "length", message: { content: "{" } }],
        }),
      );
    const id = ++userId;
    const first = await classify({ userId: id });
    const second = await classify({ userId: id });
    expect(first.tokensUsed).toBe(1100);
    expect(second.tokensUsed).toBe(1100);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("records a result-cache hit with zero new tokens and zero cost", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => body());
    const id = ++userId;
    await classify({ userId: id });
    const second = await classify({ userId: id });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({
      tokensUsed: 0,
      cachedTokens: 0,
      resultCacheSavedTokens: 1100,
      actualModelUsed: null,
    });
    expect(io.insert.mock.calls.at(-1)?.[0][0]).toMatchObject({
      modelId: "result_cache",
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      costUsd: "0.00000000",
    });
  });
  it("invalidates result reuse when the actual admin route or user context changes", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => body());
    const id = ++userId;
    await classify({ userId: id });
    io.routes = [route("new-provider", 0)];
    await classify({ userId: id });
    await classify({
      userId: id,
      userProfileContext: {
        knownPeople: [{ name: "أحمد", relationship: "أخ" }],
      },
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("keeps an allowed business subcategory through every real normalization stage", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      body([{ i: 1, category: "work", sub: "مستلزمات خاصة" }]),
    );
    const result = await classify({
      businessMode: true,
      businessId: 7,
      businessCategories: [
        {
          id: 1,
          name: "special",
          nameAr: "مستلزمات خاصة",
          type: "expense",
          keywords: [],
          matchExamples: [],
        },
      ],
    });
    expect(result.items[0]).toMatchObject({
      category: "عمل",
      subCategory: "مستلزمات خاصة",
      businessId: 7,
      amount: 250,
    });
  });
  it("keeps unknown counters visible instead of estimating billable input", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      body(undefined, { usage: undefined }),
    );
    await classify();
    expect(
      io.insert.mock.calls.at(-1)?.[0][0].metadata.accounting,
    ).toMatchObject({
      usage: { promptTokens: null, completionTokens: null, cachedTokens: null },
      cost: { usd: null, source: "unavailable" },
    });
  });
  it("does not advertise the local EGP default as evidence for a dollar expense", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => body());
    await classify({ text: "دفعت 250 دولار لحاجة مجهولة جدا" });
    expect(fetch).toHaveBeenCalled();
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    const payload = JSON.parse(
      request.messages.find((m: { role: string }) => m.role === "user").content,
    );
    expect(payload.clauses[0].currency).toBeNull();
    expect(payload.clauses[0].text).toContain("دولار");
  });
  it("scopes identical numeric ids to the correct user table", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => body());
    const id = ++userId;
    await classify({ userId: id, userType: "local" });
    await classify({ userId: id, userType: "oauth" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(io.insert.mock.calls.at(-2)?.[0][0]).toMatchObject({
      userId: id,
      userType: "local",
    });
    expect(io.insert.mock.calls.at(-1)?.[0][0]).toMatchObject({
      userId: id,
      userType: "oauth",
    });
  });
  it("preserves the result and emits no financial data when the ledger is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => body());
    io.insert.mockRejectedValueOnce(new Error("private DB payload"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await classify();
    expect(result.items.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledWith(
      "[ClassificationUsage] Ledger write failed",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private DB payload");
  });
});
