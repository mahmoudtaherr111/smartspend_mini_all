vi.mock("../../lib/env", () => ({
  env: {
    REDIS_URL: undefined,
  },
}));

describe("financeCacheKey", () => {
  it("gives different Arabic names different keys, and the same name the same key", async () => {
    const { financeCacheKey } = await import("./cache");
    // Six letters each: both folded to "______" before, so one category answered for the other.
    const bills = financeCacheKey(7, "local", "category_total", "p", "فواتير");
    const subscriptions = financeCacheKey(7, "local", "category_total", "p", "اشتراك");
    expect(bills).not.toBe(subscriptions);
    expect(financeCacheKey(7, "local", "category_total", "p", "فواتير")).toBe(bills);
    // Readable ASCII parts stay as written, and a user's key never carries another user's id.
    expect(financeCacheKey(7, "local", "summary", "today:2026-09-29")).toMatch(/:7:local:summary:today:2026-09-29$/);
    expect(financeCacheKey(7, "oauth", "summary", "x")).not.toBe(financeCacheKey(7, "local", "summary", "x"));
  });
});

describe("finance semantic cache tracing", () => {
  it("records hit and miss events without exposing user identifiers", async () => {
    const { collectFinanceCacheTrace, financeCacheKey, withFinanceCache } = await import("./cache");
    const key = financeCacheKey("qa-user", "local", "summary", "today");
    const compute = vi.fn(async () => ({ total: 123 }));

    expect(key).toContain("tax_v3_2026_09");

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
