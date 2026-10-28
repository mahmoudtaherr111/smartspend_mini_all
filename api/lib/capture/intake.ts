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
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { captureSignals } from "../../../db/schema";
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
import { afterLedgerWrite, bumpStreakInTx, insertLedgerEntriesInTx } from "../../services/ledger-writer";
import { redactWithFindings } from "../anonymizer";
import { createLogger } from "../log";
import { getCaptureCatalog, sourceForPackage, sourceForSender, subscriptionForMerchant, type CaptureCatalog, type CaptureSource } from "./catalog";
import type { CaptureDevice, CaptureOwner } from "./devices";
import { readMessage } from "./reader/read";
import type { Reading } from "./reader/types";

const log = createLogger("capture-intake");

/** The phone's first filter (fixed code there, these lists from `/config`). */
export const CAPTURE_GATE: CaptureGateConfig = {
  schema: 1,
  otpWords: ["otp", "code", "passcode", "password", "verification", "كود", "رمز", "كلمة السر", "كلمة المرور", "التحقق", "التفعيل"],
  currencyWords: ["egp", "le", "l.e", "usd", "eur", "sar", "aed", "$", "جنيه", "ج.م", "جم", "دولار", "يورو", "ريال", "درهم"],
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

export function buildNotice(reading: SignalReading, suggestion: LedgerSuggestion, lang: "ar" | "en"): CaptureNotice {
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
    return { title, body: `${what} — ${ask}`, actions };
  }
  const title = reading.sourceName?.ar ?? "رسالة بنك";
  const what = `${label.ar} ${isolate(amount)}${party ? ` · ${isolate(party)}` : ""}`;
  const ask = answerable ? `${category}. نسجّلها؟` : "افتح التطبيق وأكّد المبلغ.";
  return { title, body: `${what} — ${ask}`, actions };
}

// ─── Taking signals in ───

const MAX_AGE_MS = CAPTURE_SIGNAL_MAX_AGE_DAYS * 24 * 3600 * 1000;
const MAX_AHEAD_MS = 3600 * 1000;

const isDuplicate = (err: unknown) => {
  const e = err as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return e?.code === "ER_DUP_ENTRY" || e?.errno === 1062 || e?.cause?.code === "ER_DUP_ENTRY" || e?.cause?.errno === 1062;
};

/**
 * Takes one batch from one device. Consent and the admin's switch are checked by the route before this runs. A signal
 * the user's account already has (the same phone id) answers with what became of it, and nothing is stored twice.
 */
