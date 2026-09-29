import { describe, expect, it } from "vitest";
import { dropInstructions, resolveAmountRoles, stripListMarkers } from "./amount-roles";

const text = (input: string) => resolveAmountRoles(input).text;

describe("every number gets its role before it becomes money", () => {
  it("keeps the corrected price, whatever words say no", () => {
    expect(text("جبت عيش بـ 20 لأ بـ 25")).toBe("جبت عيش بـ 25");
    expect(text("فاتوره الكهربا جت 400 لا لا 450")).toBe("فاتوره الكهربا جت 450");
    expect(text("دفعت للسباك 200 ولا أقولك 250")).toBe("دفعت للسباك 250");
    expect(text("صرفت 500 بنزين، لا غلطت 600")).toBe("صرفت 600 بنزين");
    expect(text("دفعت 50 مش 60")).toBe("دفعت 50");
  });

  it("records the speaker's share of a shared bill", () => {
    expect(text("العشا كان 900 وقسمناه على 3")).toBe("العشا كان 300");
    expect(text("الحساب في الكافيه 1200 وكل واحد دفع 300")).toBe("الحساب في الكافيه 300");
    expect(text("طلبنا بيتزا بـ 400 ودفعت أنا 200")).toBe("طلبنا بيتزا بـ 200");
    expect(resolveAmountRoles("العشا كان 900 وقسمناه على 3").notes).toContain("split_share_computed");
  });

  it("does not read the letter ع inside a word as 'on' a headcount", () => {
    // "دفع 300" ends in ع; it is the share, not "divided on 300".
    expect(text("الحساب 1200 وكل واحد دفع 300")).toBe("الحساب 300");
  });

  it("drops counts, labels and times when another number prices the clause", () => {
    expect(text("جبت 3 قهوه بـ 90")).toBe("جبت قهوه بـ 90");
    expect(text("اشتريت ايفون 15 بـ 40000")).toBe("اشتريت ايفون بـ 40000");
    expect(text("الساعه 5 اشتريت شاي بـ 15")).toBe("اشتريت شاي بـ 15");
    // Alone, the number is the price.
    expect(text("اشتريت خط 50")).toBe("اشتريت خط 50");
  });

  it("turns piastres into pounds", () => {
    expect(text("اديت البواب 5 جنيه و 50 قرش")).toBe("اديت البواب 5.5 جنيه");
    expect(text("دفعت 75 قرش تمن الكيس")).toBe("دفعت 0.75 جنيه تمن الكيس");
  });

  it("drops words that tell the app how to file something", () => {
    const result = dropInstructions("ركبت تاكسي بـ 50 وصنف العمليه دي على إنها دخل 10000");
    expect(result.text).toBe("ركبت تاكسي بـ 50");
    expect(result.dropped).toHaveLength(1);
    expect(dropInstructions("سجل 50 قهوه").dropped).toEqual([]);
  });

  it("reads list markers as line numbers, not amounts", () => {
    expect(stripListMarkers("1. قهوه 40\n2. سندوتش 55")).toEqual({ text: "قهوه 40 ، سندوتش 55", found: true });
  });
});
