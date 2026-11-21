import { describe, expect, it } from "vitest";
import { normalizeNumbersForMatching, numberMentions, numberMentionSpans, quoteIsFromText } from "./numbers";

describe("the understanding engine's number witness", () => {
  it.each([
    ["دفعت نص مليون مقدم العربية", [500000]],
    ["دفعت تلت تلاف ومتين", [3200]],
    ["دفعت ١٬٢٥٠٫٧٥ جنيه", [1250.75]],
    ["دفعت ۱،۲۵۰٫۷۵ جنيه", [1250.75]],
    ["دفعت 1.250,75 جنيه", [1250.75]],
    ["دفعت 12.5،150 بعدها", [12.5, 150]],
    ["دفعت ٢٫٥k، وبعدها 1,25 K", [2500, 1250]],
    ["دفعت ٢٫٥ألف وبعدها 1.001kجنيه", [2500, 1001]],
    ["7awelt 500 l a7med", [500]],
    ["اشتريت 3.5kg و2,5kg بـ 90", [90]],
    ["اشتريت X25K و4KTV وX_8 بـ 90", [90]],
  ])("reads %s", (sentence, expected) => {
    expect(numberMentions(sentence)).toEqual(expected);
  });

  it("locates repeated amounts separately in text used to match quotes", () => {
    const normalized = normalizeNumbersForMatching("دفعت ١٫٥k إيجار ودفعت ألف ونص فاتورة");
    const spans = numberMentionSpans(normalized);
    expect(spans.map(({ value, start, end }) => [value, normalized.slice(start, end)]))
      .toEqual([[1500, "1500"], [1500, "1500"]]);
    expect(spans[0].end).toBeLessThan(spans[1].start);
    expect(quoteIsFromText("دفعت 1500 إيجار", "دفعت ١٫٥k إيجار ودفعت ألف ونص فاتورة")).toBe(true);
  });
});
