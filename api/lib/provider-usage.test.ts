import { describe, it, expect } from "vitest";
import {
  normalizeProviderUsage as normalize,
  priceProviderUsage as price,
  localUsage,
} from "./provider-usage";

describe("normalized provider usage and pricing", () => {
  const prices = {
    inputPricePer1M: 2,
    outputPricePer1M: 8,
    cachedPricePer1M: 0.2,
  };
  it.each([
    [
      "OpenAI/Groq/OpenRouter",
      {
        prompt_tokens: 1000,
        completion_tokens: 100,
        prompt_tokens_details: { cached_tokens: 800 },
      },
    ],
    [
      "DeepSeek direct",
      {
        prompt_tokens: 1000,
        completion_tokens: 100,
        prompt_cache_hit_tokens: 800,
        prompt_cache_miss_tokens: 200,
      },
    ],
    [
      "custom compatible",
      {
        input_tokens: 1000,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 800 },
      },
    ],
  ])("uses %s counters without adding cache twice", (_, usage) => {
    const result = normalize({ usage });
    expect(result).toMatchObject({
      promptTokens: 1000,
      completionTokens: 100,
      cachedTokens: 800,
      totalTokens: 1100,
      source: "provider",
    });
    expect(price(result, prices).usd).toBeCloseTo(0.00136, 10);
  });
  it("reads Fireworks headers as fallback; body counters have precedence", () => {
    const headers = new Headers({
      "fireworks-prompt-tokens": "1000",
      "fireworks-cached-prompt-tokens": "800",
    });
    expect(
      normalize({ usage: { completion_tokens: 100 } }, "openai", headers)
        .cachedTokens,
    ).toBe(800);
    expect(
      normalize(
        {
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 100,
            prompt_tokens_details: { cached_tokens: 0 },
          },
        },
        "openai",
        headers,
      ).cachedTokens,
    ).toBe(0);
  });
  it("adds Gemini thinking once to output and preserves cached input", () => {
    const result = normalize(
      {
        promptTokenCount: 1000,
        candidatesTokenCount: 100,
        thoughtsTokenCount: 50,
        cachedContentTokenCount: 800,
        totalTokenCount: 1150,
      },
      "gemini",
    );
    expect(result).toMatchObject({
      completionTokens: 150,
      reasoningTokens: 50,
      totalTokens: 1150,
      cachedTokens: 800,
    });
    expect(price(result, prices).usd).toBeCloseTo(0.00176, 10);
  });
  it("does not count compatible reasoning again", () => {
    expect(
      normalize({
        usage: {
          prompt_tokens: 10,
          completion_tokens: 100,
          completion_tokens_details: { reasoning_tokens: 60 },
        },
      }),
    ).toMatchObject({
      completionTokens: 100,
      reasoningTokens: 60,
      totalTokens: 110,
    });
  });
  it("normalizes native Anthropic semantics without applying them to OpenRouter", () => {
    const result = normalize(
      {
        usage: {
          input_tokens: 200,
          output_tokens: 100,
          cache_read_input_tokens: 800,
          cache_creation_input_tokens: 50,
        },
      },
      "anthropic",
    );
    expect(result).toMatchObject({
      promptTokens: 1050,
      cachedTokens: 800,
      cacheWriteTokens: 50,
      totalTokens: 1150,
    });
    expect(price(result, prices).usd).toBeNull(); // cache writes have their own rate
    expect(
      price(result, { ...prices, cacheWritePricePer1M: 2.5 }).usd,
    ).toBeCloseTo(0.001485, 10);
  });
  it("uses OpenRouter reported cost including writes and provider pricing", () => {
    const result = normalize({
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 100,
        cost: 0.00071,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 1000 },
      },
    });
    expect(price(result, prices)).toEqual({ usd: 0.00071, source: "provider" });
    expect(price(normalize({ usage: { cost: 0 } }))).toEqual({
      usd: 0,
      source: "provider",
    });
  });
  it("never invents cache hits, free usage, or a vendor-independent price", () => {
    expect(normalize({})).toMatchObject({
      promptTokens: null,
      cachedTokens: null,
      totalTokens: null,
      source: "unreported",
    });
    const missingCache = normalize({
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    expect(missingCache.cachedTokens).toBeNull();
    expect(price(missingCache, prices).usd).toBeNull();
    expect(
      price(
        normalize({
          usage: {
            prompt_tokens: 10,
            completion_tokens: 2,
            prompt_cache_hit_tokens: 0,
          },
        }),
      ).usd,
    ).toBeNull();
    expect(price(localUsage())).toEqual({ usd: 0, source: "local" });
  });
  it.each([-1, NaN, Infinity, 1.5, "100", null])(
    "rejects invalid counts: %s",
    (value) => {
      expect(
        normalize({ usage: { prompt_tokens: value, completion_tokens: 0 } })
          .promptTokens,
      ).toBeNull();
    },
  );
  it("reports inconsistent provider counts instead of hiding them in a calculated bill", () => {
    const result = normalize({
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 20,
        prompt_cache_hit_tokens: 50,
      },
    });
    expect(result.issues).toEqual(["cache_exceeds_input", "total_mismatch"]);
    expect(price(result, prices).usd).toBeNull();
  });
});
