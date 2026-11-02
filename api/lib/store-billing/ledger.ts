/**
 * The one writer of store subscriptions. Every purchase, renewal and refund goes through `applyStoreEvent`: a
 * transaction that records the event once, locks the purchase, and sets the person's plan from everything they pay
 * for. Replays, races and out-of-order deliveries therefore cannot grant, extend or remove anything twice.
 */
import { createHmac } from "node:crypto";
import { and, eq, gt, inArray } from "drizzle-orm";
import { proSubscriptions, storeEvents, storePurchases } from "../../../db/schema";
import { db } from "../../queries/connection";
import { setPlan } from "../access-control";
import { env } from "../env";
import { createLogger } from "../log";
import { grantsAccess, type EntitlementState, type StoreId } from "./entitlement";

const log = createLogger("store-billing");

export type StoreOwner = { userId: number; userType: "local" | "oauth" };

export interface StoreEvent {
  store: StoreId;
  /** The purchase's stable key: Apple's original transaction id, or the hash of Google's purchase token. */
  purchaseKey: string;
  /** The key of the purchase this one replaces, when a subscription changed plan. */
  replacesPurchaseKey?: string | null;
  purchaseToken: string;
  productId: string;
  state: EntitlementState;
  expiresAt: Date | null;
  /** Unique per delivery: a replay of the same id changes nothing. */
  eventId: string;
  eventType: string;
  eventTime: Date;
  /** Who is claiming it. Null for a store notification, which can only update a purchase already owned. */
  owner: StoreOwner | null;
}

export type StoreEventResult =
  | { outcome: "applied" | "replayed" | "stale"; state: EntitlementState; plan: string | null }
  | { outcome: "unknown_purchase" }
  | { outcome: "owned_by_another_account" };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PAYING_STATES: EntitlementState[] = ["active", "cancelled", "in_grace_period"];

/** The plan a person has from everything they pay for now, the website's subscriptions included. */
async function planFromPayments(tx: Tx, owner: StoreOwner, now: Date): Promise<"free" | "pro" | "ultra"> {
  const web = await tx
    .select({ plan: proSubscriptions.plan })
    .from(proSubscriptions)
    .where(
      and(
        eq(proSubscriptions.userId, owner.userId),
        eq(proSubscriptions.userType, owner.userType),
        inArray(proSubscriptions.status, ["active", "cancelled"]),
        gt(proSubscriptions.endDate, now),
      ),
    );
  if (web.some((row) => row.plan === "ultra")) return "ultra";
  if (web.length > 0) return "pro";

  const store = await tx
    .select({ status: storePurchases.status, expiresAt: storePurchases.expiresAt })
    .from(storePurchases)
    .where(
      and(
        eq(storePurchases.userId, owner.userId),
        eq(storePurchases.userType, owner.userType),
        inArray(storePurchases.status, PAYING_STATES),
      ),
    );
  return store.some((row) => grantsAccess(row.status as EntitlementState, row.expiresAt, now)) ? "pro" : "free";
}

export async function applyStoreEvent(event: StoreEvent): Promise<StoreEventResult> {
  const now = new Date();
  let afterCommit: (() => Promise<void>) | undefined;

  const result = await db.transaction(async (tx): Promise<StoreEventResult> => {
    const [inserted] = await tx
      .insert(storeEvents)
      .ignore()
      .values({
        store: event.store,
        eventId: event.eventId,
        eventType: event.eventType,
        purchaseKey: event.purchaseKey,
        eventTime: event.eventTime,
      });

    const [found] = await tx
      .select()
      .from(storePurchases)
      .where(and(eq(storePurchases.store, event.store), eq(storePurchases.originalTransactionId, event.purchaseKey)))
      .for("update");

    if (inserted.affectedRows === 0 && found) {
      return { outcome: "replayed", state: found.status as EntitlementState, plan: null };
    }

    let purchase = found;
    if (!purchase && event.replacesPurchaseKey) {
      // The same subscription under a new token: the row follows it and keeps its owner.
      const [previous] = await tx
        .select()
        .from(storePurchases)
        .where(
          and(
            eq(storePurchases.store, event.store),
            eq(storePurchases.originalTransactionId, event.replacesPurchaseKey),
          ),
        )
        .for("update");
      if (previous) {
        await tx
          .update(storePurchases)
          .set({ originalTransactionId: event.purchaseKey })
          .where(eq(storePurchases.id, previous.id));
        purchase = { ...previous, originalTransactionId: event.purchaseKey };
      }
    }

    if (purchase && event.owner) {
      if (purchase.userId !== event.owner.userId || purchase.userType !== event.owner.userType) {
        return { outcome: "owned_by_another_account" };
      }
    }
    if (!purchase && !event.owner) return { outcome: "unknown_purchase" };

    if (purchase?.lastEventAt && purchase.lastEventAt.getTime() > event.eventTime.getTime()) {
      return { outcome: "stale", state: purchase.status as EntitlementState, plan: null };
    }

    const owner: StoreOwner = purchase
      ? { userId: purchase.userId, userType: purchase.userType === "oauth" ? "oauth" : "local" }
      : event.owner!;
    const values = {
      storeProductId: event.productId,
      purchaseToken: event.purchaseToken,
      status: event.state,
      expiresAt: event.expiresAt,
      lastEventAt: event.eventTime,
    };
    if (purchase) {
      await tx.update(storePurchases).set(values).where(eq(storePurchases.id, purchase.id));
    } else {
      await tx.insert(storePurchases).values({
        ...values,
        userId: owner.userId,
        userType: owner.userType,
        store: event.store,
        originalTransactionId: event.purchaseKey,
      });
    }

    const plan = await planFromPayments(tx, owner, now);
    const invalidate = await setPlan(owner.userType, owner.userId, plan, { tx, deferInvalidation: true });
    if (invalidate) afterCommit = invalidate;
    return { outcome: "applied", state: event.state, plan };
  });

  await afterCommit?.();
  if (result.outcome !== "applied") {
    log.info({ event: "store_event.not_applied", store: event.store, outcome: result.outcome }, "store event skipped");
  }
  return result;
}

/**
 * The value the app passes to the store with a purchase, so a store record can be tied to the account that bought
 * it. A UUID, because App Store accepts nothing else, derived with a secret so it says nothing about the account.
 */
export function storeAccountToken(owner: StoreOwner): string {
  const hex = createHmac("sha256", env.JWT_SECRET)
    .update(`store-account:${owner.userType}:${owner.userId}`)
    .digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
