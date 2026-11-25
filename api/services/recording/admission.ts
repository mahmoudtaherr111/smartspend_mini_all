import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { classificationLogs, localUsers, recordingRequests, users } from "../../../db/schema";
import { asPlan, parseSafeInt, resolvePlanTokenLimit } from "../../lib/ai-usage-policy";
import { businessDateKey, businessDayRange } from "../../lib/app-time";
import { getDb } from "../../queries/connection";
import type { ParseResponse } from "./types";

type Owner = { id: number; type: "oauth" | "local"; plan?: string };
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type RequestRow = typeof recordingRequests.$inferSelect;
export const RECORDING_UNAVAILABLE = "مش قادرين نقرا التسجيل دلوقتي. جرّب كمان شوية.";
const LEASE_MS = 10 * 60_000;

export type RecordingLease = { owner: Owner; id: number; attempt: number };

const ownerScope = (owner: Owner) => and(eq(recordingRequests.userId, owner.id), eq(recordingRequests.userType, owner.type));

export function recordingKey(channel: string, requestId?: string) {
  return createHash("sha256").update(channel).update("\0").update(requestId ?? randomUUID()).digest("hex");
}

export function recordingLimits(settings: Record<string, string>, owner: Owner) {
  const plan = asPlan(owner.plan);
  const daily = { free: 10, pro: 100, ultra: 500 }[plan];
  const override = parseSafeInt(settings[`user_token_limit_${owner.type}_${owner.id}`], -1);
  return {
    daily: parseSafeInt(settings[`${plan}_daily_limit`], daily) || 10,
    monthly: parseSafeInt(settings[`recording_monthly_request_limit_${plan}`], daily * 30),
    tokens: override >= 0 ? override : parseSafeInt(settings[`recording_monthly_token_limit_${plan}`], resolvePlanTokenLimit(settings, plan)),
  };
}

async function lockOwner(tx: Tx, owner: Owner) {
  const table = owner.type === "oauth" ? users : localUsers;
  const [account] = await tx.select({ id: table.id }).from(table).where(eq(table.id, owner.id)).for("update");
  if (!account) throw new TRPCError({ code: "UNAUTHORIZED", message: "الجلسة خلصت. سجّل دخولك تاني." });
}

async function monthUsage(db: Tx | ReturnType<typeof getDb>, owner: Owner, month: string, day: string) {
  const [row] = await db.select({
    requests: sql<number>`COUNT(*)`,
    daily: sql<number>`COALESCE(SUM(${recordingRequests.day} = ${day}), 0)`,
    chargedTokens: sql<number>`COALESCE(SUM(${recordingRequests.chargedTokens}), 0)`,
    reservedTokens: sql<number>`COALESCE(SUM(${recordingRequests.reservedTokens}), 0)`,
  }).from(recordingRequests).where(and(ownerScope(owner), eq(recordingRequests.month, month)));
  return {
    requests: Number(row?.requests ?? 0),
    daily: Number(row?.daily ?? 0),
    chargedTokens: Number(row?.chargedTokens ?? 0),
    reservedTokens: Number(row?.reservedTokens ?? 0),
  };
}

export async function getRecordingUsage(owner: Owner, now = new Date()) {
  const day = businessDateKey(now);
  return monthUsage(getDb(), owner, day.slice(0, 7), day);
}

async function requestsWithoutReservation(tx: Tx, owner: Owner, now: Date) {
  const { start, endExclusive } = businessDayRange(now);
  const [row] = await tx.select({ count: sql<number>`COUNT(*)` }).from(classificationLogs).where(and(
    eq(classificationLogs.userId, owner.id), eq(classificationLogs.userType, owner.type),
    gte(classificationLogs.createdAt, start), lt(classificationLogs.createdAt, endExclusive),
    sql`JSON_EXTRACT(${classificationLogs.reasoningTraceLight}, '$.recordingRequestId') IS NULL`,
    sql`NOT EXISTS (SELECT 1 FROM recording_requests r WHERE r.user_id = ${classificationLogs.userId}
      AND r.user_type = ${classificationLogs.userType} AND r.classification_log_id = ${classificationLogs.id})`,
  ));
  return Number(row?.count ?? 0);
}

export function assertRecordingTokens(limit: number, remaining: number, required: number) {
  if (limit > 0 && remaining >= required) return;
  throw new TRPCError({ code: "FORBIDDEN", message: limit === 0
    ? "التسجيل الذكي مش متاح في باقتك دلوقتي."
    : "وصلت لحد استخدام التسجيل الذكي الشهر ده. الحد بيتجدد أول الشهر الجاي." });
}

async function replayResponse(tx: Tx | ReturnType<typeof getDb>, row: RequestRow, fallbackText: string): Promise<ParseResponse> {
  let text = fallbackText;
  if (row.classificationLogId !== null) {
    const [log] = await tx.select({ text: classificationLogs.originalText }).from(classificationLogs)
      .where(and(eq(classificationLogs.id, row.classificationLogId), eq(classificationLogs.userId, row.userId), eq(classificationLogs.userType, row.userType)));
    text = log?.text ?? fallbackText;
  }
  return { ...(row.reply as Omit<ParseResponse, "text">), text };
}

