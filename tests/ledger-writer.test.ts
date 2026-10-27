import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { expenseDailyRollups, expenses, localUsers, userContacts } from "../db/schema";
import { db } from "../api/queries/connection";
import {
  createLedgerEntry,
  deleteLedgerEntry,
  insertLedgerEntriesInTx,
  updateLedgerEntry,
  type NewLedgerEntry,
} from "../api/services/ledger-writer";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const describeWithDatabase = describe.runIf(process.env.RUN_DB_INTEGRATION === "1");

describeWithDatabase("the ledger writer", () => {
  const owner = { userId: 88811, userType: "local" };
  const phone = "+201000088811";

  const entry = (overrides: Partial<NewLedgerEntry> = {}): NewLedgerEntry => ({
    type: "expense",
    amount: 120,
    category: "طعام",
    description: "غدا",
    rawText: "غدا 120",
    source: "manual",
    date: new Date("2026-10-20T10:00:00.000Z"),
    ...overrides,
  });

  const rowsOf = (userType = owner.userType) =>
    db.select().from(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, userType)));

  const spentOn = async (day: string) => {
    const [rollup] = await db
      .select()
      .from(expenseDailyRollups)
      .where(
        and(
          eq(expenseDailyRollups.userId, owner.userId),
          eq(expenseDailyRollups.userType, owner.userType),
          eq(expenseDailyRollups.day, day),
        ),
      );
    return Number(rollup?.expense ?? 0);
  };

  const cleanUp = async () => {
    for (const userType of ["local", "oauth"]) {
      await db.delete(expenseDailyRollups).where(and(eq(expenseDailyRollups.userId, owner.userId), eq(expenseDailyRollups.userType, userType)));
      await db.delete(expenses).where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, userType)));
      await db.delete(userContacts).where(and(eq(userContacts.userId, owner.userId), eq(userContacts.userType, userType)));
    }
    await db.delete(localUsers).where(eq(localUsers.id, owner.userId));
  };

  beforeEach(async () => {
    await cleanUp();
    await db.insert(localUsers).values({ id: owner.userId, name: "Ledger Writer Test", phone, password: "x" });
  });
  afterAll(cleanUp);

  it("saves the row with its rollup and gives back the saved row when the request is retried", async () => {
    const first = await createLedgerEntry(owner, entry({ clientRequestId: "ledger-writer-retry" }));
    const retry = await createLedgerEntry(owner, entry({ clientRequestId: "ledger-writer-retry" }));

    expect(first.existing).toBeNull();
    expect(retry.existing?.id).toBe(first.id);
    expect(await rowsOf()).toHaveLength(1);
    expect(await spentOn("2026-10-20")).toBe(120);
  });

  it("moves the streak only for a save that counts for it", async () => {
    const streak = async () =>
      (await db.select({ current: localUsers.currentStreak }).from(localUsers).where(eq(localUsers.id, owner.userId)))[0]?.current ?? 0;

    await createLedgerEntry(owner, entry(), { countsForStreak: false });
    expect(await streak()).toBe(0);
    await createLedgerEntry(owner, entry());
    expect(await streak()).toBe(1);
  });

  it("stores a refund negative, in the category it was bought from", async () => {
    const { id } = await createLedgerEntry(owner, entry({ amount: 40, direction: "incoming" }));
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id!));

    expect(Number(row.amount)).toBe(-40);
    expect(row.category).toBe("طعام");
    expect(await spentOn("2026-10-20")).toBe(-40);
  });

  it("adds several rows with consecutive ids and counts each row for its contact", async () => {
    const [contact] = await db.insert(userContacts).values({ userId: owner.userId, userType: owner.userType, name: "أحمد" });
    const contactId = Number((contact as { insertId?: number }).insertId);

    const ids = await db.transaction((tx) =>
      insertLedgerEntriesInTx(tx, owner, [entry({ contactId }), entry({ amount: 30, contactId })]),
    );

    const saved = await rowsOf();
    expect(ids).toEqual(saved.map((row) => row.id).sort((a, b) => a - b));
    expect(ids[1]).toBe(ids[0] + 1);
    const [counted] = await db.select().from(userContacts).where(eq(userContacts.id, contactId));
    expect(counted.transactionCount).toBe(2);
    expect(await spentOn("2026-10-20")).toBe(150);
  });

  it("moves the rollup on an edit and backs it out on a delete", async () => {
    const { id } = await createLedgerEntry(owner, entry());

    await updateLedgerEntry(owner, id!, { amount: 200, date: new Date("2026-10-21T10:00:00.000Z") });
    expect(await spentOn("2026-10-20")).toBe(0);
    expect(await spentOn("2026-10-21")).toBe(200);

    const removed = await deleteLedgerEntry(owner, id!);
    expect(Number(removed.amount)).toBe(200);
    expect(await rowsOf()).toHaveLength(0);
    expect(await spentOn("2026-10-21")).toBe(0);
  });

  it("refuses a row of another user, including a Google user with the same id", async () => {
    const { id } = await createLedgerEntry(owner, entry());
    const sameIdOtherKind = { userId: owner.userId, userType: "oauth" };

    await expect(updateLedgerEntry(sameIdOtherKind, id!, { amount: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteLedgerEntry(sameIdOtherKind, id!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await rowsOf()).toHaveLength(1);
    expect(await spentOn("2026-10-20")).toBe(120);
  });
});
