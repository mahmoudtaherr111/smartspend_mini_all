import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminRows, inserted } = vi.hoisted(() => ({
  adminRows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("../queries/connection", () => ({
  db: {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => adminRows }) }) }),
    insert: () => ({ values: async (row: Record<string, unknown>) => { inserted.push(row); } }),
  },
}));
vi.mock("./settings-cache", () => ({ getSystemSettings: async () => ({ usd_to_egp_rate: "50" }) }));

import { aiCallCost, costAtRates, invalidateAiPricing, ratesFor } from "./ai-pricing";
import { providerSlugForBaseUrl, recordAiLedger } from "./ai-ledger";

beforeEach(() => {
  adminRows.length = 0;
  inserted.length = 0;
  invalidateAiPricing();
});

describe("ai pricing", () => {
  it("prices a call at the provider's published rates, thinking billed as output and cached input at its own rate", async () => {
    const cost = await aiCallCost("gemini", "gemini-3.5-flash-lite", {
      promptTokens: 1_000_000, completionTokens: 200_000, reasoningTokens: 100_000, cachedTokens: 500_000,
    });
    // 500k fresh input at 0.30, 500k cached at 0.02, 300k output at 2.50.
    expect(cost.usd).toBeCloseTo(0.15 + 0.01 + 0.75, 6);
    expect(cost).toMatchObject({ priced: true, rateSource: "published" });
    expect(cost.egp).toBeCloseTo(cost.usd * 50, 5);
  });

  it("takes the admin's price for a model over the published one, for any provider the admin adds", async () => {
    adminRows.push({ slug: "openrouter", modelId: "deepseek/deepseek-v4", input: "0.27", output: "1.10", cached: "0.07" });
    expect(await ratesFor("openrouter", "deepseek/deepseek-v4")).toMatchObject({ input: 0.27, output: 1.1, source: "admin" });
    const cost = await aiCallCost("openrouter", "deepseek/deepseek-v4", { promptTokens: 1_000_000, completionTokens: 1_000_000 });
    expect(cost.usd).toBeCloseTo(1.37, 6);
  });

  it("records a call to an unknown model as unpriced instead of guessing", async () => {
    expect(await aiCallCost("fireworks", "accounts/fireworks/models/unknown", { promptTokens: 10, completionTokens: 10 }))
      .toEqual({ usd: 0, egp: 0, priced: false, rateSource: null });
  });

  it("reads an old model name through the mapper", async () => {
    expect((await ratesFor(null, "gemini-3.1-pro"))?.input).toBe(0.75);
  });

  it("bills cached input at no more than the whole prompt", () => {
    expect(costAtRates({ input: 1, output: 0, cached: 0.1, source: "published" }, { promptTokens: 100, completionTokens: 0, cachedTokens: 500 }))
      .toBeCloseTo(0.00001, 8);
  });
});

describe("ai ledger", () => {
  it("writes one row with the price, the Cairo billing month and whether it was priced", async () => {
    await recordAiLedger({
      userId: 7, userType: "local", channel: "chat", providerSlug: "gemini", modelId: "gemini-3.1-flash-lite",
      promptTokens: 1_000, completionTokens: 500, at: new Date("2026-09-30T22:30:00Z"),
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ billingPeriod: "2026-10", channel: "chat", totalTokens: 1_500, metadata: { priced: true, rateSource: "published" } });
  });

  it("keeps a cost the caller priced itself, such as a live call's audio", async () => {
    await recordAiLedger({ userId: 7, userType: "local", channel: "voice_call", providerSlug: "gemini", modelId: "gemini-3.8-live", promptTokens: 1, completionTokens: 1, costUsd: 0.06 });
    expect(inserted[0]).toMatchObject({ metadata: { priced: true, rateSource: "caller" } });
  });

  it("names the provider behind a base URL", () => {
    expect(providerSlugForBaseUrl("https://api.fireworks.ai/inference/v1")).toBe("fireworks");
    expect(providerSlugForBaseUrl("https://openrouter.ai/api/v1")).toBe("openrouter");
    expect(providerSlugForBaseUrl("https://generativelanguage.googleapis.com/v1beta/openai")).toBe("gemini");
  });
});
