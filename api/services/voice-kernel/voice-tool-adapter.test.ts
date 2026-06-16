import {
  createVoiceSessionState,
  executeVoiceTool,
  getVoiceSessionState,
  VOICE_TOOL_DECLARATIONS,
  voiceSessionTestUtils,
} from "./index";
import { resolveKernelDataNeeds } from "../finance-semantic-layer";
import {
  confirmAction,
  createPendingGoalAction,
  createPendingRuntimeAction,
  validateGoalCreate,
  validateRuntimeAction,
} from "../action-runtime";
import { retrieveMemoryContext } from "../ai-memory";

vi.mock("../../lib/redis-client", () => ({
  getRedisClient: vi.fn(async () => null),
  getCacheRuntimeStatus: vi.fn(() => ({
    backend: "memory",
    memoryEntries: 0,
    memoryFallbackAllowed: true,
    redisConfigured: false,
    redisConnected: false,
  })),
}));

vi.mock("../finance-semantic-layer", () => ({
  resolveKernelDataNeeds: vi.fn(async () => ({
    facts: [],
    artifacts: [],
    errors: [],
    cacheHits: [],
  })),
}));

vi.mock("../ai-memory", () => ({
  retrieveMemoryContext: vi.fn(async () => ({
    query: "test",
    capsules: [],
    memories: [],
    actions: [],
    facts: [],
    artifacts: [],
    errors: [],
    cacheHits: [],
  })),
}));

vi.mock("../action-runtime", () => ({
  createGoalPayloadFromMessage: vi.fn(() => ({
    title: "Car goal",
    targetAmount: 100000,
  })),
  createPendingGoalAction: vi.fn(async () => ({
    action: {
      id: "700",
      name: "goal.create",
      status: "pending_confirmation",
      risk: "medium",
      confirmationRequired: true,
      summary: "Car goal - 100000 EGP",
      payload: { title: "Car goal", targetAmount: 100000 },
    },
    artifact: {
      id: "action_confirmation:700",
      type: "action_confirmation",
      payload: { actionId: "700" },
    },
  })),
  createPendingRuntimeAction: vi.fn(async (_ctx, actionName, payload) => ({
    action: {
      id: "701",
      name: actionName,
      status: "pending_confirmation",
      risk: "medium",
      confirmationRequired: true,
      summary: "Runtime action",
      payload,
    },
    artifact: {
      id: "action_confirmation:701",
      type: "action_confirmation",
      payload: { actionId: "701" },
    },
  })),
  createPhase8PayloadFromMessage: vi.fn(() => null),
  actionSummary: vi.fn((actionName: string) => `Summary ${actionName}`),
  goalSummary: vi.fn((payload: { title: string; targetAmount?: number }) =>
    `${payload.title}${payload.targetAmount ? ` - ${payload.targetAmount} EGP` : ""}`,
  ),
  validateGoalCreate: vi.fn(async (_ctx, payload) => payload),
  validateRuntimeAction: vi.fn(async (_ctx, _actionName, payload) => payload),
  confirmAction: vi.fn(async () => ({
    actionId: 700,
    actionName: "goal.create",
    status: "executed",
    message: "Goal created.",
    result: { goalId: 12, title: "Car goal", targetAmount: 100000 },
  })),
}));

