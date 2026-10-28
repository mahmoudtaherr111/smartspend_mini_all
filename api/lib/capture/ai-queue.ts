/**
 * The admin's model reads the captured messages the reader was unsure of (decision 0031). The intake keeps such a
 * signal with a job (`capture_ai_jobs`) and answers the phone `queued`; this worker claims the job with a lease, asks
 * the model outside any transaction, then places the signal as the intake would, under the user's lock, and leaves
 * the question for the phone to fetch (`GET /api/capture/v1/notices`).
 *
 * The model's reading is never recorded on its own: it is a question ("قرينا 450 ج.م من CARREFOUR، نسجّلها؟"). When
 * the model is not used (switched off, out of budget, failed three times, consent taken back), a signal the reader
 * read an amount from is placed as the reader read it; one without an amount is dropped.
 *
 * The request that queued a job wakes the worker in its own process; a protected job every minute picks up what a
 * restart or a lost lease left (`api/boot.ts`).
 */
import { and, asc, count, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { captureAiJobs, captureSignals, localUsers, users } from "../../../db/schema";
import type { CaptureNotice, CaptureNoticesResponse } from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import { afterLedgerWrite } from "../../services/ledger-writer";
import { createLogger } from "../log";
import { SMS_PROMPT_VERSION, type SmsModelReply } from "../sms-ai-contract";
import { readMessageWithModel } from "./ai-reader";
import { captureConsentsOf } from "./consent";
import type { CaptureDevice } from "./devices";
import { lockCaptureUser, placeSignal, startIntakeRun, type SignalReading } from "./intake";
import { merchantNamesToKeep } from "./keep-merchants";
import { merchantKey } from "./reader/counterparty";

const log = createLogger("capture-ai-queue");

/** Model calls per job; a failure (a provider down, a timeout) is tried again after a pause. */
export const MODEL_ATTEMPTS = 3;
const RETRY_AFTER_MS = [30_000, 120_000];
/** Longer than one model call with its fallbacks (the reader's deadline is 15 seconds). */
const LEASE_MS = 60_000;
/** Jobs read at the same time in one process. */
const PER_PROCESS = 3;
/** Jobs one wake reads before it stops, so a backlog never keeps a request's process busy for long. */
const PER_WAKE = 25;

type Job = typeof captureAiJobs.$inferSelect;

const PARTY_TYPES = new Set(["merchant", "person", "own_account"]);

/**
 * The model's answer as a reading the intake can place: the kind, direction and amounts from the model; the card,
 * account, reference and time the reader took from the text before it was redacted. Always `likely`: a question.
 */
export function readingFromModel(stored: SignalReading, reply: SmsModelReply): SignalReading | null {
  if (!reply.isFinancial || !reply.amount || !reply.direction) return null;
  const said = reply.counterparty;
  const type = said && PARTY_TYPES.has(said.type) ? said.type : "unknown";
  const party =
    stored.counterparty ??
    (said?.name || type === "own_account"
      ? { type, name: said?.name ?? null, merchantKey: type === "merchant" && said?.name ? merchantKey(said.name) : null, phoneTail: null, ipa: null }
      : null);
  return {
    ...stored,
    readerVersion: `model:${SMS_PROMPT_VERSION}`,
    readBy: "model",
    kind: reply.kind,
    direction: reply.direction,
    confidence: "likely",
    amount: { value: reply.amount.value, currency: reply.amount.currency },
    currencyInferred: false,
    amountEgp: reply.amountEgp !== null ? { value: reply.amountEgp, currency: "EGP" } : stored.amountEgp,
    balanceAfter: stored.balanceAfter ?? (reply.balanceAfter !== null ? { value: reply.balanceAfter, currency: "EGP" } : null),
    counterparty: party,
    missing: [],
  };
}

let running = 0;

/** Starts reading in this process, up to a few jobs at a time. Safe to call often. */
export function wakeCaptureModel(): void {
  while (running < PER_PROCESS) {
    running++;
    setImmediate(() => {
      void drainCaptureModel(PER_WAKE)
        .catch((err) => log.error({ err, event: "capture.ai.drain_failed" }, "Capture model queue stopped"))
        .finally(() => {
          running--;
        });
    });
  }
}

/** Reads due jobs until none is left or `max` were read; returns how many were read. */
export async function drainCaptureModel(max = PER_WAKE, now = () => new Date()): Promise<number> {
  let done = 0;
  while (done < max) {
    const job = await claimJob(now());
    if (!job) break;
    await readJob(job).catch(async (err) => {
      log.error({ err, event: "capture.ai.job_failed", jobId: job.id }, "Capture model job failed");
      await releaseForRetry(job, now());
    });
    done++;
  }
  return done;
}

/** The oldest due job, or one whose lease ran out, taken with a lease so no other process reads it. */
async function claimJob(now: Date): Promise<Job | null> {
  return getDb().transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(captureAiJobs)
      .where(
        or(
          and(eq(captureAiJobs.status, "queued"), lte(captureAiJobs.nextAt, now)),
          and(eq(captureAiJobs.status, "running"), lt(captureAiJobs.leaseUntil, now)),
        ),
      )
      .orderBy(asc(captureAiJobs.nextAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;
    const claimed = { ...job, status: "running", attempts: job.attempts + 1, leaseUntil: new Date(now.getTime() + LEASE_MS) };
    await tx
      .update(captureAiJobs)
      .set({ status: claimed.status, attempts: claimed.attempts, leaseUntil: claimed.leaseUntil })
      .where(eq(captureAiJobs.id, job.id));
    return claimed;
  });
}

async function releaseForRetry(job: Job, now: Date): Promise<void> {
  const wait = RETRY_AFTER_MS[Math.min(job.attempts - 1, RETRY_AFTER_MS.length - 1)];
  await getDb()
    .update(captureAiJobs)
    .set({ status: "queued", leaseUntil: null, nextAt: new Date(now.getTime() + wait) })
    .where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.attempts, job.attempts)));
}

