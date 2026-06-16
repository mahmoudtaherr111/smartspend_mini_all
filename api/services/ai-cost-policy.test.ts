import {
  buildDeterministicFallbackEmbedding,
  evaluateRetrievalQuality,
  fallbackVectorSearch,
  resolveAICostPolicy,
  resolveAIRollout,
  summarizeAICostMetrics,
  validateNumbersAgainstFacts,
} from "./ai-cost-policy";
import type { ResolvedFact } from "./ai-kernel/types";

describe("AI cost policy", () => {
  it("keeps one tool round by default and allows two only for complex chat intents", () => {
    expect(
      resolveAICostPolicy({
        channel: "chat",
        plan: "free",
        intentKind: "finance_query",
      }).maxToolRounds,
    ).toBe(1);

    expect(
      resolveAICostPolicy({
        channel: "chat",
        plan: "free",
        intentKind: "goal_planning",
      }).maxToolRounds,
    ).toBe(2);

    expect(
      resolveAICostPolicy({
        channel: "voice",
        plan: "ultra",
        intentKind: "finance_analysis",
      }).maxToolRounds,
    ).toBe(1);
  });

  it("clamps admin token overrides to hard channel caps", () => {
    const policy = resolveAICostPolicy({
      channel: "chat",
      plan: "free",
      intentKind: "finance_query",
      settings: {
        ai_cost_chat_max_output_free: "99999",
      },
    });

    expect(policy.maxOutputTokens).toBe(1200);
  });

  it("supports admin-only, allow-list, plan, and percentage rollout gates", () => {
    expect(
      resolveAIRollout({
        userId: 1,
        role: "user",
        plan: "free",
        settings: { ai_kernel_rollout_admin_only: "true" },
      }),
    ).toMatchObject({ enabled: false, reason: "admin_only" });

    expect(
      resolveAIRollout({
        userId: 1,
        role: "admin",
        plan: "free",
        settings: { ai_kernel_rollout_admin_only: "true" },
      }),
    ).toMatchObject({ enabled: true, reason: "admin" });

    expect(
      resolveAIRollout({
        userId: 99,
        role: "user",
        plan: "free",
        settings: {
          ai_kernel_rollout_percentage: "0",
          ai_kernel_rollout_user_ids: "99",
        },
      }),
    ).toMatchObject({ enabled: true, reason: "user_allowlist" });

    expect(
      resolveAIRollout({
        userId: 2,
        role: "user",
        plan: "free",
        settings: { ai_kernel_rollout_plans: "pro,ultra" },
      }),
    ).toMatchObject({ enabled: false, reason: "plan_not_in_rollout" });
  });

  it("flags response numbers that are not backed by facts", () => {
    const facts: ResolvedFact[] = [
      {
        id: "total",
        dataNeedId: "summary",
        label: "total_expense",
        value: 1200,
        source: "finance.summary",
        confidence: 1,
      },
      {
        id: "food",
        dataNeedId: "category",
        label: "food",
        value: "food: ٣٠٠",
        source: "finance.category_total",
        confidence: 1,
      },
    ];

    const result = validateNumbersAgainstFacts(
      "إجمالي صرفك ١٢٠٠ جنيه، منهم 300 أكل و50 مواصلات.",
      facts,
    );

    expect(result.supported).toEqual(["1200", "300"]);
    expect(result.missing).toEqual(["50"]);
    expect(result.accuracy).toBeCloseTo(2 / 3);
  });

  it("scores retrieval quality from fact confidence and expected sources", () => {
    const quality = evaluateRetrievalQuality({
      query: "ازاي اربط SMS؟",
      facts: [
        {
          id: "guide",
          dataNeedId: "site",
          label: "site_guide",
          value: "SMS linking guide",
          source: "site_guide.search",
          confidence: 0.9,
        },
      ],
      expectedSources: ["site_guide.search"],
    });

    expect(quality).toMatchObject({
      resultCount: 1,
      expectedSourceHit: true,
    });
    expect(quality.score).toBeGreaterThan(0.9);
  });

  it("summarizes cost logs into channel averages", () => {
    const summary = summarizeAICostMetrics([
      { channel: "chat", totalTokens: 100, latencyMs: 400, costUnits: 150 },
      { channel: "chat", totalTokens: 300, latencyMs: 600, costUnits: 450 },
      { channel: "voice", totalTokens: 50, latencyMs: 1000, costUnits: 70 },
    ]);

    expect(summary.count).toBe(3);
    expect(summary.byChannel.chat).toMatchObject({
      count: 2,
      avgCostUnits: 300,
      avgTokens: 200,
      avgLatencyMs: 500,
    });
  });

  it("provides deterministic local fallback embeddings and lexical fallback search", () => {
    const a = buildDeterministicFallbackEmbedding("هدف عربية 100000", 256);
    const b = buildDeterministicFallbackEmbedding("هدف عربية 100000", 256);

    expect(a).toHaveLength(256);
    expect(a).toEqual(b);

    const results = fallbackVectorSearch({
      query: "هدف عربية",
      documents: [
        { id: "1", text: "خطة هدف عربية" },
        { id: "2", text: "شرح ربط SMS البنك" },
      ],
    });

    expect(results[0]).toMatchObject({ id: "1" });
  });
});
