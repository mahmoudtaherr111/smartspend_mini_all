import { createHmac, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { env } from "./env";
import { getRedisClient } from "./redis-client";
import {
  logLoginFailure,
  logLoginProtectionRedisDegraded,
  logLoginRateLimitRejection,
  type LoginSecurityEvent,
} from "./security-logger";

const WINDOW_MS = 15 * 60_000;
const BURST_WINDOW_MS = 60_000;
const IN_FLIGHT_TTL_MS = 20_000;
const MAX_IP_IN_FLIGHT = 20;
const MAX_ACCOUNT_IN_FLIGHT = 3;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const MAX_MEMORY_FAILURE_KEYS = 25_000;
const MAX_MEMORY_BLOCK_KEYS = 10_000;
const MAX_MEMORY_IN_FLIGHT_KEYS = 10_000;
const PUBLIC_LIMIT = env.LOGIN_ACCOUNT_MAX_FAILURES;
const GENERIC_LIMIT_MESSAGE =
  "تعذر تسجيل الدخول الآن. استنى شوية وحاول مرة تانية.";
const FINGERPRINT_KEY = env.RATE_LIMIT_KEY_SECRET
  ? Buffer.from(env.RATE_LIMIT_KEY_SECRET, "utf8")
  : createHmac("sha256", env.JWT_SECRET)
      .update("smartspend/login-rate-limit-key/v1")
      .digest();

type Backend = "redis" | "memory";
type RejectReason =
  | "account_backoff"
  | "account_network_limit"
  | "ip_burst_limit"
  | "ip_window_limit"
  | "concurrency_limit";

type ProtectionKeys = {
  ip: string;
  account: string;
  pair: string;
  accountBlock: string;
  ipInFlight: string;
  accountInFlight: string;
};

export type LoginAttempt = {
  allowed: boolean;
  backend: Backend;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  reason?: RejectReason;
  attemptId: string;
  keys: ProtectionKeys;
  security: Omit<LoginSecurityEvent, "backend">;
};

type MemoryInFlight = { count: number; expiresAt: number };

const memoryFailures = new Map<string, number[]>();
const memoryBlocks = new Map<string, number>();
const memoryInFlight = new Map<string, MemoryInFlight>();
let memoryOperationCount = 0;

function trimOldestMapEntries<T>(
  map: Map<string, T>,
  maxEntries: number,
): void {
  let excess = map.size - maxEntries;
  if (excess <= 0) return;
  for (const key of map.keys()) {
    map.delete(key);
    excess--;
    if (excess <= 0) break;
  }
}

function fingerprint(value: string): string {
  return createHmac("sha256", FINGERPRINT_KEY)
    .update(value)
    .digest("base64url");
}

function createKeys(
  ip: string,
  accountIdentifier: string,
): {
  keys: ProtectionKeys;
  ipFingerprint: string;
  accountFingerprint: string;
} {
  const ipFingerprint = fingerprint(`ip\0${ip}`);
  const accountFingerprint = fingerprint(`account\0${accountIdentifier}`);
  const pairFingerprint = fingerprint(
    `pair\0${ipFingerprint}\0${accountFingerprint}`,
  );
  const prefix = "{auth-login}:v1";

  return {
    ipFingerprint,
    accountFingerprint,
    keys: {
      ip: `${prefix}:fail:ip:${ipFingerprint}`,
      account: `${prefix}:fail:account:${accountFingerprint}`,
      pair: `${prefix}:fail:pair:${pairFingerprint}`,
      accountBlock: `${prefix}:block:account:${accountFingerprint}`,
      ipInFlight: `${prefix}:inflight:ip:${ipFingerprint}`,
      accountInFlight: `${prefix}:inflight:account:${accountFingerprint}`,
    },
  };
}

function cleanWindow(key: string, now: number): number[] {
  const current = (memoryFailures.get(key) || []).filter(
    (timestamp) => timestamp > now - WINDOW_MS,
  );
  if (current.length > 0) memoryFailures.set(key, current);
  else memoryFailures.delete(key);
  return current;
}

function cleanInFlight(key: string, now: number): MemoryInFlight {
  const current = memoryInFlight.get(key);
  if (!current || current.expiresAt <= now) {
    memoryInFlight.delete(key);
    return { count: 0, expiresAt: now + IN_FLIGHT_TTL_MS };
  }
  return current;
}

function retryFromOldest(
  timestamps: number[],
  windowMs: number,
  now: number,
): number {
  if (timestamps.length === 0) return 1_000;
  return Math.max(1_000, timestamps[0] + windowMs - now);
}

function pruneMemoryState(now: number): void {
  memoryOperationCount++;
  if (memoryOperationCount % 100 !== 0) return;

  for (const key of memoryFailures.keys()) cleanWindow(key, now);
  for (const [key, blockedUntil] of memoryBlocks) {
    if (blockedUntil <= now) memoryBlocks.delete(key);
  }
  for (const key of memoryInFlight.keys()) cleanInFlight(key, now);
  trimOldestMapEntries(memoryFailures, MAX_MEMORY_FAILURE_KEYS);
  trimOldestMapEntries(memoryBlocks, MAX_MEMORY_BLOCK_KEYS);
  trimOldestMapEntries(memoryInFlight, MAX_MEMORY_IN_FLIGHT_KEYS);
}

function memoryBegin(keys: ProtectionKeys, now: number) {
  pruneMemoryState(now);
  const ipFailures = cleanWindow(keys.ip, now);
  const accountFailures = cleanWindow(keys.account, now);
  const pairFailures = cleanWindow(keys.pair, now);
  const burstFailures = ipFailures.filter(
    (timestamp) => timestamp > now - BURST_WINDOW_MS,
  );
  const blockedUntil = memoryBlocks.get(keys.accountBlock) || 0;

  let reason: RejectReason | undefined;
  let retryAfterMs = 0;

  if (blockedUntil > now) {
    reason = "account_backoff";
    retryAfterMs = blockedUntil - now;
  } else if (pairFailures.length >= env.LOGIN_PAIR_MAX_FAILURES) {
    reason = "account_network_limit";
    retryAfterMs = retryFromOldest(pairFailures, WINDOW_MS, now);
  } else if (burstFailures.length >= env.LOGIN_IP_BURST_MAX_FAILURES) {
    reason = "ip_burst_limit";
    retryAfterMs = retryFromOldest(burstFailures, BURST_WINDOW_MS, now);
  } else if (ipFailures.length >= env.LOGIN_IP_MAX_FAILURES) {
    reason = "ip_window_limit";
    retryAfterMs = retryFromOldest(ipFailures, WINDOW_MS, now);
  }

  const ipInFlight = cleanInFlight(keys.ipInFlight, now);
  const accountInFlight = cleanInFlight(keys.accountInFlight, now);
  if (
    !reason &&
    (ipInFlight.count >= MAX_IP_IN_FLIGHT ||
      accountInFlight.count >= MAX_ACCOUNT_IN_FLIGHT)
  ) {
    reason = "concurrency_limit";
    retryAfterMs = Math.max(
      1_000,
      Math.min(ipInFlight.expiresAt, accountInFlight.expiresAt) - now,
    );
  }

  const remaining = Math.max(
    0,
    Math.min(
      env.LOGIN_ACCOUNT_MAX_FAILURES - accountFailures.length,
      env.LOGIN_PAIR_MAX_FAILURES - pairFailures.length,
      env.LOGIN_IP_BURST_MAX_FAILURES - burstFailures.length,
      env.LOGIN_IP_MAX_FAILURES - ipFailures.length,
    ),
  );

  if (reason) {
    return { allowed: false, remaining, retryAfterMs, reason };
  }

  memoryInFlight.set(keys.ipInFlight, {
    count: ipInFlight.count + 1,
    expiresAt: now + IN_FLIGHT_TTL_MS,
  });
  memoryInFlight.set(keys.accountInFlight, {
    count: accountInFlight.count + 1,
    expiresAt: now + IN_FLIGHT_TTL_MS,
  });

  return { allowed: true, remaining, retryAfterMs: 0 };
}

function memoryRelease(keys: ProtectionKeys, now: number): void {
  for (const key of [keys.ipInFlight, keys.accountInFlight]) {
    const current = cleanInFlight(key, now);
    if (current.count <= 1) memoryInFlight.delete(key);
    else memoryInFlight.set(key, { ...current, count: current.count - 1 });
  }
}

function calculateBackoff(accountFailureCount: number): number {
  if (accountFailureCount < env.LOGIN_ACCOUNT_MAX_FAILURES) return 0;
  const exponent = Math.min(
    10,
    accountFailureCount - env.LOGIN_ACCOUNT_MAX_FAILURES,
  );
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
}

function memoryFailure(keys: ProtectionKeys, now: number) {
  for (const key of [keys.ip, keys.account, keys.pair]) {
    const current = cleanWindow(key, now);
    current.push(now);
    memoryFailures.set(key, current);
  }
  memoryRelease(keys, now);

  const accountFailures = cleanWindow(keys.account, now);
  const pairFailures = cleanWindow(keys.pair, now);
  const ipFailures = cleanWindow(keys.ip, now);
  const burstFailures = ipFailures.filter(
    (timestamp) => timestamp > now - BURST_WINDOW_MS,
  );
  const backoffMs = calculateBackoff(accountFailures.length);
  if (backoffMs > 0) {
    memoryBlocks.set(
      keys.accountBlock,
      Math.max(memoryBlocks.get(keys.accountBlock) || 0, now + backoffMs),
    );
  }

  return {
    remaining: Math.max(
      0,
      Math.min(
        env.LOGIN_ACCOUNT_MAX_FAILURES - accountFailures.length,
        env.LOGIN_PAIR_MAX_FAILURES - pairFailures.length,
        env.LOGIN_IP_BURST_MAX_FAILURES - burstFailures.length,
        env.LOGIN_IP_MAX_FAILURES - ipFailures.length,
      ),
    ),
    backoffMs,
    resetAfterMs:
      backoffMs > 0
        ? backoffMs
        : retryFromOldest(accountFailures, WINDOW_MS, now),
  };
}

function memorySuccess(keys: ProtectionKeys, now: number): void {
  memoryRelease(keys, now);
  memoryFailures.delete(keys.account);
  memoryFailures.delete(keys.pair);
  memoryBlocks.delete(keys.accountBlock);
}

const BEGIN_LUA = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local burstWindow = tonumber(ARGV[3])
local ipMax = tonumber(ARGV[4])
local burstMax = tonumber(ARGV[5])
local pairMax = tonumber(ARGV[6])
local inFlightTtl = tonumber(ARGV[7])
local maxIpInFlight = tonumber(ARGV[8])
local maxAccountInFlight = tonumber(ARGV[9])
local accountMax = tonumber(ARGV[10])
local clearBefore = now - window

redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, clearBefore)
redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, clearBefore)
redis.call('ZREMRANGEBYSCORE', KEYS[3], 0, clearBefore)

