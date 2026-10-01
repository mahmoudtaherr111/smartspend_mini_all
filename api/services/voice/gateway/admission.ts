/**
 * Who may open a provider session now. Google's limits are per project and per model (tokens and requests per minute,
 * requests per day; the Live pages publish no concurrency figure), so every server takes a seat from one shared pool
 * per model before a call starts, and the call holds its seat while it lives:
 *
 * - a pool per model, capped by the admin (`voice_max_concurrent_calls`, `voice_ultra_max_concurrent_calls`) from the
 *   project's real limits; 0 means no cap;
 * - one live call per user (`voice_max_calls_per_user`), whichever device or server holds it;
 * - seats expire unless renewed (the call renews on its checkpoint), so a server that dies leaks nothing for long;
 * - a breaker per model: an explicit quota refusal from the provider stops new calls on that model for a while,
 *   longer each time it trips within the hour, instead of every user hitting the same refusal.
 *
 * Seats live in Redis (one Lua step each, so two servers never both take the last seat); a process without Redis keeps
 * them in memory, which is right for a single process (decision 0013).
 */
import { createLogger } from "../../../lib/log";
import { settingDefaults } from "../../../lib/system-settings-registry";
import {
  getCacheRuntimeStatus,
  getRedisClient,
} from "../../../lib/redis-client";

const log = createLogger("voice-admission");

export const SEAT_TTL_MS = 60_000;
const BREAKER_BASE_MS = 60_000;
const BREAKER_MAX_MS = 30 * 60_000;

export type AdmissionRefusal =
  | "pool_full"
  | "user_busy"
  | "provider_quota"
  | "unavailable";

export interface AdmissionLimits {
  unavailable?: boolean;
  /** Seats in this model's pool across all servers; 0 = no cap. */
  poolMax: number;
  /** Live calls one user may hold at once; 0 = no cap. */
  userMax: number;
}

export interface SeatRequest {
  pool: string;
  callId: string;
  user: { id: number; type: string };
}

