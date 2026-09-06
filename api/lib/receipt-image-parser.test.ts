import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  guardImagePayloadSize,
  parseReceiptImage,
  parseReceiptWithVision,
} from "./receipt-image-parser";
import { mapModelName } from "./model-mapper";
const sdk = vi.hoisted(() => ({ generate: vi.fn(), model: vi.fn() }));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(options: unknown) {
      sdk.model(options);
      return { generateContent: sdk.generate };
    }
  },
}));
const doc = () => ({
  documentKind: "receipt",
  description: "اشتراك",
  merchant: "NETFLIX",
  amount: 100,
  currency: "EGP",
  occurredAt: "2026-09-06T10:00:00Z",
  status: "realized",
  kind: "expense",
  evidence: "Paid EGP 100 at NETFLIX",
  subtotal: null,
  tax: null,
  discount: null,
  shipping: null,
  itemsComplete: false,
  items: [],
});
const evidence = () => ({
  readability: "readable",
  sourceText: "Paid EGP 100",
  documents: [doc()],
});
const respond = (body: unknown, reason = "STOP") =>
  sdk.generate.mockResolvedValue({
    response: {
      text: () => (typeof body === "string" ? body : JSON.stringify(body)),
      candidates: [{ finishReason: reason }],
      usageMetadata: {
        promptTokenCount: 800,
        candidatesTokenCount: 200,
        cachedContentTokenCount: 400,
        totalTokenCount: 1000,
      },
    },
  });
const parse = (meter = vi.fn()) =>
  parseReceiptWithVision("QQ==", "image/png", "test", "pro", 2000, meter);
beforeEach(() => {
  vi.clearAllMocks();
  respond(evidence());
});
describe("actual vision evidence boundary", () => {
  it("uses model mapping, structured output, fixed instructions and bounded request timeout", async () => {
    const result = await parse();
    expect(result.parsed?.draft?.events[0]).toMatchObject({
      amount: 100,
      category: "اشتراكات",
      billingContext: "unspecified",
    });
    expect(sdk.model).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mapModelName("pro"),
        generationConfig: expect.objectContaining({
          responseMimeType: "application/json",
          responseSchema: expect.any(Object),
        }),
      }),
    );
    expect(sdk.generate).toHaveBeenCalledWith(expect.any(Array), {
      timeout: 25000,
    });
  });
  it("retains multiple documents and never adds their product rows as extra payments", async () => {
    const data = evidence();
    data.documents.push({ ...doc(), amount: 200 });
    respond(data);
    expect((await parse()).parsed?.draft?.events.map((e) => e.amount)).toEqual([
      100, 200,
    ]);
  });
  it.each(["MAX_TOKENS", "SAFETY", "unknown"])(
    "rejects incomplete output even if its JSON parses (%s)",
    async (reason) => {
      respond(evidence(), reason);
      const meter = vi.fn();
      expect((await parse(meter)).parsed).toBeNull();
      expect(meter).toHaveBeenCalledWith(
        expect.objectContaining({
          promptTokens: 800,
          completionTokens: 200,
          cachedTokens: 400,
          totalTokens: 1000,
        }),
        reason,
        expect.any(Number),
      );
    },
  );
  it.each([
    "invalid JSON",
    { ...evidence(), documents: [{ ...doc(), amount: -100 }] },
  ])("records paid usage before rejecting malformed results", async (bad) => {
    respond(bad);
    const meter = vi.fn();
    expect((await parse(meter)).parsed).toBeNull();
    expect(meter).toHaveBeenCalledOnce();
    expect(meter.mock.calls[0][1]).toBe(
      typeof bad === "string" ? "invalid_json" : "invalid_schema",
    );
  });
  it("does not let browser OCR hints bypass pixel evidence", async () => {
    const result = await parseReceiptImage({
      imageBase64: "QQ==",
      mimeType: "image/png",
      apiKey: "test",
      apiKey2: "",
      modelName: "pro",
      maxTokens: 2000,
      userId: 1,
      userType: "local",
      ocrTextHint: "Paid EGP 99999",
    });
    expect(result?.amount).toBe(100);
    expect(sdk.generate).toHaveBeenCalledOnce();
    expect(JSON.stringify(sdk.generate.mock.calls)).not.toContain("99999");
  });
  it("does not truncate oversized encoded pixels or call the provider", async () => {
    expect(() => guardImagePayloadSize("A".repeat(4_500_001))).toThrow();
    expect(sdk.generate).not.toHaveBeenCalled();
    await expect(
      parseReceiptWithVision("QQ==", "text/plain", "test", "pro", 2000),
    ).rejects.toThrow();
  });
  it("provider failure reports unmeasured usage rather than a fabricated zero-cost call", async () => {
    sdk.generate.mockRejectedValue(new Error("timeout"));
    const meter = vi.fn();
    await expect(parse(meter)).rejects.toThrow("timeout");
    expect(meter).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: null, source: "unreported" }),
      "provider_error",
      expect.any(Number),
    );
  });
});
