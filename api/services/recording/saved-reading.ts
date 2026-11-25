/**
 * What a save may take from the reading a sentence had, read from the server's own copy.
 *
 * A saved item points at its reading through `classificationLogId`; the log row belongs to the
 * user (every load filters on the identity pair) and was written by the server. Nothing a
 * client sends about the reading is trusted: the reading here is the log's, and a log item is
 * matched to a saved row the way a review correction is (`reviewCorrection` in
 * `api/expense-router.ts`): the only item, or the one item with the same amount. Pure.
 */
import { TRPCError } from "@trpc/server";
import { normalizeFinancialMovement, financialMovement, MOVEMENT_KINDS, type MovementKind } from "../../../contracts/ledger-movement";
import { categoryAllowsKind, TAXONOMY_VERSION, taxonomyCategory, taxonomySub } from "../../../contracts/taxonomy";
import { isUnambiguousFiling, storedFiling, storedShape, v2OfStored } from "../../lib/understanding/bridge";
import type { PurposeLabels, ReadingSummary } from "./types";

const FIRST_TAXONOMY_VERSION = "2.0";

/** A log item: what the reading proposed, with its reading. */
export interface ReadingItem {
  readingItemId?: string;
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
    ...(typeof raw.taxonomyVersion === "string" ? { taxonomyVersion: raw.taxonomyVersion } : {}),
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
    ...(typeof raw.readingItemId === "string" ? { readingItemId: raw.readingItemId } : {}),
    amount,
    category: raw.category,
    subCategory: typeof raw.subCategory === "string" && raw.subCategory ? raw.subCategory : "عام",
    type: raw.type,
    reading,
  };
}

const cents = (value: number) => Math.round(Math.abs(value) * 100);

type LogItem = { readingItemId?: string; amount?: unknown; category?: string; subCategory?: string | null; clause?: unknown };

/** Match a server-issued item id within the owner's log. Older clients only provide an amount. */
export function matchLogItem(finalResult: unknown, saved: { amount: number; readingItemId?: string }): LogItem | null {
  if (!Array.isArray(finalResult)) return null;
  const items = finalResult.filter((item): item is LogItem => item !== null && typeof item === "object");
  if (!saved.readingItemId && finalResult.length === 1) return items[0] ?? null;
  const matches = saved.readingItemId
    ? items.filter(item => item.readingItemId === saved.readingItemId)
    : items.filter(item => cents(Number(item.amount)) === cents(saved.amount));
  return matches.length === 1 ? matches[0] : null;
}

export function readingItemFor(finalResult: unknown, saved: { amount: number; readingItemId?: string }): ReadingItem | null {
  return readingItemOf(matchLogItem(finalResult, saved));
}

export function storedReadingItemId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || !("readingItemId" in metadata)) return;
  return typeof metadata.readingItemId === "string" ? metadata.readingItemId : undefined;
}

type Filing = { category: string; subCategory?: string | null; type: string };

/** True when the person saved the item as the reading filed it: its category, subcategory and type. */
export function savedAsRead(item: Pick<ReadingItem, "category" | "subCategory" | "type">, saved: Filing): boolean {
  return item.category === saved.category && item.subCategory === (saved.subCategory || "عام") && item.type === saved.type;
}

export function purposeLabelsFor({ category, sub }: Pick<ReadingSummary, "category" | "sub">): PurposeLabels | undefined {
  const purpose = taxonomyCategory(category);
  const leaf = taxonomySub(category, sub);
  if (!purpose || !leaf) return;
  return { categoryAr: purpose.nameAr, subAr: leaf.nameAr, categoryEn: purpose.nameEn, subEn: leaf.nameEn };
}

export type PurposeColumns = { purposeCategoryId?: string | null; purposeSubId?: string | null; purposeVersion?: string | null };

