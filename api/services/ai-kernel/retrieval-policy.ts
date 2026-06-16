import type { DataNeed } from "./types";

export type RetrievalPolicyEmbedding =
  | "fireworks_qwen"
  | "static_local"
  | "skipped"
  | "fallback";

export interface RetrievalPolicy {
  embedding: RetrievalPolicyEmbedding;
  reason: string;
  vectorRows?: number;
  dimensions?: number;
}

export type EmbeddingApiStatus =
  | "fireworks_live_call"
  | "query_embedding_cache_hit"
  | "semantic_result_cache_hit"
  | "fireworks_fallback"
  | "embedding_disabled"
  | "static_local"
  | "skipped"
  | "missing_trace";

export function embeddingApiStatusFor(dataNeeds: DataNeed[], cacheHits: string[]): EmbeddingApiStatus {
  const needs = new Set(dataNeeds.map((need) => need.kind));
  const embeddingHits = cacheHits.filter((hit) => hit.startsWith("embedding:"));

  if (cacheHits.some((hit) => hit.startsWith("memory_cache:hit"))) {
    return "semantic_result_cache_hit";
  }
  if (embeddingHits.some((hit) => hit.startsWith("embedding:fallback"))) {
    return "fireworks_fallback";
  }
  if (embeddingHits.includes("embedding:disabled")) {
    return "embedding_disabled";
  }
  if (embeddingHits.includes("embedding:query_cache_hit") && embeddingHits.includes("embedding:fireworks")) {
    return "query_embedding_cache_hit";
  }
  if (embeddingHits.includes("embedding:query_embedded") && embeddingHits.includes("embedding:fireworks")) {
    return "fireworks_live_call";
  }
  if (cacheHits.includes("site_guide:static_256")) {
    return "static_local";
  }
  if (needs.has("memory.search")) {
    return "missing_trace";
  }
  return "skipped";
}

export function retrievalPolicyFor(
  intentKind: string,
  dataNeeds: DataNeed[],
  cacheHits: string[],
): RetrievalPolicy {
  const needs = new Set(dataNeeds.map((need) => need.kind));
  const embeddingHits = cacheHits.filter((hit) => hit.startsWith("embedding:"));
  const memoryCacheHit = cacheHits.some((hit) => hit.startsWith("memory_cache:hit"));
  const rowHit = embeddingHits.find((hit) => hit.startsWith("embedding:rows:"));
  const rowCount = rowHit ? Number(rowHit.split(":").at(-1)) : undefined;

  if (embeddingHits.some((hit) => hit.startsWith("embedding:fallback"))) {
    return {
      embedding: "fallback",
      reason: embeddingHits.find((hit) => hit.startsWith("embedding:fallback")) ?? "embedding_fallback",
      vectorRows: Number.isFinite(rowCount) ? rowCount : undefined,
    };
  }

  if (embeddingHits.includes("embedding:fireworks")) {
    return {
      embedding: "fireworks_qwen",
      reason: "memory_search_semantic_retrieval",
      vectorRows: Number.isFinite(rowCount) ? rowCount : undefined,
    };
  }

  if (cacheHits.includes("site_guide:static_256")) {
    return {
      embedding: "static_local",
      reason: "site_guide_uses_zero_api_static_256_vectors",
      dimensions: 256,
    };
  }

  if (needs.has("memory.search")) {
    if (embeddingHits.includes("embedding:disabled")) {
      return {
        embedding: "fallback",
        reason: "memory_search_embedding_disabled_lexical_fallback",
      };
    }

    return {
      embedding: "fallback",
      reason: memoryCacheHit
        ? "memory_search_cache_hit_without_embedding_trace"
        : "memory_search_requested_without_embedding_trace",
      vectorRows: Number.isFinite(rowCount) ? rowCount : undefined,
    };
  }

  if (
    needs.has("finance.summary") ||
    needs.has("finance.category_total") ||
    needs.has("finance.transactions") ||
    needs.has("finance.breakdown") ||
    needs.has("finance.period_comparison") ||
    needs.has("finance.goal_progress") ||
    needs.has("wallet.summary") ||
    needs.has("chart.data")
  ) {
    return {
      embedding: "skipped",
      reason: "structured_sql_or_cached_facts_do_not_need_embedding",
    };
  }

  return {
    embedding: "skipped",
    reason: intentKind === "smalltalk" || intentKind === "unknown" ? "no_external_retrieval_needed" : "no_semantic_data_need",
  };
}
