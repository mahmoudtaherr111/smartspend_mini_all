import { describe, it, expect, vi } from "vitest";
import { expenseRouter } from "./expense-router";
import { db } from "./queries/connection";
import { expenses } from "../db/schema";

const { dbMock } = vi.hoisted(() => {
  const rows = [{ id: 1, amount: "100" }];
  const countRows = [{ count: 1 }];
  const mock: any = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      const isCountQuery = Boolean(fields?.count);
      const chain: any = {
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
});
