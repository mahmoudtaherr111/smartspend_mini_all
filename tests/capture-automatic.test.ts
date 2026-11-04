/** Synthetic transport replies; exercises HTTP, durable jobs and real MySQL, never a paid provider. */
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
} from "../db/schema";
import { registerCaptureRoutes } from "../api/capture-v1-routes";
import { registerCaptureDevice } from "../api/lib/capture/devices";
import {
  setCaptureConsent,
  CAPTURE_CONSENT_TEXT_VERSION,
} from "../api/lib/capture/consent";
import { syncCaptureSeed } from "../api/lib/capture/catalog";
import { invalidateSettingsCache } from "../api/lib/settings-cache";
import {
  checkCaptureReply,
  proposeCapturePosting,
  type CaptureModelReply,
} from "../api/lib/capture/model-contract";
import { CAPTURE_PROMPT_DIGEST } from "../api/lib/capture/model-reader";
import { drainCaptureModel } from "../api/lib/capture/ai-queue";
import { captureRouter } from "../api/capture-router";
import { updateLedgerEntry } from "../api/services/ledger-writer";
import { getFinanceSummary } from "../api/services/finance-semantic-layer";
import { walletRouter } from "../api/wallet-router";
import { releaseHeldEvents } from "../api/lib/capture/intake";

const fake = vi.hoisted(() => ({
  reply: null as CaptureModelReply | null,
  afterRead: null as (() => Promise<void>) | null,
}));
vi.mock("../api/lib/capture/model-reader", async (original) => ({
  ...(await original<typeof import("../api/lib/capture/model-reader")>()),
  readCaptureWithModel: vi.fn(async (text: { text: string }) => {
    const check = checkCaptureReply(fake.reply, text.text);
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
  "capture_read_mode",
  "capture_financial_version",
  "capture_model_qualified",
  "capture_monthly_limit_free",
];
const text =
  "Successful purchase EGP 100 including service fee EGP 5 at ZED MARKET. Available balance EGP 900.";
const reply: CaptureModelReply = {
  state: "done",
  stateQuote: "Successful purchase",
  type: "purchase",
  flow: "out",
  flowQuote: "Successful purchase",
  ownership: "unknown",
  ownershipQuote: null,
  amount: { value: 100, currency: "EGP", quote: "purchase EGP 100" },
  egp: null,
  fee: {
    value: 5,
    currency: "EGP",
    quote: "service fee EGP 5",
    includedInAmount: true,
    inclusionQuote: "purchase EGP 100 including service fee EGP 5",
  },
  balance: { value: 900, currency: "EGP", quote: "Available balance EGP 900" },
  limit: null,
  partyType: "merchant",
  party: "ZED MARKET",
  partyQuote: "at ZED MARKET",
  via: "card",
  category: null,
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
        captureUsage,
        captureMemory,
        captureUserPairs,
        captureMarkers,
        captureConsents,
        captureDevices,
        expenseDailyRollups,
        expenses,
        userWallets,
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
        capture_read_mode: "model_first",
        capture_financial_version: "cashflow-v1",
        capture_monthly_limit_free: "50",
        capture_model_qualified: JSON.stringify({
          version: "sms-v4",
          digest: CAPTURE_PROMPT_DIGEST,
          routes: [
            { slug: "synthetic-a", model: "synthetic-model" },
            { slug: "synthetic-b", model: "synthetic-model" },
          ],
          pairs: ["cib:purchase", "cib:fee", "cib:transfer"],
          dataProcessingApproved: true,
        }),
      }))
        await setting(key, value);
      ({ token } = await registerCaptureDevice(owner, {
        platform: "android",
        installationId: "synthetic-automatic",
      }));
      for (const scope of ["capture", "ai_reading"] as const)
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
    const send = async (id: string, message = text, expectFinished = true) => {
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
      fake.reply = {
        ...reply,
        fee: { ...reply.fee!, includedInAmount: null, inclusionQuote: null },
      };
      await send("synthetic-auto-03");
      expect(await db.select().from(expenses).where(own(expenses))).toEqual([]);
      const [job] = await db
        .select()
        .from(captureAiJobs)
        .where(own(captureAiJobs));
      expect(job.outcome).toMatch(/^waiting_/);
      expect(await caller.activity()).toEqual([
        expect.objectContaining({ state: "waiting", amountEgp: null }),
      ]);
      const other = captureRouter.createCaller({
        user: { id: owner.userId, type: "oauth", role: "user", plan: "free" },
      } as never);
      expect(await other.activity()).toEqual([]);
    });
    const feeText =
      "Successful payment of service fee EGP 5. Reference 123456789012.";
    const feeReply: CaptureModelReply = {
      ...reply,
      type: "fee",
      stateQuote: "Successful payment",
      flowQuote: "payment",
      amount: { value: 5, currency: "EGP", quote: "fee EGP 5" },
      fee: null,
      balance: null,
      party: null,
      partyQuote: null,
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
        outcome: "configuration_changed",
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
        type: "transfer",
        stateQuote: "Successful transfer",
        flowQuote: "Sent",
        amount: { value: 100, currency: "EGP", quote: "Sent EGP 100" },
        fee: null,
        balance: null,
        party: null,
        partyQuote: null,
        partyType: "own",
        ownership: "own",
        ownershipQuote: "between your accounts",
        via: "bank_transfer",
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
      fake.reply = {
        ...fake.reply,
        flow: "in",
        flowQuote: "Received",
        amount: { value: 100, currency: "EGP", quote: "Received EGP 100" },
      };
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
      fake.reply = {
        ...reply,
        amount: { value: 200, currency: "EGP", quote: "purchase EGP 200" },
        fee: {
          ...reply.fee!,
          inclusionQuote: "purchase EGP 200 including service fee EGP 5",
        },
        balance: {
          value: 800,
          currency: "EGP",
          quote: "Available balance EGP 800",
        },
      };
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
  },
);
