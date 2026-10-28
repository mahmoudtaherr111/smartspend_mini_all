import { and, eq, inArray, lte } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { captureAiJobs, captureConsents, captureMarkers, captureDevices, captureEvents, captureMemory, captureSignals, captureUsage, captureUserPairs, expenseDailyRollups, expenses, localUsers, systemSettings, userWallets } from "../db/schema";
import { db } from "../api/queries/connection";
import { registerCaptureRoutes } from "../api/capture-v1-routes";
import { captureRouter } from "../api/capture-router";
import { invalidateCaptureCatalog, syncCaptureSeed } from "../api/lib/capture/catalog";
import { CAPTURE_CONSENT_TEXT_VERSION, setCaptureConsent } from "../api/lib/capture/consent";
import { registerCaptureDevice, revokeCaptureDevice } from "../api/lib/capture/devices";
import { invalidateSettingsCache } from "../api/lib/settings-cache";
import { deleteLedgerEntry, updateLedgerEntry } from "../api/services/ledger-writer";
import { drainCaptureModel } from "../api/lib/capture/ai-queue";
import { autoPolicyOf } from "../api/lib/capture/intake";
import { applyBulkUndo, captureFunnel, previewBulkUndo, runCaptureBreaker } from "../api/lib/capture/operations";
import { getSystemSettings } from "../api/lib/settings-cache";
import type { AiReading } from "../api/lib/capture/ai-reader";

// The admin's model, answered here: no network. Each test sets what it says.
const model = vi.hoisted(() => ({ next: [] as Array<Partial<AiReading>> }));
vi.mock("../api/lib/capture/ai-reader", () => ({
  readMessageWithModel: vi.fn(async () => {
    const answer = model.next.shift();
    return { reply: null, result: null, verdict: null, outcome: "disabled", skipped: true, ...answer };
  }),
}));
const modelPurchase = {
  outcome: "parsed" as const,
  verdict: "transaction" as const,
  skipped: false,
  reply: {
    isFinancial: true,
    kind: "card_purchase" as const,
    direction: "out" as const,
    amount: { value: 450, currency: "EGP" },
    amountEgp: null,
    fee: null,
    balanceAfter: null,
    counterparty: { type: "merchant" as const, name: "CARREFOUR MAADI" },
    rail: "card" as const,
    occurredAt: null,
    category: null,
    subCategory: null,
    subscriptionHint: false,
    confidence: { kind: 0.9, amount: 0.9, direction: 0.9, category: 0.4 },
  },
};

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const describeWithDatabase = describe.runIf(process.env.RUN_DB_INTEGRATION === "1");

