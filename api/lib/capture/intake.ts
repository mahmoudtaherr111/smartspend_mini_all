/**
 * The intake of captured notifications (decision 0028): what the server does with each signal a phone sends, and
 * how the user's answer becomes a ledger row.
 *
 * For now every transaction waits for the user (P1 of the capture plan): a signal that reads as money moving is kept
 * as `review`, the phone shows a notice with "سجّل" and "مش مصروف", and only the user's answer writes the ledger,
 * through the ledger writer. Anything else (a code, an offer, a balance, a personal message) is answered `ignored` and
 * nothing of it is stored. A kept signal holds the text redacted and the reader's fields, read before redaction, for
 * 30 days (`api/jobs/data-retention-job.ts`).
 */
import { createHmac } from "node:crypto";
import { and, count, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { captureEvents, captureSignals, captureUsage, expenses, localUsers, userWallets, users } from "../../../db/schema";
import { planNumber } from "../../../contracts/plan-features";
import { CATEGORIES } from "../../../contracts/categories";
import {
  CAPTURE_SIGNAL_MAX_AGE_DAYS,
  type CaptureAction,
  type CaptureGateConfig,
  type CaptureNotice,
  type CaptureSignal,
  type CaptureSignalResult,
  type CaptureSignalsRequest,
} from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import { afterLedgerWrite, bumpStreakInTx, insertLedgerEntriesInTx, type LedgerTx } from "../../services/ledger-writer";
import { businessDateKey } from "../app-time";
import { getSystemSettings } from "../settings-cache";
import { redactWithFindings } from "../anonymizer";
import { env } from "../env";
import { createLogger } from "../log";
import { getCaptureCatalog, sourceForPackage, sourceForSender, subscriptionForMerchant, type CaptureCatalog, type CaptureSource } from "./catalog";
import type { CaptureDevice, CaptureOwner } from "./devices";
import { matchSignal, MATCH_WINDOWS, type EventKeys, type SignalKeys } from "./events";
import { readMessage } from "./reader/read";
import type { Reading } from "./reader/types";

const log = createLogger("capture-intake");

/** The phone's first filter (fixed code there, these lists from `/config`). */
export const CAPTURE_GATE: CaptureGateConfig = {
  schema: 1,
  otpWords: ["otp", "code", "passcode", "password", "verification", "كود", "رمز", "كلمة السر", "كلمة المرور", "التحقق", "التفعيل"],
  currencyWords: ["egp", "l.e", "usd", "eur", "sar", "aed", "$", "جنيه", "ج.م", "جم", "دولار", "يورو", "ريال", "درهم"],
};

// ─── The server's filter ───

/** A sender that is a person's phone number, not a bank's name or short code. */
export function isPersonalSender(sender: string | null | undefined): boolean {
  if (!sender) return false;
  const digits = sender.replace(/[\s\-()+]/g, "");
  if (!/^\d+$/.test(digits)) return false;
  return digits.length >= 8;
}

export type GateOutcome =
  | { accept: true; source: CaptureSource | null; reading: Reading }
  | { accept: false; result: "ignored" | "rejected"; reason: string };

/**
 * Whether a signal is kept for the user's answer. The phone only drops what is clearly not a bank's (codes, personal
 * senders, apps outside the catalog); the server is strict: the app must be in the catalog, a messaging app's sender
 * must not be a person, and the reader must see money that moved.
 */
export function gateSignal(signal: CaptureSignal, catalog: CaptureCatalog, receivedAt: Date): GateOutcome {
  const appSource = signal.app ? sourceForPackage(catalog, signal.app) : null;
  // An app's own notification comes from an app the catalog lists. An SMS may come through any messaging app (the
  // phone's default one is not always listed), so it is judged by its sender instead.
  if (signal.channel === "notification" && !appSource) return { accept: false, result: "rejected", reason: "unknown_app" };

  let source = appSource;
  const fromMessagingApp = appSource?.kind === "sms_app" || signal.channel === "sms";
  if (fromMessagingApp) {
    if (isPersonalSender(signal.sender)) return { accept: false, result: "ignored", reason: "personal_sender" };
    source = signal.sender ? sourceForSender(catalog, signal.sender) : null;
  }

  const reading = readMessage({
    text: signal.text,
    title: signal.title ?? signal.sender ?? null,
    sourceSlug: source?.slug ?? null,
    sourceKind: source?.kind ?? null,
    receivedAt,
  });
  if (reading.status === "not_transaction") {
    return { accept: false, result: "ignored", reason: reading.reasons[0] ?? reading.kind };
  }
  if (!reading.amount) return { accept: false, result: "ignored", reason: "no_amount" };
  // A messaging app's sender the catalog does not know must show it is the user's account: a card, an account or a
  // balance. Anyone can send an SMS that says "تم خصم".
  if (fromMessagingApp && !source && !reading.card && !reading.account && !reading.balanceAfter) {
    return { accept: false, result: "ignored", reason: "unknown_sender" };
  }
  return { accept: true, source, reading };
}

// ─── What is kept of a reading ───

interface KeptMoney {
  value: number;
  currency: string;
}

/** The reader's fields kept with a signal (the `reading` column). No evidence, no message text. */
export interface SignalReading {
  readerVersion: string;
  kind: Reading["kind"];
  direction: Reading["direction"];
  confidence: Reading["confidence"];
  amount: KeptMoney | null;
  currencyInferred: boolean;
  amountEgp: KeptMoney | null;
  fee: KeptMoney | null;
  balanceAfter: KeptMoney | null;
  cardSuffix: string | null;
  accountSuffix: string | null;
  counterparty: { type: string; name: string | null; merchantKey: string | null; phoneTail: string | null; ipa: string | null } | null;
  occurredAt: string;
  /** The time came from the message itself, not from when the phone received it. */
  timeFromMessage: boolean;
  missing: string[];
  sourceSlug: string | null;
  sourceName: { ar: string; en: string } | null;
}

const kept = (money: Reading["amount"]): KeptMoney | null => (money ? { value: money.value, currency: money.currency } : null);

export function keepReading(reading: Reading, source: CaptureSource | null): SignalReading {
  const party = reading.counterparty;
  return {
    readerVersion: reading.readerVersion,
    kind: reading.kind,
    direction: reading.direction,
    confidence: reading.confidence,
    amount: kept(reading.amount),
    currencyInferred: reading.amount?.currencyInferred ?? false,
    amountEgp: kept(reading.amountEgp),
    fee: kept(reading.fee),
    balanceAfter: kept(reading.balanceAfter),
    cardSuffix: reading.card?.suffix ?? null,
    accountSuffix: reading.account?.suffix ?? null,
    counterparty: party
      ? { type: party.type, name: party.name, merchantKey: party.merchantKey, phoneTail: party.phoneTail, ipa: party.ipa }
      : null,
    occurredAt: reading.occurredAt.toISOString(),
    timeFromMessage: reading.occurredAtFrom === "message",
    missing: reading.missing,
    sourceSlug: source?.slug ?? null,
    sourceName: source ? { ar: source.nameAr, en: source.nameEn } : null,
  };
}

// ─── What the ledger row would be ───

export interface LedgerSuggestion {
  type: "expense" | "income" | "transfer";
  direction: "incoming" | "outgoing" | null;
  categoryId: string;
  subCategoryId: string;
  /** The amount in pounds, or null when only a foreign amount is known (the user types it). */
  amountEgp: number | null;
}

const PURCHASES = new Set(["card_purchase", "online_purchase", "international_purchase"]);

/** Where each kind of message is filed when nothing better is known. */
function kindDefault(reading: SignalReading): Omit<LedgerSuggestion, "amountEgp"> {
  const out = reading.direction === "out" || (reading.direction === "internal" && ["atm_withdrawal", "cash_out", "transfer_out", "wallet_send", "card_payment"].includes(reading.kind));
  const transfer = (subCategoryId: string) => ({
    type: "transfer" as const,
    direction: out ? ("outgoing" as const) : ("incoming" as const),
    categoryId: "transfer",
    subCategoryId,
  });
  switch (reading.kind) {
    case "bill_payment":
      return { type: "expense", direction: null, categoryId: "bills", subCategoryId: "general_bills" };
    case "mobile_recharge":
      return { type: "expense", direction: null, categoryId: "bills", subCategoryId: "mobile_recharge" };
    case "fee":
      return { type: "expense", direction: null, categoryId: "installments", subCategoryId: "bank_fees" };
    case "installment":
      return { type: "expense", direction: null, categoryId: "installments", subCategoryId: "installment" };
    case "salary":
      return { type: "income", direction: null, categoryId: "salary", subCategoryId: "base_salary" };
    case "interest":
      return reading.direction === "out"
        ? { type: "expense", direction: null, categoryId: "installments", subCategoryId: "loan_interest" }
        : { type: "income", direction: null, categoryId: "investment_income", subCategoryId: "interest" };
    case "cashback":
      return { type: "income", direction: null, categoryId: "investment_income", subCategoryId: "cashback" };
    // Money back from a purchase the ledger cannot name yet stays income under "مرتجعات واسترداد" (decision 0010).
    case "refund":
      return { type: "income", direction: null, categoryId: "other_income", subCategoryId: "refund" };
    case "atm_withdrawal":
      return transfer("atm");
    case "cash_out":
    case "cash_in":
    case "cash_deposit":
      return transfer("cash_transfer");
    case "transfer_out":
    case "transfer_in":
    case "wallet_send":
    case "wallet_receive":
      return transfer(reading.counterparty?.ipa ? "instapay" : "bank_transfer");
    case "card_payment":
      return transfer("bank_transfer");
    default:
      return reading.direction === "in"
        ? { type: "income", direction: null, categoryId: "other_income", subCategoryId: "general_other_income" }
        : { type: "expense", direction: null, categoryId: "miscellaneous", subCategoryId: "general" };
  }
}

export function suggestLedgerEntry(reading: SignalReading, catalog: CaptureCatalog): LedgerSuggestion {
  let filing = kindDefault(reading);
  const merchant = reading.counterparty?.type === "merchant" ? reading.counterparty.name : null;
  if (PURCHASES.has(reading.kind) || reading.kind === "other") {
    const subscription = merchant ? subscriptionForMerchant(catalog, merchant) : null;
    filing = subscription
      ? { type: "expense", direction: null, categoryId: subscription.categoryId, subCategoryId: subscription.subCategoryId }
      : reading.direction === "in"
        ? filing
        : { type: "expense", direction: null, categoryId: "miscellaneous", subCategoryId: "general" };
  }
  const amountEgp =
    reading.amount?.currency === "EGP" ? reading.amount.value : reading.amountEgp?.currency === "EGP" ? reading.amountEgp.value : null;
  return { ...filing, amountEgp };
}

/** The Arabic names the ledger stores for a category and subcategory id. */
export function taxonomyNames(categoryId: string, subCategoryId: string): { category: string; subCategory: string } {
  const category = CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES.find((item) => item.id === "miscellaneous")!;
  const sub = category.subcategories.find((item) => item.id === subCategoryId);
  return { category: category.name_ar, subCategory: sub?.name_ar ?? "عام" };
}

// ─── The notice ───

/** Latin names and numbers inside an Arabic sentence keep their order when isolated. */
const isolate = (value: string) => `⁨${value}⁩`;
const formatAmount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

const KIND_LABELS: Record<string, { ar: string; en: string }> = {
  card_purchase: { ar: "شراء", en: "Purchase" },
  online_purchase: { ar: "شراء أونلاين", en: "Online purchase" },
  international_purchase: { ar: "شراء من بره", en: "Purchase abroad" },
  atm_withdrawal: { ar: "سحب ATM", en: "ATM withdrawal" },
  cash_deposit: { ar: "إيداع", en: "Deposit" },
  transfer_out: { ar: "تحويل خارج", en: "Transfer out" },
  transfer_in: { ar: "تحويل داخل", en: "Transfer in" },
  wallet_send: { ar: "تحويل من المحفظة", en: "Wallet transfer" },
  wallet_receive: { ar: "فلوس وصلت المحفظة", en: "Wallet received" },
  cash_in: { ar: "إيداع في المحفظة", en: "Cash in" },
  cash_out: { ar: "سحب من المحفظة", en: "Cash out" },
  bill_payment: { ar: "دفع فاتورة", en: "Bill payment" },
  mobile_recharge: { ar: "شحن رصيد", en: "Recharge" },
  salary: { ar: "مرتب", en: "Salary" },
  refund: { ar: "استرداد", en: "Refund" },
  reversal: { ar: "إلغاء عملية", en: "Reversal" },
  fee: { ar: "رسوم", en: "Fee" },
  interest: { ar: "فوايد", en: "Interest" },
  cashback: { ar: "كاش باك", en: "Cashback" },
  card_payment: { ar: "سداد كارت", en: "Card payment" },
  installment: { ar: "قسط", en: "Installment" },
};

/** Whether the user can answer from the notification, or has to open the app first. */
export function canAnswerFromNotice(reading: SignalReading, suggestion: LedgerSuggestion): boolean {
  return reading.confidence === "certain" && suggestion.amountEgp !== null;
}

export function buildNotice(
  reading: SignalReading,
  suggestion: LedgerSuggestion,
  lang: "ar" | "en",
  options: { possibleDuplicate?: boolean } = {},
): CaptureNotice {
  const label = KIND_LABELS[reading.kind] ?? { ar: "عملية", en: "Transaction" };
  const party = reading.counterparty?.name ?? (reading.counterparty?.phoneTail ? `••${reading.counterparty.phoneTail}` : null);
  const money = reading.amount!;
  const amount = money.currency === "EGP" ? (lang === "ar" ? `${formatAmount(money.value)} ج.م` : `EGP ${formatAmount(money.value)}`) : `${money.currency} ${formatAmount(money.value)}`;
  const { category } = taxonomyNames(suggestion.categoryId, suggestion.subCategoryId);
  const answerable = canAnswerFromNotice(reading, suggestion);
  const actions: CaptureAction[] = answerable ? ["record", "dismiss"] : [];

  if (lang === "en") {
    const title = reading.sourceName?.en ?? "Bank message";
    const what = `${label.en} ${isolate(amount)}${party ? ` · ${isolate(party)}` : ""}`;
    const ask = answerable ? `${category}. Record it?` : "Open the app to check the amount.";
    const again = options.possibleDuplicate ? "It may be the same payment as the one before. " : "";
    return { title, body: `${again}${what} — ${ask}`, actions };
  }
  const title = reading.sourceName?.ar ?? "رسالة بنك";
  const what = `${label.ar} ${isolate(amount)}${party ? ` · ${isolate(party)}` : ""}`;
  const ask = answerable ? `${category}. نسجّلها؟` : "افتح التطبيق وأكّد المبلغ.";
  const again = options.possibleDuplicate ? "ممكن تكون نفس العملية اللي قبلها. " : "";
  return { title, body: `${again}${what} — ${ask}`, actions };
}

// ─── The monthly limit (decision 0028) ───

/** Held payments one user may have at a time; past it a new one is not kept. */
export const HELD_MAX = 200;
const HELD_DAYS = 60;

/** The Cairo month a payment taken in now counts in ("2026-10"). */
export function capturePeriod(at: Date): string {
  return businessDateKey(at).slice(0, 7);
}

const affected = (result: unknown) => Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);

