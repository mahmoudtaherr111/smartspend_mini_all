import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_ONBOARDING_QUESTIONS,
  applyOnboardingAnswer,
  getNextOnboardingQuestion,
} from "./adaptive-question-engine";
import { PROFILE_FIELDS } from "../../contracts/profile-fields";
import { buildDefaultSmartProfile } from "./user-profile-service";

function profile() {
  return buildDefaultSmartProfile({ id: 1, type: "local", name: "Test" });
}

describe("adaptive question engine", () => {
  it("asks the shared profile fields in order, then is complete", () => {
    let current = profile();
    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe("income_level");

    current = applyOnboardingAnswer(current, "income_level", 12000);
    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe("salary_day");

    current = applyOnboardingAnswer(current, "salary_day", 27);
    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.key).toBe("profession");
    expect(getNextOnboardingQuestion(current.onboardingAnswers)?.type).toBe("text");

    current = applyOnboardingAnswer(current, "profession", "مهندسة");
    expect(getNextOnboardingQuestion(current.onboardingAnswers)).toBeNull();
    expect(current.basicInfo.profession).toBe("مهندسة");
    expect(current.profileCompleted).toBe(true);
  });

  it("asks exactly the questions of contracts/profile-fields.ts", () => {
    expect(ADAPTIVE_ONBOARDING_QUESTIONS.map((question) => question.key)).toEqual(
      PROFILE_FIELDS.map((field) => field.key),
    );
    expect(ADAPTIVE_ONBOARDING_QUESTIONS.map((question) => question.text)).toEqual(
      PROFILE_FIELDS.map((field) => field.question.ar),
    );
  });

  it("pairs masculine and feminine quick choices for work so voice calls use the right title", async () => {
    const { honorificFor } = await import("./voice/brain/honorific");
    const professionField = PROFILE_FIELDS.find((field) => field.key === "profession")!;
    const values = professionField.quickChoices.map((choice) => String(choice.value));
    expect(values).toEqual(["مهندس", "مهندسة", "دكتور", "دكتورة", "محاسب", "محاسبة", "مدرس", "مدرسة"]);
    expect(values.map((v) => honorificFor(v))).toEqual([
      "باشمهندس",
      "باشمهندسة",
      "دكتور",
      "دكتورة",
      "أستاذ",
      "أستاذة",
      "أستاذ",
      "أستاذة",
    ]);
  });

  it("no longer asks a removed question, and keeps an old answer to one", () => {
    let current = profile();
    current = applyOnboardingAnswer(current, "smoking", true);
    current = applyOnboardingAnswer(current, "income_level", 8000);
    current = applyOnboardingAnswer(current, "salary_day", null, true);
    current = applyOnboardingAnswer(current, "profession", null, true);
    expect(getNextOnboardingQuestion(current.onboardingAnswers)).toBeNull();
    expect(current.lifestyleInfo.smoking).toBe(true);
    expect(current.onboardingAnswers.smoking.value).toBe(true);
  });

  it("turns the payday on for Home and the calendar, and 0 means no fixed day", () => {
    let current = applyOnboardingAnswer(profile(), "salary_day", 25);
    expect(current.financialInfo.hasFixedSalary).toBe(true);
    expect(current.financialInfo.salaryDay).toBe(25);

    current = applyOnboardingAnswer(current, "salary_day", 0);
    expect(current.financialInfo.hasFixedSalary).toBe(false);
    expect(current.financialInfo.salaryDay).toBeNull();
    expect(current.onboardingAnswers.salary_day.skipped).toBe(false);
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
