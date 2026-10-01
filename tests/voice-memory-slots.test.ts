import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../api/queries/connection";
import {
  aiMemoryItems,
  aiMemoryEmbeddings,
  aiConversationSummaries,
  chatConversations,
  chatMessages,
  localUsers,
  users,
  voiceCalls,
  voiceCallIncidents,
} from "../db/schema";
import { databaseDeps } from "../api/services/voice/post-call";
import { memoryBrief } from "../api/services/voice/brain/snapshot";
import {
  putMemory,
  withMemoryOwnerLock,
} from "../api/services/ai-memory/slot-store";
import { contentHash } from "../api/services/ai-memory/text-utils";
import { mysqlCallPersistence } from "../api/services/voice/gateway/persistence";
import { writeConversationMemory } from "../api/services/ai-memory/memory-writer";
import { chatRouter } from "../api/chat-router";

vi.mock("../api/services/ai-memory/embedding-settings", () => ({
  loadEmbeddingConfig: vi.fn(async () => ({ enabled: false })),
}));

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_947, userType: "local" };
/** The same numeric id as a Google account: another person. */
const other = { userId: 88_947, userType: "oauth" };

async function clean() {
  const conversations = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.userId, user.userId),
        eq(chatConversations.userType, user.userType),
      ),
    );
  if (conversations.length)
    await db.delete(chatMessages).where(
      inArray(
        chatMessages.conversationId,
        conversations.map((row) => row.id),
      ),
    );
  for (const table of [
    chatConversations,
    aiConversationSummaries,
    aiMemoryEmbeddings,
  ]) {
    await db
      .delete(table)
      .where(
        and(eq(table.userId, user.userId), eq(table.userType, user.userType)),
      );
  }
  for (const who of [user, other]) {
    await db.delete(aiMemoryItems).where(and(eq(aiMemoryItems.userId, who.userId), eq(aiMemoryItems.userType, who.userType)));
  }
  await db
    .delete(voiceCallIncidents)
    .where(
      and(
        eq(voiceCallIncidents.userId, user.userId),
        eq(voiceCallIncidents.userType, user.userType),
      ),
    );
  await db
    .delete(voiceCalls)
    .where(
      and(
        eq(voiceCalls.userId, user.userId),
        eq(voiceCalls.userType, user.userType),
      ),
    );
}

const call = (endedAt: string) => ({ ...user, endedAt: new Date(endedAt) });

