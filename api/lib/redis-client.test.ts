type RedisClientModule = typeof import("./redis-client");

async function loadRedisClient(
  envOverrides: Record<string, string | undefined>,
): Promise<RedisClientModule> {
  vi.resetModules();
  vi.doMock("./env", () => ({
    env: {
      NODE_ENV: "development",
      REDIS_URL: undefined,
      AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION: undefined,
      ...envOverrides,
    },
  }));
  return import("./redis-client");
}

describe("redis-client cache runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./env");
    vi.doUnmock("redis");
  });

  it("caches values in memory during development when Redis is not configured and invalidates by pattern", async () => {
    const { deleteCacheByPattern, getCacheRuntimeStatus, withCache, withCacheStatus } = await loadRedisClient({
      NODE_ENV: "development",
      REDIS_URL: undefined,
    });
    const compute = vi.fn(async () => ({ total: 42 }));

    const first = await withCache("test_cache:user:1:summary", 60, compute);
    const second = await withCache("test_cache:user:1:summary", 60, compute);

    expect(first).toEqual({ total: 42 });
    expect(second).toEqual({ total: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(getCacheRuntimeStatus()).toMatchObject({
      backend: "memory",
      memoryFallbackAllowed: true,
      redisConfigured: false,
      redisConnected: false,
      memoryEntries: 1,
    });

    const deleted = await deleteCacheByPattern("test_cache:user:1:*");
    expect(deleted).toBe(1);

    await withCache("test_cache:user:1:summary", 60, compute);
    expect(compute).toHaveBeenCalledTimes(2);

    const statusCompute = vi.fn(async () => ({ total: 99 }));
    const miss = await withCacheStatus("test_cache:user:1:status", 60, statusCompute);
    const hit = await withCacheStatus("test_cache:user:1:status", 60, statusCompute);

    expect(miss).toMatchObject({
      key: "test_cache:user:1:status",
      value: { total: 99 },
      hit: false,
      backend: "memory",
    });
    expect(hit).toMatchObject({
      key: "test_cache:user:1:status",
      value: { total: 99 },
      hit: true,
      backend: "memory",
    });
    expect(statusCompute).toHaveBeenCalledTimes(1);
  });

  it("does not silently use RAM cache in production when Redis is missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { getCacheRuntimeStatus, withCacheStatus } = await loadRedisClient({
      NODE_ENV: "production",
      REDIS_URL: undefined,
    });
    const compute = vi.fn(async () => ({ total: 42 }));

    const first = await withCacheStatus("test_cache:prod:summary", 60, compute);
    const second = await withCacheStatus("test_cache:prod:summary", 60, compute);

    expect(first).toMatchObject({
      value: { total: 42 },
      hit: false,
      backend: "disabled",
    });
    expect(second).toMatchObject({
      value: { total: 42 },
      hit: false,
      backend: "disabled",
    });
    expect(compute).toHaveBeenCalledTimes(2);
    expect(getCacheRuntimeStatus()).toMatchObject({
      backend: "disabled",
      memoryFallbackAllowed: false,
      redisConfigured: false,
      redisConnected: false,
      memoryEntries: 0,
    });
  });

  it("can explicitly allow RAM cache in production for controlled emergency runs", async () => {
    const { getCacheRuntimeStatus, withCacheStatus } = await loadRedisClient({
      NODE_ENV: "production",
      REDIS_URL: undefined,
      AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION: "true",
    });
    const compute = vi.fn(async () => ({ total: 7 }));

    const miss = await withCacheStatus("test_cache:prod_allowed:summary", 60, compute);
    const hit = await withCacheStatus("test_cache:prod_allowed:summary", 60, compute);

    expect(miss).toMatchObject({ value: { total: 7 }, hit: false, backend: "memory" });
    expect(hit).toMatchObject({ value: { total: 7 }, hit: true, backend: "memory" });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(getCacheRuntimeStatus()).toMatchObject({
      backend: "memory",
      memoryFallbackAllowed: true,
      redisConfigured: false,
      redisConnected: false,
      memoryEntries: 1,
    });
  });

  it("falls back instead of hanging when configured Redis refuses connection", async () => {
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("./env", () => ({
      env: {
        NODE_ENV: "development",
        REDIS_URL: "redis://127.0.0.1:6380",
        AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION: undefined,
      },
    }));

    const connect = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const destroy = vi.fn();
    const on = vi.fn();
    const createClient = vi.fn(() => ({ connect, destroy, on }));
    vi.doMock("redis", () => ({ createClient }));

    const { getCacheRuntimeStatus, getRedisClient, withCacheStatus } = await import("./redis-client");
    await expect(getRedisClient()).resolves.toBeNull();
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "redis://127.0.0.1:6380",
        socket: expect.objectContaining({
          connectTimeout: expect.any(Number),
          reconnectStrategy: false,
        }),
      }),
    );
    expect(connect).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);

    const compute = vi.fn(async () => ({ total: 11 }));
    const miss = await withCacheStatus("test_cache:redis_down:summary", 60, compute);

    expect(miss).toMatchObject({
      value: { total: 11 },
      hit: false,
      backend: "memory",
    });
    expect(getCacheRuntimeStatus()).toMatchObject({
      backend: "memory",
      redisConfigured: true,
      redisConnected: false,
    });
  });
});
