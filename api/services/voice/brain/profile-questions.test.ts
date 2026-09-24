import { describe, expect, it } from "vitest";
import { callQuestion, checkedAnswer, nextCallQuestion, questionLine } from "./profile-questions";

const now = new Date("2026-09-24T10:00:00Z");

describe("the profile question a call may ask", () => {
  it("starts with income and skips what is answered or declined", () => {
    expect(nextCallQuestion({}, null, now)?.key).toBe("income_level");
    expect(nextCallQuestion({ income_level: { value: 12_000 }, income_sources: { skipped: true } }, null, now)?.key).toBe("app_goal");
  });

  it("asks for payday only with a salary, and debt payments only with debt", () => {
    const base = { income_level: { value: 9_000 }, app_goal: { value: "save_money" }, profession: { value: "مهندس" } };
    expect(nextCallQuestion({ ...base, income_sources: { value: ["salary"] } }, null, now)?.key).toBe("salary_day");
    expect(nextCallQuestion({ ...base, income_sources: { value: ["freelance"] } }, null, now)?.key).toBe("has_debt");
    expect(nextCallQuestion({ ...base, income_sources: { value: ["freelance"] }, has_debt: { value: true } }, null, now)?.key).toBe("debt_monthly");
  });

  it("never asks about family names, pets or smoking, and waits a day after the app asked", () => {
    expect(callQuestion("children_names")).toBeNull();
    expect(callQuestion("smoking")).toBeNull();
    expect(nextCallQuestion({}, new Date("2026-09-24T02:00:00Z"), now)).toBeNull();
  });

  it("writes the question with the answers it accepts", () => {
    expect(questionLine(callQuestion("salary_day")!)).toContain("key=salary_day; الإجابة: رقم");
    expect(questionLine(callQuestion("income_sources")!)).toContain("salary=وظيفة / مرتب");
  });
});

describe("checkedAnswer", () => {
  it("reads numbers said in words and refuses an impossible payday", () => {
    expect(checkedAnswer(callQuestion("income_level")!, "تمن آلاف")).toBe(8_000);
    expect(checkedAnswer(callQuestion("salary_day")!, "خمسة وعشرين")).toBe(25);
    expect(checkedAnswer(callQuestion("salary_day")!, "45")).toBeNull();
  });

  it("maps options by value or label, and yes or no", () => {
    expect(checkedAnswer(callQuestion("income_sources")!, "salary, فريلانس / عمل حر")).toEqual(["salary", "freelance"]);
    expect(checkedAnswer(callQuestion("app_goal")!, "save_money")).toBe("save_money");
    expect(checkedAnswer(callQuestion("app_goal")!, "حاجة مش في القايمة")).toBeNull();
    expect(checkedAnswer(callQuestion("has_debt")!, "لأ")).toBe(false);
    expect(checkedAnswer(callQuestion("has_debt")!, "true")).toBe(true);
  });
});
