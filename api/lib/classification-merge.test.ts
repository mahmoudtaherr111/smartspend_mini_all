import { describe, expect, it } from "vitest";
import { mergeCategoryDecisions, type EscalationClause } from "./classification-merge";
import type { ParsedTransaction } from "./rule-engine";

function clause(item: Partial<ParsedTransaction>): EscalationClause {
  return {
    segment: { text: "نص", segmentIndex: 0 } as EscalationClause["segment"],
    localItems: [{
      amount: 500, category: "متنوعات", subCategory: "عام", description: "نص", type: "expense",
      confidence: 60, currency: "EGP", needsReview: true, parsedBy: "rule_engine", ...item,
    }],
    clauseId: 1,
  };
}

describe("merging the model's category onto local items", () => {
  it("takes the purpose the model found over a local person category", () => {
    const merged = mergeCategoryDecisions(
      [clause({ category: "العائلة", subCategory: "ابني", person_mentioned: "ابني" })],
      [{ i: 1, category: "education", sub: "مدرسة" }],
    );
    expect(merged.items[0]).toMatchObject({ category: "تعليم", subCategory: "مدرسة", person_mentioned: "ابني" });
  });

  it("gives a person category when neither side found a purpose", () => {
    const merged = mergeCategoryDecisions([clause({ category: "متنوعات" })], [{ i: 1, category: "family_transactions" }]);
    expect(merged.items[0]?.category).toBe("العائلة");
  });

  it("never turns a local purpose into a person", () => {
    const merged = mergeCategoryDecisions([clause({ category: "صحة", subCategory: "دكتور" })], [{ i: 1, category: "friends_transactions" }]);
    expect(merged.items[0]?.category).toBe("صحة");
  });

  it("sends an item to review when the model doubts its direction", () => {
    const merged = mergeCategoryDecisions([clause({})], [{ i: 1, category: "food", sub: "مطعم", directionDoubt: true }]);
    expect(merged.items[0]?.reviewReasons).toContain("model_doubts_direction");
  });

  it("keeps the user's business category as the subcategory of work", () => {
    const merged = mergeCategoryDecisions([clause({})], [{ i: 1, category: "work", sub: "خامات" }], {
      businessSubcategories: ["خامات"],
    });
    expect(merged.items[0]).toMatchObject({ category: "عمل", subCategory: "خامات" });
  });
});
