/**
 * Centralized Redis cache keys and namespaces.
 *
 * Implements O(1) invalidation using per-user generation counters (cachegen)
 * and authentication versioning (authver).
 */

export const CACHE_SCHEMA_VERSION = "v2";

export const CacheKeys = {
  /** Session principal cache: sess:<tokenHashHex> */
  session: (tokenHashHex: string) => `sess:${tokenHashHex}`,

  /** Authentication version counter: authver:<userType>:<userId> */
  authVer: (userType: string, userId: number | string) =>
    `authver:${userType}:${userId}`,

  /** Derived expense statistics cache generation: cachegen:<userType>:<userId> */
  cacheGen: (userType: string, userId: number | string) =>
    `cachegen:${userType}:${userId}`,

  /**
   * Versioned expense monthly stats cache key embedding the generation counter.
   * Invalidated in O(1) by INCR-ing cacheGen.
   */
  expenseStats: (
    gen: number,
    userType: string,
    userId: number | string,
    month: string,
    salaryDay: number | string,
    businessId: number | string | "all",
  ) =>
    `${CACHE_SCHEMA_VERSION}:stats:g${gen}:${userType}:${userId}:${month}:${salaryDay}:biz:${businessId}`,

  /** Rate limiter sliding-window sorted set key */
  rateLimit: (prefix: string, identifier: string) => `rl:${prefix}:${identifier}`,
};
