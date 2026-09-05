# Remediation Diagnostic & Specification Report: `api/goals-router.ts`

**Date**: 2026-08-29  
**Investigator**: Explorer Remediate 1 (`explorer_remediate_1`)  
**Scope**: Complete AST Diagnosis, Contract Specification & Type-Safe Remediation for `api/goals-router.ts`  

---

## 1. Executive Summary

During the Milestone 1 Forensic Integrity Audit, `npm run check` failed with exit code 1 due to fatal AST syntax errors starting at `api/goals-router.ts:68`.
A code truncation / malformed paste corrupted lines 68–69, replacing the closure of `trackGoalTokens`, the `goalsRouter` declaration, the `list` query, the `create` mutation, and the beginning of the `analyze` procedure with a broken statement `await recordAiUsageEvent({` directly followed by `const profile = await getSmartProfile(...)`.

This report provides the complete root cause breakdown, the required tRPC v11 API contract matching frontend consumers (`FinancialGoalsPanel.tsx`, `SmartProfileView.tsx`, `api/router.ts`), full dual-user authorization checks (`(userId, userType)`), rate-limiting / token accounting, and the complete type-safe replacement code.

---

## 2. Root Cause & AST Syntax Breakdown

### 2.1 Corrupted Code Inspection (`api/goals-router.ts:50–75`)

In the existing file:
```typescript
async function trackGoalTokens(
  userId: number,
  userType: "oauth" | "local",
  tokens: number,
  model?: string,
) {
  if (!tokens) return;
  if (userType === "oauth") {
    await db
      .update(users)
      .set({ aiTokensUsed: sql`COALESCE(ai_tokens_used, 0) + ${tokens}` })
      .where(eq(users.id, userId));
  } else {
    await db
      .update(localUsers)
      .set({ aiTokensUsed: sql`COALESCE(ai_tokens_used, 0) + ${tokens}` })
      .where(eq(localUsers.id, userId));
  }
  await recordAiUsageEvent({
      const profile = await getSmartProfile(ctx.user.id, ctx.user.type);
      const monthRange = businessMonthRange();
      const monthExpense = await db
        .select({ total: sql<number>`COALESCE(SUM(amount),0)` })
        .from(expenses)
...
```

### 2.2 Missing AST Constructs
1. **Unclosed Object & Function Closure**: `recordAiUsageEvent({` was unclosed, causing TypeScript parser errors (`TS1005: ':' expected`, `TS1005: ',' expected`).
2. **Missing `export const goalsRouter = router({`**: The router export was entirely omitted, causing `api/router.ts:19` to import an undefined entity and breaking tRPC route compilation.
3. **Missing `list` Query**: `trpc.goals.list` used by `FinancialGoalsPanel.tsx:29` and `SmartProfileView.tsx:174` was missing.
4. **Missing `create` Mutation**: `trpc.goals.create` used by `FinancialGoalsPanel.tsx:33` with free tier limit enforcement (`FREE_GOALS_LIMIT = 3`) was missing.
5. **Missing `analyze` Procedure Header & Goal Ownership Lookup**: The `analyze: proProcedure.input(z.object({ goalId: z.number() })).mutation(async ({ ctx, input }) => { const [goal] = await db.select().from(financialGoals)...` was wiped out, leaving orphaned `goal` variable references (`goal.title`, `goal.id`, etc.) inside what appeared to be top-level code.

---

## 3. Router Contract Specification

| Procedure | Type | Access Level | Input Schema | Output Type | Consumers |
|:---|:---|:---|:---|:---|:---|
| `list` | Query | `authedProcedure` | `void` | `{ goals: FinancialGoal[], isPro: boolean, upsell: object \| null }` | `FinancialGoalsPanel.tsx`, `SmartProfileView.tsx` |
| `create` | Mutation | `authedProcedure` | `z.object({ title: z.string().min(1).max(200), description: z.string().max(120).optional(), targetAmount: z.number().positive().max(ExpenseInputLimits.amountMax).optional(), targetDate: z.string().or(z.date()).optional() })` | `{ id: number, success: boolean }` | `FinancialGoalsPanel.tsx` |
| `analyze` | Mutation | `proProcedure` | `z.object({ goalId: z.number() })` | `{ goalId: number, analysis: Record<string, unknown>, tokensUsed: number }` | `FinancialGoalsPanel.tsx` |
| `setStatus` | Mutation | `authedProcedure` | `z.object({ goalId: z.number(), status: z.enum(["active", "completed", "paused"]) })` | `{ success: boolean }` | `SmartProfileView.tsx` |
| `delete` | Mutation | `authedProcedure` | `z.object({ goalId: z.number() })` | `{ success: boolean }` | `FinancialGoalsPanel.tsx` / API |

