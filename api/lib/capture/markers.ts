/**
 * What a user asked capture to ignore (decision 0033): a card or account by its last digits (a family member's card
 * on the same phone, a work card), or a phrase. The intake drops a matching message before anything of it is kept.
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { captureMarkers } from "../../../db/schema";
import { getDb } from "../../queries/connection";
import { asciiDigits } from "../anonymizer";
import { normalizeArabic } from "../unified-normalizer";
import { CAPTURE_GATE, type SignalReading } from "./intake";
import type { CaptureOwner } from "./devices";

export const CAPTURE_IGNORE_KINDS = ["ignore_card", "ignore_phrase"] as const;
export type CaptureIgnoreKind = (typeof CAPTURE_IGNORE_KINDS)[number];

/** Markers one user may keep. */
export const CAPTURE_MARKERS_MAX = 30;

/** Words in nearly every bank message: ignoring one would hide everything. Built on first use (intake imports this). */
let tooCommon: Set<string> | null = null;
const TOO_COMMON = () =>
  (tooCommon ??= new Set(
    [...CAPTURE_GATE.currencyWords, "تم", "من", "في", "على", "الى", "خصم", "ايداع", "تحويل", "بطاقه", "بطاقتك", "حساب", "حسابك", "card", "account", "bank"].map(
      (word) => fold(word),
    ),
  ));

/** The form phrases are compared in: Arabic letters folded, digits as ASCII, lower case, single spaces. */
function fold(text: string): string {
  return normalizeArabic(asciiDigits(text)).toLowerCase().replace(/\s+/g, " ").trim();
}

/** A marker as stored, or why it is refused (an Arabic message for the user). */
export function markerValue(kind: CaptureIgnoreKind, raw: string): { value: string } | { error: string } {
  if (kind === "ignore_card") {
    const digits = asciiDigits(raw).replace(/\D/g, "");
    if (digits.length < 3 || digits.length > 4) return { error: "اكتب آخر 3 أو 4 أرقام من الكارت أو الحساب." };
    // Banks write three or four digits: the last three are what every message shares.
    return { value: digits.slice(-3) };
  }
  const value = fold(raw);
  if (value.length < 3) return { error: "الجملة قصيرة أوي، اكتب 3 حروف على الأقل." };
  if (value.length > 120) return { error: "الجملة طويلة أوي." };
  if (TOO_COMMON().has(value)) return { error: "الكلمة دي موجودة في كل رسايل البنوك، فهتخفي كل حاجة. اختار حاجة أوضح، زي اسم المحل." };
  return { value };
}

export interface CaptureIgnoreRules {
  cards: Set<string>;
  phrases: string[];
}

export async function captureIgnoreRulesOf(owner: CaptureOwner): Promise<CaptureIgnoreRules> {
  const rows = await getDb()
    .select({ kind: captureMarkers.kind, value: captureMarkers.value })
    .from(captureMarkers)
    .where(and(eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType)));
  return {
    cards: new Set(rows.filter((row) => row.kind === "ignore_card").map((row) => row.value)),
    phrases: rows.filter((row) => row.kind === "ignore_phrase").map((row) => row.value),
  };
}

/** Whether the user asked to ignore this message: its card or account, or a phrase in its text. */
export function isIgnored(rules: CaptureIgnoreRules, reading: Pick<SignalReading, "cardSuffix" | "accountSuffix">, text: string): boolean {
  for (const suffix of [reading.cardSuffix, reading.accountSuffix]) {
    if (suffix && rules.cards.has(suffix.slice(-3))) return true;
  }
  if (rules.phrases.length === 0) return false;
  const folded = fold(text);
  return rules.phrases.some((phrase) => folded.includes(phrase));
}

export async function listCaptureMarkers(owner: CaptureOwner) {
  return getDb()
    .select({ id: captureMarkers.id, kind: captureMarkers.kind, value: captureMarkers.value, createdAt: captureMarkers.createdAt })
    .from(captureMarkers)
    .where(and(eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType)))
    .orderBy(captureMarkers.id);
}

export async function addCaptureMarker(owner: CaptureOwner, kind: CaptureIgnoreKind, raw: string): Promise<{ id: number; value: string }> {
  const checked = markerValue(kind, raw);
  if ("error" in checked) throw new TRPCError({ code: "BAD_REQUEST", message: checked.error });
  const existing = await listCaptureMarkers(owner);
  const same = existing.find((row) => row.kind === kind && row.value === checked.value);
  if (same) return { id: same.id, value: same.value };
  if (existing.length >= CAPTURE_MARKERS_MAX) {
    throw new TRPCError({ code: "FORBIDDEN", message: `وصلت لأقصى عدد (${CAPTURE_MARKERS_MAX}). شيل حاجة قديمة الأول.` });
  }
  const [inserted] = await getDb().insert(captureMarkers).values({ userId: owner.userId, userType: owner.userType, kind, value: checked.value });
  return { id: Number((inserted as { insertId?: number }).insertId), value: checked.value };
}

export async function removeCaptureMarker(owner: CaptureOwner, id: number): Promise<void> {
  await getDb()
    .delete(captureMarkers)
    .where(and(eq(captureMarkers.id, id), eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType)));
}
