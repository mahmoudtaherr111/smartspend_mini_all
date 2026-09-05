import { db } from "../queries/connection";
import { sql } from "drizzle-orm";
import { refreshMonthlyInferences } from "../profile-router";

export interface MonthlyBehaviorJobResult {
  month: string;
  usersProcessed: number;
  errors: number;
  durationMs: number;
}

/**
 * Monthly Behavior Snapshot Cron Job (§3.8 / Phase 4 Gate).
 * Generates behavioral snapshots on the 1st of every month for the previous month,
 * populating monthly_behavior_snapshots to eliminate cold-start gaps for the AI.
 */
export async function runMonthlyBehaviorJob(options: {
  month?: string;
} = {}): Promise<MonthlyBehaviorJobResult> {
  const startTime = performance.now();

  let targetMonth = options.month;
  if (!targetMonth) {
    const now = new Date();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = prevDate.getFullYear();
    const m = String(prevDate.getMonth() + 1).padStart(2, "0");
    targetMonth = `${y}-${m}`;
  }

  console.log(
    `[MonthlyBehaviorJob] Generating monthly behavior snapshots for month: ${targetMonth}...`,
  );

  // Find all users who have had transactions or profiles
  const [activeUsers] = (await db.execute(sql`
    SELECT DISTINCT user_id, user_type
    FROM (
      SELECT user_id, user_type FROM expenses WHERE DATE_FORMAT(date, '%Y-%m') = ${targetMonth}
      UNION
      SELECT user_id, user_type FROM user_profiles
    ) AS candidates
  `)) as unknown as [[{ user_id: number; user_type: string }]];

  const users = (activeUsers as unknown as Array<{ user_id: number; user_type: string }>) || [];
  let processed = 0;
  let errors = 0;

  for (const u of users) {
    try {
      await refreshMonthlyInferences(Number(u.user_id), u.user_type, targetMonth);
      processed++;
    } catch (err: any) {
      errors++;
      console.warn(
        `[MonthlyBehaviorJob] Failed to generate snapshot for ${u.user_type}:${u.user_id}:`,
        err.message || err,
      );
    }
  }

  const durationMs = Math.round(performance.now() - startTime);
  console.log(
    `[MonthlyBehaviorJob] Finished for ${targetMonth}: ${processed} snapshots generated, ${errors} errors in ${durationMs}ms.`,
  );

  return {
    month: targetMonth,
    usersProcessed: processed,
    errors,
    durationMs,
  };
}