local ipCount = redis.call('ZCARD', KEYS[1])
local accountCount = redis.call('ZCARD', KEYS[2])
local pairCount = redis.call('ZCARD', KEYS[3])
local burstCount = redis.call('ZCOUNT', KEYS[1], now - burstWindow, '+inf')
local remaining = math.max(0, math.min(accountMax - accountCount, pairMax - pairCount, burstMax - burstCount, ipMax - ipCount))

local accountBlockTtl = redis.call('PTTL', KEYS[4])
if accountBlockTtl > 0 then
  return {0, remaining, accountBlockTtl, 1}
end

if pairCount >= pairMax then
  local oldest = redis.call('ZRANGE', KEYS[3], 0, 0, 'WITHSCORES')
  local retry = window
  if #oldest >= 2 then retry = math.max(1000, tonumber(oldest[2]) + window - now) end
  return {0, remaining, retry, 2}
end

if burstCount >= burstMax then
  local oldest = redis.call('ZRANGEBYSCORE', KEYS[1], now - burstWindow, '+inf', 'WITHSCORES', 'LIMIT', 0, 1)
  local retry = burstWindow
  if #oldest >= 2 then retry = math.max(1000, tonumber(oldest[2]) + burstWindow - now) end
  return {0, remaining, retry, 3}
