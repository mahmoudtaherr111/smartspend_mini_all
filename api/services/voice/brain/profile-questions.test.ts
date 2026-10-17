import { describe, expect, it } from "vitest";
import { callQuestion, checkedAnswer, nextCallQuestion, questionLine } from "./profile-questions";
import { PROFILE_FIELDS } from "../../../../contracts/profile-fields";
import type { AdaptiveQuestion } from "../../adaptive-question-engine";

const now = new Date("2026-09-24T10:00:00Z");

describe("the profile question a call may ask", () => {
  it("asks the Home card's questions in the same order and skips what is answered or declined", () => {
    expect(nextCallQuestion({}, null, now)?.key).toBe(PROFILE_FIELDS[0].key);
    expect(nextCallQuestion({ income_level: { value: 12_000 } }, null, now)?.key).toBe("salary_day");
    expect(nextCallQuestion({ income_level: { skipped: true }, salary_day: { value: 0 } }, null, now)?.key).toBe("profession");
    expect(
      nextCallQuestion({ income_level: { skipped: true }, salary_day: { value: 0 }, profession: { value: "مدرس" } }, null, now),
    ).toBeNull();
  });

  it("never asks a question the card no longer asks, and waits a day after the app asked", () => {
    expect(callQuestion("children_names")).toBeNull();
    expect(callQuestion("smoking")).toBeNull();
    expect(callQuestion("income_sources")).toBeNull();
    expect(nextCallQuestion({}, new Date("2026-09-24T02:00:00Z"), now)).toBeNull();
  });

  it("writes the question with the answers it accepts", () => {
    expect(questionLine(callQuestion("salary_day")!)).toContain("key=salary_day; الإجابة: رقم");
  });
});

describe("checkedAnswer", () => {
  it("reads numbers said in words, refuses an impossible payday and accepts 0 for no fixed day", () => {
    expect(checkedAnswer(callQuestion("income_level")!, "تمن آلاف")).toBe(8_000);
    expect(checkedAnswer(callQuestion("salary_day")!, "خمسة وعشرين")).toBe(25);
    expect(checkedAnswer(callQuestion("salary_day")!, "45")).toBeNull();
    expect(checkedAnswer(callQuestion("salary_day")!, 0)).toBe(0);
  });

  it("maps options by value or label, and yes or no", () => {
    const choice: AdaptiveQuestion = {
      key: "example_choice",
      text: "؟",
      type: "multi_select",
      options: [{ value: "salary", label: "وظيفة / مرتب" }, { value: "freelance", label: "فريلانس / عمل حر" }],
    };
    expect(checkedAnswer(choice, "salary, فريلانس / عمل حر")).toEqual(["salary", "freelance"]);
    expect(checkedAnswer({ ...choice, type: "select" }, "freelance")).toBe("freelance");
    expect(checkedAnswer({ ...choice, type: "select" }, "حاجة مش في القايمة")).toBeNull();
    expect(checkedAnswer({ key: "example_yes_no", text: "؟", type: "boolean" }, "لأ")).toBe(false);
    expect(checkedAnswer({ key: "example_yes_no", text: "؟", type: "boolean" }, "true")).toBe(true);
  });
});