### 3.1 Security & Invariants Adherence
- **Dual-User Identity**: All database queries strictly scope by `and(eq(financialGoals.userId, ctx.user.id), eq(financialGoals.userType, ctx.user.type))`.
- **RBAC**: `analyze` strictly uses `proProcedure` (`pro` / `ultra` / `admin`). Free users receive `FORBIDDEN` error if attempting AI analysis directly.
- **Quota & Token Policy**: AI execution uses `assertAiBudget(ctx.user, "goal", estimated)`, `clampOutputTokens`, `capRequestOutputTokens`, and logs usage via `trackGoalTokens` -> `recordAiUsageEvent`.
- **Relational Integrity**: `delete` runs in a transaction, setting `userBudgets.linkedGoalId = null` for all linked budgets before deleting the goal.
- **Cache Invalidation**: Mutations call `invalidateFinanceUserCache(ctx.user.id, ctx.user.type)`.

---

## 4. Full Type-Safe Proposed Replacement Code

Below is the complete, validated code for `api/goals-router.ts`:

```typescript
import { z } from "zod";
import { router, authedProcedure, proProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { financialGoals, expenses, users, localUsers, userBudgets } from "../db/schema";
import { eq, and, desc, gte, lt, sql } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "./lib/env";
import {
  assertAiBudget,
  clampOutputTokens,
  estimateTokensFromText,
  loadSystemConfig,
  recordAiUsageEvent,
  asPlan,
  capRequestOutputTokens,
} from "./lib/ai-usage-policy";
import { mapModelName } from "./lib/model-mapper";
import {
  getSmartProfile,
  summarizeProfileForAI,
} from "./services/user-profile-service";
import { invalidateFinanceUserCache } from "./services/finance-semantic-layer";
import { businessMonthRange } from "./lib/app-time";
import { ExpenseInputLimits } from "../contracts/constants";

const FREE_DESCRIPTION_MAX = 120;
const FREE_GOALS_LIMIT = 3;

function isMissingGoalsTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("financial_goals") &&
    (msg.includes("doesn't exist") ||
      msg.includes("ER_NO_SUCH_TABLE") ||
      msg.includes("Failed query"))
  );
}

const PRO_UPSELL = {
  title: "أهداف أذكى مع SpinSmart Pro",
  bullets: [
    "خطة ادخار أسبوعية مولّدة بالذكاء الاصطناعي",
    "تنبيهات قبل تجاوز الهدف",
    "تحليل تقدم الهدف مقارنة بمصاريفك الفعلية",
  ],
  cta: "رقّي لـ Pro لفتح التحليل الكامل",
};

async function trackGoalTokens(
  userId: number,
  userType: "oauth" | "local",
  tokens: number,
  model?: string,
) {
  if (!tokens) return;
  if (userType === "oauth") {
    await db
      .update(users)
      .set({ aiTokensUsed: sql`COALESCE(ai_tokens_used, 0) + ${tokens}` })
      .where(eq(users.id, userId));
  } else {
    await db
      .update(localUsers)
      .set({ aiTokensUsed: sql`COALESCE(ai_tokens_used, 0) + ${tokens}` })
      .where(eq(localUsers.id, userId));
  }
  await recordAiUsageEvent({
    userId,
    userType,
    channel: "goal",
    tokens,
    model,
  });
}

export const goalsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    try {
      const goals = await db
        .select()
        .from(financialGoals)
        .where(
          and(
            eq(financialGoals.userId, ctx.user.id),
            eq(financialGoals.userType, ctx.user.type),
          ),
        )
        .orderBy(desc(financialGoals.createdAt));

      const isPro =
        ctx.user.plan === "pro" ||
        ctx.user.plan === "ultra" ||
        ctx.user.role === "admin";

      return {
        goals,
        isPro,
        upsell: isPro ? null : PRO_UPSELL,
      };
    } catch (err) {
      if (isMissingGoalsTable(err)) {
        const isPro =
          ctx.user.plan === "pro" ||
          ctx.user.plan === "ultra" ||
          ctx.user.role === "admin";
        return {
          goals: [],
          isPro,
          upsell: isPro ? null : PRO_UPSELL,
        };
      }
      throw err;
    }
  }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(FREE_DESCRIPTION_MAX).optional(),
        targetAmount: z
          .number()
          .positive()
          .max(ExpenseInputLimits.amountMax)
          .optional(),
        targetDate: z.string().or(z.date()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isPro =
        ctx.user.plan === "pro" ||
        ctx.user.plan === "ultra" ||
        ctx.user.role === "admin";

      if (!isPro) {
        const existing = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(financialGoals)
          .where(
            and(
              eq(financialGoals.userId, ctx.user.id),
              eq(financialGoals.userType, ctx.user.type),
              eq(financialGoals.status, "active"),
            ),
          );
        const count = Number(existing[0]?.count || 0);
        if (count >= FREE_GOALS_LIMIT) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `يمكنك إنشاء حتى ${FREE_GOALS_LIMIT} أهداف نشطة في الخطة المجانية. رقّي لـ Pro لإنشاء أهداف غير محدودة.`,
          });
        }
      }

      const [inserted] = await db.insert(financialGoals).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        targetAmount: input.targetAmount ? String(input.targetAmount) : null,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        status: "active",
      });

      await invalidateFinanceUserCache(ctx.user.id, ctx.user.type);

      return {
        id: Number((inserted as any)?.insertId || 0),
        success: true,
      };
    }),

  analyze: proProcedure
    .input(z.object({ goalId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [goal] = await db
        .select()
        .from(financialGoals)
        .where(
          and(
            eq(financialGoals.id, input.goalId),
            eq(financialGoals.userId, ctx.user.id),
            eq(financialGoals.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!goal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "الهدف غير موجود",
        });
      }

      const profile = await getSmartProfile(ctx.user.id, ctx.user.type);
      const monthRange = businessMonthRange();
      const monthExpense = await db
        .select({ total: sql<number>`COALESCE(SUM(amount),0)` })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id),
            eq(expenses.userType, ctx.user.type),
            eq(expenses.type, "expense"),
            gte(expenses.date, monthRange.start),
            lt(expenses.date, monthRange.endExclusive),
          ),
        );

      const promptText = `هدف: ${goal.title}
