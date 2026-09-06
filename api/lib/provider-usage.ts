/** Provider-neutral usage. null means not reported, never a fabricated zero. */
export interface ProviderUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  reportedCostUsd: number | null;
  source: "provider" | "partial" | "unreported" | "local";
  issues: string[];
}

export interface TokenPrices {
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedPricePer1M: number;
  cacheWritePricePer1M?: number;
}

export interface UsageCost {
  usd: number | null;
  source: "provider" | "configured_rates" | "unavailable" | "local";
  /** Snapshot used for this estimate; later admin price changes cannot rewrite history. */
  rates?: TokenPrices;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
function count(...values: unknown[]): number | null {
  for (const value of values) {
    const n = number(value);
    if (n !== null && Number.isSafeInteger(n)) return n;
  }
  return null;
}

export function normalizeProviderUsage(
  raw: unknown,
  protocol: "openai" | "gemini" | "anthropic" = "openai",
  headers?: Pick<Headers, "get">,
): ProviderUsage {
  const data = object(raw);
  const u = object(
    protocol === "gemini" ? (data.usageMetadata ?? raw) : (data.usage ?? raw),
  );
  const inputDetails = object(
    u.prompt_tokens_details ?? u.input_tokens_details,
  );
  const outputDetails = object(
    u.completion_tokens_details ?? u.output_tokens_details,
  );
  const headerCount = (key: string) => {
    const value = headers?.get(key);
    return value === null || value === undefined || value.trim() === ""
      ? null
      : count(Number(value));
  };
  let prompt = count(
    u.prompt_tokens,
    u.input_tokens,
    headerCount("fireworks-prompt-tokens"),
  );
  let output = count(u.completion_tokens, u.output_tokens);
  let cache = count(
    inputDetails.cached_tokens,
    u.prompt_cache_hit_tokens,
    u.cache_read_input_tokens,
    headerCount("fireworks-cached-prompt-tokens"),
  );
  let write = count(
    inputDetails.cache_write_tokens,
    u.cache_creation_input_tokens,
  );
  let reasoning = count(outputDetails.reasoning_tokens);
  let total = count(u.total_tokens);
  const issues: string[] = [];
  if (protocol === "gemini") {
    prompt = count(u.promptTokenCount);
    const candidates = count(u.candidatesTokenCount);
    reasoning = count(u.thoughtsTokenCount);
    // Gemini reports thoughts separately; OpenAI-compatible completion counts INCLUDE them.
    output = candidates === null ? null : candidates + (reasoning ?? 0);
    cache = count(u.cachedContentTokenCount);
    write = null;
    total = count(u.totalTokenCount);
  } else if (protocol === "anthropic" && prompt !== null) {
    // Native Anthropic input_tokens excludes cache reads and writes, unlike OpenAI.
    cache = cache ?? 0;
    write = write ?? 0;
    prompt += cache + write;
  }
  if (
    prompt === null &&
    count(u.prompt_cache_miss_tokens) !== null &&
    cache !== null
  ) {
    prompt = count(u.prompt_cache_miss_tokens)! + cache;
  }
  if (cache !== null && prompt !== null && cache > prompt) {
    issues.push("cache_exceeds_input");
    cache = null;
  }
  if (write !== null && prompt !== null && write + (cache ?? 0) > prompt) {
    issues.push("cache_write_exceeds_input");
    write = null;
  }
  if (reasoning !== null && output !== null && reasoning > output) {
    issues.push("reasoning_exceeds_output");
    reasoning = null;
  }
  if (total === null && prompt !== null && output !== null)
    total = prompt + output;
  if (
    total !== null &&
    prompt !== null &&
    output !== null &&
    total !== prompt + output
  ) {
    issues.push("total_mismatch");
  }
  const hasAny = [prompt, output, cache, total].some((v) => v !== null);
  return {
    promptTokens: prompt,
    completionTokens: output,
    cachedTokens: cache,
    cacheWriteTokens: write,
    reasoningTokens: reasoning,
    totalTokens: total,
    // OpenRouter reports the billed cost (including cache pricing) in usage.cost.
    reportedCostUsd: number(u.cost),
    source:
      prompt !== null && output !== null && cache !== null && !issues.length
        ? "provider"
        : hasAny
          ? "partial"
          : "unreported",
    issues,
  };
}

export function priceProviderUsage(
  usage: ProviderUsage,
  rates?: TokenPrices,
): UsageCost {
  if (usage.source === "local") return { usd: 0, source: "local" };
  if (usage.reportedCostUsd !== null)
    return { usd: usage.reportedCostUsd, source: "provider" };
  if (
    !rates ||
    usage.issues.length ||
    usage.promptTokens === null ||
    usage.completionTokens === null
  ) {
    return { usd: null, source: "unavailable" };
  }
  const prices = [
    rates.inputPricePer1M,
    rates.outputPricePer1M,
    rates.cachedPricePer1M,
  ];
  if (prices.some((p) => number(p) === null))
    return { usd: null, source: "unavailable" };
  // Without cache counters we cannot silently assume a full-price input bill.
  if (
    usage.cachedTokens === null &&
    rates.inputPricePer1M !== rates.cachedPricePer1M
  ) {
    return { usd: null, source: "unavailable" };
  }
  const cached = usage.cachedTokens ?? 0;
  const written = usage.cacheWriteTokens ?? 0;
  if (written > 0 && number(rates.cacheWritePricePer1M) === null) {
    return { usd: null, source: "unavailable" };
  }
  return {
    usd:
      ((usage.promptTokens - cached - written) * rates.inputPricePer1M +
        cached * rates.cachedPricePer1M +
        written * (rates.cacheWritePricePer1M ?? 0) +
        usage.completionTokens * rates.outputPricePer1M) /
      1_000_000,
    source: "configured_rates",
    rates: { ...rates },
  };
}

export function localUsage(): ProviderUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    reportedCostUsd: 0,
    source: "local",
    issues: [],
  };
}
