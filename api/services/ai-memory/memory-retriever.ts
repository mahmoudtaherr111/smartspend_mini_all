import { and, desc, eq } from "drizzle-orm";
import {
  aiActionMemory,
  aiConversationSummaries,
  aiMemoryEmbeddings,
  aiMemoryItems,
} from "../../../db/schema";
import { withCacheStatus, cacheIncr, cacheGet } from "../../lib/redis-client";
import { db } from "../../queries/connection";
import type { DataNeed, ResolvedFact } from "../ai-kernel/types";
import { FireworksEmbeddingClient } from "./embedding-client";
import { loadEmbeddingConfig } from "./embedding-settings";
import { reformulateMemoryQuery } from "./retrieval-enhancements";
import {
  cosineSimilarity,
  isLowSignalMemoryText,
  keywordTokens,
  lexicalScore,
  localDateTime,
  specificTokenScore,
} from "./text-utils";
import type {
  MemoryResolverResult,
  MemoryRetrievalContext,
  MemoryRetrievalResult,
  MemoryType,
  RetrievedMemory,
} from "./types";

export async function invalidateMemoryUserCache(
  userId: number | string,
  userType: string,
): Promise<number> {
  await cacheIncr(`ai_memgen:${userId}:${userType}`);
  return 1;
}

function recencyBoost(date: Date | null | undefined): number {
  if (!date) return 0;
  const ageMs = Date.now() - date.getTime();
  const ageDays = Math.max(0, ageMs / (24 * 60 * 60 * 1000));
  return Math.max(0, 0.15 - ageDays / 1000);
}

function memoryFact(dataNeedId: string, item: RetrievedMemory, index: number): ResolvedFact {
  return {
    id: `${dataNeedId}:memory_${index + 1}`,
    dataNeedId,
    label: `memory_${index + 1}`,
    value: item.content,
    source: "memory.search",
    confidence: Math.min(1, Math.max(0.1, item.score)),
    evidence: [
      {
        id: item.id,
        label: item.source,
        value: item.importance,
      },
    ],
  };
}

