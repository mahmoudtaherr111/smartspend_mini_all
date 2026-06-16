import { getRedisClient } from "../../lib/redis-client";
import { buildDeterministicFallbackEmbedding } from "../ai-cost-policy";
import { contentHash } from "./text-utils";
import type { EmbedTextInput, EmbedTextResult, EmbeddingConfig, EmbeddingDimensions } from "./types";

function clampDimensions(value: EmbeddingDimensions | undefined, fallback: EmbeddingDimensions): EmbeddingDimensions {
  return value === 256 || value === 768 || value === 1024 ? value : fallback;
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/embeddings`;
}

function modelCandidates(model: string): string[] {
  const trimmed = model.trim();
  const candidates = [trimmed];
  const accountPrefix = "accounts/fireworks/models/";
  if (trimmed.startsWith(accountPrefix)) {
    candidates.push(`fireworks/${trimmed.slice(accountPrefix.length)}`);
  }
  return [...new Set(candidates.filter(Boolean))];
}

function timeoutSignal(ms = 12_000): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

function parseEmbeddingResponse(data: unknown): number[] {
  const record = data as { data?: Array<{ embedding?: number[] }> };
  const vector = record.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.some((item) => typeof item !== "number")) {
    throw new Error("Invalid embedding response");
  }
  return vector;
}

function embeddingCacheIdentity(input: EmbedTextInput): string {
  if (input.userId === undefined || input.userId === null || input.userId === "") return "global";
  return `${input.userType ?? "unknown"}:${input.userId}`;
}

function fallbackResult(
  input: EmbedTextInput,
  config: EmbeddingConfig,
  dimensions: EmbeddingDimensions,
  reason: string,
): EmbedTextResult {
  return {
    vector: buildDeterministicFallbackEmbedding(input.text, dimensions),
    model: config.model,
    dimensions,
    provider: "fireworks",
    cacheHit: false,
    fallback: true,
    fallbackReason: reason,
  };
}

export class FireworksEmbeddingClient {
  constructor(private readonly config: EmbeddingConfig) {}

  async embedText(input: EmbedTextInput): Promise<EmbedTextResult> {
    const dimensions = clampDimensions(input.dimensions, this.config.dimensions);

    if (!this.config.enabled) {
      return fallbackResult(input, this.config, dimensions, "embedding_client_disabled");
    }
    if (!this.config.apiKey) {
      return fallbackResult(input, this.config, dimensions, "fireworks_api_key_missing");
    }

    const cacheKey = `ai_memory_embedding:${this.config.model}:${dimensions}:${embeddingCacheIdentity(input)}:${contentHash(input.text)}`;
    const redis = await getRedisClient();

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return {
          vector: JSON.parse(cached) as number[],
          model: this.config.model,
          dimensions,
          provider: "fireworks",
          cacheHit: true,
        };
      }
    }

    try {
      const failures: string[] = [];
      let vector: number[] | undefined;
      let requestModel = this.config.model;

      for (const candidate of modelCandidates(this.config.model)) {
        requestModel = candidate;
        const response = await fetch(endpoint(this.config.baseUrl), {
          method: "POST",
          signal: timeoutSignal(),
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: candidate,
            input: input.text,
            dimensions,
          }),
        });

        if (response.ok) {
          vector = parseEmbeddingResponse(await response.json());
          break;
        }

        failures.push(`${candidate}:${response.status}`);
        if (![400, 404, 422].includes(response.status)) {
          break;
        }
      }

      if (!vector) {
        return fallbackResult(input, this.config, dimensions, `fireworks_embedding_failed_${failures.join("|")}`);
      }

      if (redis) {
        await redis.setEx(cacheKey, 60 * 60 * 24 * 14, JSON.stringify(vector));
      }

      return {
        vector,
        model: this.config.model,
        requestModel,
        dimensions,
        provider: "fireworks",
        cacheHit: false,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return fallbackResult(input, this.config, dimensions, `embedding_exception:${reason}`);
    }
  }
}
