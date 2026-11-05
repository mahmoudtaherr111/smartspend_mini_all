/** Synthetic sms-v5 replies (number labels); exercises HTTP, durable jobs and real MySQL, never a paid provider. */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../api/queries/connection";
import {
  captureAiJobs,
  captureConsents,
  captureDevices,
  captureEvents,
  captureQuestions,
  captureSamples,
  captureMarkers,
  captureMemory,
  captureSignals,
  captureUsage,
  captureUserPairs,
  expenseDailyRollups,
  expenses,
  localUsers,
  systemSettings,
  userWallets,
  userContacts,
} from "../db/schema";
import { registerCaptureRoutes } from "../api/capture-v1-routes";
import { registerCaptureDevice } from "../api/lib/capture/devices";
import {
  setCaptureConsent,
  CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION as CAPTURE_CONSENT_TEXT_VERSION,
} from "../api/lib/capture/consent";
import { syncCaptureSeed } from "../api/lib/capture/catalog";
import { invalidateSettingsCache } from "../api/lib/settings-cache";
import {
  checkCaptureReply,
  labelAmounts,
  proposeCapturePosting,
  type CaptureModelReply,
} from "../api/lib/capture/model-contract";
import { drainCaptureModel } from "../api/lib/capture/ai-queue";
import { captureRouter } from "../api/capture-router";
import { expenseRouter } from "../api/expense-router";
import { updateLedgerEntry } from "../api/services/ledger-writer";
import { getFinanceSummary } from "../api/services/finance-semantic-layer";
import { walletRouter } from "../api/wallet-router";
import { releaseHeldEvents } from "../api/lib/capture/intake";
import { nextPurposeQuestion } from "../api/lib/capture/questions";

const fake = vi.hoisted(() => ({
  reply: null as CaptureModelReply | null,
  afterRead: null as (() => Promise<void>) | null,
}));
vi.mock("../api/lib/capture/model-reader", async (original) => ({
  ...(await original<typeof import("../api/lib/capture/model-reader")>()),
  readCaptureWithModel: vi.fn(async (text: { text: string }) => {
    const check = checkCaptureReply(fake.reply, labelAmounts(text.text));
    if (!check.ok) return { outcome: "invalid_reply" };
    await fake.afterRead?.();
    return {
      outcome: "read",
      check,
      proposal: proposeCapturePosting(check),
      model: "synthetic-model",
      provider: "synthetic-a",
    };
  }),
}));

const owner = { userId: 88824, userType: "local" };
const own = <T extends { userId: unknown; userType: unknown }>(table: T) =>
  and(
    eq(table.userId as never, owner.userId),
    eq(table.userType as never, owner.userType),
  );
const keys = [
  "capture_enabled",
  "capture_financial_version",
  "capture_monthly_limit_free",
  "capture_questions_enabled",
  "capture_samples_enabled",
];
const text =
  "Successful purchase EGP 100 including service fee EGP 5 at ZED MARKET. Available balance EGP 900.";
const reply: CaptureModelReply = {
  status: "completed",
  kind: "purchase",
  direction: "out",
  amount: "N1",
  amountEgp: null,
  fee: "N2",
  feeIncluded: true,
  balance: "N3",
  party: "ZED MARKET",
  partyType: "merchant",
  method: "card",
  category: null,
  subcategory: null,
  recurring: false,
};

