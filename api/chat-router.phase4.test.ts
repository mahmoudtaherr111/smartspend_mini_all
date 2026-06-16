import { chatRouter } from "./chat-router";
import { runAIKernelActive } from "./services/ai-kernel";
import { processAIChatMessage } from "./services/ai-chat-service";
import { cancelAction, confirmAction, maybeCreateActionDraftFromMessage } from "./services/action-runtime";

const { dbMock, dbState } = vi.hoisted(() => {
  const dbState: any = {
    pendingActionRows: [{ id: 123, conversationId: 88 }],
  };
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

      if (fields?.id && fields?.conversationId) {
        const pendingActionChain: any = {
          from: vi.fn(() => pendingActionChain),
          where: vi.fn(() => pendingActionChain),
          orderBy: vi.fn(() => pendingActionChain),
          limit: vi.fn(() => Promise.resolve(dbState.pendingActionRows)),
        };
        return pendingActionChain;
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
      values: vi.fn(() => Promise.resolve([{ insertId: 88 }])),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ affectedRows: 1 }])),
      })),
    })),
  };

  return { dbMock, dbState };
});

vi.mock("./queries/connection", () => ({
  db: dbMock,
}));

vi.mock("./services/ai-chat-service", () => ({
  processAIChatMessage: vi.fn(() =>
    Promise.resolve({
      response: "تمام، حضرت لك هدف محتاج تأكيد.",
      tokensUsed: 25,
      model: "legacy-model",
      toolsUsed: [],
    }),
  ),
}));

vi.mock("./services/ai-kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./services/ai-kernel")>();
  return {
    ...actual,
    runAIKernelActive: vi.fn(() =>
      Promise.resolve({
        traceId: "phase4_trace",
        channel: "chat",
        content: "kernel draft base",
        intent: { kind: "goal_planning", confidence: 0.9, reason: "test", slots: {} },
        dataNeeds: [],
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
        tokensUsed: 31,
        debug: { mode: "active", llmCalls: 0 },
      }),
    ),
    runAIKernelShadow: vi.fn(() =>
      Promise.resolve({
        traceId: "phase4_trace",
        channel: "chat",
        content: "",
        intent: { kind: "goal_planning", confidence: 0.9, reason: "test", slots: {} },
        dataNeeds: [],
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
      }),
    ),
  };
});

vi.mock("./services/ai-memory", () => ({
  hasSemanticMemoryCandidate: vi.fn(() => false),
  writeConversationMemory: vi.fn(async () => undefined),
}));

vi.mock("./services/action-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./services/action-runtime")>();
  return {
    ...actual,
    confirmAction: vi.fn(async () => ({
      actionId: 123,
      actionName: "goal.create",
      status: "executed",
      message: "تم إنشاء الهدف بنجاح.",
      result: { goalId: 77, title: "هدف شراء عربية", targetAmount: 100000 },
      artifact: {
        id: "action_result:123",
        type: "metric_card",
        title: "تم إنشاء الهدف",
        payload: { goalId: 77, title: "هدف شراء عربية", targetAmount: 100000 },
      },
    })),
    cancelAction: vi.fn(async () => ({
      actionId: 123,
      actionName: "goal.create",
      status: "cancelled",
      message: "تم إلغاء العملية.",
    })),
    maybeCreateActionDraftFromMessage: vi.fn(async () => ({
      action: {
        id: "123",
        name: "goal.create",
        status: "pending_confirmation",
        risk: "medium",
        confirmationRequired: true,
        summary: "هدف شراء عربية - 100000 EGP",
        payload: { title: "هدف شراء عربية", targetAmount: 100000 },
      },
      artifact: {
        id: "action_confirmation:123",
        type: "action_confirmation",
        title: "Confirm action",
        payload: {
          actionId: "123",
          actionName: "goal.create",
          summary: "هدف شراء عربية - 100000 EGP",
          fields: { title: "هدف شراء عربية", targetAmount: 100000 },
        },
      },
    })),
  };
});

