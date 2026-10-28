/**
 * Running capture in production (decision 0032): the breaker that stops recording a bank on its own when its
 * recordings are taken back, the admin's bulk undo of what one bank's messages recorded in a period, and the numbers
 * the console shows per bank and kind. Every count comes from `capture_events` (which keeps the bank and the reader
 * version after the signals are gone) and `capture_ai_jobs`; signals the server ignored are not stored, so they are
 * not counted here.
 */
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { captureAiJobs, captureEvents, systemSettings } from "../../../db/schema";
import { getDb } from "../../queries/connection";
import { deleteLedgerEntry } from "../../services/ledger-writer";
import { createLogger } from "../log";
import { getSystemSettings, invalidateSettingsCache } from "../settings-cache";
import { autoPolicyOf, releaseQuota } from "./intake";

const log = createLogger("capture-operations");

/** Payments a bank recorded on its own in a day before its undo rate means anything. */
export const BREAKER_MIN_AUTO = 20;
/** More than this share of them taken back (undone or deleted from the ledger) stops the bank. */
export const BREAKER_MAX_UNDONE = 0.05;
const DAY_MS = 24 * 3600 * 1000;

export interface SourceAutoStats {
  sourceSlug: string;
  auto: number;
  undone: number;
}

/** The banks whose recordings on their own were taken back too often to keep recording them without a question. */
export function breakerTrips(stats: SourceAutoStats[]): string[] {
  return stats.filter((row) => row.auto >= BREAKER_MIN_AUTO && row.undone / row.auto > BREAKER_MAX_UNDONE).map((row) => row.sourceSlug);
}

async function autoStatsSince(since: Date): Promise<SourceAutoStats[]> {
  const rows = await getDb()
    .select({
      sourceSlug: captureEvents.sourceSlug,
      auto: count(),
      undone: sql<number>`SUM(CASE WHEN ${captureEvents.status} <> 'recorded' THEN 1 ELSE 0 END)`,
    })
    .from(captureEvents)
    .where(and(eq(captureEvents.autoRecorded, true), gte(captureEvents.createdAt, since), isNotNull(captureEvents.sourceSlug)))
    .groupBy(captureEvents.sourceSlug);
  return rows.map((row) => ({ sourceSlug: row.sourceSlug!, auto: Number(row.auto), undone: Number(row.undone ?? 0) }));
}

/**
 * Adds every bank that tripped in the last 24 hours to `capture_paused_sources`: its payments are asked about again.
 * The admin takes a bank out of the list once its messages are read right again. Returns the banks it added.
 */
export async function runCaptureBreaker(now = new Date()): Promise<string[]> {
  const paused = autoPolicyOf(await getSystemSettings()).paused;
  const trips = breakerTrips(await autoStatsSince(new Date(now.getTime() - DAY_MS))).filter((slug) => !paused.has(slug));
  if (trips.length === 0) return [];
  const value = [...paused, ...trips].join(",");
  await getDb().insert(systemSettings).values({ key: "capture_paused_sources", value }).onDuplicateKeyUpdate({ set: { value } });
  invalidateSettingsCache();
  log.warn({ event: "capture.breaker.tripped", sources: trips }, "Capture stopped recording these banks on their own");
  return trips;
}

export interface BulkUndoInput {
  sourceSlug: string;
  /** Only what this reader or model prompt version read ("reader-v1", "model:sms-v2"); all versions when absent. */
  readerVersion?: string;
  from: Date;
  to: Date;
  /** Only payments recorded without a question (the default); otherwise also the ones users confirmed. */
  onlyAuto: boolean;
}

/** Most rows one bulk undo removes; a larger mistake is undone in several runs. */
export const BULK_UNDO_MAX = 500;

function bulkUndoWhere(input: BulkUndoInput) {
  return and(
    eq(captureEvents.sourceSlug, input.sourceSlug),
    eq(captureEvents.status, "recorded"),
    isNotNull(captureEvents.expenseId),
    gte(captureEvents.createdAt, input.from),
    lte(captureEvents.createdAt, input.to),
    input.onlyAuto ? eq(captureEvents.autoRecorded, true) : undefined,
    input.readerVersion ? eq(captureEvents.readerVersion, input.readerVersion) : undefined,
  );
}

/** How many ledger rows a bulk undo would remove, and how many users they belong to. */
export async function previewBulkUndo(input: BulkUndoInput): Promise<{ rows: number; users: number }> {
  const [row] = await getDb()
    .select({ rows: count(), users: sql<number>`COUNT(DISTINCT ${captureEvents.userType}, ${captureEvents.userId})` })
    .from(captureEvents)
    .where(bulkUndoWhere(input));
  return { rows: Number(row?.rows ?? 0), users: Number(row?.users ?? 0) };
}

