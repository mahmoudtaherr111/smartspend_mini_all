/**
 * The call's writes and parses go through the app's own tRPC procedures, as the signed-in user, so a spoken
 * expense is exactly a typed one: `ai.parseExpense` (plan and quota checks, the classification pipeline, its log),
 * `expense.batchCreate` (ownership checks, idempotency by clientRequestId, rollups, streak, caches, budget alerts),
 * `expense.delete` and `budget.list`. The router is passed in by the server entry point, which keeps this module
 * out of the router's import graph.
 */
import { and, eq, inArray } from "drizzle-orm";
import { expenses, localUsers, pendingClarifications, users } from "../../../db/schema";
import type { Context, UnifiedUser } from "../../context";
import { db } from "../../queries/connection";
import type { AppRouter } from "../../router";
import type { CallIdentity } from "./gateway/call-session";
import type { BudgetStatus, ParseOutcome, VoiceAppCalls } from "./brain/tools/types";

type Caller = ReturnType<AppRouter["createCaller"]>;

async function unifiedUser(identity: CallIdentity): Promise<UnifiedUser> {
  if (identity.userType === "oauth") {
    const [row] = await db.select().from(users).where(eq(users.id, identity.userId)).limit(1);
    if (!row) throw new Error("voice_user_missing");
    return { id: row.id, name: row.name, email: row.email, avatar: row.avatar, role: row.role as UnifiedUser["role"], plan: row.plan as UnifiedUser["plan"], type: "oauth" };
  }
  const [row] = await db.select().from(localUsers).where(eq(localUsers.id, identity.userId)).limit(1);
  if (!row) throw new Error("voice_user_missing");
  return {
    id: row.id, name: row.name, email: row.email, avatar: row.avatar,
    role: row.role as UnifiedUser["role"], plan: row.plan as UnifiedUser["plan"], type: "local", phone: row.phone,
  };
}

export function createVoiceAppCalls(router: { createCaller(ctx: Context): Caller }): VoiceAppCalls {
  const callerFor = async (identity: CallIdentity) =>
    router.createCaller({ user: await unifiedUser(identity), req: new Request("http://internal/voice-call"), ip: "voice-call" });

  return {
    async parseExpense(identity, text): Promise<ParseOutcome> {
      const caller = await callerFor(identity);
      const result = await caller.ai.parseExpense({ text, inputChannel: "voice" });
      return {
        decision: result.decision,
        items: result.items.map((item) => ({
          amount: Number(item.amount),
          type: String(item.type ?? "expense"),
          category: item.category,
          subCategory: item.subCategory,
          description: item.description,
          date: item.date,
        })),
        clarificationQuestion: result.clarificationQuestion,
        clarificationId: result.clarificationId,
        classificationLogId: result.classificationLogId,
      };
    },

    async saveExpenses(identity, items) {
      const caller = await callerFor(identity);
      await caller.expense.batchCreate(items.map((item) => ({
        amount: item.amount,
        type: item.type as "expense",
        category: item.category,
        subCategory: item.subCategory,
        description: item.description,
        rawText: item.rawText,
        source: "voice" as const,
        date: item.date,
        classificationLogId: item.classificationLogId,
        clientRequestId: item.clientRequestId,
      })));
      // The procedure answers with a count; the ids are what "undo" needs, found by the request ids it stored.
      const rows = await db.select({ id: expenses.id }).from(expenses).where(and(
        eq(expenses.userId, identity.userId),
        eq(expenses.userType, identity.userType),
        inArray(expenses.clientRequestId, items.map((item) => item.clientRequestId)),
      ));
      return { ids: rows.map((row) => row.id) };
    },

    async deleteExpenses(identity, ids) {
      const caller = await callerFor(identity);
      for (const id of ids) await caller.expense.delete({ id });
    },

    async listBudgets(identity): Promise<BudgetStatus[]> {
      const caller = await callerFor(identity);
      const { budgets } = await caller.budget.list();
      return budgets
        .filter((budget) => budget.status === "active")
        .map((budget) => ({
          title: budget.title,
          category: budget.category,
          limit: Number(budget.monthlyLimit),
          spent: Number(budget.currentSpent),
          percent: Number(budget.percentage),
          exceeded: Boolean(budget.isExceeded),
        }));
    },

    async dismissClarification(identity, clarificationId) {
      await db.update(pendingClarifications).set({ status: "resolved" }).where(and(
        eq(pendingClarifications.id, clarificationId),
        eq(pendingClarifications.userId, identity.userId),
        eq(pendingClarifications.userType, identity.userType),
        eq(pendingClarifications.status, "pending"),
      ));
    },
  };
}