end

if ipCount >= ipMax then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = window
  if #oldest >= 2 then retry = math.max(1000, tonumber(oldest[2]) + window - now) end
  return {0, remaining, retry, 4}
end

local ipInFlight = tonumber(redis.call('GET', KEYS[5]) or '0')
local accountInFlight = tonumber(redis.call('GET', KEYS[6]) or '0')
if ipInFlight >= maxIpInFlight or accountInFlight >= maxAccountInFlight then
  local ipTtl = redis.call('PTTL', KEYS[5])
  local accountTtl = redis.call('PTTL', KEYS[6])
  local retry = math.max(1000, math.min(ipTtl > 0 and ipTtl or inFlightTtl, accountTtl > 0 and accountTtl or inFlightTtl))
  return {0, remaining, retry, 5}
end

redis.call('INCR', KEYS[5])
redis.call('PEXPIRE', KEYS[5], inFlightTtl)
redis.call('INCR', KEYS[6])
redis.call('PEXPIRE', KEYS[6], inFlightTtl)
return {1, remaining, 0, 0}
`;

const FAILURE_LUA = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local accountMax = tonumber(ARGV[3])
local baseBackoff = tonumber(ARGV[4])
local maxBackoff = tonumber(ARGV[5])
local eventId = ARGV[6]
local clearBefore = now - window

local function release(key)
  local count = tonumber(redis.call('GET', key) or '0')
  if count <= 1 then redis.call('DEL', key) else redis.call('DECR', key) end
end

for i = 1, 3 do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], 0, clearBefore)
  redis.call('ZADD', KEYS[i], now, eventId)
  redis.call('PEXPIRE', KEYS[i], window + 1000)
end

release(KEYS[5])
release(KEYS[6])

local accountCount = redis.call('ZCARD', KEYS[2])
local backoff = 0
if accountCount >= accountMax then
  local exponent = math.min(10, accountCount - accountMax)
  backoff = math.min(maxBackoff, baseBackoff * math.pow(2, exponent))
  local existing = redis.call('PTTL', KEYS[4])
  if backoff > existing then redis.call('SET', KEYS[4], '1', 'PX', backoff) end
end

local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
local resetAfter = window
if #oldest >= 2 then resetAfter = math.max(1000, tonumber(oldest[2]) + window - now) end
if backoff > 0 then resetAfter = backoff end
return {accountCount, backoff, resetAfter}
`;

