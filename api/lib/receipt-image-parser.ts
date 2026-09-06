/**
 * Receipt / screenshot evidence extraction with a mapped vision model and local validation.
 */
import { GoogleGenerativeAI, type Schema } from "@google/generative-ai";
import { mapModelName } from "./model-mapper";
import type { PipelineResult } from "./smart-pipeline";
import { z } from "zod";
import {
  receiptEvidenceSchema,
  receiptEvidenceToDraft,
  RECEIPT_EXTRACTION_PROMPT,
} from "./receipt-evidence";
import type { CaptureDraft } from "../../contracts/financial-capture";
import { normalizeProviderUsage, type ProviderUsage } from "./provider-usage";
import type { PlanId } from "./ai-usage-policy";

export interface ReceiptParseResult {
  amount: number;
  description: string;
  category: string;
  subCategory: string;
  type: "income" | "expense";
  confidence: number;
  merchant?: string;
  ocrText?: string;
  tokensUsed: number;
  parsedBy: string;
  pipeline?: PipelineResult;
  draft?: CaptureDraft;
}

const MAX_IMAGE_BASE64_CHARS = 4_500_000;

/** Gemini's SDK schema dialect uses nullable rather than JSON Schema anyOf. Zod remains the authority. */
export function toVisionSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toVisionSchema);
  if (!value || typeof value !== "object") return value;
  const node = value as Record<string, unknown>;
  if (Array.isArray(node.anyOf)) {
    const nonNull = node.anyOf.filter(
      (v: { type?: string }) => v.type !== "null",
    );
    if (nonNull.length === 1 && nonNull.length < node.anyOf.length)
      return { ...(toVisionSchema(nonNull[0]) as object), nullable: true };
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(node)) {
    if (
      [
        "$schema",
        "additionalProperties",
        "maximum",
        "minimum",
        "maxItems",
        "minItems",
        "maxLength",
        "minLength",
        "pattern",
        "format",
      ].includes(key)
    )
      continue;
    out[key] = toVisionSchema(item);
  }
  return out;
}

export function stripDataUri(base64: string): string {
  return base64.includes(",") ? base64.split(",")[1]! : base64;
}

/** Never truncate encoded pixels; an oversized input must be recompressed by the client. */
export function guardImagePayloadSize(base64: string): string {
  const pure = stripDataUri(base64);
  if (pure.length <= MAX_IMAGE_BASE64_CHARS) return pure;
  throw new Error("الصورة كبيرة؛ أعد ضغطها أو تصويرها بحجم أصغر.");
}

export async function parseReceiptWithVision(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  modelName: string,
  maxTokens: number,
  onUsage?: (
    usage: ProviderUsage,
    finishReason: string,
    latencyMs: number,
  ) => Promise<void>,
): Promise<{ parsed: ReceiptParseResult | null; tokensUsed: number }> {
  const pure = guardImagePayloadSize(imageBase64);
  if (
    !/^(?:image\/jpeg|image\/png|image\/webp)$/.test(mimeType) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(pure)
  )
    throw new Error("صيغة الصورة غير صالحة.");
  const responseSchema = toVisionSchema(z.toJSONSchema(receiptEvidenceSchema));
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: mapModelName(modelName || "flash"),
    systemInstruction: RECEIPT_EXTRACTION_PROMPT,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
      responseSchema: responseSchema as unknown as Schema,
    },
  });
  const start = Date.now();
  let result;
  try {
    result = await model.generateContent(
      [
        {
          text: "Extract the visible financial evidence. Unknown fields are null.",
        },
        { inlineData: { mimeType, data: pure } },
      ],
      { timeout: 25000 },
    );
  } catch (error) {
    await onUsage?.(
      normalizeProviderUsage({}, "gemini"),
      "provider_error",
      Date.now() - start,
    );
    throw error;
  }
  const usage = normalizeProviderUsage(
    result.response.usageMetadata || {},
    "gemini",
  );
  const tokensUsed = usage.totalTokens || 0;
  const finishReason =
    result.response.candidates?.[0]?.finishReason || "unknown";
  // Every rejection is still a paid attempt; an HTTP success is not a valid extraction.
  const rejected = async (reason: string) => {
    await onUsage?.(usage, reason, Date.now() - start);
    return { parsed: null, tokensUsed };
  };
  if (finishReason !== "STOP") return rejected(finishReason);
  let decoded: unknown;
  try {
    decoded = JSON.parse(result.response.text());
  } catch {
    return rejected("invalid_json");
  }
  const evidence = receiptEvidenceSchema.safeParse(decoded);
  if (!evidence.success) return rejected("invalid_schema");
  let draft: CaptureDraft;
  try {
    draft = receiptEvidenceToDraft(evidence.data);
  } catch {
    return rejected("invalid_evidence");
  }
  const first = draft.events[0];
  if (!first) return rejected("no_document");
  await onUsage?.(usage, finishReason, Date.now() - start);
  return {
    parsed: {
      amount: first.amount || 0,
      description: first.description,
      category: first.category || "",
      subCategory: first.subCategory || "",
      type: first.kind === "income" ? "income" : "expense",
      confidence: 0,
      merchant: first.merchant || undefined,
      ocrText: draft.sourceText,
      tokensUsed,
      parsedBy: "image:evidence-v1",
      draft,
    },
    tokensUsed,
  };
}

export async function parseReceiptImage(input: {
  onUsage?: (
    usage: ProviderUsage,
    finishReason: string,
    latencyMs: number,
  ) => Promise<void>;
  imageBase64: string;
  mimeType: string;
  apiKey: string;
  apiKey2: string;
  modelName: string;
  maxTokens: number;
  userId: number;
  userType: string;
  userPlan?: PlanId;
  userDict?: Array<{ word: string; category: string; subCategory?: string }>;
  monthlyContext?: { totalIncome: number; totalExpense: number };
  profileSummary?: string;
  ocrTextHint?: string;
}): Promise<ReceiptParseResult | null> {
  // Browser OCR hints are not verified pixels. Never use them to bypass image evidence checks.
  return (
    await parseReceiptWithVision(
      input.imageBase64,
      input.mimeType,
      input.apiKey,
      input.modelName,
      input.maxTokens,
      input.onUsage,
    )
  ).parsed;
}
