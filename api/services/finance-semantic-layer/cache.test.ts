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

  it("invalidates cache when bumpFinanceCacheGen is called", async () => {
    const { financeCacheKey, withFinanceCache, bumpFinanceCacheGen } = await import("./cache");
    const key = financeCacheKey("qa-user-2", "local", "summary", "month");
    const compute = vi.fn(async () => ({ total: 500 }));

    // 1. Initial call (cache miss)
    const first = await withFinanceCache(key, 60, compute);
    expect(first).toEqual({ total: 500 });
    expect(compute).toHaveBeenCalledTimes(1);

    // 2. Second call without invalidation (cache hit)
    const second = await withFinanceCache(key, 60, compute);
    expect(second).toEqual({ total: 500 });
    expect(compute).toHaveBeenCalledTimes(1);

    // 3. Invalidate cache via generation bump
    await bumpFinanceCacheGen("qa-user-2", "local");

    // 4. Third call after bump (cache miss, compute invoked again)
    compute.mockResolvedValueOnce({ total: 750 });
    const third = await withFinanceCache(key, 60, compute);
    expect(third).toEqual({ total: 750 });
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
