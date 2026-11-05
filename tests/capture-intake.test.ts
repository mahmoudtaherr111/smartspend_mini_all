/**
 * Capture from a phone to the ledger through the one path of decision 0049, on real MySQL: the phone's signal, the
 * durable model job, the checks, matching, recording, the user's answers and the admin's tools. The model is a stub
 * that reads these invented messages (the repository is public); everything after it is production code.
 */
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { captureAiJobs, captureConsents, captureMarkers, inAppNotifications, captureDevices, captureEvents, captureMemory, captureQuestions, captureSignals, captureUsage, captureUserPairs, expenseDailyRollups, expenses, localUsers, systemSettings, userWallets } from "../db/schema";
import { db } from "../api/queries/connection";
import { registerCaptureRoutes } from "../api/capture-v1-routes";
import { captureRouter } from "../api/capture-router";
import { invalidateCaptureCatalog, syncCaptureSeed } from "../api/lib/capture/catalog";
import { CAPTURE_CONSENT_TEXT_VERSION, setCaptureConsent } from "../api/lib/capture/consent";
import { registerCaptureDevice, revokeCaptureDevice } from "../api/lib/capture/devices";
import { invalidateSettingsCache, getSystemSettings } from "../api/lib/settings-cache";
import { deleteLedgerEntry, updateLedgerEntry } from "../api/services/ledger-writer";
import { drainCaptureModel } from "../api/lib/capture/ai-queue";
import { autoPolicyOf, releaseHeldEvents } from "../api/lib/capture/intake";
import { runSilentDevices } from "../api/lib/capture/care";
import { applyBulkUndo, captureFunnel, captureTimeline, checkModelQueue, notifyAdmins, previewBulkUndo, runCaptureBreaker } from "../api/lib/capture/operations";
import { stateDel } from "../api/lib/redis-client";
import { checkCaptureReply, labelAmounts, proposeCapturePosting, type CaptureModelReply } from "../api/lib/capture/model-contract";
import { simulateCaptureMessage } from "../api/lib/capture/simulator";

