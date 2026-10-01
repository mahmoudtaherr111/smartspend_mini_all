import { describe, expect, it } from "vitest";
import { normalizeArabic } from "./unified-normalizer";
import { readsAsRefund } from "./intent-detector";

describe("returned purchases with a spoken refund amount", () => {
  it.each([
    "رجعت الجزمة للمحل وخدت تلتمية",
    "رجعت السماعة للمتجر واستلمت ٣٠٠ جنيه",
    "رجعت الشنطة للبياع واخدت فلوسي",
    "رجعت الجزمة للمحل وخدت",
  ])("recognizes money back: %s", (text) =>
    expect(readsAsRefund(normalizeArabic(text))).toBe(true),
  );
  it.each([
    "رجعت البيت وخدت تلتمية من أبويا",
    "رجعت الشغل واستلمت المرتب",
    "رجعت لخالد تلتمية",
    "رجعت الجزمة للمحل وخدت قميص بتلتمية",
    "هارجع الجزمة للمحل بكرة",
  ])(
    "does not turn ordinary receipts, replacements or plans into refunds: %s",
    (text) => expect(readsAsRefund(normalizeArabic(text))).toBe(false),
  );
});
