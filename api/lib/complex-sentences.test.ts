import { describe, expect, it } from "vitest";
import { decomposeHeuristic } from "./narrative-decomposer";
import { resolvePersonForTransaction } from "./person-resolver";

describe("Narrative Decomposer & Person Resolver Integration for Complex Sentences", () => {
  it("splits a compound sentence with 'و' followed by a known person name", () => {
    const text = "اديت مسعد 500 وجلال 700 جنيه";
    const knownNames = ["مساعد", "جلال"];
    const result = decomposeHeuristic(text, knownNames);

    expect(result.segments.length).toBe(2);
    expect(result.segments[0].text).toBe("اديت مسعد 500");
    expect(result.segments[1].text).toBe("وجلال 700 جنيه");
  });

  it("splits a compound sentence with 'و' followed by a financial noun", () => {
    const text = "دفعت الايجار 1000 والكهربا 200";
    const result = decomposeHeuristic(text);

    expect(result.segments.length).toBe(2);
    expect(result.segments[0].text).toBe("دفعت الايجار 1000");
    expect(result.segments[1].text).toBe("والكهربا 200");
  });

  it("fuzzy matches names with minor spelling variants (typo correction)", () => {
    const knownPeople = [
      {
        name: "مساعد",
        relationship: "صديق",
        category: "أصدقاء",
        subCategory: "مساعد صاحبك",
      },
    ];

    const result = resolvePersonForTransaction({
      candidateName: "مسعد",
      transactionText: "اديت مسعد 500",
      originalText: "اديت مسعد 500",
      knownPeople,
    });

    expect(result.isKnown).toBe(true);
    expect(result.name).toBe("مساعد");
    expect(result.category).toBe("أصدقاء");
  });

  it("prevents name 'رامي' from being matched as relationship 'أم'", () => {
    const result = resolvePersonForTransaction({
      candidateName: "رامي",
      transactionText: "ورامي 250",
      originalText: "اديت جلال 400 ومساعد 700 ورامي 250 التوضيح: موظف عندي",
      knownPeople: [],
    });

    // Rami should be mapped to "موظف" due to the clarification "موظف عندي"
    expect(result.relationship).toBe("موظف");
    expect(result.category).toBe("موظفين");
    expect(result.needsClarification).toBe(false);
  });
});
