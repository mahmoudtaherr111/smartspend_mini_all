import { createClient, type RedisClientType } from "redis";
import { env } from "./env";
import { createLogger } from "./log";

const log = createLogger("redis");

let redisClient: RedisClientType | null = null;
let isConnecting = false;
let warnedMissingRedis = false;
let warnedDisabledProductionFallback = false;
let redisConnectFailureCount = 0;
let nextRedisConnectAttemptAt = 0;

const MEMORY_CACHE_MAX_ENTRIES = 5_000;
const REDIS_CONNECT_TIMEOUT_MS = 2_000;
const REDIS_RETRY_MAX_DELAY_MS = 30_000;
export type CacheBackend = "redis" | "memory" | "disabled";

type MemoryCacheEntry = {
  value: string;
  expiresAt: number;
  lastAccessedAt: number;
};

const memoryCache = new Map<string, MemoryCacheEntry>();

// In-process memory counters for cachegen / authver fallback
const memoryCounters = new Map<string, number>();

// In-process sliding-window timestamps for rate-limit fallback
const memoryRateWindows = new Map<string, number[]>();

/**
 * Generation bumps that did not reach a configured Redis (it was down or refused the command), by key, with how many
 * were lost. They are replayed as soon as Redis answers again: otherwise a write made during the outage would leave
 * the entries cached before it under a generation that never moved, and they would be served again once Redis was
 * back, for as long as their lifetime (a day for a closed month).
 */
const lostBumps = new Map<string, number>();
const LOST_BUMPS_MAX_KEYS = 50_000;

/** Shared state kept in this process when Redis is missing or failing: see `stateSet`. */
const memoryState = new Map<string, { value: string; expiresAt: number }>();
const MEMORY_STATE_MAX_ENTRIES = 10_000;

// Observability metrics (P8)
let cacheHits = 0;
let cacheMisses = 0;

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
  if (memoryCounters.has(key)) {
    return String(memoryCounters.get(key));
  }
  purgeExpiredMemoryCache();
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
  memoryCounters.delete(key);
  if (ttlSeconds <= 0) return;
  purgeExpiredMemoryCache();
  memoryCache.set(key, {
    value,
    expiresAt: nowMs() + ttlSeconds * 1000,
    lastAccessedAt: nowMs(),
  });
  enforceMemoryCacheLimit();
}

function memoryDel(key: string): number {
  const hadCounter = memoryCounters.delete(key);
  const hadCache = memoryCache.delete(key);
  return hadCounter || hadCache ? 1 : 0;
}

function memoryIncr(key: string): number {
  let current = memoryCounters.get(key);
  if (current === undefined) {
    const fromCache = memoryCache.get(key);
    if (fromCache) {
      const parsed = parseInt(fromCache.value, 10);
      current = Number.isSafeInteger(parsed) ? parsed : 0;
      memoryCache.delete(key);
    } else {
      current = 0;
    }
  }
  const next = current + 1;
  memoryCounters.set(key, next);
  return next;
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
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
  return (
    env.NODE_ENV !== "production" ||
    env.AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION === "true"
  );
}

function warnDisabledProductionFallback(): void {
  if (warnedDisabledProductionFallback) return;
  console.warn(
    "REDIS_URL is unavailable in production. In-process RAM cache fallback is disabled; cacheable work will recompute until Redis is configured.",
  );
  warnedDisabledProductionFallback = true;
}

