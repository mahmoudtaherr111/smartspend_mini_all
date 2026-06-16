import type { DataNeed } from "./types";
import { retrievalPolicyFor, runAIKernelActive, runAIKernelShadow } from "./index";
import { resolveKernelDataNeeds } from "../finance-semantic-layer";
import { resolveMemoryDataNeeds } from "../ai-memory";

vi.mock("../finance-semantic-layer", () => ({
  resolveKernelDataNeeds: vi.fn(async () => ({
    facts: [],
    artifacts: [],
    errors: [],
    cacheHits: [],
  })),
}));

vi.mock("../ai-memory", () => ({
  resolveMemoryDataNeeds: vi.fn(async (_ctx: unknown, needs: DataNeed[]) => ({
    facts: [
      {
        id: "need_1_memory_search:memory_1",
        dataNeedId: "need_1_memory_search",
        label: "memory_1",
        value: "اتفقنا ان المستخدم يحوش 100 الف للعربية",
        source: "memory.search",
        confidence: 0.9,
      },
    ],
    artifacts: [],
    errors: [],
    cacheHits: ["ai_memory:1:oauth"],
    handledNeeds: needs.filter((need) => need.kind === "memory.search"),
  })),
}));

describe("AI kernel phase 3 memory resolution", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(resolveKernelDataNeeds).mockClear();
    vi.mocked(resolveMemoryDataNeeds).mockClear();
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("resolves memory.search for recall questions", async () => {
    const response = await runAIKernelShadow({
      requestId: "phase3_memory",
      channel: "chat",
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      message: "فاكر الخطة اللي اتكلمنا عنها للعربية؟",
    });

    expect(resolveMemoryDataNeeds).toHaveBeenCalledWith(
      { userId: 1, userType: "oauth" },
      expect.arrayContaining([expect.objectContaining({ kind: "memory.search" })]),
    );
    expect(response.intent.kind).toBe("memory_question");
    expect(response.facts[0]).toMatchObject({
      source: "memory.search",
      value: "اتفقنا ان المستخدم يحوش 100 الف للعربية",
    });
  });

  it("filters recalled assistant echoes before formatting saved plans", async () => {
    vi.mocked(resolveMemoryDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "need_1_memory_search:memory_1",
          dataNeedId: "need_1_memory_search",
          label: "memory_1",
          value:
            "ذاكرة الخطط: الكاميرا والموبايل فقط، اذكر الرقم والمدة فاكر الخلاصة دي: 1. هدف كاميرا، بمبلغ ٩١٬٠٠٠ جنيه، خلال ٩ شهور 2. هدف موبايل، بمبلغ ٩٠٬٠٠٠ جنيه، خلال ٩ شهور",
          source: "memory.search",
          confidence: 1,
        },
        {
          id: "need_1_memory_search:memory_2",
          dataNeedId: "need_1_memory_search",
          label: "memory_2",
          value: "حطلي هدف احوش 91000 عشان اجيب كاميرا خلال 9 شهور بس ما تنفذش غير لما أأكد",
          source: "memory.search",
          confidence: 0.7,
        },
        {
          id: "need_1_memory_search:memory_3",
          dataNeedId: "need_1_memory_search",
          label: "memory_3",
          value: "حطلي هدف احوش 90000 عشان اجيب موبايل خلال 9 شهور بس ما تنفذش غير لما أأكد",
          source: "memory.search",
          confidence: 0.65,
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: ["embedding:fireworks", "embedding:rows:21"],
      handledNeeds: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase3_memory_echo_filter",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "فاكر خطة الكاميرا والموبايل؟ اذكر الرقم والمدة بس",
      },
      {
        apiKey: "",
        baseUrl: "https://example.test/v1",
        model: "test-model",
      },
    );

    expect(response.content).toContain("هدف كاميرا");
    expect(response.content).toContain("٩١٬٠٠٠ جنيه");
    expect(response.content).toContain("هدف موبايل");
    expect(response.content).toContain("٩٠٬٠٠٠ جنيه");
    expect(response.content).not.toContain("١ جنيه");
    expect(response.content).not.toContain("ذاكرة الخطط");
    expect(response.debug).toMatchObject({
      retrievalPolicy: {
        embedding: "fireworks_qwen",
        reason: "memory_search_semantic_retrieval",
        vectorRows: 21,
      },
    });
  });

  it("keeps Fireworks provenance visible while reporting zero embedding API calls on memory cache hits", async () => {
    vi.mocked(resolveMemoryDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "need_1_memory_search:memory_1",
          dataNeedId: "need_1_memory_search",
          label: "memory_1",
          value: "اتفقنا ان المستخدم يقلل القهوة بعد 8 مساء لمدة أسبوع.",
          source: "memory.search",
          confidence: 0.96,
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: [
        "memory_cache:hit:memory",
        "embedding:query_embedded",
        "embedding:fireworks",
        "embedding:rows:23",
      ],
      handledNeeds: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase3_memory_cached_embedding_cost",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "فاكر خطة القهوة والنوم؟",
      },
      {
        apiKey: "",
        baseUrl: "https://example.test/v1",
        model: "test-model",
      },
    );

    expect(response.intent.kind).toBe("memory_question");
    expect(response.debug).toMatchObject({
      embeddingCalls: 0,
      embeddingApiStatus: "semantic_result_cache_hit",
      retrievalPolicy: {
        embedding: "fireworks_qwen",
        reason: "memory_search_semantic_retrieval",
        vectorRows: 23,
      },
    });
    expect(response.debug?.cacheHits).toEqual(
      expect.arrayContaining([
        "memory_cache:hit:memory",
        "embedding:query_embedded",
        "embedding:fireworks",
        "embedding:rows:23",
      ]),
    );
  });

  it("prefers direct semantic memories over noisy conversation capsules", async () => {
    vi.mocked(resolveMemoryDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "need_1_memory_search:memory_1",
          dataNeedId: "need_1_memory_search",
          label: "memory_1",
          value: "أنا بصرف كتير على القهوة عشان بنام متأخر، ساعدني بخطة أسبوع تقلل الصرف والنوم يبقى أحسن.",
          source: "memory.search",
          confidence: 0.96,
          evidence: [{ id: 20, label: "memory", value: 55 }],
        },
        {
          id: "need_1_memory_search:memory_2",
          dataNeedId: "need_1_memory_search",
          label: "memory_2",
          value:
            "في الشهر الحالي، إجمالي صرفك على الأكل هو ٦٥٩٫٥ جنيه من ٥ عملية. العمليات اللي دخلت في الرقم: قهوة الصبح.",
          source: "memory.search",
          confidence: 0.52,
          evidence: [{ id: "conversation:119", label: "capsule", value: 45 }],
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: ["embedding:query_embedded", "embedding:fireworks", "embedding:rows:23"],
      handledNeeds: [],
    });

    const response = await runAIKernelActive(
      {
        requestId: "phase3_memory_direct_over_capsule",
        channel: "chat",
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        message: "فاكر الخطة اللي اتكلمنا عنها عشان القهوة والنوم؟",
      },
      {
        apiKey: "",
        baseUrl: "https://example.test/v1",
        model: "test-model",
      },
    );

    expect(response.content).toContain("أنا بصرف كتير على القهوة");
    expect(response.content).not.toContain("إجمالي صرفك");
    expect(response.content).not.toContain("العمليات اللي دخلت");
  });

  it("keeps memory.search retrieval policy visible for mixed finance and memory questions", () => {
    const mixedNeeds = [
      { id: "need_1_finance_summary", kind: "finance.summary" },
      { id: "need_2_memory_search", kind: "memory.search" },
    ] as DataNeed[];

    expect(
      retrievalPolicyFor("advice_request", mixedNeeds, [
        "memory_cache:hit",
        "embedding:query_embedded",
        "embedding:fireworks",
        "embedding:rows:22",
      ]),
    ).toMatchObject({
      embedding: "fireworks_qwen",
      reason: "memory_search_semantic_retrieval",
      vectorRows: 22,
    });

    expect(retrievalPolicyFor("advice_request", mixedNeeds, ["memory_cache:hit:redis"])).toMatchObject({
      embedding: "fallback",
      reason: "memory_search_cache_hit_without_embedding_trace",
    });
  });
});
