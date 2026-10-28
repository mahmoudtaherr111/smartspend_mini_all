import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { captureConsents, captureDevices, captureSignals, expenseDailyRollups, expenses, localUsers, systemSettings } from "../db/schema";
import { db } from "../api/queries/connection";
import { registerCaptureRoutes } from "../api/capture-v1-routes";
import { captureRouter } from "../api/capture-router";
import { invalidateCaptureCatalog, syncCaptureSeed } from "../api/lib/capture/catalog";
import { CAPTURE_CONSENT_TEXT_VERSION, setCaptureConsent } from "../api/lib/capture/consent";
import { registerCaptureDevice, revokeCaptureDevice } from "../api/lib/capture/devices";
import { invalidateSettingsCache } from "../api/lib/settings-cache";

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
  const purchase = (id: string, amount = "450.00") => ({
    id,
    channel: "notification",
    app: CIB_APP,
    text: `تم خصم EGP ${amount} من بطاقتك رقم 1234 عند CARREFOUR MAADI المتاح EGP 4,500.75`,
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
      await db.delete(captureSignals).where(mine(captureSignals));
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
  });
  afterAll(async () => {
    await cleanUp();
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
    expect(retry.results[0]).toMatchObject({ result: "review", signalId: first.results[0].signalId });

    const rows = await db.select().from(captureSignals).where(eq(captureSignals.userId, owner.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].textRedacted).not.toContain("1234");
  });

  it("records exactly one ledger row from the notification's button, however often it is tapped", async () => {
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-02")] })).json();
    const signalId = results[0].signalId;
    const tap = (actionId: string) => post("/api/capture/v1/actions", { actionId, signalId, action: "record" });

    const answered = await (await tap("action-0001")).json();
    expect(answered.result).toBe("recorded");
    expect((await (await tap("action-0002")).json()).expenseId).toBe(answered.expenseId);
    expect((await caller.answer({ signalId, action: "record" })).expenseId).toBe(answered.expenseId);

    const ledger = await db.select().from(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, "local")));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ source: "sms", clientRequestId: `cap:${signalId}`, type: "expense", category: "متنوعات" });
    expect(Number(ledger[0].amount)).toBe(450);
    expect(ledger[0].rawText).toBeNull();
    expect(ledger[0].description).not.toContain("1234");
  });

  it("lists what waits, records with the user's own filing, and dismisses without writing", async () => {
    await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-03", "120.00"), purchase("signal-buy-04", "80.00")] });
    const pending = await caller.pending();
    expect(pending).toHaveLength(2);
    const [newest, oldest] = pending;

    await caller.answer({ signalId: newest.signalId, action: "record", categoryId: "food", subCategoryId: "groceries" });
    await caller.answer({ signalId: oldest.signalId, action: "dismiss" });

    const ledger = await db.select().from(expenses).where(eq(expenses.userId, owner.userId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ category: "أكل وشرب", subCategory: "بقالة" });
    expect(await caller.pending()).toHaveLength(0);
  });

  it("never lets a Google account with the same id answer, and stops a revoked phone", async () => {
    const { results } = await (await post("/api/capture/v1/signals", { signals: [purchase("signal-buy-05")] })).json();
    const sameIdOtherKind = captureRouter.createCaller({ user: { id: owner.userId, type: "oauth", role: "user", plan: "free", name: "Other" } } as never);
    await expect(sameIdOtherKind.answer({ signalId: results[0].signalId, action: "record" })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
