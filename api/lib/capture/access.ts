/**
 * Who may use capture and how much (decision 0033): the admin's switch with the platforms and the closed-beta list,
 * the oldest phone build that may still send, the phones per plan, and the signals a user's phones may send a day.
 */
import { and, eq, sql } from "drizzle-orm";
import { captureUsage } from "../../../db/schema";
import { getDb } from "../../queries/connection";
import { businessDateKey, businessDayRange } from "../app-time";
import { capturePeriod } from "./intake";
import type { CaptureOwner } from "./devices";

const list = (value: string | undefined) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

/**
 * Whether capture is open to this user (and this platform when known): the switch is on, the platform is listed, and
 * when the beta list is not empty the user is on it.
 */
export function captureOpenFor(settings: Record<string, string | undefined>, owner: CaptureOwner, platform?: string | null): boolean {
  if (settings.capture_enabled !== "true") return false;
  if (platform && !list(settings.capture_platforms ?? "android,ios").has(platform)) return false;
  const beta = list(settings.capture_beta_users);
  return beta.size === 0 || beta.has(`${owner.userType}:${owner.userId}`.toLowerCase());
}

/** Whether a build ("1.2.0", "1.2.0+45") is older than the oldest one allowed. A version that does not parse is not. */
export function olderThan(version: string, minimum: string): boolean {
  const parts = (value: string) => value.split("+")[0].split(".").map((part) => Number.parseInt(part, 10));
  const have = parts(version);
  const need = parts(minimum);
  if (have.some(Number.isNaN) || need.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(have.length, need.length); i++) {
    const a = have[i] ?? 0;
    const b = need[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}

/**
 * Counts `count` signals against the user's Cairo day, unless that would pass `limit` (0 means no limit). Returns
 * true when they fit; the count does not move when they do not.
 */
export async function takeDailySignals(owner: CaptureOwner, count: number, limit: number, now = new Date()): Promise<boolean> {
  if (limit <= 0) return true;
  if (count > limit) return false;
  const day = businessDateKey(now);
  const period = capturePeriod(now);
  const db = getDb();
  await db.insert(captureUsage).ignore().values({ userId: owner.userId, userType: owner.userType, period });
  const [result] = await db
    .update(captureUsage)
    .set({
      signals: sql`CASE WHEN ${captureUsage.signalDay} = ${day} THEN ${captureUsage.signals} + ${count} ELSE ${count} END`,
      signalDay: day,
    })
    .where(
      and(
        eq(captureUsage.userId, owner.userId),
        eq(captureUsage.userType, owner.userType),
        eq(captureUsage.period, period),
        sql`(${captureUsage.signalDay} IS NULL OR ${captureUsage.signalDay} <> ${day} OR ${captureUsage.signals} + ${count} <= ${limit})`,
      ),
    );
  // A single-row update: one row changed means the signals fit.
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

/** Seconds until the next Cairo midnight, for `Retry-After` once the day's signals are used. */
export function secondsToNextBusinessDay(now = new Date()): number {
  return Math.max(60, Math.ceil((businessDayRange(now).endExclusive.getTime() - now.getTime()) / 1000));
}
