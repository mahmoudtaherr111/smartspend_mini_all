import { chatRouter } from "./chat-router";
import { processAIChatMessage } from "./services/ai-chat-service";
import { runAIKernelActive, runAIKernelShadow } from "./services/ai-kernel";

const { dbMock } = vi.hoisted(() => {
  const dbMock: any = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields?.count) {
        const countChain: any = {
          from: vi.fn(() => countChain),
          innerJoin: vi.fn(() => countChain),
          where: vi.fn(() => Promise.resolve([{ count: 0 }])),
        };
        return countChain;
      }

      if (fields?.role && fields?.content) {
        const historyChain: any = {
          from: vi.fn(() => historyChain),
          where: vi.fn(() => historyChain),
          orderBy: vi.fn(() =>
            Promise.resolve([
              { role: "user", content: "عايز اخطط لهدف قريب" },
              { role: "assistant", content: "تمام، قولي الرقم والمدة." },
            ]),
          ),
        };
        return historyChain;
      }

      const settingsChain: any = {
        from: vi.fn(() =>
          Promise.resolve([
            { key: "chatbot_api_key", value: "test-chat-key" },
            { key: "chatbot_base_url", value: "https://example.test/v1" },
            { key: "chatbot_model", value: "accounts/fireworks/models/deepseek-v4-flash" },
            { key: "chatbot_daily_limit_free", value: "20" },
            { key: "chatbot_enabled_free", value: "true" },
            { key: "ai_kernel_enabled", value: "true" },
            { key: "ai_kernel_primary_enabled", value: "false" },
          ]),
        ),
      };
      return settingsChain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve([{ insertId: 77 }])),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ affectedRows: 1 }])),
      })),
    })),
  };

  return { dbMock };
});

vi.mock("./queries/connection", () => ({
  db: dbMock,
}));

vi.mock("./services/ai-chat-service", () => ({
  processAIChatMessage: vi.fn(() =>
    Promise.resolve({
      response: "legacy response",
      tokensUsed: 21,
      model: "legacy-model",
      toolsUsed: [],
    }),
  ),
}));

vi.mock("./services/ai-kernel", () => ({
  embeddingApiCallsFromCacheHits: vi.fn((cacheHits: string[]) =>
    cacheHits.some((hit) => hit.startsWith("memory_cache:hit"))
      ? 0
      : cacheHits.includes("embedding:query_embedded") && cacheHits.includes("embedding:fireworks")
        ? 1
        : 0,
  ),
  runAIKernelActive: vi.fn(() =>
    Promise.resolve({
      traceId: "active_trace",
      channel: "chat",
      content: "kernel response",
      intent: { kind: "goal_planning", confidence: 0.9, reason: "test", slots: {} },
      dataNeeds: [{ id: "need_goal", kind: "finance.goal_progress", priority: "normal", reason: "test" }],
      facts: [],
      artifacts: [],
      actions: [],
      tokenBudget: {
        maxInputTokens: 900,
        maxOutputTokens: 450,
        maxFactTokens: 420,
        maxMemoryTokens: 140,
        maxHistoryTokens: 180,
        maxToolRounds: 1,
      },
      model: "kernel-model",
      tokensUsed: 33,
      debug: { mode: "active", llmCalls: 0 },
    }),
  ),
  runAIKernelShadow: vi.fn(() => Promise.resolve({ traceId: "shadow_trace" })),
}));

vi.mock("./services/ai-memory", () => ({
  hasSemanticMemoryCandidate: vi.fn(() => false),
  writeConversationMemory: vi.fn(async () => undefined),
}));

vi.mock("./services/action-runtime", () => ({
  createPendingGoalAction: vi.fn(async () => null),
  createPendingRuntimeAction: vi.fn(async () => null),
  maybeCreateActionDraftFromMessage: vi.fn(async () => null),
  mergeActionArtifacts: vi.fn((artifacts) => ({ artifacts, actions: [] })),
  confirmAction: vi.fn(),
  cancelAction: vi.fn(),
}));

describe("chat router phase 1 kernel primary", () => {
  beforeEach(() => {
    vi.mocked(processAIChatMessage).mockClear();
    vi.mocked(runAIKernelActive).mockClear();
    vi.mocked(runAIKernelShadow).mockClear();
  });

  it("uses the AI Kernel as primary even when the deprecated primary flag is false", async () => {
    const caller = chatRouter.createCaller({
      user: {
        id: 9,
        type: "oauth",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        plan: "free",
      },
      req: new Request("http://localhost/trpc"),
      ip: "127.0.0.1",
    });

    const result = await caller.sendMessage({
      message: "حطلي هدف احوش 100 الف عشان عربيه",
    });

    expect(result).toMatchObject({
      response: "kernel response",
      conversationId: 77,
      tokensUsed: 33,
      model: "kernel-model",
      toolsUsed: ["finance.goal_progress"],
    });
    expect(processAIChatMessage).not.toHaveBeenCalled();
    expect(runAIKernelActive).toHaveBeenCalledTimes(1);
    expect(runAIKernelShadow).not.toHaveBeenCalled();
    expect(runAIKernelActive).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "chat",
        userId: 9,
        userType: "oauth",
        userPlan: "free",
        message: "حطلي هدف احوش 100 الف عشان عربيه",
        conversationId: 77,
        conversationHistory: [
          { role: "user", content: "عايز اخطط لهدف قريب" },
          { role: "assistant", content: "تمام، قولي الرقم والمدة." },
        ],
        metadata: expect.objectContaining({
          legacyPath: "disabled",
          legacyFallbackAllowed: false,
          deprecatedPrimaryFlag: false,
          legacyModel: "accounts/fireworks/models/deepseek-v4-flash",
        }),
      }),
      expect.objectContaining({
        model: "accounts/fireworks/models/deepseek-v4-flash",
      }),
    );
  });
});