function timeoutAfter<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
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
  if (redisClient?.isOpen && redisClient.isReady) return redisClient;
  if (redisClient && (!redisClient.isOpen || !redisClient.isReady)) {
    redisClient = null;
  }
  if (!env.REDIS_URL) {
    if (!memoryFallbackAllowed()) {
      warnDisabledProductionFallback();
      return null;
    }
    if (!warnedMissingRedis) {
      console.warn(
        "⚠️ REDIS_URL not provided. Using in-process RAM cache fallback.",
      );
      warnedMissingRedis = true;
    }
    return null;
  }
  if (Date.now() < nextRedisConnectAttemptAt) return null;
  if (isConnecting) {
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

    client.on("end", () => {
      if (redisClient === client) redisClient = null;
    });

    const connectPromise = client.connect();
    connectPromise.catch(() => undefined);
    await timeoutAfter(
      connectPromise,
      REDIS_CONNECT_TIMEOUT_MS + 500,
      "Redis connect",
    );
    redisClient = client;
    redisConnectFailureCount = 0;
    nextRedisConnectAttemptAt = 0;
    if (lostBumps.size) void replayLostBumps(client);
    return redisClient;
  } catch (error) {
    console.error("❌ Failed to connect to Redis", error);
    redisConnectFailureCount++;
    nextRedisConnectAttemptAt =
      Date.now() +
      Math.min(
        REDIS_RETRY_MAX_DELAY_MS,
        1_000 * 2 ** Math.min(redisConnectFailureCount - 1, 5),
      );
    if (client) {
      await closeFailedRedisClient(client);
    }
    return null;
  } finally {
    isConnecting = false;
  }
}

// ─── Primitive Cache Operations (Redis Primary with Memory Fallback) ───

export async function cacheGet(key: string): Promise<string | null> {
  const client = await getRedisClient();
  // Where the memory fallback is not allowed (production without AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION), the
  // process never answers from its own RAM, as the warning in warnDisabledProductionFallback promises.
  const memoryAllowed = memoryFallbackAllowed();
  if (!client) {
    const val = memoryAllowed ? memoryGet(key) : null;
    if (val !== null) cacheHits++;
    else cacheMisses++;
    return val;
  }

  try {
    const val = await client.get(key);
    if (val !== null) cacheHits++;
    else cacheMisses++;
    return val;
  } catch (err) {
    console.warn(`[Redis] cacheGet error for ${key}:`, err);
    const val = memoryAllowed ? memoryGet(key) : null;
    if (val !== null) cacheHits++;
    else cacheMisses++;
    return val;
  }
}

export async function cacheSet(
  key: string,
  ttlSeconds: number,
  value: string,
): Promise<void> {
  const client = await getRedisClient();
  // The process-local copy answers when Redis is missing or failing, where that fallback is allowed.
  if (memoryFallbackAllowed()) memorySet(key, ttlSeconds, value);

  if (!client) return;

  try {
    if (ttlSeconds > 0) {
      await client.setEx(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  } catch (err) {
    console.warn(`[Redis] cacheSet error for ${key}:`, err);
  }
}

export async function cacheDel(key: string): Promise<number> {
  const memCount = memoryDel(key);
  const client = await getRedisClient();
  if (!client) return memCount;

  try {
    const redisCount = await client.del(key);
    return redisCount || memCount;
  } catch (err) {
    console.warn(`[Redis] cacheDel error for ${key}:`, err);
    return memCount;
  }
}

function recordLostBump(key: string): void {
  if (!env.REDIS_URL) return;
  if (!lostBumps.has(key) && lostBumps.size >= LOST_BUMPS_MAX_KEYS) return;
  lostBumps.set(key, (lostBumps.get(key) ?? 0) + 1);
}

async function replayLostBumps(client: RedisClientType): Promise<void> {
  for (const [key, count] of [...lostBumps]) {
    try {
      await client.incrBy(key, count);
      if (lostBumps.get(key) === count) lostBumps.delete(key);
      else lostBumps.set(key, (lostBumps.get(key) ?? count) - count);
    } catch {
      return;
    }
  }
}

/** Bumps a generation counter. A bump Redis misses is replayed when it answers again (`lostBumps`). */
export async function cacheIncr(key: string): Promise<number> {
  const memVal = memoryIncr(key);
  const client = await getRedisClient();
  if (!client) {
    recordLostBump(key);
    return memVal;
  }

  try {
    const value = await client.incr(key);
    if (lostBumps.size) void replayLostBumps(client);
    return value;
  } catch (err) {
    log.warn({ event: "redis.incr_failed", err }, "A generation bump did not reach Redis; it is replayed on reconnect");
    recordLostBump(key);
    return memVal;
  }
}

/** How many generation bumps are waiting for Redis to come back; for tests and the runtime status. */
export function pendingGenerationBumps(): number {
  let total = 0;
  for (const count of lostBumps.values()) total += count;
  return total;
}

// ─── Shared state (not a cache) ───
//
// A value every replica must see and nobody can recompute: a one-time code a user is about to type, a pairing
// code, a counter. Redis holds it when it is configured. Unlike the cache helpers above, it falls back to this
// process's memory in production too, because one process without Redis is a supported deployment and a code kept
// nowhere could never be used; running more than one process requires Redis (decision 0013).

function memoryStateGet(key: string, now = nowMs()): string | null {
  const entry = memoryState.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    memoryState.delete(key);
    return null;
  }
  return entry.value;
}

function memoryStateSet(key: string, ttlSeconds: number, value: string): void {
  const now = nowMs();
  if (memoryState.size >= MEMORY_STATE_MAX_ENTRIES) {
    for (const [stale, entry] of memoryState) if (entry.expiresAt <= now) memoryState.delete(stale);
    if (memoryState.size >= MEMORY_STATE_MAX_ENTRIES) {
      const oldest = memoryState.keys().next().value;
      if (oldest !== undefined) memoryState.delete(oldest);
    }
  }
  memoryState.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
}

/** Stores shared state for `ttlSeconds`: in Redis, or in this process when Redis is missing or failing. */
export async function stateSet(key: string, ttlSeconds: number, value: string): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    try {
      await client.setEx(key, ttlSeconds, value);
      memoryState.delete(key);
      return;
    } catch (err) {
      log.warn({ event: "redis.stateSet_failed", err }, "Redis refused a shared-state command");
    }
  }
  memoryStateSet(key, ttlSeconds, value);
}

