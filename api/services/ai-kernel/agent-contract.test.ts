import { callChatCompletionAPI } from "../../lib/deepseek-client";
import { runAIKernelActive } from "./index";
import { resolveKernelDataNeeds } from "../finance-semantic-layer";
import { resolveMemoryDataNeeds } from "../ai-memory";
import { resolveSiteGuideDataNeeds } from "../site-guide";
import type { Artifact, DataNeed, ResolvedFact } from "./types";

function ar(...codes: number[]): string {
  return String.fromCodePoint(...codes);
}

const QUESTIONS = {
  financeToday: ar(0x0635, 0x0631, 0x0641, 0x062a, 0x20, 0x0643, 0x0627, 0x0645, 0x20, 0x0627, 0x0644, 0x0646, 0x0647, 0x0627, 0x0631, 0x062f, 0x0647, 0x061f),
  memoryCoffeeSleep: ar(0x0641, 0x0627, 0x0643, 0x0631, 0x20, 0x0645, 0x0648, 0x0636, 0x0648, 0x0639, 0x20, 0x0627, 0x0644, 0x0642, 0x0647, 0x0648, 0x0629, 0x20, 0x0648, 0x0627, 0x0644, 0x0646, 0x0648, 0x0645, 0x061f),
  adviceCoffeeSleep: ar(0x0627, 0x0639, 0x0645, 0x0644, 0x20, 0x0644, 0x064a, 0x20, 0x062e, 0x0637, 0x0629, 0x20, 0x0623, 0x0642, 0x0644, 0x0644, 0x20, 0x0645, 0x0635, 0x0627, 0x0631, 0x064a, 0x0641, 0x20, 0x0627, 0x0644, 0x0642, 0x0647, 0x0648, 0x0629, 0x20, 0x0639, 0x0634, 0x0627, 0x0646, 0x20, 0x0623, 0x0646, 0x0627, 0x0645, 0x20, 0x0623, 0x062d, 0x0633, 0x0646, 0x20, 0x0648, 0x0627, 0x0641, 0x062a, 0x0643, 0x0631, 0x20, 0x0627, 0x0644, 0x0644, 0x064a, 0x20, 0x0627, 0x062a, 0x0643, 0x0644, 0x0645, 0x0646, 0x0627, 0x20, 0x0639, 0x0646, 0x0647, 0x20, 0x0642, 0x0628, 0x0644, 0x20, 0x0643, 0x062f, 0x0647),
  chartFoodSixMonths: ar(0x0627, 0x0631, 0x0633, 0x0645, 0x0644, 0x064a, 0x20, 0x0645, 0x0635, 0x0627, 0x0631, 0x064a, 0x0641, 0x20, 0x0627, 0x0644, 0x0623, 0x0643, 0x0644, 0x20, 0x0622, 0x062e, 0x0631, 0x20, 0x36, 0x20, 0x0634, 0x0647, 0x0648, 0x0631),
  siteCardHelp: ar(0x0627, 0x0632, 0x0627, 0x064a, 0x20, 0x0627, 0x0631, 0x0628, 0x0637, 0x20, 0x0627, 0x0644, 0x0641, 0x064a, 0x0632, 0x0627, 0x20, 0x0628, 0x0627, 0x0644, 0x062a, 0x0637, 0x0628, 0x064a, 0x0642, 0x061f),
};

vi.mock("../../lib/deepseek-client", () => ({
  callChatCompletionAPI: vi.fn(async () => ({
    text: "LLM should not be needed for this contract test",
    tokensUsed: 999,
    model: "mock-llm",
  })),
}));

vi.mock("../finance-semantic-layer", () => ({
  resolveKernelDataNeeds: vi.fn(async (_ctx: unknown, dataNeeds: DataNeed[]) => {
    const facts: ResolvedFact[] = [];
    const artifacts: Artifact[] = [];
    const cacheHits: string[] = [];

    for (const need of dataNeeds) {
      if (need.kind === "finance.summary") {
        facts.push(
          {
            id: `${need.id}:total_expense`,
            dataNeedId: need.id,
            label: "total_expense",
            value: 2337.5,
            source: "finance.summary",
            confidence: 1,
          },
          {
            id: `${need.id}:transaction_count`,
            dataNeedId: need.id,
            label: "transaction_count",
            value: 11,
            source: "finance.summary",
            confidence: 1,
          },
        );
        cacheHits.push("finance_cache:hit:memory:summary:today");
      }

      if (need.kind === "finance.breakdown") {
        facts.push(
          {
            id: `${need.id}:top_1_food`,
            dataNeedId: need.id,
            label: "top_1_food",
            value: 659.5,
            source: "finance.breakdown",
            confidence: 1,
          },
          {
            id: `${need.id}:top_2_transport`,
            dataNeedId: need.id,
            label: "top_2_transport",
            value: 420,
            source: "finance.breakdown",
            confidence: 1,
          },
        );
        cacheHits.push("finance_cache:hit:memory:breakdown:month");
      }

      if (need.kind === "chart.data") {
        artifacts.push({
          id: `${need.id}:chart`,
          type: "chart",
          title: "Food spending",
          payload: {
            contractVersion: 1,
            source: "finance.chartData",
            xKey: "label",
            yKey: "value",
            points: [
              { label: "2026-01", value: 0, count: 0 },
              { label: "2026-06", value: 659.5, count: 4 },
            ],
          },
        });
        cacheHits.push("finance_cache:hit:memory:chart_data:food:month");
      }
    }

    return { facts, artifacts, errors: [], cacheHits };
  }),
}));