describe("chat router phase 4 structured actions", () => {
  beforeEach(() => {
    dbState.pendingActionRows = [{ id: 123, conversationId: 88 }];
    vi.mocked(processAIChatMessage).mockClear();
    vi.mocked(runAIKernelActive).mockClear();
    vi.mocked(confirmAction).mockClear();
    vi.mocked(cancelAction).mockClear();
    vi.mocked(maybeCreateActionDraftFromMessage).mockClear();
  });

  it("returns an action confirmation artifact beside the action-aware draft response", async () => {
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
      message: "حطلي هدف احوش 100 الف عشان عربية",
    });

    expect(result.response).toContain("مسودة هدف");
    expect(result.response).toContain("لسه ما نفذتش حاجة");
    expect(result.response).toContain("تأكيد");
    expect(result.structured?.content).toBe(result.response);
    expect(result.structured?.artifacts[0]).toMatchObject({
      type: "action_confirmation",
      payload: expect.objectContaining({ actionId: "123" }),
    });
    expect(result.structured?.actions[0]).toMatchObject({
      name: "goal.create",
      status: "pending_confirmation",
    });
  });

  it("returns a clear action draft failure when server validation rejects the draft", async () => {
    vi.mocked(maybeCreateActionDraftFromMessage).mockRejectedValueOnce(
      new Error("Free plan supports 3 active goals"),
    );

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
      message: "حطلي هدف احوش 25 الف عشان لابتوب",
    });

    expect(result.response).toContain("خطة Free");
    expect(result.response).toContain("3 أهداف نشطة");
    expect(result.response).toContain("لسه ما نفذتش حاجة");
    expect(result.structured?.content).toBe(result.response);
    expect(result.structured?.actions ?? []).toHaveLength(0);
  });

  it("confirms the latest pending action from a short text reply in the same conversation", async () => {
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
      message: "\u0645\u0648\u0627\u0641\u0642",
      conversationId: 88,
    });

    expect(result.response).toBe("تم إنشاء الهدف بنجاح.");
    expect(result.model).toBe("server-action-runtime");
    expect(result.toolsUsed).toEqual(["action.confirm"]);
    expect(result.structured?.artifacts[0]).toMatchObject({
      id: "action_result:123",
      type: "metric_card",
    });
    expect(confirmAction).toHaveBeenCalledWith(
      { userId: 1, userType: "oauth", userPlan: "free", conversationId: 88 },
      123,
    );
    expect(cancelAction).not.toHaveBeenCalled();
    expect(runAIKernelActive).not.toHaveBeenCalled();
    expect(processAIChatMessage).not.toHaveBeenCalled();
    expect(maybeCreateActionDraftFromMessage).not.toHaveBeenCalled();
  });

  it("cancels the latest pending action from a short text reply in the same conversation", async () => {
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
      message: "\u0625\u0644\u063a\u0627\u0621",
      conversationId: 88,
    });

    expect(result.response).toBe("تم إلغاء العملية.");
    expect(result.model).toBe("server-action-runtime");
    expect(result.toolsUsed).toEqual(["action.cancel"]);
    expect(cancelAction).toHaveBeenCalledWith(
      { userId: 1, userType: "oauth", userPlan: "free", conversationId: 88 },
      123,
    );
    expect(confirmAction).not.toHaveBeenCalled();
    expect(runAIKernelActive).not.toHaveBeenCalled();
    expect(processAIChatMessage).not.toHaveBeenCalled();
    expect(maybeCreateActionDraftFromMessage).not.toHaveBeenCalled();
  });

  it("passes conversation id through direct action confirmation mutations", async () => {
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

    await caller.confirmAction({ actionId: 123, conversationId: 88 });
    await caller.cancelAction({ actionId: 123, conversationId: 88 });

    expect(confirmAction).toHaveBeenCalledWith(
      { userId: 1, userType: "oauth", userPlan: "free", conversationId: 88 },
      123,
    );
    expect(cancelAction).toHaveBeenCalledWith(
      { userId: 1, userType: "oauth", userPlan: "free", conversationId: 88 },
      123,
    );
  });

  it("does not confirm a pending action from a different conversation", async () => {
    dbState.pendingActionRows = [{ id: 123, conversationId: 99 }];
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
      message: "\u0645\u0648\u0627\u0641\u0642",
      conversationId: 88,
    });

    expect(confirmAction).not.toHaveBeenCalled();
    expect(cancelAction).not.toHaveBeenCalled();
    expect(runAIKernelActive).toHaveBeenCalled();
    expect(result.model).toBe("kernel-model");
  });
});