async function finish(job: Job, outcome: string): Promise<void> {
  await getDb()
    .update(captureAiJobs)
    .set({ status: "done", outcome, leaseUntil: null })
    .where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.attempts, job.attempts)));
}

async function readJob(job: Job): Promise<void> {
  const owner = { userId: job.userId, userType: job.userType };
  const [signal] = await getDb()
    .select()
    .from(captureSignals)
    .where(and(eq(captureSignals.id, job.signalId), eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType)));
  if (!signal) return finish(job, "gone");
  const stored = signal.reading as SignalReading;

  let reading: SignalReading | null = null;
  let outcome: string;
  const consent = await captureConsentsOf(owner);
  if (!consent.aiReading || job.attempts > MODEL_ATTEMPTS) {
    outcome = consent.aiReading ? "attempts" : "no_consent";
  } else {
    const account = owner.userType === "oauth" ? users : localUsers;
    const [user] = await getDb().select({ plan: account.plan }).from(account).where(eq(account.id, owner.userId));
    const text = signal.textRedacted ?? "";
    const read = await readMessageWithModel(text, {
      userId: owner.userId,
      userType: owner.userType,
      plan: user?.plan ?? null,
      keepNames: merchantNamesToKeep(text, stored),
    });
    if (read.outcome === "failed" && job.attempts < MODEL_ATTEMPTS) return releaseForRetry(job, new Date());
    outcome = read.outcome;
    if (read.verdict === "not_transaction") return finish(job, "not_transaction");
    if (read.reply && (read.verdict === "transaction" || read.verdict === "needs_review")) {
      reading = readingFromModel(stored, read.reply);
      if (reading) outcome = "read";
    }
  }
  // Not read by the model: the reader's own reading still stands when it found an amount.
  if (!reading && stored.amount) reading = stored;
  if (!reading) return finish(job, outcome);

  const device: CaptureDevice = { ...owner, deviceId: job.deviceId };
  const run = await startIntakeRun(device, job.lang === "en" ? "en" : "ar");
  const placed = await getDb().transaction(async (tx) => {
    await lockCaptureUser(tx, device);
    // Still ours: a lease that ran out may have let another process take the job meanwhile.
    const [current] = await tx.select({ status: captureAiJobs.status, attempts: captureAiJobs.attempts }).from(captureAiJobs).where(eq(captureAiJobs.id, job.id)).for("update");
    if (!current || current.status !== "running" || current.attempts !== job.attempts) return null;
    const result = await placeSignal(tx, run, {
      signalId: signal.id,
      clientSignalId: signal.clientSignalId,
      channel: signal.channel,
      sourceSlug: signal.sourceSlug,
      textHmac: signal.textHmac,
      receivedAt: signal.receivedAt,
      reading: reading!,
    });
    await tx
      .update(captureAiJobs)
      .set({
        status: "done",
        outcome,
        leaseUntil: null,
        eventId: result.eventId ?? null,
        notice: result.notice ?? null,
        // Nothing to show: it counts as delivered.
        noticeDeliveredAt: result.notice ? null : new Date(),
      })
      .where(eq(captureAiJobs.id, job.id));
    return result;
  });
  if (run.recordedAny) await afterLedgerWrite(device, { spending: run.spentAny });
  log.info({ event: "capture.ai.placed", userId: owner.userId, jobId: job.id, outcome, result: placed?.result ?? "lost_lease" }, "Capture model job placed");
}

/** The notices this phone's queued signals left since it last asked, each handed out once, and how many still wait. */
export async function takeCaptureNotices(device: CaptureDevice): Promise<CaptureNoticesResponse> {
  const mine = and(eq(captureAiJobs.userId, device.userId), eq(captureAiJobs.userType, device.userType), eq(captureAiJobs.deviceId, device.deviceId));
  return getDb().transaction(async (tx) => {
    const ready = await tx
      .select({ id: captureAiJobs.id, eventId: captureAiJobs.eventId, notice: captureAiJobs.notice })
      .from(captureAiJobs)
      .where(and(mine, eq(captureAiJobs.status, "done"), isNull(captureAiJobs.noticeDeliveredAt), isNotNull(captureAiJobs.notice)))
      .orderBy(asc(captureAiJobs.id))
      .limit(20)
      .for("update");
    if (ready.length > 0) {
      await tx.update(captureAiJobs).set({ noticeDeliveredAt: new Date() }).where(inArray(captureAiJobs.id, ready.map((row) => row.id)));
    }
    const [{ pending }] = await tx.select({ pending: count() }).from(captureAiJobs).where(and(mine, inArray(captureAiJobs.status, ["queued", "running"])));
    return {
      notices: ready.filter((row) => row.eventId !== null).map((row) => ({ eventId: row.eventId!, notice: row.notice as CaptureNotice })),
      pending,
    };
  });
}
