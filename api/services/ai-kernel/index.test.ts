import { runAIKernelShadow } from "./index";

describe("AI kernel shadow runner", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("builds a shadow response without LLM calls", async () => {
    const response = await runAIKernelShadow({
      requestId: "trace_test",
      channel: "chat",
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      message: "صرفت كام في الاكل الشهر ده؟",
      conversationId: 42,
      conversationHistory: [{ role: "assistant", content: "تمام، اسألني عن مصاريفك." }],
      metadata: { legacyPath: "processAIChatMessage", resolveDataNeeds: false },
    });

    expect(response.traceId).toBe("trace_test");
    expect(response.content).toBe("");
    expect(response.intent.kind).toBe("finance_query");
    expect(response.dataNeeds[0]).toMatchObject({
      kind: "finance.category_total",
      priority: "hot",
      scope: { period: "current_month", category: "food" },
    });
    expect(response.debug).toMatchObject({
      mode: "shadow",
      legacyPath: "processAIChatMessage",
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "[AI Kernel Trace]",
      expect.stringContaining('"route":"finance_query"'),
    );
  });
});
