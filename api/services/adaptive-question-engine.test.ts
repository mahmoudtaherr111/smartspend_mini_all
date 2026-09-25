import { describe, expect, it } from "vitest";
import {
  applyOnboardingAnswer,
  getNextOnboardingQuestion,
} from "./adaptive-question-engine";
import { buildDefaultSmartProfile } from "./user-profile-service";

function profile() {
  return buildDefaultSmartProfile({ id: 1, type: "local", name: "Test" });
}

describe("adaptive question engine", () => {
  it("starts with income and follows the family path", () => {
    let current = profile();
    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe(
      "income_level",
    );

    current = applyOnboardingAnswer(current, "income_level", 12000);
    current = applyOnboardingAnswer(current, "income_sources", ["salary"]);
    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe(
      "salary_day",
    );

    current = applyOnboardingAnswer(current, "salary_day", 1);
    current = applyOnboardingAnswer(current, "app_goal", "organize_expenses");
    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe(
      "children",
    );

    current = applyOnboardingAnswer(current, "children", true);
    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe(
      "children_count",
    );
  });

  it("uses lifestyle path when there is no family responsibility", () => {
    let current = profile();
    current = applyOnboardingAnswer(current, "income_level", 8000);
    current = applyOnboardingAnswer(current, "income_sources", ["freelance"]);

    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe(
      "app_goal",
    );

    current = applyOnboardingAnswer(current, "app_goal", "organize_expenses");
    current = applyOnboardingAnswer(current, "children", false);

    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe(
      "living_situation",
    );
  });

  it("supports skip and edit without losing answer metadata", () => {
    let current = profile();
    current = applyOnboardingAnswer(current, "income_level", null, true);
    expect(current.onboardingAnswers.income_level.skipped).toBe(true);

    const answeredAt = current.onboardingAnswers.income_level.answeredAt;
    current = applyOnboardingAnswer(current, "income_level", 9000, false);
    expect(current.financialInfo.averageMonthlyIncome).toBe(9000);
    expect(current.onboardingAnswers.income_level.answeredAt).toBe(answeredAt);
    expect(current.onboardingAnswers.income_level.skipped).toBe(false);
  });
});

describe("people named in onboarding", () => {
  it("names each child, sibling and parent with the question's relationship", async () => {
    const { namedPeopleOfAnswer } = await import("./adaptive-question-engine");
    expect(namedPeopleOfAnswer("children_names", ["يوسف", "مريم", "يوسف", "م"])).toEqual([
      { name: "يوسف", relationship: "ابن/ابنة" },
      { name: "مريم", relationship: "ابن/ابنة" },
    ]);
    expect(namedPeopleOfAnswer("partner_name", "سارة")).toEqual([{ name: "سارة", relationship: "زوج/زوجة" }]);
    expect(namedPeopleOfAnswer("regular_contacts", "احمد، كريم")).toHaveLength(2);
  });
  it("names nobody for a question that is not about people", async () => {
    const { namedPeopleOfAnswer } = await import("./adaptive-question-engine");
    expect(namedPeopleOfAnswer("smoking", "yes")).toEqual([]);
  });
});
