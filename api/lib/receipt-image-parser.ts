/**
 * Pro receipt / screenshot parsing — OCR heuristics first, Gemini vision fallback.
 */
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { mapModelName } from "./model-mapper";
import { normalizeText } from "./text-normalizer";
import { extractAmounts } from "./entity-extractor";
import { runSmartPipeline, type PipelineResult } from "./smart-pipeline";
import type { PlanId } from "./ai-usage-policy";

const receiptSchema = {
  type: SchemaType.OBJECT,
  properties: {
    amount: { type: SchemaType.NUMBER },
    description: { type: SchemaType.STRING },
    main_category: { type: SchemaType.STRING },
    sub_category: { type: SchemaType.STRING },
    merchant: { type: SchemaType.STRING, nullable: true },
    transaction_type: { type: SchemaType.STRING },
    confidence: { type: SchemaType.NUMBER },
    ocr_text: { type: SchemaType.STRING, nullable: true },
  },
  required: [
    "amount",
    "description",
    "main_category",
    "sub_category",
    "transaction_type",
    "confidence",
  ],
} as any;

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
}

const MAX_IMAGE_BASE64_CHARS = 4_500_000;

export function stripDataUri(base64: string): string {
  return base64.includes(",") ? base64.split(",")[1]! : base64;
}

/** Downscale payload by truncating oversized base64 (client should compress; this is a safety net). */
export function guardImagePayloadSize(base64: string): string {
  const pure = stripDataUri(base64);
  if (pure.length <= MAX_IMAGE_BASE64_CHARS) return pure;
  return pure.slice(0, MAX_IMAGE_BASE64_CHARS);
}

/** Regex OCR for Egyptian bank SMS / receipt screenshots */
export function extractFromImageText(
  raw: string,
): Partial<ReceiptParseResult> | null {
  const text = normalizeText(raw);
  const amounts = extractAmounts(text);
  if (!amounts.length) return null;

  const amount = amounts[0].amount;
  let type: "income" | "expense" = "expense";
  if (/تم إيداع|ايداع|استلمت|received|credit/i.test(text)) type = "income";
  if (/تم خصم|خصم|سحب|debit|paid/i.test(text)) type = "expense";

  let description = "عملية من صورة";
  const merchantMatch = text.match(
    /(?:من|at|@)\s*([A-Za-z\u0600-\u06FF0-9\s]{3,40})/,
  );
  if (merchantMatch) description = merchantMatch[1].trim().slice(0, 80);

  return {
    amount,
    description,
    type,
    confidence: 72,
    ocrText: text.slice(0, 500),
  };
}

export async function parseReceiptWithVision(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  modelName: string,
  maxTokens: number,
): Promise<{ parsed: ReceiptParseResult | null; tokensUsed: number }> {
  const pure = guardImagePayloadSize(imageBase64);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: mapModelName(modelName || "gemini-2.5-flash"),
    systemInstruction: `استخرج عملية مالية واحدة من صورة إيصال/سكرين شوت بنك أو فاتورة مصرية.
أعد JSON: amount, description, main_category, sub_category, merchant, transaction_type (expense|income), confidence, ocr_text.
استخدم الفئات العربية المعتادة في SpinSmart.`,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
      responseSchema: receiptSchema,
    },
  });

  const result = await model.generateContent([
    { text: "استخرج العملية المالية من الصورة:" },
    { inlineData: { mimeType: mimeType.split(";")[0], data: pure } },
  ]);

  const raw = result.response.text();
  const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
  let data: any;
  try {
    data = JSON.parse(
      raw
        .replace(/```json?/g, "")
        .replace(/```/g, "")
        .trim(),
    );
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { parsed: null, tokensUsed };
    data = JSON.parse(m[0]);
  }

  return {
    parsed: {
      amount: Number(data.amount) || 0,
      description: data.description || "من صورة",
      category: data.main_category || "متنوعات",
      subCategory: data.sub_category || "عام",
      type: data.transaction_type === "income" ? "income" : "expense",
      confidence: Number(data.confidence) || 75,
      merchant: data.merchant,
      ocrText: data.ocr_text,
      tokensUsed,
      parsedBy: "vision",
    },
    tokensUsed,
  };
}

export async function parseReceiptImage(input: {
  imageBase64: string;
  mimeType: string;
  apiKey: string;
  apiKey2: string;
  modelName: string;
  maxTokens: number;
  userId: number;
  userType: string;
  userPlan: PlanId;
  userDict: Array<{ word: string; category: string; subCategory?: string }>;
  monthlyContext: { totalIncome: number; totalExpense: number };
  profileSummary?: string;
  ocrTextHint?: string;
}): Promise<ReceiptParseResult | null> {
  let tokensUsed = 0;

  if (input.ocrTextHint && input.ocrTextHint.length >= 8) {
    const heuristic = extractFromImageText(input.ocrTextHint);
    if (heuristic?.amount && heuristic.amount > 0) {
      const pipeline = await runSmartPipeline({
        text: `${heuristic.description} ${heuristic.amount} جنيه`,
        userId: input.userId,
        userType: input.userType,
        userPlan: input.userPlan,
        userDict: input.userDict,
        apiKey: input.apiKey,
        apiKey2: input.apiKey2,
        modelName: input.modelName,
        maxTokens: Math.min(input.maxTokens, 1024),
        monthlyContext: input.monthlyContext,
        userProfileContext: { promptSummary: input.profileSummary },
        skipClarification: true,
      });
      const item = pipeline.items[0];
      if (item) {
        return {
          amount: item.amount || heuristic.amount,
          description: item.description || heuristic.description!,
          category: item.category,
          subCategory: item.subCategory,
          type: item.type as "income" | "expense",
          confidence: Math.max(item.confidence, heuristic.confidence || 70),
          ocrText: heuristic.ocrText,
          tokensUsed: pipeline.tokensUsed,
          parsedBy: pipeline.parsedBy,
          pipeline,
        };
      }
    }
  }

  const vision = await parseReceiptWithVision(
    input.imageBase64,
    input.mimeType,
    input.apiKey,
    input.modelName,
    input.maxTokens,
  );
  tokensUsed += vision.tokensUsed;
  if (!vision.parsed || vision.parsed.amount <= 0) return null;

  const textForPipeline =
    vision.parsed.ocrText ||
    `${vision.parsed.description} ${vision.parsed.amount} جنيه`;

  const pipeline = await runSmartPipeline({
    text: textForPipeline,
    userId: input.userId,
    userType: input.userType,
    userPlan: input.userPlan,
    userDict: input.userDict,
    apiKey: input.apiKey,
    apiKey2: input.apiKey2,
    modelName: input.modelName,
    maxTokens: Math.min(input.maxTokens, 1536),
    monthlyContext: input.monthlyContext,
    userProfileContext: { promptSummary: input.profileSummary },
    skipClarification: true,
  });

  tokensUsed += pipeline.tokensUsed;
  const item = pipeline.items[0] || {
    amount: vision.parsed.amount,
    category: vision.parsed.category,
    subCategory: vision.parsed.subCategory,
    description: vision.parsed.description,
    type: vision.parsed.type,
    confidence: vision.parsed.confidence,
  };

  return {
    amount: item.amount,
    description: item.description,
    category: item.category,
    subCategory: item.subCategory,
    type: item.type as "income" | "expense",
    confidence: Math.max(item.confidence, vision.parsed.confidence),
    merchant: vision.parsed.merchant,
    ocrText: vision.parsed.ocrText,
    tokensUsed,
    parsedBy: `image:${pipeline.parsedBy}`,
    pipeline,
  };
}
