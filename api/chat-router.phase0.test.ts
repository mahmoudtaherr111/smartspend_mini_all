import { chatRouter } from "./chat-router";
import { processAIChatMessage } from "./services/ai-chat-service";

const { dbMock, insertedRows, dbState } = vi.hoisted(() => {
  const insertedRows: Array<Record<string, unknown>> = [];
  const dbState = {
    todayCount: 0,
  };

  const dbMock: any = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields?.count) {
        const countChain: any = {
          from: vi.fn(() => countChain),
          innerJoin: vi.fn(() => countChain),
          where: vi.fn(() => Promise.resolve([{ count: dbState.todayCount }])),
        };
        return countChain;
      }

      if (fields?.role && fields?.content) {
        const historyChain: any = {
          from: vi.fn(() => historyChain),
          where: vi.fn(() => historyChain),
          orderBy: vi.fn(() => Promise.resolve([])),
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
            { key: "ai_kernel_enabled", value: "false" },
            { key: "ai_kernel_primary_enabled", value: "false" },
          ]),
        ),
      };
      return settingsChain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => {
        insertedRows.push(row);
        return Promise.resolve([{ insertId: 42 }]);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ affectedRows: 1 }])),
      })),
    })),
  };

  return { dbMock, insertedRows, dbState };
});

vi.mock("./queries/connection", () => ({
  db: dbMock,
}));

vi.mock("./services/ai-chat-service", () => ({
  processAIChatMessage: vi.fn(() =>
    Promise.resolve({
      response: "رد تجريبي",
      tokensUsed: 17,
      model: "test-model",
      toolsUsed: ["get_today_expenses"],
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
  runAIKernelActive: vi.fn(() => Promise.resolve(undefined)),
  runAIKernelShadow: vi.fn(() => Promise.resolve(undefined)),
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

describe("chat router phase 0 smoke", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    dbState.todayCount = 0;
    vi.mocked(processAIChatMessage).mockClear();
  });

  it("creates a conversation and saves user and assistant messages", async () => {
    const caller = chatRouter.createCaller({
      user: {
        id: 1,
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
      message: "صرفت كام النهاردة؟",
    });

    expect(result.conversationId).toBe(42);
    expect(result.response).toBe("رد تجريبي");
    expect(processAIChatMessage).toHaveBeenCalledTimes(1);

    const savedMessages = insertedRows.filter((row) => row.role);
    expect(savedMessages).toHaveLength(2);
    expect(savedMessages[0]).toMatchObject({
      conversationId: 42,
      role: "user",
      content: "صرفت كام النهاردة؟",
    });
    expect(savedMessages[1]).toMatchObject({
      conversationId: 42,
      role: "assistant",
      content: "رد تجريبي",
      tokensUsed: 17,
      model: "test-model",
    });
  });

  it("keeps daily limits for normal users but lets the dev QA prompt path bypass them", async () => {
    dbState.todayCount = 20;
    const caller = chatRouter.createCaller({
      user: {
        id: 1,
        type: "oauth",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        plan: "free",
      },
      req: new Request("http://localhost/trpc"),
      ip: "127.0.0.1",
    });

    await expect(caller.sendMessage({ message: "اختبار عادي" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });

    const result = await caller.sendMessage({
      message: "اختبار QA داخلي",
      devQaBypassDailyLimit: true,
    });

    expect(result.response).toBe("رد تجريبي");
    expect(processAIChatMessage).toHaveBeenCalledTimes(1);
  });

  it("ignores the dev QA daily-limit bypass in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    dbState.todayCount = 20;
    const caller = chatRouter.createCaller({
      user: {
        id: 1,
        type: "oauth",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        plan: "free",
      },
      req: new Request("http://localhost/trpc"),
      ip: "127.0.0.1",
    });

    try {
      await expect(
        caller.sendMessage({
          message: "اختبار QA داخلي",
          devQaBypassDailyLimit: true,
        }),
      ).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
      expect(processAIChatMessage).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
