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

describe("shared state", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./env");
  });

  it("keeps a one-time code in production without Redis, where the cache would keep nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { stateGet, stateSet, stateTake } = await loadRedisClient({ NODE_ENV: "production", REDIS_URL: undefined });

    await stateSet("sms-pair:code:ABC123", 300, "owner");
    expect(await stateGet("sms-pair:code:ABC123")).toBe("owner");
    expect(await stateTake("sms-pair:code:ABC123")).toBe("owner");
    // One use.
    expect(await stateTake("sms-pair:code:ABC123")).toBeNull();
  });

  it("forgets a value when its time is up", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"));
    const { stateGet, stateSet } = await loadRedisClient({ NODE_ENV: "production", REDIS_URL: undefined });

    await stateSet("phone-change:local:1:01000000000", 600, "SS-123456");
    vi.setSystemTime(new Date("2026-09-29T10:09:59Z"));
    expect(await stateGet("phone-change:local:1:01000000000")).toBe("SS-123456");
    vi.setSystemTime(new Date("2026-09-29T10:10:01Z"));
    expect(await stateGet("phone-change:local:1:01000000000")).toBeNull();
  });
});

describe("generation bumps", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./env");
    vi.doUnmock("redis");
  });

  it("replays a bump Redis missed as soon as it is reachable again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.resetModules();
    vi.doMock("./env", () => ({
      env: { NODE_ENV: "production", REDIS_URL: "redis://127.0.0.1:6380", AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION: undefined },
    }));
    let reachable = false;
    const incrBy = vi.fn(async () => 1);
    const createClient = vi.fn(() => ({
      isOpen: true,
      isReady: true,
      on: vi.fn(),
      destroy: vi.fn(),
      connect: vi.fn(async () => {
        if (!reachable) throw new Error("ECONNREFUSED");
      }),
      incr: vi.fn(async () => 1),
      incrBy,
    }));
    vi.doMock("redis", () => ({ createClient }));
    const { cacheIncr, getRedisClient, pendingGenerationBumps } = await import("./redis-client");

    // Redis is down: the write's bump cannot land, and is remembered.
    await cacheIncr("cachegen:local:7");
    await cacheIncr("cachegen:local:7");
    expect(pendingGenerationBumps()).toBe(2);

    // Redis is back after the reconnect backoff: the first connection replays both bumps.
    reachable = true;
    vi.setSystemTime(new Date("2026-09-29T10:01:00Z"));
    expect(await getRedisClient()).not.toBeNull();
    await vi.waitFor(() => expect(incrBy).toHaveBeenCalledWith("cachegen:local:7", 2));
    expect(pendingGenerationBumps()).toBe(0);
  });

  it("tells a process-local copy to reload when the generation moves", async () => {
    await loadRedisClient({ NODE_ENV: "development", REDIS_URL: undefined });
    const { watchGeneration } = await import("./shared-generation");
    const settings = watchGeneration("settingsgen:test", 10_000);
    const t0 = Date.now();
    settings.loaded(await settings.current(), t0);

    await settings.bump();
    // Checked at most every ten seconds.
    expect(await settings.moved(t0 + 1_000)).toBe(false);
    expect(await settings.moved(t0 + 10_001)).toBe(true);
  });
});
