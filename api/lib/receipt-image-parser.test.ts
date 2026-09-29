import { describe, expect, it, vi } from "vitest";

const { generateContent, runSmartPipeline } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  runSmartPipeline: vi.fn(),
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

import {
  MAX_IMAGE_BASE64_CHARS,
  extractFromImageText,
  guardImagePayloadSize,
  parseReceiptImage,
} from "./receipt-image-parser";

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
});