const RELEASE_LUA = `
local function release(key)
  local count = tonumber(redis.call('GET', key) or '0')
  if count <= 1 then redis.call('DEL', key) else redis.call('DECR', key) end
end
release(KEYS[1])
release(KEYS[2])
return 1
`;

const SUCCESS_LUA = `
local function release(key)
  local count = tonumber(redis.call('GET', key) or '0')
  if count <= 1 then redis.call('DEL', key) else redis.call('DECR', key) end
end
release(KEYS[4])
release(KEYS[5])
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
return 1
`;

const REASON_BY_CODE: Record<number, RejectReason> = {
  1: "account_backoff",
  2: "account_network_limit",
  3: "ip_burst_limit",
  4: "ip_window_limit",
  5: "concurrency_limit",
};

async function redisBegin(keys: ProtectionKeys, now: number) {
  const client = await getRedisClient();
  if (!client) return null;
  const result = (await client.eval(BEGIN_LUA, {
    keys: [
      keys.ip,
      keys.account,
      keys.pair,
      keys.accountBlock,
      keys.ipInFlight,
      keys.accountInFlight,
    ],
    arguments: [
      String(now),
      String(WINDOW_MS),
      String(BURST_WINDOW_MS),
      String(env.LOGIN_IP_MAX_FAILURES),
      String(env.LOGIN_IP_BURST_MAX_FAILURES),
      String(env.LOGIN_PAIR_MAX_FAILURES),
      String(IN_FLIGHT_TTL_MS),
      String(MAX_IP_IN_FLIGHT),
      String(MAX_ACCOUNT_IN_FLIGHT),
      String(env.LOGIN_ACCOUNT_MAX_FAILURES),
    ],
  })) as [number, number, number, number];

  return {
    allowed: Number(result[0]) === 1,
    remaining: Number(result[1]),
    retryAfterMs: Number(result[2]),
    reason: REASON_BY_CODE[Number(result[3])],
  };
}

