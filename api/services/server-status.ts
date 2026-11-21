/**
 * Whether this server is ready to serve: every outside system it depends on, read from what the server knows about
 * itself, never a guess. The console's «حالة السيرفر» page shows it in words; this file only states facts.
 *
 * `state` is `ok`, `warn` (works, but something a production server should have is missing) or `fail` (a feature is
 * down). Nothing here holds a secret: a key is reported as set or not set.
 */
import os from "node:os";
import { count, eq, gte, sql } from "drizzle-orm";
import journal from "../../db/migrations/meta/_journal.json";
import { aiProviders, localUsers, scheduledJobRuns, users } from "../../db/schema";
import { env } from "../lib/env";
import { openProviderKey } from "../lib/provider-key-crypto";
import { getCacheRuntimeStatus } from "../lib/redis-client";
import { getSystemSettings } from "../lib/settings-cache";
import { whatsAppConfig } from "../lib/whatsapp/client";
import { db, mysqlPool } from "../queries/connection";
import { isFirebaseInitialized } from "./firebase";
import { getStorageDriver } from "./storage";
import { S3StorageDriver } from "./storage/s3-driver";

export type CheckState = "ok" | "warn" | "fail";

export interface StatusCheck {
  id: string;
  state: CheckState;
  /** Facts the console words: numbers, names of what is missing, never a secret. */
  facts: Record<string, string | number | boolean | null | string[]>;
}

const production = () => env.NODE_ENV === "production";

/** Migrations in the journal shipped with this build that the database has not recorded. */
async function pendingMigrations(): Promise<string[] | null> {
  try {
    const [rows] = await mysqlPool.query("SELECT MAX(created_at) AS last FROM `__drizzle_migrations`");
    const last = Number((rows as Array<{ last: number | string | null }>)[0]?.last ?? 0);
    return journal.entries.filter((entry) => entry.when > last).map((entry) => entry.tag);
  } catch {
    // No journal table: the database was made by `db:push` or by hand (docs/guides/deploy.md, db:doctor).
    return null;
  }
}

export async function loadServerStatus(now = new Date()): Promise<{ checks: StatusCheck[]; process: Record<string, string | number> }> {
  const checks: StatusCheck[] = [];

  const started = Date.now();
  let databaseUp = false;
  try {
    await mysqlPool.query("SELECT 1");
    databaseUp = true;
  } catch {
    databaseUp = false;
  }
  checks.push({ id: "database", state: databaseUp ? "ok" : "fail", facts: { latencyMs: Date.now() - started } });

  if (databaseUp) {
    const pending = await pendingMigrations();
    checks.push({
      id: "migrations",
      state: pending === null ? "warn" : pending.length ? "fail" : "ok",
      facts: { pending: pending ?? [], journal: pending !== null, latest: journal.entries[journal.entries.length - 1]?.tag ?? null },
    });
  }

  const cache = getCacheRuntimeStatus();
  checks.push({
    id: "redis",
    state: !cache.redisConfigured ? (production() ? "warn" : "ok") : cache.redisConnected ? "ok" : "fail",
    facts: { configured: cache.redisConfigured, connected: cache.redisConnected, hitRatePercent: cache.hitRatePercent },
  });

  let lastJobAt: Date | null = null;
  if (databaseUp) {
    try {
      const [row] = await db.select({ at: sql<Date | null>`MAX(${scheduledJobRuns.startedAt})` }).from(scheduledJobRuns)
        .where(gte(scheduledJobRuns.startedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
      lastJobAt = row?.at ? new Date(row.at) : null;
    } catch {
      lastJobAt = null;
    }
  }
  // Several jobs run every minute, so a server running them leaves a run within a few minutes.
  const jobsRunning = lastJobAt !== null && now.getTime() - lastJobAt.getTime() < 10 * 60 * 1000;
  checks.push({
    id: "jobs",
    state: jobsRunning ? "ok" : "fail",
    facts: { lastRunAt: lastJobAt ? lastJobAt.toISOString() : null, thisProcessRunsThem: env.ENABLE_CRONS === "true" },
  });

  checks.push({ id: "push", state: isFirebaseInitialized ? "ok" : "fail", facts: { firebase: isFirebaseInitialized } });
  checks.push({ id: "whatsapp", state: whatsAppConfig() ? "ok" : "warn", facts: { configured: Boolean(whatsAppConfig()) } });

  const objectStorage = getStorageDriver() instanceof S3StorageDriver;
  checks.push({ id: "storage", state: objectStorage ? "ok" : production() ? "fail" : "ok", facts: { objectStorage } });

  checks.push({ id: "errors", state: env.SENTRY_DSN ? "ok" : "warn", facts: { sentry: Boolean(env.SENTRY_DSN) } });
  checks.push({ id: "bots", state: env.TURNSTILE_SECRET_KEY ? "ok" : production() ? "warn" : "ok", facts: { turnstile: Boolean(env.TURNSTILE_SECRET_KEY) } });

  const missingSecrets = [
    ...(env.AI_GATEWAY_SECRET ? [] : ["AI_GATEWAY_SECRET"]),
    ...(env.RATE_LIMIT_KEY_SECRET ? [] : ["RATE_LIMIT_KEY_SECRET"]),
  ];
  checks.push({ id: "secrets", state: missingSecrets.length && production() ? "warn" : "ok", facts: { missing: missingSecrets } });

  if (databaseUp) {
    const [providers, settings] = await Promise.all([db.select().from(aiProviders).where(eq(aiProviders.isActive, true)), getSystemSettings()]);
    const unreadable = providers.filter((provider) => !openProviderKey(provider.apiKeyEncrypted).key).map((provider) => provider.displayName);
    const down = providers.filter((provider) => provider.healthStatus === "down").map((provider) => provider.displayName);
    const serverKey = Boolean(settings.ai_api_key || settings.ai_api_key_2 || env.GEMINI_API_KEY);
    checks.push({
      id: "ai",
      state: !providers.length && !serverKey ? "fail" : unreadable.length || down.length ? "warn" : "ok",
      facts: { connectors: providers.length, unreadable, down, serverKey },
    });
    // One admin is one lost phone away from a console nobody can open.
    const [google, phone] = await Promise.all([
      db.select({ admins: count() }).from(users).where(eq(users.role, "admin")),
      db.select({ admins: count() }).from(localUsers).where(eq(localUsers.role, "admin")),
    ]);
    const adminCount = Number(google[0]?.admins ?? 0) + Number(phone[0]?.admins ?? 0);
    checks.push({ id: "admins", state: adminCount > 1 ? "ok" : "warn", facts: { admins: adminCount } });
  }

  return {
    checks,
    process: {
      environment: env.NODE_ENV,
      host: os.hostname(),
      uptimeMinutes: Math.round(process.uptime() / 60),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node: process.version,
      timezone: env.APP_TIMEZONE,
      website: env.SERVE_WEB_APP === "true" ? "on" : "off",
    },
  };
}
