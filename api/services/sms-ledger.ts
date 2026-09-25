/**
 * How a parsed bank message becomes a ledger entry: its category, the automatic save, and
 * the suggestions kept once the plan's monthly limit is reached.
 *
 * Over the limit a message used to be refused with 403 and was lost: the companion app
 * dropped it and nothing told the user. It is now kept as a suggestion, read by the rules
 * alone (no model is paid for), and saved only when the user confirms it
 * (docs/decisions/0009-bank-messages-over-the-limit.md).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../queries/connection";
import { expenses, rawSmsEvents } from "../../db/schema";
import { mapSmsToExpenseCategory, type SmsParseResult } from "../lib/sms-ai-parser";
import type { RuleBasedSmsResult } from "../lib/sms-rule-parser";
import { runRuleEngine } from "../lib/rule-engine";
import { normalizeText } from "../lib/text-normalizer";
import { applyExpenseRollupDelta, expenseToRollupDelta, ledgerAmount } from "./expense-rollups";

export interface SmsCategory {
  category: string;
  subCategory: string;
  type: "income" | "expense" | "transfer";
}

/** What a message over the limit is kept as, in `raw_sms_events.metadata.suggestion`. */
export interface SmsSuggestion {
  amount: number;
  currency: string;
  direction: "incoming" | "outgoing" | null;
  type: SmsCategory["type"];
  category: string;
  subCategory: string;
  provider: string;
  merchant: string | null;
  description: string;
  /** ISO instant of the message, or of its arrival when the phone sent no usable time. */
  date: string;
  confidence: number;
}

/** Evidence strong enough to trust for a merchant's name on its own. */
const STRONG_MERCHANT_MATCHES = new Set([
  "merchant_registry",
  "merchant_disambiguated",
  "synonym_graph",
  "dict_trigram",
  "dict_bigram",
  "subcat_trigram",
  "subcat_bigram",
  "subcat_unigram",
]);

/** Categories a merchant's name alone cannot justify. */
const NOT_A_MERCHANT_ANSWER = new Set(["متنوعات", "تحويل", "العائلة", "أصدقاء", "موظفين"]);

/**
 * The category the classification engine gives a merchant's name, when it knows the name
 * well: "UBER *TRIP" is مواصلات, "Talabat" أكل وشرب. A weak match (a typo match, a guess
 * from meaning) is not trusted, and null leaves the fixed map in charge.
 *
 * Bank messages spell merchants in Latin letters, which the sentence normalizer spells out
 * in Arabic letters ("CARREFOUR" is no longer a brand after it). So the name is also
 * tried as written, where a brand the dictionary lists in Latin letters counts.
 */
export async function classifySmsMerchant(
  merchant: string | null | undefined,
): Promise<{ category: string; subCategory: string } | null> {
  const name = String(merchant ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\.(?:com|net|org|eg)\b/g, " ")
    .replace(/[^a-z\u0600-\u06ff]+/g, " ")
    .trim();
  if (name.length < 2) return null;

  // The engine classifies the words around an amount; the amount is a placeholder.
  // A strong match on the normalized name knows the subcategory too ("UBER" is أوبر/كريم);
  // the name as written finds the brands the dictionary spells in Latin letters.
  const attempts: Array<{ text: string; accepts: (kind: string) => boolean }> = [
    { text: normalizeText(`${name} 100`), accepts: (kind) => STRONG_MERCHANT_MATCHES.has(kind) },
    { text: `${name} 100`, accepts: (kind) => STRONG_MERCHANT_MATCHES.has(kind) || kind === "dict_unigram" },
  ];
  for (const attempt of attempts) {
    const result = await runRuleEngine(attempt.text, []);
    const item = result.items[0];
    const kind = item?.evidence?.matchKind;
    if (!item || !kind || !attempt.accepts(kind)) continue;
    if (NOT_A_MERCHANT_ANSWER.has(item.category) || item.type !== "expense") continue;
    return { category: item.category, subCategory: item.subCategory || "عام" };
  }
  return null;
}

/** Whether a bank message reports money returned by a merchant rather than received. */
export function readsAsSmsRefund(message: string): boolean {
  return /\b(?:refund(?:ed)?|reversal|reversed|chargeback)\b|استرداد|استرجاع|مرتجع|رد مبلغ|تم رد|إلغاء عملية|الغاء عملية/i.test(message);
}

/**
 * Where a parsed message is filed: the fixed map, with a card payment to a merchant the
 * engine knows filed under that merchant's category instead of تسوق.
 */
export async function categorizeSms(result: SmsParseResult, message?: string): Promise<SmsCategory> {
  const mapped = mapSmsToExpenseCategory(result);
  // A card refund from a merchant the engine knows goes back to that merchant's category
  // as spending coming back (a negative expense, docs/decisions/0010-refunds-net-their-category.md).
  if (result.direction === "incoming" && result.merchant && message && readsAsSmsRefund(message)) {
    const known = await classifySmsMerchant(result.merchant);
    if (known) return { ...known, type: "expense" };
  }
  if (result.direction !== "incoming" && result.category === "payment" && result.merchant) {
    const known = await classifySmsMerchant(result.merchant);
    if (known) return { ...known, type: "expense" };
  }
  return mapped;
}

/** The description a saved message carries: provider, merchant and sender. */
export function describeSms(result: Pick<SmsParseResult, "provider" | "merchant">, sender?: string | null): string {
  const parts = [
    result.provider !== "Unknown" ? result.provider : null,
    result.merchant || null,
    sender ? `من: ${sender}` : null,
  ].filter(Boolean);
  return parts.join(" — ") || "SMS تلقائي";
}

