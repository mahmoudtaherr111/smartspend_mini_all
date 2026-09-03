import { describe, it, expect, vi } from "vitest";

vi.mock("../queries/connection", () => ({ db: {}, pool: {} }));

import {
  amountBand,
  applyCorrectionRules,
  correctionPattern,
  isLearnableCorrection,
  matchCorrectionRule,
  type CorrectionRule,
} from "./correction-rules";

const rule = (over: Partial<CorrectionRule>): CorrectionRule => ({
  id: 1,
  pattern: "قهوة",
  category: "أكل وشرب",
  subCategory: "قهوة ومشروبات",
  type: "expense",
  amountMin: null,
  amountMax: null,
  ...over,
});

describe("correction pattern", () => {
  it("keys on the words that identify the segment, not on connectives", () => {
    const p = correctionPattern("دفعت 35 على القهوة");
    const tokens = p.split(" ");

    // Stored in canonical form: normalized spelling, article stripped. That is what lets
    // a rule learned from "قهوة" fire on "القهوة" and on "بالقهوة".
    expect(tokens).toContain("قهوه");
    expect(tokens).toContain("دفعت");

    // Numbers vary between occurrences; the amount band carries that instead.
    expect(p).not.toMatch(/\d/);

    // Connectives would make the rule fire on almost anything the user says. Note the
    // form: normalization folds the alef-maqsura, so the stop list has to be normalized
    // too or it stops nothing at all.
    expect(tokens).not.toContain("علي");
    expect(tokens).not.toContain("على");
  });

  it("gives the same key regardless of word order", () => {
    // Otherwise one correction fragments into a separate rule per phrasing.
    expect(correctionPattern("قسط الجمعية دفعت")).toBe(correctionPattern("دفعت قسط الجمعية"));
  });

  it("normalizes spelling variants to one key", () => {
    // STT and typing produce both spellings for the same word.
    expect(correctionPattern("اشتريت أدوية")).toBe(correctionPattern("اشتريت ادويه"));
  });

  it("reads Arabic-Indic digits as digits", () => {
    expect(correctionPattern("دفعت ٣٥ قهوة")).not.toMatch(/[٠-٩]/);
  });
});

describe("amount band", () => {
  it("spans an order of magnitude, not an exact value", () => {
    const band = amountBand(35)!;
    // The same coffee at a different price is the same rule.
    expect(35 >= band.min && 35 <= band.max).toBe(true);
    expect(45 >= band.min && 45 <= band.max).toBe(true);
    // Two orders of magnitude away is a different transaction.
    expect(3500 <= band.max).toBe(false);
  });

  it("declines to band a nonsensical amount", () => {
    expect(amountBand(0)).toBeNull();
    expect(amountBand(-5)).toBeNull();
    expect(amountBand(Number.NaN)).toBeNull();
  });
});

describe("what is worth learning", () => {
  it("refuses to learn person categories", () => {
    // `sub_category` holds an individual's name there, so a rule would teach that every
    // future mention of the pattern belongs to that one person.
    for (const category of ["العائلة", "أصدقاء", "موظفين"]) {
      expect(isLearnableCorrection({ category, originalText: "اديت مروان فلوس" })).toBe(false);
    }
  });

  it("refuses to learn the fallback category", () => {
    // "متنوعات" is the classifier admitting it does not know; storing it as the answer
    // would teach the system to give up faster.
    expect(isLearnableCorrection({ category: "متنوعات", originalText: "دفعت على حاجة" })).toBe(
      false,
    );
  });

  it("refuses a pattern too thin to be a pattern", () => {
    expect(isLearnableCorrection({ category: "أكل وشرب", originalText: "50 جنيه" })).toBe(false);
  });

  it("learns an ordinary correction", () => {
    expect(
      isLearnableCorrection({ category: "التزامات وجمعيات", originalText: "دفعت قسط الجمعية" }),
    ).toBe(true);
  });
});

describe("matching a stored correction", () => {
  const rules = [rule({ id: 1, pattern: correctionPattern("قهوة") })];

  it("fires on a different phrasing of the same thing", () => {
    // The rule was learned from one sentence and has to work on the others.
    expect(matchCorrectionRule("اشتريت قهوة من برة", 40, rules)?.id).toBe(1);
  });

  it("does not fire on an amount from a different world", () => {
    const banded = [rule({ id: 1, pattern: correctionPattern("قهوة"), amountMin: 17.5, amountMax: 70 })];
    expect(matchCorrectionRule("دفعت على قهوة", 35, banded)?.id).toBe(1);
    // "coffee 3500" is not the coffee this rule was taught about.
    expect(matchCorrectionRule("دفعت على قهوة", 3500, banded)).toBeNull();
  });

  it("prefers the more specific rule", () => {
    const rules2 = [
      rule({ id: 1, pattern: correctionPattern("قسط") }),
      rule({
        id: 2,
        pattern: correctionPattern("قسط الجمعية"),
        category: "التزامات وجمعيات",
        subCategory: "قسط جمعية",
      }),
    ];
    // A later, narrower correction has to win over an earlier broad one.
    expect(matchCorrectionRule("دفعت قسط الجمعية", 2000, rules2)?.id).toBe(2);
  });

  it("does not fire when the rule's words are absent", () => {
    expect(matchCorrectionRule("ركبت تاكسي", 60, rules)).toBeNull();
  });
});

describe("applying corrections to classified items", () => {
  const item = {
    amount: 35,
    category: "متنوعات",
    subCategory: "عام",
    type: "expense",
    confidence: 55,
  };

  it("overwrites the guess and marks it as taught by the user", () => {
    const rules = [rule({ id: 7, pattern: correctionPattern("قهوة") })];
    const { items, appliedRuleIds } = applyCorrectionRules([item], "دفعت على القهوة", rules);

    expect(items[0].category).toBe("أكل وشرب");
    expect(items[0].subCategory).toBe("قهوة ومشروبات");
    expect(appliedRuleIds).toEqual([7]);
    // `user_correction` is what stops the decision layer paying a model to disagree with
    // the user, and what makes calibration price it in the exact family.
    expect((items[0].evidence as { matchKind: string }).matchKind).toBe("user_correction");
    expect(items[0].inferenceSource).toBe("user_correction");
  });

  it("leaves items alone when nothing matches", () => {
    const { items, appliedRuleIds } = applyCorrectionRules([item], "ركبت اوبر", [
      rule({ pattern: correctionPattern("قهوة") }),
    ]);
    expect(items[0].category).toBe("متنوعات");
    expect(appliedRuleIds).toEqual([]);
  });

  it("never overwrites a resolved person", () => {
    // Person resolution says who received the money; a category rule must not claim to
    // know better and erase the name in `subCategory`.
    const personItem = { ...item, category: "أصدقاء", subCategory: "مروان صاحبك" };
    const { items } = applyCorrectionRules([personItem], "اديت مروان قهوة", [
      rule({ pattern: correctionPattern("قهوة") }),
    ]);
    expect(items[0].category).toBe("أصدقاء");
    expect(items[0].subCategory).toBe("مروان صاحبك");
  });

  it("is a no-op with no rules, without copying anything", () => {
    const input = [item];
    expect(applyCorrectionRules(input, "أي كلام", []).items).toBe(input);
  });
});
