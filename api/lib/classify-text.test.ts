import { describe, expect, it } from "vitest";
import { classifyText } from "./classify-text";

describe("one classifier for the other channels", () => {
  it("files a chat sentence as the entry form would", async () => {
    expect(await classifyText("سجل عندك 45 جنيه قهوة من ستاربكس")).toMatchObject({ category: "أكل وشرب", type: "expense" });
    expect(await classifyText("دفعت مصاريف الحضانة", { amount: 1500 })).toMatchObject({ category: "أطفال" });
  });

  it("reads a refund with its direction", async () => {
    expect(await classifyText("رجعت الجزمة واخدت فلوسي 300")).toMatchObject({ category: "تسوق", type: "expense", direction: "incoming" });
  });

  it("answers nothing rather than the catch-all", async () => {
    expect(await classifyText("سجل 50")).toBeNull();
  });
});

describe("a business's own category", () => {
  it("stays the subcategory of work spending and work income", async () => {
    const { normalizeSubCategoryName } = await import("./category-registry");
    expect(normalizeSubCategoryName("عمل", "خامات")).toBe("خامات");
    expect(normalizeSubCategoryName("عمل حر", "طلبية أونلاين")).toBe("طلبية أونلاين");
    expect(normalizeSubCategoryName("أكل وشرب", "خامات")).not.toBe("خامات");
  });
});
