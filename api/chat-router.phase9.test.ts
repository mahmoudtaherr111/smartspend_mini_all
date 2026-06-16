import { chatRouter, structuredFromToolResults } from "./chat-router";
import { processAIChatMessage } from "./services/ai-chat-service";
import { runAIKernelActive } from "./services/ai-kernel";

const { dbMock, insertedRows } = vi.hoisted(() => {
  const insertedRows: Array<Record<string, unknown>> = [];

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
            { key: "ai_kernel_enabled", value: "true" },
            { key: "ai_kernel_primary_enabled", value: "true" },
          ]),
        ),
      };
      return settingsChain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => {
        insertedRows.push(row);
        return Promise.resolve([{ insertId: 99 }]);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ affectedRows: 1 }])),
      })),
    })),
  };

  return { dbMock, insertedRows };
});

vi.mock("./queries/connection", () => ({
  db: dbMock,
}));

vi.mock("./services/ai-chat-service", () => ({
  processAIChatMessage: vi.fn(() =>
    Promise.resolve({
      response: "legacy should not run",
      tokensUsed: 999,
      model: "legacy-model",
      toolsUsed: ["legacy_tool"],
    }),
  ),
}));

vi.mock("./services/ai-kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./services/ai-kernel")>();
  return {
    ...actual,
    runAIKernelActive: vi.fn(() =>
      Promise.resolve({
        traceId: "phase9_active",
        channel: "chat",
        content: "في النهارده، صرفت ٣٥٠ جنيه.",
        intent: { kind: "finance_query", confidence: 0.9, reason: "test", slots: { period: "today" } },
        dataNeeds: [{ id: "need_1_finance_summary", kind: "finance.summary", priority: "hot", reason: "test" }],
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
        actions: [],
        tokenBudget: {
          maxInputTokens: 900,
          maxOutputTokens: 350,
          maxFactTokens: 420,
          maxMemoryTokens: 140,
          maxHistoryTokens: 180,
          maxToolRounds: 1,
        },
        model: "kernel-model",
        tokensUsed: 44,
        debug: { mode: "active", llmCalls: 0 },
      }),
    ),
  };
});

vi.mock("./services/ai-memory", () => ({
  hasSemanticMemoryCandidate: vi.fn(() => false),
  writeConversationMemory: vi.fn(async () => undefined),
}));

vi.mock("./services/action-runtime", () => ({
  maybeCreateActionDraftFromMessage: vi.fn(async () => null),
  mergeActionArtifacts: vi.fn((artifacts) => ({ artifacts, actions: [] })),
  confirmAction: vi.fn(),
  cancelAction: vi.fn(),
}));

describe("chat router phase 9 active kernel", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    vi.mocked(processAIChatMessage).mockClear();
    vi.mocked(runAIKernelActive).mockClear();
  });

  it("uses the active AI Kernel as the primary path instead of legacy tools", async () => {
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

    const result = await caller.sendMessage({ message: "صرفت كام النهاردة؟" });

    expect(result.response).toBe("في النهارده، صرفت ٣٥٠ جنيه.");
    expect(result.model).toBe("kernel-model");
    expect(result.tokensUsed).toBe(44);
    expect(result.structured?.debug).toMatchObject({ mode: "active" });
    expect(runAIKernelActive).toHaveBeenCalledTimes(1);
    expect(processAIChatMessage).not.toHaveBeenCalled();
  });

  it("restores structured artifacts when stored tool results come back as a JSON string", () => {
    const structured = structuredFromToolResults(
      JSON.stringify({
        structured: {
          content: "draft",
          artifacts: [
            {
              id: "action_confirmation:123",
              type: "action_confirmation",
              payload: { actionId: "123", summary: "Goal draft" },
            },
          ],
          actions: [{ id: "123", name: "goal.create", status: "pending_confirmation" }],
        },
      }),
    );

    expect(structured?.artifacts?.[0]).toMatchObject({
      id: "action_confirmation:123",
      type: "action_confirmation",
    });
    expect(structured?.actions?.[0]).toMatchObject({
      id: "123",
      name: "goal.create",
    });
    expect(structured?.debug).toMatchObject({
      responseSchemaVersion: 0,
      historicalStructuredResponse: true,
    });
  });

  it("keeps current structured response schema markers when loading stored messages", () => {
    const structured = structuredFromToolResults({
      structured: {
        content: "fresh",
        artifacts: [],
        actions: [],
        debug: {
          responseSchemaVersion: 2,
        },
      },
    });

    expect(structured?.debug).toEqual({ responseSchemaVersion: 2 });
  });
});