function usageOf(owner: CaptureOwner, period: string) {
  return and(eq(captureUsage.userId, owner.userId), eq(captureUsage.userType, owner.userType), eq(captureUsage.period, period));
}

/**
 * Counts one new payment against the month's limit (0 = none), under the caller's lock. Returns how many the month
 * holds now, or null when the limit is reached.
 */
async function reserveQuota(tx: LedgerTx, owner: CaptureOwner, period: string, limit: number): Promise<number | null> {
  await tx.insert(captureUsage).ignore().values({ userId: owner.userId, userType: owner.userType, period });
  const [result] = await tx
    .update(captureUsage)
    .set({ reserved: sql`${captureUsage.reserved} + 1` })
    .where(and(usageOf(owner, period), limit > 0 ? lt(captureUsage.reserved, limit) : undefined));
  if (affected(result) !== 1) return null;
  const [row] = await tx.select({ reserved: captureUsage.reserved }).from(captureUsage).where(usageOf(owner, period));
  return row?.reserved ?? 0;
}

/** Notes a payment held over the limit. True the first time this month, when the user is told. */
async function noteHeld(tx: LedgerTx, owner: CaptureOwner, period: string): Promise<boolean> {
  await tx.update(captureUsage).set({ held: sql`${captureUsage.held} + 1` }).where(usageOf(owner, period));
  const [result] = await tx.update(captureUsage).set({ limitNoticed: true }).where(and(usageOf(owner, period), eq(captureUsage.limitNoticed, false)));
  return affected(result) === 1;
}

