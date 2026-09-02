/**
 * The verb governs direction, the noun governs category.
 *
 * These cases are the ones the product brief names explicitly, and each of them was
 * wrong before this table existed: "قبضت الجمعية" was filed as salary because the
 * generic verb keyword قبض won the category, and "دفعت قسط الجمعية" was filed as a
 * utility bill because قسط won it.
 */
import { describe, it, expect } from "vitest";
import { resolveGovernedTaxonomy, buildDirectionRulesBlock } from "./direction-governed-taxonomy";
import { checkTaxonomyPair } from "./benchmark-taxonomy-assert";

describe("direction-governed taxonomy", () => {
  it("routes a gam3eya by its verb", () => {
    const received = resolveGovernedTaxonomy("قبضت جمعيه 5000");
    expect(received).toMatchObject({
      category: "التزامات وجمعيات",
      subCategory: "قبض جمعية",
      type: "income",
      direction: "in",
    });

    const paid = resolveGovernedTaxonomy("دفعت قسط الجمعيه 2000");
    expect(paid).toMatchObject({
      category: "التزامات وجمعيات",
      subCategory: "قسط جمعية",
      type: "expense",
      direction: "out",
    });
  });

  it("reads an obligation phrased without a verb", () => {
    expect(resolveGovernedTaxonomy("عليا قسط الجمعيه 5000")).toMatchObject({
      subCategory: "قسط جمعية",
      type: "expense",
    });
  });

  it("defaults a bare gam3eya to the monthly payment, the common case", () => {
    expect(resolveGovernedTaxonomy("الجمعيه 1000")).toMatchObject({
      subCategory: "قسط جمعية",
      direction: "out",
    });
  });

  it("separates lending from borrowing even without the noun", () => {
    expect(resolveGovernedTaxonomy("سلفت مروان 2000")).toMatchObject({
      category: "تحويل",
      subCategory: "دين/سلفة",
      direction: "out",
    });
    expect(resolveGovernedTaxonomy("استلفت من مروان 2000")).toMatchObject({
      category: "تحويل",
      direction: "in",
    });
  });

  it("lets an unambiguous borrowing verb beat a lending verb in the same text", () => {
    expect(resolveGovernedTaxonomy("رجعلي سلفته 500")).toMatchObject({ direction: "in" });
  });

  it("ignores governed roots hidden inside unrelated words", () => {
    // "وبعدين" contains "دين"; "اتغدينا" contains it too.
    expect(resolveGovernedTaxonomy("دفعت 150 قهوة وبعدين ركبت اوبر بـ 80")).toBeNull();
    expect(resolveGovernedTaxonomy("اتغدينا في المطعم بـ 350")).toBeNull();
    expect(resolveGovernedTaxonomy("اشتريت دهب بـ 12000 وبعدين بعت دهب")).toBeNull();
  });

  it("returns null for ordinary text", () => {
    expect(resolveGovernedTaxonomy("دفعت فاتورة الكهربا 450")).toBeNull();
    expect(resolveGovernedTaxonomy("")).toBeNull();
  });

  it("only ever emits pairs the registry can actually store", () => {
    const samples = [
      "قبضت الجمعيه 5000",
      "دفعت قسط الجمعيه 2000",
      "سلفت مروان 2000",
      "استلفت من مروان 2000",
    ];
    for (const s of samples) {
      const r = resolveGovernedTaxonomy(s);
      expect(r, s).not.toBeNull();
      const pair = checkTaxonomyPair(r!.category, r!.subCategory);
      expect(pair.legal, `${s}: ${pair.reason}`).toBe(true);
    }
  });

  it("generates the prompt rules from the same table the engine reads", () => {
    const block = buildDirectionRulesBlock();
    // The prompt used to assert الجمعية was income in one line and a transfer in
    // another. Generating it means the two can no longer disagree.
    expect(block).toContain("قبض جمعية");
    expect(block).toContain("قسط جمعية");
    expect(block).toContain("استلفت");
  });
});
