import { db } from "../queries/connection";
import { sql } from "drizzle-orm";

export interface RetentionPolicy {
  tableName: string;
  class: "E" | "G" | "D";
  retainDays: number;
  dateColumn: string;
  whereClause?: string;
  rollupBefore?: () => Promise<void>;
  customCleanup?: (dryRun: boolean) => Promise<number>;
  description: string;
}

export interface TablePruneResult {
  table: string;
  class: string;
  prunedCount: number;
  durationMs: number;
  dryRun: boolean;
  rolledUp?: boolean;
}

export interface DataRetentionJobResult {
  dryRun: boolean;
  totalPruned: number;
  results: TablePruneResult[];
  durationMs: number;
}

/**
 * Pre-deletion rollup: Aggregate AI token ledgers into ai_cost_monthly before purging raw rows.
 * Idempotent: Marks processed rows inside an ACID transaction so retries or failed deletes do not double accumulated values.
 */
async function rollupAiTokensBeforePrune(cutoffDateStr: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO ai_cost_monthly (
        user_id,
        user_type,
        billing_period,
        provider_slug,
        model_id,
        total_tokens,
        prompt_tokens,
        completion_tokens,
        cost_usd,
        cost_egp,
        call_count
      )
      SELECT
        user_id,
        user_type,
        billing_period,
        provider_slug,
        model_id,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
        COALESCE(SUM(cost_usd), 0.00000000) AS cost_usd,
        COALESCE(SUM(cost_egp), 0.000000) AS cost_egp,
        COUNT(*) AS call_count
      FROM ai_token_ledgers
      WHERE created_at < ${cutoffDateStr}
        AND (metadata IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.rolled_up')) IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.rolled_up')) != 'true')
      GROUP BY user_id, user_type, billing_period, provider_slug, model_id
      ON DUPLICATE KEY UPDATE
        total_tokens = total_tokens + VALUES(total_tokens),
        prompt_tokens = prompt_tokens + VALUES(prompt_tokens),
        completion_tokens = completion_tokens + VALUES(completion_tokens),
        cost_usd = cost_usd + VALUES(cost_usd),
        cost_egp = cost_egp + VALUES(cost_egp),
        call_count = call_count + VALUES(call_count)
    `);

    await tx.execute(sql`
      UPDATE ai_token_ledgers
      SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.rolled_up', 'true')
      WHERE created_at < ${cutoffDateStr}
        AND (metadata IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.rolled_up')) IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.rolled_up')) != 'true')
    `);
  });
}

/**
 * Pre-deletion rollup: Aggregate ad clicks into ad_stats_daily before purging.
 * Idempotent: Uses GREATEST so retries or failed deletes do not double accumulated values.
 */
async function rollupAdClicksBeforePrune(cutoffDateStr: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO ad_stats_daily (
      ad_id,
      day,
      clicks,
      impressions
    )
    SELECT
      ad_id,
      DATE(created_at) AS day,
      COUNT(*) AS clicks,
      0 AS impressions
    FROM ad_clicks
    WHERE created_at < ${cutoffDateStr}
    GROUP BY ad_id, DATE(created_at)
    ON DUPLICATE KEY UPDATE
      clicks = GREATEST(ad_stats_daily.clicks, VALUES(clicks))
  `);
}

/**
 * Declarative Retention Policies for Ephemeral and Telemetry Tables (§3.7 / Phase 4)
 */
