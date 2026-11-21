/**
 * The admin's message simulator (decision 0049): a bank SMS or app notification typed in the console goes through the
 * production path exactly as a phone's would (admission, privacy, the model, the checks, matching, recording), into
 * the admin's own ledger, and comes back with every step's result. It writes only to the signed-in admin's account,
 * through its own simulator device; the web app then shows the result as any user would see it.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { captureAiJobs, captureEvents, captureSignals, expenses } from "../../../db/schema";
import { getDb } from "../../queries/connection";
import { CAPTURE_CONSENT_TEXT_VERSION, captureConsentsOf, setCaptureConsent } from "./consent";
import { registerCaptureDevice, type CaptureOwner } from "./devices";
import { drainCaptureModel } from "./ai-queue";
import { ingestSignals, type SignalReading } from "./intake";

export interface SimulateInput {
  text: string;
  sender?: string | null;
  channel: "sms" | "notification";
  /** The Android package for a notification (an app the catalog lists, e.g. com.egyptianbanks.instapay). */
  app?: string | null;
}

const SIMULATOR_INSTALLATION = "admin-message-simulator";

export async function simulateCaptureMessage(owner: CaptureOwner, input: SimulateInput) {
  const db = getDb();
  // The simulator is a device of the admin's own, beside any real phone, outside the plan's phone limit.
  const { deviceId } = await registerCaptureDevice(owner, { platform: "android", installationId: SIMULATOR_INSTALLATION, label: "محاكي لوحة الإدارة" }, 0);
  const consent = await captureConsentsOf(owner, undefined, CAPTURE_CONSENT_TEXT_VERSION);
  if (!consent.capture) await setCaptureConsent(owner, "capture", true, CAPTURE_CONSENT_TEXT_VERSION);
  if (!consent.aiReading) await setCaptureConsent(owner, "ai_reading", true, CAPTURE_CONSENT_TEXT_VERSION);

  const signalId = `sim-${randomUUID()}`;
  const started = Date.now();
  const [admitted] = await ingestSignals({ ...owner, deviceId, platform: "android" }, {
    lang: "ar",
    signals: [{
      id: signalId, channel: input.channel, app: input.channel === "notification" ? input.app ?? null : "com.google.android.apps.messaging",
      sender: input.sender?.trim() || null, title: null, text: input.text, postedAt: new Date().toISOString(),
    }],
  });

  const mine = <T extends { userId: unknown; userType: unknown }>(table: T) =>
    and(eq(table.userId as never, owner.userId), eq(table.userType as never, owner.userType));
  const [signal] = await db.select().from(captureSignals).where(and(mine(captureSignals), eq(captureSignals.clientSignalId, signalId))).limit(1);
  let job = signal ? (await db.select().from(captureAiJobs).where(and(mine(captureAiJobs), eq(captureAiJobs.signalId, signal.id))).limit(1))[0] : undefined;
  // The worker reads it now; a provider that is slow or down leaves the job waiting, as it would for a phone.
  for (let round = 0; job && job.status !== "done" && round < 40 && Date.now() - started < 45_000; round++) {
    await drainCaptureModel(5);
    [job] = await db.select().from(captureAiJobs).where(eq(captureAiJobs.id, job.id)).limit(1);
    if (job?.status === "queued" && job.nextAt.getTime() > Date.now() + 2000) break;
    if (job?.status !== "done") await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const [kept] = signal ? await db.select().from(captureSignals).where(eq(captureSignals.id, signal.id)).limit(1) : [];
  const reading = kept?.reading as SignalReading | undefined;
  const [event] = kept?.eventId ? await db.select().from(captureEvents).where(and(mine(captureEvents), eq(captureEvents.id, kept.eventId))).limit(1) : [];
  const rows = event?.expenseId
    ? await db.select().from(expenses).where(and(mine(expenses), eq(expenses.id, event.expenseId))).limit(1)
    : [];
  const fee = event ? await db.select().from(expenses).where(and(mine(expenses), eq(expenses.clientRequestId, `cap:e${event.id}:fee`))).limit(1) : [];
  const row = rows[0];
  const meta = (row?.parsedMetadata ?? {}) as { financial?: { kind?: string; excluded?: boolean }; capture?: { details?: Record<string, unknown> } };
  return {
    admission: { result: admitted.result, reason: admitted.reason ?? null },
    redacted: kept?.textRedacted ?? null,
    job: job ? { status: job.status, outcome: job.outcome, attempts: job.attempts, notice: job.notice ?? null } : null,
    reading: reading?.modelRead?.facts ? { facts: reading.modelRead.facts, posting: reading.modelRead.posting ?? null, model: reading.modelRead.model ?? null, provider: reading.modelRead.provider ?? null } : null,
    event: event ? { id: event.id, status: event.status, possibleDuplicate: event.possibleDuplicateOf !== null, sourceSlug: event.sourceSlug } : null,
    ledger: row ? {
      id: row.id, type: row.type, amount: row.amount, category: row.category, subCategory: row.subCategory, description: row.description,
      date: row.date, feeAmount: fee[0]?.amount ?? null, excludedFromTotals: meta.financial?.excluded === true, movementKind: meta.financial?.kind ?? null,
      method: meta.capture?.details?.via ?? null, party: meta.capture?.details?.party ?? null,
    } : null,
    tookMs: Date.now() - started,
  };
}
