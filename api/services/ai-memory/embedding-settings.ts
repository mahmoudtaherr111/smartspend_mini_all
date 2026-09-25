import { embeddingRoutes } from "../../lib/embedding-provider";
import { getSystemSettings } from "../../lib/settings-cache";
import type { EmbeddingConfig, EmbeddingDimensions } from "./types";

function dimension(value: unknown, fallback: EmbeddingDimensions): EmbeddingDimensions {
  const parsed = Number(value);
  if (parsed === 256 || parsed === 768 || parsed === 1024) return parsed;
  return fallback;
}

export function embeddingSettingsKeys(): Record<string, string> {
  return {
    enabled: "ai_memory_embedding_enabled",
    model: "ai_embedding_model",
    shortDimensions: "ai_embedding_dimensions_short",
    memoryDimensions: "ai_embedding_dimensions_memory",
    deepDimensions: "ai_embedding_dimensions_deep",
  };
}

/**
 * Memory search by meaning: on unless the admin turns it off (`ai_memory_embedding_enabled`), with the model of the
 * first embedding provider that would answer (api/lib/embedding-provider.ts) — the admin's, else Google's
 * gemini-embedding-2 — and the dimensions of the use case.
 */
export async function loadEmbeddingConfig(
  useCase: "short" | "memory" | "deep" = "memory",
): Promise<EmbeddingConfig> {
  const [settings, routes] = await Promise.all([getSystemSettings(), embeddingRoutes()]);
  const keys = embeddingSettingsKeys();
  const dimensionKey =
    useCase === "short"
      ? keys.shortDimensions
      : useCase === "deep"
        ? keys.deepDimensions
        : keys.memoryDimensions;
  const first = routes[0];

  return {
    provider: first?.slug ?? "none",
    model: first?.model ?? "none",
    dimensions: dimension(settings[dimensionKey], useCase === "short" ? 256 : useCase === "deep" ? 1024 : 768),
    enabled: settings[keys.enabled] !== "false" && Boolean(first),
  };
}