/** Gives back what a dismissed payment counted. */
async function releaseQuota(tx: LedgerTx, owner: CaptureOwner, period: string): Promise<void> {
  await tx.update(captureUsage).set({ reserved: sql`GREATEST(${captureUsage.reserved} - 1, 0)` }).where(usageOf(owner, period));
}

/** The user's plan limit for new payments a month (0 = none). */
export async function captureLimitOf(plan: string | null | undefined): Promise<number> {
  return planNumber(await getSystemSettings(), plan, "capture_monthly_limit");
}

/**
 * When the user's plan has no limit, the payments held over the old one in the last two months come back as payments
 * waiting for an answer (the owner's decision: an upgrade records what was missed). Returns how many.
 */
export async function releaseHeldEvents(owner: CaptureOwner, now = new Date()): Promise<number> {
  const [result] = await getDb()
    .update(captureEvents)
    .set({ status: "review" })
    .where(
      and(
        eq(captureEvents.userId, owner.userId),
        eq(captureEvents.userType, owner.userType),
        eq(captureEvents.status, "held"),
        gte(captureEvents.createdAt, new Date(now.getTime() - HELD_DAYS * 24 * 3600 * 1000)),
      ),
    );
  return affected(result);
}

/** This month's use against the limit, and the payments held, for the app. */
export async function captureUsageOf(owner: CaptureOwner, plan: string | null | undefined, now = new Date()) {
  const period = capturePeriod(now);
  const limit = await captureLimitOf(plan);
  if (limit === 0) await releaseHeldEvents(owner, now);
  const [row] = await getDb().select({ reserved: captureUsage.reserved }).from(captureUsage).where(usageOf(owner, period));
  const [{ held }] = await getDb()
    .select({ held: count() })
    .from(captureEvents)
    .where(and(eq(captureEvents.userId, owner.userId), eq(captureEvents.userType, owner.userType), eq(captureEvents.status, "held")));
  return { period, limit, used: row?.reserved ?? 0, held };
}

