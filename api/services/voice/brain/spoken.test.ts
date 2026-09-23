import { describe, expect, it } from "vitest";
import { parseArabicNumbers } from "../../../lib/arabic-number-parser";
import { roundForSpeech, spellAmount, spellDays, spellInteger, spellPercent, spellRelativeDay } from "./spoken";

/** The numbers the app's own parser reads back from a phrase. */
const readBack = (text: string): number[] =>
  (parseArabicNumbers(text).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

describe("spellInteger", () => {
  it("says numbers the Egyptian way", () => {
    expect(spellInteger(320)).toBe("تلتمية وعشرين");
    expect(spellInteger(15)).toBe("خمستاشر");
    expect(spellInteger(56)).toBe("ستة وخمسين");
    expect(spellInteger(1250)).toBe("ألف وميتين وخمسين");
    expect(spellInteger(8400)).toBe("تمن آلاف وربعمية");
    expect(spellInteger(3456)).toBe("تلات آلاف وربعمية وستة وخمسين");
    expect(spellInteger(15000)).toBe("خمستاشر ألف");
    expect(spellInteger(100000)).toBe("ميت ألف");
    expect(spellInteger(500000)).toBe("خمسميت ألف");
    expect(spellInteger(2000000)).toBe("مليونين");
  });

  it("parses back to the same value for every amount people say", () => {
    const samples: number[] = [];
    for (let n = 2; n <= 2000; n++) samples.push(n);
    for (let n = 2000; n <= 1_000_000; n += 997) samples.push(n);
    for (const n of [10_000, 11_000, 99_999, 100_001, 250_750, 999_999, 1_000_000, 1_500_000, 12_345_678]) samples.push(n);
    const failures = samples.filter((n) => {
      const values = readBack(spellInteger(n));
      return values.length !== 1 || values[0] !== n;
    });
    expect(failures).toEqual([]);
  });
});

describe("spellAmount", () => {
  it("keeps amounts under a thousand exact", () => {
    expect(spellAmount(320)).toEqual({ text: "تلتمية وعشرين", value: 320, approximate: false });
    expect(spellAmount(12.75).text).toBe("حوالي تلاتاشر");
  });

  it("rounds larger amounts and says so", () => {
    expect(spellAmount(3456)).toEqual({ text: "حوالي تلات آلاف ونص", value: 3500, approximate: true });
    expect(spellAmount(15240)).toEqual({ text: "حوالي خمستاشر ألف", value: 15000, approximate: true });
    expect(spellAmount(2500)).toEqual({ text: "ألفين ونص", value: 2500, approximate: false });
    expect(spellAmount(8420).text).toBe("حوالي تمن آلاف وربعمية");
  });

  it("says the exact amount when asked, piastres included", () => {
    expect(spellAmount(3456, { exact: true }).text).toBe("تلات آلاف وربعمية وستة وخمسين");
    expect(spellAmount(12.75, { exact: true }).text).toBe("اتناشر جنيه وخمسة وسبعين قرش");
    expect(spellAmount(7.5, { exact: true }).text).toBe("سبعة ونص");
  });

  it("names a value the parser reads back, rounded or exact", () => {
    const amounts = [15, 99, 101, 250, 999, 1001, 1500, 2750, 9_950, 10_250, 47_800, 123_456, 2_345_678];
    for (const amount of amounts) {
      const rounded = spellAmount(amount);
      expect(readBack(rounded.text)).toEqual([rounded.value]);
      expect(readBack(spellAmount(amount, { exact: true }).text)).toEqual([amount]);
    }
  });
});

describe("roundForSpeech", () => {
  it("uses a step that grows with the amount", () => {
    expect(roundForSpeech(999)).toEqual({ value: 999, approximate: false, step: 1 });
    expect(roundForSpeech(3456)).toMatchObject({ value: 3500, approximate: true, step: 100 });
    expect(roundForSpeech(15_240)).toMatchObject({ value: 15_000, step: 500 });
    expect(roundForSpeech(123_456)).toMatchObject({ value: 123_000, step: 1000 });
  });
});

describe("spellPercent", () => {
  it("prefers the fraction people say", () => {
    expect(spellPercent(25)).toBe("ربع");
    expect(spellPercent(24)).toBe("حوالي ربع");
    expect(spellPercent(50)).toBe("نص");
    expect(spellPercent(12)).toBe("اتناشر في المية");
  });
});

describe("days", () => {
  it("counts days with the right noun form", () => {
    expect(spellDays(1)).toBe("يوم واحد");
    expect(spellDays(2)).toBe("يومين");
    expect(spellDays(9)).toBe("تسع أيام");
    expect(spellDays(11)).toBe("حداشر يوم");
  });

  it("says a date relative to today", () => {
    expect(spellRelativeDay("2026-09-22", "2026-09-22")).toBe("النهارده");
    expect(spellRelativeDay("2026-09-21", "2026-09-22")).toBe("امبارح");
    expect(spellRelativeDay("2026-10-01", "2026-09-22")).toBe("كمان تسع أيام");
    expect(spellRelativeDay("2026-09-12", "2026-09-22")).toBe("من عشر أيام");
  });
});
