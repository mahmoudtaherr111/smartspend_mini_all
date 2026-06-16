import { readFileSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { QdrantVectorStore } from "./qdrant-vector-store";
import { QuantizedOnDiskVectorStore } from "./quantized-vector-store";
import { reformulateMemoryQuery } from "./retrieval-enhancements";
import { specificTokenScore } from "./text-utils";
import { InMemoryVectorStore } from "./vector-store";

describe("memory vector store interface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches by lexical fallback when vectors are not present", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      {
        id: "memory-1",
        userId: 1,
        userType: "oauth",
        text: "اتفقنا ان المستخدم يحوش 100 الف للعربية",
      },
      {
        id: "memory-2",
        userId: 2,
        userType: "oauth",
        text: "مستخدم اخر لديه خطة مختلفة",
      },
    ]);

    const results = await store.search({
      userId: 1,
      userType: "oauth",
      text: "فاكر خطة العربية؟",
      limit: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("memory-1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("keeps the SQL memory retriever scoped by user id and user type", () => {
    const source = readFileSync(
      resolve(process.cwd(), "api/services/ai-memory/memory-retriever.ts"),
      "utf8",
    );

    expect(source).toContain("eq(aiMemoryEmbeddings.userId, ctx.userId)");
    expect(source).toContain("eq(aiMemoryEmbeddings.userType, ctx.userType)");
    expect(source).toContain("eq(aiConversationSummaries.userId, ctx.userId)");
    expect(source).toContain("eq(aiConversationSummaries.userType, ctx.userType)");
    expect(source).toContain("eq(aiMemoryItems.userId, ctx.userId)");
    expect(source).toContain("eq(aiMemoryItems.userType, ctx.userType)");
    expect(source).toContain("eq(aiActionMemory.userId, ctx.userId)");
    expect(source).toContain("eq(aiActionMemory.userType, ctx.userType)");
  });

  it("keeps Fireworks embeddings out of transaction and finance resolvers", () => {
    const financeResolverSource = readFileSync(
      resolve(process.cwd(), "api/services/finance-semantic-layer/resolvers.ts"),
      "utf8",
    );
    const writerSource = readFileSync(
      resolve(process.cwd(), "api/services/ai-memory/memory-writer.ts"),
      "utf8",
    );
    const backfillSource = readFileSync(
      resolve(process.cwd(), "api/services/ai-memory/embedding-backfill.ts"),
      "utf8",
    );

    expect(financeResolverSource).not.toContain("FireworksEmbeddingClient");
    expect(financeResolverSource).not.toContain("embedText(");
    expect(writerSource).not.toContain("expenses");
    expect(backfillSource).not.toContain("expenses");
  });

  it("expands domain queries before scoring memory candidates", async () => {
    const query = reformulateMemoryQuery("فاكر خطة العربية؟");

    expect(query.expanded).toContain("ادخار");
    expect(query.reason).toContain("goal_or_saving_query");
  });

  it("boosts specific memory terms over generic goal terms", () => {
    const query = "فاكر اتفقنا على هدف الكاميرا أو الموبايل؟";
    const camera = specificTokenScore(query, "حطلي هدف احوش 91000 عشان اجيب كاميرا خلال 9 شهور");
    const car = specificTokenScore(query, "عايز أحوش 123000 جنيه عشان أجيب عربية");

    expect(camera).toBeGreaterThan(0);
    expect(car).toBeLessThan(0);
    expect(camera).toBeGreaterThan(car);
  });

  it("persists quantized vectors on disk and searches them back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "smartspend-vectors-"));
    const file = join(dir, "store.json");
    try {
      const store = new QuantizedOnDiskVectorStore(file);
      await store.upsert([
        {
          id: "memory-a",
          userId: 1,
          userType: "oauth",
          text: "car goal",
          vector: [1, 0, 0],
        },
        {
          id: "memory-b",
          userId: 1,
          userType: "oauth",
          text: "food spending",
          vector: [0, 1, 0],
        },
        {
          id: "memory-other-user",
          userId: 2,
          userType: "oauth",
          text: "car goal from another user",
          vector: [1, 0, 0],
        },
      ]);

      const reloaded = new QuantizedOnDiskVectorStore(file);
      const results = await reloaded.search({
        userId: 1,
        userType: "oauth",
        text: "car",
        vector: [1, 0, 0],
        limit: 2,
      });

      expect(results[0].id).toBe("memory-a");
      expect(results.every((result) => result.document.userId === 1)).toBe(true);
      expect(results[0].document.vector).toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses Qdrant behind the same vector store interface", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { operation_id: 1 } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [
            {
              id: "point-other-user",
              score: 0.99,
              payload: {
                id: "memory-other-user",
                userId: 2,
                userType: "oauth",
                text: "other user qdrant memory",
                metadata: { source: "memory" },
              },
            },
            {
              id: "point-1",
              score: 0.88,
              payload: {
                id: "memory-q",
                userId: 1,
                userType: "oauth",
                text: "qdrant memory",
                metadata: { source: "memory" },
              },
            },
          ],
        }),
      } as Response);

    const store = new QdrantVectorStore({
      baseUrl: "http://qdrant.test",
      collection: "ai_memory",
      apiKey: "test",
    });

    await store.upsert([
      {
        id: "memory-q",
        userId: 1,
        userType: "oauth",
        text: "qdrant memory",
        vector: [0.1, 0.2],
      },
    ]);
    const results = await store.search({
      userId: 1,
      userType: "oauth",
      text: "memory",
      vector: [0.1, 0.2],
      limit: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const searchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}"));
    expect(searchBody.filter.must).toEqual(
      expect.arrayContaining([
        { key: "userId", match: { value: 1 } },
        { key: "userType", match: { value: "oauth" } },
      ]),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "memory-q",
      score: 0.88,
      document: expect.objectContaining({ userId: 1, userType: "oauth" }),
    });
  });
});