/** The notice of the first payment held in a month. */
export function limitNotice(limit: number, lang: "ar" | "en"): CaptureNotice {
  return lang === "en"
    ? {
        title: "Free limit reached",
        body: `You reached this month's ${limit} free transactions. We keep saving your bank payments without recording them; subscribe to Pro and they are all recorded.`,
        actions: [],
      }
    : {
        title: "وصلت لحد الشهر",
        body: `وصلت لحد الـ ${limit} عملية المجانية الشهر ده. هنفضل نحفظ عمليات البنك من غير ما نسجّلها، ولو اشتركت في Pro بتتسجل كلها.`,
        actions: [],
      };
}

/** A line added to a notice when the month's use reaches 80% of the limit. */
function nearLimitLine(left: number, lang: "ar" | "en"): string {
  return lang === "en" ? ` ${left} free transactions left this month.` : ` فاضل لك ${left} عملية مجانية الشهر ده.`;
}

// ─── Taking signals in ───

const MAX_AGE_MS = CAPTURE_SIGNAL_MAX_AGE_DAYS * 24 * 3600 * 1000;
const MAX_AHEAD_MS = 3600 * 1000;
const ANSWER_FROM_NOTICE_MS = 48 * 3600 * 1000;

/** An HMAC with the server's secret: equal values can be matched without the value being kept. */
function captureHmac(purpose: string, value: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(`capture:${purpose}:${value}`).digest("hex");
}

/** The words of a message, the same however its spaces and case came. */
function textHmacOf(signal: CaptureSignal): string {
  return captureHmac("text", `${signal.title ?? ""}\n${signal.text}`.replace(/\s+/g, " ").trim().toLowerCase());
}

const channelKeyOf = (deviceId: number, channel: string, slugOrApp: string | null | undefined) => `${deviceId}:${channel}:${slugOrApp ?? ""}`;

const money = (value: string | null): number | null => (value === null ? null : Number(value));

