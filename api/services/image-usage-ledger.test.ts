import { expect, it, vi } from "vitest";
import { recordImageProviderUsage } from "./image-usage-ledger";
import { localUsage, normalizeProviderUsage } from "../lib/provider-usage";
const writer = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));
it("records result replay as a local zero-cost operation, not provider cached tokens", async () => {
  await recordImageProviderUsage({
    userId: 1,
    userType: "local",
    model: "result_cache",
    usage: localUsage(),
    finishReason: "local",
    latencyMs: 0,
    cacheHit: true,
  });
  expect(writer.rows[0]).toMatchObject({
    providerSlug: "local",
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    totalTokens: 0,
    metadata: {
      accounting: {
        cacheKind: "result_cache",
        status: "local",
        cost: { usd: 0, source: "local" },
      },
    },
  });
});
vi.mock("./classification-usage-ledger", () => ({
  persistUsageRows: async (
    factory: () => Promise<Array<Record<string, unknown>>>,
  ) => {
    writer.rows = await factory();
  },
}));
it("records image input, output and cache counts using the admin contract without financial payloads", async () => {
  const usage = normalizeProviderUsage(
    {
      promptTokenCount: 1000,
      candidatesTokenCount: 80,
      cachedContentTokenCount: 700,
      totalTokenCount: 1080,
    },
    "gemini",
  );
  await recordImageProviderUsage({
    userId: 1,
    userType: "oauth",
    model: "mapped-model",
    usage,
    finishReason: "MAX_TOKENS",
    latencyMs: 60,
  });
  expect(writer.rows[0]).toMatchObject({
    channel: "image",
    userType: "oauth",
    promptTokens: 1000,
    completionTokens: 80,
    cachedTokens: 700,
    totalTokens: 1080,
    finishReason: "MAX_TOKENS",
    metadata: {
      accounting: { status: "failed", cost: { usd: null, source: "unavailable" }, usage },
    },
  });
  expect(writer.rows[0]).not.toHaveProperty("sourceText");
});
