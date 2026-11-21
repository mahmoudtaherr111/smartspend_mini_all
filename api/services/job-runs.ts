/**
 * What the background jobs did: each run that took its lock is written to `scheduled_job_runs` (start, duration, and on
 * failure the error's class, never its message, which can carry a query's values), and the console reads the last day.
 *
 * Writing a run must never break the job: before the table's migration is applied, or with the database briefly gone,
 * the write fails quietly and is reported once per process.
 */
import os from "node:os";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { scheduledJobRuns } from "../../db/schema";
import { createLogger } from "../lib/log";
import { db } from "../queries/connection";

const log = createLogger("job-runs");
const HOST = os.hostname().slice(0, 120);
const schedules = new Map<string, string>();
let warned = false;

/** Called by `scheduleProtectedJob` on every process, crons on or off, so any process can say what should run. */
export function registerJobSchedule(jobName: string, expression: string): void {
  schedules.set(jobName, expression);
}

/** The error's class: a name or a driver code, never the message. */
export function errorClass(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  const name = (error as { name?: unknown })?.name;
  return String(typeof code === "string" && code ? code : typeof name === "string" && name ? name : "Error").slice(0, 120);
}

export async function recordJobRun(run: { jobName: string; startedAt: Date; durationMs: number; error?: unknown }): Promise<void> {
  try {
    await db.insert(scheduledJobRuns).values({
      jobName: run.jobName.slice(0, 80),
      startedAt: run.startedAt,
      durationMs: Math.max(0, Math.round(run.durationMs)),
      status: run.error === undefined ? "ok" : "failed",
      errorName: run.error === undefined ? null : errorClass(run.error),
      host: HOST,
    });
  } catch (error) {
    if (!warned) {
      warned = true;
      log.warn({ event: "job_runs.write_failed", job: run.jobName, err: error }, "A job run could not be recorded (is the migration applied?)");
    }
  }
}

/**
 * Minutes between two runs of a cron expression, for the patterns this server uses: every N minutes, daily, weekly and
 * monthly. Null for anything else, so the console does not guess.
 */
export function cronIntervalMinutes(expression: string): number | null {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/);
  if (month !== "*") return null;
  if (minute === "*" && hour === "*") return 1;
  const every = /^\*\/(\d+)$/.exec(minute ?? "");
  if (every && hour === "*" && dayOfMonth === "*" && dayOfWeek === "*") return Number(every[1]);
  if (!/^\d+$/.test(minute ?? "") || !/^\d+$/.test(hour ?? "")) return null;
  if (dayOfMonth === "*" && dayOfWeek === "*") return 24 * 60;
  if (dayOfMonth === "*" && /^\d$/.test(dayOfWeek ?? "")) return 7 * 24 * 60;
  if (/^\d+$/.test(dayOfMonth ?? "") && dayOfWeek === "*") return 31 * 24 * 60;
  return null;
}

export interface JobOverview {
  jobName: string;
  schedule: string | null;
  intervalMinutes: number | null;
  lastStartedAt: Date | null;
  lastStatus: string | null;
  lastErrorName: string | null;
  lastDurationMs: number | null;
  lastOkAt: Date | null;
  runs24h: number;
  failures24h: number;
  /** No successful run for more than twice the interval (at least an hour), counted from when recording began. */
  late: boolean;
}

/** Every scheduled job and every job that ran in the last 14 days, with its last run and its last day. */
export async function loadJobOverview(now = new Date()): Promise<{ jobs: JobOverview[]; recorded: boolean }> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let stats: Array<{ jobName: string; runs: number; failures: number }> = [];
  let latest: Array<{ jobName: string; startedAt: Date; status: string; errorName: string | null; durationMs: number }> = [];
  let lastOk: Array<{ jobName: string; at: Date | null }> = [];
  let first: Array<{ at: Date | null }> = [];
  try {
    [stats, latest, lastOk, first] = await Promise.all([
      db
        .select({
          jobName: scheduledJobRuns.jobName,
          runs: sql<number>`COUNT(*)`,
          failures: sql<number>`SUM(CASE WHEN ${scheduledJobRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
        })
        .from(scheduledJobRuns)
        .where(gte(scheduledJobRuns.startedAt, since))
        .groupBy(scheduledJobRuns.jobName),
      db
        .select({ jobName: scheduledJobRuns.jobName, startedAt: scheduledJobRuns.startedAt, status: scheduledJobRuns.status, errorName: scheduledJobRuns.errorName, durationMs: scheduledJobRuns.durationMs })
        .from(scheduledJobRuns)
        .where(sql`${scheduledJobRuns.id} IN (SELECT MAX(id) FROM scheduled_job_runs GROUP BY job_name)`)
        .orderBy(desc(scheduledJobRuns.startedAt)),
      db
        .select({ jobName: scheduledJobRuns.jobName, at: sql<Date | null>`MAX(${scheduledJobRuns.startedAt})` })
        .from(scheduledJobRuns)
        .where(and(eq(scheduledJobRuns.status, "ok")))
        .groupBy(scheduledJobRuns.jobName),
      db.select({ at: sql<Date | null>`MIN(${scheduledJobRuns.startedAt})` }).from(scheduledJobRuns),
    ]);
  } catch {
    return { jobs: [...schedules].map(([jobName, schedule]) => emptyJob(jobName, schedule)), recorded: false };
  }

  // A job is late only when recording has been on long enough to have seen it run: right after this table appears, a
  // monthly job has simply not come round yet.
  const recordingSince = first[0]?.at ? new Date(first[0].at).getTime() : now.getTime();
  const names = new Set([...schedules.keys(), ...latest.map((row) => row.jobName)]);
  const jobs = [...names].sort().map((jobName): JobOverview => {
    const schedule = schedules.get(jobName) ?? null;
    const intervalMinutes = schedule ? cronIntervalMinutes(schedule) : null;
    const last = latest.find((row) => row.jobName === jobName);
    const ok = lastOk.find((row) => row.jobName === jobName)?.at ?? null;
    const okAt = ok ? new Date(ok) : null;
    const counts = stats.find((row) => row.jobName === jobName);
    const allowedGap = intervalMinutes === null ? null : Math.max(intervalMinutes * 2, 60) * 60_000;
    return {
      jobName,
      schedule,
      intervalMinutes,
      lastStartedAt: last ? new Date(last.startedAt) : null,
      lastStatus: last?.status ?? null,
      lastErrorName: last?.errorName ?? null,
      lastDurationMs: last?.durationMs ?? null,
      lastOkAt: okAt,
      runs24h: Number(counts?.runs ?? 0),
      failures24h: Number(counts?.failures ?? 0),
      late: allowedGap !== null && schedule !== null && now.getTime() - Math.max(okAt?.getTime() ?? 0, recordingSince) > allowedGap,
    };
  });
  return { jobs, recorded: true };
}

function emptyJob(jobName: string, schedule: string): JobOverview {
  return { jobName, schedule, intervalMinutes: cronIntervalMinutes(schedule), lastStartedAt: null, lastStatus: null, lastErrorName: null, lastDurationMs: null, lastOkAt: null, runs24h: 0, failures24h: 0, late: false };
}