function securityEvent(attempt: LoginAttempt): LoginSecurityEvent {
  return { ...attempt.security, backend: attempt.backend };
}

export async function beginLoginAttempt(input: {
  ip: string;
  accountIdentifier: string;
  requestId: string;
  userAgent?: string;
}): Promise<LoginAttempt> {
  const now = Date.now();
  const { keys, ipFingerprint, accountFingerprint } = createKeys(
    input.ip,
    input.accountIdentifier,
  );
  const security = {
    requestId: input.requestId,
    ipFingerprint: ipFingerprint.slice(0, 20),
    accountFingerprint: accountFingerprint.slice(0, 20),
    userAgentFingerprint: input.userAgent
      ? fingerprint(`ua\0${input.userAgent}`).slice(0, 20)
      : undefined,
  };
  let backend: Backend = "redis";
  let decision: ReturnType<typeof memoryBegin>;

  try {
    const redisDecision = await redisBegin(keys, now);
    if (redisDecision) decision = redisDecision;
    else {
      backend = "memory";
      logLoginProtectionRedisDegraded("begin:no-client");
      decision = memoryBegin(keys, now);
    }
  } catch (error) {
    backend = "memory";
    logLoginProtectionRedisDegraded("begin:eval", error);
    decision = memoryBegin(keys, now);
  }

  const attempt: LoginAttempt = {
    ...decision,
    backend,
    limit: PUBLIC_LIMIT,
    attemptId: randomUUID(),
    keys,
    security,
  };

  if (!attempt.allowed) {
    logLoginRateLimitRejection({
      ...securityEvent(attempt),
      reason: attempt.reason || "unknown",
      retryAfterMs: attempt.retryAfterMs,
    });
  }

  return attempt;
}

export async function recordLoginFailure(attempt: LoginAttempt): Promise<{
  limit: number;
  remaining: number;
  retryAfterMs: number;
  resetAfterMs: number;
}> {
  const now = Date.now();
  let result: {
    remaining: number;
    backoffMs: number;
    resetAfterMs: number;
  };

  if (attempt.backend === "redis") {
    try {
      const client = await getRedisClient();
      if (!client)
        throw new Error("Redis client unavailable after login preflight");
      const redisResult = (await client.eval(FAILURE_LUA, {
        keys: [
          attempt.keys.ip,
          attempt.keys.account,
          attempt.keys.pair,
          attempt.keys.accountBlock,
          attempt.keys.ipInFlight,
          attempt.keys.accountInFlight,
        ],
        arguments: [
          String(now),
          String(WINDOW_MS),
          String(env.LOGIN_ACCOUNT_MAX_FAILURES),
          String(BASE_BACKOFF_MS),
          String(MAX_BACKOFF_MS),
          attempt.attemptId,
        ],
      })) as [number, number, number];
      result = {
        remaining: Math.max(
          0,
          env.LOGIN_ACCOUNT_MAX_FAILURES - Number(redisResult[0]),
        ),
        backoffMs: Number(redisResult[1]),
        resetAfterMs: Number(redisResult[2]),
      };
      // Mirror failures locally so a later Redis outage does not start from zero.
      memoryFailure(attempt.keys, now);
    } catch (error) {
      logLoginProtectionRedisDegraded("failure:eval", error);
      result = memoryFailure(attempt.keys, now);
    }
  } else {
    result = memoryFailure(attempt.keys, now);
  }

  logLoginFailure({
    ...securityEvent(attempt),
    remaining: result.remaining,
    backoffMs: result.backoffMs,
  });

  return {
    limit: PUBLIC_LIMIT,
    remaining: result.remaining,
    retryAfterMs: result.backoffMs,
    resetAfterMs: result.resetAfterMs,
  };
}

