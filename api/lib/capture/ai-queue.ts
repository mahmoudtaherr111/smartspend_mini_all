/**
 * The model reads every captured message (decision 0049). The intake keeps a signal sealed with a job
 * (`capture_ai_jobs`) and answers the phone `queued`; this worker claims the job with a lease, asks the model outside
 * any transaction (`model-reader.ts`), then places the reading under the user's lock: recorded on its own when it is
 * complete, kept for the user's answer when something is missing, nothing at all when no money moved. The notice it
 * leaves is fetched by the phone (`GET /api/capture/v1/notices`) and acknowledged once shown.
 *
 * A provider that fails is tried again with a growing pause for a day; nothing is lost while it is down. The request
 * that queued a job wakes the worker in its own process; a protected job every minute picks up what a restart or a
 * lost lease left (`api/boot.ts`).
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { captureAiJobs, captureSignals, localUsers, users } from "../../../db/schema";
import { planNumber } from "../../../contracts/plan-features";
import type { CaptureNotice, CaptureNoticesResponse } from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import { afterLedgerWrite, type LedgerTx } from "../../services/ledger-writer";
import { createLogger } from "../log";
import { asciiDigits } from "../anonymizer";
import { getSystemSettings } from "../settings-cache";
import { CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION, captureConsentsOf } from "./consent";
import { keepCaptureSample } from "./samples";
import type { CaptureDevice } from "./devices";
import { autoPolicyOf, lockCaptureUser, noteWalletBalance, placeSignal, startIntakeRun, type SignalReading } from "./intake";
import { openCaptureText } from "./vault";
import { readCaptureWithModel } from "./model-reader";
import { captureHmac, merchantKey } from "./memory";
import type { PreparedCaptureText } from "./privacy";
import { CAPTURE_PROMPT_VERSION, ledgerKindOf, type CaptureFacts, type CapturePostingProposal } from "./model-contract";
import { primaryInstrument } from "./instruments";

const log = createLogger("capture-ai-queue");

/** Longer than one model call with its fallbacks (each route has 20 seconds). */
const LEASE_MS = 90_000;
/** Jobs read at the same time in one process. */
const PER_PROCESS = 3;
/** Jobs one wake reads before it stops, so a backlog never keeps a request's process busy for long. */
const PER_WAKE = 25;
/** A reply that failed its checks on every route is asked again this many times before the job gives up. */
const INVALID_ATTEMPTS = 3;

type Job = typeof captureAiJobs.$inferSelect;

/**
 * The model's facts as the reading the intake places. Kind, direction, amounts, party and category come from the
 * model; the card or account that paid, and the person's identity, from the private markers kept on the server.
 */
export function readingFromModel(stored: SignalReading, facts: CaptureFacts, posting: CapturePostingProposal, text: PreparedCaptureText): SignalReading | null {
  if (facts.status !== "completed" || !facts.amount || !stored.modelRead) return null;
  if (posting.status !== "ready" && posting.status !== "waiting") return null;
  const kind = ledgerKindOf(facts);
  const isMarker = facts.party?.startsWith("[") === true;
  const identity = isMarker ? text.localValue(facts.party!) : null;
  const isPhone = facts.party?.startsWith("[PHONE_") === true;
  const digits = isPhone ? asciiDigits(identity ?? "").replace(/\D/g, "") : null;
  const phone = digits?.startsWith("0020") ? `0${digits.slice(4)}` : digits?.startsWith("20") ? `0${digits.slice(2)}` : digits;
  const name = isPhone ? null : isMarker ? identity : facts.party;
  const identityKey = isPhone ? (phone?.length === 11 && !/[*xX•]/u.test(identity ?? "") ? phone : null) : name;
  const partyType = facts.partyType === "own_account" ? "own_account" : facts.partyType;
  const instrument = facts.flow ? primaryInstrument(text, facts.flow, facts.kind) : null;
  const ready = posting.status === "ready";
  return {
    ...stored,
    readBy: "model",
    readerVersion: `model:${CAPTURE_PROMPT_VERSION}`,
    kind,
    direction: facts.flow,
    confidence: ready ? "likely" : "unsure",
    cardSuffix: instrument?.kind === "card" ? instrument.suffix : stored.cardSuffix,
    accountSuffix: instrument?.kind === "account" ? instrument.suffix : stored.accountSuffix,
    amount: { value: facts.amount.value, currency: facts.amount.currency },
    amountEgp: facts.egp ? { value: facts.egp.value, currency: "EGP" } : null,
    fee: facts.fee ? { value: facts.fee.value, currency: "EGP" } : null,
    balanceAfter: facts.balance ? { value: facts.balance.value, currency: facts.balance.currency } : null,
    currencyInferred: false,
    missing: ready ? [] : [posting.reason],
    counterparty: name || isPhone || partyType === "own_account" ? {
      type: partyType,
      name,
      phoneTail: digits?.slice(-4) ?? null,
      ipa: null,
      merchantKey: partyType === "merchant" && name ? merchantKey(name) : null,
      ...(partyType === "person" && identityKey ? { identityHmac: captureHmac("person", identityKey.trim().replace(/\s+/g, " ").toLowerCase()) } : {}),
      ...(partyType === "person" && identityKey ? { identityKind: isPhone ? "phone" as const : "name" as const } : {}),
    } : null,
    modelRead: { ...stored.modelRead, envelope: "", facts, posting },
  };
}

