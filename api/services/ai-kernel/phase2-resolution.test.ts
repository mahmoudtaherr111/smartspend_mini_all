import type { DataNeed, ResolvedFact } from "./types";
import { runAIKernelActive, runAIKernelShadow } from "./index";
import { resolveKernelDataNeeds } from "../finance-semantic-layer";
import { callChatCompletionAPI } from "../../lib/deepseek-client";

vi.mock("../../lib/deepseek-client", () => ({
  callChatCompletionAPI: vi.fn(async () => ({
    text: "رد من LLM",
    tokensUsed: 90,
    model: "mock-llm",
  })),
}));

vi.mock("../finance-semantic-layer", () => ({
  resolveKernelDataNeeds: vi.fn(async (_ctx: unknown, dataNeeds: DataNeed[]) => ({
    facts: [
      {
        id: "need_1_finance_summary:total_expense",
        dataNeedId: "need_1_finance_summary",
        label: "total_expense",
        value: 350,
        source: "finance.summary",
        confidence: 1,
      },
    ],
    artifacts: [],
    errors: [],
    cacheHits: ["finance_ai:1:oauth:summary"],
    dataNeeds,
  })),
}));

vi.mock("../ai-memory", () => ({
  resolveMemoryDataNeeds: vi.fn(async () => ({
    facts: [],
    artifacts: [],
    errors: [],
    cacheHits: [],
    handledNeeds: [],
  })),
}));

