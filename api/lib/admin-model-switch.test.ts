/**
 * Choosing a model in the admin dashboard must choose the model that answers.
 *
 * It did not. `ai_providers` and `ai_models` were written by the admin UI, their keys
 * encrypted, their route cache refreshed on every save — and read by nothing:
 * `executeAiGateway` had no caller outside its own file, and classification resolved its
 * provider from environment keys alone. Adding OpenRouter or switching to a cheaper model
 * from the dashboard changed rows in a table and nothing about the request that followed.
 *
 * These tests pin the two halves of the fix: the admin's default for a purpose and tier
 * leads the chain, and a later save is visible immediately rather than serving the old
 * model until a cache expires.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rows: { providers: unknown[]; models: unknown[] } = { providers: [], models: [] };

vi.mock("../queries/connection", () => {
  const makeChain = (result: () => unknown[]) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const method of ["from", "where", "orderBy", "innerJoin", "leftJoin", "groupBy", "limit"]) {
      chain[method] = self;
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    chain.catch = () => Promise.resolve(result());
    return chain;
  };
  const db = {
    select: () => ({
      from: (table: unknown) => {
        // The gateway reads providers first, then the models belonging to them. The
        // table object identity is how we tell the two queries apart.
        const name = String((table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] || "");
        return makeChain(() => (name === "ai_providers" ? rows.providers : rows.models));
      },
    }),
    insert: () => makeChain(() => []),
    update: () => makeChain(() => []),
    delete: () => makeChain(() => []),
    query: new Proxy({}, { get: () => ({ findMany: async () => [], findFirst: async () => undefined }) }),
  };
  return { db, getDb: () => db, pool: { query: async () => [[], []], end: async () => {} } };
});

vi.mock("./settings-cache", () => ({
  getSystemSettings: async () => ({}),
  invalidateSettingsCache: () => {},
}));

import { encryptApiKey, refreshGatewayCache, resolveAdminRoutes } from "./ai-gateway";
import { buildProviderChain } from "./llm-provider-chain";

function provider(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "openrouter",
    displayName: "OpenRouter",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEncrypted: encryptApiKey("sk-admin-key"),
    isActive: true,
    priority: 1,
    ...overrides,
  };
}

function model(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    providerId: 1,
    modelId: "deepseek/deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    purposes: ["classification"],
    allowedTiers: ["free", "pro", "ultra"],
    isDefaultForPurpose: true,
    isActive: true,
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    cachedPricePer1M: 0,
    supportsVision: false,
    supportsReasoning: false,
    ...overrides,
  };
}

beforeEach(async () => {
  rows.providers = [];
  rows.models = [];
  await refreshGatewayCache();
});

describe("the dashboard decides which model answers", () => {
  it("puts the admin's default for the purpose at the head of the chain", async () => {
    rows.providers = [provider()];
    rows.models = [model()];
    await refreshGatewayCache();

    const resolved = await resolveAdminRoutes("classification", "free");
    expect(resolved.preferred).toMatchObject({
      slug: "openrouter",
      model: "deepseek/deepseek-v4-flash",
      apiKey: "sk-admin-key",
    });

    const chain = buildProviderChain({
      preferred: resolved.preferred!.slug,
      preferredModel: resolved.preferred!.model,
      plan: "free",
      keys: { gemini: "env-gemini-key" },
      dbRoutes: resolved.routes.map((r) => ({
        slug: r.slug,
        protocol: r.protocol === "gemini" ? ("gemini" as const) : ("openai" as const),
        baseUrl: r.baseUrl,
        apiKey: r.apiKey,
        model: r.model,
        priority: r.priority,
        providerId: r.providerId,
      })),
    });
    expect(chain[0]).toMatchObject({ slug: "openrouter", model: "deepseek/deepseek-v4-flash" });
    // The built-in key stays in the queue: failover must survive a bad admin row.
    expect(chain.some((route) => route.slug === "gemini")).toBe(true);
  });

  it("serves the new model as soon as the admin saves, not when a cache expires", async () => {
    rows.providers = [provider()];
    rows.models = [model()];
    await refreshGatewayCache();
    expect((await resolveAdminRoutes("classification", "free")).preferred?.model).toBe(
      "deepseek/deepseek-v4-flash",
    );

    // What an admin write does: change the row, then refresh — exactly the call
    // `admin-router` already makes after every provider and model mutation.
    rows.models = [model({ modelId: "qwen/qwen3-max", displayName: "Qwen 3 Max" })];
    await refreshGatewayCache();

    expect((await resolveAdminRoutes("classification", "free")).preferred?.model).toBe(
      "qwen/qwen3-max",
    );
  });

  it("keeps a model scoped to another purpose out of the classification chain", async () => {
    rows.providers = [provider()];
    rows.models = [
      model(),
      model({ id: 11, modelId: "some/ocr-only", purposes: ["ocr"], isDefaultForPurpose: false }),
    ];
    await refreshGatewayCache();

    const resolved = await resolveAdminRoutes("classification", "free");
    expect(resolved.routes.map((r) => r.model)).not.toContain("some/ocr-only");
  });

  it("falls back to the built-in providers when the admin has configured nothing", async () => {
    const resolved = await resolveAdminRoutes("classification", "free");
    expect(resolved.preferred).toBeNull();
    expect(resolved.routes).toEqual([]);

    const chain = buildProviderChain({
      preferred: "gemini",
      preferredModel: "gemini-3.1-flash-lite",
      plan: "free",
      keys: { gemini: "env-gemini-key" },
      dbRoutes: [],
    });
    expect(chain[0]).toMatchObject({ slug: "gemini" });
  });

  it("skips an admin provider whose key failed to decrypt rather than calling it blind", async () => {
    rows.providers = [provider({ apiKeyEncrypted: "not:valid:ciphertext" })];
    rows.models = [model({ isDefaultForPurpose: false })];
    await refreshGatewayCache();

    const resolved = await resolveAdminRoutes("classification", "free");
    expect(resolved.routes).toEqual([]);
  });
});
