/**
 * Local capacity check for automatic capture: many users' phones sending at a steady rate and in a burst, while
 * several workers drain the model queue (as several replicas would) against real MySQL. The model is a stub with a
 * provider-like delay, so this measures our intake, queue and ledger writes, never a provider. Opt-in and slow:
 *   RUN_DB_INTEGRATION=1 RUN_CAPTURE_LOAD=1 LOAD_SECONDS=60 LOAD_RATE=10 npx vitest run tests/capture-load.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../api/queries/connection";
import {
  captureAiJobs, captureConsents, captureDevices, captureEvents, captureMarkers, captureMemory, captureSignals, captureUsage,
  captureUserPairs, expenseDailyRollups, expenses, localUsers, systemSettings, userContacts, userWallets,
} from "../db/schema";
import { registerCaptureRoutes } from "../api/capture-v1-routes";
import { registerCaptureDevice } from "../api/lib/capture/devices";
import { setCaptureConsent, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION } from "../api/lib/capture/consent";
import { syncCaptureSeed } from "../api/lib/capture/catalog";
import { invalidateSettingsCache } from "../api/lib/settings-cache";
import { checkCaptureReply, proposeCapturePosting, type CaptureModelReply } from "../api/lib/capture/model-contract";
import { CAPTURE_PROMPT_DIGEST } from "../api/lib/capture/model-reader";
import { drainCaptureModel } from "../api/lib/capture/ai-queue";

const DELAY_MS = Number(process.env.LOAD_MODEL_MS ?? 800);
/** Share of model calls that fail as a provider outage would; the job is retried with backoff, never lost. */
const FAIL_RATE = Number(process.env.LOAD_FAIL_RATE ?? 0);
vi.mock("../api/lib/capture/model-reader", async (original) => ({
  ...(await original<typeof import("../api/lib/capture/model-reader")>()),
  readCaptureWithModel: vi.fn(async (text: { text: string }) => {
    const amount = /EGP (\d+)/.exec(text.text)?.[1] ?? "1";
    const reply: CaptureModelReply = {
      state: "done", stateQuote: "Successful purchase", type: "purchase", flow: "out", flowQuote: "Successful purchase",
      ownership: "unknown", ownershipQuote: null, amount: { value: Number(amount), currency: "EGP", quote: `purchase EGP ${amount}` },
      egp: null, fee: null, balance: null, limit: null, partyType: "merchant", party: "ZED MARKET", partyQuote: "at ZED MARKET",
      via: "card", category: "food", recurring: false,
    };
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS * (0.5 + Math.random())));
    if (Math.random() < FAIL_RATE) return { outcome: "failed" };
    const check = checkCaptureReply(reply, text.text);
    if (!check.ok) return { outcome: "invalid_reply" };
    return { outcome: "read", check, proposal: proposeCapturePosting(check), model: "synthetic-model", provider: "synthetic-a" };
  }),
}));

const USERS = Number(process.env.LOAD_USERS ?? 40);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 60);
const RATE = Number(process.env.LOAD_RATE ?? 10);
const BURST_RATE = Number(process.env.LOAD_BURST_RATE ?? 20);
const BURST_SECONDS = Number(process.env.LOAD_BURST_SECONDS ?? 10);
const WORKERS = Number(process.env.LOAD_WORKERS ?? 8);
const FIRST_ID = 89100;
const owners = Array.from({ length: USERS }, (_, i) => ({ userId: FIRST_ID + i, userType: "local" }));
const ids = owners.map((owner) => owner.userId);
const keys = ["capture_enabled", "capture_read_mode", "capture_financial_version", "capture_model_qualified", "capture_monthly_limit_free",
  "capture_daily_signal_limit", "capture_ai_concurrency"];
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0;
const p50 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

