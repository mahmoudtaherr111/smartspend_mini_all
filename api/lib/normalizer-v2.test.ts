import { describe, it, expect } from "vitest";
import { normalizeV2 } from "./normalizer-v2";

const forAI = (t: string) => normalizeV2(t).forAI;

describe("Latin brand names", () => {
  it("maps the brands people actually type to the Arabic the classifier knows", () => {
    // Every one of these used to be destroyed by letter-by-letter transliteration, and
    // brand names are the most classification-relevant Latin words a user can write.
    expect(forAI("دفعت Uber بـ 80")).toContain("أوبر");
    expect(forAI("حولت على Vodafone Cash 200")).toContain("فودافون كاش");
    expect(forAI("دفعت Talabat 150")).toContain("طلبات");
    expect(forAI("صرفت 200 في Carrefour")).toContain("كارفور");
    // STT corrections normalise this further downstream; the stem is what matches.
    expect(forAI("اشتركت في Netflix بـ 200")).toContain("نتفل");
  });

  it("no longer produces the mangled forms", () => {
    // "وبير", "فودافوني كاسه", "تالابات", "كارريفوور" — none matched anything in the
    // merchant registry, whose keys are Arabic, so typing a brand guaranteed a miss.
    const out = [
      forAI("دفعت Uber بـ 80"),
      forAI("حولت على Vodafone Cash 200"),
      forAI("دفعت Talabat 150"),
      forAI("صرفت 200 في Carrefour"),
    ].join(" | ");
    for (const mangled of ["وبير", "كاسه", "تالابات", "كارريفوور"]) {
      expect(out).not.toContain(mangled);
    }
  });

  it("leaves an unknown Latin word intact rather than inventing an Arabic one", () => {
    // "Klarna" is more useful to the model as itself than as "كلارنا".
    expect(forAI("اشتركت في Klarna")).toContain("Klarna");
  });
});

describe("Latin names in the rules text", () => {
  const forRules = (t: string) => normalizeV2(t).forRules;

  it("keeps a name the lexicon knows in Latin letters as written", () => {
    // Spelled by sound these became "فيركيل", "كارريفوور" and "نيتفليك", which no entry
    // matches, so the engine filed them under متنوعات.
    expect(forRules("vercel 400")).toContain("vercel");
    expect(forRules("صرفت 850 في Carrefour")).toContain("carrefour");
    expect(forRules("netflix 150")).toContain("netflix");
  });

  it("keeps a whole multi-word name, but not one of its words alone", () => {
    expect(forRules("costa coffee 90")).toContain("costa coffee");
    expect(forRules("شاهد VIP 100")).toContain("vip");
    expect(forRules("coffee 45")).not.toContain("coffee");
  });

  it("still gives a Franco spelling its Arabic, which the rail and merchant layers read", () => {
    expect(forRules("instapay 300")).toContain("انستاباي");
    expect(forRules("vodafone cash 200")).toContain("فودافون كاش");
    expect(forRules("Uber Trip 80")).toContain("اوبر");
    expect(forRules("dafa3t 50 uber")).toContain("اوبر");
    expect(forRules("7awalt 500 l Ahmed")).toContain("حولت");
  });
});

describe("Franco-Arabic", () => {
  it("still converts real Franco, which is what the converter is for", () => {
    // The digit-letters are the signal: 3 for ع, 7 for ح, 5 for خ.
    const out = forAI("dafa3t 3la el kahraba 200");
    expect(out).toContain("دفعت");
    expect(out).toContain("على");
  });

  it("treats a word with Franco digits as Franco", () => {
    expect(forAI("7abibi")).toMatch(/[؀-ۿ]/);
  });

  it("does not treat plain English as Arabic in disguise", () => {
    // The old rule was "any Latin word of two or more letters", which assumed all Latin
    // text is Arabic written in Latin script.
    expect(forAI("payment received")).toContain("payment");
  });
});

describe("numbers reaching the AI text", () => {
  it("converts Arabic-Indic digits", () => {
    expect(forAI("دفعت ٥٠٠ بنزين")).toContain("500");
  });

  it("keeps a composed spoken number whole", () => {
    // "مية وخمسين" is 150, not 100 next to 50 — splitting it invents a transaction.
    expect(forAI("دفعت مية وخمسين")).toContain("150");
  });

  it("expands the digit-plus-thousand shorthand", () => {
    expect(forAI("قبضت 5 الف")).toContain("5000");
  });
});

describe("complexity signals that drive routing", () => {
  it("calls a short single-amount sentence simple", () => {
    expect(normalizeV2("دفعت 50 قهوة").estimatedComplexity).toBe("simple");
  });

  it("notices multiple amounts", () => {
    expect(normalizeV2("فطرت بـ 50 وركبت اوبر بـ 80").hasMultipleAmounts).toBe(true);
  });

  it("notices narrative connectors", () => {
    expect(normalizeV2("دفعت 50 وبعدين دفعت 80").hasNarrativeConnectors).toBe(true);
  });
});
