import { buildVoiceSystemPrompt } from "./voice-prompt";

describe("voice system prompt contract", () => {
  it("requires small tools, explicit confirmation, and no invented financial numbers", () => {
    const prompt = buildVoiceSystemPrompt({
      today: {
        period: "today",
        totalIncome: 1000,
        totalExpense: 250,
        netFlow: 750,
        transactionCount: 3,
        dailyAverageExpense: 250,
      },
      month: {
        period: "current_month",
        totalIncome: 10000,
        totalExpense: 2500,
        netFlow: 7500,
        transactionCount: 30,
        dailyAverageExpense: 250,
      },
      activeGoals: [],
      recentCapsules: ["coffee sleep plan"],
      errors: [],
    });

    expect(prompt).toContain("call the smallest matching tool first");
    expect(prompt).toContain("Never invent financial numbers");
    expect(prompt).toContain("create a draft action");
    expect(prompt).toContain("ask for explicit confirmation");
    expect(prompt).toContain("High risk actions must return UI confirmation");
    expect(prompt).toContain("HOT_FACTS");
    expect(prompt).toContain("today:");
    expect(prompt).toContain("month:");
  });
});
