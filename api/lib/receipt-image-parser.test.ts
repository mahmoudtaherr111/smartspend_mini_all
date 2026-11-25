import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContent, runSmartPipeline, executeLlmChain, trackAiTokens, recordGeminiCall, recordModelCalls, createLedgerEntry } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  runSmartPipeline: vi.fn(),
  executeLlmChain: vi.fn(),
  trackAiTokens: vi.fn(),
  recordGeminiCall: vi.fn(),
  recordModelCalls: vi.fn(),
  createLedgerEntry: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
  SchemaType: new Proxy({}, { get: (_target, name) => String(name) }),
}));
vi.mock("./smart-pipeline", () => ({ runSmartPipeline }));
vi.mock("./llm-router", async (importOriginal) => ({ ...await importOriginal<typeof import("./llm-router")>(), executeLlmChain }));
vi.mock("./ai-usage-policy", async (importOriginal) => ({
  ...await importOriginal<typeof import("./ai-usage-policy")>(),
  loadSystemConfig: vi.fn(async () => ({ recording_engine: "understanding", understanding_auto_save: "true" })),
  assertAiBudget: vi.fn(async () => ({ used: 0, limit: 50_000, remaining: 50_000, plan: "pro", perRequestMax: 1500 })),
  trackAiTokens,
}));
vi.mock("./ai-ledger", () => ({ recordGeminiCall, recordModelCalls }));
vi.mock("../services/ledger-writer", () => ({ createLedgerEntry }));
vi.mock("./understanding/context", () => ({
  loadReadingContext: async () => assembleContext({ today: "2026-11-23", weekday: "Monday" }),
}));
vi.mock("./understanding/routes", () => ({ resolveUnderstandingRoutes: async () => [classificationRoute] }));

import {
  MAX_IMAGE_BASE64_CHARS,
  extractFromImageText,
  guardImagePayloadSize,
  parseReceiptImage,
} from "./receipt-image-parser";
import { imageRouter } from "../image-router";
import { assertAiBudget } from "./ai-usage-policy";
import { LlmChainError } from "./llm-router";
import { assembleContext } from "./understanding/reading-context";

const classificationRoute = { slug: "classifier", protocol: "openai", baseUrl: "", apiKey: "key", model: "example-model", priority: 0 };
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]).toString("base64");
const user = { id: 1, type: "local", plan: "pro", role: "admin" } as const;

const mixedText = "دواء 120 جنيه\nقهوة 80 جنيه\nالإجمالي 200 جنيه";
function visionResponse(overrides: Record<string, unknown> = {}) {
  return {
    response: {
      text: () => JSON.stringify({
        amount: 200, amount_evidence: "الإجمالي 200 جنيه", currency: "EGP", ocr_text: mixedText,
        description: "مشتريات", merchant: "المحل", transaction_type: "expense", ...overrides,
      }),
      usageMetadata: { totalTokenCount: 300, promptTokenCount: 200, candidatesTokenCount: 100 },
    },
  };
}

function readingReply(events: unknown[], numbers: unknown[] = [{ text: "200", role: "total" }]) {
  const tokens = { promptTokens: 100, completionTokens: 50, cachedTokens: 0, totalTokens: 150 };
  return {
    ...tokens,
    text: JSON.stringify({ events, ignored: [], numbers, ask: "", ask_about: "none" }),
    route: classificationRoute, latencyMs: 5, degradedSchema: false, attemptTotals: tokens,
    attempts: [{ slug: classificationRoute.slug, model: classificationRoute.model, ok: true, latencyMs: 5, ...tokens }],
  };
}

const spending = (quote: string, amount: number, category: string, sub: string) => ({
  quote, amount, category, sub, kind: "spending", flow: "out", what: "", person: "",
  person_role: "none", person_relation: "", commitment: "", installments: 0, wallet: "", date: "", doubt: "none",
});

beforeEach(() => vi.clearAllMocks());

