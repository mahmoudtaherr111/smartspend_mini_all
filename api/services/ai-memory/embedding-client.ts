/**
 * Vectors for memory search by meaning, from the shared embedding provider (api/lib/embedding-provider.ts: the admin's
 * providers for "embedding", else Google gemini-embedding-2), cached in Redis for two weeks per model, dimensions,
 * user and text. When no provider answers, a deterministic local vector stands in and says so (`fallback`): it is
 * never stored, and it matches no stored vector because its model is its own.
 */
import { embedTexts, type EmbeddingTask } from "../../lib/embedding-provider";
import { getRedisClient } from "../../lib/redis-client";
import { buildDeterministicFallbackEmbedding } from "../ai-cost-policy";
import { contentHash } from "./text-utils";
import type { EmbedTextInput, EmbedTextResult, EmbeddingConfig, EmbeddingDimensions } from "./types";

export const FALLBACK_EMBEDDING_MODEL = "local-fallback";
const CACHE_SECONDS = 60 * 60 * 24 * 14;

function clampDimensions(value: EmbeddingDimensions | undefined, fallback: EmbeddingDimensions): EmbeddingDimensions {
  return value === 256 || value === 768 || value === 1024 ? value : fallback;
}

function cacheIdentity(input: EmbedTextInput): string {
  if (input.userId === undefined || input.userId === null || input.userId === "") return "global";
  return `${input.userType ?? "unknown"}:${input.userId}`;
}

const cacheKey = (model: string, dimensions: number, input: EmbedTextInput, task: EmbeddingTask) =>
  `ai_memory_embedding:${model}:${dimensions}:${task}:${cacheIdentity(input)}:${contentHash(input.text)}`;

function fallback(input: EmbedTextInput, dimensions: EmbeddingDimensions, reason: string): EmbedTextResult {
  return {
    vector: buildDeterministicFallbackEmbedding(input.text, dimensions),
    model: FALLBACK_EMBEDDING_MODEL,
    dimensions,
    provider: "local",
    cacheHit: false,
    fallback: true,
    fallbackReason: reason,
  };
}

export class MemoryEmbeddingClient {
  constructor(private readonly config: EmbeddingConfig) {}

  /** A question to search with ("query") or a memory to store ("document"). */
  async embedText(input: EmbedTextInput): Promise<EmbedTextResult> {
    const dimensions = clampDimensions(input.dimensions, this.config.dimensions);
    const task: EmbeddingTask = input.task ?? "query";
    if (!this.config.enabled) return fallback(input, dimensions, "embedding_disabled");
    if (!input.text.trim()) return fallback(input, dimensions, "empty_text");

    const redis = await getRedisClient();
    const expected = cacheKey(this.config.model, dimensions, input, task);
    if (redis) {
      const cached = await redis.get(expected).catch(() => null);
      if (cached) {
        return { vector: JSON.parse(cached) as number[], model: this.config.model, dimensions, provider: this.config.provider, cacheHit: true };
      }
    }

    const batch = await embedTexts([input.text], { dimensions, task }).catch(() => null);
    const vector = batch?.vectors[0];
    if (!batch || !vector) return fallback(input, dimensions, "no_embedding_provider_answered");
    if (redis) await redis.setEx(cacheKey(batch.model, dimensions, input, task), CACHE_SECONDS, JSON.stringify(vector)).catch(() => undefined);
    return { vector, model: batch.model, dimensions, provider: batch.provider, cacheHit: false };
  }
}