describe.runIf(process.env.RUN_DB_INTEGRATION === "1")(
  "automatic model-first recording",
  () => {
    const app = new Hono();
    registerCaptureRoutes(app);
    const caller = captureRouter.createCaller({
      user: {
        id: owner.userId,
        type: "local",
        role: "user",
        plan: "free",
        name: "Synthetic",
      },
    } as never);
    const ledger = expenseRouter.createCaller({ user: { id: owner.userId, type: "local", role: "user", plan: "free", name: "Synthetic" } } as never);
    let token = "";
    async function setting(key: string, value: string) {
      await db
        .insert(systemSettings)
        .values({ key, value })
        .onDuplicateKeyUpdate({ set: { value } });
      invalidateSettingsCache();
    }
    async function clean() {
      for (const table of [
        captureAiJobs,
        captureSignals,
        captureEvents,
        captureQuestions,
        captureSamples,
        captureUsage,
        captureMemory,
        captureUserPairs,
        captureMarkers,
        captureConsents,
        captureDevices,
        expenseDailyRollups,
        expenses,
        userWallets,
        userContacts,
      ])
        await db.delete(table).where(own(table));
      await db.delete(localUsers).where(eq(localUsers.id, owner.userId));
    }
    beforeAll(async () => {
      await syncCaptureSeed();
    });
    beforeEach(async () => {
      await clean();
      await db
        .insert(localUsers)
        .values({
          id: owner.userId,
          name: "Synthetic",
          phone: "synthetic-automatic",
          password: "synthetic",
        });
      for (const [key, value] of Object.entries({
        capture_enabled: "true",
        capture_financial_version: "cashflow-v1",
        capture_monthly_limit_free: "50",
        capture_questions_enabled: "true",
        capture_samples_enabled: "false",
      }))
        await setting(key, value);
      ({ token } = await registerCaptureDevice(owner, {
        platform: "android",
        installationId: "synthetic-automatic",
      }));
      for (const scope of ["capture", "ai_reading", "purpose_questions"] as const)
        await setCaptureConsent(
          owner,
          scope,
          true,
          CAPTURE_CONSENT_TEXT_VERSION,
        );
      fake.reply = { ...reply };
      fake.afterRead = null;
    });
    afterAll(async () => {
      await clean();
      await db.delete(systemSettings).where(inArray(systemSettings.key, keys));
      invalidateSettingsCache();
    });
    const send = async (id: string, message = text, expectFinished = true, extra: Record<string, unknown> = {}) => {
      const response = await app.request("/api/capture/v1/signals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-capture-device": token,
        },
        body: JSON.stringify({
          signals: [
            {
              id,
              channel: "notification",
              app: "com.cibeg.ddc1.digitalbanking.live",
              text: message,
              postedAt: new Date().toISOString(),
              ...extra,
            },
          ],
        }),
      });
      expect(response.status).toBe(200);
      await drainCaptureModel(10);
      for (let n = 0; n < 200; n++) {
        const jobs = await db
          .select()
          .from(captureAiJobs)
          .where(own(captureAiJobs));
        if (
          !expectFinished &&
          jobs.length &&
          jobs.every(
            (job) =>
              job.status === "done" ||
              (job.status === "queued" && job.outcome !== null),
          )
        )
          return response.json();
        if (jobs.length && jobs.every((job) => job.status === "done"))
          return response.json();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("synthetic_job_not_finished");
    };
    it("records principal plus fee without confirmation, counts once, and retries without another row", async () => {
      await send("synthetic-auto-01");
      await send("synthetic-auto-01");
      const rows = await db.select().from(expenses).where(own(expenses));
      expect(
        rows.map((row) => Number(row.amount)).sort((a, b) => a - b),
      ).toEqual([5, 95]);
      expect(
        rows.every((row) => row.type === "expense" && row.rawText === null),
      ).toBe(true);
      const [event] = await db
        .select()
        .from(captureEvents)
        .where(own(captureEvents));
      expect(event).toMatchObject({ status: "recorded", autoRecorded: true });
      const [usage] = await db
        .select()
        .from(captureUsage)
        .where(own(captureUsage));
      expect(usage.reserved).toBe(1);
      expect(await caller.pending()).toEqual([]);
      const grouped = await ledger.list({ groupLinkedFees: true, limit: 50 });
      expect(grouped.items).toHaveLength(1);
      expect(grouped.items[0].bundle).toMatchObject({ principalAmount: "95.00", feeAmount: "5.00", totalAmount: "100.00" });
      expect((await ledger.list({ limit: 50 })).items).toHaveLength(2);
      expect((await ledger.getById({ id: grouped.items[0].id }))?.bundle).toMatchObject({ feeAmount: "5.00" });
      const [job] = await db
        .select()
        .from(captureAiJobs)
        .where(own(captureAiJobs));
      expect((job.notice as { body: string }).body).toContain("100");
      const summary = await getFinanceSummary(owner);
      expect(summary.totalExpense).toBe(100);
    });
    it("keeps a later category edit and undo removes both rows and returns the single quota", async () => {
      await send("synthetic-auto-02");
      const [event] = await db
        .select()
        .from(captureEvents)
        .where(own(captureEvents));
      await updateLedgerEntry(owner, event.expenseId!, {
        category: "تسوق",
        subCategory: "عام",
      });
      const outstanding = await app.request("/api/capture/v1/notices", { headers: { "x-capture-device": token } });
      expect((await outstanding.json()).notices).toEqual([]);
      await send("synthetic-auto-02");
      const [principal] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, event.expenseId!));
      expect(principal.category).toBe("تسوق");
      expect(
        await caller.answer({ eventId: event.id, action: "undo" }),
      ).toMatchObject({ result: "dismissed" });
      expect(await db.select().from(expenses).where(own(expenses))).toEqual([]);
      const [usage] = await db
        .select()
        .from(captureUsage)
        .where(own(captureUsage));
      expect(usage.reserved).toBe(0);
      await send("synthetic-auto-02");
      expect(await db.select().from(expenses).where(own(expenses))).toEqual([]);
    });
    it("withholds an unresolved fee relationship without saving a guessed amount", async () => {
      // A foreign charge with no pound value: the amount is not guessed, the user finishes it.
      fake.reply = { ...reply, fee: null, balance: null };
      await send("synthetic-auto-03", "Successful purchase USD 20 at ZED MARKET.");
      expect(await db.select().from(expenses).where(own(expenses))).toEqual([]);
      const [job] = await db
        .select()
        .from(captureAiJobs)
        .where(own(captureAiJobs));
      expect(job.outcome).toBe("review");
      expect(await caller.activity()).toEqual([
        expect.objectContaining({ state: "review", amountEgp: null }),
      ]);
      expect(await caller.pending()).toHaveLength(1);
      const other = captureRouter.createCaller({
        user: { id: owner.userId, type: "oauth", role: "user", plan: "free" },
      } as never);
      expect(await other.activity()).toEqual([]);
    });
    const feeText =
      "Successful payment of service fee EGP 5. Reference 123456789012.";
    const feeReply: CaptureModelReply = {
      ...reply,
      kind: "fee",
      amount: "N1",
      fee: null,
      feeIncluded: null,
      balance: null,
      party: null,
      partyType: "bank",
      category: null,
    };
    it("does not charge quota or record a fee again when its separate signal arrives after the bundle", async () => {
      await send("synthetic-charge-first", `${text} Reference 123456789012.`);
      fake.reply = feeReply;
      await send("synthetic-fee-after", feeText);
      expect(
        await db.select().from(expenses).where(own(expenses)),
      ).toHaveLength(2);
      expect(
        await db.select().from(captureEvents).where(own(captureEvents)),
      ).toHaveLength(1);
      const [usage] = await db
        .select()
        .from(captureUsage)
        .where(own(captureUsage));
      expect(usage.reserved).toBe(1);
    });
    it("adopts an earlier fee without overwriting edits and atomically undoes the whole movement once", async () => {
      fake.reply = feeReply;
      await send("synthetic-fee-first", feeText);
      const [fee] = await db.select().from(expenses).where(own(expenses));
      expect(fee).toBeDefined();
      await updateLedgerEntry(owner, fee.id, {
        amount: 7,
        category: "متنوعات",
        description: "Synthetic later edit",
      });
      fake.reply = reply;
      await send("synthetic-charge-after", `${text} Reference 123456789012.`);
      const rows = await db.select().from(expenses).where(own(expenses));
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === fee.id)).toMatchObject({
        amount: "7.00",
        description: "Synthetic later edit",
      });
      const [usage] = await db
        .select()
        .from(captureUsage)
        .where(own(captureUsage));
      expect(usage.reserved).toBe(1);
      const [parent] = await db
        .select()
        .from(captureEvents)
        .where(
          and(own(captureEvents), eq(captureEvents.kind, "card_purchase")),
        );
      await Promise.all([
        caller.answer({ eventId: parent.id, action: "undo" }),
        caller.answer({ eventId: parent.id, action: "undo" }),
      ]);
      expect(
        await db.select().from(expenses).where(own(expenses)),
      ).toHaveLength(0);
      const [after] = await db
        .select()
        .from(captureUsage)
        .where(own(captureUsage));
      expect(after.reserved).toBe(0);
    });
    it("honors an operator stop made while the provider was reading", async () => {
      fake.afterRead = () => setting("capture_enabled", "false");
      await send("synthetic-stop-in-flight", text, false);
      expect(
        await db.select().from(expenses).where(own(expenses)),
      ).toHaveLength(0);
      const [job] = await db
        .select()
        .from(captureAiJobs)
        .where(own(captureAiJobs));
      expect(job).toMatchObject({
        status: "queued",
        outcome: "disabled",
      });
    });
    it("joins proved own-account legs into two wallet views without overwriting a later note", async () => {
      const [bank] = await db
        .insert(userWallets)
        .values({
          ...owner,
          name: "Synthetic bank",
          provider: "bank",
          lastFourDigits: "1234",
        });
      const [cash] = await db
        .insert(userWallets)
        .values({
          ...owner,
          name: "Synthetic cash",
          provider: "cash",
          lastFourDigits: "5678",
        });
      fake.reply = {
        ...reply,
        kind: "transfer",
        amount: "N1",
        fee: null,
        feeIncluded: null,
        balance: null,
        party: null,
        partyType: "own_account",
        method: "bank_transfer",
      };
      await send(
        "synthetic-own-out",
        "Successful transfer. Sent EGP 100 between your accounts from card ending 1234. Reference 123456789012.",
      );
      const [row] = await db.select().from(expenses).where(own(expenses));
      expect(row).toBeDefined();
      await updateLedgerEntry(owner, row.id, {
        description: "Synthetic edited note",
      });
      fake.reply = { ...fake.reply, direction: "in" };
      await send(
        "synthetic-own-in",
        "Successful transfer. Received EGP 100 between your accounts to card ending 5678. Reference 123456789012.",
      );
      const rows = await db.select().from(expenses).where(own(expenses));
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("Synthetic edited note");
      expect(await getFinanceSummary(owner)).toMatchObject({
        totalIncome: 0,
        totalExpense: 0,
      });
      const wallets = walletRouter.createCaller({
        user: { id: owner.userId, type: "local", role: "user", plan: "pro" },
      } as never);
      expect(
        await wallets.getWalletMonth({ walletId: bank.insertId }),
      ).toMatchObject({ moneyOut: 100, moneyIn: 0 });
      expect(
        await wallets.getWalletMonth({ walletId: cash.insertId }),
      ).toMatchObject({ moneyOut: 0, moneyIn: 100 });
      const [usage] = await db
        .select()
        .from(captureUsage)
        .where(own(captureUsage));
      expect(usage.reserved).toBe(1);
    });
    it("edits/removes a linked fee atomically and a later bank signal cannot recreate the removed fee", async () => {
      await send("synthetic-edit-fee", `${text} Reference 123456789012.`);
      const [parent] = await db
        .select()
        .from(captureEvents)
        .where(own(captureEvents));
      await updateLedgerEntry(owner, parent.expenseId!, {
        amount: 90,
        linkedFeeAmount: 7,
      });
      expect((await getFinanceSummary(owner)).totalExpense).toBe(97);
      await updateLedgerEntry(owner, parent.expenseId!, { linkedFeeAmount: 0 });
      expect((await getFinanceSummary(owner)).totalExpense).toBe(90);
      expect((await caller.activity()).find((item) => item.state === "recorded")?.amountEgp).toBe(90);
      fake.reply = feeReply;
      await send("synthetic-after-fee-removed", feeText);
      expect(
        await db.select().from(expenses).where(own(expenses)),
      ).toHaveLength(1);
      const [usage] = await db
        .select()
        .from(captureUsage)
        .where(own(captureUsage));
      expect(usage.reserved).toBe(1);
    });
    it("holds over-limit movements and releases them automatically only after upgrade and active consent", async () => {
      await setting("capture_monthly_limit_free", "1");
      await send("synthetic-limit-first");
      fake.reply = { ...reply };
      await send(
        "synthetic-limit-held",
        text.replace("EGP 100", "EGP 200").replace("EGP 900", "EGP 800"),
      );
      expect((await caller.status()).usage).toMatchObject({ held: 1, used: 1 });
      expect(await releaseHeldEvents(owner)).toEqual({
        released: 0,
        recorded: 0,
      });
      await setCaptureConsent(
        owner,
        "ai_reading",
        false,
        CAPTURE_CONSENT_TEXT_VERSION,
      );
      await db
        .update(localUsers)
        .set({ plan: "pro" })
        .where(eq(localUsers.id, owner.userId));
      expect(await releaseHeldEvents(owner)).toEqual({
        released: 0,
        recorded: 0,
      });
      await setCaptureConsent(
        owner,
        "ai_reading",
        true,
        CAPTURE_CONSENT_TEXT_VERSION,
      );
      expect(await releaseHeldEvents(owner)).toEqual({
        released: 1,
        recorded: 1,
      });
      expect((await getFinanceSummary(owner)).totalExpense).toBe(300);
      expect(await releaseHeldEvents(owner)).toEqual({
        released: 0,
        recorded: 0,
      });
      const [usage] = await db
        .select()
        .from(captureUsage)
        .where(own(captureUsage));
      expect(usage.reserved).toBe(2);
    });
    it("shows one post-save question across devices, edits the same row and learns the merchant only for this user", async () => {
      await send("synthetic-question-first");
      const questions = await Promise.all([caller.nextQuestion(), caller.nextQuestion(), caller.nextQuestion()]);
      expect(new Set(questions.map((question) => question?.questionId)).size).toBe(1);
      const question = questions[0]!; expect(question).toBeTruthy();
      expect(await caller.answerQuestion({ questionId: question.questionId, action: "set", categoryId: "food", subCategoryId: "general_food" })).toMatchObject({ result: "answered", expenseId: question.expenseId });
      // Another device's stale answer is idempotent and cannot overwrite the first choice.
      await caller.answerQuestion({ questionId: question.questionId, action: "set", categoryId: "health" });
      const rows = await db.select().from(expenses).where(own(expenses)); expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === question.expenseId)?.category).toBe("أكل وشرب");
      expect((await getFinanceSummary(owner)).totalExpense).toBe(100);
      const [usage] = await db.select().from(captureUsage).where(own(captureUsage)); expect(usage.reserved).toBe(1);
      fake.reply = { ...reply, fee: null, feeIncluded: null, balance: null };
      await send("synthetic-question-memory", "Successful purchase EGP 120 at ZED MARKET.");
      expect(await caller.nextQuestion()).toBeNull();
      const learned = await db.select().from(expenses).where(and(own(expenses), eq(expenses.amount, "120.00"))); expect(learned[0].category).toBe("أكل وشرب");
      const other = captureRouter.createCaller({ user: { id: owner.userId, type: "oauth", role: "user", plan: "free" } } as never);
      await expect(other.answerQuestion({ questionId: question.questionId, action: "keep" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("asks nothing after saving unless the user turned the questions on", async () => {
      await setCaptureConsent(owner, "purpose_questions", false, CAPTURE_CONSENT_TEXT_VERSION);
      await send("synthetic-question-off");
      expect(await caller.nextQuestion()).toBeNull();
      expect(await db.select().from(captureQuestions).where(own(captureQuestions))).toHaveLength(0);
      expect(await db.select().from(expenses).where(own(expenses))).toHaveLength(2);
    });
    it("limits new questions to three Cairo dayside displays, and skipping never asks that event again", async () => {
      for (let i = 0; i < 5; i++) {
        const amount = 100 + i;
        fake.reply = { ...reply, fee: null, feeIncluded: null, balance: null };
        await send(`synthetic-question-limit-${i}`, `Successful purchase EGP ${amount} at ZED MARKET.`);
      }
      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const question = await caller.nextQuestion(); expect(question).toBeTruthy(); ids.push(question!.questionId);
        await caller.answerQuestion({ questionId: question!.questionId, action: i === 0 ? "skip" : "keep" });
      }
      expect(new Set(ids).size).toBe(3); expect(await caller.nextQuestion()).toBeNull();
      const tomorrow = await nextPurposeQuestion(owner, new Date(Date.now() + 24 * 3600_000));
      expect(tomorrow).toBeTruthy(); expect(ids).not.toContain(tomorrow!.questionId);
      expect((await db.select().from(expenses).where(own(expenses)))).toHaveLength(5);
    });
    it("does not overwrite a newer category edit with a stale question, and retains free-text purpose locally", async () => {
      await send("synthetic-question-stale");
      const question = (await caller.nextQuestion())!;
      await updateLedgerEntry(owner, question.expenseId, { category: "تسوق", subCategory: "عام" });
      expect(await caller.answerQuestion({ questionId: question.questionId, action: "set", categoryId: "food" })).toMatchObject({ result: "superseded" });
      const [row] = await db.select().from(expenses).where(eq(expenses.id, question.expenseId)); expect(row.category).toBe("تسوق");
      // Use another merchant so the existing filing is not already learned.
      fake.reply = { ...reply, party: "OTHER MARKET" };
      await send("synthetic-question-purpose", text.replace("ZED MARKET", "OTHER MARKET"));
      const next = (await caller.nextQuestion())!; expect(next).toBeTruthy();
      await caller.answerQuestion({ questionId: next.questionId, action: "set", purpose: "دفعت مصاريف الحضانة" });
      const [answered] = await db.select().from(expenses).where(eq(expenses.id, next.expenseId));
      expect(answered.parsedMetadata).toMatchObject({ capture: { details: { purpose: "دفعت مصاريف الحضانة", categoryPending: false } } });
    });
    it("never turns the model's generic transfer category into ATM cash movement", async () => {
      fake.reply = { ...reply, kind: "transfer", fee: null, feeIncluded: null, balance: null, party: null, partyType: "unknown", category: "transfer", method: "bank_transfer" };
      await send("synthetic-transfer-category", "Successful transfer. Sent EGP 100.");
      const [row] = await db.select().from(expenses).where(own(expenses)); expect(row).toBeTruthy();
      expect(row.parsedMetadata).toMatchObject({ financial: { kind: "personal_transfer", excluded: false } });
      expect(row.subCategory).toBe("تحويل بنكي"); expect((await getFinanceSummary(owner)).totalExpense).toBe(100);
      const question = (await caller.nextQuestion())!;
      await caller.answerQuestion({ questionId: question.questionId, action: "set", movementKind: "own_transfer" });
      expect((await getFinanceSummary(owner)).totalExpense).toBe(0);
    });
    it("requires renewed consent instead of silently broadening an older grant", async () => {
      await db.update(captureConsents).set({ textVersion: "2026-11-04" }).where(own(captureConsents));
      expect((await caller.status()).consent).toEqual({ capture: false, aiReading: false, samples: false, questions: false });
      const rejected = await app.request("/api/capture/v1/signals", { method: "POST", headers: { "content-type": "application/json", "x-capture-device": token }, body: JSON.stringify({ signals: [{ id: "synthetic-old-consent", channel: "notification", app: "com.cibeg.ddc1.digitalbanking.live", text, postedAt: new Date().toISOString() }] }) });
      expect(rejected.status).toBe(403);
      expect(await db.select().from(captureAiJobs).where(own(captureAiJobs))).toHaveLength(0);
      for (const scope of ["capture", "ai_reading"] as const) await setCaptureConsent(owner, scope, true, CAPTURE_CONSENT_TEXT_VERSION);
      expect((await caller.status()).consent).toEqual({ capture: true, aiReading: true, samples: false, questions: false });
      await send("synthetic-current-consent");
      expect(await db.select().from(expenses).where(own(expenses))).toHaveLength(2);
    });
    it("respects an ignored card even when the shadow misses its plain ending wording", async () => {
      await caller.ignore({ kind: "ignore_card", value: "1234" });
      const response = await app.request("/api/capture/v1/signals", { method: "POST", headers: { "content-type": "application/json", "x-capture-device": token }, body: JSON.stringify({ signals: [{ id: "synthetic-ignored-ending", channel: "notification", app: "com.cibeg.ddc1.digitalbanking.live", text: `${text} Card ending 1234.`, postedAt: new Date().toISOString() }] }) });
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ results: [{ result: "ignored", reason: "user_ignored" }] });
      expect(await db.select().from(captureAiJobs).where(own(captureAiJobs))).toHaveLength(0);
      expect(await db.select().from(captureSignals).where(own(captureSignals))).toHaveLength(0);
    });
    it("links an explicitly chosen contact by a private full-phone identity and records a repayment automatically", async () => {
      const [person] = await db.insert(userContacts).values({ ...owner, name: "Synthetic contact", relation: "friend" });
      fake.reply = { ...reply, kind: "transfer", fee: null, feeIncluded: null, balance: null, party: "[PHONE_1]", partyType: "person", method: "wallet" };
      await send("synthetic-phone-loan", "Successful transfer. Sent EGP 100 to 01000000001.");
      const question = (await caller.nextQuestion())!; expect(question).toBeTruthy();
      await caller.answerQuestion({ questionId: question.questionId, action: "set", categoryId: "transfer", subCategoryId: "debt", contactId: person.insertId });
      fake.reply = { ...fake.reply, direction: "in" };
      await send("synthetic-phone-repayment", "Successful transfer. Received EGP 40 from +201000000001.");
      const rows = await db.select().from(expenses).where(own(expenses));
      expect(rows).toHaveLength(2); expect(rows.every((row) => row.contactId === person.insertId)).toBe(true);
      expect(JSON.stringify(rows)).not.toContain("01000000001");
      expect(await ledger.getDebtBalances()).toMatchObject({ balances: [expect.objectContaining({ contactId: person.insertId, balance: 60 })], owedToYou: 60 });
      expect(await getFinanceSummary(owner)).toMatchObject({ totalExpense: 100, totalIncome: 40 });
      const [contact] = await db.select().from(userContacts).where(eq(userContacts.id, person.insertId)); expect(contact.transactionCount).toBe(2);
    });
    it("matches an own-account principal when the outgoing debit includes a fee", async () => {
      const [bank] = await db.insert(userWallets).values({ ...owner, name: "Synthetic debit", provider: "bank", lastFourDigits: "1234" });
      const [cash] = await db.insert(userWallets).values({ ...owner, name: "Synthetic destination", provider: "cash", lastFourDigits: "5678" });
      fake.reply = { ...reply, kind: "transfer", balance: null, partyType: "own_account", party: null, method: "bank_transfer" };
      await send("synthetic-own-fee-out", "Successful transfer. Sent EGP 100 including service fee EGP 5 between your accounts from card ending 1234. Reference 111222333444.");
      fake.reply = { ...fake.reply, direction: "in", fee: null, feeIncluded: null };
      await send("synthetic-own-fee-in", "Successful transfer. Received EGP 95 between your accounts to card ending 5678. Reference 111222333444.");
      expect(await db.select().from(captureEvents).where(own(captureEvents))).toHaveLength(1);
      const wallets = walletRouter.createCaller({ user: { id: owner.userId, type: "local", role: "user", plan: "free" } } as never);
      expect(await wallets.getWalletMonth({ walletId: bank.insertId })).toMatchObject({ moneyOut: 100 });
      expect(await wallets.getWalletMonth({ walletId: cash.insertId })).toMatchObject({ moneyIn: 95 });
      const incoming = await wallets.getWalletTransactions({ walletId: cash.insertId, groupLinkedFees: true, limit: 20, offset: 0 });
      expect(incoming[0].bundle).toMatchObject({ totalAmount: "95.00", feeAmount: "0.00" });
      expect(await getFinanceSummary(owner)).toMatchObject({ totalExpense: 5, totalIncome: 0 });
      const [usage] = await db.select().from(captureUsage).where(own(captureUsage)); expect(usage.reserved).toBe(1);
    });

    it("keeps a redacted sample only with the switch and the samples consent, and forgets it when the consent is taken back", async () => {
      await send("synthetic-sample-01");
      expect(await db.select().from(captureSamples).where(own(captureSamples))).toHaveLength(0);
      await setting("capture_samples_enabled", "true");
      await send("synthetic-sample-02");
      expect(await db.select().from(captureSamples).where(own(captureSamples))).toHaveLength(0);
      await setCaptureConsent(owner, "message_samples", true, CAPTURE_CONSENT_TEXT_VERSION);
      await send("synthetic-sample-03");
      const samples = await db.select().from(captureSamples).where(own(captureSamples));
      expect(samples).toHaveLength(1);
      expect(samples[0]).toMatchObject({ promptVersion: "sms-v5", provider: "synthetic-a", model: "synthetic-model", channel: "notification" });
      expect(samples[0].textRedacted).toContain("ZED MARKET");
      expect(samples[0].posting).toMatchObject({ status: "ready", principalEgp: "95.00", feeEgp: "5.00" });
      expect(samples[0].receivedMonth).toMatch(/^\d{4}-\d{2}$/);
      await setCaptureConsent(owner, "message_samples", false, CAPTURE_CONSENT_TEXT_VERSION);
      expect(await db.select().from(captureSamples).where(own(captureSamples))).toHaveLength(0);
    });

    it("records an imported past message without a notice for the phone", async () => {
      await send("synthetic-import-01", text, true, { imported: true });
      const rows = await db.select().from(expenses).where(own(expenses));
      expect(rows.map((row) => Number(row.amount)).sort((a, b) => a - b)).toEqual([5, 95]);
      const [job] = await db.select().from(captureAiJobs).where(own(captureAiJobs));
      expect(job.notice).toBeNull();
      expect(job.noticeDeliveredAt).not.toBeNull();
    });
  },
);