function eventKeysOf(row: typeof captureEvents.$inferSelect): EventKeys {
  return {
    id: row.id,
    status: row.status,
    direction: row.direction as EventKeys["direction"],
    amount: Number(row.amount),
    currency: row.currency,
    amountEgp: money(row.amountEgp),
    occurredAt: row.occurredAt,
    firstReceivedAt: row.firstReceivedAt,
    cardSuffix: row.cardSuffix,
    accountSuffix: row.accountSuffix,
    merchantKey: row.merchantKey,
    referenceHmac: row.referenceHmac,
    balanceAfter: money(row.balanceAfter),
    ownAccount: row.ownAccount,
    channels: Array.isArray(row.channels) ? (row.channels as string[]) : [],
  };
}

/** What a signal's result says when it joined an event that already exists. */
function joinedResult(id: string, event: { id: number; status: string }): CaptureSignalResult {
  if (event.status === "recorded") return { id, result: "recorded", eventId: event.id };
  if (event.status === "review") return { id, result: "merged", eventId: event.id };
  return { id, result: "dismissed", eventId: event.id };
}

/**
 * Takes one batch from one device. Consent and the admin's switch are checked by the route before this runs.
 *
 * Each signal is taken in its own transaction that first locks the user's account row, so two batches of the same
 * user (two phones, or the SMS and the app's notification sent at once) are matched one after the other and never
 * both start an event for one payment. A signal the user's account already has (the same phone id) answers with what
 * became of it, and nothing is stored twice.
 */
