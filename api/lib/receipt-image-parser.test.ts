import { describe, expect, it } from "vitest";
import { extractFromImageText } from "./receipt-image-parser";

describe("receipt-image-parser", () => {
  it("extracts debit SMS amounts in Arabic", () => {
    const result = extractFromImageText("تم خصم مبلغ 350.50 جنيه من حسابك");
    expect(result?.amount).toBe(350.5);
    expect(result?.type).toBe("expense");
    expect(result?.confidence).toBeGreaterThanOrEqual(70);
  });
});
