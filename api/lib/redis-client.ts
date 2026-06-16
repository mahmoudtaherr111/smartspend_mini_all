import { createClient, type RedisClientType } from "redis";
import { env } from "./env";

let redisClient: RedisClientType | null = null;
let isConnecting = false;
let warnedMissingRedis = false;
let warnedDisabledProductionFallback = false;

const MEMORY_CACHE_MAX_ENTRIES = 2_000;
const REDIS_CONNECT_TIMEOUT_MS = 2_000;
type CacheBackend = "redis" | "memory" | "disabled";

type MemoryCacheEntry = {
  value: string;
  expiresAt: number;
  lastAccessedAt: number;
};

const memoryCache = new Map<string, MemoryCacheEntry>();

function nowMs(): number {
  return Date.now();
}

function purgeExpiredMemoryCache(now = nowMs()): void {
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) memoryCache.delete(key);
  }
}

function enforceMemoryCacheLimit(): void {
  if (memoryCache.size <= MEMORY_CACHE_MAX_ENTRIES) return;

  const overflow = memoryCache.size - MEMORY_CACHE_MAX_ENTRIES;
  const victims = [...memoryCache.entries()]
    .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
    .slice(0, overflow);

  for (const [key] of victims) {
    memoryCache.delete(key);
  }
}

function memoryGet(key: string): string | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  const now = nowMs();
  if (entry.expiresAt <= now) {
    memoryCache.delete(key);
    return null;
  }
  entry.lastAccessedAt = now;
  return entry.value;
}

function memorySet(key: string, ttlSeconds: number, value: string): void {
  if (ttlSeconds <= 0) return;
  purgeExpiredMemoryCache();
  memoryCache.set(key, {
    value,
    expiresAt: nowMs() + ttlSeconds * 1000,
    lastAccessedAt: nowMs(),
  });
  enforceMemoryCacheLimit();
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function deleteMemoryByPattern(pattern: string): number {
  purgeExpiredMemoryCache();
  const re = patternToRegExp(pattern);
  let count = 0;
  for (const key of memoryCache.keys()) {
    if (re.test(key)) {
      memoryCache.delete(key);
      count += 1;
    }
  }
  return count;
}

function memoryFallbackAllowed(): boolean {
  return env.NODE_ENV !== "production" || env.AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION === "true";
}

function warnDisabledProductionFallback(): void {
  if (warnedDisabledProductionFallback) return;
  console.warn(
    "REDIS_URL is unavailable in production. In-process RAM cache fallback is disabled; cacheable work will recompute until Redis is configured.",
  );
  warnedDisabledProductionFallback = true;
}

function timeoutAfter<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timeout.unref?.();
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function closeFailedRedisClient(client: RedisClientType): Promise<void> {
  try {
    if ("destroy" in client && typeof client.destroy === "function") {
      client.destroy();
      return;
    }
    await client.disconnect();
  } catch {
    // Best-effort cleanup only.
  }
}

/**
 * Initializes and returns the Redis client singleton.
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (redisClient) return redisClient;
  if (!env.REDIS_URL) {
    if (!memoryFallbackAllowed()) {
      warnDisabledProductionFallback();
      return null;
    }
    if (!warnedMissingRedis) {
      console.warn("⚠️ REDIS_URL not provided. Using in-process RAM cache fallback.");
      warnedMissingRedis = true;
    }
    return null;
  }
  if (isConnecting) {
    // Wait slightly if another call is currently connecting
    await new Promise((resolve) => setTimeout(resolve, 500));
    return redisClient;
  }

  isConnecting = true;
  let client: RedisClientType | null = null;
  try {
    client = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: false,
      },
    }) as RedisClientType;

    client.on("error", (err) => {
      console.error("❌ Redis Client Error", err);
    });

    client.on("connect", () => {
      console.log("✅ Redis Connected");
    });

    const connectPromise = client.connect();
    connectPromise.catch(() => undefined);
    await timeoutAfter(connectPromise, REDIS_CONNECT_TIMEOUT_MS + 500, "Redis connect");
    redisClient = client;
    return redisClient;
  } catch (error) {
    console.error("❌ Failed to connect to Redis", error);
    if (client) {
      await closeFailedRedisClient(client);
    }
    return null;
  } finally {
    isConnecting = false;
  }
}

export function getCacheRuntimeStatus(): {
  backend: CacheBackend;
  memoryEntries: number;
  memoryFallbackAllowed: boolean;
  redisConfigured: boolean;
  redisConnected: boolean;
} {
  purgeExpiredMemoryCache();
  const fallbackAllowed = memoryFallbackAllowed();
  return {
    backend: redisClient ? "redis" : fallbackAllowed ? "memory" : "disabled",
    memoryEntries: memoryCache.size,
    memoryFallbackAllowed: fallbackAllowed,
    redisConfigured: Boolean(env.REDIS_URL),
    redisConnected: Boolean(redisClient),
  };
}

export interface CacheStatusResult<T> {
  key: string;
  value: T;
  hit: boolean;
  backend: CacheBackend;
}

export async function deleteCacheByPattern(pattern: string): Promise<number> {
  const memoryDeleted = deleteMemoryByPattern(pattern);
  const client = await getRedisClient();
  if (!client) return memoryDeleted;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
    return memoryDeleted + keys.length;
  } catch (err) {
    console.warn(`Redis delete pattern error for ${pattern}:`, err);
    return memoryDeleted;
  }
}

/**
 * Wrapper for getting cached value or computing it with hit/miss metadata.
 */
export async function withCacheStatus<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<CacheStatusResult<T>> {
  const client = await getRedisClient();
  if (!client) {
    if (!memoryFallbackAllowed()) {
      warnDisabledProductionFallback();
      return {
        key,
        value: await compute(),
        hit: false,
        backend: "disabled",
      };
    }

    const cached = memoryGet(key);
    if (cached) {
      return {
        key,
        value: JSON.parse(cached) as T,
        hit: true,
        backend: "memory",
      };
    }

    const result = await compute();
    if (result !== undefined && result !== null) {
      memorySet(key, ttlSeconds, JSON.stringify(result));
    }
    return {
      key,
      value: result,
      hit: false,
      backend: "memory",
    };
  }

  try {
    const cached = await client.get(key);
    if (cached) {
      return {
        key,
        value: JSON.parse(cached) as T,
        hit: true,
        backend: "redis",
      };
    }
  } catch (err) {
    console.warn(`Redis get error for key ${key}:`, err);
  }

  const result = await compute();

  try {
    if (result !== undefined && result !== null) {
      await client.setEx(key, ttlSeconds, JSON.stringify(result));
    }
  } catch (err) {
    console.warn(`Redis set error for key ${key}:`, err);
  }

  return {
    key,
    value: result,
    hit: false,
    backend: "redis",
  };
}

/**
 * Wrapper for getting cached value or computing it
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  return (await withCacheStatus(key, ttlSeconds, compute)).value;
}
