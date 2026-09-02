/**
 * These are all real misclassifications this repo produced with raw substring matching.
 * They are kept as tests because the mistake is easy to reintroduce: `includes()` looks
 * correct until an Arabic root turns up inside an unrelated word.
 */
import { describe, it, expect } from "vitest";
import { matchesWord, findMatchingWord, buildTokenSet, tokenVariants } from "./arabic-token-match";

describe("Arabic word-boundary matching", () => {
  it("does not match a root buried inside a longer word", () => {
    // "وبعدين" (and then) contains "دين" (debt) — this turned a coffee into a loan.
    expect(matchesWord("دفعت 150 قهوة وبعدين ركبت اوبر", "دين")).toBe(false);
    // "اتغدينا" (we had lunch) contains "دين" — this made lunch a transfer.
    expect(matchesWord("اتغدينا في المطعم بـ 350", "دين")).toBe(false);
    // "طعام" contains "عام", the generic subcategory every category declares.
    expect(matchesWord("اشتريت طعام", "عام")).toBe(false);
    // "أعمل إيه" contains "عمل" — this claimed the work category.
    expect(matchesWord("ولو غلط أعمل إيه؟", "عمل")).toBe(false);
    // "مهرجان" contains "مهر" (dowry).
    expect(matchesWord("تذكرة مهرجان", "مهر")).toBe(false);
  });

  it("matches the same roots when they really are the word", () => {
    expect(matchesWord("عليا دين لأحمد", "دين")).toBe(true);
    expect(matchesWord("اشتريت عام كامل", "عام")).toBe(true);
    expect(matchesWord("عمل حر", "عمل")).toBe(true);
  });

  it("sees through attached Arabic clitics", () => {
    for (const form of ["الجمعيه", "والجمعيه", "بالجمعيه", "للجمعيه", "جمعيه"]) {
      expect(matchesWord(`قبضت ${form} 5000`, "جمعيه"), form).toBe(true);
    }
    expect(matchesWord("دفعت بجنيه", "جنيه")).toBe(true);
  });

  it("still substring-matches multi-word needles, which cannot collide", () => {
    expect(matchesWord("جبت حاجة من كوك دور امبارح", "كوك دور")).toBe(true);
    expect(matchesWord("مفيش حاجة هنا", "كوك دور")).toBe(false);
  });

  it("splits on Arabic punctuation, not only whitespace", () => {
    expect(matchesWord("دفعت الكهربا، وبعدين النت", "الكهربا")).toBe(true);
    expect(matchesWord("قبضت الجمعية؟", "الجمعية")).toBe(true);
  });

  it("findMatchingWord returns the first genuine hit", () => {
    const text = "قبضت الجمعيه 5000";
    expect(findMatchingWord(text, ["دين", "جمعيه", "قرض"])).toBe("جمعيه");
    expect(findMatchingWord(text, ["دين", "قرض"])).toBeUndefined();
  });

  it("tokenVariants peels prefixes without destroying short words", () => {
    expect(tokenVariants("والكهربا")).toContain("الكهربا");
    expect(tokenVariants("والكهربا")).toContain("كهربا");
    // Too short to strip — "بيت" must not become "يت".
    expect(tokenVariants("بيت")).toEqual(["بيت"]);
  });

  it("buildTokenSet is reusable across many needles", () => {
    const tokens = buildTokenSet("دفعت قسط الجمعيه وبعدين رحت الشغل");
    expect(matchesWord("", "جمعيه", tokens)).toBe(true);
    expect(matchesWord("", "دين", tokens)).toBe(false);
  });
});