describeWithDatabase("capture from a phone, confirmed by the user", () => {
  const owner = { userId: 88821, userType: "local" };
  const app = new Hono();
  registerCaptureRoutes(app);
  const caller = captureRouter.createCaller({ user: { id: owner.userId, type: "local", role: "user", plan: "free", name: "Capture Test" } } as never);
  const CIB_APP = "com.cibeg.ddc1.digitalbanking.live";
  let token = "";
  let deviceId = 0;

  const post = (path: string, body: unknown, deviceToken = token) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", "x-capture-device": deviceToken }, body: JSON.stringify(body) });
  const purchase = (id: string, amount = "450.00", merchant = "CARREFOUR MAADI") => ({
    id,
    channel: "notification",
    app: CIB_APP,
    text: `تم خصم EGP ${amount} من بطاقتك رقم 1234 عند ${merchant} المتاح EGP 4,500.75`,
    postedAt: new Date().toISOString(),
  });
  // A message through the phone's messaging app, from the bank's sender: another channel than the bank's app.
  const sms = (id: string, text: string) => ({
    id,
    channel: "sms",
    app: "com.google.android.apps.messaging",
    sender: "CIB",
    text,
    postedAt: new Date().toISOString(),
  });
  const setEnabled = async (on: boolean) => {
    await db.insert(systemSettings).values({ key: "capture_enabled", value: String(on) }).onDuplicateKeyUpdate({ set: { value: String(on) } });
    invalidateSettingsCache();
  };
  const cleanUp = async () => {
    for (const userType of ["local", "oauth"]) {
      const mine = <T extends { userId: unknown; userType: unknown }>(table: T) =>
        and(eq(table.userId as never, owner.userId), eq(table.userType as never, userType));
      await db.delete(captureAiJobs).where(mine(captureAiJobs));
      await db.delete(captureMarkers).where(mine(captureMarkers));
      await db.delete(captureSignals).where(mine(captureSignals));
      await db.delete(captureEvents).where(mine(captureEvents));
      await db.delete(userWallets).where(mine(userWallets));
      await db.delete(captureUsage).where(mine(captureUsage));
      await db.delete(captureMemory).where(mine(captureMemory));
      await db.delete(captureUserPairs).where(mine(captureUserPairs));
      await db.delete(captureConsents).where(mine(captureConsents));
      await db.delete(captureDevices).where(mine(captureDevices));
      await db.delete(expenseDailyRollups).where(mine(expenseDailyRollups));
      await db.delete(expenses).where(mine(expenses));
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
    await setEnabled(true);
    ({ token, deviceId } = await registerCaptureDevice(owner, { platform: "android", installationId: "install-0001" }));
    await setCaptureConsent(owner, "capture", true, CAPTURE_CONSENT_TEXT_VERSION);
    model.next = [];
  });
  afterAll(async () => {
    await cleanUp();
    for (const key of ["capture_monthly_limit_free", "capture_auto_pairs", "capture_daily_question_notices", "capture_paused_sources", "capture_beta_users", "capture_daily_signal_limit"]) {
      await db.delete(systemSettings).where(eq(systemSettings.key, key));
    }
    await db.delete(systemSettings).where(eq(systemSettings.key, "capture_enabled"));
    invalidateSettingsCache();
  });

  it("keeps a purchase for review, stores nothing for a code, and keeps one row for a retried signal", async () => {
    const otp = { ...purchase("signal-otp-01"), text: "رمز التحقق 482913 لا تشاركه مع أي حد" };
    const first = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-01"), otp] })).json();
    expect(first.results[0]).toMatchObject({ id: "signal-buy-01", result: "review" });
    expect(first.results[0].notice.actions).toEqual(["record", "dismiss"]);
    expect(first.results[1]).toMatchObject({ id: "signal-otp-01", result: "ignored" });

    const retry = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-01")] })).json();
    expect(retry.results[0]).toMatchObject({ result: "merged", eventId: first.results[0].eventId });

    const rows = await db.select().from(captureSignals).where(eq(captureSignals.userId, owner.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].textRedacted).not.toContain("1234");
  });

  it("records exactly one ledger row from the notification's button, however often it is tapped", async () => {
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-02")] })).json();
    const eventId = results[0].eventId;
    const tap = (actionId: string) => post("/api/capture/v1/actions", { actionId, eventId, action: "record" });

    const answered = await (await tap("action-0001")).json();
    expect(answered.result).toBe("recorded");
    expect((await (await tap("action-0002")).json()).expenseId).toBe(answered.expenseId);
    expect((await caller.answer({ eventId, action: "record" })).expenseId).toBe(answered.expenseId);

    const ledger = await db.select().from(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, "local")));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ source: "sms", clientRequestId: `cap:e${eventId}`, type: "expense", category: "متنوعات" });
    expect(Number(ledger[0].amount)).toBe(450);
    expect(ledger[0].rawText).toBeNull();
    expect(ledger[0].description).not.toContain("1234");
  });

  it("lists what waits, records with the user's own filing, and dismisses without writing", async () => {
    await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-03", "120.00"), purchase("signal-buy-04", "80.00")] });
    const pending = await caller.pending();
    expect(pending).toHaveLength(2);
    const [newest, oldest] = pending;

    await caller.answer({ eventId: newest.eventId, action: "record", categoryId: "food", subCategoryId: "groceries" });
    await caller.answer({ eventId: oldest.eventId, action: "dismiss" });

    const ledger = await db.select().from(expenses).where(eq(expenses.userId, owner.userId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ category: "أكل وشرب", subCategory: "بقالة" });
    expect(await caller.pending()).toHaveLength(0);
  });

  it("asks once about a payment that arrives as the bank's SMS and its app's notification", async () => {
    const text = "تم خصم EGP 450.00 من بطاقتك رقم 1234 عند CARREFOUR MAADI المتاح EGP 4,500.75";
    const first = await (await post("/api/capture/v1/signals", { signals: [sms("signal-sms-01", text)] })).json();
    const second = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-app-01")] })).json();

    expect(first.results[0]).toMatchObject({ result: "review" });
    expect(second.results[0]).toMatchObject({ result: "merged", eventId: first.results[0].eventId });
    expect(await caller.pending()).toHaveLength(1);
  });

  it("keeps the same words twice from one channel as two, and asks whether it is the same payment", async () => {
    const text = "تم خصم 50 جنيه من بطاقتك رقم 1234 عند COSTA";
    const { results } = await (await post("/api/capture/v1/signals", { signals: [sms("signal-cof-01", text), sms("signal-cof-02", text)] })).json();

    expect(results.map((item: { result: string }) => item.result)).toEqual(["review", "review"]);
    expect(results[1].notice.body).toContain("ممكن تكون نفس العملية");
    const pending = await caller.pending();
    expect(pending).toHaveLength(2);
    expect(pending.filter((item) => item.possibleDuplicate)).toHaveLength(1);
  });

  it("does not bring back a recorded payment the user deleted when a late signal of it arrives", async () => {
    const text = "تم خصم EGP 450.00 من بطاقتك رقم 1234 عند CARREFOUR MAADI المتاح EGP 4,500.75";
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-del-01")] })).json();
    const { expenseId } = await caller.answer({ eventId: results[0].eventId, action: "record" });
    await deleteLedgerEntry(owner, expenseId!);

    const late = await (await post("/api/capture/v1/signals", { signals: [sms("signal-del-02", text)] })).json();
    expect(late.results[0]).toMatchObject({ result: "dismissed", eventId: results[0].eventId });
    expect(await caller.pending()).toHaveLength(0);
  });

  it("files a refund where its purchase was filed, as a negative row", async () => {
    const bought = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-ref-01", "300.00", "ZARA CITY STARS")] })).json();
    await caller.answer({ eventId: bought.results[0].eventId, action: "record", categoryId: "shopping", subCategoryId: "clothes" });

    const refund = sms("signal-ref-02", "تم استرداد مبلغ 300.00 جنيه من ZARA CITY STARS إلى بطاقتك رقم 1234");
    const returned = await (await post("/api/capture/v1/signals", { signals: [refund] })).json();
    expect(returned.results[0]).toMatchObject({ result: "review" });
    await caller.answer({ eventId: returned.results[0].eventId, action: "record" });

    const rows = await db.select().from(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, "local")));
    const negative = rows.find((row) => Number(row.amount) < 0);
    expect(negative).toMatchObject({ category: "تسوق", subCategory: "ملابس", type: "expense" });
    expect(Number(negative!.amount)).toBe(-300);
  });

  it("records on the card's wallet and moves its balance to the message's", async () => {
    await db.insert(userWallets).values({ userId: owner.userId, userType: "local", name: "CIB Visa", provider: "Visa", lastFourDigits: "1234", balance: "100.00" });
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-wal-01")] })).json();
    const { expenseId } = await caller.answer({ eventId: results[0].eventId, action: "record" });

    const [wallet] = await db.select().from(userWallets).where(and(eq(userWallets.userId, owner.userId), eq(userWallets.userType, "local")));
    const [row] = await db.select().from(expenses).where(eq(expenses.id, expenseId!));
    expect(row.walletId).toBe(wallet.id);
    expect(Number(wallet.balance)).toBe(4500.75);
    expect(wallet.balanceSource).toBe("bank_message");
  });

  it("holds what is over the free limit, says so once, gives a dismissed one back, and releases it all on an upgrade", async () => {
    await db.insert(systemSettings).values({ key: "capture_monthly_limit_free", value: "2" }).onDuplicateKeyUpdate({ set: { value: "2" } });
    invalidateSettingsCache();
    const buy = (id: string, amount: string) => post("/api/capture/v1/signals", { signals: [purchase(id, amount)] }).then((reply) => reply.json());

    const first = await buy("signal-lim-01", "101.00");
    await buy("signal-lim-02", "102.00");
    const third = await buy("signal-lim-03", "103.00");
    const fourth = await buy("signal-lim-04", "104.00");
    expect(first.results[0].result).toBe("review");
    expect(third.results[0]).toMatchObject({ result: "held" });
    expect(third.results[0].notice.title).toBe("وصلت لحد الشهر");
    expect(fourth.results[0]).toMatchObject({ result: "held" });
    expect(fourth.results[0].notice).toBeUndefined();
    expect((await caller.status()).usage).toMatchObject({ limit: 2, used: 2, held: 2 });

    // "Not mine" does not count: the next payment fits again.
    await caller.answer({ eventId: first.results[0].eventId, action: "dismiss" });
    expect((await buy("signal-lim-05", "105.00")).results[0].result).toBe("review");
    expect(await caller.pending()).toHaveLength(2);

    await db.update(localUsers).set({ plan: "pro" }).where(eq(localUsers.id, owner.userId));
    const upgraded = captureRouter.createCaller({ user: { id: owner.userId, type: "local", role: "user", plan: "pro", name: "Capture Test" } } as never);
    const pending = await upgraded.pending();
    expect(pending).toHaveLength(4);
    expect((await upgraded.status()).usage).toMatchObject({ limit: 0, held: 0 });

    await db.delete(systemSettings).where(eq(systemSettings.key, "capture_monthly_limit_free"));
    invalidateSettingsCache();
  });

  const setting = async (key: string, value: string) => {
    await db.insert(systemSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
    invalidateSettingsCache();
  };
  const clearSetting = async (key: string) => {
    await db.delete(systemSettings).where(eq(systemSettings.key, key));
    invalidateSettingsCache();
  };
  const streakOf = async () => (await db.select({ streak: localUsers.currentStreak }).from(localUsers).where(eq(localUsers.id, owner.userId)))[0]?.streak ?? 0;

  it("remembers where the user filed a merchant, from an answer and from an edit of the row", async () => {
    const first = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-mem-01", "60.00", "BIM MARKET")] })).json();
    const { expenseId } = await caller.answer({ eventId: first.results[0].eventId, action: "record", categoryId: "food", subCategoryId: "groceries" });

    await post("/api/capture/v1/signals", { signals: [purchase("signal-mem-02", "75.00", "BIM MARKET")] });
    const [next] = await caller.pending();
    expect(next.suggestion).toMatchObject({ categoryId: "food", subCategoryId: "groceries", from: "memory" });

    await updateLedgerEntry(owner, expenseId!, { category: "تسوق", subCategory: "عام" });
    const [after] = await caller.pending();
    expect(after.suggestion).toMatchObject({ categoryId: "shopping", from: "memory" });
  });

  it("records an opened pair on its own without the streak, and takes it back on undo", async () => {
    await setting("capture_auto_pairs", "cib:card_purchase");
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-auto-01")] })).json();
    await clearSetting("capture_auto_pairs");

    expect(results[0]).toMatchObject({ result: "recorded" });
    expect(results[0].notice.actions).toEqual(["undo"]);
    expect(results[0].notice.title).toContain("اتسجلت");
    const [row] = await db.select().from(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, "local")));
    expect((row.parsedMetadata as { capture: { auto: boolean } }).capture.auto).toBe(true);
    expect(await streakOf()).toBe(0);

    const undo = await (await post("/api/capture/v1/actions", { actionId: "action-undo-1", eventId: results[0].eventId, action: "undo" })).json();
    expect(undo.result).toBe("dismissed");
    expect(await db.select().from(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, "local")))).toHaveLength(0);
    expect((await caller.status()).usage.used).toBe(0);
  });

  it("offers a bank and kind after three confirmed in a row, and records it on its own once the user agrees", async () => {
    for (const [index, amount] of ["11.00", "12.00", "13.00"].entries()) {
      const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase(`signal-pair-0${index}`, amount)] })).json();
      await caller.answer({ eventId: results[0].eventId, action: "record" });
    }
    const offers = await caller.autoOffers();
    expect(offers).toMatchObject([{ sourceSlug: "cib", kind: "card_purchase" }]);

    await caller.setAuto({ sourceSlug: "cib", kind: "card_purchase", enabled: true });
    expect(await caller.autoOffers()).toHaveLength(0);
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-pair-04", "14.00")] })).json();
    expect(results[0].result).toBe("recorded");
  });

  it("sends only the day's number of question notifications; the rest wait in the app", async () => {
    await setting("capture_daily_question_notices", "1");
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-q-01", "21.00"), purchase("signal-q-02", "22.00")] })).json();
    await clearSetting("capture_daily_question_notices");

    expect(results[0].notice).toBeDefined();
    expect(results[1]).toMatchObject({ result: "review" });
    expect(results[1].notice).toBeUndefined();
    expect(await caller.pending()).toHaveLength(2);
  });

  describe("a message the reader is unsure of", () => {
    const unread = (id: string) => ({ ...purchase(id), text: "تم خصم مبلغ من بطاقتكم رقم ****1234 لدى CARREFOUR MAADI" });
    const twoAmounts = (id: string) => ({ ...purchase(id), text: "CIB: Your card **1234 was charged EGP 250.00 and EGP 30.00 at CARREFOUR" });
    const notices = async () => (await app.request("/api/capture/v1/notices", { headers: { "x-capture-device": token } })).json();
    const later = (minutes: number) => () => new Date(Date.now() + minutes * 60_000);
    // The route also wakes the reader in this process, and a row it is claiming is skipped here: wait until no job of
    // this user is due or being read.
    const drain = async (max = 5, now: () => Date = () => new Date()) => {
      for (let i = 0; i < 100; i++) {
        await drainCaptureModel(max, now);
        const busy = await db
          .select({ id: captureAiJobs.id })
          .from(captureAiJobs)
          .where(and(eq(captureAiJobs.userId, owner.userId), inArray(captureAiJobs.status, ["queued", "running"]), lte(captureAiJobs.nextAt, now())));
        if (busy.length === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };

    it("is dropped without the user's consent to the model when it has no amount", async () => {
      const { results } = await (await post("/api/capture/v1/signals", { signals: [unread("signal-ai-01")] })).json();
      expect(results[0]).toMatchObject({ result: "ignored", reason: "no_amount" });
    });

    it("is read by the model, asked once through the phone's notices, and recorded on the user's answer", async () => {
      await setCaptureConsent(owner, "ai_reading", true, CAPTURE_CONSENT_TEXT_VERSION);
      model.next = [modelPurchase];
      const { results } = await (await post("/api/capture/v1/signals", { signals: [unread("signal-ai-02")] })).json();
      expect(results[0]).toEqual({ id: "signal-ai-02", result: "queued" });
      await drain();

      const first = await notices();
      expect(first.pending).toBe(0);
      expect(first.notices).toHaveLength(1);
      expect(first.notices[0].notice.actions).toEqual(["record", "dismiss"]);
      expect((await notices()).notices).toHaveLength(0);

      const eventId = first.notices[0].eventId;
      const [event] = await db.select().from(captureEvents).where(eq(captureEvents.id, eventId));
      expect(event).toMatchObject({ status: "review", amount: "450.00", cardSuffix: "1234", autoRecorded: false });
      expect(event.quotaPeriod).not.toBeNull();

      const answered = await (await post("/api/capture/v1/actions", { actionId: "action-ai-02", eventId, action: "record" })).json();
      expect(answered.result).toBe("recorded");
      const retry = await (await post("/api/capture/v1/signals", { signals: [unread("signal-ai-02")] })).json();
      expect(retry.results[0]).toMatchObject({ result: "recorded", eventId });
    });

    it("keeps nothing the model reads as no money moved", async () => {
      await setCaptureConsent(owner, "ai_reading", true, CAPTURE_CONSENT_TEXT_VERSION);
      model.next = [{ outcome: "not_transaction", verdict: "not_transaction", skipped: false }];
      await post("/api/capture/v1/signals", { signals: [unread("signal-ai-03")] });
      await drain();
      expect(await db.select().from(captureEvents).where(eq(captureEvents.userId, owner.userId))).toHaveLength(0);
      const [job] = await db.select().from(captureAiJobs).where(eq(captureAiJobs.userId, owner.userId));
      expect(job).toMatchObject({ status: "done", outcome: "not_transaction" });
      expect(await notices()).toEqual({ notices: [], pending: 0 });
    });

    it("tries a failing model three times, then asks with the reader's own reading", async () => {
      await setCaptureConsent(owner, "ai_reading", true, CAPTURE_CONSENT_TEXT_VERSION);
      model.next = [{ outcome: "failed" }, { outcome: "failed" }, { outcome: "failed" }];
      await post("/api/capture/v1/signals", { signals: [twoAmounts("signal-ai-04")] });
      await drain();
      expect((await notices()).pending).toBe(1);
      await drain(5, later(1));
      await drain(5, later(5));
      const [job] = await db.select().from(captureAiJobs).where(eq(captureAiJobs.userId, owner.userId));
      expect(job).toMatchObject({ status: "done", outcome: "failed", attempts: 3 });
      const [event] = await db.select().from(captureEvents).where(eq(captureEvents.id, job.eventId!));
      // The reader's unsure reading counts against the month only when the user records it.
      expect(event).toMatchObject({ status: "review", amount: "250.00", quotaPeriod: null });
    });
  });

  describe("running capture", () => {
    const recordAlone = async (count: number) => {
      await setting("capture_auto_pairs", "cib:card_purchase");
      const signals = Array.from({ length: count }, (_, i) => purchase(`signal-ops-${String(i).padStart(2, "0")}`, `${100 + i}.00`, `SHOP ${i} MAADI`));
      const { results } = await (await post("/api/capture/v1/signals", { signals })).json();
      await clearSetting("capture_auto_pairs");
      expect(results.every((result: { result: string }) => result.result === "recorded")).toBe(true);
      return results as Array<{ eventId: number }>;
    };
    const ledger = () => db.select().from(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, "local")));

    it("stops recording a bank on its own when too many of its recordings are taken back", async () => {
      const results = await recordAlone(20);
      for (const [i, { eventId }] of results.slice(0, 2).entries()) {
        await post("/api/capture/v1/actions", { actionId: `action-ops-undo-${i}`, eventId, action: "undo" });
      }
      try {
        expect(await runCaptureBreaker()).toEqual(["cib"]);
        expect(autoPolicyOf(await getSystemSettings()).paused.has("cib")).toBe(true);
        expect(await runCaptureBreaker()).toEqual([]);
        const funnel = await captureFunnel(1);
        expect(funnel.rows.find((row) => row.sourceSlug === "cib" && row.kind === "card_purchase")).toMatchObject({ auto: 20, autoUndone: 2, recorded: 18 });
      } finally {
        await clearSetting("capture_paused_sources");
      }
    });

    it("takes back one bank's recordings in a period, counting first, and gives the month back", async () => {
      await recordAlone(3);
      const range = { sourceSlug: "cib", from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000), onlyAuto: true };
      expect(await previewBulkUndo(range)).toMatchObject({ rows: 3 });
      expect(await previewBulkUndo({ ...range, readerVersion: "reader-v0" })).toMatchObject({ rows: 0 });
      expect(await ledger()).toHaveLength(3);

      expect(await applyBulkUndo(range)).toBe(3);
      expect(await ledger()).toHaveLength(0);
      expect((await caller.status()).usage.used).toBe(0);
      const events = await db.select({ status: captureEvents.status }).from(captureEvents).where(eq(captureEvents.userId, owner.userId));
      expect(events.map((event) => event.status)).toEqual(["deleted", "deleted", "deleted"]);
    });
  });

  describe("who may send, and how much", () => {
    const wallet = () => db.select().from(userWallets).where(and(eq(userWallets.userId, owner.userId), eq(userWallets.userType, "local")));

    it("refuses a build older than the oldest allowed", async () => {
      const old = await app.request("/api/capture/v1/signals", {
        method: "POST",
        headers: { "content-type": "application/json", "x-capture-device": token, "x-client-version": "0.1.0" },
        body: JSON.stringify({ signals: [purchase("signal-old-01")] }),
      });
      expect(old.status).toBe(426);
      expect(await old.json()).toEqual({ error: "update_required" });
    });

    it("is closed to a user outside the beta list, and opens again when the list is empty", async () => {
      await setting("capture_beta_users", "local:1");
      try {
        expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-beta-01")] })).status).toBe(503);
        expect((await caller.status()).enabled).toBe(false);
        await expect(caller.registerDevice({ platform: "android", installationId: "install-beta-01" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      } finally {
        await clearSetting("capture_beta_users");
      }
      expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-beta-02")] })).status).toBe(200);
    });

    it("lets a free user register two phones", async () => {
      await caller.registerDevice({ platform: "android", installationId: "install-0002" });
      await expect(caller.registerDevice({ platform: "android", installationId: "install-0003" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("stops a user's phones for the day past the daily cap, and tells them when to come back", async () => {
      await setting("capture_daily_signal_limit", "3");
      try {
        expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-day-01"), purchase("signal-day-02", "20.00")] })).status).toBe(200);
        const over = await post("/api/capture/v1/signals", { signals: [purchase("signal-day-03", "30.00"), purchase("signal-day-04", "40.00")] });
        expect(over.status).toBe(429);
        expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
        expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-day-05", "50.00")] })).status).toBe(200);
      } finally {
        await clearSetting("capture_daily_signal_limit");
      }
    });

    it("drops the messages of a card the user ignores, and keeps nothing of them", async () => {
      const marker = await caller.ignore({ kind: "ignore_card", value: "1234" });
      expect(marker.value).toBe("234");
      await expect(caller.ignore({ kind: "ignore_phrase", value: "EGP" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-ign-01")] })).json();
      expect(results[0]).toMatchObject({ result: "ignored", reason: "user_ignored" });
      expect(await db.select().from(captureSignals).where(eq(captureSignals.userId, owner.userId))).toHaveLength(0);

      await caller.unignore({ id: marker.id });
      expect(await caller.ignored()).toHaveLength(0);
      const again = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-ign-02")] })).json();
      expect(again.results[0].result).toBe("review");
    });

    it("moves a card's wallet to the balance a balance-only message gives, and keeps nothing else", async () => {
      await db.insert(userWallets).values({ userId: owner.userId, userType: "local", name: "CIB Visa", provider: "Visa", lastFourDigits: "1234", balance: "100.00" });
      const balance = { ...purchase("signal-bal-01"), text: "Your available balance on card **1234 is EGP 3,200.50" };
      const { results } = await (await post("/api/capture/v1/signals", { signals: [balance] })).json();
      expect(results[0]).toMatchObject({ result: "ignored", reason: "balance_only" });
      const [row] = await wallet();
      expect(Number(row.balance)).toBe(3200.5);
      expect(row.balanceSource).toBe("bank_message");
      expect(await db.select().from(captureEvents).where(eq(captureEvents.userId, owner.userId))).toHaveLength(0);
    });
  });

  it("never lets a Google account with the same id answer, and stops a revoked phone", async () => {
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-05")] })).json();
    const sameIdOtherKind = captureRouter.createCaller({ user: { id: owner.userId, type: "oauth", role: "user", plan: "free", name: "Other" } } as never);
    await expect(sameIdOtherKind.answer({ eventId: results[0].eventId, action: "record" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await sameIdOtherKind.pending()).toHaveLength(0);

    await revokeCaptureDevice(owner, deviceId);
    expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-06")] })).status).toBe(401);
  });

  it("refuses without consent, while switched off, and without a device token", async () => {
    await setCaptureConsent(owner, "capture", false, CAPTURE_CONSENT_TEXT_VERSION);
    expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-07")] })).status).toBe(403);

    await setEnabled(false);
    expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-08")] })).status).toBe(503);
    expect((await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-09")] }, "cap_unknown")).status).toBe(401);

    const config = await (await app.request("/api/capture/v1/config", { headers: { "x-capture-device": token } })).json();
    expect(config).toMatchObject({ enabled: false, consent: { capture: false } });
  });
});
