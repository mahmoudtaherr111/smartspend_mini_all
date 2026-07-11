import { planAgentTurn } from "./agent-planner";

describe("plan-first agent runtime", () => {
  it("asks one bounded clarification instead of calling a model for an unknown request", () => {
    const plan = planAgentTurn("ممكن تساعدني؟");

    expect(plan).toMatchObject({
      mode: "clarification",
      dataNeeds: [],
      historyMessages: 0,
      maxProviderCalls: 0,
      clarification: expect.objectContaining({ missing: ["intent"] }),
    });
  });

  it("uses a zero-provider, zero-history plan for an exact financial total", () => {
    const plan = planAgentTurn("صرفت كام النهارده؟");

    expect(plan).toMatchObject({
      mode: "deterministic",
      historyMessages: 0,
      maxProviderCalls: 0,
    });
    expect(plan.dataNeeds.map((need) => need.kind)).toEqual(["finance.summary"]);
  });

  it("allows one compact synthesis only when financial advice needs it", () => {
    const plan = planAgentTurn("حلل مصاريفي واقترح خطة أقلل بيها الصرف");

    expect(plan).toMatchObject({
      mode: "synthesis",
      historyMessages: 2,
      maxProviderCalls: 1,
    });
  });
});