export async function getRecordingReply(owner: Owner, key: string, fallbackText = "") {
  const db = getDb();
  const [row] = await db.select().from(recordingRequests).where(and(ownerScope(owner),
    eq(recordingRequests.requestKey, key), eq(recordingRequests.status, "done"))).limit(1);
  return row ? replayResponse(db, row, fallbackText) : null;
}

type TokenPlan<T> = (remaining: number) => { reservedTokens: number; plan: T };

export async function reserveRecording<T>(owner: Owner, key: string, settings: Record<string, string>, planTokens: TokenPlan<T>, now = new Date(), fallbackText = "") {
  const limits = recordingLimits(settings, owner);
  const day = businessDateKey(now);
  return getDb().transaction(async tx => {
    await lockOwner(tx, owner);
    const [existing] = await tx.select().from(recordingRequests)
      .where(and(ownerScope(owner), eq(recordingRequests.requestKey, key)));
    if (existing?.status === "done") {
      return { reply: await replayResponse(tx, existing, fallbackText) } as const;
    }
    if (existing?.status === "pending" && existing.leaseUntil > now) {
      throw new TRPCError({ code: "CONFLICT", message: "لسه بنقرا التسجيل. جرّب كمان شوية." });
    }
    if (existing && existing.attempt >= 2) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: RECORDING_UNAVAILABLE });
    }

    const month = existing?.month ?? day.slice(0, 7);
    const usage = await monthUsage(tx, owner, month, day);
    if (!existing) {
      const dailyUsage = usage.daily + await requestsWithoutReservation(tx, owner, now);
      if (dailyUsage >= limits.daily) {
        throw new TRPCError({ code: "FORBIDDEN", message: `وصلت لحد التسجيلات الذكية بتاعة النهارده (${limits.daily}). الحد بيتجدد بكرة.` });
      }
      if (limits.monthly > 0 && usage.requests >= limits.monthly) {
        throw new TRPCError({ code: "FORBIDDEN", message: `وصلت لحد التسجيلات الذكية الشهر ده (${limits.monthly}). الحد بيتجدد أول الشهر الجاي.` });
      }
    }
    const remaining = limits.tokens - usage.chargedTokens - usage.reservedTokens;
    assertRecordingTokens(limits.tokens, remaining, 0);
    const { reservedTokens, plan } = planTokens(remaining);
    assertRecordingTokens(limits.tokens, remaining, reservedTokens);
    const leaseUntil = new Date(now.getTime() + LEASE_MS);

    if (existing) {
      const attempt = existing.attempt + 1;
      // An expired provider call may still have been billed. Keep its full estimate.
      await tx.update(recordingRequests).set({
        status: "pending", attempt, leaseUntil, reservedTokens,
        chargedTokens: existing.chargedTokens + existing.reservedTokens,
      }).where(and(ownerScope(owner), eq(recordingRequests.id, existing.id)));
      return { lease: { owner, id: existing.id, attempt }, plan } as const;
    }
    const [insert] = await tx.insert(recordingRequests).values({
      userId: owner.id, userType: owner.type, requestKey: key,
      day, month, status: "pending", reservedTokens, leaseUntil,
    });
    return { lease: { owner, id: Number(insert.insertId), attempt: 1 }, plan } as const;
  });
}

const leaseScope = (lease: RecordingLease) => and(ownerScope(lease.owner), eq(recordingRequests.id, lease.id),
  eq(recordingRequests.attempt, lease.attempt), eq(recordingRequests.status, "pending"));

/** Settle speech and reserve the next provider stage without giving another request its balance. */
export async function advanceRecording<T>(lease: RecordingLease, settings: Record<string, string>, stageTokens: number, planTokens: TokenPlan<T>) {
  return getDb().transaction(async tx => {
    await lockOwner(tx, lease.owner);
    const [row] = await tx.select().from(recordingRequests).where(leaseScope(lease));
    if (!row) throw new TRPCError({ code: "CONFLICT", message: RECORDING_UNAVAILABLE });
    const limits = recordingLimits(settings, lease.owner);
    const usage = await monthUsage(tx, lease.owner, row.month, row.day);
    const remaining = limits.tokens - usage.chargedTokens - usage.reservedTokens + row.reservedTokens - stageTokens;
    assertRecordingTokens(limits.tokens, remaining, 0);
    const { reservedTokens, plan } = planTokens(remaining);
    assertRecordingTokens(limits.tokens, remaining, reservedTokens);
    await tx.update(recordingRequests)
      .set({ reservedTokens, chargedTokens: row.chargedTokens + stageTokens }).where(leaseScope(lease));
    return plan;
  });
}

export async function settleRecording(lease: RecordingLease, tokens: number | null, response?: ParseResponse) {
  // `null` means the provider may still bill the reserved estimate after an uncertain failure.
  const reply = response ? { ...response, text: undefined } : null;
  await getDb().transaction(async tx => {
    await lockOwner(tx, lease.owner);
    await tx.update(recordingRequests).set({
      status: response ? "done" : "failed", reservedTokens: 0,
      chargedTokens: sql`${recordingRequests.chargedTokens} + ${tokens === null ? recordingRequests.reservedTokens : tokens}`,
      classificationLogId: response?.classificationLogId, reply,
    }).where(leaseScope(lease));
  });
}
