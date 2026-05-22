import { z } from "zod";
import { router, authedProcedure, proProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { financialGoals, expenses, users, localUsers } from "../db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
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
import { getSmartProfile, summarizeProfileForAI } from "./services/user-profile-service";

const FREE_DESCRIPTION_MAX = 120;
const FREE_GOALS_LIMIT = 3;

function isMissingGoalsTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("financial_goals") &&
    (msg.includes("doesn't exist") || msg.includes("ER_NO_SUCH_TABLE") || msg.includes("Failed query"))
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

async function trackGoalTokens(userId: number, userType: "oauth" | "local", tokens: number, model?: string) {
  if (!tokens) return;
  if (userType === "oauth") {
    await db.update(users).set({ aiTokensUsed: sql`ai_tokens_used + ${tokens}` }).where(eq(users.id, userId));
  } else {
    await db.update(localUsers).set({ aiTokensUsed: sql`ai_tokens_used + ${tokens}` }).where(eq(localUsers.id, userId));
  }
  await recordAiUsageEvent({ userId, userType, channel: "goal", model, tokens });
}

export const goalsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const isPro = ctx.user.plan === "pro" || ctx.user.plan === "ultra" || ctx.user.role === "admin";
    try {
      const rows = await db
        .select()
        .from(financialGoals)
        .where(and(eq(financialGoals.userId, ctx.user.id), eq(financialGoals.userType, ctx.user.type)))
        .orderBy(desc(financialGoals.createdAt))
        .limit(20);
      return { goals: rows, isPro, proUpsell: isPro ? null : PRO_UPSELL, dbReady: true as const };
    } catch (err) {
      if (isMissingGoalsTable(err)) {
        return { goals: [], isPro, proUpsell: isPro ? null : PRO_UPSELL, dbReady: false as const };
      }
      throw err;
    }
  }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().min(2).max(200),
        description: z.string().max(2000).optional(),
        targetAmount: z.number().positive().optional(),
        targetDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isPro = ctx.user.plan === "pro" || ctx.user.plan === "ultra" || ctx.user.role === "admin";

      const existing = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(financialGoals)
        .where(
          and(
            eq(financialGoals.userId, ctx.user.id),
            eq(financialGoals.userType, ctx.user.type),
            eq(financialGoals.status, "active")
          )
        );
      const count = Number(existing[0]?.count || 0);
      if (!isPro && count >= FREE_GOALS_LIMIT) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `الخطة المجانية تدعم ${FREE_GOALS_LIMIT} أهداف نشطة. رقّي لـ Pro لأهداف غير محدودة مع تحليل ذكي.`,
        });
      }

      let description = input.description?.trim() || "";
      if (!isPro && description.length > FREE_DESCRIPTION_MAX) {
        description = description.slice(0, FREE_DESCRIPTION_MAX);
      }

      await db.insert(financialGoals).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        title: input.title.trim(),
        description: description || null,
        targetAmount: input.targetAmount?.toString(),
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        status: "active",
      });

      return {
        success: true,
        proUpsell: isPro ? null : PRO_UPSELL,
        descriptionTruncated: !isPro && (input.description?.length || 0) > FREE_DESCRIPTION_MAX,
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
            eq(financialGoals.userType, ctx.user.type)
          )
        )
        .limit(1);

      if (!goal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الهدف غير موجود" });
      }

      const profile = await getSmartProfile(ctx.user.id, ctx.user.type);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const monthExpense = await db
        .select({ total: sql<number>`COALESCE(SUM(amount),0)` })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id),
            eq(expenses.userType, ctx.user.type),
            eq(expenses.type, "expense"),
            gte(expenses.date, startOfMonth)
          )
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
        capRequestOutputTokens(asPlan(ctx.user.plan), "goal", budget.perRequestMax),
        budget.remaining,
        estimated
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
        aiPlan = JSON.parse(raw.replace(/```json?/g, "").replace(/```/g, "").trim());
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

      return { goalId: goal.id, analysis: aiPlan, tokensUsed: tokens };
    }),

  setStatus: authedProcedure
    .input(z.object({ goalId: z.number(), status: z.enum(["active", "completed", "paused"]) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(financialGoals)
        .set({ status: input.status })
        .where(
          and(
            eq(financialGoals.id, input.goalId),
            eq(financialGoals.userId, ctx.user.id),
            eq(financialGoals.userType, ctx.user.type)
          )
        );
      return { success: true };
    }),
});
