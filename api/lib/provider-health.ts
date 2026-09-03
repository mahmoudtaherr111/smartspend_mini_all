/**
 * Persists what the circuit breaker learns into `ai_providers.healthStatus`.
 *
 * That column and `lastHealthCheck` have existed since the table was created and have
 * never had a writer, so `AiProviderManagerTab` has been showing every provider as
 * healthy no matter what — including providers whose key was revoked months ago. The
 * admin had no way to tell a working provider from a dead one except by watching
 * classifications fail.
 *
 * Installed explicitly at boot rather than as an import side effect, so that unit tests
 * import the router without ever acquiring a database connection.
 */
import { and, eq, ne } from "drizzle-orm";
import { aiProviders } from "../../db/schema";
import { db } from "../queries/connection";
import { setHealthReporter } from "./llm-router";

/**
 * A provider failing every request would otherwise write a row per request. One write
 * per provider per minute is enough for a dashboard a human reads.
 */
const WRITE_THROTTLE_MS = 60_000;

const lastWrite = new Map<string, { status: string; at: number }>();

export function installProviderHealthReporter(): void {
  setHealthReporter((slug, status, detail) => {
    const previous = lastWrite.get(slug);
    const now = Date.now();

    // Always write a CHANGE; throttle only repeats of the same state. A provider going
    // down is the event the dashboard exists to show, and delaying it by a minute to
    // save a write would be the wrong trade.
    if (previous && previous.status === status && now - previous.at < WRITE_THROTTLE_MS) {
      return;
    }
    lastWrite.set(slug, { status, at: now });

    // Fire-and-forget: health bookkeeping must never be able to fail a user's request,
    // and this is called from inside the path that is already handling a failure.
    void db
      .update(aiProviders)
      .set({ healthStatus: status, lastHealthCheck: new Date() })
      .where(and(eq(aiProviders.slug, slug), ne(aiProviders.healthStatus, status)))
      .catch((err) => {
        console.warn(`[Provider Health] Could not record ${slug}=${status}:`, err);
      });

    if (status === "down") {
      console.error(`[Provider Health] ${slug} marked down: ${detail || "no detail"}`);
    }
  });
}

/** Test seam: forget the throttle window. */
export function resetProviderHealthThrottle(): void {
  lastWrite.clear();
}
