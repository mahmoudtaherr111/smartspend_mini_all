import { describe, it, expect } from "vitest";
import { extractLinkedAmounts, linkAmountsToSegments } from "../api/lib/amount-linker";

describe("Amount Linker (api/lib/amount-linker.ts)", () => {
  it("extracts simple amounts and identifies currency and context", () => {
    const text = "دفعت 150 جنيه في السوبرماركت";
    const amounts = extractLinkedAmounts(text);

    expect(amounts).toHaveLength(1);
    expect(amounts[0].amount).toBe(150);
    expect(amounts[0].currency).toBe("EGP");
    expect(amounts[0].linkedVerb).toBe("دفعت");
  });

  it("extracts multiple amounts with their respective verbs and nouns", () => {
    const text = "أكلت كشري بـ 50 وشربت قهوة بـ 30";
    const amounts = extractLinkedAmounts(text);

    expect(amounts).toHaveLength(2);
    expect(amounts[0].amount).toBe(50);
    expect(amounts[0].linkedVerb).toBe("أكلت");
    expect(amounts[0].linkedNoun).toBe("كشري");

    expect(amounts[1].amount).toBe(30);
    expect(amounts[1].linkedVerb).toBe("شربت");
    expect(amounts[1].linkedNoun).toBe("قهوة");
  });

  it("handles foreign currencies (USD, EUR, SAR, AED)", () => {
    const usdText = "دفعت 20 دولار اشتراك";
    const eurText = "حولت 100 يورو";
    const sarText = "شريت بـ 50 ريال";
    const aedText = "صرفت 70 درهم";

    expect(extractLinkedAmounts(usdText)[0].currency).toBe("USD");
    expect(extractLinkedAmounts(eurText)[0].currency).toBe("EUR");
    expect(extractLinkedAmounts(sarText)[0].currency).toBe("SAR");
    expect(extractLinkedAmounts(aedText)[0].currency).toBe("AED");
  });

  it("links amounts to corresponding text segments", () => {
    const text = "أكلت بـ 50 وبعدين ركبت أوبر بـ 80";
    const amounts = extractLinkedAmounts(text);
    const segments = ["أكلت بـ 50", "وبعدين ركبت أوبر بـ 80"];

    const mapped = linkAmountsToSegments(amounts, segments, text);
    expect(mapped.get(0)).toHaveLength(1);
    expect(mapped.get(0)?.[0].amount).toBe(50);

    expect(mapped.get(1)).toHaveLength(1);
    expect(mapped.get(1)?.[0].amount).toBe(80);
  });

  it("handles thousands separators and decimals properly", () => {
    const textWithComma = "دفعت 1,500 جنيه في الصيدلية و 25.50 جنيه عصير";
    const amounts = extractLinkedAmounts(textWithComma);

    expect(amounts).toHaveLength(2);
    expect(amounts[0].amount).toBe(1500);
    expect(amounts[1].amount).toBe(25.5);
  });
});