export function labelsFromColumns(row: PurposeColumns): PurposeLabels | undefined {
  if (row.purposeVersion !== TAXONOMY_VERSION || !row.purposeCategoryId || !row.purposeSubId) return;
  return purposeLabelsFor({ category: row.purposeCategoryId, sub: row.purposeSubId });
}

export type SelectedPurpose = Pick<ReadingSummary, "category" | "sub">;

export function selectPurpose(purpose: SelectedPurpose, row: PurposeRow & { direction?: string | null; amount?: number | string }, movementKind?: MovementKind) {
  const filing = storedFiling(purpose.category, purpose.sub);
  const kind = movementKind ?? financialMovement(row)?.kind ?? normalizeFinancialMovement({ ...row, ...filing })?.financial.kind;
  if (!kind || !categoryAllowsKind(purpose.category, kind) || !taxonomySub(purpose.category, purpose.sub)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "الغرض المختار مش مناسب لنوع الحركة." });
  }
  return { ...filing, purposeVersion: TAXONOMY_VERSION, purposeCategoryId: purpose.category, purposeSubId: purpose.sub };
}

type PurposeRow = Filing & { parsedMetadata?: unknown; businessId?: number | null };

/** Only a current, unedited reading that still agrees with the ledger can recover its precise leaf. */
function currentPurpose(row: PurposeRow): Pick<ReadingSummary, "category" | "sub"> | null {
  const metadata = row.parsedMetadata as { reading?: { v?: string; superseded?: boolean } } | null;
  const stored = metadata?.reading;
  if (stored?.v !== TAXONOMY_VERSION || stored.superseded) return null;
  const reading = readingOf(stored);
  if (!reading || !taxonomySub(reading.category, reading.sub) || !categoryAllowsKind(reading.category, reading.kind)) return null;
  const expected = storedShape(reading);
  const movement = financialMovement(row);
  const typeMatches = movement
    ? movement.kind === movementKindFor(reading, expected.type) && movement.movement === reading.flow
    : expected.type === row.type;
  const businessLeaf = row.businessId && (reading.category === "work" || reading.category === "business_income");
  return typeMatches && expected.category === row.category && (businessLeaf || expected.subCategory === (row.subCategory || "عام"))
    ? reading : null;
}

export function savedPurposeLabels(row: PurposeRow & PurposeColumns): PurposeLabels | undefined {
  const persisted = labelsFromColumns(row);
  if (persisted) return persisted;
  const reading = currentPurpose(row);
  return reading ? purposeLabelsFor(reading) : undefined;
}

/** Historical names can recover a purpose only for a one-to-one filing with a compatible financial kind. */
export function purposeColumnsFor(row: PurposeRow): Required<PurposeColumns> {
  const filing = { category: row.category, subCategory: row.subCategory || "عام" };
  let purpose = currentPurpose(row);
  if (!purpose && isUnambiguousFiling(filing)) {
    const pair = v2OfStored(filing.category, filing.subCategory);
    const kind = financialMovement(row)?.kind ?? (row.type === "expense" ? "spending" : row.type === "income" ? "income" : row.type === "investment" ? "investment" : undefined);
    if (pair && kind && categoryAllowsKind(pair.category, kind)) purpose = pair;
  }
  return { purposeVersion: TAXONOMY_VERSION, purposeCategoryId: purpose?.category ?? null, purposeSubId: purpose?.sub ?? null };
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
  return { v: reading.taxonomyVersion ?? FIRST_TAXONOMY_VERSION, category: reading.category, sub: reading.sub, kind: reading.kind, flow: reading.flow };
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
  readingItemId?: string,
): Record<string, unknown> | undefined {
  const base: Record<string, unknown> = clientMetadata ? { ...clientMetadata } : direction ? { direction } : {};
  delete base.reading;
  delete base.readingItemId;
  if (readingItemId) base.readingItemId = readingItemId;
  if (reading) base.reading = readingMetadata(reading);
  return Object.keys(base).length > 0 || clientMetadata ? base : undefined;
}
