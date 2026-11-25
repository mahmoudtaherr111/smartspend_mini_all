import { z } from "zod";
import { router, receiptsProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { expenses, userDictionaries } from "../db/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { env } from "./lib/env";
import {
  loadSystemConfig,
  assertAiBudget,
  clampOutputTokens,
  estimateTokensFromText,
  trackAiTokens,
  asPlan,
  type AiBudget,
  type AiUsageUser,
} from "./lib/ai-usage-policy";
import {
  MAX_IMAGE_BASE64_CHARS,
  parseReceiptImage,
  parseReceiptWithVision,
  reconcileReceiptReading,
  stripDataUri,
  validatedReceiptEvidence,
} from "./lib/receipt-image-parser";
import { verifyImageMagicBytes } from "./lib/image-magic-bytes";
import { normalizeTransactionTaxonomy } from "./lib/category-registry";
import { mapModelName } from "./lib/model-mapper";
import { recordGeminiCall, recordModelCalls } from "./lib/ai-ledger";
import {
  getSmartProfile,
  summarizeProfileForAI,
} from "./services/user-profile-service";
import { businessMonthRange } from "./lib/app-time";
import { recordingEngineOf } from "./services/recording/engine-switch";
import { budgetReading } from "./services/recording/read-sentence";
import { loadReadingContext } from "./lib/understanding/context";
import { understand, UnderstandingUnavailableError } from "./lib/understanding/engine";
import { resolveUnderstandingRoutes } from "./lib/understanding/routes";

type ReceiptImage = Pick<Parameters<typeof parseReceiptImage>[0], "imageBase64" | "mimeType" | "apiKey" | "modelName" | "maxTokens">;

async function readReceiptWithUnderstanding(
  user: AiUsageUser,
  image: ReceiptImage,
  settings: Record<string, string>,
  budget: AiBudget,
) {
  const vision = await parseReceiptWithVision(
    image.imageBase64, image.mimeType, image.apiKey, image.modelName, image.maxTokens, { readEvidence: true },
  );
  recordGeminiCall(user, "image", image.modelName, vision.visionUsage);
  let tokensUsed = vision.tokensUsed;
  try {
    const evidence = validatedReceiptEvidence(vision);
    if (!evidence) return null;

    const [context, resolvedRoutes] = await Promise.all([
      loadReadingContext(user),
      resolveUnderstandingRoutes(asPlan(user.plan), settings),
    ]);
    const remaining = budget.remaining === Number.MAX_SAFE_INTEGER
      ? budget.remaining
      : Math.max(0, budget.remaining - vision.tokensUsed);
    const { routes, maxOutputTokens } = budgetReading(evidence.text, context, settings, resolvedRoutes, { ...budget, remaining });
    const reading = await understand({ text: evidence.text, context, settings, routes, maxOutputTokens }).catch((err: unknown) => {
      if (err instanceof UnderstandingUnavailableError) {
        const last = err.attempts.at(-1);
        tokensUsed += err.tokens.totalTokens;
        recordModelCalls(user, "image", err.attempts, { model: last?.model, tokens: err.tokens.totalTokens, providerSlug: last?.slug });
      }
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "مش قادرين نقرا الإيصال دلوقتي. جرّب كمان شوية.", cause: err });
    });
    const { usage } = reading;
    tokensUsed += usage.totalTokens;
    recordModelCalls(user, "image", usage.attempts, { model: usage.model, tokens: usage.totalTokens, providerSlug: usage.servedBy ?? undefined });
    return reconcileReceiptReading(evidence.receipt, reading);
  } finally {
    // Keep one image usage event per receipt for the burst guard, with separate costs per provider call.
    if (tokensUsed > 0) await trackAiTokens(user, tokensUsed, "image", image.modelName);
  }
}

