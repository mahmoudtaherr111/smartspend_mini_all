/**
 * The shapes of the message reader: what goes in (one bank, wallet or payment notification) and what comes out (a
 * reading). A reading has the same shape whoever produced it — this reader, a learned template or the model — so the
 * steps after it (merging signals into one event, choosing a category) never care who read the message.
 */
import type { CaptureSourceKind } from "../../../../contracts/capture";
import type { SmsMessageKind } from "../../sms-ai-contract";

export const READER_VERSION = "reader-v1";

export type ReaderKind = SmsMessageKind;
export type Direction = "in" | "out" | "internal";

/**
 * certain: every field the kind needs was read from a clear word, nothing conflicts, the currency is written.
 * likely: something was assumed (the currency, no merchant), so it is recorded with a mark the user can correct.
 * unsure: words conflict or the amount is not clear; the model reads it next.
 */
export type Confidence = "certain" | "likely" | "unsure";

/** Where a piece was found: positions in the original text, end exclusive. */
export interface Span {
  start: number;
  end: number;
  text: string;
}

export interface Money {
  value: number;
  /** ISO 4217. */
  currency: string;
  /** No currency was written; the reader assumed Egyptian pounds. */
  currencyInferred: boolean;
  span: Span;
}

export interface ReaderInput {
  /** The message as the phone saw it: SMS body or notification text. */
  text: string;
  /** The notification title or SMS sender name, when separate from the text. */
  title?: string | null;
  /** The source the catalog matched (by Android app or SMS sender), when known. */
  sourceSlug?: string | null;
  sourceKind?: CaptureSourceKind | null;
  /** When the phone received it; fills a year the message leaves out and stands in when it has no date. */
  receivedAt: Date;
  /** IANA zone the message's dates are written in. */
  timeZone?: string;
}

export type CounterpartyType = "merchant" | "person" | "own_account" | "unknown";

export interface Counterparty {
  type: CounterpartyType;
  /** As written: "SAOOD MARKET", "محمد محمد". */
  name: string | null;
  /** A merchant's name reduced to what stays the same across branches and terminals: "openai chatgpt subscr". */
  merchantKey: string | null;
  /** An Egyptian mobile number, digits only (01…), when the message wrote it in full. */
  phone: string | null;
  /** Its last digits as the message showed them, also when masked (010****5678 → "5678"). */
  phoneTail: string | null;
  /** An InstaPay payment address. */
  ipa: string | null;
  span: Span | null;
}

export type EvidenceKind =
  | "verb"
  | "role"
  | "money"
  | "card"
  | "account"
  | "phone"
  | "ipa"
  | "date"
  | "time"
  | "reference"
  | "merchant"
  | "person"
  | "source"
  | "rule";

/** One reason behind the reading: a word the lexicon knows, a piece the reader found, or a rule it applied. */
export interface Evidence {
  kind: EvidenceKind;
  /** A stable id (a lexicon entry, a rule name) so evidence can be counted and learned from. */
  id: string;
  span?: Span;
}

export interface Reading {
  readerVersion: string;
  /** transaction: money moved. not_transaction: an OTP, a promotion, a declined payment, a notice, a balance. */
  status: "transaction" | "not_transaction" | "unsure";
  kind: ReaderKind;
  direction: Direction | null;
  /** The money that moved, in the currency it moved in. */
  amount: Money | null;
  /** The Egyptian-pound equivalent the message wrote next to a foreign amount. */
  amountEgp: Money | null;
  fee: Money | null;
  balanceAfter: Money | null;
  availableLimit: Money | null;
  minimumDue: Money | null;
  /** Last three or four digits of the card, as the message showed them. */
  card: { suffix: string; span: Span } | null;
  account: { suffix: string; span: Span } | null;
  counterparty: Counterparty | null;
  /** The message names a subscription or a renewal ("SUBSCR", "اشتراك"). */
  subscriptionHint: boolean;
  /** When the money moved: from the message's own date and time, else when the phone received it. */
  occurredAt: Date;
  occurredAtFrom: "message" | "message_date" | "received";
  reference: string | null;
  confidence: Confidence;
  /** Fields the kind expects that the message did not give. */
  missing: string[];
  /** Why the reading is unsure or not a transaction, as ids ("otp_code", "conflicting_verbs"). */
  reasons: string[];
  evidence: Evidence[];
}
