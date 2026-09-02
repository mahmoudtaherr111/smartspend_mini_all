import { describe, it, expect } from "vitest";
import { detectNegation, stripNegationCircumfix } from "./negation-detector";

describe("Egyptian negation and counterfactual detection", () => {
  it("peels the ما...ش circumfix off a verb", () => {
    expect(stripNegationCircumfix("مروحتش")).toBe("روحت");
    expect(stripNegationCircumfix("مادفعتش")).toBe("دفعت");
    expect(stripNegationCircumfix("مشتريتهاش")).toBe("شتريت");
    expect(stripNegationCircumfix("مخدتش")).toBe("خدت");
  });

  it("leaves words that merely look negated alone", () => {
    expect(stripNegationCircumfix("مش")).toBeNull();
    expect(stripNegationCircumfix("ماشي")).toBeNull();
    expect(stripNegationCircumfix("قهوة")).toBeNull();
  });

  it("rejects an amount that was intended but never spent", () => {
    const r = detectNegation("كنت هروح الجيم وادفع 500 بس مروحتش");
    expect(r.negated).toBe(true);
    expect(r.kind).toBe("negated_verb");
  });

  it("rejects a price that was quoted but not paid", () => {
    const r = detectNegation("الشقة اللي شفتها كانت بمليون ونص بس مشتريتهاش");
    expect(r.negated).toBe(true);
  });

  it("rejects a bill someone else settled", () => {
    expect(detectNegation("صاحبي عزمني ومادفعتش مليم").negated).toBe(true);
    expect(detectNegation("اتغدينا وكان على حسابه").negated).toBe(true);
  });

  it("rejects a cancelled order", () => {
    const r = detectNegation("كنت هطلب دليفري بـ 200 بس لغيت");
    expect(r.negated).toBe(true);
  });

  it("does not reject transactions that actually happened", () => {
    const real = [
      "دفعت فاتورة الكهربا 450",
      "قبضت الجمعية 5000",
      "اشتريت هدوم بـ 800",
      "حولت 500 لمروان",
      "روحت الجيم ودفعت 500",
      "جبت مشروب بـ 20",
      "اتغدينا في المطعم بـ 350",
    ];
    for (const t of real) {
      expect(detectNegation(t).negated, t).toBe(false);
    }
  });

  it("handles empty and non-financial input", () => {
    expect(detectNegation("").negated).toBe(false);
    expect(detectNegation("النهاردة الجو جميل").negated).toBe(false);
  });
});
