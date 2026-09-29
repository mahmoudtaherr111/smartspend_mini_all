type RedisClientModule = typeof import("./redis-client");

const redisUrl = process.env.REDIS_URL;
const runIntegration = process.env.RUN_REDIS_INTEGRATION === "1" && Boolean(redisUrl);
const describeRedisIntegration = runIntegration ? describe : describe.skip;

async function loadRedisClientForIntegration(): Promise<RedisClientModule> {
  vi.resetModules();
  vi.doMock("./env", () => ({
    env: {
      NODE_ENV: "production",
      REDIS_URL: redisUrl,
      AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION: undefined,
    },
  }));
  vi.doUnmock("redis");
  return import("./redis-client");
}

describeRedisIntegration("redis-client real Redis integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./env");
    vi.doUnmock("redis");
  });

  it("uses Redis for production cache hits, invalidation, and runtime status", async () => {
    const { deleteCacheByPattern, getCacheRuntimeStatus, getRedisClient, withCacheStatus } =
      await loadRedisClientForIntegration();
    const client = await getRedisClient();
    if (!client) {
      throw new Error(
        `Redis integration requires a running Redis server at REDIS_URL=${redisUrl}. Start Redis, then rerun npm run test:redis.`,
      );
    }

    const keyPrefix = `smartspend:test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const key = `${keyPrefix}:summary`;
    const compute = vi.fn(async () => ({ total: 123, source: "redis_integration" }));

    try {
      await client!.del(key);

      const miss = await withCacheStatus(key, 30, compute);
      const hit = await withCacheStatus(key, 30, compute);

      expect(miss).toMatchObject({
        key,
        value: { total: 123, source: "redis_integration" },
        hit: false,
        backend: "redis",
      });
      expect(hit).toMatchObject({
        key,
        value: { total: 123, source: "redis_integration" },
        hit: true,
        backend: "redis",
      });
      expect(compute).toHaveBeenCalledTimes(1);
      expect(getCacheRuntimeStatus()).toMatchObject({
        backend: "redis",
        memoryFallbackAllowed: false,
        redisConfigured: true,
        redisConnected: true,
      });

      const deleted = await deleteCacheByPattern(`${keyPrefix}:*`);
      expect(deleted).toBeGreaterThanOrEqual(1);

      const afterInvalidation = await withCacheStatus(key, 30, compute);
      expect(afterInvalidation).toMatchObject({
        hit: false,
        backend: "redis",
      });
      expect(compute).toHaveBeenCalledTimes(2);
    } finally {
      await client!.del(key).catch(() => undefined);
      if ("destroy" in client! && typeof client!.destroy === "function") {
        client!.destroy();
      } else {
        await client!.disconnect().catch(() => undefined);
      }
    }
  });

  it("shares a one-time value between two processes and hands it out once", async () => {
    const closeClient = async (module: RedisClientModule) => {
      const client = await module.getRedisClient();
      if (client && "destroy" in client && typeof client.destroy === "function") client.destroy();
    };
    const key = `smartspend:test:state:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const writer = await loadRedisClientForIntegration();
    await writer.stateSet(key, 30, "owner");
    // A second module instance stands in for another replica: nothing is shared but Redis.
    const reader = await loadRedisClientForIntegration();
    try {
      expect(await reader.stateTake(key)).toBe("owner");
      expect(await writer.stateTake(key)).toBeNull();
    } finally {
      await closeClient(writer);
      await closeClient(reader);
    }
  });
});