describe("remembered things with a slot", () => {
  itWithDatabase(
    "forgetting prevents delayed voice summaries and old chat messages from recreating a fact",
    async () => {
      const [created] = await db
        .insert(chatConversations)
        .values({ ...user, title: "MEMORY_TEST" });
      const conversationId = Number(created.insertId);
      await db.insert(chatMessages).values([
        {
          conversationId,
          role: "user",
          content: "remember this plan goal buy laptop",
        },
        {
          conversationId,
          role: "assistant",
          content: "I will remember the laptop plan.",
        },
      ]);
      const input = { ...user, conversationId, messages: [] };
      expect((await writeConversationMemory(input)).memories).toHaveLength(1);
      const [saved] = await db
        .select({ id: aiMemoryItems.id })
        .from(aiMemoryItems)
        .where(
          and(
            eq(aiMemoryItems.userId, user.userId),
            eq(aiMemoryItems.userType, user.userType),
          ),
        );
      const callId = "vc_memory_forget_test";
      await db.insert(voiceCalls).values({
        ...user,
        id: callId,
        status: "ended",
        model: "gemini-3.8-live",
        engine: "gemini_live",
        voice: "Kore",
        month: "2026-10",
        maxSeconds: 120,
        memoryStatus: "writing",
      });
      const caller = chatRouter.createCaller({
        user: {
          id: user.userId,
          type: "local",
          name: "MEMORY_TEST",
          role: "user",
          plan: "pro",
        },
        req: new Request("http://local.test/trpc"),
        ip: "memory-test",
      });
      await caller.forgetMemory({ memoryId: saved.id });
      expect((await writeConversationMemory(input)).memories).toHaveLength(0);
      const [callRow] = await db
        .select({ state: voiceCalls.memoryStatus })
        .from(voiceCalls)
        .where(eq(voiceCalls.id, callId));
      expect(callRow.state).toBe("suppressed");
      await databaseDeps.setStatus(callId, "saved");
      expect(
        await databaseDeps.write(
          call("2026-10-01T10:00:00Z"),
          callId,
          { summary: "old", closes: [], facts: [] },
          { requireTranscript: true },
        ),
      ).toBe(false);
      await db.insert(chatMessages).values({
        conversationId,
        role: "user",
        content: "remember my new goal buy a phone",
      });
      expect((await writeConversationMemory(input)).memories).toHaveLength(1);
      await caller.clearAllMemories();
      expect(await databaseDeps.existing(call("2026-10-01T10:00:00Z"))).toEqual(
        [],
      );
      await caller.clearConversation({ conversationId });
      expect((await writeConversationMemory(input)).memories).toHaveLength(0);
    },
  );
  itWithDatabase(
    "claims a financial draft durably once, including parallel and post-checkpoint retries",
    async () => {
      const callId = "vc_memory_write_claim_test";
      await db.insert(voiceCalls).values({
        ...user,
        id: callId,
        status: "live",
        model: "gemini-3.8-live",
        engine: "gemini_live",
        voice: "Kore",
        month: "2026-10",
        maxSeconds: 120,
      });
      const results = await Promise.all(
        [1, 2].map(() =>
          mysqlCallPersistence.claimWrite!(callId, "dr_abcdefgh-jkl"),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      await mysqlCallPersistence.checkpoint(callId, {
        status: "live",
        billedSeconds: 3,
        turns: 1,
        toolCalls: 1,
        incidents: 0,
        reconnects: 0,
        tokens: { input: {}, output: {}, thoughts: 0 },
        costUsd: 0,
        metrics: { mode: "standard" },
      });
      expect(
        await mysqlCallPersistence.claimWrite!(callId, "dr_abcdefgh-jkl"),
      ).toBe(false);
      expect(
        await mysqlCallPersistence.claimWrite!(callId, "dr_abcdefgh-other"),
      ).toBe(true);
    },
  );
  let created = false;
  beforeAll(async () => {
    if (process.env.RUN_DB_INTEGRATION !== "1") return;
    const [local] = await db
      .select({ id: localUsers.id })
      .from(localUsers)
      .where(eq(localUsers.id, user.userId));
    const [oauth] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, other.userId));
    if (local || oauth) throw new Error("memory_fixture_exists");
    await db.insert(localUsers).values({
      id: user.userId,
      name: "MEMORY_TEST",
      phone: "MEMORY_TEST_88947",
      password: "synthetic",
    });
    await db.insert(users).values({
      id: other.userId,
      name: "MEMORY_TEST",
      unionId: "MEMORY_TEST_88947",
    });
    created = true;
  });
  beforeEach(clean);
  afterAll(async () => {
    if (!created) return;
    await clean();
    await db.delete(localUsers).where(eq(localUsers.id, user.userId));
    await db.delete(users).where(eq(users.id, other.userId));
  });

  itWithDatabase(
    "serializes simultaneous slot updates and rejects a delayed older summary",
    async () => {
      const fact = (content: string) => ({
        type: "fact" as const,
        slot: "income.payday",
        content,
        importance: 70,
        replaces: null,
      });
      await Promise.all([
        databaseDeps.write(call("2026-09-25T12:00:00Z"), "vc_new", {
          summary: "",
          closes: [],
          facts: [fact("بيقبض يوم 27")],
        }),
        databaseDeps.write(call("2026-09-24T12:00:00Z"), "vc_old", {
          summary: "",
          closes: [],
          facts: [fact("بيقبض يوم 25")],
        }),
      ]);
      const current = await databaseDeps.existing(call("2026-09-26T12:00:00Z"));
      expect(
        current
          .filter((row) => row.slot === "income.payday")
          .map((row) => row.content),
      ).toEqual(["بيقبض يوم 27"]);
    },
  );

  itWithDatabase(
    "rolls back the replacement when a write fails, keeping the previous value",
    async () => {
      await databaseDeps.write(call("2026-09-22T12:00:00Z"), "vc_first", {
        summary: "",
        closes: [],
        facts: [
          {
            type: "fact",
            slot: "income.payday",
            content: "بيقبض يوم 25",
            importance: 70,
            replaces: null,
          },
        ],
      });
      await expect(
        withMemoryOwnerLock(user, async (tx) => {
          await putMemory(
            tx,
            user,
            {
              ...user,
              memoryType: "fact",
              content: "بيقبض يوم 27",
              contentHash: contentHash("بيقبض يوم 27"),
              metadata: { slot: "income.payday" },
            },
            new Date("2026-09-23T12:00:00Z"),
          );
          throw new Error("synthetic_failure");
        }),
      ).rejects.toThrow("synthetic_failure");
      expect(
        (await databaseDeps.existing(call("2026-09-24T12:00:00Z")))[0].content,
      ).toBe("بيقبض يوم 25");
    },
  );

  itWithDatabase("keeps one current value per slot, for this user only", async () => {
    await databaseDeps.write({ ...other, endedAt: new Date("2026-09-01T10:00:00Z") }, "vc_other", {
      summary: "", closes: [], facts: [{ type: "fact", slot: "income.payday", content: "حساب تاني بيقبض يوم 1", importance: 70, replaces: null }],
    });
    await databaseDeps.write(call("2026-09-02T10:00:00Z"), "vc_one", {
      summary: "", closes: [], facts: [{ type: "fact", slot: "income.payday", content: "مرتبه بينزل يوم 25", importance: 70, replaces: null }],
    });
    await databaseDeps.write(call("2026-09-20T10:00:00Z"), "vc_two", {
      summary: "", closes: [], facts: [{ type: "fact", slot: "income.payday", content: "مرتبه بقى بينزل يوم 27", importance: 70, replaces: null }],
    });
    const mine = await databaseDeps.existing(call("2026-09-21T10:00:00Z"));
    expect(mine.filter((item) => item.slot === "income.payday").map((item) => [item.content, item.day])).toEqual([["مرتبه بقى بينزل يوم 27", "2026-09-20"]]);
    const theirs = await databaseDeps.existing({ ...other, endedAt: null });
    expect(theirs.map((item) => item.content)).toEqual(["حساب تاني بيقبض يوم 1"]);
  });

  itWithDatabase("lets a refusal expire, and closes a follow-up the next call settled", async () => {
    await databaseDeps.write(call("2026-08-01T10:00:00Z"), "vc_old", {
      summary: "", closes: [], facts: [{ type: "refusal", slot: "refusal:food_budget", content: "مش عايز ميزانية للأكل دلوقتي", importance: 60, replaces: null }],
    });
    await databaseDeps.write(call("2026-09-25T10:00:00Z"), "vc_new", {
      summary: "", closes: [], facts: [{ type: "followup", slot: "followup:installment_amount", content: "هيشوف قيمة القسط ويقولها", importance: 60, replaces: null }],
    });
    const before = await databaseDeps.existing(call("2026-09-26T10:00:00Z"));
    // The refusal was said two months ago: its 30 days are over, so it is not carried on.
    expect(before.map((item) => item.type)).toEqual(["followup"]);
    await databaseDeps.write(call("2026-09-27T10:00:00Z"), "vc_next", { summary: "", facts: [], closes: [before[0].id] });
    expect(await databaseDeps.existing(call("2026-09-28T10:00:00Z"))).toEqual([]);
  });

  itWithDatabase("opens a call with what is known, grouped, dated, and without what expired", async () => {
    await databaseDeps.write(call("2026-09-10T10:00:00Z"), "vc_a", {
      summary: "اتكلم عن الموبايل.",
      closes: [],
      facts: [
        { type: "fact", slot: "income.payday", content: "مرتبه بينزل يوم 25", importance: 70, replaces: null },
        { type: "plan", slot: "goal:phone", content: "بيحوش لموبايل بتلاتين ألف", importance: 80, replaces: null },
        { type: "refusal", slot: "refusal:food_budget", content: "مش عايز ميزانية للأكل دلوقتي", importance: 60, replaces: null },
        { type: "followup", slot: "followup:installment_amount", content: "هيشوف قيمة القسط ويقولها", importance: 60, replaces: null },
      ],
    });
    const brief = await memoryBrief({ callId: "vc_b", userId: user.userId, userType: "local", plan: "pro", role: "user" }, new Date("2026-09-15T10:00:00Z"));
    const text = brief.join("\n");
    expect(text).toContain("مرتبه بينزل يوم 25 (10/9)");
    expect(text).toContain("بيحوش لموبايل");
    expect(text).toMatch(/مفتوح[\s\S]*هيشوف قيمة القسط/);
    expect(text).toMatch(/رفض[\s\S]*ميزانية للأكل/);
    // A month later the refusal and the follow-up have expired.
    const later = (await memoryBrief({ callId: "vc_c", userId: user.userId, userType: "local", plan: "pro", role: "user" }, new Date("2026-11-20T10:00:00Z"))).join("\n");
    expect(later).not.toContain("ميزانية للأكل");
    expect(later).not.toContain("قيمة القسط");
    expect(later).toContain("مرتبه بينزل يوم 25");
  });
});