/** The admin's caps for a model's pool: the extended-thinking model has its own (it spends several times the tokens). */
export function admissionLimits(
  settings: Record<string, string | undefined>,
  model: string,
): AdmissionLimits {
  const defaults = settingDefaults();
  const read = (key: string, fallback: number) => {
    const value = Number.parseInt(String(settings[key] ?? defaults[key] ?? ""), 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const extended = model.includes("extended-thinking");
  const configured = extended
    ? read("voice_ultra_max_concurrent_calls", 3)
    : read("voice_max_concurrent_calls", 20);
  const tpm = extended
    ? read("voice_ultra_input_tpm", 0)
    : read("voice_standard_input_tpm", 0);
  const reserved = extended
    ? read("voice_ultra_reserved_tpm", 60_000)
    : read("voice_standard_reserved_tpm", 30_000);
  // Leave 20% headroom. A seat reserves estimated input TPM; it is not a quota guarantee for unbounded context.
  const capacity =
    tpm > 0 ? Math.floor((tpm * 0.8) / Math.max(1, reserved)) : null;
  return {
    ...(capacity !== null && capacity < 1 ? { unavailable: true } : {}),
    poolMax:
      capacity === null
        ? configured
        : Math.min(configured || Infinity, Math.max(1, capacity)),
    userMax: read("voice_max_calls_per_user", 1),
  };
}

const poolKey = (pool: string) => `voice:admit:pool:${pool}`;
const userKey = (user: SeatRequest["user"]) =>
  `voice:admit:user:${user.type}:${user.id}`;
const breakerKey = (pool: string) => `voice:breaker:${pool}`;
const tripsKey = (pool: string) => `voice:breaker:trips:${pool}`;

/**
 * KEYS: pool, user. ARGV: now, ttl, poolMax, userMax, callId.
 * Drops expired seats, keeps a seat the call already holds, refuses when a cap is reached, else takes both seats.
 */
const ADMIT_LUA = `
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local poolMax = tonumber(ARGV[3])
local userMax = tonumber(ARGV[4])
local callId = ARGV[5]
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
local held = redis.call('ZSCORE', KEYS[1], callId)
if not held then
  if userMax > 0 and redis.call('ZCARD', KEYS[2]) >= userMax and not redis.call('ZSCORE', KEYS[2], callId) then
    return {0, 'user_busy', redis.call('ZCARD', KEYS[1])}
  end
  if poolMax > 0 and redis.call('ZCARD', KEYS[1]) >= poolMax then
    return {0, 'pool_full', redis.call('ZCARD', KEYS[1])}
  end
end
redis.call('ZADD', KEYS[1], now + ttl, callId)
redis.call('ZADD', KEYS[2], now + ttl, callId)
redis.call('PEXPIRE', KEYS[1], ttl * 2)
redis.call('PEXPIRE', KEYS[2], ttl * 2)
return {1, 'ok', redis.call('ZCARD', KEYS[1])}
`;

// ─── The in-process fallback (a single process without Redis) ─────────

const memorySeats = new Map<string, Map<string, number>>();

function memorySet(key: string, now: number): Map<string, number> {
  let seats = memorySeats.get(key);
  if (!seats) memorySeats.set(key, (seats = new Map()));
  for (const [id, expiresAt] of seats) if (expiresAt <= now) seats.delete(id);
  return seats;
}

function memoryAdmit(
  request: SeatRequest,
  limits: AdmissionLimits,
  now: number,
): { ok: boolean; reason?: AdmissionRefusal; inUse: number } {
  const pool = memorySet(poolKey(request.pool), now);
  const user = memorySet(userKey(request.user), now);
  if (!pool.has(request.callId)) {
    if (
      limits.userMax > 0 &&
      user.size >= limits.userMax &&
      !user.has(request.callId)
    )
      return { ok: false, reason: "user_busy", inUse: pool.size };
    if (limits.poolMax > 0 && pool.size >= limits.poolMax)
      return { ok: false, reason: "pool_full", inUse: pool.size };
  }
  pool.set(request.callId, now + SEAT_TTL_MS);
  user.set(request.callId, now + SEAT_TTL_MS);
  return { ok: true, inUse: pool.size };
}

// ─── Seats ────────────────────────────────────────────────────────────

/**
 * Takes (or renews) the call's seats. A call that already holds its seat always keeps it: renewing never fails
 * because the pool filled up behind it.
 */
export async function admitCall(
  request: SeatRequest,
  limits: AdmissionLimits,
  now = Date.now(),
  options: { live?: boolean } = {},
): Promise<
  | { ok: true; inUse: number }
  | {
      ok: false;
      reason: AdmissionRefusal;
      inUse: number;
      retryAfterMs?: number;
    }
> {
  if (limits.unavailable) return { ok: false, reason: "unavailable", inUse: 0 };
  // The breaker holds back new calls; a call already under way keeps (or takes back) its seat.
  const breaker = options.live ? null : await breakerState(request.pool, now);
  if (breaker)
    return {
      ok: false,
      reason: "provider_quota",
      inUse: 0,
      retryAfterMs: breaker.retryAfterMs,
    };
  const client = await getRedisClient();
  if (client) {
    try {
      const [ok, reason, inUse] = (await client.eval(ADMIT_LUA, {
        keys: [poolKey(request.pool), userKey(request.user)],
        arguments: [
          String(now),
          String(SEAT_TTL_MS),
          String(limits.poolMax),
          String(limits.userMax),
          request.callId,
        ],
      })) as [number, string, number];
      return ok === 1
        ? { ok: true, inUse: Number(inUse) }
        : {
            ok: false,
            reason: reason as AdmissionRefusal,
            inUse: Number(inUse),
          };
    } catch (err) {
      log.warn(
        { event: "voice.admission_redis_failed", err },
        "Admission fell back to this process",
      );
    }
  }
  if (!getCacheRuntimeStatus().memoryFallbackAllowed)
    return { ok: false, reason: "unavailable", inUse: 0 };
  const result = memoryAdmit(request, limits, now);
  return result.ok
    ? { ok: true, inUse: result.inUse }
    : { ok: false, reason: result.reason!, inUse: result.inUse };
}

/** Gives the seats back (the call ended, or moved to another model's pool). */
export async function releaseCall(
  request: SeatRequest,
  options: { keepUser?: boolean } = {},
): Promise<void> {
  memorySeats.get(poolKey(request.pool))?.delete(request.callId);
  if (!options.keepUser)
    memorySeats.get(userKey(request.user))?.delete(request.callId);
  const client = await getRedisClient();
  if (!client) return;
  try {
    const release = client.multi().zRem(poolKey(request.pool), request.callId);
    if (!options.keepUser) release.zRem(userKey(request.user), request.callId);
    await release.exec();
  } catch (err) {
    log.warn(
      { event: "voice.admission_release_failed", err },
      "Seat not released; it expires on its own",
    );
  }
}

/** Seats in use per pool, for the admin screen. */
export async function seatsInUse(
  pools: string[],
  now = Date.now(),
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const client = await getRedisClient();
  for (const pool of pools) {
    if (client) {
      try {
        out[pool] = Number(await client.zCount(poolKey(pool), now, "+inf"));
        continue;
      } catch {
        // Fall through to this process's view.
      }
    }
    out[pool] = memorySet(poolKey(pool), now).size;
  }
  return out;
}

// ─── The breaker ──────────────────────────────────────────────────────

const memoryBreakers = new Map<string, { until: number; trips: number[] }>();

const BREAKER_LUA = `
local trips = redis.call('INCR', KEYS[2])
if trips == 1 then redis.call('PEXPIRE', KEYS[2], 3600000) end
local hold = math.min(tonumber(ARGV[2]), tonumber(ARGV[1]) * 2 ^ math.min(trips - 1, 10))
local remaining = redis.call('PTTL', KEYS[1])
if remaining < hold then redis.call('SET', KEYS[1], 'quota', 'PX', hold) end
return {trips, math.max(hold, remaining)}
`;

/** Whether new calls on this model are held back after a quota refusal, and for how long. */
export async function breakerState(
  pool: string,
  now = Date.now(),
): Promise<{ retryAfterMs: number } | null> {
  const client = await getRedisClient();
  if (client) {
    try {
      const ttl = Number(await client.pTTL(breakerKey(pool)));
      return ttl > 0 ? { retryAfterMs: ttl } : null;
    } catch {
      // Fall through.
    }
  }
  const local = memoryBreakers.get(pool);
  return local && local.until > now
    ? { retryAfterMs: local.until - now }
    : null;
}

/**
 * The provider refused a session on this model for quota. New calls on it wait: a minute the first time in an hour,
 * doubling with each trip up to thirty minutes. Calls already live are not touched.
 */
export async function tripBreaker(
  pool: string,
  now = Date.now(),
): Promise<number> {
  const client = await getRedisClient();
  let trips = 1;
  if (client) {
    try {
      const result = await client.eval(BREAKER_LUA, { keys: [breakerKey(pool), tripsKey(pool)], arguments: [String(BREAKER_BASE_MS), String(BREAKER_MAX_MS)] }) as [number, number];
      trips = Number(result[0]);
      const holdMs = Number(result[1]);
      log.warn(
        { event: "voice.breaker_tripped", pool, trips, holdMs },
        "Provider quota refusal: new calls held back",
      );
      return holdMs;
    } catch (err) {
      log.warn(
        { event: "voice.breaker_redis_failed", err },
        "Breaker kept in this process",
      );
    }
  }
  const local = memoryBreakers.get(pool) ?? { until: 0, trips: [] };
  local.trips = [...local.trips.filter((at) => at > now - 60 * 60_000), now];
  const holdMs = Math.min(
    BREAKER_MAX_MS,
    BREAKER_BASE_MS * 2 ** (local.trips.length - 1),
  );
  local.until = now + holdMs;
  memoryBreakers.set(pool, local);
  return holdMs;
}

/** For tests: forget every seat and breaker kept in this process. */
export function resetAdmissionMemory(): void {
  memorySeats.clear();
  memoryBreakers.clear();
}
