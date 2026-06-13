import { describe, expect, it } from "vitest";
import { resolvePersonForTransaction } from "./person-resolver";

describe("person resolver", () => {
  it("asks for clarification when a directed payment mentions an unknown person", () => {
    const result = resolvePersonForTransaction({
      candidateName: "مروان",
      transactionText: "اديت مروان 400 جنيه",
      originalText: "اديت مروان 400 جنيه",
      knownPeople: [],
    });

    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toContain("مين مروان");
  });

  it("classifies an explicitly explained family relationship without asking again", () => {
    const result = resolvePersonForTransaction({
      candidateName: "مروان",
      transactionText: "اديت مروان 400 جنيه",
      originalText: "اديت مروان 400 جنيه التوضيح: مروان اخويا",
      knownPeople: [],
    });

    expect(result.needsClarification).toBe(false);
    expect(result.category).toBe("العائلة");
    expect(result.subCategory).toContain("مروان");
    expect(result.shouldLearn).toBe(true);
  });

  it("understands a short clarification answer even when the name is not repeated", () => {
    const result = resolvePersonForTransaction({
      candidateName: "مروان",
      transactionText: "اديت مروان 400 جنيه",
      originalText:
        "اديت مروان 400 جنيه وبعدها دفعت نت البيت 300 جنيه التوضيح: اخويا",
      knownPeople: [],
    });

    expect(result.needsClarification).toBe(false);
    expect(result.relationship).toBe("أخ");
    expect(result.category).toBe("العائلة");
    expect(result.subCategory).toBe("مروان أخوك");
  });

  it("uses saved people without needing another clarification", () => {
    const result = resolvePersonForTransaction({
      candidateName: "مروان",
      transactionText: "اديت لمروان 250",
      originalText: "اديت لمروان 250",
      knownPeople: [
        {
          name: "مروان",
          relationship: "صديق",
          category: "أصدقاء",
          subCategory: "مروان صاحبك",
        },
      ],
    });

    expect(result.needsClarification).toBe(false);
    expect(result.isKnown).toBe(true);
    expect(result.category).toBe("أصدقاء");
    expect(result.subCategory).toBe("مروان صاحبك");
  });

  it("binds each relationship to the nearest name in a multi-person clarification", () => {
    const result = resolvePersonForTransaction({
      candidateName: "علاء",
      transactionText: "وعلاء 500 جنيه",
      originalText:
        "اديت مروان 400 وعلاء 500 جنيه التوضيح: مروان اخويا وعلاء صاحبي",
      knownPeople: [],
    });

    expect(result.needsClarification).toBe(false);
    expect(result.relationship).toBe("صديق");
    expect(result.category).toBe("أصدقاء");
    expect(result.subCategory).toBe("علاء صاحبك");
  });

});