function scoreAndSort(query: string, items: RetrievedMemory[], limit: number): RetrievedMemory[] {
  return items
    .map((item) => ({
      ...item,
      score:
        item.score +
        lexicalScore(query, item.content) +
        specificTokenScore(query, item.content) +
        item.importance / 1000 +
        recencyBoost(item.createdAt),
    }))
    .filter((item) => item.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function parseVector(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const vector = value.map((item) => Number(item));
  return vector.length > 0 && vector.every(Number.isFinite) ? vector : undefined;
}

function mergeMemoryCandidates(candidates: RetrievedMemory[][], limit: number): RetrievedMemory[] {
  const merged = new Map<string, RetrievedMemory>();

  for (const list of candidates) {
    for (const item of list) {
      const key = String(item.id);
      const existing = merged.get(key);
      if (!existing || item.score > existing.score) {
        merged.set(key, item);
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function focusSpecificCandidates(query: string, items: RetrievedMemory[]): RetrievedMemory[] {
  const scored = items.map((item) => ({
    item,
    specificScore: specificTokenScore(query, item.content),
  }));
  const focused = scored.filter((entry) => entry.specificScore > 0).map((entry) => entry.item);
  return focused.length > 0 ? focused : items;
}

function hasStrongLexicalMemoryMatch(query: string, items: RetrievedMemory[]): boolean {
  const queryTokens = keywordTokens(query);
  if (queryTokens.size === 0) return false;

  return items.some((item) => {
    const lexical = lexicalScore(query, item.content);
    const specific = specificTokenScore(query, item.content);
    return lexical >= 0.42 && specific >= 0;
  });
}

export function selectMemoryCandidatesForFacts(
  query: string,
  input: {
    memories: RetrievedMemory[];
    capsules: RetrievedMemory[];
    actions: RetrievedMemory[];
  },
  limit: number,
): RetrievedMemory[] {
  const candidatePool = [...input.memories, ...input.capsules, ...input.actions].sort(
    (a, b) => b.score - a.score,
  );
  const focused = focusSpecificCandidates(query, candidatePool);
  const hasDirectMemory = focused.some((item) => item.source === "memory");
  const cleaned = hasDirectMemory ? focused.filter((item) => item.source !== "capsule") : focused;
  return (cleaned.length > 0 ? cleaned : focused).slice(0, limit);
}

async function loadVectorMemories(
  ctx: MemoryRetrievalContext,
  scoringQuery: string,
  limit: number,
): Promise<{ items: RetrievedMemory[]; cacheHits: string[]; errors: string[] }> {
  const config = await loadEmbeddingConfig("memory");
  if (!config.enabled) {
    return { items: [], cacheHits: ["embedding:disabled"], errors: [] };
  }

  const client = new FireworksEmbeddingClient(config);
  const embedded = await client.embedText({
    text: scoringQuery,
    dimensions: config.dimensions,
    userId: ctx.userId,
    userType: ctx.userType,
  });
  const queryVector = embedded.vector;
  const queryTokens = keywordTokens(scoringQuery);
  const rows = await db
    .select({
      memoryItemId: aiMemoryItems.id,
      memoryType: aiMemoryItems.memoryType,
      content: aiMemoryItems.content,
      importance: aiMemoryItems.importance,
      sourceConversationId: aiMemoryItems.sourceConversationId,
      updatedAt: aiMemoryItems.updatedAt,
      vector: aiMemoryEmbeddings.vector,
      dimensions: aiMemoryEmbeddings.dimensions,
    })
    .from(aiMemoryEmbeddings)
    .innerJoin(aiMemoryItems, eq(aiMemoryEmbeddings.memoryItemId, aiMemoryItems.id))
    .where(
      and(
        eq(aiMemoryEmbeddings.userId, ctx.userId),
        eq(aiMemoryEmbeddings.userType, ctx.userType),
        eq(aiMemoryItems.userId, ctx.userId),
        eq(aiMemoryItems.userType, ctx.userType),
        eq(aiMemoryEmbeddings.model, config.model),
        eq(aiMemoryEmbeddings.dimensions, embedded.dimensions),
        eq(aiMemoryItems.status, "active"),
      ),
    )
    .limit(160);

  const items = rows
    .filter((row) => !isLowSignalMemoryText(row.content))
    .map((row) => {
      const vector = parseVector(row.vector);
      const vectorScore = cosineSimilarity(queryVector, vector);
      const lexical = lexicalScore(scoringQuery, row.content);
      const originalLexical = lexicalScore(ctx.query, row.content);
      const specificScore = specificTokenScore(ctx.query, row.content);
      const vectorContribution =
        queryTokens.size > 0 && (lexical === 0 || specificScore < 0) ? vectorScore * 0.25 : vectorScore;
      return {
        id: row.memoryItemId,
        type: row.memoryType as MemoryType,
        content: row.content,
        score:
          vectorContribution +
          lexical * 0.15 +
          originalLexical * 0.55 +
          specificScore +
          (row.importance ?? 50) / 1200 +
          recencyBoost(localDateTime(row.updatedAt)),
        importance: row.importance ?? 50,
        source: "memory" as const,
        sourceConversationId: row.sourceConversationId,
        createdAt: localDateTime(row.updatedAt),
      };
    })
    .filter((item) => item.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    items,
    cacheHits: [
      embedded.cacheHit ? "embedding:query_cache_hit" : "embedding:query_embedded",
      embedded.fallback ? `embedding:fallback:${embedded.fallbackReason ?? "unknown"}` : "embedding:fireworks",
      embedded.requestModel && embedded.requestModel !== embedded.model ? `embedding:model_alias:${embedded.requestModel}` : "",
      `embedding:rows:${rows.length}`,
    ].filter(Boolean),
    errors: [],
  };
}

async function computeMemoryContext(
  ctx: MemoryRetrievalContext,
  limit: number,
  candidateLimit: number,
  scoringQuery: string,
  reformulated: ReturnType<typeof reformulateMemoryQuery>,
): Promise<MemoryRetrievalResult> {
  const [summaryRows, memoryRows, actionRows] = await Promise.all([
    db
      .select()
      .from(aiConversationSummaries)
      .where(and(eq(aiConversationSummaries.userId, ctx.userId), eq(aiConversationSummaries.userType, ctx.userType)))
      .orderBy(desc(aiConversationSummaries.updatedAt))
      .limit(10),
    db
      .select()
      .from(aiMemoryItems)
      .where(
        and(
          eq(aiMemoryItems.userId, ctx.userId),
          eq(aiMemoryItems.userType, ctx.userType),
          eq(aiMemoryItems.status, "active"),
        ),
      )
      .orderBy(desc(aiMemoryItems.updatedAt))
      .limit(80),
    db
      .select()
      .from(aiActionMemory)
      .where(and(eq(aiActionMemory.userId, ctx.userId), eq(aiActionMemory.userType, ctx.userType)))
      .orderBy(desc(aiActionMemory.updatedAt))
      .limit(20),
  ]);

  const capsules = scoreAndSort(
    scoringQuery,
    summaryRows
      .filter((row) => !isLowSignalMemoryText(row.capsule))
      .map((row) => ({
      id: `conversation:${row.conversationId}`,
      type: "summary" as MemoryType,
      content: row.capsule,
      score: 0,
      importance: 45,
      source: "capsule" as const,
      sourceConversationId: row.conversationId,
      createdAt: localDateTime(row.updatedAt),
    })),
    Math.min(10, candidateLimit),
  );

  const lexicalMemories = scoreAndSort(
    ctx.query,
    memoryRows
      .filter((row) => !isLowSignalMemoryText(row.content))
      .map((row) => ({
      id: row.id,
      type: row.memoryType as MemoryType,
      content: row.content,
      score: 0,
      importance: row.importance ?? 50,
      source: "memory" as const,
      sourceConversationId: row.sourceConversationId,
      createdAt: localDateTime(row.updatedAt),
    })),
    candidateLimit,
  );
  // A precise lexical match answers the common "فاكر ...؟" case reliably. Do
  // not buy an embedding request just to rediscover the same stored memory.
  // Semantic lookup is retained as a fallback for ambiguous wording.
  const vectorResult = hasStrongLexicalMemoryMatch(ctx.query, lexicalMemories)
    ? { items: [] as RetrievedMemory[], cacheHits: ["embedding:skipped_lexical_hit"], errors: [] as string[] }
    : await loadVectorMemories(ctx, scoringQuery, candidateLimit).catch((error: unknown) => ({
        items: [],
        cacheHits: [],
        errors: [`embedding_retrieval:${error instanceof Error ? error.message : String(error)}`],
      }));
  const memories = mergeMemoryCandidates([vectorResult.items, lexicalMemories], candidateLimit);

  const actions = scoreAndSort(
    scoringQuery,
    actionRows.map((row) => ({
      id: row.id,
      type: "action" as MemoryType,
      content: `${row.actionName}: ${row.summary}`,
      score: 0,
      importance: 60,
      source: "action" as const,
      sourceConversationId: row.sourceConversationId,
      createdAt: localDateTime(row.updatedAt),
    })),
    Math.min(5, candidateLimit),
  );

  const selected = selectMemoryCandidatesForFacts(ctx.query, { memories, capsules, actions }, limit);

  const result: MemoryRetrievalResult = {
    query: ctx.query,
    capsules: focusSpecificCandidates(ctx.query, capsules).slice(0, limit),
    memories: focusSpecificCandidates(ctx.query, memories).slice(0, limit),
    actions: focusSpecificCandidates(ctx.query, actions).slice(0, limit),
    facts: selected.map((item, index) => memoryFact("memory.search", item, index)),
    artifacts: [],
    errors: [],
    cacheHits: [],
  };
  if (reformulated.terms.length > 0) {
    result.cacheHits.push(`query_reformulated:${reformulated.reason}`);
  }
  result.cacheHits.push(...vectorResult.cacheHits);
  result.errors.push(...vectorResult.errors);

  return result;
}

function cacheKey(ctx: {
  userId: number | string;
  userType: string;
  query: string;
  limit: number;
  gen?: number;
}): string {
  const normQuery = ctx.query.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 120);
  return `ai_mem:v1:g${ctx.gen ?? 0}:${ctx.userType}:${ctx.userId}:${ctx.limit}:${normQuery}`;
}

export async function retrieveMemoryContext(
  ctx: MemoryRetrievalContext,
): Promise<MemoryRetrievalResult> {
  const limit = Math.min(Math.max(ctx.limit ?? 6, 1), 12);
  const candidateLimit = Math.min(12, Math.max(limit * 2, limit));
  const reformulated = reformulateMemoryQuery(ctx.query);
  const scoringQuery = reformulated.expanded;
  const gen = await cacheGet(`ai_memgen:${ctx.userId}:${ctx.userType}`)
    .then((v) => (v ? parseInt(v, 10) : 0))
    .catch(() => 0);
  const key = cacheKey({ ...ctx, limit, gen });
  const cached = await withCacheStatus(key, 5 * 60, () =>
    computeMemoryContext(ctx, limit, candidateLimit, scoringQuery, reformulated),
  );

  return {
    ...cached.value,
    cacheHits: [
      `memory_cache:${cached.hit ? "hit" : "miss"}:${cached.backend}`,
      ...(cached.value.cacheHits ?? []),
    ],
  };
}

export async function resolveMemoryDataNeeds(
  ctx: Omit<MemoryRetrievalContext, "query" | "limit">,
  dataNeeds: DataNeed[],
): Promise<MemoryResolverResult> {
  const facts: ResolvedFact[] = [];
  const errors: string[] = [];
  const cacheHits: string[] = [];
  const handledNeeds = dataNeeds.filter((need) => need.kind === "memory.search");

  for (const need of handledNeeds) {
    try {
      const result = await retrieveMemoryContext({
        ...ctx,
        query: need.scope?.query ?? "",
        limit: need.scope?.limit ?? need.maxRows ?? 6,
      });
      facts.push(
        ...result.facts.map((fact) => ({
          ...fact,
          id: fact.id.replace("memory.search", need.id),
          dataNeedId: need.id,
        })),
      );
      cacheHits.push(...result.cacheHits);
    } catch (error) {
      errors.push(`${need.id}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    facts,
    artifacts: [],
    errors,
    cacheHits,
    handledNeeds,
  };
}