export async function ingestSignals(device: CaptureDevice, request: CaptureSignalsRequest, now = new Date()): Promise<CaptureSignalResult[]> {
  const catalog = await getCaptureCatalog();
  const results: CaptureSignalResult[] = [];
  const counts: Record<string, number> = {};
  const mineSignals = and(eq(captureSignals.userId, device.userId), eq(captureSignals.userType, device.userType));
  const mineEvents = and(eq(captureEvents.userId, device.userId), eq(captureEvents.userType, device.userType));
  const account = device.userType === "oauth" ? users : localUsers;
  const wallets = await getDb()
    .select({ id: userWallets.id, lastFourDigits: userWallets.lastFourDigits })
    .from(userWallets)
    .where(and(eq(userWallets.userId, device.userId), eq(userWallets.userType, device.userType)));
  const [user] = await getDb().select({ plan: account.plan }).from(account).where(eq(account.id, device.userId));
  const limit = await captureLimitOf(user?.plan);
  // An upgrade (or an admin lifting the limit) releases what was held; this is the first request after it.
  if (limit === 0) await releaseHeldEvents(device, now);
  const period = capturePeriod(now);

  for (const signal of request.signals) {
    const result = await (async (): Promise<CaptureSignalResult> => {
      const receivedAt = new Date(signal.postedAt);
      const age = now.getTime() - receivedAt.getTime();
      if (age > MAX_AGE_MS) return { id: signal.id, result: "rejected", reason: "too_old" };
      if (age < -MAX_AHEAD_MS) return { id: signal.id, result: "rejected", reason: "in_future" };

      const gate = gateSignal(signal, catalog, receivedAt);
      if (!gate.accept) return { id: signal.id, result: gate.result, reason: gate.reason };
      const reading = keepReading(gate.reading, gate.source);
      const textHmac = textHmacOf(signal);
      // Built from what the signal row keeps (its source), so a stored signal gives the same key back.
      const channelKey = channelKeyOf(device.deviceId, signal.channel, gate.source?.slug);

      return getDb().transaction(async (tx) => {
        // One user at a time from here: the account row is the lock (the streak and account deletion take it too).
        await tx.select({ id: account.id }).from(account).where(eq(account.id, device.userId)).for("update");

        const [known] = await tx
          .select({ eventId: captureSignals.eventId })
          .from(captureSignals)
          .where(and(mineSignals, eq(captureSignals.clientSignalId, signal.id)))
          .limit(1);
        if (known) {
          const [event] = known.eventId
            ? await tx.select({ id: captureEvents.id, status: captureEvents.status }).from(captureEvents).where(eq(captureEvents.id, known.eventId))
            : [];
          return event ? joinedResult(signal.id, event) : { id: signal.id, result: "rejected" as const, reason: "conflict" };
        }

        const keys: SignalKeys = {
          channelKey,
          deviceId: device.deviceId,
          receivedAt,
          textHmac,
          direction: reading.direction,
          amount: reading.amount!.value,
          currency: reading.amount!.currency,
          amountEgp: reading.amount!.currency === "EGP" ? reading.amount!.value : (reading.amountEgp?.value ?? null),
          timeFromMessage: reading.timeFromMessage,
          occurredAt: new Date(reading.occurredAt),
          cardSuffix: reading.cardSuffix,
          accountSuffix: reading.accountSuffix,
          merchantKey: reading.counterparty?.merchantKey ?? null,
          referenceHmac: gate.reading.reference ? captureHmac("reference", gate.reading.reference) : null,
          balanceAfter: reading.balanceAfter?.value ?? null,
          ownAccount: reading.counterparty?.type === "own_account",
        };

        const since = new Date(receivedAt.getTime() - MATCH_WINDOWS.poundPosting);
        const candidates = (
          await tx
            .select()
            .from(captureEvents)
            .where(and(mineEvents, gte(captureEvents.firstReceivedAt, since), lte(captureEvents.firstReceivedAt, new Date(receivedAt.getTime() + MATCH_WINDOWS.reference))))
            .orderBy(captureEvents.firstReceivedAt)
            .limit(300)
        ).map(eventKeysOf);
        const sameTextRows = await tx
          .select({ eventId: captureSignals.eventId, deviceId: captureSignals.deviceId, channel: captureSignals.channel, sourceSlug: captureSignals.sourceSlug, receivedAt: captureSignals.receivedAt })
          .from(captureSignals)
          .where(
            and(
              mineSignals,
              eq(captureSignals.textHmac, textHmac),
              gte(captureSignals.receivedAt, new Date(receivedAt.getTime() - MATCH_WINDOWS.sameTextOtherDevice)),
              lte(captureSignals.receivedAt, new Date(receivedAt.getTime() + MATCH_WINDOWS.sameTextOtherDevice)),
            ),
          );
        const sameText = sameTextRows
          .filter((row) => row.eventId !== null)
          .map((row) => ({
            eventId: row.eventId!,
            deviceId: row.deviceId,
            channelKey: channelKeyOf(row.deviceId, row.channel, row.sourceSlug),
            receivedAt: row.receivedAt,
          }));

        const match = matchSignal(keys, candidates, sameText);

        // A new payment counts against the month's limit; over it, it is held (no question, no ledger). A reading the
        // reader is unsure of counts only when the user records it.
        let reservedNow: number | null = null;
        let held = false;
        if (match.type !== "merge" && reading.confidence !== "unsure") {
          reservedNow = await reserveQuota(tx, device, period, limit);
          if (reservedNow === null) {
            const [{ heldCount }] = await tx.select({ heldCount: count() }).from(captureEvents).where(and(mineEvents, eq(captureEvents.status, "held")));
            if (heldCount >= HELD_MAX) return { id: signal.id, result: "ignored" as const, reason: "held_full" };
            held = true;
          }
        }

        const [inserted] = await tx.insert(captureSignals).values({
          userId: device.userId,
          userType: device.userType,
          deviceId: device.deviceId,
          clientSignalId: signal.id,
          channel: signal.channel,
          sourceSlug: gate.source?.slug ?? null,
          textHmac,
          textRedacted: redactWithFindings(signal.text).text,
          reading,
          receivedAt,
        });
        const signalId = Number((inserted as { insertId?: number }).insertId);

        if (match.type === "merge") {
          const [event] = await tx.select().from(captureEvents).where(and(eq(captureEvents.id, match.eventId), mineEvents)).limit(1);
          const channels = Array.isArray(event.channels) ? (event.channels as string[]) : [];
          await tx
            .update(captureEvents)
            .set({
              channels: channels.includes(channelKey) ? channels : [...channels, channelKey],
              // A field one signal lacked and the other gave is kept.
              cardSuffix: event.cardSuffix ?? keys.cardSuffix,
              accountSuffix: event.accountSuffix ?? keys.accountSuffix,
              merchantKey: event.merchantKey ?? keys.merchantKey,
              referenceHmac: event.referenceHmac ?? keys.referenceHmac,
              balanceAfter: event.balanceAfter ?? (keys.balanceAfter === null ? null : String(keys.balanceAfter)),
              amountEgp: match.rule === "pound_posting" ? String(keys.amount) : (event.amountEgp ?? (keys.amountEgp === null ? null : String(keys.amountEgp))),
              direction: match.rule === "own_transfer" ? "internal" : event.direction,
            })
            .where(eq(captureEvents.id, event.id));
          await tx.update(captureSignals).set({ eventId: event.id }).where(eq(captureSignals.id, signalId));

          // A foreign charge that now has its pound value can be answered from the notice: ask again.
          if (match.rule === "pound_posting" && event.status === "review") {
            const [primary] = await tx.select({ reading: captureSignals.reading }).from(captureSignals).where(eq(captureSignals.id, event.primarySignalId));
            const primaryReading = (primary?.reading ?? reading) as SignalReading;
            const suggestion = { ...suggestLedgerEntry(primaryReading, catalog), amountEgp: keys.amount };
            return { id: signal.id, result: "review" as const, eventId: event.id, notice: buildNotice({ ...primaryReading, confidence: "certain" }, suggestion, request.lang) };
          }
          return joinedResult(signal.id, event);
        }

        const card = keys.cardSuffix ?? keys.accountSuffix;
        const walletMatches = card ? wallets.filter((wallet) => wallet.lastFourDigits && wallet.lastFourDigits.slice(-3) === card.slice(-3)) : [];
        const [created] = await tx.insert(captureEvents).values({
          userId: device.userId,
          userType: device.userType,
          status: held ? "held" : "review",
          kind: reading.kind,
          direction: reading.direction,
          amount: String(keys.amount),
          currency: keys.currency,
          amountEgp: keys.amountEgp === null ? null : String(keys.amountEgp),
          occurredAt: keys.occurredAt,
          firstReceivedAt: receivedAt,
          cardSuffix: keys.cardSuffix,
          accountSuffix: keys.accountSuffix,
          merchantKey: keys.merchantKey,
          referenceHmac: keys.referenceHmac,
          balanceAfter: keys.balanceAfter === null ? null : String(keys.balanceAfter),
          ownAccount: keys.ownAccount,
          reading,
          quotaPeriod: reservedNow === null ? null : period,
          channels: [channelKey],
          primarySignalId: signalId,
          possibleDuplicateOf: match.type === "possible_duplicate" ? match.eventId : null,
          walletId: walletMatches.length === 1 ? walletMatches[0].id : null,
          deviceId: device.deviceId,
        });
        const eventId = Number((created as { insertId?: number }).insertId);
        await tx.update(captureSignals).set({ eventId }).where(eq(captureSignals.id, signalId));
        if (held) {
          const first = await noteHeld(tx, device, period);
          return first
            ? { id: signal.id, result: "held" as const, eventId, notice: limitNotice(limit, request.lang) }
            : { id: signal.id, result: "held" as const, eventId };
        }
        const notice = buildNotice(reading, suggestLedgerEntry(reading, catalog), request.lang, {
          possibleDuplicate: match.type === "possible_duplicate",
        });
        if (limit > 0 && reservedNow === Math.ceil(limit * 0.8)) notice.body += nearLimitLine(limit - reservedNow, request.lang);
        return { id: signal.id, result: "review" as const, eventId, notice };
      });
    })();
    const outcome = result.reason ?? result.result;
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    results.push(result);
  }

  log.info({ event: "capture.signals", userId: device.userId, deviceId: device.deviceId, count: request.signals.length, outcomes: counts }, "Signals taken in");
  return results;
}

