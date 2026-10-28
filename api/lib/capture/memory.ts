/**
 * What a user taught capture (decision 0030): where they file a merchant or a person, and, per bank and kind of
 * message, how many captured payments in a row they recorded as read and whether they let that pair be recorded on
 * its own. Memory is per user and never shared: one user's filings never change another's.
 */
import { createHmac } from "node:crypto";
import { and, eq, inArray, isNull, gte, sql } from "drizzle-orm";
import { captureMemory, captureUserPairs } from "../../../db/schema";
import { CATEGORIES } from "../../../contracts/categories";
import { env } from "../env";
import { getDb } from "../../queries/connection";
import type { CaptureOwner } from "./devices";

/** Confirmations in a row before the user is offered recording a pair on its own. */
export const AUTO_OFFER_AFTER = 3;

type Writer = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update">;

/** An HMAC with the server's secret: equal values can be matched without the value being kept. */
export function captureHmac(purpose: string, value: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(`capture:${purpose}:${value}`).digest("hex");
}

/**
 * The memory key of the other side of a payment: a merchant by its key ("m:carrefour"), a person by an HMAC of their
 * InstaPay address or name ("p:…"), never the name itself. Null when the message names nobody to remember.
 */
export function memoryKeyOf(counterparty: { type: string; name: string | null; merchantKey: string | null; ipa: string | null } | null): string | null {
  if (!counterparty) return null;
  if (counterparty.type === "merchant" && counterparty.merchantKey) return `m:${counterparty.merchantKey}`.slice(0, 140);
  if (counterparty.type === "person") {
    const identity = counterparty.ipa ?? counterparty.name?.replace(/\s+/g, " ").trim().toLowerCase();
    return identity ? `p:${captureHmac("person", identity)}` : null;
  }
  return null;
}

export interface Filing {
  categoryId: string;
  subCategoryId: string;
}

/** The user's filings for these keys. */
export async function memoryFor(db: Writer, owner: CaptureOwner, keys: string[]): Promise<Map<string, Filing>> {
  const wanted = [...new Set(keys)];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ key: captureMemory.memoryKey, categoryId: captureMemory.categoryId, subCategoryId: captureMemory.subCategoryId })
    .from(captureMemory)
    .where(and(eq(captureMemory.userId, owner.userId), eq(captureMemory.userType, owner.userType), inArray(captureMemory.memoryKey, wanted)));
  return new Map(rows.map((row) => [row.key, { categoryId: row.categoryId, subCategoryId: row.subCategoryId }]));
}

/** Remembers where the user filed this merchant or person; the latest filing wins. */
export async function rememberFiling(db: Writer, owner: CaptureOwner, key: string, filing: Filing): Promise<void> {
  await db
    .insert(captureMemory)
    .values({ userId: owner.userId, userType: owner.userType, memoryKey: key, ...filing })
    .onDuplicateKeyUpdate({
      set: { categoryId: filing.categoryId, subCategoryId: filing.subCategoryId, uses: sql`${captureMemory.uses} + 1` },
    });
}

/** The taxonomy ids of the Arabic names a ledger row stores, or null for a name the taxonomy does not hold. */
export function idsOfNames(category: string, subCategory: string | null): Filing | null {
  const main = CATEGORIES.find((item) => item.name_ar === category);
  if (!main) return null;
  const sub =
    main.subcategories.find((item) => item.name_ar === subCategory) ??
    main.subcategories.find((item) => item.name_ar === "عام") ??
    main.subcategories[0];
  return sub ? { categoryId: main.id, subCategoryId: sub.id } : null;
}

// ─── Pairs: a bank and a kind of message ───

const pairOfOwner = (owner: CaptureOwner, sourceSlug: string, kind: string) =>
  and(
    eq(captureUserPairs.userId, owner.userId),
    eq(captureUserPairs.userType, owner.userType),
    eq(captureUserPairs.sourceSlug, sourceSlug),
    eq(captureUserPairs.kind, kind),
  );

/** Whether the user let this pair be recorded on its own. */
export async function pairAutoEnabled(db: Writer, owner: CaptureOwner, sourceSlug: string, kind: string): Promise<boolean> {
  const [row] = await db.select({ autoEnabled: captureUserPairs.autoEnabled }).from(captureUserPairs).where(pairOfOwner(owner, sourceSlug, kind));
  return row?.autoEnabled ?? false;
}

/** One more payment of this pair recorded as read. */
export async function notePairConfirmed(db: Writer, owner: CaptureOwner, sourceSlug: string, kind: string): Promise<void> {
  await db
    .insert(captureUserPairs)
    .values({ userId: owner.userId, userType: owner.userType, sourceSlug, kind, streak: 1 })
    .onDuplicateKeyUpdate({ set: { streak: sql`${captureUserPairs.streak} + 1` } });
}

/** A payment of this pair was undone: the count starts again and it is asked about again. */
export async function resetPair(db: Writer, owner: CaptureOwner, sourceSlug: string, kind: string): Promise<void> {
  await db.update(captureUserPairs).set({ streak: 0, autoEnabled: false }).where(pairOfOwner(owner, sourceSlug, kind));
}

/** Pairs the user has confirmed enough times and was not asked about yet. */
export async function autoOffers(owner: CaptureOwner) {
  return getDb()
    .select({ sourceSlug: captureUserPairs.sourceSlug, kind: captureUserPairs.kind, streak: captureUserPairs.streak })
    .from(captureUserPairs)
    .where(
      and(
        eq(captureUserPairs.userId, owner.userId),
        eq(captureUserPairs.userType, owner.userType),
        gte(captureUserPairs.streak, AUTO_OFFER_AFTER),
        isNull(captureUserPairs.askedAt),
        eq(captureUserPairs.autoEnabled, false),
      ),
    );
}

/** The user's answer to the offer: recorded on its own from now on, or asked about as before. */
export async function setPairAuto(owner: CaptureOwner, sourceSlug: string, kind: string, enabled: boolean): Promise<boolean> {
  const [result] = await getDb()
    .update(captureUserPairs)
    .set({ autoEnabled: enabled, askedAt: new Date() })
    .where(pairOfOwner(owner, sourceSlug, kind));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
}
