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
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { captureAiJobs, captureSignals, localUsers, users } from "../../../db/schema";
import { planNumber } from "../../../contracts/plan-features";
import type { CaptureNotice, CaptureNoticesResponse } from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import { afterLedgerWrite, type LedgerTx } from "../../services/ledger-writer";
import { createLogger } from "../log";
import { SMS_PROMPT_VERSION, type SmsModelReply } from "../sms-ai-contract";
import { readMessageWithModel } from "./ai-reader";
import { CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION, captureConsentsOf } from "./consent";
import { keepCaptureSample } from "./samples";
import type { CaptureDevice } from "./devices";
import { autoPolicyOf, lockCaptureUser, placeSignal, startIntakeRun, noteWalletBalance, type SignalReading } from "./intake";
import { openCaptureText } from "./vault";
import { readCaptureWithModel } from "./model-reader";
import { captureQualification } from "./model-reader";
import { getSystemSettings } from "../settings-cache";
import { captureHmac } from "./memory";
import { asciiDigits } from "../anonymizer";
import type { PreparedCaptureText } from "./privacy";
import { CAPTURE_PROMPT_VERSION, type CaptureModelReply, type CapturePostingProposal } from "./model-contract";
import { merchantNamesToKeep } from "./keep-merchants";
import { merchantKey } from "./reader/counterparty";
import { primaryInstrument } from "./instruments";

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

export function readingFromV4(stored: SignalReading, reply: CaptureModelReply, posting: CapturePostingProposal, text: PreparedCaptureText): SignalReading | null {
  if (posting.status !== "ready" || !reply.amount || !reply.flow || !stored.captureV4) return null;
  const kind: SignalReading["kind"] = reply.type === "purchase" ? (reply.amount.currency === "EGP" ? "card_purchase" : "international_purchase")
    : reply.type === "bill" ? "bill_payment" : reply.type === "topup" ? "mobile_recharge"
      : reply.type === "transfer" ? (reply.flow === "in" ? "transfer_in" : "transfer_out")
        : reply.type === "cash_out" ? "atm_withdrawal" : reply.type === "cash_in" ? "cash_deposit"
          : reply.type as SignalReading["kind"];
  const identity = reply.party?.startsWith("[") ? text.localValue(reply.party) : null;
  const isPhone = reply.party?.startsWith("[PHONE_") === true;
  const digits = isPhone ? asciiDigits(identity ?? "").replace(/\D/g, "") : null;
  const phone = digits?.startsWith("0020") ? `0${digits.slice(4)}` : digits?.startsWith("20") ? `0${digits.slice(2)}` : digits;
  const identityKey = isPhone ? (phone?.length === 11 && !/[*xX•]/u.test(identity ?? "") ? phone : null) : identity;
  const name = isPhone ? null : identity ?? (reply.party?.startsWith("[") ? null : reply.party);
  const instrument = primaryInstrument(text, reply.flow, reply.type);
  return { ...stored, readBy: "model", readerVersion: "model:sms-v4", kind, direction: reply.flow, confidence: "likely",
    cardSuffix: instrument?.kind === "card" ? instrument.suffix : null,
    accountSuffix: instrument?.kind === "account" ? instrument.suffix : null,
    amount: { value: reply.amount.value, currency: reply.amount.currency }, amountEgp: reply.egp ? { value: reply.egp.value, currency: "EGP" } : null,
    fee: reply.fee ? { value: reply.fee.value, currency: reply.fee.currency } : null,
    balanceAfter: reply.balance ? { value: reply.balance.value, currency: reply.balance.currency } : null,
    currencyInferred: false, missing: [],
    counterparty: { type: reply.ownership === "own" ? "own_account" : reply.partyType, name,
      phoneTail: digits?.slice(-4) ?? null, ipa: null,
      merchantKey: reply.partyType === "merchant" && name ? merchantKey(name) : null,
      ...(reply.partyType === "person" && identityKey ? { identityHmac: captureHmac("person", identityKey.trim().replace(/\s+/g, " ").toLowerCase()) } : {}),
      ...(reply.partyType === "person" && identityKey ? { identityKind: isPhone ? "phone" as const : "name" as const } : {}),
    }, captureV4: { ...stored.captureV4, envelope: "", reply, posting },
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
      await releaseForRetry(job, now());
    });
    done++;
  }
  return done;
}

