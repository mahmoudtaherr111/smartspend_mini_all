import { z } from "zod";
import { router, proProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { users, localUsers } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { env } from "./lib/env";
import {
  loadSystemConfig,
  assertAiBudget,
  clampOutputTokens,
  recordAiUsageEvent,
} from "./lib/ai-usage-policy";
import {
  guardImagePayloadSize,
  parseReceiptImage,
} from "./lib/receipt-image-parser";
import { recordImageProviderUsage } from "./services/image-usage-ledger";
import {
  createCapture,
  captureHash,
  findCaptureForRequest,
} from "./services/financial-capture-store";
import { mapModelName } from "./lib/model-mapper";
import { localUsage } from "./lib/provider-usage";

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
        imageBase64: z.string().min(100).max(4_600_000),
        mimeType: z
          .enum(["image/jpeg", "image/png", "image/webp"])
          .default("image/jpeg"),
        ocrTextHint: z.string().max(2000).optional(),
        saveExpense: z.boolean().default(false), // Legacy input retained; extraction always creates a review draft.
        clientRequestId: z.string().uuid().optional(),
        businessId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        guardImagePayloadSize(input.imageBase64);
      } catch {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "الصورة كبيرة؛ أعد ضغطها أو تصويرها بحجم أصغر.",
        });
      }
      const fingerprint = captureHash([
        input.imageBase64,
        input.businessId || null,
      ]);
      const requestKey = input.clientRequestId || fingerprint;
      const existing = await findCaptureForRequest(
        ctx.user,
        requestKey,
        fingerprint,
      );
      if (existing) {
        await recordImageProviderUsage({
          userId: ctx.user.id,
          userType: ctx.user.type,
          model: "result_cache",
          usage: localUsage(),
          finishReason: "local",
          latencyMs: 0,
          cacheHit: true,
        });
        const first = existing.draft.events[0];
        return {
          amount: first?.amount || 0,
          description: first?.description || "",
          category: first?.category || "",
          subCategory: first?.subCategory || "",
          type: first?.kind === "income" ? "income" : "expense",
          confidence: 0,
          merchant: first?.merchant || undefined,
          tokensUsed: 0,
          parsedBy: "capture:replay",
          expenseId: existing.receipt?.events[0]?.expenseId || null,
          saved: existing.state === "saved",
          captureId: existing.id,
          version: existing.version,
          decision: "review" as const,
        };
      }
      const estimated = 900; // Budget estimate; provider usage is measured separately.
      const budget = await assertAiBudget(ctx.user, "image", estimated);
      const cfg = await loadSystemConfig();
      const apiKey = cfg.ai_api_key || env.GEMINI_API_KEY;
      const apiKey2 = cfg.ai_api_key_2 || "";
      const modelName = mapModelName(
        cfg.ai_model_pro || env.GEMINI_MODEL_PRO || "pro",
      );
      const maxTokens = clampOutputTokens(
        budget.perRequestMax,
        budget.remaining,
        estimated,
      );

      const parsed = await parseReceiptImage({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        apiKey,
        apiKey2,
        modelName,
        maxTokens,
        onUsage: async (usage, finishReason, latencyMs) => {
          await recordImageProviderUsage({
            userId: ctx.user.id,
            userType: ctx.user.type,
            model: modelName,
            usage,
            finishReason,
            latencyMs,
          });
          await trackImageTokens(
            ctx.user.id,
            ctx.user.type,
            usage.totalTokens || 0,
            modelName,
          );
        },
        userId: ctx.user.id,
        userType: ctx.user.type,
        ocrTextHint: input.ocrTextHint,
      });

      if (!parsed) {
        throw new TRPCError({
          code: "UNPROCESSABLE_CONTENT",
          message:
            "لم نتمكن من استخراج مبلغ أو فئة من الصورة. جرّب صورة أوضح أو أدخل العملية يدوياً.",
        });
      }

      if (!parsed.draft)
        throw new TRPCError({
          code: "UNPROCESSABLE_CONTENT",
          message: "الصورة لم تنتج مسودة قابلة للمراجعة.",
        });
      parsed.draft.businessId = input.businessId || null;
      const capture = await createCapture(
        ctx.user,
        requestKey,
        parsed.draft,
        fingerprint,
      );
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
        expenseId: null,
        saved: false,
        captureId: capture.id,
        version: capture.version,
        decision: "review" as const,
      };
    }),
});