// The model, answered here from the invented messages' own shape: no network.
const model = vi.hoisted(() => ({ fail: 0, calls: 0 }));
function stubReply(text: string): CaptureModelReply {
  const { amounts } = labelAmounts(text);
  const base: CaptureModelReply = { status: "completed", kind: "purchase", direction: "out", amount: amounts[0]?.label ?? null, amountEgp: null, fee: null, feeIncluded: null,
    balance: null, party: null, partyType: "merchant", method: "card", category: null, subcategory: null, recurring: false };
  if (/رمز|OTP|code/i.test(text) && !/خصم/.test(text)) return { ...base, status: "not_transaction", kind: "other", amount: null, direction: null };
  if (/available balance on/i.test(text)) return { ...base, status: "not_transaction", kind: "other", amount: null, direction: null, balance: amounts[0]?.label ?? null };
  const party = /(?:عند|at|من) ([A-Z][A-Z0-9 ]+?)(?: المتاح| إلى|\.|$)/u.exec(text)?.[1] ?? null;
  const balance = /المتاح|balance/i.test(text) && amounts.length > 1 ? amounts[amounts.length - 1].label : null;
  const egp = amounts.find((item) => item.currency === "EGP" && amounts[0].currency !== "EGP" && amounts[0].currency !== null);
  if (/استرداد|refund/i.test(text)) return { ...base, kind: "refund", direction: "in", party, balance };
  return { ...base, party, balance, amountEgp: egp?.label ?? null };
}
vi.mock("../api/lib/capture/model-reader", async (original) => ({
  ...(await original<typeof import("../api/lib/capture/model-reader")>()),
  readCaptureWithModel: vi.fn(async (text: { text: string }) => {
    model.calls++;
    if (model.fail > 0) { model.fail--; return { outcome: "failed" }; }
    const labelled = labelAmounts(text.text);
    const check = checkCaptureReply(stubReply(text.text), labelled);
    if (!check.ok) return { outcome: "invalid_reply" };
    return { outcome: "read", check, proposal: proposeCapturePosting(check), model: "stub-model", provider: "stub" };
  }),
}));

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
describe.runIf(process.env.RUN_DB_INTEGRATION === "1")("capture from a phone to the ledger", () => {
  const owner = { userId: 88821, userType: "local" };
  const app = new Hono();
  registerCaptureRoutes(app);
  const caller = captureRouter.createCaller({ user: { id: owner.userId, type: "local", role: "user", plan: "free", name: "Capture Test" } } as never);
  const CIB_APP = "com.cibeg.ddc1.digitalbanking.live";
  let token = "";
  let deviceId = 0;
  const mine = <T extends { userId: unknown; userType: unknown }>(table: T, userType = "local") =>
    and(eq(table.userId as never, owner.userId), eq(table.userType as never, userType));

  const post = (path: string, body: unknown, deviceToken = token) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", "x-capture-device": deviceToken }, body: JSON.stringify(body) });
  const purchase = (id: string, amount = "450.00", merchant = "CARREFOUR MAADI") => ({
    id, channel: "notification", app: CIB_APP,
    text: `تم خصم EGP ${amount} من بطاقتك رقم 1234 عند ${merchant} المتاح EGP 4,500.75`, postedAt: new Date().toISOString(),
  });
  const sms = (id: string, text: string, sender = "CIB") => ({ id, channel: "sms", app: "com.google.android.apps.messaging", sender, text, postedAt: new Date().toISOString() });
  /** Lets the worker read every due job; returns the jobs. */
  const settle = async () => {
    for (let n = 0; n < 300; n++) {
      await drainCaptureModel(25);
      const jobs = await db.select().from(captureAiJobs).where(mine(captureAiJobs));
      if (jobs.every((job) => job.status === "done" || (job.status === "queued" && job.nextAt.getTime() > Date.now() + 1000))) return jobs;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("jobs_not_finished");
  };
  /** Sends, lets the worker read every job, and returns the phone's answers and the finished jobs. */
  const send = async (...signals: unknown[]) => {
    const response = await post("/api/capture/v1/signals", { signals });
    expect(response.status).toBe(200);
    const body = await response.json();
    for (let n = 0; n < 300; n++) {
      await drainCaptureModel(25);
      const jobs = await db.select().from(captureAiJobs).where(mine(captureAiJobs));
      if (jobs.every((job) => job.status === "done" || (job.status === "queued" && job.nextAt.getTime() > Date.now() + 1000))) return { results: body.results, jobs };
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("jobs_not_finished");
  };
  const ledger = () => db.select().from(expenses).where(mine(expenses));
  const events = () => db.select().from(captureEvents).where(mine(captureEvents));
  const setting = async (key: string, value: string) => {
    await db.insert(systemSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
    invalidateSettingsCache();
  };
  const clearSetting = async (key: string) => {
    await db.delete(systemSettings).where(eq(systemSettings.key, key));
    invalidateSettingsCache();
  };
  const cleanUp = async () => {
    for (const userType of ["local", "oauth"]) {
      for (const table of [captureAiJobs, captureMarkers, inAppNotifications, captureSignals, captureEvents, captureQuestions, userWallets, captureUsage, captureMemory,
        captureUserPairs, captureConsents, captureDevices, expenseDailyRollups, expenses]) await db.delete(table).where(mine(table as never, userType));
    }
    await db.delete(localUsers).where(eq(localUsers.id, owner.userId));
  };

  beforeAll(async () => {
    await syncCaptureSeed();
    await invalidateCaptureCatalog();
  });
  beforeEach(async () => {
    await cleanUp();
    await db.insert(localUsers).values({ id: owner.userId, name: "Capture Test", phone: "+201000088821", password: "x" });
    await setting("capture_enabled", "true");
    await setting("capture_financial_version", "cashflow-v1");
    ({ token, deviceId } = await registerCaptureDevice(owner, { platform: "android", installationId: "install-0001" }));
    for (const scope of ["capture", "ai_reading"] as const) await setCaptureConsent(owner, scope, true, CAPTURE_CONSENT_TEXT_VERSION);
    model.fail = 0; model.calls = 0;
  });
  afterAll(async () => {
    await cleanUp();
    for (const key of ["capture_monthly_limit_free", "capture_daily_question_notices", "capture_paused_sources", "capture_beta_users", "capture_daily_signal_limit",
      "capture_enabled", "capture_financial_version"]) await clearSetting(key);
  });

  it("records a purchase on its own from any bank, stores nothing for a code, and keeps one row for a retried signal", async () => {
    const otp = { ...purchase("signal-otp-01"), text: "رمز التحقق 482913 لعملية شراء بمبلغ 500 جنيه. لا تشاركه مع أي حد" };
    const first = await send(purchase("signal-buy-01"), otp);
    expect(first.results[0]).toMatchObject({ id: "signal-buy-01", result: "queued" });
    expect(first.results[1]).toMatchObject({ id: "signal-otp-01", result: "ignored", reason: "otp" });
    const [row] = await ledger();
    expect(row).toMatchObject({ source: "sms", type: "expense", category: "متنوعات", rawText: null });
    expect(Number(row.amount)).toBe(450);
    expect(row.description).toBe("شراء · CARREFOUR MAADI · البنك التجاري الدولي");
    expect(row.description).not.toContain("1234");

    const retry = await send(purchase("signal-buy-01"));
    expect(retry.results[0]).toMatchObject({ result: "recorded" });
    expect(await ledger()).toHaveLength(1);
    const rows = await db.select().from(captureSignals).where(mine(captureSignals));
    expect(rows).toHaveLength(1);
    expect(rows[0].textRedacted).not.toContain("1234");
    expect(model.calls).toBe(1);

    // A bank the catalog has never heard of is read and recorded the same way.
    await send(sms("signal-new-bank", "تم خصم 99 جنيه من بطاقتك رقم 9911 عند NEW SHOP", "NEWBANK"));
    expect(await ledger()).toHaveLength(2);
  });

  it("queues durably, refuses a changed text under the same id, and erases the work when the consent is taken back", async () => {
    await setting("capture_enabled", "false");
    const input = purchase("signal-durable");
    // Switched off: the phone is told so and nothing is kept.
    expect((await post("/api/capture/v1/signals", { signals: [input] })).status).toBe(503);
    await setting("capture_enabled", "true");
    // The ledger's cutover not done yet: the job waits instead of being read.
    await setting("capture_financial_version", "");
    const first = await (await post("/api/capture/v1/signals", { signals: [input] })).json();
    expect(first.results[0].result).toBe("queued");
    const conflict = await (await post("/api/capture/v1/signals", { signals: [{ ...input, text: input.text.replace("450.00", "999.00") }] })).json();
    expect(conflict.results[0]).toMatchObject({ result: "rejected", reason: "conflict" });
    const [signal] = await db.select().from(captureSignals).where(mine(captureSignals));
    expect(signal.reading).toMatchObject({ modelRead: { envelope: expect.stringMatching(/^cv1:/) } });
    await settle();
    expect(await db.select().from(captureAiJobs).where(mine(captureAiJobs))).toMatchObject([{ status: "queued", outcome: "financial_upgrade" }]);
    await setting("capture_financial_version", "cashflow-v1");
    await setCaptureConsent(owner, "ai_reading", false, CAPTURE_CONSENT_TEXT_VERSION);
    await db.update(captureAiJobs).set({ nextAt: new Date(Date.now() - 1000) }).where(mine(captureAiJobs));
    await settle();
    expect(await db.select().from(captureAiJobs).where(mine(captureAiJobs))).toHaveLength(0);
    expect(await db.select().from(captureSignals).where(mine(captureSignals))).toHaveLength(0);
    expect(await ledger()).toHaveLength(0);
  });

  it("keeps a message while the model is down and records it once the model answers", async () => {
    model.fail = 1;
    const { jobs } = await send(purchase("signal-outage"));
    expect(jobs[0]).toMatchObject({ status: "queued", outcome: "failed" });
    expect(await ledger()).toHaveLength(0);
    await db.update(captureAiJobs).set({ nextAt: new Date(Date.now() - 1000) }).where(mine(captureAiJobs));
    await settle();
    expect(await ledger()).toHaveLength(1);
  });

  it("records once for a payment that arrives as the bank's SMS and its app's notification", async () => {
    const text = "تم خصم EGP 450.00 من بطاقتك رقم 1234 عند CARREFOUR MAADI المتاح EGP 4,500.75";
    await send(sms("signal-sms-01", text));
    await send(purchase("signal-app-01"));
    expect(await events()).toHaveLength(1);
    expect(await ledger()).toHaveLength(1);
  });

  it("asks about the same words twice from one channel instead of recording them twice", async () => {
    const text = "تم خصم 50 جنيه من بطاقتك رقم 1234 عند COSTA";
    await send(sms("signal-cof-01", text), sms("signal-cof-02", text));
    expect(await ledger()).toHaveLength(1);
    const pending = await caller.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].possibleDuplicate).toBe(true);
    const [job] = (await db.select().from(captureAiJobs).where(mine(captureAiJobs))).filter((item) => item.notice);
    expect(job).toBeTruthy();
  });

  it("keeps a foreign charge without its pound value for the user, records it once from the button however often it is tapped", async () => {
    await send(sms("signal-usd-01", "Your card 1234 was charged USD 20.00 at OPENAI"));
    expect(await ledger()).toHaveLength(0);
    const [waiting] = await caller.pending();
    expect(waiting.reading).toMatchObject({ amount: { value: 20, currency: "USD" } });
    await expect(caller.answer({ eventId: waiting.eventId, action: "record" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const answered = await caller.answer({ eventId: waiting.eventId, action: "record", amountEgp: 990 });
    expect((await caller.answer({ eventId: waiting.eventId, action: "record", amountEgp: 990 })).expenseId).toBe(answered.expenseId);
    const tap = await (await post("/api/capture/v1/actions", { actionId: "action-0001", eventId: waiting.eventId, action: "record" })).json();
    expect(tap.expenseId).toBe(answered.expenseId);
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(990);
  });

  it("does not bring back a recorded payment the user deleted when a late signal of it arrives", async () => {
    await send(purchase("signal-del-01"));
    const [row] = await ledger();
    await deleteLedgerEntry(owner, row.id);
    await send(sms("signal-del-02", "تم خصم EGP 450.00 من بطاقتك رقم 1234 عند CARREFOUR MAADI المتاح EGP 4,500.75"));
    expect(await ledger()).toHaveLength(0);
    expect(await caller.pending()).toHaveLength(0);
  });

  it("files a refund where its purchase was filed, as a negative row", async () => {
    await send(purchase("signal-ref-01", "300.00", "ZARA CITY STARS"));
    const [bought] = await ledger();
    await updateLedgerEntry(owner, bought.id, { category: "تسوق", subCategory: "ملابس" });
    await send(sms("signal-ref-02", "تم استرداد مبلغ 300.00 جنيه من ZARA CITY STARS إلى بطاقتك رقم 1234"));
    const negative = (await ledger()).find((row) => Number(row.amount) < 0);
    expect(negative).toMatchObject({ category: "تسوق", subCategory: "ملابس", type: "expense" });
    expect(Number(negative!.amount)).toBe(-300);
  });

  it("records on the card's wallet and moves its balance to the message's", async () => {
    const [made] = await db.insert(userWallets).values({ userId: owner.userId, userType: "local", name: "CIB Visa", provider: "Visa", lastFourDigits: "1234", balance: "100.00" });
    // Only a wallet the user said holds their own money follows a message's balance (decision 0047).
    await caller.setWalletKind({ walletId: made.insertId, kind: "debit" });
    await send(purchase("signal-wal-01"));
    const [wallet] = await db.select().from(userWallets).where(mine(userWallets));
    const [row] = await ledger();
    expect(row.walletId).toBe(wallet.id);
    expect(Number(wallet.balance)).toBe(4500.75);
    expect(wallet.balanceSource).toBe("bank_message");
  });

  it("moves a card's wallet to the balance a balance-only message gives, and records nothing", async () => {
    const [made] = await db.insert(userWallets).values({ userId: owner.userId, userType: "local", name: "CIB Visa", provider: "Visa", lastFourDigits: "1234", balance: "100.00" });
    await caller.setWalletKind({ walletId: made.insertId, kind: "debit" });
    const { jobs } = await send({ ...purchase("signal-bal-01"), text: "Your available balance on card **1234 is EGP 3,200.50" });
    expect(jobs[0].outcome).toBe("not_transaction");
    const [wallet] = await db.select().from(userWallets).where(mine(userWallets));
    expect(Number(wallet.balance)).toBe(3200.5);
    expect(await events()).toHaveLength(0);
  });

  it("holds what is over the free limit, says so once, and records it all on an upgrade", async () => {
    await setting("capture_monthly_limit_free", "2");
    try {
      for (const [index, amount] of ["101.00", "102.00", "103.00", "104.00"].entries()) await send(purchase(`signal-lim-0${index}`, amount, `SHOP ${index} MAADI`));
      expect(await ledger()).toHaveLength(2);
      expect((await caller.status()).usage).toMatchObject({ limit: 2, used: 2, held: 2 });
      const notices = (await db.select().from(captureAiJobs).where(mine(captureAiJobs))).filter((job) => (job.notice as { title?: string } | null)?.title === "وصلت لحد الشهر");
      expect(notices).toHaveLength(1);
      await db.update(localUsers).set({ plan: "pro" }).where(eq(localUsers.id, owner.userId));
      expect(await releaseHeldEvents(owner)).toEqual({ released: 2, recorded: 2 });
      expect(await ledger()).toHaveLength(4);
      expect(await releaseHeldEvents(owner)).toEqual({ released: 0, recorded: 0 });
    } finally {
      await clearSetting("capture_monthly_limit_free");
    }
  });

  it("remembers where the user filed a merchant and files the next payment there", async () => {
    await send(purchase("signal-mem-01", "60.00", "BIM MARKET"));
    const [first] = await ledger();
    await updateLedgerEntry(owner, first.id, { category: "أكل وشرب", subCategory: "بقالة" });
    await send(purchase("signal-mem-02", "75.00", "BIM MARKET"));
    const second = (await ledger()).find((row) => Number(row.amount) === 75);
    expect(second).toMatchObject({ category: "أكل وشرب", subCategory: "بقالة" });
  });

  it("records without the streak, and takes a recording back on undo", async () => {
    const { jobs } = await send(purchase("signal-auto-01"));
    expect((jobs[0].notice as { actions: string[]; title: string }).actions).toEqual(["undo"]);
    expect((jobs[0].notice as { title: string }).title).toContain("اتسجلت");
    const [row] = await ledger();
    expect((row.parsedMetadata as { capture: { auto: boolean } }).capture.auto).toBe(true);
    const [user] = await db.select({ streak: localUsers.currentStreak }).from(localUsers).where(eq(localUsers.id, owner.userId));
    expect(user.streak ?? 0).toBe(0);
    const undo = await (await post("/api/capture/v1/actions", { actionId: "action-undo-1", eventId: jobs[0].eventId, action: "undo" })).json();
    expect(undo.result).toBe("dismissed");
    expect(await ledger()).toHaveLength(0);
    expect((await caller.status()).usage.used).toBe(0);
  });

  describe("running capture", () => {
    const recordMany = async (count: number) => {
      await send(...Array.from({ length: count }, (_, i) => purchase(`signal-ops-${String(i).padStart(2, "0")}`, `${100 + i}.00`, `SHOP ${i} MAADI`)));
      const all = await events();
      expect(all.filter((event) => event.status === "recorded")).toHaveLength(count);
      return all;
    };

    it("stops recording a bank on its own when too many of its recordings are taken back", async () => {
      const recorded = await recordMany(20);
      for (const [i, event] of recorded.slice(0, 2).entries()) {
        await post("/api/capture/v1/actions", { actionId: `action-ops-undo-${i}`, eventId: event.id, action: "undo" });
      }
      try {
        expect(await runCaptureBreaker()).toEqual(["cib"]);
        expect(autoPolicyOf(await getSystemSettings()).paused.has("cib")).toBe(true);
        const funnel = await captureFunnel(1);
        expect(funnel.rows.find((row) => row.sourceSlug === "cib" && row.kind === "card_purchase")).toMatchObject({ auto: 20, autoUndone: 2, recorded: 18 });
        // Paused: the next one waits for the user instead of being recorded.
        await send(purchase("signal-ops-paused", "500.00", "PAUSED SHOP"));
        expect((await caller.pending()).length).toBe(1);
      } finally {
        await clearSetting("capture_paused_sources");
      }
    });

    it("takes back one bank's recordings in a period, counting first, and gives the month back", async () => {
      await recordMany(3);
      const range = { sourceSlug: "cib", from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000), onlyAuto: true };
      expect(await previewBulkUndo(range)).toMatchObject({ rows: 3 });
      expect(await applyBulkUndo(range)).toBe(3);
      expect(await ledger()).toHaveLength(0);
      expect((await caller.status()).usage.used).toBe(0);
    });
  });

  describe("who may send, and how much", () => {
    it("refuses a build older than the oldest allowed", async () => {
      const old = await app.request("/api/capture/v1/signals", {
        method: "POST", headers: { "content-type": "application/json", "x-capture-device": token, "x-client-version": "0.1.0" },
        body: JSON.stringify({ signals: [purchase("signal-old-01")] }),
      });
      expect(old.status).toBe(426);
    });

    it("is closed to a user outside the beta list, and opens again when the list is empty", async () => {
      await setting("capture_beta_users", "local:1");
      try {
        expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-beta-01")] })).status).toBe(503);
        expect((await caller.status()).enabled).toBe(false);
      } finally {
        await clearSetting("capture_beta_users");
      }
      expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-beta-02")] })).status).toBe(200);
    });

    it("lets a free user register two phones", async () => {
      await caller.registerDevice({ platform: "android", installationId: "install-0002" });
      await expect(caller.registerDevice({ platform: "android", installationId: "install-0003" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("stops a user's phones for the day past the daily cap", async () => {
      await setting("capture_daily_signal_limit", "3");
      try {
        expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-day-01"), purchase("signal-day-02", "20.00")] })).status).toBe(200);
        const over = await post("/api/capture/v1/signals", { signals: [purchase("signal-day-03", "30.00"), purchase("signal-day-04", "40.00")] });
        expect(over.status).toBe(429);
        expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
      } finally {
        await clearSetting("capture_daily_signal_limit");
      }
    });

    it("drops the messages of a card the user ignores, and keeps nothing of them", async () => {
      const marker = await caller.ignore({ kind: "ignore_card", value: "1234" });
      const { results } = await send(purchase("signal-ign-01"));
      expect(results[0]).toMatchObject({ result: "ignored", reason: "user_ignored" });
      expect(await db.select().from(captureSignals).where(mine(captureSignals))).toHaveLength(0);
      await caller.unignore({ id: marker.id });
      await send(purchase("signal-ign-02"));
      expect(await ledger()).toHaveLength(1);
    });

    it("ignores an SMS from a person's number and a message without a keyword", async () => {
      const { results } = await send(sms("signal-person", "تم خصم 50 جنيه", "+201001234567"), sms("signal-chat", "هتيجي امتى؟", "CIB"));
      expect(results.map((item: { reason: string }) => item.reason)).toEqual(["personal_sender", "no_keyword"]);
      expect(await db.select().from(captureSignals).where(mine(captureSignals))).toHaveLength(0);
    });
  });

  describe("looking after the user's capture", () => {
    const notices = () => db.select().from(inAppNotifications).where(mine(inAppNotifications));
    const beat = (access: boolean) => post("/api/capture/v1/heartbeat", { access, notifications: true, waiting: 0, lastCaptureAt: null, appVersion: "1.0.0" });

    it("tells the user once when a phone loses notification access, and again only after it came back", async () => {
      await beat(false);
      await beat(false);
      expect(await notices()).toHaveLength(1);
      await beat(true);
      await beat(false);
      expect(await notices()).toHaveLength(2);
    });

    it("tells the user once about a phone silent for two days", async () => {
      await db.update(captureDevices).set({ lastHeartbeatAt: new Date(Date.now() - 3 * 24 * 3600_000), lastSeenAt: null, createdAt: new Date(Date.now() - 5 * 24 * 3600_000) }).where(eq(captureDevices.id, deviceId));
      await runSilentDevices();
      await runSilentDevices();
      expect(await notices()).toHaveLength(1);
    });

    it("suggests a wallet for a card seen twice, adds it, and stops suggesting a declined one", async () => {
      await send(purchase("signal-wo-01", "10.00", "SHOP A MAADI"), purchase("signal-wo-02", "20.00", "SHOP B MAADI"));
      const [offer] = await caller.walletOffers();
      expect(offer).toMatchObject({ sourceSlug: "cib", suffix: "234", payments: 2 });
      await caller.answerWalletOffer({ sourceSlug: "cib", suffix: "234", accept: false });
      expect(await caller.walletOffers()).toHaveLength(0);
    });

    it("deletes what capture keeps, stops every phone, and keeps the ledger", async () => {
      await send(purchase("signal-del-01"), sms("signal-del-usd", "Your card 1234 was charged USD 5.00 at ZOOM"));
      expect(await caller.deleteMyData()).toEqual({ signals: 2, waiting: 1 });
      expect(await db.select().from(captureSignals).where(mine(captureSignals))).toHaveLength(0);
      expect(await ledger()).toHaveLength(1);
      expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-del-03")] })).status).toBe(403);
    });
  });

  describe("operations for the admin", () => {
    const admin = { userId: 88822, userType: "local" };
    const adminNotices = () => db.select().from(inAppNotifications).where(and(eq(inAppNotifications.userId, admin.userId), eq(inAppNotifications.userType, "local")));
    beforeEach(async () => {
      await db.delete(inAppNotifications).where(and(eq(inAppNotifications.userId, admin.userId), eq(inAppNotifications.userType, "local")));
      await db.delete(localUsers).where(eq(localUsers.id, admin.userId));
      await db.insert(localUsers).values({ id: admin.userId, name: "Capture Admin", phone: "+201000088822", password: "x", role: "admin" });
    });
    afterAll(async () => {
      await db.delete(inAppNotifications).where(and(eq(inAppNotifications.userId, admin.userId), eq(inAppNotifications.userType, "local")));
      await db.delete(localUsers).where(eq(localUsers.id, admin.userId));
    });

    it("keeps the merchant in the stored text, and still removes the card", async () => {
      await send({ ...purchase("signal-keep-01"), text: "تم خصم 75.00 جنيه من بطاقتك رقم 1234 من CARREFOUR MAADI" });
      const [row] = await db.select().from(captureSignals).where(mine(captureSignals));
      expect(row.textRedacted).toContain("CARREFOUR");
      expect(row.textRedacted).not.toContain("1234");
    });

    it("tells the admins when the model's queue is stuck, once an hour", async () => {
      await db.insert(captureAiJobs).values({ userId: owner.userId, userType: "local", deviceId, signalId: 999_001, nextAt: new Date(Date.now() + 3600_000), createdAt: new Date(Date.now() - 10 * 60_000) });
      await stateDel("capture:alert:model-queue");
      expect(await checkModelQueue()).toBe(true);
      await checkModelQueue();
      expect(await adminNotices()).toHaveLength(1);
      await stateDel("capture:alert:model-queue");
      await db.delete(captureAiJobs).where(eq(captureAiJobs.signalId, 999_001));
    });

    it("tells the admins when the breaker stops a bank", async () => {
      expect(await notifyAdmins("اختبار", "تنبيه")).toBeGreaterThanOrEqual(1);
      const [note] = await adminNotices();
      expect(note).toMatchObject({ title: "اختبار", actionUrl: "/admin" });
    });

    it("shows a user's phones, consents and payments without any message text", async () => {
      await send(purchase("signal-tl-01"));
      const timeline = await captureTimeline(owner);
      expect(timeline.devices[0]).toMatchObject({ id: deviceId, platform: "android" });
      expect(timeline.consents.map((consent) => consent.scope)).toContain("capture");
      expect(timeline.events[0]).toMatchObject({ status: "recorded", kind: "card_purchase", sourceSlug: "cib" });
      expect(JSON.stringify(timeline)).not.toContain("CARREFOUR");
    });
  });

  it("never lets a Google account with the same id answer, and stops a revoked phone", async () => {
    await send(sms("signal-usd-02", "Your card 1234 was charged USD 7.00 at ZOOM"));
    const [waiting] = await caller.pending();
    const sameIdOtherKind = captureRouter.createCaller({ user: { id: owner.userId, type: "oauth", role: "user", plan: "free", name: "Other" } } as never);
    await expect(sameIdOtherKind.answer({ eventId: waiting.eventId, action: "record", amountEgp: 350 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await sameIdOtherKind.pending()).toHaveLength(0);
    await revokeCaptureDevice(owner, deviceId);
    expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-06")] })).status).toBe(401);
  });

  it("runs the admin's simulated message through the same path into the admin's own ledger", async () => {
    const result = await simulateCaptureMessage(owner, { text: "تم خصم 75 جنيه من بطاقتك رقم 4321 عند SPINNEYS", sender: "CIB", channel: "sms" });
    expect(result.admission).toEqual({ result: "queued", reason: null });
    expect(result.reading?.facts).toMatchObject({ status: "completed", amount: { value: 75 } });
    expect(result.ledger).toMatchObject({ type: "expense", amount: "75.00", description: "شراء · SPINNEYS · البنك التجاري الدولي" });
    expect(result.redacted).not.toContain("4321");
    // A message the phone would never send is shown as such.
    expect((await simulateCaptureMessage(owner, { text: "هتيجي امتى النهارده؟", sender: "CIB", channel: "sms" })).admission).toEqual({ result: "ignored", reason: "no_keyword" });
    expect(await db.select().from(captureDevices).where(and(mine(captureDevices), eq(captureDevices.installationId, "admin-message-simulator")))).toHaveLength(1);
  });

  it("refuses without consent, while switched off, and without a device token", async () => {
    await setCaptureConsent(owner, "capture", false, CAPTURE_CONSENT_TEXT_VERSION);
    expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-07")] })).status).toBe(403);
    await setting("capture_enabled", "false");
    expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-08")] })).status).toBe(503);
    expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-09")] }, "cap_unknown")).status).toBe(401);
    const config = await (await app.request("/api/capture/v1/config", { headers: { "x-capture-device": token } })).json();
    expect(config).toMatchObject({ enabled: false, consent: { capture: false }, gate: { schema: 2 } });
    expect(config.gate.keywords).toContain("تحويل");
  });
});