let running = 0;

function wakeOne(maximum: number): void {
  if (running >= maximum) return;
  running++;
  setImmediate(() => {
    void drainCaptureModel(PER_WAKE)
      .catch((err) => log.error({ err, event: "capture.ai.drain_failed" }, "Capture model queue stopped"))
      .finally(() => { running--; });
  });
}

/** Starts reading in this process, up to a few jobs at a time. Safe to call often. */
export function wakeCaptureModel(): void {
  while (running < PER_PROCESS) {
    wakeOne(PER_PROCESS);
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
      await defer(job, "error", backoff(job));
    });
    done++;
  }
  return done;
}

/** MySQL picked this transaction as a deadlock victim or it waited too long for a row lock: safe to try again. */
function lockConflict(err: unknown): boolean {
  for (let cause: unknown = err, depth = 0; cause && depth < 4; cause = (cause as { cause?: unknown }).cause, depth++) {
    const code = (cause as { code?: unknown }).code;
    if (code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT") return true;
  }
  return false;
}

/**
 * Several drains run at once (this process's wakers, other replicas). Two claims can still deadlock on the queue's
 * index even with SKIP LOCKED: the loser retries, and after three tries leaves the job to the next drain.
 */
async function claimJob(now: Date): Promise<Job | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await claimJobOnce(now);
    } catch (err) {
      if (!lockConflict(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80 * (attempt + 1)));
    }
  }
  return null;
}

/** The oldest due job, or one whose lease ran out, taken with a lease so no other process reads it. */
async function claimJobOnce(now: Date): Promise<Job | null> {
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

async function finish(job: Job, outcome: string): Promise<void> {
  await getDb()
    .update(captureAiJobs)
    .set({ status: "done", outcome: outcome.slice(0, 32), leaseUntil: null })
    .where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.attempts, job.attempts)));
}

/** 30 s, 1 min, 2 min … up to an hour. */
function backoff(job: Job): number {
  return Math.min(3600_000, 30_000 * Math.pow(2, Math.min(Math.max(job.attempts - 1, 0), 7)));
}

/** Waits and tries again; a provider outage expires a job after a day, a switch turned off after 30 days. */
async function defer(job: Job, reason: string, waitMs: number): Promise<void> {
  const maximumAge = reason === "failed" || reason === "error" ? 24 * 3600_000 : 30 * 24 * 3600_000;
  if (Date.now() - job.createdAt.getTime() >= maximumAge) return finish(job, `expired_${reason}`);
  await getDb().update(captureAiJobs).set({ status: "queued", outcome: reason.slice(0, 32), nextAt: new Date(Date.now() + waitMs), leaseUntil: null })
    .where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.attempts, job.attempts), eq(captureAiJobs.status, "running")));
}

/** Deletes the job and its signal: the user took back a consent or left. */
async function forget(tx: LedgerTx, job: Job, signalId: number): Promise<void> {
  await tx.delete(captureAiJobs).where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.userId, job.userId), eq(captureAiJobs.userType, job.userType)));
  await tx.delete(captureSignals).where(and(eq(captureSignals.id, signalId), eq(captureSignals.userId, job.userId), eq(captureSignals.userType, job.userType)));
}

