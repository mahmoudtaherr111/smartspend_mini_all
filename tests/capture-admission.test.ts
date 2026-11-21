import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { captureAiAccounts, captureAiDays, captureAiReservations, localUsers, users } from "../db/schema";
import { getDb, mysqlPool } from "../api/queries/connection";
import { reserveCaptureCall, settleCaptureCall, type CaptureAdmissionRequest } from "../api/lib/capture/admission";

const NOW = new Date("2044-04-03T12:00:00Z");
const DAY = "2044-04-03";
const ids = [900001, 900002];
const request: CaptureAdmissionRequest = { userId: ids[0], userType: "local", tokens: 100, costUsd: 0.1, dailyCapUsd: 10, monthlyTokens: 10000, concurrency: 64 };
describe.runIf(process.env.RUN_DB_INTEGRATION === "1")("capture admission against MySQL", () => {
  async function clear() {
    await getDb().delete(captureAiReservations).where(inArray(captureAiReservations.userId, ids));
    await getDb().delete(captureAiAccounts).where(inArray(captureAiAccounts.userId, ids));
    await getDb().delete(captureAiDays).where(eq(captureAiDays.day, DAY));
    await getDb().delete(localUsers).where(inArray(localUsers.id, ids));
    await getDb().delete(users).where(inArray(users.id, ids));
  }
  beforeEach(async () => {
    await clear();
    await getDb().insert(localUsers).values({ id: ids[0], name: "Synthetic", phone: "01000000001", password: "synthetic-only" });
    await getDb().insert(users).values({ id: ids[0], name: "Synthetic", unionId: "synthetic-capture-admission" });
  });
  afterAll(async () => { await clear(); await mysqlPool.end(); });
  it("admits only one concurrent request when two would exceed the global daily budget", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => reserveCaptureCall({ ...request, costUsd: 0.6, dailyCapUsd: 1 }, NOW)));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).every((result) => !result.ok && result.reason === "daily_cap")).toBe(true);
  });
  it("shares capacity across independent callers and frees it on settlement", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => reserveCaptureCall({ ...request, concurrency: 2 }, NOW)));
    const allowed = results.filter((row) => row.ok);
    expect(allowed).toHaveLength(2);
    if (allowed[0].ok) await settleCaptureCall(allowed[0].reservation, { tokens: 60, costUsd: 0.03 });
    expect((await reserveCaptureCall({ ...request, concurrency: 2 }, NOW)).ok).toBe(true);
  });
  it("enforces a monthly token budget atomically", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveCaptureCall({ ...request, monthlyTokens: 150 }, NOW)));
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    expect(results.filter((row) => !row.ok).every((row) => !row.ok && row.reason === "monthly_budget")).toBe(true);
  });
  it("isolates OAuth and local accounts sharing the same numeric ID", async () => {
    const local = await reserveCaptureCall({ ...request, monthlyTokens: 100 }, NOW);
    const oauth = await reserveCaptureCall({ ...request, userType: "oauth", monthlyTokens: 100 }, NOW);
    expect(local.ok && oauth.ok).toBe(true);
    if (!local.ok) throw new Error("fixture");
    await settleCaptureCall({ ...local.reservation, userType: "oauth" }, { tokens: 0, costUsd: 0 });
    const rows = await getDb().select().from(captureAiAccounts).where(eq(captureAiAccounts.userId, ids[0]));
    expect(rows.map((row) => row.tokens)).toEqual([100, 100]);
  });
  it("settles once even with duplicate callbacks", async () => {
    const result = await reserveCaptureCall(request, NOW); if (!result.ok) throw new Error("fixture");
    await Promise.all(Array.from({ length: 4 }, () => settleCaptureCall(result.reservation, { tokens: 30, costUsd: 0.02 })));
    const [day] = await getDb().select().from(captureAiDays).where(eq(captureAiDays.day, DAY));
    const [user] = await getDb().select().from(captureAiAccounts).where(and(eq(captureAiAccounts.userId, ids[0]), eq(captureAiAccounts.userType, "local")));
    expect(Number(day.costUsd)).toBe(0.02); expect(user.tokens).toBe(30);
  });
  it("retains uncertain charges and releases expired capacity without releasing the money", async () => {
    const first = await reserveCaptureCall({ ...request, concurrency: 1, costUsd: 0.6, dailyCapUsd: 1 }, NOW);
    if (!first.ok) throw new Error("fixture");
    expect(await reserveCaptureCall({ ...request, concurrency: 1 }, NOW)).toEqual({ ok: false, reason: "capacity" });
    expect(await reserveCaptureCall({ ...request, costUsd: 0.6, dailyCapUsd: 1 }, new Date(NOW.getTime() + 61_000))).toEqual({ ok: false, reason: "daily_cap" });
    await settleCaptureCall(first.reservation, null);
    expect(await reserveCaptureCall({ ...request, costUsd: 0.6, dailyCapUsd: 1 }, NOW)).toEqual({ ok: false, reason: "daily_cap" });
  });
  it("does not recreate budget rows after account deletion", async () => {
    await getDb().delete(localUsers).where(eq(localUsers.id, ids[0]));
    expect(await reserveCaptureCall(request, NOW)).toEqual({ ok: false, reason: "gone" });
    const rows = await getDb().select().from(captureAiAccounts).where(eq(captureAiAccounts.userId, ids[0]));
    expect(rows).toHaveLength(0);
  });
});