export const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    tableName: "classification_logs",
    class: "E",
    retainDays: 90,
    dateColumn: "created_at",
    description: "Classification telemetry logs. Heavy JSON traces nullified after 30 days.",
    customCleanup: async (dryRun: boolean) => {
      // Lighten 30-day old logs by nulling out heavy reasoning trace & ai_result
      const cutoff30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      if (!dryRun) {
        await db.execute(sql`
          UPDATE classification_logs
          SET reasoning_trace_light = NULL, ai_result = NULL
          WHERE created_at < ${cutoff30}
            AND (reasoning_trace_light IS NOT NULL OR ai_result IS NOT NULL)
          LIMIT 5000
        `);
      }
      return 0;
    },
  },
  {
    tableName: "ai_token_ledgers",
    class: "E",
    retainDays: 90,
    dateColumn: "created_at",
    description: "Raw AI token ledger rows. Rolled up into ai_cost_monthly before deletion.",
    rollupBefore: async () => {
      const cutoff90 = new Date(Date.now() - 90 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      await rollupAiTokensBeforePrune(cutoff90);
    },
  },
  {
    tableName: "user_analytics",
    class: "E",
    retainDays: 30,
    dateColumn: "created_at",
    description: "Pure product telemetry events.",
  },
  {
    tableName: "notification_logs",
    class: "E",
    retainDays: 90,
    dateColumn: "sent_at",
    description: "Notification dispatch history for rate-limit and deduplication.",
  },
  {
    tableName: "ad_clicks",
    class: "E",
    retainDays: 90,
    dateColumn: "created_at",
    description: "Ad click events. Rolled up into ad_stats_daily before deletion.",
    rollupBefore: async () => {
      const cutoff90 = new Date(Date.now() - 90 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      await rollupAdClicksBeforePrune(cutoff90);
    },
  },
  {
    tableName: "api_key_errors",
    class: "E",
    retainDays: 30,
    dateColumn: "created_at",
    whereClause: "resolved = 1",
    description: "Resolved API key error alerts.",
  },
  {
    tableName: "api_key_errors",
    class: "E",
    retainDays: 90,
    dateColumn: "created_at",
    whereClause: "resolved = 0",
    description: "Unresolved API key errors.",
  },
  {
    tableName: "profile_learning_events",
    class: "E",
    retainDays: 180,
    dateColumn: "created_at",
    description: "AI persona evolution and learning audit events.",
  },
  {
    tableName: "voice_usage",
    class: "E",
    retainDays: 90,
    dateColumn: "created_at",
    description: "Raw voice call duration records.",
  },
  {
    tableName: "ai_action_audit_logs",
    class: "E",
    retainDays: 365,
    dateColumn: "created_at",
    description: "Financial action audit trail (1-year mandatory compliance).",
  },
  {
    tableName: "chat_messages",
    class: "G",
    retainDays: 90,
    dateColumn: "created_at",
    whereClause: "conversation_id IN (SELECT conversation_id FROM ai_conversation_summaries)",
    description: "Chat messages older than 90 days with existing conversation summaries.",
  },
  {
    tableName: "pending_clarifications",
    class: "D",
    retainDays: 30,
    dateColumn: "created_at",
    whereClause: "status != 'pending'",
    description: "Resolved or dismissed clarification prompts.",
  },
  {
    tableName: "ai_pending_actions",
    class: "D",
    retainDays: 30,
    dateColumn: "expires_at",
    description: "Expired unconfirmed actions.",
  },
  {
    tableName: "auth_challenges",
    class: "D",
    retainDays: 7,
    dateColumn: "expires_at",
    description: "Expired WebAuthn/passkey challenges.",
  },
];

/**
 * Executes a chunked bounded delete loop (LIMIT 5000) with a sleep between chunks.
 */
async function chunkedDelete(
  tableName: string,
  whereCondition: string,
  chunkSize = 5000,
  pauseMs = 50,
): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const rawSql = `DELETE FROM \`${tableName}\` WHERE ${whereCondition} LIMIT ${chunkSize}`;
    const [result] = (await db.execute(sql.raw(rawSql))) as unknown as [{ affectedRows?: number }];
    const affected = Number(result?.affectedRows ?? 0);
    totalDeleted += affected;

    if (affected < chunkSize) {
      break;
    }

    if (pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }

  return totalDeleted;
}

/**
 * Counts rows matching a retention policy for dry-run reports.
 */
async function countMatchingRows(
  tableName: string,
  whereCondition: string,
): Promise<number> {
  const rawSql = `SELECT COUNT(*) AS count FROM \`${tableName}\` WHERE ${whereCondition}`;
  const [rows] = (await db.execute(sql.raw(rawSql))) as unknown as [[{ count: number | string }]];
  const row = rows?.[0];
  return Number(row?.count ?? 0);
}

/**
 * Runs the data retention lifecycle job (§3.7 / §3.8).
 * Supports dry-run mode, pre-deletion rollups, chunked deletion, and detailed logging.
 */
export async function runDataRetentionJob(options: {
  dryRun?: boolean;
} = {}): Promise<DataRetentionJobResult> {
  const dryRun = Boolean(options.dryRun);
  const startTime = performance.now();
  const results: TablePruneResult[] = [];
  let totalPruned = 0;

  console.log(`[DataRetentionJob] Starting data retention run (dryRun: ${dryRun})...`);

  for (const policy of RETENTION_POLICIES) {
    const policyStart = performance.now();
    let prunedCount = 0;
    let rolledUp = false;

    try {
      const cutoffDate = new Date(Date.now() - policy.retainDays * 24 * 3600 * 1000);
      const cutoffStr = cutoffDate.toISOString().slice(0, 19).replace("T", " ");

      let condition = `\`${policy.dateColumn}\` < '${cutoffStr}'`;
      if (policy.whereClause) {
        condition += ` AND (${policy.whereClause})`;
      }

      // 1. Run custom pre-cleanup if defined (e.g. JSON trace nullification)
      if (policy.customCleanup) {
        await policy.customCleanup(dryRun);
      }

      // 2. Perform rollup before deletion if required
      if (policy.rollupBefore && !dryRun) {
        await policy.rollupBefore();
        rolledUp = true;
      }

      // 3. Either count (dryRun) or chunk-delete
      if (dryRun) {
        prunedCount = await countMatchingRows(policy.tableName, condition);
      } else {
        prunedCount = await chunkedDelete(policy.tableName, condition, 5000, 50);
      }

      totalPruned += prunedCount;
      const durationMs = Math.round(performance.now() - policyStart);

      results.push({
        table: policy.tableName,
        class: policy.class,
        prunedCount,
        durationMs,
        dryRun,
        rolledUp,
      });

      console.log(
        `[DataRetentionJob] ${policy.tableName} (${policy.class}): ${dryRun ? "found" : "pruned"} ${prunedCount} rows in ${durationMs}ms`,
      );
    } catch (err: any) {
      console.error(
        `[DataRetentionJob] Error processing retention policy for ${policy.tableName}:`,
        err.message || err,
      );
    }
  }

  const durationMs = Math.round(performance.now() - startTime);
  console.log(
    `[DataRetentionJob] Completed. Total rows ${dryRun ? "eligible" : "pruned"}: ${totalPruned} across ${results.length} policies in ${durationMs}ms.`,
  );

  return {
    dryRun,
    totalPruned,
    results,
    durationMs,
  };
}