async function readJob(job: Job): Promise<void> {
  const owner = { userId: job.userId, userType: job.userType };
  const [signal] = await getDb()
    .select()
    .from(captureSignals)
    .where(and(eq(captureSignals.id, job.signalId), eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType)));
  if (!signal) return finish(job, "gone");
  const stored = signal.reading as SignalReading;
  if (!stored.modelRead?.envelope) return finish(job, "nothing_to_read");

  const consent = await captureConsentsOf(owner, undefined, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
  if (!consent.capture || !consent.aiReading) {
    await getDb().transaction(async (tx) => { await lockCaptureUser(tx, owner); await forget(tx, job, signal.id); });
    return;
  }
  const account = owner.userType === "oauth" ? users : localUsers;
  const [user] = await getDb().select({ plan: account.plan }).from(account).where(eq(account.id, owner.userId));
  if (!user) return finish(job, "gone");
  const controls = await getSystemSettings();
  // A source the admin paused is still read; its payments wait for the user's answer instead of being recorded.
  if (controls.capture_enabled === "false") return defer(job, "disabled", 3600_000);
  // The ledger's two-kind cutover (decision 0045) runs before any automatic write; boot runs it on a clean ledger.
  if (controls.capture_financial_version !== "cashflow-v1") return defer(job, "financial_upgrade", 600_000);
  const text = openCaptureText(stored.modelRead.envelope, signal.textRedacted ?? "", {
    ...owner, userType: owner.userType as "oauth" | "local", deviceId: job.deviceId, clientSignalId: signal.clientSignalId,
  });
  if (!text) return finish(job, "redaction_failed");

  const result = await readCaptureWithModel(text, { ...owner, userType: owner.userType as "oauth" | "local", plan: user.plan, sender: stored.sender ?? null });
  if (result.outcome !== "read") {
    if (result.outcome === "gone") return finish(job, "gone");
    if (result.outcome === "invalid_reply") return job.attempts >= INVALID_ATTEMPTS ? finish(job, "invalid_reply") : defer(job, "invalid_reply", 60_000);
    if (result.outcome === "capacity") return defer(job, "capacity", 5000);
    if (result.outcome === "failed") return defer(job, "failed", backoff(job));
    return defer(job, result.outcome, 3600_000);
  }

  const facts = result.check.facts;
  const sample = (eventId: number | null, posting: CapturePostingProposal) => ({
    signalId: signal.id, eventId, sourceSlug: signal.sourceSlug, channel: signal.channel, text: text.text, textHmac: signal.textHmac,
    promptVersion: CAPTURE_PROMPT_VERSION, provider: result.provider, model: result.model, facts, posting, receivedAt: signal.receivedAt,
  });
  const reading = readingFromModel(stored, facts, result.proposal, text);
  const device: CaptureDevice = { ...owner, deviceId: job.deviceId };
  const run = await startIntakeRun(device, job.lang === "en" ? "en" : "ar");

  if (!reading) {
    // No money moved (declined, on hold, a code, an offer, a balance): nothing is recorded, a balance still moves
    // the one wallet whose last digits the message names.
    await getDb().transaction(async (tx) => {
      await lockCaptureUser(tx, owner);
      const [lease] = await tx.select().from(captureAiJobs).where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.userId, owner.userId), eq(captureAiJobs.userType, owner.userType))).for("update");
      if (!lease || lease.status !== "running" || lease.attempts !== job.attempts) return;
      const fresh = await captureConsentsOf(owner, tx, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
      if (!fresh.capture || !fresh.aiReading) return forget(tx, job, signal.id);
      const kept: SignalReading = { ...stored, modelRead: { envelope: "", facts, posting: result.proposal, model: result.model, provider: result.provider } };
      if (facts.status === "not_transaction" && facts.balance && (stored.cardSuffix || stored.accountSuffix)) {
        await noteWalletBalance(run, { ...kept, balanceAfter: { value: facts.balance.value, currency: facts.balance.currency } }, tx);
      }
      await tx.update(captureSignals).set({ reading: kept })
        .where(and(eq(captureSignals.id, signal.id), eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType)));
      await tx.update(captureAiJobs).set({ status: "done", leaseUntil: null,
        outcome: result.proposal.status === "no_posting" ? { none: "not_transaction", failed: "declined", held: "on_hold" }[result.proposal.state] : result.proposal.status })
        .where(eq(captureAiJobs.id, job.id));
      await keepCaptureSample(tx, owner, sample(null, result.proposal));
    });
    return;
  }

  await getDb().transaction(async (tx) => {
    await lockCaptureUser(tx, owner);
    const [lease] = await tx.select().from(captureAiJobs).where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.userId, owner.userId), eq(captureAiJobs.userType, owner.userType))).for("update");
    if (!lease || lease.status !== "running" || lease.attempts !== job.attempts) return;
    const [stillAlive] = await tx.select({ id: account.id, plan: account.plan }).from(account).where(eq(account.id, owner.userId));
    const freshConsent = await captureConsentsOf(owner, tx, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
    if (!stillAlive || !freshConsent.capture || !freshConsent.aiReading) return forget(tx, job, signal.id);
    // The admin's switches are read again under a share lock: a pause set during the model call wins.
    const fresh = await getSystemSettings(tx, { keys: ["capture_enabled", "capture_paused_sources", "capture_daily_question_notices", "capture_monthly_limit_free", "capture_monthly_limit_pro", "capture_monthly_limit_ultra"], lock: true });
    if (fresh.capture_enabled === "false") {
      await tx.update(captureAiJobs).set({ status: "queued", outcome: "disabled", nextAt: new Date(Date.now() + 3600_000), leaseUntil: null }).where(eq(captureAiJobs.id, job.id));
      return;
    }
    run.policy = autoPolicyOf(fresh);
    run.limit = planNumber(fresh, stillAlive.plan, "capture_monthly_limit");
    reading.modelRead = { ...reading.modelRead!, model: result.model, provider: result.provider };
    const placed = await placeSignal(tx, run, { signalId: signal.id, clientSignalId: signal.clientSignalId, channel: signal.channel, sourceSlug: signal.sourceSlug,
      textHmac: signal.textHmac, receivedAt: signal.receivedAt, reading });
    await tx.update(captureAiJobs).set({
      status: "done", outcome: placed.result === "recorded" ? "recorded" : (placed.reason ?? placed.result).slice(0, 32), leaseUntil: null, eventId: placed.eventId ?? null,
      // An imported past message is recorded quietly: dozens of old notices on the phone would help nobody.
      notice: stored.imported ? null : placed.notice ?? null, noticeDeliveredAt: placed.notice && !stored.imported ? null : new Date(),
    }).where(eq(captureAiJobs.id, job.id));
    await keepCaptureSample(tx, owner, sample(placed.eventId ?? null, result.proposal));
  });
  if (run.recordedAny) await afterLedgerWrite(owner, { spending: run.spentAny });
  log.info({ event: "capture.ai.placed", userId: owner.userId, jobId: job.id, posting: result.proposal.status, provider: result.provider }, "Capture model job placed");
}

