import { describe, expect, it } from "vitest";
import { FactLedger } from "./facts";
import { correctionNote, extractSpokenNumbers, SpokenNumberValidator, teenTensTwins } from "./validator";

function setup(facts: Array<[string, number]>) {
  const ledger = new FactLedger();
  ledger.nextBatch();
  for (const [label, value] of facts) ledger.add({ id: label, label, value, source: "ledger" });
  return { ledger, validator: new SpokenNumberValidator(ledger) };
}

describe("extractSpokenNumbers", () => {
  it("reads money, counts, days and years apart", () => {
    const numbers = extractSpokenNumbers("صرفت تلتمية وعشرين جنيه في تلات أيام، ويوم 25 سنة 2026 كان فيه 20 عملية وبعدين خمسين");
    expect(numbers.map(({ value, money }) => [value, money])).toEqual([
      [320, true], [3, false], [25, false], [2026, false], [20, false], [50, true],
    ]);
  });

  it("marks an approximation", () => {
    expect(extractSpokenNumbers("حوالي تلات آلاف ونص جنيه")[0]).toMatchObject({ value: 3500, approximate: true, money: true });
  });
});

describe("SpokenNumberValidator", () => {
  it("accepts a fact said exactly, rounded or approximately", () => {
    const { validator } = setup([["مصروف النهارده", 320], ["مصروف الدورة", 3456]]);
    expect(validator.addAssistantWords("لحد دلوقتي المسجّل تلتمية وعشرين جنيه، والدورة كلها ")).toBeNull();
    expect(validator.addAssistantWords("حوالي تلات آلاف ونص جنيه لحد النهارده.")).toBeNull();
    expect(validator.endTurn()).toBeNull();
    expect(validator.addAssistantWords("يعني حوالي تلات آلاف جنيه بس.")).toBeNull();
    expect(validator.endTurn()).toBeNull();
  });

  it("catches a wrong number and names the fact it was meant to be", () => {
    const { validator } = setup([["مصروف النهارده", 320]]);
    const mismatch = validator.addAssistantWords("صرفت النهارده خمسمية وعشرين جنيه، أغلبهم أكل.");
    expect(mismatch).toMatchObject({ spoken: 520, intended: { label: "مصروف النهارده", value: 320 } });
    expect(validator.shouldCorrect(mismatch!)).toBe(true);
    expect(correctionNote(mismatch!)).toContain("تلتمية وعشرين");
  });

  it("waits until a number is complete before judging it", () => {
    const { validator } = setup([["مصروف النهارده", 320]]);
    expect(validator.addAssistantWords("المسجّل تلتمية")).toBeNull();
    expect(validator.addAssistantWords(" وعشرين جنيه النهارده")).toBeNull();
  });

  it("records a number with no plausible source without correcting it", () => {
    const { validator } = setup([["مصروف النهارده", 320]]);
    const mismatch = validator.addAssistantWords("وعلى السنة ده حوالي عشرين ألف جنيه تقريبا.");
    expect(mismatch).toMatchObject({ spoken: 20_000, intended: null });
    expect(validator.shouldCorrect(mismatch!)).toBe(false);
  });

  it("does not correct toward a fact that is far from what was said", () => {
    const { validator } = setup([["التقدم في الهدف", 1815]]);
    const mismatch = validator.addAssistantWords("بتحوش خمس آلاف جنيه كل شهر للعربية.");
    expect(mismatch).toMatchObject({ spoken: 5000, intended: null });
    expect(validator.shouldCorrect(mismatch!)).toBe(false);
  });

  it("knows a heard teen from a ten", () => {
    expect(teenTensTwins(15, 50)).toBe(true);
    expect(teenTensTwins(1500, 5000)).toBe(true);
    expect(teenTensTwins(170, 7000)).toBe(false);
    const { validator } = setup([["مصروف المواصلات", 50]]);
    expect(validator.addAssistantWords("صرفت خمستاشر جنيه مواصلات بس.")).toMatchObject({ spoken: 15, intended: { value: 50 } });
  });

  it("lets the assistant repeat what the user said", () => {
    const { validator } = setup([]);
    validator.noteUserWords("دفعت خمسين مواصلات وسبعين فطار");
    expect(validator.addAssistantWords("خمسين مواصلات وسبعين فطار، يعني مية وعشرين. أسجلهم؟")).toMatchObject({ spoken: 120 });
  });

  it("corrects at most once a turn and three times a call", () => {
    const { validator } = setup([["مصروف النهارده", 320]]);
    const first = validator.addAssistantWords("خمسمية وعشرين جنيه النهارده ثم ")!;
    expect(validator.shouldCorrect(first)).toBe(true);
    const second = validator.addAssistantWords("ستمية وعشرين جنيه كمان مرة")!;
    expect(validator.shouldCorrect(second)).toBe(false);
    validator.endTurn();
    for (let i = 0; i < 2; i++) {
      const next = validator.addAssistantWords("خمسمية وعشرين جنيه تاني هنا")!;
      expect(validator.shouldCorrect(next)).toBe(true);
      validator.endTurn();
    }
    const fourth = validator.addAssistantWords("خمسمية وعشرين جنيه تاني هنا")!;
    expect(validator.shouldCorrect(fourth)).toBe(false);
  });
});