async function readReceiptWithRules(
  user: AiUsageUser,
  image: ReceiptImage,
  settings: Record<string, string>,
  ocrTextHint?: string,
) {
  const monthRange = businessMonthRange();
  const [monthRows, dictionary, profile] = await Promise.all([
    db
      .select({ amount: expenses.amount, type: expenses.type })
      .from(expenses)
      .where(and(
        eq(expenses.userId, user.id),
        eq(expenses.userType, user.type),
        gte(expenses.date, monthRange.start),
        lt(expenses.date, monthRange.endExclusive),
      )),
    db
      .select()
      .from(userDictionaries)
      .where(and(eq(userDictionaries.userId, user.id), eq(userDictionaries.userType, user.type))),
    getSmartProfile(user.id, user.type),
  ]);
  const totalIncome = monthRows.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const totalExpense = monthRows.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const parsed = await parseReceiptImage({
    ...image,
    apiKey2: settings.ai_api_key_2 || "",
    userId: user.id,
    userType: user.type,
    userPlan: asPlan(user.plan),
    userDict: dictionary.map(({ word, category, subCategory }) => ({ word, category, subCategory: subCategory ?? undefined })),
    monthlyContext: { totalIncome, totalExpense },
    profileSummary: summarizeProfileForAI(profile),
    ocrTextHint,
  });
  if (!parsed) return null;

  await trackAiTokens(user, parsed.tokensUsed, "image", image.modelName);
  recordGeminiCall(user, "image", image.modelName, parsed.visionUsage);
  recordModelCalls(user, "image", parsed.pipeline?.log.providerRoute?.attempts, { model: null, tokens: 0 });
  const normalized = normalizeTransactionTaxonomy(parsed, `${parsed.ocrText || ""} ${parsed.description || ""}`);
  return { ...parsed, category: normalized.category, subCategory: normalized.subCategory, type: normalized.type };
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
      // The same cap the parser reads up to, so an image is refused here rather than cut short there.
      if (stripDataUri(input.imageBase64).length > MAX_IMAGE_BASE64_CHARS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "الصورة كبيرة أوي. صوّرها تاني بجودة أقل وجرّب.",
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

      const cfg = await loadSystemConfig();
      const understanding = recordingEngineOf(cfg) === "understanding";
      const estimated = 900 + (understanding ? 0 : estimateTokensFromText(input.ocrTextHint || ""));
      const budget = await assertAiBudget(ctx.user, "image", estimated, cfg);
      const apiKey = cfg.ai_api_key || env.GEMINI_API_KEY;
      const modelName = mapModelName(
        cfg.ai_model_pro || env.GEMINI_MODEL_PRO || "gemini-3.8-flash",
      );
      const maxTokens = clampOutputTokens(
        budget.perRequestMax,
        budget.remaining,
        estimated,
      );

      const image = {
        imageBase64: input.imageBase64,
        mimeType: magicResult.mime || input.mimeType,
        apiKey,
        modelName,
        maxTokens,
      };
      const parsed = understanding
        ? await readReceiptWithUnderstanding(ctx.user, image, cfg, budget)
        : await readReceiptWithRules(ctx.user, image, cfg, input.ocrTextHint);

      if (!parsed) {
        throw new TRPCError({
          code: "UNPROCESSABLE_CONTENT",
          message:
            "لم نتمكن من استخراج مبلغ أو فئة من الصورة. جرّب صورة أوضح أو أدخل العملية يدوياً.",
        });
      }

      let expenseId: number | null = null;
      if (input.saveExpense && !parsed.requiresReview) {
        const { createLedgerEntry } = await import("./services/ledger-writer");
        const created = await createLedgerEntry(
          { userId: ctx.user.id, userType: ctx.user.type },
          {
            type: parsed.type,
            amount: parsed.amount,
            purpose: parsed.purpose,
            category: parsed.category,
            subCategory: parsed.subCategory,
            description: parsed.description,
            rawText: parsed.ocrText || `[image] ${parsed.description}`,
            source: "image",
            date: new Date(),
            parsedMetadata: {
              parsedBy: parsed.parsedBy,
              merchant: parsed.merchant,
              confidence: parsed.confidence,
            },
          },
        );
        expenseId = created.id ?? null;
      }

      return {
        amount: parsed.amount,
        purpose: parsed.purpose,
        description: parsed.description,
        category: parsed.category,
        subCategory: parsed.subCategory,
        type: parsed.type,
        ocrText: parsed.ocrText ?? null,
        confidence: parsed.confidence,
        merchant: parsed.merchant,
        tokensUsed: parsed.tokensUsed,
        parsedBy: parsed.parsedBy,
        expenseId,
        saved: expenseId !== null,
      };
    }),
});
