import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { chatConversations, chatMessages } from "../db/schema";
import { chatRouter } from "../api/chat-router";
import { createClarificationState } from "../api/services/ai-kernel/clarification-machine";

vi.mock("../api/services/ai-memory/embedding-settings", () => ({
  loadEmbeddingConfig: vi.fn(async () => ({ enabled: false })),
}));

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_951, userType: "local" };

async function clean() {
  const rows = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.userId, user.userId), eq(chatConversations.userType, user.userType)));
  if (rows.length) {
    await db.delete(chatMessages).where(inArray(chatMessages.conversationId, rows.map((row) => row.id)));
  }
  await db
    .delete(chatConversations)
    .where(and(eq(chatConversations.userId, user.userId), eq(chatConversations.userType, user.userType)));
}

const caller = () =>
  chatRouter.createCaller({
    user: { id: user.userId, type: "local", name: "CLARIFY_TEST", role: "user", plan: "pro" },
    req: new Request("http://local.test/trpc"),
    ip: "clarification-test",
  } as never);

describe("a reply to the assistant's clarifying question", () => {
  beforeEach(clean);
  afterAll(clean);

  itWithDatabase("reaches the clarification stored on the conversation and keeps its other metadata", async () => {
    const state = createClarificationState("record_expense", { amount: 200 }, ["category"], "صرفت 200");
    const [inserted] = await db.insert(chatConversations).values({
      userId: user.userId,
      userType: user.userType,
      title: "صرفت 200",
      messageCount: 2,
      totalTokens: 0,
      lastMessageAt: new Date(),
      metadata: { clarificationState: state, pinned: true },
    });
    const conversationId = Number((inserted as { insertId: number }).insertId);

    // Until the conversation's metadata was read, this went to the planner as a new message.
    const answer = await caller().sendMessage({ message: "الغاء", conversationId });
    expect(answer.model).toBe("local");
    expect(answer.response).toContain("لغيت");

    const [row] = await db
      .select({ metadata: chatConversations.metadata })
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId));
    expect(row.metadata).toMatchObject({ clarificationState: null, pinned: true });
  });
});
