import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { db, mysqlPool } from "../queries/connection";
import {
  expenses,
  financialCaptures,
  expenseDetails,
  expenseDailyRollups,
} from "../../db/schema";
import { captureDraftSchema } from "../../contracts/financial-capture";
import {
  createCapture,
  answerCapture,
  confirmCapture,
  getCapture,
  listCaptures,
  dismissCapture,
} from "./financial-capture-store";

const enabled = process.env.RUN_CAPTURE_MYSQL_INTEGRATION === "1";
if (
  enabled &&
  !/^mysql:\/\/[^@]+@127\.0\.0\.1:33071\/capture_test$/.test(
    process.env.DATABASE_URL || "",
  )
)
  throw new Error("Dedicated local capture_test database required");
const owner = { id: 9_606_001, type: "local" as const };
const draft = () =>
  captureDraftSchema.parse({
    schemaVersion: 1,
    channel: "image",
    receivedAt: "2026-09-06T10:00:00Z",
    sourceText: randomUUID(),
    businessId: null,
    ignoredReason: null,
    issues: [],
    events: [
      {
        id: "a",
        amount: 63.25,
        currency: "EGP",
        occurredAt: "2026-09-05T10:00:00+03:00",
        kind: "expense",
        category: "أكل وشرب",
        subCategory: "عام",
        merchant: "مطعم",
        description: "تكامل محلي",
        status: "realized",
        evidence: "إيصال63.25",
        issues: [],
      },
    ],
  });
const inserted = async (id: string) =>
  db
    .select()
    .from(expenses)
    .where(
      sql`JSON_UNQUOTE(JSON_EXTRACT(${expenses.parsedMetadata}, '$.captureId')) = ${id}`,
    );
