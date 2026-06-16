import { createGoalPayloadFromMessage, isGoalCreateRequest } from "./goal-create";

describe("goal.create request parser", () => {
  it("creates a draft only when goal, amount, and action words exist", () => {
    expect(isGoalCreateRequest("عايز احوش 100 الف للعربية")).toBe(false);
    expect(isGoalCreateRequest("حطلي هدف احوش 100 الف عشان العربية")).toBe(true);
  });

  it("extracts title, target amount, and rough target date", () => {
    const payload = createGoalPayloadFromMessage("اعمل هدف احوش 100 الف عشان اجيب عربية خلال سنة");

    expect(payload).toMatchObject({
      title: "هدف شراء عربية",
      targetAmount: 100000,
    });
    expect(payload?.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("extracts arbitrary purchase purposes instead of falling back to a generic title", () => {
    const payload = createGoalPayloadFromMessage("حطلي هدف احوش 80 الف عشان اجيب لابتوب خلال 10 شهور");

    expect(payload).toMatchObject({
      title: "هدف شراء لابتوب",
      targetAmount: 80000,
    });
  });
});