/** The message's own time when the phone sent one that parses, else now. */
export function smsDate(timestamp?: string | null, now = new Date()): Date {
  const parsed = timestamp ? new Date(timestamp) : now;
  return isNaN(parsed.getTime()) ? now : parsed;
}

/** A rule parse turned into the shape the saving path reads. */
export function ruleParseResult(rule: RuleBasedSmsResult): SmsParseResult {
  return {
    transaction_detected: rule.transaction_detected,
    amount: rule.amount,
    currency: rule.currency || "EGP",
    direction: rule.direction,
    provider: (rule.provider as SmsParseResult["provider"]) || "Unknown",
    category: (rule.category as SmsParseResult["category"]) || "unknown",
    fee: rule.fee,
    merchant: rule.merchant,
    balance_after: rule.balance_after,
    confidence: rule.confidence,
    raw_extracted: { rule_result: rule },
  };
}

/** The suggestion kept for a message read over the limit, or null when it holds no transaction. */
export async function buildSmsSuggestion(
  result: SmsParseResult,
  input: { sender?: string | null; timestamp?: string | null; now?: Date; message?: string },
): Promise<SmsSuggestion | null> {
  if (!result.transaction_detected || !result.amount || result.amount <= 0 || result.confidence < 0.5) return null;
  const category = await categorizeSms(result, input.message);
  return {
    amount: result.amount,
    currency: result.currency || "EGP",
    direction: result.direction,
    type: category.type,
    category: category.category,
    subCategory: category.subCategory,
    provider: result.provider,
    merchant: result.merchant,
    description: describeSms(result, input.sender),
    date: smsDate(input.timestamp, input.now).toISOString(),
    confidence: result.confidence,
  };
}

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Writes one message as a ledger entry inside the caller's transaction: the expense, its
 * details and the day's rollup delta. The caller marks the raw message.
 */
export async function insertSmsExpense(
  tx: Executor,
  input: {
    userId: number;
    userType: string;
    message: string;
    amount: number;
    date: Date;
    category: SmsCategory;
    description: string;
    metadata: Record<string, unknown>;
    /** Which way the money moved; an incoming expense is a refund, stored negative. */
    direction?: "incoming" | "outgoing" | null;
  },
): Promise<number | null> {
  const amount = ledgerAmount(input.category.type, input.direction, input.amount);
  const [insertResult] = await tx.insert(expenses).values({
    userId: input.userId,
    userType: input.userType,
    type: input.category.type,
    amount: amount.toString(),
    category: input.category.category,
    subCategory: input.category.subCategory,
    description: input.description,
    rawText: input.message,
    source: "sms",
    date: input.date,
    parsedMetadata: input.metadata,
  });
  const expenseId = Number((insertResult as { insertId?: number })?.insertId ?? 0) || null;

  await applyExpenseRollupDelta(
    tx,
    expenseToRollupDelta(
      {
        userId: input.userId,
        userType: input.userType,
        date: input.date,
        type: input.category.type,
        amount,
        source: "sms",
      },
      1,
    ),
  );
  return expenseId;
}

/**
 * Saves a suggestion the user confirmed, with the category they chose. The status moves
 * from `suggested` to `confirmed` in the same transaction as the insert and only when it
 * was still `suggested`, so a second tap saves nothing. Returns the new expense's id, or
 * null when the suggestion is not the user's or was already answered.
 */
export async function confirmSmsSuggestion(input: {
  id: number;
  userId: number;
  userType: string;
  category?: SmsCategory;
}): Promise<number | null> {
  const [row] = await db
    .select()
    .from(rawSmsEvents)
    .where(
      and(
        eq(rawSmsEvents.id, input.id),
        eq(rawSmsEvents.userId, input.userId),
        eq(rawSmsEvents.userType, input.userType),
        eq(rawSmsEvents.status, "suggested"),
      ),
    )
    .limit(1);
  const metadata = (row?.metadata ?? {}) as { suggestion?: SmsSuggestion } & Record<string, unknown>;
  const suggestion = metadata.suggestion;
  if (!row || !suggestion) return null;

  const category: SmsCategory = input.category ?? {
    category: suggestion.category,
    subCategory: suggestion.subCategory,
    type: suggestion.type,
  };

  return await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(rawSmsEvents)
      .set({ status: "confirmed", metadata: { ...metadata, confirmed_at: new Date().toISOString() } })
      .where(
        and(
          eq(rawSmsEvents.id, row.id),
          eq(rawSmsEvents.userId, input.userId),
          eq(rawSmsEvents.userType, input.userType),
          eq(rawSmsEvents.status, "suggested"),
        ),
      );
    if (Number((claimed as { affectedRows?: number }).affectedRows ?? 0) !== 1) return null;

    return await insertSmsExpense(tx, {
      direction: suggestion.direction,
      userId: input.userId,
      userType: input.userType,
      message: row.message,
      amount: suggestion.amount,
      date: smsDate(suggestion.date),
      category,
      description: suggestion.description,
      metadata: {
        sms_id: row.id,
        provider: suggestion.provider,
        direction: suggestion.direction,
        confidence: suggestion.confidence,
        parsed_by: "rules",
        confirmed_by_user: true,
      },
    });
  });
}

/** Marks a suggestion the user does not want; true when it was still waiting. */
export async function dismissSmsSuggestion(input: { id: number; userId: number; userType: string }): Promise<boolean> {
  const [result] = await db
    .update(rawSmsEvents)
    .set({ status: "dismissed" })
    .where(
      and(
        eq(rawSmsEvents.id, input.id),
        eq(rawSmsEvents.userId, input.userId),
        eq(rawSmsEvents.userType, input.userType),
        eq(rawSmsEvents.status, "suggested"),
      ),
    );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
}
