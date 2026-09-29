/**
 * Generations that tell a per-process copy of shared data when to reload. Kept apart from `redis-client.ts` and
 * built only on `cacheGet` and `cacheIncr`, so a test that stubs those two stubs this as well.
 */
import { cacheGet, cacheIncr } from "./redis-client";

/**
 * A process-local copy of shared data (settings, the AI routes and prices) reloads when the Redis counter `key`
 * moves. The copy records the generation it was loaded under (`loaded`), `moved()` compares it with Redis at most
 * every `everyMs`, and a writer calls `bump()` after its write so every process reloads. Without Redis the counter
 * is per process and the copy's own lifetime is the bound.
 */
export function watchGeneration(key: string, everyMs = 10_000) {
  let loadedUnder: string | null = null;
  let checkedAt = 0;
  const current = async (): Promise<string> => {
    try {
      return (await cacheGet(key)) ?? "0";
    } catch {
      return loadedUnder ?? "0";
    }
  };
  return {
    current,
    loaded(generation: string, now = Date.now()) {
      loadedUnder = generation;
      checkedAt = now;
    },
    async moved(now = Date.now()): Promise<boolean> {
      if (loadedUnder === null || now - checkedAt < everyMs) return false;
      checkedAt = now;
      return (await current()) !== loadedUnder;
    },
    bump: (): Promise<void> => cacheIncr(key).then(() => undefined, () => undefined),
  };
}