/** The oldest due job, or one whose lease ran out, taken with a lease so no other process reads it. */
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
  if (stored.captureV4) return readV4Job(job, signal, stored);

  let reading: SignalReading | null = null;
  let outcome: string;
  const consent = await captureConsentsOf(owner);
  if (!consent.aiReading || job.attempts > MODEL_ATTEMPTS) {
    outcome = consent.aiReading ? "attempts" : "no_consent";
  } else {
    const account = owner.userType === "oauth" ? users : localUsers;
    const [user] = await getDb().select({ plan: account.plan }).from(account).where(eq(account.id, owner.userId));
    if (!user) return finish(job, "gone");
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

async function deferV4(job: Job, reason: string, waitMs: number): Promise<void> {
  const maximumAge = reason === "failed" ? 24 * 3600_000 : 30 * 24 * 3600_000;
  if (Date.now() - job.createdAt.getTime() >= maximumAge) return finish(job, `expired_${reason}`.slice(0, 32));
  await getDb().update(captureAiJobs).set({ status: "queued", outcome: reason, nextAt: new Date(Date.now() + waitMs), leaseUntil: null })
    .where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.attempts, job.attempts), eq(captureAiJobs.status, "running")));
}

/** Short share-lock barrier with operator changes; never holds a connection over a provider call. */
async function v4PostingControls(tx: LedgerTx, job: Job, source: string | null, type: string) {
  const settings = await getSystemSettings(tx, { keys: ["capture_enabled", "capture_financial_version", "capture_model_qualified", "capture_paused_sources", "capture_monthly_limit_free", "capture_monthly_limit_pro", "capture_monthly_limit_ultra"], lock: true });
  const policy = autoPolicyOf(settings);
  if (settings.capture_enabled === "true" && settings.capture_financial_version === "cashflow-v1" && source && !policy.paused.has(source) && policy.v4Pairs?.has(`${source}:${type}`)) return settings;
  await tx.update(captureAiJobs).set({ status: "queued", outcome: "configuration_changed", nextAt: new Date(Date.now() + 3600_000), leaseUntil: null })
    .where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.userId, job.userId), eq(captureAiJobs.userType, job.userType), eq(captureAiJobs.attempts, job.attempts)));
  return null;
}