describe.runIf(process.env.RUN_DB_INTEGRATION === "1" && process.env.RUN_CAPTURE_LOAD === "1")("capture under load", () => {
  const app = new Hono();
  registerCaptureRoutes(app);
  const tokens: string[] = [];
  async function setting(key: string, value: string) {
    await db.insert(systemSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
    invalidateSettingsCache();
  }
  async function clean() {
    for (const table of [captureAiJobs, captureSignals, captureEvents, captureUsage, captureMemory, captureUserPairs, captureMarkers,
      captureConsents, captureDevices, expenseDailyRollups, expenses, userWallets, userContacts])
      await db.delete(table).where(and(inArray(table.userId as never, ids), eq(table.userType as never, "local")));
    await db.delete(localUsers).where(inArray(localUsers.id, ids));
  }
  beforeAll(async () => {
    await syncCaptureSeed();
    await clean();
    for (const [key, value] of Object.entries({
      capture_enabled: "true", capture_read_mode: "model_first", capture_financial_version: "cashflow-v1",
      capture_monthly_limit_free: "100000", capture_daily_signal_limit: "100000", capture_ai_concurrency: "1000",
      capture_model_qualified: JSON.stringify({ version: "sms-v4", digest: CAPTURE_PROMPT_DIGEST,
        routes: [{ slug: "synthetic-a", model: "synthetic-model" }, { slug: "synthetic-b", model: "synthetic-model" }],
        pairs: ["cib:purchase"], dataProcessingApproved: true }),
    })) await setting(key, value);
    for (const owner of owners) {
      await db.insert(localUsers).values({ id: owner.userId, name: "Load", phone: `synthetic-load-${owner.userId}`, password: "synthetic" });
      const { token } = await registerCaptureDevice(owner, { platform: "android", installationId: `synthetic-load-${owner.userId}` });
      tokens.push(token);
      for (const scope of ["capture", "ai_reading"] as const) await setCaptureConsent(owner, scope, true, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
    }
  }, 120_000);
  afterAll(async () => {
    await clean();
    await db.delete(systemSettings).where(inArray(systemSettings.key, keys));
    invalidateSettingsCache();
  }, 120_000);

  it("keeps ingest fast, loses and doubles nothing, and files every payment within the target", async () => {
    const ingest: number[] = [];
    const sentAt = new Map<string, number>();
    const statuses: Record<number, number> = {};
    let stop = false;
    let sent = 0;
    // Workers drain as replicas would; the queue's lease keeps two from reading one job.
    const workers = Array.from({ length: WORKERS }, async () => {
      while (!stop) {
        if ((await drainCaptureModel(5)) === 0) await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });
    const pending: Promise<void>[] = [];
    const sendOne = (n: number) => {
      const user = n % USERS;
      const id = `synthetic-load-${n}`;
      const amount = 10 + n;
      const started = Date.now();
      sentAt.set(id, started);
      pending.push((async () => {
        const response = await app.request("/api/capture/v1/signals", {
          method: "POST", headers: { "content-type": "application/json", "x-capture-device": tokens[user] },
          body: JSON.stringify({ signals: [{ id, channel: "notification", app: "com.cibeg.ddc1.digitalbanking.live",
            text: `Successful purchase EGP ${amount} at ZED MARKET.`, postedAt: new Date().toISOString() }] }),
        });
        ingest.push(Date.now() - started);
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
        await response.text();
      })());
    };
    const phase = async (rate: number, seconds: number) => {
      const until = Date.now() + seconds * 1000;
      while (Date.now() < until) {
        const tick = Date.now();
        for (let i = 0; i < rate; i++) sendOne(sent++);
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - tick))));
      }
    };
    // Accepted to filed: a poller notes when each job is done, from the first message on.
    const filedAt = new Map<number, number>();
    let sending = true;
    const poll = async () => {
      const jobs = await db.select({ id: captureAiJobs.id, status: captureAiJobs.status }).from(captureAiJobs)
        .where(and(inArray(captureAiJobs.userId, ids), eq(captureAiJobs.userType, "local")));
      const now = Date.now();
      for (const job of jobs) if (job.status === "done" && !filedAt.has(job.id)) filedAt.set(job.id, now);
      return jobs;
    };
    const poller = (async () => {
      while (sending) {
        await poll();
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    })();
    const begun = Date.now();
    await phase(RATE, SECONDS);
    await phase(BURST_RATE, BURST_SECONDS);
    await Promise.all(pending);
    sending = false;
    await poller;
    const deadline = Date.now() + (FAIL_RATE > 0 ? 600_000 : 120_000);
    while (Date.now() < deadline) {
      const jobs = await poll();
      if (jobs.length >= sent && jobs.every((job) => job.status === "done")) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    stop = true;
    await Promise.all(workers);

    const signals = await db.select({ id: captureSignals.id, clientSignalId: captureSignals.clientSignalId }).from(captureSignals)
      .where(and(inArray(captureSignals.userId, ids), eq(captureSignals.userType, "local")));
    const jobs = await db.select({ id: captureAiJobs.id, signalId: captureAiJobs.signalId, status: captureAiJobs.status })
      .from(captureAiJobs).where(and(inArray(captureAiJobs.userId, ids), eq(captureAiJobs.userType, "local")));
    const rows = await db.select({ id: expenses.id, clientRequestId: expenses.clientRequestId }).from(expenses)
      .where(and(inArray(expenses.userId, ids), eq(expenses.userType, "local")));
    const bySignal = new Map(signals.map((row) => [row.id, row.clientSignalId]));
    const toLedger = jobs.flatMap((job) => {
      const start = sentAt.get(bySignal.get(job.signalId) ?? "");
      const end = filedAt.get(job.id);
      return start && end ? [end - start] : [];
    });
    const report = {
      sent, seconds: Math.round((Date.now() - begun) / 1000), statuses, workers: WORKERS, users: USERS, modelDelayMs: DELAY_MS,
      failRate: FAIL_RATE, ingestP50: p50(ingest), ingestP95: p95(ingest), toLedgerP50: p50(toLedger), toLedgerP95: p95(toLedger),
      jobs: jobs.length, done: jobs.filter((job) => job.status === "done").length, ledgerRows: rows.length,
      duplicateRows: rows.length - new Set(rows.map((row) => row.clientRequestId)).size,
    };
    process.stderr.write(`capture-load ${JSON.stringify(report)}\n`);
    expect(statuses[200]).toBe(sent);
    expect(report.jobs).toBe(sent);
    expect(report.done).toBe(sent);
    expect(report.ledgerRows).toBe(sent);
    expect(report.duplicateRows).toBe(0);
    expect(report.ingestP95).toBeLessThanOrEqual(300);
    // With failures the retried jobs wait their backoff by design; the target is for a healthy provider.
    if (FAIL_RATE === 0) expect(report.toLedgerP95).toBeLessThanOrEqual(15_000);
  }, 1_200_000);
});
