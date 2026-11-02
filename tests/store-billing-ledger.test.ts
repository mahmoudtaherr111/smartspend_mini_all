/**
 * The store ledger against a real MySQL: replays, races between replicas, late deliveries and refunds. These are the
 * failures that give away or take away a paid plan by mistake.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { applyStoreEvent, type StoreEvent } from "../api/lib/store-billing";
import { localUsers, proSubscriptions, storeEvents, storePurchases } from "../db/schema";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const buyer = { userId: 89_101, userType: "local" as const };
const stranger = { userId: 89_102, userType: "local" as const };
const KEY = "ledger-test-purchase";
const inAMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

let sequence = 0;
function event(overrides: Partial<StoreEvent> = {}): StoreEvent {
  sequence += 1;
  return {
    store: "google_play",
    purchaseKey: KEY,
    purchaseToken: "token",
    productId: "pro_monthly",
    state: "active",
    expiresAt: inAMonth,
    eventId: `ledger-test-${sequence}`,
    eventType: "confirm",
    eventTime: new Date(),
    owner: buyer,
    ...overrides,
  };
}

async function planOf(userId: number) {
  const [row] = await db.select({ plan: localUsers.plan }).from(localUsers).where(eq(localUsers.id, userId));
  return row?.plan;
}

async function purchases() {
  return db.select().from(storePurchases).where(inArray(storePurchases.userId, [buyer.userId, stranger.userId]));
}

async function clean() {
  await db.delete(storePurchases).where(inArray(storePurchases.userId, [buyer.userId, stranger.userId]));
  await db.delete(storeEvents).where(eq(storeEvents.purchaseKey, KEY));
  await db.delete(proSubscriptions).where(eq(proSubscriptions.userId, buyer.userId));
  await db.delete(localUsers).where(inArray(localUsers.id, [buyer.userId, stranger.userId]));
}

describe("the store ledger", () => {
  beforeEach(async () => {
    await clean();
    for (const who of [buyer, stranger]) {
      await db.insert(localUsers).values({
        id: who.userId,
        name: "test",
        phone: `0100${who.userId}`,
        password: "x",
        plan: "free",
        role: "user",
      });
    }
  });
  afterAll(clean);

  itWithDatabase("a purchase grants the plan, and its replay changes nothing", async () => {
    const purchase = event();
    await expect(applyStoreEvent(purchase)).resolves.toMatchObject({ outcome: "applied", plan: "pro" });
    await db.update(localUsers).set({ plan: "free" }).where(eq(localUsers.id, buyer.userId));

    await expect(applyStoreEvent(purchase)).resolves.toMatchObject({ outcome: "replayed" });

    expect(await planOf(buyer.userId)).toBe("free");
    expect(await purchases()).toHaveLength(1);
  });

  itWithDatabase("twenty replicas receiving one purchase at once leave one row", async () => {
    const same = event();
    const results = await Promise.all(Array.from({ length: 20 }, () => applyStoreEvent(same)));

    expect(results.filter((result) => result.outcome === "applied")).toHaveLength(1);
    expect(await purchases()).toHaveLength(1);
    expect(await planOf(buyer.userId)).toBe("pro");
  });

  itWithDatabase("different events for one new purchase at once still leave one row", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => applyStoreEvent(event())));

    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(await purchases()).toHaveLength(1);
    expect(await planOf(buyer.userId)).toBe("pro");
  });

  itWithDatabase("another account cannot claim a purchase", async () => {
    await applyStoreEvent(event());

    await expect(applyStoreEvent(event({ owner: stranger }))).resolves.toEqual({
      outcome: "owned_by_another_account",
    });

    expect(await planOf(stranger.userId)).toBe("free");
    const [row] = await purchases();
    expect(row.userId).toBe(buyer.userId);
  });

  itWithDatabase("a store notification cannot create a purchase nobody owns", async () => {
    await expect(applyStoreEvent(event({ owner: null }))).resolves.toEqual({ outcome: "unknown_purchase" });
    expect(await purchases()).toHaveLength(0);
  });

  itWithDatabase("a refund ends the plan, and a late older renewal does not bring it back", async () => {
    const start = Date.now();
    await applyStoreEvent(event({ eventTime: new Date(start - 2000) }));
    await applyStoreEvent(event({ state: "refunded", owner: null, eventTime: new Date(start) }));
    expect(await planOf(buyer.userId)).toBe("free");

    const late = await applyStoreEvent(event({ owner: null, eventTime: new Date(start - 1000) }));

    expect(late).toMatchObject({ outcome: "stale", state: "refunded" });
    expect(await planOf(buyer.userId)).toBe("free");
  });

  itWithDatabase("a store refund does not end a plan paid for on the website", async () => {
    await db.insert(proSubscriptions).values({
      userId: buyer.userId,
      userType: buyer.userType,
      plan: "pro",
      status: "active",
      startDate: lastMonth,
      endDate: inAMonth,
    });
    await applyStoreEvent(event());

    await expect(applyStoreEvent(event({ state: "refunded", owner: null }))).resolves.toMatchObject({ plan: "pro" });
  });

  itWithDatabase("an expired period grants nothing, and a new token keeps the purchase and its owner", async () => {
    await expect(applyStoreEvent(event({ expiresAt: lastMonth }))).resolves.toMatchObject({ plan: "free" });

    const moved = await applyStoreEvent(
      event({ purchaseKey: `${KEY}-next`, replacesPurchaseKey: KEY, owner: null, productId: "pro_yearly" }),
    );

    expect(moved).toMatchObject({ outcome: "applied", plan: "pro" });
    const rows = await db
      .select()
      .from(storePurchases)
      .where(and(eq(storePurchases.userId, buyer.userId), eq(storePurchases.store, "google_play")));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ originalTransactionId: `${KEY}-next`, storeProductId: "pro_yearly" });
  });
});
