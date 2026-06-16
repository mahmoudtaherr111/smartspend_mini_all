import { AsyncLocalStorage } from "async_hooks";
import { deleteCacheByPattern, withCacheStatus } from "../../lib/redis-client";

const PREFIX = "finance_ai";
const financeCacheTrace = new AsyncLocalStorage<string[]>();

function sanitizePart(value: unknown): string {
  return String(value ?? "none")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "_")
    .slice(0, 80);
}

export function financeCacheKey(
  userId: number | string,
  userType: string,
  capability: string,
  ...parts: unknown[]
): string {
  return [
    PREFIX,
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
  const result = await withCacheStatus(key, ttlSeconds, compute);
  financeCacheTrace.getStore()?.push(
    `finance_cache:${result.hit ? "hit" : "miss"}:${result.backend}:${cacheTraceLabel(key)}`,
  );
  return result.value;
}

function cacheTraceLabel(key: string): string {
  const parts = key.split(":");
  return parts.slice(3).join(":") || "unknown";
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

export async function invalidateFinanceUserCache(
  userId: number | string,
  userType: string,
): Promise<number> {
  return deleteCacheByPattern(`${PREFIX}:${sanitizePart(userId)}:${sanitizePart(userType)}:*`);
}
