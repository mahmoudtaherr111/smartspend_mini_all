import { describe, it, expect, beforeEach, vi } from "vitest";
import { chatRouter } from "./chat-router";

const { dbMock, selectQueries, updateQueries, deleteQueries } = vi.hoisted(() => {
  const selectQueries: Array<Record<string, unknown>> = [];
  const updateQueries: Array<Record<string, unknown>> = [];
  const deleteQueries: Array<Record<string, unknown>> = [];

  const dbMock: any = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      selectQueries.push(fields ?? {});
      const selectChain: any = {
        from: vi.fn(() => selectChain),
        where: vi.fn(() => selectChain),
        orderBy: vi.fn(() => selectChain),
        limit: vi.fn(() => selectChain),
        then: (resolve: any) => {
          if (fields && "memoryType" in fields) {
            return resolve([
              {
                id: 101,
                memoryType: "preference",
                content: "بفضل تصنيف الأكل على فئة المطاعم",
                importance: 80,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]);
          }
          if (fields && "id" in fields) {
            return resolve([{ id: 101, userId: 42, userType: "oauth" }]);
          }
          return resolve([{ id: 101, userId: 42, userType: "oauth" }]);
        },
      };
      return selectChain;
    }),
    update: vi.fn((table: unknown) => {
      return {
        set: vi.fn((values: Record<string, unknown>) => {
          updateQueries.push(values);
          return {
            where: vi.fn(() => Promise.resolve([{ affectedRows: 1 }])),
          };
        }),
      };
    }),
    delete: vi.fn((table: unknown) => {
      return {
        where: vi.fn((condition: unknown) => {
          deleteQueries.push({ table, condition });
          return Promise.resolve([{ affectedRows: 1 }]);
        }),
      };
    }),
  };

  return { dbMock, selectQueries, updateQueries, deleteQueries };
});

vi.mock("./queries/connection", () => ({
  db: dbMock,
}));

describe("chat router phase 6 memory controls & privacy", () => {
  beforeEach(() => {
    selectQueries.length = 0;
    updateQueries.length = 0;
    deleteQueries.length = 0;
    vi.clearAllMocks();
  });

  const caller = chatRouter.createCaller({
    user: {
      id: 42,
      type: "oauth",
      name: "Ahmed EGP User",
      email: "ahmed@example.com",
      role: "user",
      plan: "pro",
    },
    req: new Request("http://localhost/trpc"),
    ip: "127.0.0.1",
  });

  it("listMemories retrieves only active memories scoped to the current user", async () => {
    const result = await caller.listMemories();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 101,
      memoryType: "preference",
      content: "بفضل تصنيف الأكل على فئة المطاعم",
    });
    expect(dbMock.select).toHaveBeenCalled();
  });

  it("forgetMemory marks the memory item as forgotten and deletes corresponding embeddings", async () => {
    const result = await caller.forgetMemory({ memoryId: 101 });

    expect(result).toEqual({ success: true });
    expect(updateQueries).toContainEqual({ status: "forgotten" });
    expect(deleteQueries.length).toBeGreaterThanOrEqual(1);
  });

  it("clearAllMemories marks all active user memories as forgotten and clears user embeddings", async () => {
    const result = await caller.clearAllMemories();

    expect(result.success).toBe(true);
    expect(updateQueries).toContainEqual({ status: "forgotten" });
    expect(deleteQueries.length).toBeGreaterThanOrEqual(1);
  });

  it("clearConversation deletes conversation and messages but preserves active memories in aiMemoryItems", async () => {
    const result = await caller.clearConversation({ conversationId: 555 });

    expect(result).toEqual({ success: true });
    expect(deleteQueries.length).toBe(2); // chatMessages and chatConversations
    // Check that updateQueries or deleteQueries do not target aiMemoryItems for deletion
    const touchedMemory = updateQueries.some((q) => "status" in q);
    expect(touchedMemory).toBe(false);
  });
});