vi.mock("../ai-memory", () => ({
  resolveMemoryDataNeeds: vi.fn(async (_ctx: unknown, dataNeeds: DataNeed[]) => {
    const handled = dataNeeds.filter((need) => need.kind === "memory.search");
    if (handled.length === 0) {
      return { facts: [], artifacts: [], errors: [], cacheHits: [], handledNeeds: [] };
    }

    return {
      facts: [
        {
          id: `${handled[0].id}:memory_1`,
          dataNeedId: handled[0].id,
          label: "memory_1",
          value: "Coffee sleep plan: reduce late coffee for one week.",
          source: "memory.search",
          confidence: 0.96,
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: ["embedding:query_embedded", "embedding:fireworks", "embedding:rows:23"],
      handledNeeds: handled,
    };
  }),
}));

vi.mock("../site-guide", () => ({
  resolveSiteGuideDataNeeds: vi.fn(async (dataNeeds: DataNeed[]) => {
    const handled = dataNeeds.filter((need) => need.kind === "site_guide.search");
    if (handled.length === 0) {
      return { facts: [], artifacts: [], errors: [], cacheHits: [], handledNeeds: [] };
    }

    return {
      facts: [
        {
          id: `${handled[0].id}:site_guide_1`,
          dataNeedId: handled[0].id,
          label: "card_sms_setup",
          value: "Connect card, then enable SMS import.",
          source: "site_guide.search",
          confidence: 0.9,
        },
      ],
      artifacts: [
        {
          id: `${handled[0].id}:guide`,
          type: "text_block",
          title: "Card setup",
          payload: { text: "Connect card, then enable SMS import." },
        },
      ],
      errors: [],
      cacheHits: ["site_guide:static_256"],
      handledNeeds: handled,
    };
  }),
}));

describe("AI agent active contract", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(callChatCompletionAPI).mockClear();
    vi.mocked(resolveKernelDataNeeds).mockClear();
    vi.mocked(resolveMemoryDataNeeds).mockClear();
    vi.mocked(resolveSiteGuideDataNeeds).mockClear();
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  async function ask(message: string) {
    return runAIKernelActive(
      {
        requestId: `contract_${Date.now()}`,
        channel: "chat",
        userId: 27,
        userType: "local",
        userPlan: "free",
        message,
      },
      {
        apiKey: "",
        baseUrl: "https://example.test/v1",
        model: "semantic-deterministic",
      },
    );
  }

  it("answers simple finance from structured facts without LLM or embeddings", async () => {
    const response = await ask(QUESTIONS.financeToday);

    expect(response.intent.kind).toBe("finance_query");
    expect(response.dataNeeds.map((need) => need.kind)).toEqual(["finance.summary"]);
    expect(response.debug).toMatchObject({
      llmCalls: 0,
      retrievalPolicy: {
        embedding: "skipped",
        reason: "structured_sql_or_cached_facts_do_not_need_embedding",
      },
      hallucinationRisk: "low",
    });
    expect(response.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "finance.summary", label: "total_expense", value: 2337.5 }),
      ]),
    );
    expect(callChatCompletionAPI).not.toHaveBeenCalled();
  });

  it("uses Fireworks/Qwen semantic memory only for memory questions", async () => {
    const response = await ask(QUESTIONS.memoryCoffeeSleep);

    expect(response.intent.kind).toBe("memory_question");
    expect(response.dataNeeds.map((need) => need.kind)).toEqual(["memory.search"]);
    expect(response.content).toContain("Coffee sleep plan");
    expect(response.debug).toMatchObject({
      embeddingCalls: 1,
      llmCalls: 0,
      retrievalPolicy: {
        embedding: "fireworks_qwen",
        reason: "memory_search_semantic_retrieval",
        vectorRows: 23,
      },
    });
    expect(response.debug?.cacheHits).toEqual(
      expect.arrayContaining(["embedding:query_embedded", "embedding:fireworks", "embedding:rows:23"]),
    );
    expect(callChatCompletionAPI).not.toHaveBeenCalled();
  });

  it("returns chart artifacts from prepared chart data without LLM", async () => {
    const response = await ask(QUESTIONS.chartFoodSixMonths);

    expect(response.intent.kind).toBe("chart_request");
    expect(response.dataNeeds.map((need) => need.kind)).toEqual(["chart.data"]);
    expect(response.artifacts).toEqual([
      expect.objectContaining({
        type: "chart",
        payload: expect.objectContaining({
          contractVersion: 1,
          source: "finance.chartData",
          points: expect.arrayContaining([expect.objectContaining({ label: "2026-06", value: 659.5 })]),
        }),
      }),
    ]);
    expect(response.debug).toMatchObject({
      llmCalls: 0,
      retrievalPolicy: {
        embedding: "skipped",
        reason: "structured_sql_or_cached_facts_do_not_need_embedding",
      },
    });
    expect(callChatCompletionAPI).not.toHaveBeenCalled();
  });

  it("answers product help through static local site-guide vectors", async () => {
    const response = await ask(QUESTIONS.siteCardHelp);

    expect(response.intent.kind).toBe("site_help");
    expect(response.dataNeeds.map((need) => need.kind)).toEqual(["site_guide.search"]);
    expect(response.facts).toEqual([
      expect.objectContaining({ source: "site_guide.search", label: "card_sms_setup" }),
    ]);
    expect(response.artifacts).toEqual([
      expect.objectContaining({ type: "text_block" }),
    ]);
    expect(response.debug).toMatchObject({
      llmCalls: 0,
      retrievalPolicy: {
        embedding: "static_local",
        reason: "site_guide_uses_zero_api_static_256_vectors",
        dimensions: 256,
      },
    });
    expect(callChatCompletionAPI).not.toHaveBeenCalled();
  });

  it("keeps advice useful when numeric guard blocks unsupported LLM numbers", async () => {
    vi.mocked(callChatCompletionAPI).mockResolvedValueOnce({
      text: "وفر 500 جنيه من القهوة كل أسبوع واعمل تخفيض 20% على المصاريف.",
      tokensUsed: 140,
      model: "mock-llm",
    });

    const response = await runAIKernelActive(
      {
        requestId: "contract_advice_numeric_guard",
        channel: "chat",
        userId: 27,
        userType: "local",
        userPlan: "free",
        message: QUESTIONS.adviceCoffeeSleep,
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "mock-llm",
      },
    );

    expect(response.intent.kind).toBe("advice_request");
    expect(response.dataNeeds.map((need) => need.kind)).toContain("memory.search");
    expect(response.debug).toMatchObject({
      llmCalls: 1,
      numericGuard: expect.objectContaining({ applied: true }),
      retrievalPolicy: {
        embedding: "fireworks_qwen",
        reason: "memory_search_semantic_retrieval",
        vectorRows: 23,
      },
    });
    expect(response.content).toContain("خطة آمنة");
    expect(response.content).toContain("فاكر من كلامنا");
    expect(response.content).toContain("المصروفات");
    expect(response.content).not.toContain("منعت رقم غير مؤكد");
  });

  it("replaces advice meta-reasoning with grounded user-facing content", async () => {
    vi.mocked(callChatCompletionAPI).mockResolvedValueOnce({
      text: "نحتاج لرد على طلب المستخدم. يجب أن نعتمد على ResolvedFacts ونكتب الخطة النهائية.",
      tokensUsed: 90,
      model: "mock-llm",
    });

    const response = await runAIKernelActive(
      {
        requestId: "contract_advice_meta_guard",
        channel: "chat",
        userId: 27,
        userType: "local",
        userPlan: "free",
        message: QUESTIONS.adviceCoffeeSleep,
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "mock-llm",
      },
    );

    expect(response.debug).toMatchObject({
      llmCalls: 1,
      responseQualityGuard: {
        applied: true,
        reason: "llm_returned_meta_reasoning",
      },
    });
    expect(response.content).toContain("خطة آمنة");
    expect(response.content).toContain("فاكر من كلامنا");
    expect(response.content).not.toContain("نحتاج لرد");
    expect(response.content).not.toContain("ResolvedFacts");
  });

  it("replaces truncated advice with grounded content", async () => {
    vi.mocked(callChatCompletionAPI).mockResolvedValueOnce({
      text: "أهلاً بيك. عشان تظبط القهوة والنوم:\n\n1. **حدد موعد ثابت للقهوة** وخليها مرة واحدة",
      tokensUsed: 90,
      model: "mock-llm",
    });

    const response = await runAIKernelActive(
      {
        requestId: "contract_advice_truncated_guard",
        channel: "chat",
        userId: 27,
        userType: "local",
        userPlan: "free",
        message: QUESTIONS.adviceCoffeeSleep,
      },
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "mock-llm",
      },
    );

    expect(response.debug).toMatchObject({
      responseQualityGuard: {
        applied: true,
        reason: "llm_response_incomplete",
      },
    });
    expect(response.content).toContain("خطة آمنة");
    expect(response.content).toContain("فاكر من كلامنا");
    expect(response.content).not.toContain("حدد موعد ثابت");
  });
});