async function readV4Job(job: Job, signal: typeof captureSignals.$inferSelect, stored: SignalReading): Promise<void> {
  // Expand only when actual v4 work exists; the shared admission table remains the cross-replica cap.
  wakeOne(64);
  const owner = { userId: job.userId, userType: job.userType };
  const consent = await captureConsentsOf(owner, undefined, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
  if (!consent.capture || !consent.aiReading) {
    await getDb().transaction(async (tx) => {
      await lockCaptureUser(tx, owner);
      await tx.delete(captureAiJobs).where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.userId, owner.userId), eq(captureAiJobs.userType, owner.userType)));
      await tx.delete(captureSignals).where(and(eq(captureSignals.id, signal.id), eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType)));
    });
    return;
  }
  const account = owner.userType === "oauth" ? users : localUsers;
  const [user] = await getDb().select({ plan: account.plan }).from(account).where(eq(account.id, owner.userId));
  if (!user) return finish(job, "gone");
  const controls = await getSystemSettings();
  if (controls.capture_enabled !== "true" || (controls.capture_paused_sources ?? "").split(",").map((entry) => entry.trim()).includes(signal.sourceSlug ?? "")) return deferV4(job, "disabled", 3600_000);
  if (controls.capture_financial_version !== "cashflow-v1") return deferV4(job, "financial_upgrade", 3600_000);
  const text = openCaptureText(stored.captureV4!.envelope, signal.textRedacted ?? "", {
    ...owner, userType: owner.userType as "oauth" | "local", deviceId: job.deviceId, clientSignalId: signal.clientSignalId,
  });
  if (!text) return finish(job, "redaction_failed");
  const result = await readCaptureWithModel(text, { ...owner, userType: owner.userType as "oauth" | "local", plan: user.plan, sourceSlug: signal.sourceSlug });
  if (result.outcome !== "read") {
    if (result.outcome === "gone") return finish(job, "gone");
    if (result.outcome === "invalid_reply") return finish(job, "invalid_reply");
    return deferV4(job, result.outcome, result.outcome === "capacity" ? 5000 : result.outcome === "failed" ? Math.min(3600_000, 30000 * Math.pow(2, Math.min(job.attempts - 1, 7))) : 3600_000);
  }
  if (result.proposal.status !== "ready") {
    const qualifiedBalance = result.check.reply.type === "balance" && result.check.reply.state === "none" && result.check.reply.balance
      && captureQualification(await getSystemSettings())?.pairs.includes(`${signal.sourceSlug}:balance`);
    const balanceRun = qualifiedBalance ? await startIntakeRun({ ...owner, deviceId: job.deviceId }, job.lang === "en" ? "en" : "ar") : null;
    await getDb().transaction(async (tx) => {
      await lockCaptureUser(tx, owner);
      const [lease] = await tx.select().from(captureAiJobs).where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.userId, owner.userId), eq(captureAiJobs.userType, owner.userType))).for("update");
      if (!lease || lease.status !== "running" || lease.attempts !== job.attempts) return;
      const fresh = await captureConsentsOf(owner, tx, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
      if (!fresh.capture || !fresh.aiReading) {
        await tx.delete(captureAiJobs).where(eq(captureAiJobs.id, job.id));
        await tx.delete(captureSignals).where(and(eq(captureSignals.id, signal.id), eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType)));
        return;
      }
      if (balanceRun && result.check.reply.balance) {
        if (!(await v4PostingControls(tx, job, signal.sourceSlug, "balance"))) return;
        await noteWalletBalance(balanceRun, { ...stored, captureV4: { ...stored.captureV4!, reply: result.check.reply },
          balanceAfter: { value: result.check.reply.balance.value, currency: result.check.reply.balance.currency } }, tx);
      }
      await tx.update(captureSignals).set({ reading: { ...stored, amount: null, counterparty: null,
        captureV4: { ...stored.captureV4!, reply: result.check.reply, posting: result.proposal, model: result.model, provider: result.provider } } })
        .where(and(eq(captureSignals.id, signal.id), eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType)));
      await tx.update(captureAiJobs).set({ status: "done", leaseUntil: null,
        outcome: result.proposal.status === "waiting" ? `waiting_${result.proposal.reason}` : "not_transaction" }).where(eq(captureAiJobs.id, job.id));
      await keepCaptureSample(tx, owner, { signalId: signal.id, eventId: null, sourceSlug: signal.sourceSlug, channel: signal.channel, text: text.text,
        textHmac: signal.textHmac, promptVersion: CAPTURE_PROMPT_VERSION, provider: result.provider, model: result.model, reply: result.check.reply,
        posting: result.proposal, receivedAt: signal.receivedAt });
    });
    return;
  }
  const settings = await getSystemSettings();
  // The two-kind shared ledger migration must finish before any new automatic writes can run.
  if (settings.capture_financial_version !== "cashflow-v1") return deferV4(job, "financial_upgrade", 3600_000);
  const qualification = captureQualification(settings);
  if (!qualification?.pairs.includes(`${signal.sourceSlug}:${result.check.reply.type}`)) return deferV4(job, "unqualified", 3600_000);
  const reading = readingFromV4(stored, result.check.reply, result.proposal, text);
  if (!reading) return finish(job, "invalid_reply");
  reading.captureV4 = { ...reading.captureV4!, model: result.model, provider: result.provider };
  const device: CaptureDevice = { ...owner, deviceId: job.deviceId };
  const run = await startIntakeRun(device, job.lang === "en" ? "en" : "ar");
  await getDb().transaction(async (tx) => {
    await lockCaptureUser(tx, owner);
    const [lease] = await tx.select().from(captureAiJobs).where(and(eq(captureAiJobs.id, job.id), eq(captureAiJobs.userId, owner.userId), eq(captureAiJobs.userType, owner.userType))).for("update");
    if (!lease || lease.status !== "running" || lease.attempts !== job.attempts) return;
    const [stillAlive] = await tx.select({ id: account.id, plan: account.plan }).from(account).where(eq(account.id, owner.userId));
    const freshConsent = await captureConsentsOf(owner, tx, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
    if (!stillAlive || !freshConsent.capture || !freshConsent.aiReading) {
      await tx.delete(captureAiJobs).where(eq(captureAiJobs.id, job.id));
      await tx.delete(captureSignals).where(and(eq(captureSignals.id, signal.id), eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType)));
      return;
    }
    const freshControls = await v4PostingControls(tx, job, signal.sourceSlug, result.check.reply.type);
    if (!freshControls) return;
    run.policy = autoPolicyOf(freshControls);
    run.limit = planNumber(freshControls, stillAlive.plan, "capture_monthly_limit");
    const placed = await placeSignal(tx, run, { signalId: signal.id, clientSignalId: signal.clientSignalId, channel: signal.channel, sourceSlug: signal.sourceSlug,
      textHmac: signal.textHmac, receivedAt: signal.receivedAt, reading });
    await tx.update(captureAiJobs).set({ status: "done", outcome: placed.reason?.startsWith("waiting_") ? placed.reason : "read", leaseUntil: null, eventId: placed.eventId ?? null,
      // An imported past message is recorded quietly: dozens of old notices on the phone would help nobody.
      notice: stored.imported ? null : placed.notice ?? null, noticeDeliveredAt: placed.notice && !stored.imported ? null : new Date() }).where(eq(captureAiJobs.id, job.id));
    await keepCaptureSample(tx, owner, { signalId: signal.id, eventId: placed.eventId ?? null, sourceSlug: signal.sourceSlug, channel: signal.channel,
      text: text.text, textHmac: signal.textHmac, promptVersion: CAPTURE_PROMPT_VERSION, provider: result.provider, model: result.model,
      reply: result.check.reply, posting: result.proposal, receivedAt: signal.receivedAt });
  });
  if (run.recordedAny) await afterLedgerWrite(owner, { spending: run.spentAny });
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
