import { buildContextPack } from "./ai-kernel/context-packer";
import { compileDataNeeds } from "./ai-kernel/data-need-compiler";
import { routeIntent } from "./ai-kernel/intent-router";
import type { AIRequest, DataNeed, ResolvedFact } from "./ai-kernel/types";
import {
  AI_GOLDEN_EVAL_DATASET,
  buildDeterministicFallbackEmbedding,
  evaluateRetrievalQuality,
  resolveAICostPolicy,
  validateNumbersAgainstFacts,
} from "./ai-cost-policy";
import { createFinanceChartArtifact } from "./finance-semantic-layer/chart-artifacts";
import type { FinanceChartData, ResolvedFinancePeriod } from "./finance-semantic-layer/types";
import { InMemoryVectorStore } from "./ai-memory/vector-store";
import { cheapRerankResults, reformulateMemoryQuery } from "./ai-memory/retrieval-enhancements";
import {
  createBudgetPayloadFromMessage,
  createBudgetSuggestionFromGoal,
  createExpensePayloadFromMessage,
  createPhase8PayloadFromMessage,
  createProfileUpdatePayloadFromMessage,
  createWalletPayloadFromMessage,
} from "./action-runtime/extended-actions";

function fakePeriod(): ResolvedFinancePeriod {
  return {
    kind: "current_month",
    key: "2026-06",
    label: "June 2026",
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    endDate: new Date("2026-06-30T23:59:59.999Z"),
    salaryDay: 1,
    daysElapsed: 15,
    daysTotal: 30,
    isSalaryCycle: false,
  };
}