describe("receipt-image-parser", () => {
  it("extracts debit SMS amounts in Arabic", () => {
    const result = extractFromImageText("تم خصم مبلغ 350.50 جنيه من حسابك");
    expect(result?.amount).toBe(350.5);
    expect(result?.type).toBe("expense");
    expect(result?.confidence).toBeGreaterThanOrEqual(70);
  });

  it("refuses an image over the cap instead of cutting it short", () => {
    expect(guardImagePayloadSize("data:image/jpeg;base64,AAAA")).toBe("AAAA");
    expect(() => guardImagePayloadSize("A".repeat(MAX_IMAGE_BASE64_CHARS + 1))).toThrow(RangeError);
  });

  it("keeps the total the vision model read, and the category the pipeline gave", async () => {
    generateContent.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            amount: 450,
            description: "مشتريات سوبر ماركت",
            main_category: "أكل وشرب",
            sub_category: "بقالة",
            merchant: "كارفور",
            transaction_type: "expense",
            confidence: 90,
            ocr_text: "بيبسي 20\nشيبسي 15\nالاجمالي 450",
          }),
        usageMetadata: { totalTokenCount: 300 },
      },
    });
    // The pipeline reads the OCR text line by line: its first item is the first line, not the total.
    runSmartPipeline.mockResolvedValueOnce({
      items: [{ amount: 20, description: "بيبسي", category: "أكل وشرب", subCategory: "بقالة", type: "expense", confidence: 88 }],
      tokensUsed: 0,
      parsedBy: "rules",
    });

    const result = await parseReceiptImage({
      imageBase64: "AAAA",
      mimeType: "image/jpeg",
      apiKey: "test",
      apiKey2: "",
      modelName: "gemini-2.5-flash",
      maxTokens: 512,
      userId: 1,
      userType: "local",
      userPlan: "pro",
      userDict: [],
      monthlyContext: { totalIncome: 0, totalExpense: 0 },
    });

    expect(result?.amount).toBe(450);
    expect([result?.category, result?.subCategory]).toEqual(["أكل وشرب", "بقالة"]);
  });

  it("uses the structured reader on literal OCR and returns a mixed receipt for explicit review", async () => {
    generateContent.mockResolvedValueOnce(visionResponse());
    executeLlmChain.mockResolvedValueOnce(readingReply([
      spending("دواء 120 جنيه", 120, "health", "pharmacy"),
      spending("قهوة 80 جنيه", 80, "dining", "cafe"),
    ]));

    const receipt = await imageRouter.createCaller({ user }).parseReceipt({
      imageBase64: jpeg,
      ocrTextHint: "دفعت 999 جنيه من الحساب",
      saveExpense: true,
    });

    expect(receipt).toMatchObject({ amount: 200, category: "متنوعات", parsedBy: "image:understanding", tokensUsed: 450, saved: false, expenseId: null });
    expect(executeLlmChain.mock.calls[0]?.[1].userPrompt).toContain("دواء 120 جنيه قهوة 80 جنيه الإجمالي 200 جنيه");
    expect(executeLlmChain.mock.calls[0]?.[1].userPrompt).not.toContain("999");
    expect(runSmartPipeline).not.toHaveBeenCalled();
    expect(createLedgerEntry).not.toHaveBeenCalled();
    expect(trackAiTokens.mock.calls.map(([, tokens, channel]) => [tokens, channel])).toEqual([[450, "image"]]);
    expect(recordGeminiCall).toHaveBeenCalledOnce();
    expect(recordModelCalls).toHaveBeenCalledOnce();
  });

  it("never saves when a structured reading returns the first item alone or invents a total event", async () => {
    const first = spending("دواء 120 جنيه", 120, "health", "pharmacy");
    for (const events of [[first], [spending("دواء 120 جنيه", 200, "health", "pharmacy")]]) {
      generateContent.mockResolvedValueOnce(visionResponse());
      executeLlmChain.mockResolvedValueOnce(readingReply(events));
      const receipt = await imageRouter.createCaller({ user }).parseReceipt({ imageBase64: jpeg });
      expect(receipt).toMatchObject({ amount: 200, category: "متنوعات", saved: false, expenseId: null });
    }
    expect(createLedgerEntry).not.toHaveBeenCalled();
  });

  it("saves a verified single-filing receipt when the caller asks to save it", async () => {
    generateContent.mockResolvedValueOnce(visionResponse({
      ocr_text: "دواء 120 جنيه\nفيتامين 80 جنيه\nالإجمالي 200 جنيه",
    }));
    executeLlmChain.mockResolvedValueOnce(readingReply([
      spending("دواء 120 جنيه", 120, "health", "pharmacy"),
      spending("فيتامين 80 جنيه", 80, "health", "pharmacy"),
    ]));
    createLedgerEntry.mockResolvedValueOnce({ id: 7 });

    const receipt = await imageRouter.createCaller({ user }).parseReceipt({ imageBase64: jpeg });

    expect(receipt).toMatchObject({ amount: 200, category: "صحة", saved: true, expenseId: 7 });
    expect(createLedgerEntry).toHaveBeenCalledWith({ userId: 1, userType: "local" }, expect.objectContaining({ amount: 200, category: "صحة", source: "image" }));
  });

  it.each([
    { amount: 120, amount_evidence: "الإجمالي 200 جنيه" },
    { amount_evidence: "المبلغ المستحق 200 جنيه" },
    { currency: "USD" },
  ])("charges vision but refuses unverified or foreign totals before classification (%j)", async (overrides) => {
    generateContent.mockResolvedValueOnce(visionResponse(overrides));

    await expect(imageRouter.createCaller({ user }).parseReceipt({ imageBase64: jpeg })).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(trackAiTokens.mock.calls.map(([, tokens, channel]) => [tokens, channel])).toEqual([[300, "image"]]);
    expect(executeLlmChain).not.toHaveBeenCalled();
    expect(createLedgerEntry).not.toHaveBeenCalled();
  });

  it("reserves the second call from the image budget after the paid vision call", async () => {
    vi.mocked(assertAiBudget).mockResolvedValueOnce({ used: 49_000, limit: 50_000, remaining: 1000, plan: "pro", perRequestMax: 1500 });
    generateContent.mockResolvedValueOnce(visionResponse());

    await expect(imageRouter.createCaller({ user }).parseReceipt({ imageBase64: jpeg })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(trackAiTokens.mock.calls.map(([, tokens, channel]) => [tokens, channel])).toEqual([[300, "image"]]);
    expect(executeLlmChain).not.toHaveBeenCalled();
    expect(createLedgerEntry).not.toHaveBeenCalled();
  });

  it("charges paid reader failures to image usage and saves nothing", async () => {
    generateContent.mockResolvedValueOnce(visionResponse());
    executeLlmChain.mockRejectedValueOnce(new LlmChainError("unavailable", [{
      slug: classificationRoute.slug, model: classificationRoute.model, ok: false, latencyMs: 8, promptTokens: 90, totalTokens: 90,
    }]));

    await expect(imageRouter.createCaller({ user }).parseReceipt({ imageBase64: jpeg })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(trackAiTokens.mock.calls.map(([, tokens, channel]) => [tokens, channel])).toEqual([[390, "image"]]);
    expect(recordModelCalls).toHaveBeenCalledOnce();
    expect(createLedgerEntry).not.toHaveBeenCalled();
  });
});
