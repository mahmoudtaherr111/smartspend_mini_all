import { z } from "zod";
import { router, receiptsProcedure } from "./middleware";
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
import { verifyImageMagicBytes } from "./lib/image-magic-bytes";
import { normalizeTransactionTaxonomy } from "./lib/category-registry";
import { mapModelName } from "./lib/model-mapper";
import { recordGeminiCall, recordModelCalls } from "./lib/ai-ledger";
import {
  getSmartProfile,
  summarizeProfileForAI,
} from "./services/user-profile-service";
import { invalidateUserMemory } from "./lib/muscle-memory";
import { businessMonthRange } from "./lib/app-time";
import { bumpFinanceCacheGen } from "./services/finance-semantic-layer";

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
  parseReceipt: receiptsProcedure
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

      // Security Boundary (R8): Binary signature (magic bytes) verification
      const rawBase64 = input.imageBase64.includes(",")
        ? input.imageBase64.split(",")[1]!
        : input.imageBase64;
      const imageBuffer = Buffer.from(rawBase64, "base64");
      const magicResult = verifyImageMagicBytes(imageBuffer);
      if (!magicResult.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Invalid image format: binary signature verification failed. Only JPEG, PNG, and WebP are permitted.",
        });
      }

      const estimated = estimateTokensFromText(input.ocrTextHint || "") + 900;
      const budget = await assertAiBudget(ctx.user, "image", estimated);
      const cfg = await loadSystemConfig();
      const apiKey = cfg.ai_api_key || env.GEMINI_API_KEY;
      const apiKey2 = cfg.ai_api_key_2 || "";
      const modelName = mapModelName(
        cfg.ai_model_pro || env.GEMINI_MODEL_PRO || "gemini-3.8-flash",
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
        mimeType: magicResult.mime || input.mimeType,
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
      // What the receipt cost: the vision call, and the classification calls that read its text.
      recordGeminiCall(ctx.user, "image", modelName, parsed.visionUsage);
      recordModelCalls(ctx.user, "image", parsed.pipeline?.log.providerRoute?.attempts, { model: null, tokens: 0 });

      // The receipt parser returns the model's raw `main_category` string
      // (receipt-image-parser.ts); it is resolved against the registry before it is saved
      // or shown for review.
      const normalized = normalizeTransactionTaxonomy(
          {
            category: parsed.category,
            subCategory: parsed.subCategory,
            type: parsed.type,
            description: parsed.description,
          },
          `${parsed.ocrText || ""} ${parsed.description || ""}`,
        );

      let expenseId: number | null = null;
      if (input.saveExpense) {
        const {
          applyExpenseRollupDelta,
          expenseToRollupDelta,
        } = await import("./services/expense-rollups");

        await db.transaction(async (tx) => {
          const [createdExpense] = await tx.insert(expenses).values({
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

          const delta = expenseToRollupDelta(
            {
              userId: ctx.user.id,
              userType: ctx.user.type,
              date: new Date(),
              type: normalized.type,
              amount: parsed.amount,
              source: "image",
            },
            1,
          );
          await applyExpenseRollupDelta(tx, delta);
        });

        invalidateUserMemory(ctx.user.id, ctx.user.type);
        await bumpFinanceCacheGen(ctx.user.id, ctx.user.type);
      }

      return {
        amount: parsed.amount,
        description: parsed.description,
        category: normalized.category,
        subCategory: normalized.subCategory,
        type: normalized.type,
        ocrText: parsed.ocrText ?? null,
        confidence: parsed.confidence,
        merchant: parsed.merchant,
        tokensUsed: parsed.tokensUsed,
        parsedBy: parsed.parsedBy,
        expenseId,
        saved: input.saveExpense,
      };
    }),
});