describe.skipIf(!enabled)("MySQL durable source / answer / commit loop", () => {
  it("applies migration 0022 and matches the ORM table columns and indexes", async () => {
    const migration = readFileSync(
      new URL(
        "../../db/migrations/0022_financial_capture_loop.sql",
        import.meta.url,
      ),
      "utf8",
    ).replace(
      "CREATE TABLE `financial_captures`",
      "CREATE TABLE `financial_captures_migration_probe`",
    );
    await db.execute(sql.raw(migration));
    try {
      const columns = async (table: string) =>
        (
          await mysqlPool.query(
            "SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='capture_test' AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",
            [table],
          )
        )[0];
      const indexes = async (table: string) =>
        (
          await mysqlPool.query(
            "SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='capture_test' AND TABLE_NAME=? ORDER BY INDEX_NAME,SEQ_IN_INDEX",
            [table],
          )
        )[0];
      expect(await columns("financial_captures_migration_probe")).toEqual(
        await columns("financial_captures"),
      );
      expect(await indexes("financial_captures_migration_probe")).toEqual(
        await indexes("financial_captures"),
      );
    } finally {
      await db.execute(
        sql.raw("DROP TABLE financial_captures_migration_probe"),
      );
    }
  });
  afterAll(async () => {
    const rows = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.userId, owner.id));
    for (const r of rows)
      await db.delete(expenseDetails).where(eq(expenseDetails.expenseId, r.id));
    await db.delete(expenses).where(eq(expenses.userId, owner.id));
    await db
      .delete(expenseDailyRollups)
      .where(eq(expenseDailyRollups.userId, owner.id));
    await db
      .delete(financialCaptures)
      .where(eq(financialCaptures.userId, owner.id));
    await mysqlPool.end();
  });
  it("concurrent duplicate intake produces one durable draft", async () => {
    const key = randomUUID(),
      d = draft();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createCapture(owner, key, d)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
  });
  it("same key with different source is a conflict", async () => {
    const key = randomUUID();
    await createCapture(owner, key, draft());
    await expect(createCapture(owner, key, draft())).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("same numeric OAuth and local IDs are isolated", async () => {
    const c = await createCapture(owner, randomUUID(), draft());
    await expect(
      getCapture({ ...owner, type: "oauth" }, c.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      confirmCapture({ ...owner, type: "oauth" }, c.id, 1),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("two simultaneous answers cannot overwrite one another", async () => {
    const c = await createCapture(owner, randomUUID(), draft());
    const r = await Promise.allSettled(
      [70, 80].map((value) =>
        answerCapture(owner, {
          captureId: c.id,
          version: 1,
          eventId: "a",
          field: "amount",
          value,
        }),
      ),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await getCapture(owner, c.id)).version).toBe(2);
  });
  it("stale confirmation cannot save a changed draft", async () => {
    const c = await createCapture(owner, randomUUID(), draft());
    await answerCapture(owner, {
      captureId: c.id,
      version: 1,
      eventId: "a",
      field: "amount",
      value: 80,
    });
    await expect(confirmCapture(owner, c.id, 1)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await inserted(c.id)).toHaveLength(0);
  });
  it("concurrent confirmations and retry after a lost response return the same receipt", async () => {
    const c = await createCapture(owner, randomUUID(), draft());
    const receipts = await Promise.all(
      Array.from({ length: 8 }, () => confirmCapture(owner, c.id, 1)),
    );
    receipts.forEach((r) => expect(r).toEqual(receipts[0]));
    expect(await inserted(c.id)).toHaveLength(1);
    expect(await confirmCapture(owner, c.id, 1)).toEqual(receipts[0]);
  });
  it("matches the reviewed amount, date, category and metadata in the saved row", async () => {
    const d = draft();
    const c = await createCapture(owner, randomUUID(), d);
    const receipt = await confirmCapture(owner, c.id, 1);
    const [saved] = await inserted(c.id);
    expect(Number(saved.amount)).toBe(d.events[0].amount);
    expect(saved.category).toBe(d.events[0].category);
    expect(saved.id).toBe(receipt.events[0].expenseId);
    expect(saved.date.getTime()).toBe(
      new Date(d.events[0].occurredAt!).getTime(),
    );
    const details = await db
      .select()
      .from(expenseDetails)
      .where(eq(expenseDetails.expenseId, saved.id));
    expect(details).toHaveLength(1);
  });
  it("refuses incomplete, foreign currency, or source-pending events even after unrelated answers", async () => {
    for (const change of [
      { amount: null },
      { currency: "USD" },
      { status: "pending" as const },
    ]) {
      const d = draft();
      Object.assign(d.events[0], change);
      const c = await createCapture(owner, randomUUID(), d);
      await answerCapture(owner, {
        captureId: c.id,
        version: 1,
        eventId: "a",
        field: "merchant",
        value: "Netflix",
      });
      await expect(confirmCapture(owner, c.id, 2)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(await inserted(c.id)).toHaveLength(0);
    }
  });
  it("foreign business scope is rejected at commit", async () => {
    const d = draft();
    d.businessId = 9_606_099;
    const c = await createCapture(owner, randomUUID(), d);
    await expect(confirmCapture(owner, c.id, 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await inserted(c.id)).toHaveLength(0);
  });
  it("equal amounts in distinct events create two mapped receipts", async () => {
    const d = draft();
    d.events.push({ ...d.events[0], id: "b" });
    const c = await createCapture(owner, randomUUID(), d);
    const r = await confirmCapture(owner, c.id, 1);
    expect(r.events.map((e) => e.eventId)).toEqual(["a", "b"]);
    expect(new Set(r.events.map((e) => e.expenseId)).size).toBe(2);
  });
  it("failure inserting the second event rolls back expense, details, rollup and draft consumption", async () => {
    const d = draft();
    d.events.push({
      ...d.events[0],
      id: "b",
      description: "capture-test-force-failure",
    });
    const c = await createCapture(owner, randomUUID(), d);
    const before = await db
      .select()
      .from(expenseDailyRollups)
      .where(eq(expenseDailyRollups.userId, owner.id));
    await db.execute(
      sql.raw(
        "CREATE TRIGGER capture_test_fail BEFORE INSERT ON expenses FOR EACH ROW BEGIN IF NEW.description = 'capture-test-force-failure' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced test failure'; END IF; END",
      ),
    );
    try {
      await expect(confirmCapture(owner, c.id, 1)).rejects.toThrow();
    } finally {
      await db.execute(sql.raw("DROP TRIGGER capture_test_fail"));
    }
    expect(await inserted(c.id)).toHaveLength(0);
    expect((await getCapture(owner, c.id)).state).toBe("review");
    expect(
      await db
        .select()
        .from(expenseDailyRollups)
        .where(eq(expenseDailyRollups.userId, owner.id)),
    ).toEqual(before);
  });
  it("dismissed and expired drafts cannot be saved", async () => {
    const c = await createCapture(owner, randomUUID(), draft());
    await dismissCapture(owner, c.id, 1);
    await expect(confirmCapture(owner, c.id, 1)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const e = await createCapture(owner, randomUUID(), draft());
    await db
      .update(financialCaptures)
      .set({ expiresAt: new Date(0) })
      .where(
        and(
          eq(financialCaptures.id, e.id),
          eq(financialCaptures.userId, owner.id),
        ),
      );
    await expect(confirmCapture(owner, e.id, 1)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect((await listCaptures(owner)).some((r) => r.id === e.id)).toBe(false);
  });
});
