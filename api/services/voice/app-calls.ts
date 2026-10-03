/**
 * The call's writes and parses go through the app's own tRPC procedures, as the signed-in user, so a spoken
 * expense is exactly a typed one: `ai.parseExpense` (plan and quota checks, the classification pipeline, its log),
 * `expense.batchCreate` (ownership checks, idempotency by clientRequestId, rollups, streak, caches, budget alerts),
 * `expense.delete` and `budget.list`. The router is passed in by the server entry point, which keeps this module
 * out of the router's import graph.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { expenses, localUsers, pendingClarifications, users } from "../../../db/schema";
import type { Context, UnifiedUser } from "../../context";
import { db } from "../../queries/connection";
import type { AppRouter } from "../../router";
import type { CallIdentity } from "./gateway/call-session";
import type { BankSuggestion, BudgetStatus, DebtStanding, InstallmentStanding, ParseOutcome, SeasonSpending, VoiceAppCalls } from "./brain/tools/types";
import { SEASON_IDS, type SeasonId } from "../../lib/seasons";
import { financeCacheKey, withFinanceCache } from "../finance-semantic-layer/cache";
import { directionToSave, personToSave } from "../../../contracts/expense-save";

type Caller = ReturnType<AppRouter["createCaller"]>;

export async function unifiedUser(
  identity: CallIdentity,
): Promise<UnifiedUser> {
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

export function createVoiceAppCalls(router: {
  createCaller(ctx: Context): Caller;
}): VoiceAppCalls {
  const callerFor = async (identity: CallIdentity) =>
    router.createCaller({ user: await unifiedUser(identity), req: new Request("http://internal/voice-call"), ip: "voice-call" });

  return {
    async parseExpense(identity, text, scope): Promise<ParseOutcome> {
      const caller = await callerFor(identity);
      const result = await caller.ai.parseExpense({
        text,
        inputChannel: "voice",
        ...(scope ? { businessMode: true } : {}),
      });
      return {
        decision: result.decision,
        // The same fields the expense form saves (contracts/expense-save.ts): a refund keeps its direction, a
        // loan or gam3eya its way, a purpose its person.
        items: result.items.map((item) => ({
          amount: Number(item.amount),
          type: String(item.type ?? "expense"),
          category: item.category,
          subCategory: item.subCategory,
          description: item.description,
          date: item.date,
          direction: directionToSave(item),
          ...personToSave(item),
        })),
        clarificationQuestion: result.clarificationQuestion,
        clarificationId: result.clarificationId,
        classificationLogId: result.classificationLogId,
      };
    },

    async saveExpenses(identity, items) {
      const caller = await callerFor(identity);
      const businessIds = [
        ...new Set(
          items
            .map((item) => item.businessId)
            .filter((id): id is number => id !== undefined),
        ),
      ];
      if (businessIds.length) {
        const { business } = await caller.business.get();
        if (
          businessIds.length !== 1 ||
          !business ||
          business.isActive === false ||
          business.id !== businessIds[0]
        )
          throw new Error("voice_business_unavailable");
      }
      await caller.expense.batchCreate(
        items.map((item) => ({
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
          direction: item.direction,
          personName: item.personName,
          personRelationship: item.personRelationship,
          ...(item.businessId ? { businessId: item.businessId } : {}),
        })),
      );
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
      let deleted = 0;
      for (const id of ids) {
        await caller.expense.delete({ id });
        deleted += 1;
      }
      return { deleted };
    },

    async listBudgets(identity): Promise<BudgetStatus[]> {
      // Cached like the finance layer's answers: any budget or expense write bumps the user's generation and drops it.
      const key = financeCacheKey(identity.userId, identity.userType, "voice_budgets", "now");
      return withFinanceCache(key, 60, async () => {
        const caller = await callerFor(identity);
        const { budgets } = await caller.budget.list();
        return budgets
          .filter((budget) => budget.status === "active" || budget.status === "paused")
          .map((budget) => ({
            id: Number(budget.id),
            status: budget.status === "paused" ? ("paused" as const) : ("active" as const),
            title: budget.title,
            category: budget.category,
            limit: Number(budget.monthlyLimit),
            spent: Number(budget.currentSpent),
            percent: Number(budget.percentage),
            exceeded: Boolean(budget.isExceeded),
          }));
      });
    },

    async bankSuggestions(identity): Promise<BankSuggestion[]> {
      const caller = await callerFor(identity);
      const rows = await caller.profile.getSmsSuggestions();
      return rows.map((row) => ({
        id: row.id,
        amount: Number(row.amount),
        type: String(row.type),
        direction: row.direction ?? null,
        category: row.category,
        what: String(row.merchant || row.description || row.provider || "").slice(0, 60),
        day: String(row.date ?? "").slice(0, 10),
      }));
    },

    async confirmBankSuggestion(identity, id) {
      const caller = await callerFor(identity);
      try {
        await caller.profile.confirmSmsSuggestion({ id });
        return true;
      } catch (error) {
        if (error instanceof Error && "code" in error && (error as { code?: string }).code === "NOT_FOUND") return false;
        throw error;
      }
    },

    async dismissBankSuggestion(identity, id) {
      const caller = await callerFor(identity);
      return (await caller.profile.dismissSmsSuggestion({ id })).success;
    },

    async debts(identity): Promise<DebtStanding> {
      const caller = await callerFor(identity);
      const result = await caller.expense.getDebtBalances();
      return {
        people: result.balances.map((entry) => ({
          name: entry.name,
          contactId: entry.contactId,
          balance: entry.balance,
          lent: entry.lent,
          received: entry.received,
          count: entry.count,
          lastDate: new Date(entry.lastDate).toISOString().slice(0, 10),
        })),
        owedToYou: result.owedToYou,
        youOwe: result.youOwe,
        gam3eya: result.gam3eya,
      };
    },

    async installments(identity): Promise<InstallmentStanding[]> {
      const caller = await callerFor(identity);
      const plans = await caller.expense.listInstallmentPlans();
      return plans.map((plan) => ({
        title: plan.title,
        keyword: plan.keyword,
        monthlyAmount: plan.monthlyAmount,
        totalInstallments: plan.totalInstallments,
        paid: plan.paid,
        remaining: plan.remaining,
        remainingAmount: plan.remainingAmount,
        countedBy: plan.countedBy,
      }));
    },

    async updateBudget(identity, budgetId, change) {
      const caller = await callerFor(identity);
      await caller.budget.update({ budgetId, ...change });
    },

    async business(identity) {
      const caller = await callerFor(identity);
      try {
        const { business } = await caller.business.get();
        return business && business.isActive !== false ? { id: business.id, name: business.name } : "none";
      } catch (error) {
        // The business screen's own gate: the plan has no businesses.
        if (error instanceof TRPCError && error.code === "FORBIDDEN") return "not_in_plan";
        throw error;
      }
    },

    async season(identity, season, year): Promise<SeasonSpending | null> {
      if (!(SEASON_IDS as readonly string[]).includes(season)) return null;
      const caller = await callerFor(identity);
      try {
        const result = await caller.expense.getSeasonSpending({ season: season as SeasonId, ...(year ? { year } : {}) });
        return {
          label: result.label,
          startDay: result.startDay,
          endDay: result.endDay,
          total: result.total,
          count: result.count,
          byCategory: result.byCategory.map((row) => ({ category: row.category, amount: row.amount })),
          previous: result.previous,
        };
      } catch (error) {
        // The procedure says NOT_FOUND for a season it has no dates for; anything else is a failure to say as one.
        if (error instanceof Error && "code" in error && (error as { code?: string }).code === "NOT_FOUND") return null;
        throw error;
      }
    },

    async answerProfileQuestion(identity, key, value, skipped) {
      const caller = await callerFor(identity);
      await caller.profile.submitOnboardingAnswer({ key, value: skipped ? undefined : (value as never), skipped });
    },

    async dismissClarification(identity, clarificationId) {
      await db.update(pendingClarifications).set({ status: "resolved" }).where(and(
        eq(pendingClarifications.id, clarificationId),
        eq(pendingClarifications.userId, identity.userId),
        eq(pendingClarifications.userType, identity.userType),
        eq(pendingClarifications.status, "pending"),
      ));
    },

    async waitingEntry(identity, clarificationId) {
      const [row] = await db
        .select({ words: pendingClarifications.originalText })
        .from(pendingClarifications)
        .where(and(
          eq(pendingClarifications.id, clarificationId),
          eq(pendingClarifications.userId, identity.userId),
          eq(pendingClarifications.userType, identity.userType),
          eq(pendingClarifications.status, "pending"),
        ))
        .limit(1);
      return row ? { words: String(row.words ?? "") } : null;
    },
  };
}
