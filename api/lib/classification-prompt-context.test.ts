import { describe, expect, it } from "vitest";
import {
  mergeCategoryDecisions,
  type EscalationClause,
} from "./classification-merge";
import { validateClassifierReply } from "./classifier-contract";
import { verifyClassifiedItems } from "./post-classifier-verifier";
import type { ParsedTransaction } from "./rule-engine";

const item: ParsedTransaction = {
  amount: 200,
  currency: "EGP",
  type: "expense",
  category: "متنوعات",
  subCategory: "عام",
  description: "دفعت 200 خامات",
  confidence: 40,
  needsReview: true,
  parsedBy: "rule_engine",
};
function clause(value = item): EscalationClause[] {
  return [
    {
      segment: { text: value.description } as EscalationClause["segment"],
      localItems: [value],
    },
  ];
}
describe("prompt output survives the actual application contract", () => {
  it.each(["ambiguous", "conflict"] as const)(
    "keeps facts and a sticky blocker for %s",
    (issue) => {
      const reply = validateClassifierReply(
        { items: [{ i: 1, category: "miscellaneous", issue }] },
        1,
      );
      const merged = mergeCategoryDecisions(clause(), reply.items);
      const final = verifyClassifiedItems(merged.items, item.description);
      expect(final.items[0]).toMatchObject({
        amount: 200,
        currency: "EGP",
        type: "expense",
        needsReview: true,
      });
      expect(final.items[0].reviewReasons).toContain(`model_${issue}`);
    },
  );
  it("rejects an invented status and a conflicting duplicate", () => {
    expect(
      validateClassifierReply(
        { items: [{ i: 1, category: "food", issue: "certain" }] },
        1,
      ).items,
    ).toEqual([]);
    expect(
      validateClassifierReply(
        {
          items: [
            { i: 1, category: "food" },
            { i: 1, category: "miscellaneous", issue: "conflict" },
          ],
        },
        1,
      ).items,
    ).toEqual([]);
  });
  it("does not replace a recognized person's name with model text", () => {
    const person = {
      ...item,
      description: "اديت أحمد صاحبي 200",
      category: "أصدقاء",
      subCategory: "أحمد صديقك",
      person_mentioned: "أحمد",
      person_relationship: "صديق",
    };
    const result = mergeCategoryDecisions(clause(person), [
      { i: 1, category: "friends_transactions", sub: "شخص مخترع" },
    ]);
    expect(result.items[0]).toMatchObject({
      category: "أصدقاء",
      subCategory: "أحمد صديقك",
      person_mentioned: "أحمد",
    });
    expect(result.items[0].reviewReasons || []).not.toContain(
      "category_reply_unresolved",
    );
  });
  it("allows a stated purpose to supersede a local person category without inventing identity", () => {
    const person = {
      ...item,
      category: "أصدقاء",
      subCategory: "أحمد",
      person_mentioned: "أحمد",
      person_relationship: "صديق",
    };
    expect(
      mergeCategoryDecisions(clause(person), [
        { i: 1, category: "health", sub: "عام" },
      ]).items[0],
    ).toMatchObject({
      category: "صحة",
      person_mentioned: "أحمد",
      needsReview: true,
    });
  });
  it("preserves a valid business subcategory through post-validation", () => {
    const categories = [{ nameAr: "خامات", type: "expense" }];
    const result = mergeCategoryDecisions(
      clause(),
      [{ i: 1, category: "work", sub: "خامات" }],
      { businessMode: true, businessId: 7, businessCategories: categories },
    );
    const final = verifyClassifiedItems(
      result.items,
      item.description,
      undefined,
      { businessId: 7, categories },
    );
    expect(final.items[0]).toMatchObject({
      subCategory: "خامات",
      businessId: 7,
      amount: 200,
    });
  });
  it.each([false, true])(
    "rejects a wrong business direction or personal scope (%s)",
    (businessMode) => {
      const result = mergeCategoryDecisions(
        clause(),
        [{ i: 1, category: "work", sub: "خامات" }],
        {
          businessMode,
          businessId: 7,
          businessCategories: [{ nameAr: "خامات", type: "income" }],
        },
      );
      expect(result.items[0].businessId).toBeUndefined();
      expect(result.items[0].reviewReasons).toContain(
        "model_subcategory_invalid",
      );
    },
  );
});
