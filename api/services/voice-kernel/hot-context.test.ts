const { selectMock, queryResults } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  queryResults: [] as unknown[][],
}));

vi.mock("../../queries/connection", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("../finance-semantic-layer", () => ({
  getProfileSnapshot: vi.fn(async () => ({
    monthlyIncome: 17000,
    financialGoal: "saving",
    financialPersonality: "balanced",
    salaryDay: 1,
  })),
  getFinanceSummary: vi.fn(async (_ctx, scope) => ({
    period: { label: scope.period === "today" ? "today" : "current_month" },
    totalIncome: scope.period === "today" ? 17000 : 17000,
    totalExpense: scope.period === "today" ? 2337.5 : 659.5,
    netFlow: scope.period === "today" ? 14662.5 : 16340.5,
    transactionCount: scope.period === "today" ? 11 : 4,
    dailyAverageExpense: scope.period === "today" ? 1168.75 : 329.75,
  })),
  getGoalProgress: vi.fn(async () => ({
    goals: [
      {
        id: 9,
        title: "Camera goal",
        targetAmount: 91000.5,
        targetDate: null,
        estimatedMonthlyCapacity: 14662.5,
        estimatedMonthsNeeded: 7,
      },
    ],
  })),
}));

function mockDbChain(): void {
  selectMock.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => queryResults.shift() ?? [],
        }),
      }),
    }),
  }));
}

describe("voice hot context", () => {
  beforeEach(() => {
    selectMock.mockReset();
    queryResults.length = 0;
    mockDbChain();
  });

  it("builds cheap hot context from SQL recents without semantic embedding lookup", async () => {
    const { buildVoiceHotContext, renderVoiceHotContext } = await import("./hot-context");
    queryResults.push(
      [{ content: "old chat capsule about camera", updatedAt: new Date() }],
      [{ content: "semantic memory about mobile plan", updatedAt: new Date() }],
      [{ content: "executed goal action", updatedAt: new Date() }],
    );

    const context = await buildVoiceHotContext({
      userId: 27,
      userType: "local",
      userPlan: "free",
      sessionId: "voice_test",
    });
    const rendered = renderVoiceHotContext(context);

    expect(selectMock).toHaveBeenCalledTimes(3);
    expect(context.recentCapsules).toEqual([
      "semantic memory about mobile plan",
      "old chat capsule about camera",
      "executed goal action",
    ]);
    expect(rendered).toContain("today: expense=2337.5");
    expect(rendered).toContain("net=14662.5");
    expect(rendered).toContain("target=91000.5");
    expect(rendered).not.toContain("expense=2338");
  });
});