/** Reads shared state; a value kept in this process during a Redis outage is still found. */
export async function stateGet(key: string): Promise<string | null> {
  const client = await getRedisClient();
  if (client) {
    try {
      const value = await client.get(key);
      if (value !== null) return value;
    } catch (err) {
      log.warn({ event: "redis.stateGet_failed", err }, "Redis refused a shared-state command");
    }
  }
  return memoryStateGet(key);
}

/** Reads and removes shared state in one step, so a one-time value is used once even by two racing replicas. */
export async function stateTake(key: string): Promise<string | null> {
  const client = await getRedisClient();
  if (client) {
    try {
      const value = await client.getDel(key);
      if (value !== null) return value;
    } catch (err) {
      log.warn({ event: "redis.stateTake_failed", err }, "Redis refused a shared-state command");
    }
  }
  const value = memoryStateGet(key);
  memoryState.delete(key);
  return value;
}

/** Removes shared state everywhere it may be kept. */
export async function stateDel(key: string): Promise<void> {
  memoryState.delete(key);
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    log.warn({ event: "redis.stateDel_failed", err }, "Redis refused a shared-state command");
  }
}

/**
 * Atomic sliding-window rate limiter via Lua script (Decision 5 / P2).
 * Runs in exactly one round-trip.
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local clearBefore = now - window

redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
local current = redis.call('ZCARD', key)

if current < max then
  redis.call('ZADD', key, now, now .. ':' .. redis.call('INCR', key .. ':seq'))
  redis.call('PEXPIRE', key, window + 1000)
  redis.call('PEXPIRE', key .. ':seq', window + 1000)
  return {1, max - current - 1, 0}
else
  return {0, 0, window}
end
`;

export async function executeSlidingWindowRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const client = await getRedisClient();
  const now = Date.now();

  if (!client) {
    // In-memory sliding-window fallback
    if (env.NODE_ENV === "production") {
      console.warn(
        `[RateLimit] Warning: Using in-memory rate limiter in production for ${key}. Multiple replicas will not share limits.`,
      );
    }

    const clearBefore = now - windowMs;
    const windowTimestamps = (memoryRateWindows.get(key) || []).filter(
      (ts) => ts > clearBefore,
    );

    if (windowTimestamps.length < max) {
      windowTimestamps.push(now);
      memoryRateWindows.set(key, windowTimestamps);
      return {
        allowed: true,
        remaining: max - windowTimestamps.length,
        resetMs: 0,
      };
    } else {
      return { allowed: false, remaining: 0, resetMs: windowMs };
    }
  }

  try {
    const result = (await client.eval(SLIDING_WINDOW_LUA, {
      keys: [key],
      arguments: [String(now), String(windowMs), String(max)],
    })) as [number, number, number];

    const allowed = result[0] === 1;
    const remaining = Number(result[1]);
    const resetMs = Number(result[2]);
    return { allowed, remaining, resetMs };
  } catch (err) {
    console.warn(
      `[Redis] Lua rate limit error for ${key}, falling back to memory:`,
      err,
    );
    const clearBefore = now - windowMs;
    const windowTimestamps = (memoryRateWindows.get(key) || []).filter(
      (ts) => ts > clearBefore,
    );
    if (windowTimestamps.length < max) {
      windowTimestamps.push(now);
      memoryRateWindows.set(key, windowTimestamps);
      return {
        allowed: true,
        remaining: max - windowTimestamps.length,
        resetMs: 0,
      };
    } else {
      return { allowed: false, remaining: 0, resetMs: windowMs };
    }
  }
}

/**
 * Maintenance/Admin ONLY keyspace pattern scan.
 * NEVER call this on normal user request or mutation paths!
 * Use cachegen counters (CacheKeys.cacheGen) instead.
 */
