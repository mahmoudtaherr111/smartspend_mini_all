/**
 * What a save may take from the reading a sentence had, read from the server's own copy.
 *
 * A saved item points at its reading through `classificationLogId`; the log row belongs to the
 * user (every load filters on the identity pair) and was written by the server. Nothing a
 * client sends about the reading is trusted: the reading here is the log's, and a log item is
 * matched to a saved row the way a review correction is (`reviewCorrection` in
 * `api/expense-router.ts`): the only item, or the one item with the same amount. Pure.
 */
import { MOVEMENT_KINDS, type MovementKind } from "../../../contracts/ledger-movement";
import { TAXONOMY_VERSION } from "../../../contracts/taxonomy";
import type { ReadingSummary } from "./types";

/** A log item: what the reading proposed, with its reading. */
export interface ReadingItem {
  amount: number;
  category: string;
  subCategory: string;
  type: string;
  reading: ReadingSummary;
}

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;

/** The reading of one stored item, or null when it has none or it is not well formed. */
export function readingOf(value: unknown): ReadingSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.category !== "string" || typeof raw.sub !== "string") return null;
  if (!MOVEMENT_KINDS.includes(raw.kind as MovementKind)) return null;
  if (raw.flow !== "in" && raw.flow !== "out") return null;
  return {
    category: raw.category,
    sub: raw.sub,
    kind: raw.kind as MovementKind,
    flow: raw.flow,
    commitmentId: positiveId(raw.commitmentId),
    commitmentDueDay: typeof raw.commitmentDueDay === "string" ? raw.commitmentDueDay : null,
    installments: typeof raw.installments === "number" && Number.isInteger(raw.installments) && raw.installments > 0 ? raw.installments : 0,
    walletId: positiveId(raw.walletId),
    flags: Array.isArray(raw.flags) ? raw.flags.filter((flag): flag is string => typeof flag === "string") : [],
  };
}

function readingItemOf(value: unknown): ReadingItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const reading = readingOf(raw.reading);
  const amount = Number(raw.amount);
  if (!reading || !Number.isFinite(amount) || typeof raw.category !== "string" || typeof raw.type !== "string") return null;
  return {
    amount,
    category: raw.category,
    subCategory: typeof raw.subCategory === "string" && raw.subCategory ? raw.subCategory : "عام",
    type: raw.type,
    reading,
  };
}

const cents = (value: number) => Math.round(Math.abs(value) * 100);

/** The log item a saved row came from: the only item, or the one item with its amount. */
export function readingItemFor(finalResult: unknown, saved: { amount: number }): ReadingItem | null {
  if (!Array.isArray(finalResult) || finalResult.length === 0) return null;
  if (finalResult.length === 1) return readingItemOf(finalResult[0]);
  const same = finalResult.filter((item) => item && typeof item === "object" && cents(Number((item as { amount?: unknown }).amount)) === cents(saved.amount));
  return same.length === 1 ? readingItemOf(same[0]) : null;
}

/** True when the person saved the item as the reading filed it: its category, subcategory and type. */
export function savedAsRead(item: ReadingItem, saved: { category: string; subCategory?: string | null; type: string }): boolean {
  return item.category === saved.category && item.subCategory === (saved.subCategory || "عام") && item.type === saved.type;
}

/**
 * The ledger kind to store for a reading saved as `type`. An unnamed refund is stored as income
 * (`storedShape` in `api/lib/understanding/bridge.ts`), and the writer would turn a `refund` kind
 * into a negative expense, so it is stored as income.
 */
export function movementKindFor(reading: Pick<ReadingSummary, "kind">, type: string): MovementKind {
  return reading.kind === "refund" && type === "income" ? "income" : reading.kind;
}

/** What a saved row keeps of its reading in `parsed_metadata.reading`: the v2 answer, for when rows carry ids. */
export function readingMetadata(reading: ReadingSummary): { v: string; category: string; sub: string; kind: MovementKind; flow: "in" | "out" } {
  return { v: TAXONOMY_VERSION, category: reading.category, sub: reading.sub, kind: reading.kind, flow: reading.flow };
}

/**
 * The metadata a saved row is written with: the client's own, without any `reading` it sent, plus
 * the reading from the log. A direction travels as it does when no metadata is sent, since the
 * writer stores `{ direction }` only when there is no metadata at all.
 */
export function withReadingMetadata(
  clientMetadata: Record<string, unknown> | undefined,
  direction: "incoming" | "outgoing" | undefined,
  reading: ReadingSummary | null,
): Record<string, unknown> | undefined {
  const base: Record<string, unknown> = clientMetadata ? { ...clientMetadata } : direction ? { direction } : {};
  delete base.reading;
  if (reading) base.reading = readingMetadata(reading);
  return Object.keys(base).length > 0 || clientMetadata ? base : undefined;
}
