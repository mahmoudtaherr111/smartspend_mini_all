import { AsyncLocalStorage } from "async_hooks";
import { createHash } from "crypto";
import { withCacheStatus, cacheGet, cacheIncr } from "../../lib/redis-client";
import { taxonomyVersion } from "../../lib/category-registry";
import { businessDateKey } from "../../lib/app-time";

const PREFIX = "finance_ai";
// v4 (2026-09-24): summaries are one MySQL aggregate, and every result covers the personal ledger only (a business's
// expenses are its own, as on Home); earlier entries carried a row-derived daily average and mixed them in.
// v5 (2026-09-24): a category named in words ("أكل") matches its rows; v4 entries hold zeros for those.
// v6 (2026-09-29): a key part with letters outside ASCII carries a hash of itself; before, every Arabic letter became
// "_", so "فواتير" and "اشتراك" (six letters each) shared one cached answer.
const CACHE_SCHEMA_VERSION = `schema_v6_${taxonomyVersion()}`;
const financeCacheTrace = new AsyncLocalStorage<string[]>();

/**
 * One part of a key: readable ASCII as written; anything else (an Arabic name, a long filter) keeps a readable
 * stub and gains a hash of the exact value, so two different values never share a key.
 */
export function sanitizePart(value: unknown): string {
  const raw = String(value ?? "none");
  const spaced = raw.replace(/\s+/g, "_");
  const safe = spaced.replace(/[^a-zA-Z0-9_.:-]/g, "_");
  if (safe === spaced && safe.length <= 80) return safe;
  return `${safe.slice(0, 40)}~${createHash("sha256").update(raw).digest("base64url").slice(0, 16)}`;
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

/**
 * Every ledger write bumps the user's generation, so a hit is normally current; the TTL
 * bounds the damage of a bump that was lost. A period that still holds today can change
 * any minute and is kept five minutes at most; a closed one an hour. Keys are
 * `<kind>:<start>:<end>:salary_<n>` with Cairo day keys (period-resolver.ts).
 */
export function financeCacheTtl(periodKey: string): number {
  if (periodKey.startsWith("today:")) return 60;
  if (periodKey.startsWith("yesterday:")) return 10 * 60;
  const end = periodKey.split(":")[2];
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end >= businessDateKey()) return 5 * 60;
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
