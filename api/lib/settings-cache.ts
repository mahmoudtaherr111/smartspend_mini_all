/**
 * Centralized System Settings Cache
 * 
 * Eliminates 24+ redundant `SELECT * FROM system_settings` queries per request cycle.
 * Settings are cached in-process with a 5-minute TTL and invalidated on admin updates.
 */

import { db } from "../queries/connection";
import { systemSettings } from "../../db/schema";

let cachedSettings: Record<string, string> | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns system settings from in-memory cache, or fetches from MySQL if cache is stale.
 * This replaces all direct `db.select().from(systemSettings)` calls across the codebase.
 */
export async function getSystemSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedSettings && cacheExpiresAt > now) {
    return cachedSettings;
  }

  const rows = await db.select().from(systemSettings);
  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (row.key && row.value) {
      settings[row.key] = row.value;
    }
  }

  cachedSettings = settings;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return settings;
}

/**
 * Invalidates the settings cache. Call this after admin updates to system_settings.
 */
export function invalidateSettingsCache(): void {
  cachedSettings = null;
  cacheExpiresAt = 0;
}
