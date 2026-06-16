import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("monthly report prompt guards", () => {
  const source = readFileSync(resolve(process.cwd(), "api/ai-router.ts"), "utf8");

  it("hard-caps individual transaction evidence sent to report prompts", () => {
    expect(source).toContain("const MONTHLY_REPORT_TRANSACTION_EVIDENCE_LIMIT = 4");
    expect(source).toContain("Math.min(");
    expect(source).toContain("MONTHLY_REPORT_TRANSACTION_EVIDENCE_LIMIT");
    expect(source).toContain("LIMITED_TRANSACTION_EVIDENCE");
  });

  it("does not instruct the report model to analyze every raw transaction", () => {
    expect(source).not.toContain("كل فئة فرعية وكل عملية فردية");
    expect(source).not.toContain("اذكرها بالاسم");
    expect(source).toContain("لا تستخدم raw transactions في الرد");
    expect(source).toContain("بحد أقصى ${MONTHLY_REPORT_TRANSACTION_EVIDENCE_LIMIT} أمثلة داعمة");
  });

  it("formats cached finance period dates without assuming Date instances", () => {
    expect(source).toContain("const periodDateLabel = (value: Date | string | number)");
    expect(source).toContain("value instanceof Date");
    expect(source).toContain("summary.period.startDate as Date | string | number");
    expect(source).toContain("summary.period.endDate as Date | string | number");
  });
});