/**
 * Removes the ledger rows the matching payments wrote, each through the ledger writer (its rollups, settlements and
 * caches), leaves each payment as a tombstone so a late signal does not bring it back, and gives the month's count
 * back. Returns how many rows were removed.
 */
export async function applyBulkUndo(input: BulkUndoInput): Promise<number> {
  const events = await getDb()
    .select({ id: captureEvents.id, userId: captureEvents.userId, userType: captureEvents.userType, expenseId: captureEvents.expenseId, quotaPeriod: captureEvents.quotaPeriod })
    .from(captureEvents)
    .where(bulkUndoWhere(input))
    .orderBy(desc(captureEvents.id))
    .limit(BULK_UNDO_MAX);
  let removed = 0;
  for (const event of events) {
    const owner = { userId: event.userId, userType: event.userType };
    try {
      // The writer marks the event deleted in the same transaction.
      await deleteLedgerEntry(owner, event.expenseId!);
    } catch (err) {
      // The user deleted the row meanwhile: nothing left to undo.
      if ((err as { code?: string }).code !== "NOT_FOUND") throw err;
      continue;
    }
    if (event.quotaPeriod) await getDb().transaction((tx) => releaseQuota(tx, owner, event.quotaPeriod!));
    removed++;
  }
  log.warn({ event: "capture.bulk_undo", sourceSlug: input.sourceSlug, readerVersion: input.readerVersion ?? null, removed }, "Captured rows undone in bulk");
  return removed;
}

export interface FunnelRow {
  sourceSlug: string | null;
  kind: string;
  /** Payments by what became of them. */
  review: number;
  held: number;
  recorded: number;
  dismissed: number;
  deleted: number;
  /** Recorded without a question, and of those, taken back. */
  auto: number;
  autoUndone: number;
}

/** What became of the payments captured in the last `days` days, per bank and kind, and what the model's queue did. */
export async function captureFunnel(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const statusCount = (status: string) => sql<number>`SUM(CASE WHEN ${captureEvents.status} = ${status} THEN 1 ELSE 0 END)`;
  const rows = await getDb()
    .select({
      sourceSlug: captureEvents.sourceSlug,
      kind: captureEvents.kind,
      review: statusCount("review"),
      held: statusCount("held"),
      recorded: statusCount("recorded"),
      dismissed: statusCount("dismissed"),
      deleted: statusCount("deleted"),
      auto: sql<number>`SUM(CASE WHEN ${captureEvents.autoRecorded} THEN 1 ELSE 0 END)`,
      autoUndone: sql<number>`SUM(CASE WHEN ${captureEvents.autoRecorded} AND ${captureEvents.status} <> 'recorded' THEN 1 ELSE 0 END)`,
    })
    .from(captureEvents)
    .where(gte(captureEvents.createdAt, since))
    .groupBy(captureEvents.sourceSlug, captureEvents.kind);
  const model = await getDb()
    .select({ status: captureAiJobs.status, outcome: captureAiJobs.outcome, jobs: count() })
    .from(captureAiJobs)
    .where(gte(captureAiJobs.createdAt, since))
    .groupBy(captureAiJobs.status, captureAiJobs.outcome);
  const [oldest] = await getDb()
    .select({ at: sql<Date | null>`MIN(${captureAiJobs.createdAt})` })
    .from(captureAiJobs)
    .where(inArray(captureAiJobs.status, ["queued", "running"]));
  const number = (value: unknown) => Number(value ?? 0);
  return {
    days,
    rows: rows
      .map(
        (row): FunnelRow => ({
          sourceSlug: row.sourceSlug,
          kind: row.kind,
          review: number(row.review),
          held: number(row.held),
          recorded: number(row.recorded),
          dismissed: number(row.dismissed),
          deleted: number(row.deleted),
          auto: number(row.auto),
          autoUndone: number(row.autoUndone),
        }),
      )
      .sort((a, b) => (a.sourceSlug ?? "").localeCompare(b.sourceSlug ?? "") || a.kind.localeCompare(b.kind)),
    model: model.map((row) => ({ status: row.status, outcome: row.outcome, jobs: number(row.jobs) })),
    /** The oldest job still waiting for the model: a queue that stopped shows here first. */
    oldestWaitingAt: oldest?.at ? new Date(oldest.at) : null,
    paused: [...autoPolicyOf(await getSystemSettings()).paused],
  };
}
