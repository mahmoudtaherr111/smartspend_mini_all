import { prefetchVoiceTurnContext } from "./voice-prefetch";
import { updateVoiceSessionState } from "./voice-session-state";
import { resolveKernelDataNeeds } from "../finance-semantic-layer";
import { resolveMemoryDataNeeds } from "../ai-memory";
import { resolveSiteGuideDataNeeds } from "../site-guide";

const { updatedStates } = vi.hoisted(() => ({
  updatedStates: [] as Array<Record<string, unknown>>,
}));

vi.mock("./voice-session-state", () => ({
  updateVoiceSessionState: vi.fn(async (_sessionId: string, updater: (state: any) => any) => {
    const next = updater({
      sessionId: "voice_test",
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      status: "active",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      pendingActions: [],
    });
    updatedStates.push(next);
    return next;
  }),
}));

vi.mock("../finance-semantic-layer", () => ({
  resolveKernelDataNeeds: vi.fn(async (_ctx: unknown, needs: Array<{ kind: string }>) => ({
    facts: needs.length
      ? [
          {
            id: "today_total",
            dataNeedId: "need",
            label: "total_expense",
            value: 420,
            source: "finance.summary",
            confidence: 1,
          },
        ]
      : [],
    artifacts: [],
    errors: [],
    cacheHits: ["finance:today"],
  })),
}));

vi.mock("../ai-memory", () => ({
  resolveMemoryDataNeeds: vi.fn(async () => ({
    facts: [],
    artifacts: [],
    errors: [],
    cacheHits: ["memory:skipped"],
    handledNeeds: [],
  })),
}));

vi.mock("../site-guide", () => ({
  resolveSiteGuideDataNeeds: vi.fn(async () => ({
    facts: [],
    artifacts: [],
    errors: [],
    cacheHits: ["site_guide:skipped"],
    handledNeeds: [],
  })),
}));

describe("voice prefetch", () => {
  beforeEach(() => {
    updatedStates.length = 0;
    vi.mocked(updateVoiceSessionState).mockClear();
    vi.mocked(resolveKernelDataNeeds).mockClear();
    vi.mocked(resolveMemoryDataNeeds).mockClear();
    vi.mocked(resolveSiteGuideDataNeeds).mockClear();
  });

  it("prefetches early voice intent facts into session state", async () => {
    const result = await prefetchVoiceTurnContext({
      ctx: {
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        sessionId: "voice_test",
      },
      transcript: "صرفت كام النهارده؟",
    });

    expect(result).toMatchObject({
      intentKind: "finance_query",
      dataNeedKinds: ["finance.summary"],
      factsPreview: [{ label: "total_expense", value: 420 }],
      cacheHits: ["finance:today"],
    });
    expect(resolveMemoryDataNeeds).not.toHaveBeenCalled();
    expect(resolveSiteGuideDataNeeds).not.toHaveBeenCalled();
    expect(updatedStates[0]).toMatchObject({
      prefetch: expect.objectContaining({ intentKind: "finance_query" }),
    });
  });

  it("does not spend semantic memory embeddings during voice prefetch", async () => {
    const result = await prefetchVoiceTurnContext({
      ctx: {
        userId: 1,
        userType: "oauth",
        userPlan: "free",
        sessionId: "voice_test",
      },
      transcript: "فاكر خطة القهوة والنوم؟",
    });

    expect(result).toMatchObject({
      intentKind: "memory_question",
      dataNeedKinds: [],
      factsPreview: [],
      cacheHits: ["voice_prefetch:skipped:memory.search"],
    });
    expect(resolveKernelDataNeeds).not.toHaveBeenCalled();
    expect(resolveMemoryDataNeeds).not.toHaveBeenCalled();
    expect(resolveSiteGuideDataNeeds).not.toHaveBeenCalled();
  });
});