// ─── The user's answer ───

export interface CaptureAnswer {
  action: CaptureAction;
  /** The user's own filing, from the app; the notice's button uses the suggestion. */
  categoryId?: string;
  subCategoryId?: string;
  /** The amount in pounds, when the message gave only a foreign one. */
  amountEgp?: number;
}

/** A captured payment waiting for an answer, as the app lists it. */
export interface PendingEvent {
  eventId: number;
  createdAt: Date;
  reading: SignalReading;
  /** It says exactly what an earlier one said, minutes before: the user decides whether it is a second payment. */
  possibleDuplicate: boolean;
  suggestion: LedgerSuggestion & { category: string; subCategory: string };
}

/** Where an event would be filed: its first signal's reading, with what other signals added. */
function eventSuggestion(event: typeof captureEvents.$inferSelect, reading: SignalReading, catalog: CaptureCatalog): LedgerSuggestion {
  if (event.direction === "internal") {
    return { type: "transfer", direction: "outgoing", categoryId: "transfer", subCategoryId: "bank_transfer", amountEgp: money(event.amountEgp) };
  }
  const suggestion = suggestLedgerEntry(reading, catalog);
  return { ...suggestion, amountEgp: suggestion.amountEgp ?? money(event.amountEgp) };
}

export async function pendingEvents(owner: CaptureOwner, limit = 50): Promise<PendingEvent[]> {
  const catalog = await getCaptureCatalog();
  const rows = await getDb()
    .select({ event: captureEvents, reading: captureSignals.reading })
    .from(captureEvents)
    .leftJoin(captureSignals, eq(captureSignals.id, captureEvents.primarySignalId))
    .where(and(eq(captureEvents.userId, owner.userId), eq(captureEvents.userType, owner.userType), eq(captureEvents.status, "review")))
    .orderBy(desc(captureEvents.createdAt))
    .limit(limit);
  return rows.flatMap(({ event, reading }) => {
    const kept = (event.reading ?? reading) as SignalReading | null;
    if (!kept) return [];
    const suggestion = eventSuggestion(event, kept, catalog);
    return {
      eventId: event.id,
      createdAt: event.createdAt,
      reading: kept,
      possibleDuplicate: event.possibleDuplicateOf !== null,
      suggestion: { ...suggestion, ...taxonomyNames(suggestion.categoryId, suggestion.subCategoryId) },
    };
  });
}

/**
 * Answers one event: "record" writes the ledger row (source `sms`, `clientRequestId` `cap:e<event>`) and marks the
 * event in the same transaction, so the row is written once whoever answers and however often; "dismiss" only marks
 * it. An event already answered keeps its answer. `fromDevice` limits a notification's button to the events that
 * device started in the last 48 hours.
 *
 * A refund is filed where the purchase it returns was filed (decision 0010) when an earlier recorded event of the same
 * merchant can be found; a payment from a card the user keeps as a wallet is recorded on that wallet, and the wallet's
 * balance follows the message when it is newer than what the wallet holds.
 */