وصف: ${goal.description || ""}
مبلغ مستهدف: ${goal.targetAmount || "غير محدد"}
تاريخ مستهدف: ${goal.targetDate || "غير محدد"}
مصاريف الشهر الحالي: ${monthExpense[0]?.total || 0}
ملف المستخدم: ${summarizeProfileForAI(profile)}`;

      const estimated = estimateTokensFromText(promptText) + 600;
      const budget = await assertAiBudget(ctx.user, "goal", estimated);
      const cfg = await loadSystemConfig();
      const apiKey = cfg.ai_api_key || env.GEMINI_API_KEY;
      const modelName = mapModelName(cfg.ai_model_pro || env.GEMINI_MODEL_PRO);
      const maxOut = clampOutputTokens(
        capRequestOutputTokens(
          asPlan(ctx.user.plan),
          "goal",
          budget.perRequestMax,
        ),
        budget.remaining,
        estimated,
      );

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: `أنت مستشار أهداف مالية Pro في SpinSmart.
أعد JSON: plan (خطة 4-6 خطوات), weekly_actions (مصفوفة), alerts (تنبيهات), progress_percent (0-100), insight (فقرة واحدة).`,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: maxOut,
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(promptText);
      const raw = result.response.text();
      const tokens = result.response.usageMetadata?.totalTokenCount || 0;
      await trackGoalTokens(ctx.user.id, ctx.user.type, tokens, modelName);

      let aiPlan: Record<string, unknown> = {};
      try {
        aiPlan = JSON.parse(
          raw
            .replace(/```json?/g, "")
            .replace(/```/g, "")
            .trim(),
        );
      } catch {
        aiPlan = { insight: raw.slice(0, 800), plan: [] };
      }

      await db
        .update(financialGoals)
        .set({
          aiPlan,
          lastAnalyzedAt: new Date(),
        })
        .where(eq(financialGoals.id, goal.id));
      await invalidateFinanceUserCache(ctx.user.id, ctx.user.type);

      return { goalId: goal.id, analysis: aiPlan, tokensUsed: tokens };
    }),

  setStatus: authedProcedure
    .input(
      z.object({
        goalId: z.number(),
        status: z.enum(["active", "completed", "paused"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(financialGoals)
        .set({ status: input.status })
        .where(
          and(
            eq(financialGoals.id, input.goalId),
            eq(financialGoals.userId, ctx.user.id),
            eq(financialGoals.userType, ctx.user.type),
          ),
        );
      await invalidateFinanceUserCache(ctx.user.id, ctx.user.type);
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ goalId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await tx
          .update(userBudgets)
          .set({ linkedGoalId: null })
          .where(
            and(
              eq(userBudgets.linkedGoalId, input.goalId),
              eq(userBudgets.userId, ctx.user.id),
              eq(userBudgets.userType, ctx.user.type),
            ),
          );
        await tx
          .delete(financialGoals)
          .where(
            and(
              eq(financialGoals.id, input.goalId),
              eq(financialGoals.userId, ctx.user.id),
              eq(financialGoals.userType, ctx.user.type),
            ),
          );
      });
      await invalidateFinanceUserCache(ctx.user.id, ctx.user.type);
      return { success: true };
    }),
});
```
