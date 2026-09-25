import { describe, expect, it } from "vitest";
import { savedSummary } from "./saved-toast";

describe("what a save says it saved", () => {
  it("names one item's amount and place, and a refund as one", () => {
    expect(savedSummary([{ id: 1, amount: 300, category: "تسوق", subCategory: "أحذية" }])).toBe("٣٠٠ ج · تسوق/أحذية");
    expect(savedSummary([{ id: 1, amount: 300, category: "تسوق", subCategory: "عام", direction: "incoming" }])).toBe("٣٠٠ ج · تسوق (مرتجع)");
  });
  it("counts several items and their total", () => {
    expect(savedSummary([{ id: 1, amount: 100, category: "أكل وشرب" }, { id: 2, amount: 50, category: "مواصلات" }])).toBe("2 عمليات · ١٥٠ ج");
  });
});
