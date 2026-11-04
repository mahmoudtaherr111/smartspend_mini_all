/** Capture-only budget and capacity reservations, serialized across replicas by a short MySQL row lock. */
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { captureAiAccounts, captureAiDays, captureAiReservations, localUsers, users } from "../../../db/schema";
import { getDb } from "../../queries/connection";
import { businessDateKey } from "../app-time";

const requestSchema = z.strictObject({
  userId: z.number().int().positive(), userType: z.enum(["oauth", "local"]),
  tokens: z.number().int().min(1).max(12000), costUsd: z.number().positive().max(100),
  dailyCapUsd: z.number().positive().max(100000), monthlyTokens: z.number().int().min(0).max(2_000_000_000),
  concurrency: z.number().int().min(1).max(1000),
});
export type CaptureAdmissionRequest = z.infer<typeof requestSchema>;
export type CaptureReservation = { id: string; userId: number; userType: "oauth" | "local" };
export type CaptureAdmission = { ok: true; reservation: CaptureReservation } | { ok: false; reason: "capacity" | "daily_cap" | "monthly_budget" | "gone" };

/** No provider or external I/O is permitted inside this transaction. Pending/expired calls retain their cost. */
export async function reserveCaptureCall(input: CaptureAdmissionRequest, now = new Date()): Promise<CaptureAdmission> {
  const request = requestSchema.parse(input);
  const day = businessDateKey(now), period = day.slice(0, 7);
  const cost = new Decimal(request.costUsd).toDecimalPlaces(8, Decimal.ROUND_CEIL);
  return getDb().transaction(async (tx) => {
    const userTable = request.userType === "oauth" ? users : localUsers;
    const [alive] = await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, request.userId)).for("update");
    if (!alive) return { ok: false, reason: "gone" } as const;
    // Every reservation and settlement locks the same day's row first, then the user's period, then the reservation.
    await tx.insert(captureAiDays).values({ day }).onDuplicateKeyUpdate({ set: { day } });
    const [daily] = await tx.select().from(captureAiDays).where(eq(captureAiDays.day, day)).for("update");
    const [{ active }] = await tx.select({ active: count() }).from(captureAiReservations)
      .where(and(eq(captureAiReservations.status, "reserved"), gt(captureAiReservations.leaseUntil, now)));
    if (active >= request.concurrency) return { ok: false, reason: "capacity" } as const;
    if (new Decimal(daily.costUsd).plus(cost).gt(request.dailyCapUsd)) return { ok: false, reason: "daily_cap" } as const;
    const mine = and(eq(captureAiAccounts.userId, request.userId), eq(captureAiAccounts.userType, request.userType), eq(captureAiAccounts.period, period));
    await tx.insert(captureAiAccounts).values({ userId: request.userId, userType: request.userType, period }).onDuplicateKeyUpdate({ set: { period } });
    const [account] = await tx.select().from(captureAiAccounts).where(mine).for("update");
    if (request.monthlyTokens > 0 && account.tokens + request.tokens > request.monthlyTokens) return { ok: false, reason: "monthly_budget" } as const;
    const reservation = { id: randomUUID(), userId: request.userId, userType: request.userType };
    await tx.insert(captureAiReservations).values({ ...reservation, day, period, tokens: request.tokens, costUsd: cost.toFixed(8), leaseUntil: new Date(now.getTime() + 60_000) });
    await tx.update(captureAiDays).set({ costUsd: new Decimal(daily.costUsd).plus(cost).toFixed(8) }).where(eq(captureAiDays.day, day));
    await tx.update(captureAiAccounts).set({ tokens: account.tokens + request.tokens }).where(mine);
    return { ok: true, reservation } as const;
  });
}

/** Unknown usage consumes the reservation conservatively. Settling twice or as another owner changes nothing. */
export async function settleCaptureCall(reservation: CaptureReservation, actual: { tokens: number; costUsd: number } | null): Promise<void> {
  if (actual && (!Number.isInteger(actual.tokens) || actual.tokens < 0 || !Number.isFinite(actual.costUsd) || actual.costUsd < 0)) throw new Error("invalid_capture_usage");
  const scope = and(eq(captureAiReservations.id, reservation.id), eq(captureAiReservations.userId, reservation.userId), eq(captureAiReservations.userType, reservation.userType));
  const [seen] = await getDb().select().from(captureAiReservations).where(scope);
  if (!seen) return;
  await getDb().transaction(async (tx) => {
    const [daily] = await tx.select().from(captureAiDays).where(eq(captureAiDays.day, seen.day)).for("update");
    const mine = and(eq(captureAiAccounts.userId, reservation.userId), eq(captureAiAccounts.userType, reservation.userType), eq(captureAiAccounts.period, seen.period));
    const [account] = await tx.select().from(captureAiAccounts).where(mine).for("update");
    const [row] = await tx.select().from(captureAiReservations).where(scope).for("update");
    if (!daily || !account || !row || row.status !== "reserved") return;
    if (actual) {
      const cost = new Decimal(actual.costUsd).toDecimalPlaces(8, Decimal.ROUND_CEIL);
      await tx.update(captureAiDays).set({ costUsd: new Decimal(daily.costUsd).minus(row.costUsd).plus(cost).toFixed(8) }).where(eq(captureAiDays.day, row.day));
      await tx.update(captureAiAccounts).set({ tokens: account.tokens - row.tokens + actual.tokens }).where(mine);
      await tx.update(captureAiReservations).set({ tokens: actual.tokens, costUsd: cost.toFixed(8), status: "settled" }).where(scope);
    } else {
      await tx.update(captureAiReservations).set({ status: "uncertain" }).where(scope);
    }
  });
}
