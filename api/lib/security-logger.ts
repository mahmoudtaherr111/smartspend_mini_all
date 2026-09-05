import pino from "pino";
import { env } from "./env";

const logger = pino({
  name: "smartspend-security",
  level: env.NODE_ENV === "test" ? "silent" : "info",
  base: {
    service: "smartspend-api",
    logType: "security",
  },
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "phone",
      "email",
      "*.password",
      "*.token",
      "*.authorization",
      "*.cookie",
      "*.phone",
      "*.email",
    ],
    censor: "[REDACTED]",
  },
});

export type LoginSecurityEvent = {
  requestId: string;
  ipFingerprint: string;
  accountFingerprint: string;
  userAgentFingerprint?: string;
  backend: "redis" | "memory";
};

export function logLoginRateLimitRejection(
  event: LoginSecurityEvent & {
    reason: string;
    retryAfterMs: number;
  },
): void {
  logger.warn(
    {
      event: "auth.login.rate_limited",
      ...event,
      retryAfterSeconds: Math.max(1, Math.ceil(event.retryAfterMs / 1_000)),
    },
    "Login request rejected by account protection",
  );
}

export function logLoginFailure(
  event: LoginSecurityEvent & {
    remaining: number;
    backoffMs: number;
  },
): void {
  logger.info(
    {
      event: "auth.login.failed",
      ...event,
      backoffSeconds: Math.ceil(event.backoffMs / 1_000),
    },
    "Failed login recorded",
  );
}

let lastRedisDegradedLogAt = 0;
const REDIS_DEGRADED_LOG_INTERVAL_MS = 60_000;

/**
 * Redis outages can generate one error per request. Keep the first detailed
 * event and one periodic reminder while the local insurance limiter is active.
 */
export function logLoginProtectionRedisDegraded(
  operation: string,
  error?: unknown,
): void {
  const now = Date.now();
  if (now - lastRedisDegradedLogAt < REDIS_DEGRADED_LOG_INTERVAL_MS) return;
  lastRedisDegradedLogAt = now;

  const safeError =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error === undefined
        ? undefined
        : { message: String(error) };

  logger.error(
    {
      event: "auth.login.redis_degraded",
      operation,
      err: safeError,
      fallback: "in-memory-insurance-limiter",
    },
    "Redis unavailable for login protection; using bounded local fallback",
  );
}
