/**
 * The number engine had no tests of its own. It was exercised only through the
 * benchmark, which meant a form nobody had thought to put in a fixture was a form
 * nobody would ever discover was broken — and that is exactly how the "-ميت" hundreds
 * went missing: "خمسميت جنيه" parsed to no amount at all, from a sentence any Egyptian
 * would read without hesitating.
 */
import { describe, it, expect } from "vitest";
import { extractAmounts } from "./entity-extractor";

const amounts = (text: string) => extractAmounts(text).map((a) => a.amount);

describe("digit forms", () => {
  it("reads ASCII digits", () => {
    expect(amounts("دفعت 250 قهوة")).toEqual([250]);
  });

  it("reads Arabic-Indic digits", () => {
    // `\d` in JavaScript is ASCII-only, so every naive regex in this codebase is blind
    // to these — and Egyptian keyboards produce them by default.
    expect(amounts("دفعت ٥٠٠ بنزين")).toEqual([500]);
    expect(amounts("٣٥ جنيه")).toEqual([35]);
  });

  it("reads decimals and thousands separators", () => {
    expect(amounts("دفعت 1,500 جنيه")).toEqual([1500]);
    expect(amounts("دفعت 12.5 جنيه")).toEqual([12.5]);
  });

  it("reads a number word that touches punctuation", () => {
    // Tokenizing on whitespace left "وخمسين،" unmatched, so the composition stopped at
    // 300 and the fifty vanished — in any sentence with a comma, which is most of them.
    expect(amounts("حطيت سولار ب تلتمية وخمسين، وبعدين رحت")).toEqual([350]);
    expect(amounts("شربت شاي ب عشرة، وسبت")).toEqual([10]);
    expect(amounts("جبت الدوا ب ميتين وتلاتين.")).toEqual([230]);
  });

  it("reads a thousands separator together with a decimal fraction", () => {
    // "1,250.50" was read as 1.25 — the comma rule demanded a bare three digits after
    // it, so the group "250.50" failed the test and the comma was taken for a decimal
    // point. A thousand-fold under-count, silent, on the amount field.
    expect(amounts("حولت 1,250.50 ج.م انستاباي")).toEqual([1250.5]);
    expect(amounts("قبضت 1,250,500.75 جنيه")).toEqual([1250500.75]);
    // The decimal comma still reads as a decimal comma.
    expect(amounts("دفعت 1,5 جنيه")).toEqual([1.5]);
  });
});

describe("spoken numbers", () => {
  it("reads the -مية hundreds", () => {
    expect(amounts("خمسمية جنيه")).toEqual([500]);
    expect(amounts("تلتميه")).toEqual([300]);
  });

  it("reads the -ميت hundreds, the form people actually say", () => {
    // The ta appears before a counted noun, which is most of the time in speech.
    // Missing from the table until it was tested against ordinary sentences rather
    // than against its own vocabulary.
    expect(amounts("اديت مروان خمسميت جنيه")).toEqual([500]);
    expect(amounts("دفعت تلتميت")).toEqual([300]);
    expect(amounts("ربعميت جنيه")).toEqual([400]);
    expect(amounts("ستميت")).toEqual([600]);
    expect(amounts("سبعميت")).toEqual([700]);
    expect(amounts("تمنميت")).toEqual([800]);
    expect(amounts("تسعميت")).toEqual([900]);
    expect(amounts("ميت جنيه بنزين")).toEqual([100]);
  });

  it("composes hundreds with tens", () => {
    expect(amounts("ربعميت وخمسين")).toEqual([450]);
    expect(amounts("مية وخمسين جنيه")).toEqual([150]);
  });

  it("composes thousands", () => {
    expect(amounts("خمس تلاف جنيه")).toEqual([5000]);
    expect(amounts("الفين وخمسمية")).toEqual([2500]);
  });

  it("reads slang units", () => {
    // باكو = 1000, أرنب = 1,000,000 — money slang, not vocabulary a general model knows.
    expect(amounts("صرفت باكو على الأكل")).toEqual([1000]);
    expect(amounts("العربية بأرنب")).toEqual([1000000]);
  });
});

describe("what is NOT an amount", () => {
  it("does not read a clock time as money", () => {
    // "الساعة 5" is five o'clock. The decomposer's own naive extractor still gets this
    // wrong, which is why segment amounts must come from here and not from there.
    expect(amounts("الساعة 5 دفعت 200 قهوة")).toEqual([200]);
  });

  it("does not read the water bill as the number one hundred", () => {
    // "مية" is both "water" and "hundred" in Egyptian Arabic; only context separates
    // them, and "فاتورة المية" is the bill, not a 100-pound charge.
    expect(amounts("فاتورة المية 200")).toEqual([200]);
  });

  it("finds nothing in a sentence with no money in it", () => {
    expect(amounts("ازيك عامل ايه النهاردة")).toEqual([]);
  });
});

describe("several amounts in one utterance", () => {
  it("distinguishes colloquial price تمن from the number eight by its neighbours", () => {
    expect(amounts("رجعلي 220 تمن جزمة")).toEqual([220]);
    expect(amounts("دفعت تمن جنيه")).toEqual([8]);
    expect(amounts("دفعت تمن وتلاتين جنيه")).toEqual([38]);
  });
  it("keeps them separate and in the order spoken", () => {
    expect(amounts("فطرت بـ 50 وركبت اوبر 80 ودفعت 2000 قسط")).toEqual([
      50, 80, 2000,
    ]);
  });

  it("does not split a composed number into its parts", () => {
    // "مية وخمسين" is 150, not 100 next to 50. Splitting it invents a transaction.
    expect(amounts("دفعت مية وخمسين")).toEqual([150]);
  });

  it("keeps a repeated amount as two amounts", () => {
    expect(amounts("قهوة بـ 50 وتانية بـ 50")).toEqual([50, 50]);
  });

  it("mixes digit and spoken forms in one sentence", () => {
    expect(amounts("دفعت 100 وبعدين خمسميت")).toEqual([100, 500]);
  });
});
