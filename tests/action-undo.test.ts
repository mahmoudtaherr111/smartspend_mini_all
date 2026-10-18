import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, type Column } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { aiActionMemory, expenses, userBudgets } from "../db/schema";
import { executeRuntimeAction } from "../api/services/action-runtime/extended-actions";

vi.mock("../api/notification-engine", () => ({ checkUserBudgetExceeded: vi.fn(async () => undefined) }));

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const ctx = { userId: 88_953, userType: "local", userPlan: "pro" };
const mine = (table: { userId: Column; userType: Column }) =>
  and(eq(table.userId, ctx.userId), eq(table.userType, ctx.userType));

async function clean() {
  await db.delete(aiActionMemory).where(mine(aiActionMemory));
  await db.delete(expenses).where(mine(expenses));
  await db.delete(userBudgets).where(mine(userBudgets));
}

/** What confirmAction stores after it runs a draft. */
async function remember(actionName: string, payload: Record<string, unknown>) {
  await db.insert(aiActionMemory).values({
    userId: ctx.userId,
    userType: ctx.userType,
    actionName,
    status: "executed",
    summary: actionName,
    payload,
  });
}

describe("undo of what an assistant action created", () => {
  beforeEach(clean);
  afterAll(clean);

  itWithDatabase("removes the expense and the budget, newest first, each once", async () => {
    const expense = await executeRuntimeAction(ctx, "expense.create", {
      amount: 150,
      category: "أكل وشرب",
      rawText: "اكلت ب 150",
    });
    await remember("expense.create", expense);
    const budget = await executeRuntimeAction(ctx, "budget.create", { title: "ميزانية الأكل", monthlyLimit: 3000 });
    await remember("budget.create", budget);

    const first = await executeRuntimeAction(ctx, "action.undo", {});
    expect(first).toMatchObject({ undoneActionName: "budget.create" });
    expect(await db.select().from(userBudgets).where(mine(userBudgets))).toHaveLength(0);

    // The budget's undo is spent, so the next one reaches the expense instead of the budget again.
    const second = await executeRuntimeAction(ctx, "action.undo", {});
    expect(second).toMatchObject({ undoneActionName: "expense.create", expenseId: expense.expenseId });
    expect(await db.select().from(expenses).where(mine(expenses))).toHaveLength(0);

    await expect(executeRuntimeAction(ctx, "action.undo", {})).rejects.toThrow("No reversible action found");
    const statuses = await db.select({ status: aiActionMemory.status }).from(aiActionMemory).where(mine(aiActionMemory));
    expect(statuses.map((row) => row.status).sort()).toEqual(["undone", "undone"]);
  });
});