export async function deleteCacheByPattern(pattern: string): Promise<number> {
  const memoryDeleted = deleteMemoryByPattern(pattern);
  const client = await getRedisClient();
  if (!client) return memoryDeleted;

  try {
    let redisDeleted = 0;
    for await (const key of client.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      await client.del(key);
      redisDeleted++;
    }
    return memoryDeleted + redisDeleted;
  } catch (err) {
    console.warn(`Redis delete pattern error for ${pattern}:`, err);
    return memoryDeleted;
  }
}

export function getCacheRuntimeStatus(): {
  backend: CacheBackend;
  memoryEntries: number;
  memoryFallbackAllowed: boolean;
  redisConfigured: boolean;
  redisConnected: boolean;
  hits: number;
  misses: number;
  hitRatePercent: number;
} {
  purgeExpiredMemoryCache();
  const fallbackAllowed = memoryFallbackAllowed();
  const total = cacheHits + cacheMisses;
  const hitRatePercent = total > 0 ? Math.round((cacheHits / total) * 100) : 0;
  return {
    backend: redisClient ? "redis" : fallbackAllowed ? "memory" : "disabled",
    memoryEntries: memoryCache.size,
    memoryFallbackAllowed: fallbackAllowed,
    redisConfigured: Boolean(env.REDIS_URL),
    redisConnected: Boolean(redisClient),
    hits: cacheHits,
    misses: cacheMisses,
    hitRatePercent,
  };
}

export interface CacheStatusResult<T> {
  key: string;
  value: T;
  hit: boolean;
  backend: CacheBackend;
}

/**
 * Wrapper for getting cached value or computing it with hit/miss metadata.
 */
export async function withCacheStatus<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<CacheStatusResult<T>> {
  const backend = (): CacheBackend =>
    redisClient ? "redis" : memoryFallbackAllowed() ? "memory" : "disabled";
  const cached = await cacheGet(key);
  if (cached !== null) {
    try {
      return {
        key,
        value: JSON.parse(cached) as T,
        hit: true,
        backend: backend(),
      };
    } catch {
      // JSON parse error, recompute
    }
  }

  const result = await compute();
  if (result !== undefined && result !== null) {
    await cacheSet(key, ttlSeconds, JSON.stringify(result));
  }

  return {
    key,
    value: result,
    hit: false,
    backend: backend(),
  };
}

/**
 * Wrapper for getting cached value or computing it
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  return (await withCacheStatus(key, ttlSeconds, compute)).value;
}