export async function answerEvent(
  owner: CaptureOwner,
  eventId: number,
  answer: CaptureAnswer,
  fromDevice?: number,
): Promise<{ result: "recorded" | "dismissed"; expenseId?: number }> {
  const catalog = await getCaptureCatalog();
  const mine = and(eq(captureEvents.userId, owner.userId), eq(captureEvents.userType, owner.userType));
  const own = and(eq(captureEvents.id, eventId), mine);
  let outcome: { result: "recorded" | "dismissed"; expenseId?: number } | null = null;
  let spending = false;
  let wrote = false;

  await getDb().transaction(async (tx) => {
    const [event] = await tx.select().from(captureEvents).where(own).limit(1).for("update");
    if (!event || (fromDevice !== undefined && (event.deviceId !== fromDevice || Date.now() - event.createdAt.getTime() > ANSWER_FROM_NOTICE_MS))) {
      throw new TRPCError({ code: "NOT_FOUND", message: "العملية دي مش موجودة" });
    }
    if (event.status !== "review") {
      outcome = { result: event.status === "recorded" ? "recorded" : "dismissed", expenseId: event.expenseId ?? undefined };
      return;
    }
    if (answer.action === "dismiss") {
      await tx.update(captureEvents).set({ status: "dismissed", reading: null, resolvedAt: new Date() }).where(own);
      // Not a payment of the user's: it does not count against the month.
      if (event.quotaPeriod) await releaseQuota(tx, owner, event.quotaPeriod);
      outcome = { result: "dismissed" };
      return;
    }

    const [primary] = await tx.select({ reading: captureSignals.reading }).from(captureSignals).where(eq(captureSignals.id, event.primarySignalId));
    const reading = (event.reading ?? primary?.reading ?? null) as SignalReading | null;
    if (!reading) throw new TRPCError({ code: "NOT_FOUND", message: "العملية دي مش موجودة" });
    const suggestion = eventSuggestion(event, reading, catalog);
    const amount = answer.amountEgp ?? suggestion.amountEgp;
    if (amount === null || !(amount > 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "اكتب المبلغ بالجنيه الأول" });
    }

    // A refund goes back where its purchase was filed, when the purchase was recorded from a message too.
    let refundOf: { eventId: number; category: string; subCategory: string } | null = null;
    if (reading.kind === "refund" && event.merchantKey && !answer.categoryId) {
      const [purchase] = await tx
        .select({ eventId: captureEvents.id, category: expenses.category, subCategory: expenses.subCategory })
        .from(captureEvents)
        .innerJoin(expenses, eq(expenses.id, captureEvents.expenseId))
        .where(
          and(
            mine,
            eq(captureEvents.status, "recorded"),
            eq(captureEvents.merchantKey, event.merchantKey),
            gte(captureEvents.occurredAt, new Date(event.occurredAt.getTime() - 90 * 24 * 3600 * 1000)),
            // Not after the refund: times are kept to the second, and both may carry the same one.
            lte(captureEvents.occurredAt, event.occurredAt),
            gte(captureEvents.amount, event.amount),
          ),
        )
        .orderBy(desc(captureEvents.occurredAt))
        .limit(1);
      if (purchase) refundOf = { eventId: purchase.eventId, category: purchase.category, subCategory: purchase.subCategory ?? "عام" };
    }

    const categoryId = answer.categoryId ?? suggestion.categoryId;
    if (!refundOf && !CATEGORIES.some((item) => item.id === categoryId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "الفئة دي مش موجودة" });
    }
    const categoryType = CATEGORIES.find((item) => item.id === categoryId)?.type;
    const type = refundOf ? "expense" : categoryType === "income" || categoryType === "transfer" ? categoryType : "expense";
    const names = refundOf
      ? { category: refundOf.category, subCategory: refundOf.subCategory }
      : taxonomyNames(categoryId, answer.subCategoryId ?? (answer.categoryId ? "" : suggestion.subCategoryId));
    const direction = refundOf ? "incoming" : type === "transfer" ? suggestion.direction : null;
    const party = reading.counterparty?.name ?? (reading.counterparty?.phoneTail ? `••${reading.counterparty.phoneTail}` : null);
    const description = [party, reading.sourceName?.ar].filter(Boolean).join(" · ") || names.category;

    const [expenseId] = await insertLedgerEntriesInTx(tx, owner, [
      {
        type,
        amount,
        direction,
        category: names.category,
        subCategory: names.subCategory,
        // The bank's text never goes into the ledger: it stays, redacted, with the signals for 30 days.
        description,
        rawText: null,
        source: "sms",
        date: new Date(reading.occurredAt),
        walletId: event.walletId,
        clientRequestId: `cap:e${event.id}`,
        parsedMetadata: {
          ...(direction ? { direction } : {}),
          capture: { eventId: event.id, source: reading.sourceSlug, kind: reading.kind, readerVersion: reading.readerVersion },
        },
      },
    ]);
    // The user tapped to record it, so it counts for their streak.
    await bumpStreakInTx(tx, owner);
    await tx
      .update(captureEvents)
      .set({ status: "recorded", expenseId, linkedEventId: refundOf?.eventId ?? null, reading: null, resolvedAt: new Date() })
      .where(own);

    // The wallet's balance follows the bank's message when the message is newer than what the wallet holds.
    if (event.walletId && event.balanceAfter !== null) {
      const occurredAt = new Date(reading.occurredAt);
      await tx
        .update(userWallets)
        .set({ balance: event.balanceAfter, balanceObservedAt: occurredAt, balanceSource: "bank_message" })
        .where(
          and(
            eq(userWallets.id, event.walletId),
            eq(userWallets.userId, owner.userId),
            eq(userWallets.userType, owner.userType),
            or(isNull(userWallets.balanceObservedAt), lt(userWallets.balanceObservedAt, occurredAt)),
          ),
        );
    }
    outcome = { result: "recorded", expenseId };
    spending = type === "expense";
    wrote = true;
  });

  if (wrote) await afterLedgerWrite(owner, { spending });
  log.info({ event: "capture.answer", userId: owner.userId, eventId, result: outcome!.result }, "Event answered");
  return outcome!;
}
