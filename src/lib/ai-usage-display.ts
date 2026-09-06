function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** Old numeric defaults do not establish that a provider actually reported a count. */
export function readUsageDisplay(row: { metadata?: unknown }) {
  const accounting = record(record(row.metadata).accounting);
  const usage = record(accounting.usage);
  const cost = record(accounting.cost);
  const usd = numeric(cost.usd);
  const fx = numeric(accounting.exchangeRate);
  return {
    input: numeric(usage.promptTokens),
    output: numeric(usage.completionTokens),
    total: numeric(usage.totalTokens),
    reasoning: numeric(usage.reasoningTokens),
    saved: numeric(accounting.resultCacheSavedTokens),
    cache: numeric(usage.cachedTokens),
    writes: numeric(usage.cacheWriteTokens),
    usd,
    egp: usd === 0 ? 0 : usd !== null && fx !== null ? usd * fx : null,
    costLabel:
      cost.source === "provider"
        ? "من المزوّد"
        : cost.source === "configured_rates"
          ? "تقدير بأسعار الأدمن"
          : cost.source === "local"
            ? "محلي"
            : "غير متاح",
    cacheLabel:
      accounting.cacheKind === "result_cache"
        ? "نتيجة محلية"
        : accounting.cacheKind === "local_rules"
          ? "قواعد محلية"
          : "كاش المزوّد",
    operationId:
      typeof accounting.operationId === "string"
        ? accounting.operationId
        : null,
    status:
      accounting.status === "failed"
        ? "فشلت"
        : accounting.status === "success"
          ? "نجحت"
          : "محلي / غير موثق",
  };
}

export const formatUsageCount = (n: number | null) =>
  n === null ? "غير متاح" : n.toLocaleString();
export const formatUsageUsd = (n: number | null) =>
  n === null ? "غير متاح" : `$${n.toFixed(8)}`;