describe("AI Center creative system smoke", () => {
  it("routes the golden Arabic scenarios into narrow data needs", () => {
    for (const item of AI_GOLDEN_EVAL_DATASET) {
      const intent = routeIntent(item.question);
      const needs = compileDataNeeds(intent);
      const kinds = needs.map((need) => need.kind);

      expect(intent.kind, item.id).toBe(item.expectedIntent);
      for (const expectedNeed of item.expectedNeeds) {
        expect(kinds, item.id).toContain(expectedNeed);
      }
    }

    const simpleToday = compileDataNeeds(routeIntent("صرفت كام النهارده؟"));
    expect(simpleToday.map((need) => need.kind)).toEqual(["finance.summary"]);
    expect(simpleToday[0]).toMatchObject({
      priority: "hot",
      maxRows: 1,
      scope: { period: "today" },
    });

    const advice = compileDataNeeds(routeIntent("لو فاض معايا 5000 جنيه أستثمرهم في إيه؟"));
    expect(routeIntent("لو فاض معايا 5000 جنيه أستثمرهم في إيه؟").kind).toBe("advice_request");
    expect(advice.map((need) => need.kind)).toEqual(
      expect.arrayContaining(["finance.summary", "finance.breakdown", "memory.search"]),
    );

    const expenseCapture = routeIntent("سجل عندك 45 جنيه قهوة من ستاربكس النهارده");
    expect(expenseCapture.kind).toBe("expense_capture");

    const classification = routeIntent("كارفور الخضار واللحمة اتحسب أكل ولا تسوق؟ ولو غلط أعمل إيه؟");
    const classificationNeeds = compileDataNeeds(classification);
    expect(classification).toMatchObject({
      kind: "finance_analysis",
      reason: "classification_explanation_match",
      slots: expect.objectContaining({
        category: "food",
        categories: ["food", "shopping"],
      }),
    });
    expect(classificationNeeds.map((need) => need.kind)).toEqual(["finance.transactions", "finance.breakdown"]);
  });

  it("keeps context packs small and facts-first even with noisy chat history", () => {
    const intent = routeIntent("صرفت كام أكل الشهر ده؟");
    const dataNeeds = compileDataNeeds(intent);
    const longHistory = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `old noisy message ${index} `.repeat(40),
    }));
    const request: AIRequest = {
      channel: "chat",
      userId: 1,
      userType: "local",
      userPlan: "free",
      message: "صرفت كام أكل الشهر ده؟",
      conversationHistory: longHistory,
    };

    const pack = buildContextPack(request, intent, dataNeeds);

    expect(pack.tokenBudget.maxToolRounds).toBe(1);
    expect(pack.estimatedInputTokens).toBeLessThanOrEqual(pack.tokenBudget.maxInputTokens);
    expect(pack.sections.find((section) => section.name === "guardrails")?.content).toContain(
      "Use resolved facts",
    );
    expect(pack.sections.find((section) => section.name === "facts")?.content).toContain(
      "finance.category_total",
    );
  });

  it("blocks invented money numbers by checking answers against resolved facts", () => {
    const facts: ResolvedFact[] = [
      {
        id: "today_total",
        dataNeedId: "need_1_finance_summary",
        label: "total_expense",
        value: 350,
        source: "finance.summary",
        confidence: 1,
      },
      {
        id: "food_total",
        dataNeedId: "need_2_finance_category_total",
        label: "food_total",
        value: 120,
        source: "finance.category_total",
        confidence: 1,
      },
    ];

    expect(validateNumbersAgainstFacts("صرفت 350 جنيه، منهم 120 أكل.", facts)).toMatchObject({
      missing: [],
      accuracy: 1,
    });
    expect(validateNumbersAgainstFacts("صرفت 350 جنيه، وكمان 999 اشتراكات.", facts)).toMatchObject({
      supported: ["350"],
      missing: ["999"],
      accuracy: 0.5,
    });
  });

  it("uses cheap embeddings and retrieval before escalating to heavier models", async () => {
    const shortVector = buildDeterministicFallbackEmbedding("sms card setup help", 256);
    const deepVector = buildDeterministicFallbackEmbedding("long goal planning memory", 1024);
    expect(shortVector).toHaveLength(256);
    expect(deepVector).toHaveLength(1024);

    const voicePolicy = resolveAICostPolicy({
      channel: "voice",
      plan: "free",
      intentKind: "finance_analysis",
    });
    const embeddingPolicy = resolveAICostPolicy({ channel: "embedding", plan: "free" });
    expect(voicePolicy.maxToolRounds).toBe(1);
    expect(embeddingPolicy.maxToolRounds).toBe(0);

    const store = new InMemoryVectorStore();
    await store.upsert([
      {
        id: "u1_car_plan",
        userId: 1,
        userType: "local",
        text: "remember car saving plan target 100000 monthly saving",
        metadata: { importance: 900 },
      },
      {
        id: "u2_car_plan",
        userId: 2,
        userType: "local",
        text: "remember car saving plan target 200000",
        metadata: { importance: 900 },
      },
    ]);

    const results = await store.search({
      userId: 1,
      userType: "local",
      text: "remember the car plan",
      limit: 3,
    });
    expect(results.map((result) => result.id)).toEqual(["u1_car_plan"]);
  });

  it("reformulates and reranks ambiguous memory queries cheaply", () => {
    const reformulated = reformulateMemoryQuery("remember the card setup conversation");
    expect(reformulated.terms).toEqual(expect.arrayContaining(["wallet", "card"]));

    const reranked = cheapRerankResults("remember the car plan", [
      {
        id: "generic",
        score: 0.21,
        document: {
          id: "generic",
          userId: 1,
          userType: "local",
          text: "general conversation summary",
          metadata: { importance: 10 },
        },
      },
      {
        id: "car",
        score: 0.2,
        document: {
          id: "car",
          userId: 1,
          userType: "local",
          text: "car saving plan target and monthly budget",
          metadata: { importance: 900 },
        },
      },
    ]);

    expect(reranked[0].id).toBe("car");
  });

  it("keeps chart and action artifacts structured for the chat UI", () => {
    const need: DataNeed = {
      id: "need_chart",
      kind: "chart.data",
      priority: "normal",
      reason: "visual_check",
      scope: { period: "custom", granularity: "month" },
    };
    const chartData: FinanceChartData = {
      period: fakePeriod(),
      granularity: "month",
      points: [
        { label: "Apr", value: 1200.4, count: 8 },
        { label: "May", value: 950.8, count: 5 },
      ],
    };
    const artifact = createFinanceChartArtifact(need, chartData);

    expect(artifact).toMatchObject({
      type: "chart",
      payload: {
        contractVersion: 1,
        source: "finance.chartData",
        xKey: "label",
        yKey: "value",
      },
    });
    expect(artifact.payload.points).toEqual([
      { label: "Apr", value: 1200.4, count: 8 },
      { label: "May", value: 950.8, count: 5 },
    ]);

    const multiArtifact = createFinanceChartArtifact(
      {
        ...need,
        scope: { period: "custom", granularity: "month", categories: ["food", "transport"] },
      },
      {
        ...chartData,
        series: [
          { key: "food", label: "food", unit: "EGP" },
          { key: "transport", label: "transport", unit: "EGP" },
        ],
        points: [{ label: "Jun", value: 180, food: 100, transport: 80, count: 2 }],
      },
    );
    expect(multiArtifact.payload.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "food", label: "الأكل" }),
        expect.objectContaining({ key: "transport", label: "المواصلات" }),
      ]),
    );
    expect(multiArtifact.payload.points).toEqual([
      expect.objectContaining({ label: "Jun", food: 100, transport: 80, value: 180, count: 2 }),
    ]);

    expect(createBudgetPayloadFromMessage("حط ميزانية أكل 3000 جنيه")).toMatchObject({
      category: "food",
      monthlyLimit: 3000,
    });
    expect(createExpensePayloadFromMessage("سجل عندك 45 جنيه قهوة من ستاربكس النهارده")).toMatchObject({
      amount: 45,
      category: "food",
      placeHint: "ستاربكس",
      type: "expense",
    });
    expect(createProfileUpdatePayloadFromMessage("غير دخلي الشهري إلى 15000")).toEqual({
      section: "financialInfo",
      patch: { averageMonthlyIncome: 15000 },
    });
    expect(createWalletPayloadFromMessage("ضيف فيزا CIB آخر 1234 رصيد 5000")).toMatchObject({
      provider: "CIB",
      lastFourDigits: "1234",
      balance: "5000",
    });
    expect(createPhase8PayloadFromMessage("ارجع آخر عملية")).toMatchObject({
      actionName: "action.undo",
      payload: {},
    });
    expect(createBudgetSuggestionFromGoal({ title: "Car", targetAmount: 12000 })).toMatchObject({
      category: "saving",
      monthlyLimit: 1000,
    });
  });

  it("scores retrieval quality from the exact sources the model should cite", () => {
    const quality = evaluateRetrievalQuality({
      query: "how do I connect sms?",
      expectedSources: ["site_guide.search"],
      facts: [
        {
          id: "sms_help",
          dataNeedId: "need_site",
          label: "sms_setup",
          value: "Open bank sync then copy webhook token.",
          source: "site_guide.search",
          confidence: 0.92,
        },
      ],
    });

    expect(quality).toMatchObject({
      resultCount: 1,
      expectedSourceHit: true,
    });
    expect(quality.score).toBeGreaterThan(0.9);
  });
});
