import { systemSettings } from "../../../db/schema";
import { db } from "../../queries/connection";
import { env } from "../../lib/env";
import type { EmbeddingConfig, EmbeddingDimensions } from "./types";

export const DEFAULT_EMBEDDING_MODEL = "accounts/fireworks/models/qwen3-embedding-8b";
export const DEFAULT_EMBEDDING_BASE_URL = "https://api.fireworks.ai/inference/v1";

function dimension(value: unknown, fallback: EmbeddingDimensions): EmbeddingDimensions {
  const parsed = Number(value);
  if (parsed === 256 || parsed === 768 || parsed === 1024) return parsed;
  return fallback;
}

export function embeddingSettingsKeys(): Record<string, string> {
  return {
    enabled: "ai_memory_embedding_enabled",
    provider: "ai_embedding_provider",
    baseUrl: "ai_embedding_base_url",
    model: "ai_embedding_model",
    shortDimensions: "ai_embedding_dimensions_short",
    memoryDimensions: "ai_embedding_dimensions_memory",
    deepDimensions: "ai_embedding_dimensions_deep",
  };
}

import { getSystemSettings } from "../../lib/settings-cache";

export async function loadEmbeddingConfig(
  useCase: "short" | "memory" | "deep" = "memory",
): Promise<EmbeddingConfig> {
  const settings = await getSystemSettings();
  const keys = embeddingSettingsKeys();
  const dimensionKey =
    useCase === "short"
      ? keys.shortDimensions
      : useCase === "deep"
        ? keys.deepDimensions
        : keys.memoryDimensions;

  return {
    provider: "fireworks",
    apiKey: settings.fireworks_api_key || settings.chatbot_api_key || env.FIREWORKS_API_KEY || "",
    baseUrl: settings[keys.baseUrl] || DEFAULT_EMBEDDING_BASE_URL,
    model: settings[keys.model] || DEFAULT_EMBEDDING_MODEL,
    dimensions: dimension(settings[dimensionKey], useCase === "short" ? 256 : useCase === "deep" ? 1024 : 768),
    enabled: settings[keys.enabled] === "true",
  };
}