describe("AI kernel phase 2 data resolution", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(resolveKernelDataNeeds).mockClear();
    vi.mocked(callChatCompletionAPI).mockClear();
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("resolves compiled data needs into facts in shadow mode", async () => {
    const response = await runAIKernelShadow({
      requestId: "phase2_trace",
      channel: "chat",
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      message: "صرفت كام النهارده؟",
      metadata: { legacyPath: "processAIChatMessage" },
    });

    expect(resolveKernelDataNeeds).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, userType: "oauth" }),
      expect.arrayContaining([expect.objectContaining({ kind: "finance.summary" })]),
    );
    expect(response.facts).toHaveLength(1);
    expect(response.facts[0]).toMatchObject({
      label: "total_expense",
      value: 350,
      source: "finance.summary",
    });
    expect(response.debug).toMatchObject({
      resolvedFacts: 1,
      resolvedArtifacts: 0,
      resolverErrors: [],
    });
  });

  it("answers simple finance questions from resolved facts in active mode without tools", async () => {
    const response = await runAIKernelActive(
      {
        requestId: "phase2_active",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "صرفت كام النهارده؟",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(response.traceId).toBe("phase2_active");
    expect(response.content).toContain("٣٥٠");
    expect(response.debug).toMatchObject({
      mode: "active",
      deterministic: true,
      llmCalls: 0,
      retrievalPolicy: {
        embedding: "skipped",
        reason: "structured_sql_or_cached_facts_do_not_need_embedding",
      },
      cacheRuntime: expect.objectContaining({
        backend: expect.any(String),
        redisConfigured: expect.any(Boolean),
        redisConnected: expect.any(Boolean),
        memoryEntries: expect.any(Number),
      }),
    });
  });

  it("answers month comparisons from structured facts without an LLM call", async () => {
    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "comparison:current_period",
          dataNeedId: "need_1_finance_period_comparison",
          label: "current_period",
          value: "يونيو 2026",
          source: "finance.period_comparison",
          confidence: 1,
        },
        {
          id: "comparison:previous_period",
          dataNeedId: "need_1_finance_period_comparison",
          label: "previous_period",
          value: "مايو 2026",
          source: "finance.period_comparison",
          confidence: 1,
        },
        {
          id: "comparison:current_total_expense",
          dataNeedId: "need_1_finance_period_comparison",
          label: "current_total_expense",
          value: 2165.5,
          source: "finance.period_comparison",
          confidence: 1,
        },
        {
          id: "comparison:previous_total_expense",
          dataNeedId: "need_1_finance_period_comparison",
          label: "previous_total_expense",
          value: 0,
          source: "finance.period_comparison",
          confidence: 1,
        },
        {
          id: "comparison:expense_difference",
          dataNeedId: "need_1_finance_period_comparison",
          label: "expense_difference",
          value: 2165.5,
          source: "finance.period_comparison",
          confidence: 1,
        },
        {
          id: "comparison:expense_change_percent",
          dataNeedId: "need_1_finance_period_comparison",
          label: "expense_change_percent",
          value: null,
          source: "finance.period_comparison",
          confidence: 1,
        },
        {
          id: "comparison:current_net_flow",
          dataNeedId: "need_1_finance_period_comparison",
          label: "current_net_flow",
          value: 14834.5,
          source: "finance.period_comparison",
          confidence: 1,
        },
        {
          id: "comparison:previous_net_flow",
          dataNeedId: "need_1_finance_period_comparison",
          label: "previous_net_flow",
          value: 0,
          source: "finance.period_comparison",
          confidence: 1,
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase2_comparison_active",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "قارن مصاريفي الشهر ده بالشهر اللي فات",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(response.content).toContain("يونيو 2026");
    expect(response.content).toContain("مايو 2026");
    expect(response.content).toContain("٢٬١٦٥٫٥");
    expect(response.content).toContain("مفيش مصروفات مسجلة");
    expect(response.debug).toMatchObject({
      deterministic: true,
      llmCalls: 0,
    });
  });

  it("answers category total questions with supporting transaction evidence without an LLM call", async () => {
    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "category:period",
          dataNeedId: "need_1_finance_category_total",
          label: "period",
          value: "يونيو 2026",
          source: "finance.category_total",
          confidence: 1,
        },
        {
          id: "category:category",
          dataNeedId: "need_1_finance_category_total",
          label: "category",
          value: "food",
          source: "finance.category_total",
          confidence: 1,
        },
        {
          id: "category:total",
          dataNeedId: "need_1_finance_category_total",
          label: "category_total_expense",
          value: 550.5,
          source: "finance.category_total",
          confidence: 1,
        },
        {
          id: "category:count",
          dataNeedId: "need_1_finance_category_total",
          label: "transaction_count",
          value: 3,
          source: "finance.category_total",
          confidence: 1,
        },
        {
          id: "transaction:1",
          dataNeedId: "need_2_finance_transactions",
          label: "transaction_1",
          value: "كارفور خضار ولحمة",
          source: "finance.transactions",
          confidence: 1,
          evidence: [{ id: 10, label: "كارفور خضار ولحمة", value: 375 }],
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase2_category_active",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "صرفت كام أكل الشهر ده؟ وهل كارفور محسوب؟",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(response.content).toContain("أكل وشرب");
    expect(response.content).toContain("٥٥٠٫٥");
    expect(response.content).toContain("كارفور خضار ولحمة");
    expect(response.debug).toMatchObject({
      deterministic: true,
      llmCalls: 0,
    });
  });

  it("shows up to five supporting transactions when the user asks for counted evidence", async () => {
    const transactionFacts: ResolvedFact[] = Array.from({ length: 5 }, (_, index) => ({
      id: `transaction:${index + 1}`,
      dataNeedId: "need_2_finance_transactions",
      label: `transaction_${index + 1}`,
      value: `Merchant ${index + 1}`,
      source: "finance.transactions",
      confidence: 1,
      evidence: [{ id: index + 1, label: `Merchant ${index + 1}`, value: 100 + index }],
    }));

    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "category:period",
          dataNeedId: "need_1_finance_category_total",
          label: "period",
          value: "June 2026",
          source: "finance.category_total",
          confidence: 1,
        },
        {
          id: "category:category",
          dataNeedId: "need_1_finance_category_total",
          label: "category",
          value: "food",
          source: "finance.category_total",
          confidence: 1,
        },
        {
          id: "category:total",
          dataNeedId: "need_1_finance_category_total",
          label: "category_total_expense",
          value: 510,
          source: "finance.category_total",
          confidence: 1,
        },
        {
          id: "category:count",
          dataNeedId: "need_1_finance_category_total",
          label: "transaction_count",
          value: 5,
          source: "finance.category_total",
          confidence: 1,
        },
        ...transactionFacts,
      ],
      artifacts: [],
      errors: [],
      cacheHits: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase2_category_evidence_five_rows",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "صرفت كام أكل الشهر ده بالظبط؟ وهات العمليات اللي اتحسبت",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(response.content).toContain("Merchant 1");
    expect(response.content).toContain("Merchant 5");
    expect(response.debug).toMatchObject({
      deterministic: true,
      llmCalls: 0,
    });
  });

  it("answers classification explanation questions from transaction evidence without an LLM call", async () => {
    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "tx:period",
          dataNeedId: "need_1_finance_transactions",
          label: "period",
          value: "يونيو 2026",
          source: "finance.transactions",
          confidence: 1,
        },
        {
          id: "tx:total",
          dataNeedId: "need_1_finance_transactions",
          label: "total_matched",
          value: 1,
          source: "finance.transactions",
          confidence: 1,
        },
        {
          id: "tx:returned",
          dataNeedId: "need_1_finance_transactions",
          label: "returned",
          value: 1,
          source: "finance.transactions",
          confidence: 1,
        },
        {
          id: "tx:transaction_1",
          dataNeedId: "need_1_finance_transactions",
          label: "transaction_1",
          value: "2026-06-10 food 375",
          source: "finance.transactions",
          confidence: 1,
          evidence: [{ id: 7, label: "كارفور خضار ولحمة", value: 375 }],
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase2_classification_active",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "كارفور الخضار واللحمة اتحسب أكل ولا تسوق؟ ولو غلط أعمل إيه؟",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(response.intent).toMatchObject({
      kind: "finance_analysis",
      reason: "classification_explanation_match",
    });
    expect(response.dataNeeds.map((need) => need.kind)).toEqual(["finance.classification_trace", "finance.transactions", "finance.breakdown", "finance.category_inclusion"]);
    expect(response.content).toContain("الأقرب");
    expect(response.content).toContain("كارفور خضار ولحمة");
    expect(response.debug).toMatchObject({
      deterministic: true,
      llmCalls: 0,
    });
  });

  it("answers top-category analysis from breakdown facts without an LLM call", async () => {
    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "breakdown:period",
          dataNeedId: "need_2_finance_breakdown",
          label: "period",
          value: "يونيو 2026",
          source: "finance.breakdown",
          confidence: 1,
        },
        {
          id: "breakdown:total",
          dataNeedId: "need_2_finance_breakdown",
          label: "total_expense",
          value: 2165.5,
          source: "finance.breakdown",
          confidence: 1,
        },
        {
          id: "breakdown:food",
          dataNeedId: "need_2_finance_breakdown",
          label: "top_1_food",
          value: 550.5,
          source: "finance.breakdown",
          confidence: 1,
          evidence: [{ id: "food", label: "count", value: 3 }],
        },
        {
          id: "breakdown:transport",
          dataNeedId: "need_2_finance_breakdown",
          label: "top_2_transport",
          value: 420,
          source: "finance.breakdown",
          confidence: 1,
          evidence: [{ id: "transport", label: "count", value: 2 }],
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase2_top_categories_active",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "إيه أعلى الفئات الشهر ده؟",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(response.content).toContain("أعلى البنود");
    expect(response.content).toContain("أكل وشرب");
    expect(response.content).toContain("مواصلات");
    expect(response.content).toContain("٢٬١٦٥٫٥");
    expect(response.debug).toMatchObject({
      deterministic: true,
      llmCalls: 0,
    });
  });

  it("answers goal progress questions from goal progress facts without an LLM call", async () => {
    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "goals:count",
          dataNeedId: "need_1_finance_goal_progress",
          label: "active_goal_count",
          value: 1,
          source: "finance.goal_progress",
          confidence: 1,
        },
        {
          id: "goals:title",
          dataNeedId: "need_1_finance_goal_progress",
          label: "goal_1_title",
          value: "هدف شراء عربية",
          source: "finance.goal_progress",
          confidence: 1,
        },
        {
          id: "goals:target",
          dataNeedId: "need_1_finance_goal_progress",
          label: "goal_1_target_amount",
          value: 77777,
          source: "finance.goal_progress",
          confidence: 1,
        },
        {
          id: "goals:capacity",
          dataNeedId: "need_1_finance_goal_progress",
          label: "goal_1_estimated_monthly_capacity",
          value: 14834.5,
          source: "finance.goal_progress",
          confidence: 1,
        },
        {
          id: "goals:months",
          dataNeedId: "need_1_finance_goal_progress",
          label: "goal_1_estimated_months_needed",
          value: 6,
          source: "finance.goal_progress",
          confidence: 1,
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase2_goal_progress_active",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "وصلت كام في أهداف الادخار بتاعتي؟",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(response.dataNeeds.map((need) => need.kind)).toEqual(["finance.goal_progress"]);
    expect(response.content).toContain("أهداف ادخار نشطة");
    expect(response.content).toContain("هدف شراء عربية");
    expect(response.content).toContain("٧٧٬٧٧٧");
    expect(response.content).toContain("لا يسجل مبلغ محوش فعلي");
    expect(response.debug).toMatchObject({
      deterministic: true,
      llmCalls: 0,
    });
  });

  it("does not send transaction evidence to advice LLM prompts", async () => {
    const rogueTransactions: ResolvedFact[] = Array.from({ length: 12 }, (_, index) => ({
      id: `tx:${index + 1}`,
      dataNeedId: "rogue_finance_transactions",
      label: `transaction_${index + 1}`,
      value: `merchant_${index + 1} ${100 + index}`,
      source: "finance.transactions",
      confidence: 1,
      evidence: [{ id: index + 1, label: `merchant_${index + 1}`, value: 100 + index }],
    }));

    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "summary:period",
          dataNeedId: "need_1_finance_summary",
          label: "period",
          value: "يونيو 2026",
          source: "finance.summary",
          confidence: 1,
        },
        {
          id: "summary:expense",
          dataNeedId: "need_1_finance_summary",
          label: "total_expense",
          value: 2337.5,
          source: "finance.summary",
          confidence: 1,
        },
        ...rogueTransactions,
      ],
      artifacts: [],
      errors: [],
      cacheHits: ["finance_cache:hit:memory:summary"],
      handledNeeds: [],
    });

    await runAIKernelActive(
      {
        requestId: "phase2_advice_prompt_no_raw_transactions",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "انصحني ازاي اوفر من مصاريفي الشهر ده",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(callChatCompletionAPI).toHaveBeenCalledTimes(1);
    const request = vi.mocked(callChatCompletionAPI).mock.calls[0]?.[2];
    const promptText = request?.messages.map((message) => message.content).join("\n") ?? "";
    expect(promptText).toContain("finance.summary");
    expect(promptText).not.toContain("finance.transactions");
    expect(promptText).not.toContain("merchant_1");
    expect(promptText).not.toContain("transaction_1");
  });

  it("caps transaction evidence in non-advice LLM prompts to five rows", async () => {
    const transactionFacts: ResolvedFact[] = [
      {
        id: "tx:period",
        dataNeedId: "need_1_finance_transactions",
        label: "period",
        value: "يونيو 2026",
        source: "finance.transactions",
        confidence: 1,
      },
      {
        id: "tx:total",
        dataNeedId: "need_1_finance_transactions",
        label: "total_matched",
        value: 12,
        source: "finance.transactions",
        confidence: 1,
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `tx:${index + 1}`,
        dataNeedId: "need_1_finance_transactions",
        label: `transaction_${index + 1}`,
        value: `merchant_${index + 1} ${100 + index}`,
        source: "finance.transactions" as const,
        confidence: 1,
        evidence: [{ id: index + 1, label: `merchant_${index + 1}`, value: 100 + index }],
      })),
    ];

    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: transactionFacts,
      artifacts: [],
      errors: [],
      cacheHits: ["finance_cache:hit:memory:transactions"],
      handledNeeds: [],
    });

    await runAIKernelActive(
      {
        requestId: "phase2_prompt_transaction_cap",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "حلل مصاريفي الشهر ده بالتفصيل",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(callChatCompletionAPI).toHaveBeenCalledTimes(1);
    const request = vi.mocked(callChatCompletionAPI).mock.calls[0]?.[2];
    const promptText = request?.messages.map((message) => message.content).join("\n") ?? "";
    expect(promptText).toContain("transaction_5");
    expect(promptText).toContain("merchant_5");
    expect(promptText).not.toContain("transaction_6");
    expect(promptText).not.toContain("merchant_6");
    expect(promptText).not.toContain("transaction_12");
    expect(promptText).not.toContain("merchant_12");
  });

  it("blocks LLM numeric claims that are not supported by resolved facts", async () => {
    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "summary:expense",
          dataNeedId: "need_1_finance_summary",
          label: "total_expense",
          value: 350,
          source: "finance.summary",
          confidence: 1,
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: ["finance_cache:hit:memory:summary"],
      handledNeeds: [],
    });
    vi.mocked(callChatCompletionAPI).mockResolvedValueOnce({
      text: "مصاريفك 350 جنيه، وممكن توفر 999 جنيه الشهر ده.",
      tokensUsed: 120,
      model: "mock-llm",
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase2_numeric_risk",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "عايز احوش 10000 جنيه للعربية",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "accounts/fireworks/models/deepseek-v4-flash",
        maxTokens: 200,
      },
    );

    expect(callChatCompletionAPI).toHaveBeenCalledTimes(1);
    expect(response.content).toContain("350");
    expect(response.content).not.toContain("999");
    expect(response.debug).toMatchObject({
      llmCalls: 1,
      hallucinationRisk: "low",
      numericAccuracy: expect.objectContaining({
        missing: [],
      }),
      numericGuard: {
        applied: true,
        blockedNumbers: ["999"],
        originalAccuracy: 0.5,
      },
    });
  });
});