/** At-least-once fetch: a notice stays until this same device explicitly acknowledges its successful OS post. */
export async function takeCaptureNotices(device: CaptureDevice): Promise<CaptureNoticesResponse> {
  const mine = and(eq(captureAiJobs.userId, device.userId), eq(captureAiJobs.userType, device.userType), eq(captureAiJobs.deviceId, device.deviceId));
  return getDb().transaction(async (tx) => {
    const ready = await tx
      .select({ id: captureAiJobs.id, eventId: captureAiJobs.eventId, notice: captureAiJobs.notice })
      .from(captureAiJobs)
      .where(and(mine, eq(captureAiJobs.status, "done"), isNull(captureAiJobs.noticeDeliveredAt), isNotNull(captureAiJobs.notice)))
      .orderBy(desc(captureAiJobs.id))
      .limit(21);
    const [{ pending }] = await tx.select({ pending: count() }).from(captureAiJobs).where(and(mine, inArray(captureAiJobs.status, ["queued", "running"])));
    return {
      notices: ready.slice(0, 20).filter((row) => row.eventId !== null).map((row) => ({ noticeId: row.id, eventId: row.eventId!, notice: row.notice as CaptureNotice })),
      pending,
      ...(ready.length > 20 ? { hasMore: true } : {}),
    };
  });
}

export async function acknowledgeCaptureNotices(device: CaptureDevice, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const [result] = await getDb().update(captureAiJobs).set({ noticeDeliveredAt: new Date() }).where(and(
    eq(captureAiJobs.userId, device.userId), eq(captureAiJobs.userType, device.userType), eq(captureAiJobs.deviceId, device.deviceId),
    inArray(captureAiJobs.id, [...new Set(ids)]), eq(captureAiJobs.status, "done"), isNull(captureAiJobs.noticeDeliveredAt), isNotNull(captureAiJobs.notice),
  ));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}
