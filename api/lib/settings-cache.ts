/**
 * Centralized System Settings Cache
 *
 * Eliminates 24+ redundant `SELECT * FROM system_settings` queries per request cycle.
 * Settings are held in-process for up to 5 minutes. An admin write calls
 * `invalidateSettingsCache()`, which clears this process and bumps a generation counter in
 * Redis (`settingsgen`); every other process compares that counter at most every 10
 * seconds and reloads when it moved (`watchGeneration` in `./shared-generation`). Before the
 * counter, a setting changed on one server process (a plan limit, a threshold, a model) took
 * up to five minutes to reach the others, and the classification cache, keyed by the
 * settings, answered by the old ones meanwhile. Without Redis the counter is per process and
 * the 5-minute TTL is the bound.
 */

import { db } from "../queries/connection";
import { systemSettings } from "../../db/schema";
import { watchGeneration } from "./shared-generation";

let cachedSettings: Record<string, string> | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const generation = watchGeneration("settingsgen");

/**
 * Returns system settings from in-memory cache, or fetches from MySQL if cache is stale.
 * This replaces all direct `db.select().from(systemSettings)` calls across the codebase.
 */
export async function getSystemSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedSettings && cacheExpiresAt > now && !(await generation.moved(now))) return cachedSettings;

  const loadedUnder = await generation.current();
  const rows = await db.select().from(systemSettings);
  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (row.key && row.value) {
      settings[row.key] = row.value;
    }
  }

  cachedSettings = settings;
  cacheExpiresAt = now + CACHE_TTL_MS;
  generation.loaded(loadedUnder, now);
  return settings;
}

/**
 * Invalidates the settings cache here and in every other process. Call this after admin
 * updates to system_settings.
 */
export function invalidateSettingsCache(): void {
  cachedSettings = null;
  cacheExpiresAt = 0;
  void generation.bump();
}
