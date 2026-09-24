import { describe, it, expect, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { expenseRouter, namedPersonOf } from "./expense-router";
import { db } from "./queries/connection";
import { expenses } from "../db/schema";

/** A Drizzle query builder is a chain of methods returning itself; the test only needs the calls it makes. */
type QueryChain = Record<string, ReturnType<typeof vi.fn>>;

const { dbMock } = vi.hoisted(() => {
  const rows = [{ id: 1, amount: "100" }];
  const countRows = [{ count: 1 }];
  const mock = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      const isCountQuery = Boolean(fields?.count);
      const chain: QueryChain = {
        from: vi.fn(() => chain),
        where: vi.fn(() => (isCountQuery ? Promise.resolve(countRows) : chain)),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        offset: vi.fn(() => Promise.resolve(rows)),
      };
      return chain;
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };

  return { dbMock: mock };
});

vi.mock("./queries/connection", () => ({
  db: dbMock,
  getDb: () => dbMock,
}));

describe("Expense Router", () => {
  it("should have list, create, update, delete endpoints", () => {
    expect(expenseRouter).toBeDefined();
    // @ts-ignore
    expect(expenseRouter._def.procedures.list).toBeDefined();
    // @ts-ignore
    expect(expenseRouter._def.procedures.create).toBeDefined();
    // @ts-ignore
    expect(expenseRouter._def.procedures.update).toBeDefined();
    // @ts-ignore
    expect(expenseRouter._def.procedures.delete).toBeDefined();
  });

  it("should return paginated list of expenses", async () => {
    // This is a basic integration test mock to ensure the endpoints execute
    const caller = expenseRouter.createCaller({
      user: { id: 1, type: "oauth", email: "test@example.com", name: "Test" },
    });

    const result = await caller.list({ limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(1);
  });

  it("keeps the search's text matches inside the user filter", async () => {
    let where: SQL | undefined;
    dbMock.select.mockImplementationOnce(() => {
      const chain: QueryChain = {
        from: vi.fn(() => chain),
        where: vi.fn((condition: SQL) => {
          where = condition;
          return chain;
        }),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve([])),
      };
      return chain;
    });
    const caller = expenseRouter.createCaller({
      user: { id: 7, type: "local", email: "search@example.com", name: "Search" },
    });

    await caller.searchTransactions({ query: "كارفور" });

    // and() does not parenthesize its arguments, so the alternatives need their own group:
    // `user = ? and a like ? or b like ?` matches every user's rows through b (api/AGENTS.md rule 3).
    const query = new MySqlDialect().sqlToQuery(where!);
    expect(query.sql).toMatch(
      /^\(`expenses`\.`user_id` = \? and `expenses`\.`user_type` = \? and \(.+ or .+\)\)$/,
    );
    expect(query.params.slice(0, 2)).toEqual([7, "local"]);
  });
});

describe("the person a saved item names", () => {
  it("reads the person category's subcategory", () => {
    expect(namedPersonOf({ category: "أصدقاء", subCategory: "أحمد صاحبي" })).toEqual({
      name: "أحمد",
      relationship: "صاحبي",
    });
  });

  it("keeps the person named beside a purpose, so the save links the contact", () => {
    expect(
      namedPersonOf({ category: "تعليم", subCategory: "مدرسة", personName: " ابني ", personRelationship: "ابن" }),
    ).toEqual({ name: "ابني", relationship: "ابن" });
  });

  it("links nothing without a name and a relationship", () => {
    expect(namedPersonOf({ category: "تعليم", subCategory: "مدرسة", personName: "مروان" })).toBeNull();
    expect(namedPersonOf({ category: "العائلة", subCategory: "عام" })).toBeNull();
  });
});