describe("voice tool adapter phase 5", () => {
  beforeEach(() => {
    voiceSessionTestUtils.clearMemoryStore();
    vi.mocked(resolveKernelDataNeeds).mockClear();
    vi.mocked(validateGoalCreate).mockClear();
    vi.mocked(validateRuntimeAction).mockClear();
    vi.mocked(createPendingGoalAction).mockClear();
    vi.mocked(createPendingRuntimeAction).mockClear();
    vi.mocked(confirmAction).mockClear();
    vi.mocked(retrieveMemoryContext).mockClear();
  });

  it("resolves a simulated voice finance question through kernel data needs", async () => {
    vi.mocked(resolveKernelDataNeeds).mockResolvedValueOnce({
      facts: [
        {
          id: "voice_need_1_finance_summary:total_expense",
          dataNeedId: "voice_need_1_finance_summary",
          label: "total_expense",
          value: 420,
          source: "finance.summary",
          confidence: 1,
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: ["finance:today"],
    });

    const session = await createVoiceSessionState({
      userId: 1,
      userType: "oauth",
      userPlan: "free",
    });

    const result = await executeVoiceTool({
      toolName: "finance_query",
      args: { kind: "summary", period: "today" },
      ctx: {
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        sessionId: session.sessionId,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      tool: "finance_query",
      facts: [expect.objectContaining({ label: "total_expense", value: 420 })],
      retrievalPolicy: {
        embedding: "skipped",
        reason: "structured_sql_or_cached_facts_do_not_need_embedding",
      },
    });
    expect(resolveKernelDataNeeds).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, userType: "oauth" }),
      [
        expect.objectContaining({
          kind: "finance.summary",
          scope: expect.objectContaining({ period: "today" }),
        }),
      ],
    );
  });

  it("marks voice memory search as Fireworks/Qwen retrieval when embedding trace is present", async () => {
    vi.mocked(retrieveMemoryContext).mockResolvedValueOnce({
      query: "camera goal",
      capsules: [],
      memories: [],
      actions: [],
      facts: [
        {
          id: "memory.search:memory_1",
          dataNeedId: "memory.search",
          label: "memory_1",
          value: "Camera goal 91000 EGP",
          source: "memory.search",
          confidence: 0.95,
        },
      ],
      artifacts: [],
      errors: [],
      cacheHits: ["embedding:query_embedded", "embedding:fireworks", "embedding:rows:22"],
    });

    const session = await createVoiceSessionState({
      userId: 1,
      userType: "oauth",
      userPlan: "free",
    });

    const result = await executeVoiceTool({
      toolName: "memory_search",
      args: { query: "camera goal", limit: 5 },
      ctx: {
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        sessionId: session.sessionId,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      tool: "memory_search",
      dataNeeds: [expect.objectContaining({ kind: "memory.search" })],
      embeddingApiStatus: "fireworks_live_call",
      retrievalPolicy: {
        embedding: "fireworks_qwen",
        reason: "memory_search_semantic_retrieval",
        vectorRows: 22,
      },
    });
  });

  it("exposes voice wallet, comparison, and goal progress queries as exact kernel data needs", async () => {
    const financeTool = VOICE_TOOL_DECLARATIONS.find((tool) => tool.name === "finance_query");
    const properties = financeTool?.parameters.properties as Record<string, unknown> | undefined;
    const kindSchema = properties?.kind as { enum?: string[] } | undefined;
    expect(kindSchema?.enum).toEqual(
      expect.arrayContaining(["wallet_summary", "period_comparison", "goal_progress"]),
    );
    expect(properties).toEqual(
      expect.objectContaining({
        startDate: expect.objectContaining({ type: "string" }),
        endDate: expect.objectContaining({ type: "string" }),
      }),
    );

    const session = await createVoiceSessionState({
      userId: 1,
      userType: "oauth",
      userPlan: "free",
    });
    const ctx = {
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      sessionId: session.sessionId,
    };

    await executeVoiceTool({
      toolName: "finance_query",
      args: { kind: "wallet_summary" },
      ctx,
    });
    await executeVoiceTool({
      toolName: "finance_query",
      args: { kind: "period_comparison", period: "current_month", category: "food" },
      ctx,
    });
    await executeVoiceTool({
      toolName: "finance_query",
      args: { kind: "goal_progress" },
      ctx,
    });
    await executeVoiceTool({
      toolName: "finance_query",
      args: {
        kind: "chart",
        period: "custom",
        category: "food",
        granularity: "month",
        startDate: "2026-01-01",
        endDate: "2026-06-15",
        limit: 6,
      },
      ctx,
    });

    expect(resolveKernelDataNeeds).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userId: 1, userType: "oauth" }),
      [
        expect.objectContaining({
          kind: "wallet.summary",
          scope: {},
        }),
      ],
    );
    expect(resolveKernelDataNeeds).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId: 1, userType: "oauth" }),
      [
        expect.objectContaining({
          kind: "finance.period_comparison",
          scope: expect.objectContaining({
            period: "current_month",
            comparePeriod: "previous_month",
            category: "food",
          }),
        }),
      ],
    );
    expect(resolveKernelDataNeeds).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ userId: 1, userType: "oauth" }),
      [
        expect.objectContaining({
          kind: "finance.goal_progress",
          scope: {},
        }),
      ],
    );
    expect(resolveKernelDataNeeds).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ userId: 1, userType: "oauth" }),
      [
        expect.objectContaining({
          kind: "chart.data",
          scope: expect.objectContaining({
            period: "custom",
            category: "food",
            granularity: "month",
            startDate: "2026-01-01",
            endDate: "2026-06-15",
            limit: 6,
          }),
        }),
      ],
    );
  });

  it("keeps voice actions pending in session state before confirmation", async () => {
    const session = await createVoiceSessionState({
      userId: 1,
      userType: "oauth",
      userPlan: "free",
    });
    const ctx = {
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      sessionId: session.sessionId,
    };

    const draft = await executeVoiceTool({
      toolName: "action_draft",
      args: {
        actionName: "goal.create",
        title: "Car goal",
        targetAmount: 100000,
      },
      ctx,
    });

    expect(draft).toMatchObject({
      ok: true,
      tool: "action_draft",
      action: expect.objectContaining({
        actionName: "goal.create",
        status: "pending_confirmation",
      }),
    });
    expect((await getVoiceSessionState(session.sessionId))?.pendingActions).toHaveLength(1);

    const confirmed = await executeVoiceTool({
      toolName: "action_confirm",
      args: {},
      ctx,
    });

    expect(confirmed).toMatchObject({
      ok: true,
      tool: "action_confirm",
      result: expect.objectContaining({ status: "executed" }),
    });
    expect(createPendingGoalAction).toHaveBeenCalledOnce();
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }), 700);
  });
});