export async function completeSuccessfulLogin(
  attempt: LoginAttempt,
): Promise<void> {
  const now = Date.now();
  if (attempt.backend === "redis") {
    try {
      const client = await getRedisClient();
      if (!client)
        throw new Error("Redis client unavailable after successful login");
      await client.eval(SUCCESS_LUA, {
        keys: [
          attempt.keys.account,
          attempt.keys.pair,
          attempt.keys.accountBlock,
          attempt.keys.ipInFlight,
          attempt.keys.accountInFlight,
        ],
        arguments: [],
      });
    } catch (error) {
      logLoginProtectionRedisDegraded("success:eval", error);
    }
  }
  memorySuccess(attempt.keys, now);
}

export async function releaseLoginAttempt(
  attempt: LoginAttempt,
): Promise<void> {
  const now = Date.now();
  if (attempt.backend === "redis") {
    try {
      const client = await getRedisClient();
      if (!client)
        throw new Error(
          "Redis client unavailable while releasing login attempt",
        );
      await client.eval(RELEASE_LUA, {
        keys: [attempt.keys.ipInFlight, attempt.keys.accountInFlight],
        arguments: [],
      });
    } catch (error) {
      logLoginProtectionRedisDegraded("release:eval", error);
    }
  }
  memoryRelease(attempt.keys, now);
}

export function setLoginRateLimitHeaders(
  headers: Headers | undefined,
  state: {
    limit: number;
    remaining: number;
    retryAfterMs: number;
    resetAfterMs?: number;
  },
): void {
  if (!headers) return;
  const retryAfterSeconds = Math.max(0, Math.ceil(state.retryAfterMs / 1_000));
  const resetAfterSeconds = Math.max(
    0,
    Math.ceil((state.resetAfterMs ?? state.retryAfterMs) / 1_000),
  );
  const resetEpochSeconds = Math.ceil(
    (Date.now() + resetAfterSeconds * 1_000) / 1_000,
  );

  headers.set("RateLimit-Limit", String(state.limit));
  headers.set("RateLimit-Remaining", String(Math.max(0, state.remaining)));
  headers.set("RateLimit-Reset", String(resetAfterSeconds));
  headers.set("X-RateLimit-Limit", String(state.limit));
  headers.set("X-RateLimit-Remaining", String(Math.max(0, state.remaining)));
  headers.set("X-RateLimit-Reset", String(resetEpochSeconds));
  headers.set("Cache-Control", "no-store");
  if (retryAfterSeconds > 0) {
    headers.set("Retry-After", String(retryAfterSeconds));
  } else {
    headers.delete("Retry-After");
  }
}

export function loginRateLimitError(retryAfterMs: number): TRPCError {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1_000));
  const cause = Object.assign(new Error("Login rate limit exceeded"), {
    retryAfterSeconds,
  });
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: GENERIC_LIMIT_MESSAGE,
    cause,
  });
}

export function resetLoginProtectionForTests(): void {
  if (env.NODE_ENV !== "test") return;
  memoryFailures.clear();
  memoryBlocks.clear();
  memoryInFlight.clear();
  memoryOperationCount = 0;
}
