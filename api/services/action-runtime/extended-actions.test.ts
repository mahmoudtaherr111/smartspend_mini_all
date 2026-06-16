import {
  createBudgetPayloadFromMessage,
  createBudgetSuggestionFromGoal,
  createExpensePayloadFromMessage,
  createExpenseRecategorizePayloadFromMessage,
  createPhase8PayloadFromMessage,
  createGoalStopPayloadFromMessage,
  createGoalUpdatePayloadFromMessage,
  createProfileUpdatePayloadFromMessage,
  createWalletPayloadFromMessage,
  createWalletUpdatePayloadFromMessage,
} from "./extended-actions";

describe("phase 8 action parsers", () => {
  it("creates a budget action payload from natural language", () => {
    expect(createBudgetPayloadFromMessage("حط ميزانية أكل 3000 جنيه")).toMatchObject({
      category: "food",
      monthlyLimit: 3000,
    });
  });

  it("classifies common drink expenses as food", () => {
    expect(createExpensePayloadFromMessage("سجل عندك 63 جنيه عصير من محل فريش النهارده")).toMatchObject({
      amount: 63,
      category: "food",
      placeHint: "محل فريش",
    });
  });

  it("creates a profile update payload for income changes", () => {
    expect(createProfileUpdatePayloadFromMessage("غير دخلي الشهري إلى 15000")).toEqual({
      section: "financialInfo",
      patch: { averageMonthlyIncome: 15000 },
    });
  });

  it("creates wallet payloads carefully with card metadata", () => {
    expect(createWalletPayloadFromMessage("ضيف فيزا CIB آخر 1234 رصيد 5000")).toMatchObject({
      provider: "CIB",
      lastFourDigits: "1234",
      balance: "5000",
    });
  });

  it("does not turn card linking help questions into wallet drafts", () => {
    expect(createWalletPayloadFromMessage("ازاي اربط الفيزا بالرسائل SMS؟")).toBeNull();
    expect(createPhase8PayloadFromMessage("ازاي اربط الفيزا بالرسائل SMS؟")).toBeNull();
  });

  it("creates undo and wallet drafts through the unified parser", () => {
    expect(createPhase8PayloadFromMessage("ارجع آخر عملية")).toMatchObject({
      actionName: "action.undo",
      payload: {},
    });

    expect(createPhase8PayloadFromMessage("اربط كارت فيزا آخر 4321")).toMatchObject({
      actionName: "wallet.create",
      payload: expect.objectContaining({ lastFourDigits: "4321" }),
    });
  });

  it("creates explicit update drafts for wider confirmed actions", () => {
    expect(createGoalUpdatePayloadFromMessage("update goal #12 amount 150000 title: Car Fund")).toMatchObject({
      goalId: 12,
      title: "Car Fund",
      targetAmount: 150000,
    });

    expect(createGoalStopPayloadFromMessage("cancel goal #12")).toMatchObject({
      goalId: 12,
    });

    expect(createExpenseRecategorizePayloadFromMessage("change expense #44 category to food")).toMatchObject({
      expenseId: 44,
      category: "food",
    });

    expect(createWalletUpdatePayloadFromMessage("update wallet #8 balance 2500 last 4321")).toMatchObject({
      walletId: 8,
      balance: "2500.00",
      lastFourDigits: "4321",
    });
  });

  it("routes explicit update requests through the unified action parser", () => {
    expect(createPhase8PayloadFromMessage("cancel goal #9")).toMatchObject({
      actionName: "goal.stop",
      payload: expect.objectContaining({ goalId: 9 }),
    });

    expect(createPhase8PayloadFromMessage("change expense #2 category to transport")).toMatchObject({
      actionName: "expense.recategorize",
      payload: expect.objectContaining({ expenseId: 2, category: "transport" }),
    });
  });

  it("suggests a monthly saving budget after goal creation", () => {
    expect(
      createBudgetSuggestionFromGoal({
        title: "هدف العربية",
        targetAmount: 12000,
      }),
    ).toMatchObject({
      title: "ميزانية ادخار: هدف العربية",
      category: "saving",
      monthlyLimit: 1000,
    });
  });
});
