import { AsyncLocalStorage } from "async_hooks";
import { withCacheStatus, cacheGet, cacheIncr } from "../../lib/redis-client";
import { taxonomyVersion } from "../../lib/category-registry";

const PREFIX = "finance_ai";
const CACHE_SCHEMA_VERSION = `schema_v3_${taxonomyVersion()}`;
const financeCacheTrace = new AsyncLocalStorage<string[]>();

function sanitizePart(value: unknown): string {
  return String(value ?? "none")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "_")
    .slice(0, 80);
}

export async function getFinanceCacheGen(
  userId: number | string,
  userType: string,
): Promise<number> {
  const raw = await cacheGet(`finance_cachegen:${sanitizePart(userId)}:${sanitizePart(userType)}`);
  return raw ? parseInt(raw, 10) : 0;
}

export function financeCacheKey(
  userId: number | string,
  userType: string,
  capability: string,
  ...parts: unknown[]
): string {
  return [
    PREFIX,
    sanitizePart(CACHE_SCHEMA_VERSION),
    sanitizePart(userId),
    sanitizePart(userType),
    sanitizePart(capability),
    ...parts.map(sanitizePart),
  ].join(":");
}

export function financeCacheTtl(periodKey: string): number {
  if (periodKey.startsWith("today:")) return 60;
  if (periodKey.startsWith("yesterday:")) return 10 * 60;
  return 60 * 60;
}

export async function withFinanceCache<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const parts = key.split(":");
  let versionedKey = key;
  // Key format: PREFIX:CACHE_SCHEMA_VERSION:userId:userType:capability:...
  if (parts.length >= 4) {
    const userId = parts[2];
    const userType = parts[3];
    const gen = await getFinanceCacheGen(userId, userType);
    if (gen > 0) {
      versionedKey = `${parts.slice(0, 2).join(":")}:g${gen}:${parts.slice(2).join(":")}`;
    }
  }
  const result = await withCacheStatus(versionedKey, ttlSeconds, compute);
  financeCacheTrace.getStore()?.push(
    `finance_cache:${result.hit ? "hit" : "miss"}:${result.backend}:${cacheTraceLabel(key)}`,
  );
  return result.value;
}

function cacheTraceLabel(key: string): string {
  const parts = key.split(":");
  return parts.slice(4).join(":") || "unknown";
}

export async function collectFinanceCacheTrace<T>(
  compute: () => Promise<T>,
): Promise<{ value: T; cacheHits: string[] }> {
  const cacheHits: string[] = [];
  const value = await financeCacheTrace.run(cacheHits, compute);
  return {
    value,
    cacheHits,
  };
}

/**
 * O(1) cache invalidation via generation counter (§3.5 Decision 4).
 * Replaces O(N) keyspace scan.
 * Also invalidates expense router cachegen so dashboard queries refresh.
 */
export async function invalidateFinanceUserCache(
  userId: number | string,
  userType: string,
): Promise<number> {
  await cacheIncr(`finance_cachegen:${sanitizePart(userId)}:${sanitizePart(userType)}`);
  try {
    const { CacheKeys } = await import("../../lib/cache-keys");
    await cacheIncr(CacheKeys.cacheGen(userType, userId));
  } catch {
    // Non-blocking
  }
  return 1;
}

export const bumpFinanceCacheGen = invalidateFinanceUserCache;
