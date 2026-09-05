import { db } from "../queries/connection";
import { sql } from "drizzle-orm";
import { reconcileRollupsForRange, toDayString } from "../services/expense-rollups";
import { startOfBusinessDay } from "../lib/app-time";

export interface RollupReconciliationJobResult {
  usersProcessed: number;
  driftCount: number;
  totalRepairedDays: number;
  durationMs: number;
}

/**
 * Nightly Rollup Reconciliation Job (§3.2 / P3 Gate).
 * Trailing 60 days by default.
 * Compares rollup facts against raw ledger truth and repairs discrepancies.
 */
export async function runRollupReconciliationJob(options: {
  trailingDays?: number;
} = {}): Promise<RollupReconciliationJobResult> {
  const trailingDays = options.trailingDays ?? 60;
  const startTime = performance.now();

  const startDateObj = new Date(Date.now() - trailingDays * 24 * 3600 * 1000);
  const startDateStr = toDayString(startDateObj);
  const endDateStr = toDayString(new Date());

  const [sY, sM, sD] = startDateStr.split("-").map(Number);
  const startUtc = startOfBusinessDay(new Date(Date.UTC(sY, sM - 1, sD, 12)));

  const [eY, eM, eD] = endDateStr.split("-").map(Number);
  const nextDayNoon = new Date(Date.UTC(eY, eM - 1, eD + 1, 12));
  const endUtc = startOfBusinessDay(nextDayNoon);

  console.log(
    `[RollupReconciliationJob] Starting reconciliation for range ${startDateStr} to ${endDateStr}...`,
  );

  // Find all distinct users with activity in either raw expenses or rollups in this date range
  const [candidateUsers] = (await db.execute(sql`
    SELECT DISTINCT user_id, user_type FROM (
      SELECT user_id, user_type
      FROM expenses
      WHERE date >= ${startUtc}
        AND date < ${endUtc}
      UNION
      SELECT user_id, user_type
      FROM expense_daily_rollups
      WHERE day >= ${startDateStr}
        AND day <= ${endDateStr}
    ) AS candidate_users
  `)) as unknown as [[{ user_id: number; user_type: string }]];

  const users = (candidateUsers as unknown as Array<{ user_id: number; user_type: string }>) || [];
  let driftCount = 0;
  let totalRepairedDays = 0;

  for (const u of users) {
    try {
      const { repairedDays, driftDetected } = await reconcileRollupsForRange(
        Number(u.user_id),
        u.user_type,
        startDateStr,
        endDateStr,
      );

      if (driftDetected) {
        driftCount++;
        console.warn(
          `[RollupReconciliationJob] Repaired drift for user ${u.user_type}:${u.user_id} (${repairedDays} days repaired).`,
        );
      }
      totalRepairedDays += repairedDays;
    } catch (err: any) {
      console.error(
        `[RollupReconciliationJob] Failed to reconcile user ${u.user_type}:${u.user_id}:`,
        err.message || err,
      );
    }
  }

  const durationMs = Math.round(performance.now() - startTime);
  console.log(
    `[RollupReconciliationJob] Complete: ${users.length} users checked, ${driftCount} had drift, ${totalRepairedDays} total days verified/repaired in ${durationMs}ms.`,
  );

  return {
    usersProcessed: users.length,
    driftCount,
    totalRepairedDays,
    durationMs,
  };
}
