import { buildProactiveInsightsFromSnapshots } from "./proactive-insights";

describe("proactive insights", () => {
  it("detects spending spikes without calling an LLM", () => {
    const insights = buildProactiveInsightsFromSnapshots([
      {
        month: "2026-06",
        totalIncome: "10000",
        totalExpense: "9000",
        netFlow: "1000",
      },
      {
        month: "2026-05",
        totalIncome: "10000",
        totalExpense: "6000",
        netFlow: "4000",
      },
    ]);

    expect(insights.map((item) => item.id)).toContain("expense_spike");
    expect(insights.map((item) => item.id)).toContain("income_burn_rate");
    expect(insights[0].artifact.type).toBe("text_block");
    expect(insights.flatMap((item) => item.facts).some((fact) => fact.label === "change_percent")).toBe(true);
  });

  it("detects improved spending and positive net flow", () => {
    const insights = buildProactiveInsightsFromSnapshots([
      {
        month: "2026-06",
        totalIncome: "10000",
        totalExpense: "5000",
        netFlow: "5000",
      },
      {
        month: "2026-05",
        totalIncome: "10000",
        totalExpense: "7000",
        netFlow: "3000",
      },
    ]);

    expect(insights.map((item) => item.id)).toEqual(
      expect.arrayContaining(["expense_improved", "positive_net_flow"]),
    );
  });
});