export async function ingestSignals(device: CaptureDevice, request: CaptureSignalsRequest, now = new Date()): Promise<CaptureSignalResult[]> {
  const db = getDb();
  const catalog = await getCaptureCatalog();
  const results: CaptureSignalResult[] = [];
  const counts: Record<string, number> = {};
  const owner = and(eq(captureSignals.userId, device.userId), eq(captureSignals.userType, device.userType));

  for (const signal of request.signals) {
    const result = await (async (): Promise<CaptureSignalResult> => {
      const receivedAt = new Date(signal.postedAt);
      const age = now.getTime() - receivedAt.getTime();
      if (age > MAX_AGE_MS) return { id: signal.id, result: "rejected", reason: "too_old" };
      if (age < -MAX_AHEAD_MS) return { id: signal.id, result: "rejected", reason: "in_future" };

      const known = async () => {
        const [row] = await db
          .select({ id: captureSignals.id, status: captureSignals.status })
          .from(captureSignals)
          .where(and(owner, eq(captureSignals.clientSignalId, signal.id)))
          .limit(1);
        return row ? ({ id: signal.id, result: row.status as CaptureSignalResult["result"], signalId: row.id } satisfies CaptureSignalResult) : null;
      };
      const before = await known();
      if (before) return before;

      const gate = gateSignal(signal, catalog, receivedAt);
      if (!gate.accept) return { id: signal.id, result: gate.result, reason: gate.reason };

      const reading = keepReading(gate.reading, gate.source);
      try {
        const [inserted] = await db.insert(captureSignals).values({
          userId: device.userId,
          userType: device.userType,
          deviceId: device.deviceId,
          clientSignalId: signal.id,
          channel: signal.channel,
          sourceSlug: gate.source?.slug ?? null,
          textRedacted: redactWithFindings(signal.text).text,
          reading,
          status: "review",
          receivedAt,
        });
        const signalId = Number((inserted as { insertId?: number }).insertId);
        const notice = buildNotice(reading, suggestLedgerEntry(reading, catalog), request.lang);
        return { id: signal.id, result: "review", signalId, notice };
      } catch (err) {
        // The same signal arrived twice at once: the first one kept it.
        if (isDuplicate(err)) return (await known()) ?? { id: signal.id, result: "rejected", reason: "conflict" };
        throw err;
      }
    })();
    counts[result.reason ?? result.result] = (counts[result.reason ?? result.result] ?? 0) + 1;
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

/** A signal waiting for an answer, as the app lists it. */
export interface PendingSignal {
  signalId: number;
  createdAt: Date;
  reading: SignalReading;
  suggestion: LedgerSuggestion & { category: string; subCategory: string };
}

export async function pendingSignals(owner: CaptureOwner, limit = 50): Promise<PendingSignal[]> {
  const catalog = await getCaptureCatalog();
  const rows = await getDb()
    .select({ id: captureSignals.id, createdAt: captureSignals.createdAt, reading: captureSignals.reading })
    .from(captureSignals)
    .where(and(eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType), eq(captureSignals.status, "review")))
    .orderBy(desc(captureSignals.createdAt))
    .limit(limit);
  return rows.map((row) => {
    const reading = row.reading as SignalReading;
    const suggestion = suggestLedgerEntry(reading, catalog);
    return { signalId: row.id, createdAt: row.createdAt, reading, suggestion: { ...suggestion, ...taxonomyNames(suggestion.categoryId, suggestion.subCategoryId) } };
  });
}

/**
 * Answers one signal: "record" writes the ledger row (source `sms`, `clientRequestId` `cap:<signal>`) and marks the
 * signal in the same transaction, so the row is written once whoever answers and however often; "dismiss" only marks
 * it. A signal already answered keeps its answer. `fromDevice` limits a notification's button to the signals that
 * device sent in the last 48 hours.
 */
export async function answerSignal(
  owner: CaptureOwner,
  signalId: number,
  answer: CaptureAnswer,
  fromDevice?: number,
): Promise<{ result: "recorded" | "dismissed"; expenseId?: number }> {
  const catalog = await getCaptureCatalog();
  const own = and(eq(captureSignals.id, signalId), eq(captureSignals.userId, owner.userId), eq(captureSignals.userType, owner.userType));
  let outcome: { result: "recorded" | "dismissed"; expenseId?: number } | null = null;
  let spending = false;
  let wrote = false;

  await getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(captureSignals).where(own).limit(1).for("update");
    if (!row || (fromDevice !== undefined && (row.deviceId !== fromDevice || Date.now() - row.createdAt.getTime() > 48 * 3600 * 1000))) {
      throw new TRPCError({ code: "NOT_FOUND", message: "العملية دي مش موجودة" });
    }
    if (row.status !== "review") {
      outcome = { result: row.status === "recorded" ? "recorded" : "dismissed", expenseId: row.expenseId ?? undefined };
      return;
    }
    if (answer.action === "dismiss") {
      await tx.update(captureSignals).set({ status: "dismissed", resolvedAt: new Date() }).where(own);
      outcome = { result: "dismissed" };
      return;
    }

    const reading = row.reading as SignalReading;
    const suggestion = suggestLedgerEntry(reading, catalog);
    const amount = answer.amountEgp ?? suggestion.amountEgp;
    if (amount === null || !(amount > 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "اكتب المبلغ بالجنيه الأول" });
    }
    const categoryId = answer.categoryId ?? suggestion.categoryId;
    if (!CATEGORIES.some((item) => item.id === categoryId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "الفئة دي مش موجودة" });
    }
    const categoryType = CATEGORIES.find((item) => item.id === categoryId)?.type;
    const type = categoryType === "income" || categoryType === "transfer" ? categoryType : "expense";
    const names = taxonomyNames(categoryId, answer.subCategoryId ?? (answer.categoryId ? "" : suggestion.subCategoryId));
    const party = reading.counterparty?.name ?? (reading.counterparty?.phoneTail ? `••${reading.counterparty.phoneTail}` : null);
    const description = [party, reading.sourceName?.ar].filter(Boolean).join(" · ") || names.category;

    const [expenseId] = await insertLedgerEntriesInTx(tx, owner, [
      {
        type,
        amount,
        direction: type === "transfer" ? suggestion.direction : null,
        category: names.category,
        subCategory: names.subCategory,
        // The bank's text never goes into the ledger: it stays, redacted, with the signal for 30 days.
        description,
        rawText: null,
        source: "sms",
        date: new Date(reading.occurredAt),
        clientRequestId: `cap:${row.id}`,
        parsedMetadata: {
          ...(type === "transfer" && suggestion.direction ? { direction: suggestion.direction } : {}),
          capture: { signalId: row.id, source: reading.sourceSlug, kind: reading.kind, readerVersion: reading.readerVersion },
        },
      },
    ]);
    // The user tapped to record it, so it counts for their streak.
    await bumpStreakInTx(tx, owner);
    await tx.update(captureSignals).set({ status: "recorded", expenseId, resolvedAt: new Date() }).where(own);
    outcome = { result: "recorded", expenseId };
    spending = type === "expense";
    wrote = true;
  });

  if (wrote) await afterLedgerWrite(owner, { spending });
  log.info({ event: "capture.answer", userId: owner.userId, signalId, result: outcome!.result }, "Signal answered");
  return outcome!;
}
