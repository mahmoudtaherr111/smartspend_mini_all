import { z } from "zod";
import { router, proProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { expenses, userDictionaries, users, localUsers } from "../db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { env } from "./lib/env";
import {
  loadSystemConfig,
  assertAiBudget,
  clampOutputTokens,
  estimateTokensFromText,
  recordAiUsageEvent,
  asPlan,
} from "./lib/ai-usage-policy";
import { parseReceiptImage } from "./lib/receipt-image-parser";
import { normalizeTransactionTaxonomy } from "./lib/category-registry";
import { mapModelName } from "./lib/model-mapper";
import {
  getSmartProfile,
  summarizeProfileForAI,
} from "./services/user-profile-service";
import { invalidateUserMemory } from "./lib/muscle-memory";
import { businessMonthRange } from "./lib/app-time";

async function trackImageTokens(
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
    channel: "image",
    model,
    tokens,
  });
}

export const imageRouter = router({
  parseReceipt: proProcedure
    .input(
      z.object({
        imageBase64: z.string().min(100),
        mimeType: z.string().default("image/jpeg"),
        ocrTextHint: z.string().max(2000).optional(),
        saveExpense: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.imageBase64.length > 5_500_000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "حجم الصورة كبير جداً. استخدم ضغط الصورة من الكاميرا وحاول مرة أخرى.",
        });
      }

      const estimated = estimateTokensFromText(input.ocrTextHint || "") + 900;
      const budget = await assertAiBudget(ctx.user, "image", estimated);
      const cfg = await loadSystemConfig();
      const apiKey = cfg.ai_api_key || env.GEMINI_API_KEY;
      const apiKey2 = cfg.ai_api_key_2 || "";
      const modelName = mapModelName(
        cfg.ai_model_pro || env.GEMINI_MODEL_PRO || "gemini-3.1-pro",
      );
      const maxTokens = clampOutputTokens(
        budget.perRequestMax,
        budget.remaining,
        estimated,
      );

      const monthRange = businessMonthRange();
      const monthRows = await db
        .select({ amount: expenses.amount, type: expenses.type })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id),
            eq(expenses.userType, ctx.user.type),
            gte(expenses.date, monthRange.start),
            lt(expenses.date, monthRange.endExclusive),
          ),
        );
      const totalIncome = monthRows
        .filter((r) => r.type === "income")
        .reduce((s, r) => s + Number(r.amount), 0);
      const totalExpense = monthRows
        .filter((r) => r.type === "expense")
        .reduce((s, r) => s + Number(r.amount), 0);

      const userDict = await db
        .select()
        .from(userDictionaries)
        .where(
          and(
            eq(userDictionaries.userId, ctx.user.id),
            eq(userDictionaries.userType, ctx.user.type),
          ),
        )
        .then((rows) =>
          rows.map((r) => ({
            word: r.word,
            category: r.category,
            subCategory: r.subCategory ?? undefined,
          })),
        );

      const profile = await getSmartProfile(ctx.user.id, ctx.user.type);

      const parsed = await parseReceiptImage({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        apiKey,
        apiKey2,
        modelName,
        maxTokens,
        userId: ctx.user.id,
        userType: ctx.user.type,
        userPlan: asPlan(ctx.user.plan),
        userDict,
        monthlyContext: { totalIncome, totalExpense },
        profileSummary: summarizeProfileForAI(profile),
        ocrTextHint: input.ocrTextHint,
      });

      if (!parsed) {
        throw new TRPCError({
          code: "UNPROCESSABLE_CONTENT",
          message:
            "لم نتمكن من استخراج مبلغ أو فئة من الصورة. جرّب صورة أوضح أو أدخل العملية يدوياً.",
        });
      }

      await trackImageTokens(
        ctx.user.id,
        ctx.user.type,
        parsed.tokensUsed,
        modelName,
      );

      let expenseId: number | null = null;
      if (input.saveExpense) {
        // The receipt parser returns the model's raw `main_category` string
        // (receipt-image-parser.ts), so without this it is the one write path that
        // can put a category the registry does not know into expenses.category.
        const normalized = normalizeTransactionTaxonomy(
          {
            category: parsed.category,
            subCategory: parsed.subCategory,
            type: parsed.type,
            description: parsed.description,
          },
          `${parsed.ocrText || ""} ${parsed.description || ""}`,
        );
        const [createdExpense] = await db.insert(expenses).values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          type: normalized.type,
          amount: parsed.amount.toString(),
          category: normalized.category,
          subCategory: normalized.subCategory,
          description: parsed.description,
          rawText: parsed.ocrText || `[image] ${parsed.description}`,
          source: "image",
          date: new Date(),
          parsedMetadata: {
            parsedBy: parsed.parsedBy,
            merchant: parsed.merchant,
            confidence: parsed.confidence,
          },
        }).$returningId();
        expenseId = createdExpense.id;
        invalidateUserMemory(ctx.user.id, ctx.user.type);
      }

      return {
        amount: parsed.amount,
        description: parsed.description,
        category: parsed.category,
        subCategory: parsed.subCategory,
        type: parsed.type,
        confidence: parsed.confidence,
        merchant: parsed.merchant,
        tokensUsed: parsed.tokensUsed,
        parsedBy: parsed.parsedBy,
        expenseId,
        saved: input.saveExpense,
      };
    }),
});
