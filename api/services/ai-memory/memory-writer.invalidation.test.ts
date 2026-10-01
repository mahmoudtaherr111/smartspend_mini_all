import { invalidateMemoryUserCache } from "./memory-retriever";
import { writeConversationMemory } from "./memory-writer";

const { dbMock, storedMessages } = vi.hoisted(() => {
  const storedMessages: Array<{ id: number; role: string; content: string }> =
    [];
  const dbMock: any = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        for: vi.fn(() => Promise.resolve([{ id: 99, metadata: {} }])),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() =>
          Promise.resolve(
            fields?.role ? storedMessages : fields?.id ? [{ id: 123 }] : [],
          ),
        ),
      };
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onDuplicateKeyUpdate: vi.fn(() => Promise.resolve()),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => {}) })),
    })),
    transaction: vi.fn(async (work) => work(dbMock)),
  };

  return { dbMock, storedMessages };
});

vi.mock("../../queries/connection", () => ({
  db: dbMock,
}));

vi.mock("./embedding-settings", () => ({
  loadEmbeddingConfig: vi.fn(async () => ({
    enabled: false,
    provider: "fireworks",
    apiKey: "",
    baseUrl: "https://example.test",
    model: "accounts/fireworks/models/qwen3-embedding-8b",
    dimensions: 768,
  })),
}));

vi.mock("./memory-retriever", () => ({
  invalidateMemoryUserCache: vi.fn(async () => 1),
}));

describe("AI memory writer cache invalidation", () => {
  beforeEach(() => {
    dbMock.select.mockClear();
    dbMock.insert.mockClear();
    vi.mocked(invalidateMemoryUserCache).mockClear();
    storedMessages.length = 0;
  });

  it("invalidates semantic memory retrieval cache after writing a conversation memory", async () => {
    storedMessages.push(
      { id: 1, role: "user", content: "remember this plan goal buy laptop" },
      { id: 2, role: "assistant", content: "I will remember the laptop plan." },
    );
    const draft = await writeConversationMemory({
      userId: 7,
      userType: "local",
      conversationId: 99,
      source: "chat",
      messages: [
        { role: "user", content: "remember this plan goal buy laptop" },
        { role: "assistant", content: "I will remember the laptop plan." },
      ],
    });

    expect(draft.memories).toHaveLength(1);
    expect(invalidateMemoryUserCache).toHaveBeenCalledWith(7, "local");
  });

  it("does not invalidate semantic retrieval cache for recall-only conversations", async () => {
    storedMessages.push(
      {
        id: 1,
        role: "user",
        content: "فاكر الخطة اللي اتكلمنا عنها عشان القهوة والنوم؟",
      },
      {
        id: 2,
        role: "assistant",
        content: "Recalled the existing coffee and sleep plan.",
      },
    );
    const draft = await writeConversationMemory({
      userId: 7,
      userType: "local",
      conversationId: 100,
      source: "chat",
      messages: [
        {
          role: "user",
          content:
            "\u0641\u0627\u0643\u0631 \u0627\u0644\u062e\u0637\u0629 \u0627\u0644\u0644\u064a \u0627\u062a\u0643\u0644\u0645\u0646\u0627 \u0639\u0646\u0647\u0627 \u0639\u0634\u0627\u0646 \u0627\u0644\u0642\u0647\u0648\u0629 \u0648\u0627\u0644\u0646\u0648\u0645\u061f",
        },
        { role: "assistant", content: "Recalled the existing coffee and sleep plan." },
      ],
    });

    expect(draft.memories).toHaveLength(0);
    expect(invalidateMemoryUserCache).not.toHaveBeenCalled();
  });
});
