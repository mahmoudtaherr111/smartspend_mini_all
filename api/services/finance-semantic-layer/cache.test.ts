vi.mock("../../lib/env", () => ({
  env: {
    REDIS_URL: undefined,
  },
}));

describe("finance semantic cache tracing", () => {
  it("records hit and miss events without exposing user identifiers", async () => {
    const { collectFinanceCacheTrace, financeCacheKey, withFinanceCache } = await import("./cache");
    const key = financeCacheKey("qa-user", "local", "summary", "today");
    const compute = vi.fn(async () => ({ total: 123 }));

    expect(key).toContain("tax_v2_2026_06");

    const first = await collectFinanceCacheTrace(() => withFinanceCache(key, 60, compute));
    const second = await collectFinanceCacheTrace(() => withFinanceCache(key, 60, compute));

    expect(first.value).toEqual({ total: 123 });
    expect(second.value).toEqual({ total: 123 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(first.cacheHits).toEqual(["finance_cache:miss:memory:summary:today"]);
    expect(second.cacheHits).toEqual(["finance_cache:hit:memory:summary:today"]);
    expect(first.cacheHits.join(" ")).not.toContain("qa-user");
  });
});
