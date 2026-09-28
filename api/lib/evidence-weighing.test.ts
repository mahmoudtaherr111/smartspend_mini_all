import { describe, expect, it } from "vitest";
import { collectClues, weighClues } from "./evidence-weighing";

const weigh = (text: string, category: string, matchKind: string, subCategory = "عام") =>
  weighClues(collectClues(text), { category, subCategory, matchKind });

describe("weighing every clue in a clause", () => {
  it("lets what was bought overrule the store it was bought at", () => {
    const result = weigh("اشتريت هدوم من سبينيس 800", "أكل وشرب", "merchant_registry", "بقالة");
    expect(result.override).toMatchObject({ category: "تسوق", reason: "purpose_over_store" });
    expect(result.candidates[0]).toBe("تسوق");
  });

  it("keeps the store when the sentence says nothing else", () => {
    expect(weigh("كارفور 850", "أكل وشرب", "merchant_registry", "بقالة").override).toBeUndefined();
  });

  it("follows a category the sentence names outright", () => {
    const result = weigh("رايح الشغل دفعت 30 مواصلات", "عمل", "dict_unigram");
    expect(result.override).toMatchObject({ category: "مواصلات", reason: "category_named" });
  });

  it("never second-guesses what the user taught", () => {
    const result = weigh("اشتريت هدوم من سبينيس 800", "أكل وشرب", "user_dictionary");
    expect(result.override).toBeUndefined();
    expect(result.disputed).toBe(false);
  });

  it("marks a stronger rival reading as a doubt instead of guessing", () => {
    const result = weigh("دفعت 200 بنزين وعيش وخضار", "مواصلات", "dict_unigram");
    expect(result.disputed).toBe(true);
    expect(result.candidates).toEqual(expect.arrayContaining(["مواصلات", "أكل وشرب"]));
  });

  it("does not let kinship or a payment rail vote on the purpose", () => {
    const clues = collectClues("حولت لماما 500 بانستاباي");
    expect(clues.map((clue) => clue.category)).not.toContain("العائلة");
    expect(clues.map((clue) => clue.category)).not.toContain("تحويل");
  });
});
