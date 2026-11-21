/** The automatic cutover on real MySQL: a clean ledger turns the flag on; once on, it does nothing. */
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../api/queries/connection";
import { systemSettings } from "../db/schema";
import { invalidateSettingsCache, getSystemSettings } from "../api/lib/settings-cache";
import { runCashflowCutoverJob } from "../api/jobs/cashflow-cutover-job";

describe.runIf(process.env.RUN_DB_INTEGRATION === "1")("cashflow cutover job", () => {
  afterAll(async () => {
    await db.insert(systemSettings).values({ key: "capture_financial_version", value: "cashflow-v1" }).onDuplicateKeyUpdate({ set: { value: "cashflow-v1" } });
    invalidateSettingsCache();
  });
  it("activates on a ledger with no legacy rows, and is a no-op once active", async () => {
    await db.update(systemSettings).set({ value: "" }).where(eq(systemSettings.key, "capture_financial_version"));
    invalidateSettingsCache();
    const first = await runCashflowCutoverJob();
    if (first.unresolved === 0) {
      expect(first.active).toBe(true);
      expect((await getSystemSettings()).capture_financial_version).toBe("cashflow-v1");
      expect(await runCashflowCutoverJob()).toEqual({ active: true, changed: 0, unresolved: 0 });
    } else {
      // A shared test database may hold legacy rows another suite left: then nothing is switched on.
      expect(first.active).toBe(false);
    }
  });
});
