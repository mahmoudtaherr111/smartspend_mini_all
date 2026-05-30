import { describe, it, expect, vi } from "vitest";
import { expenseRouter } from "./expense-router";
import { db } from "./queries/connection";
import { expenses } from "../db/schema";

vi.mock("./queries/connection", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([{ id: 1, amount: "100" }]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
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
