import { DEPRECATED_MODEL_MAP } from "./ai-provider-registry";

/**
 * SmartSpend AI Model Mapper
 * Intercepts unsupported / development models (like gemini-3.1-flash-lite, gemma-4)
 * and safely maps them using ai-provider-registry.
 */

export function mapModelName(modelName: string): string {
  let normalized = String(modelName || "")
    .trim()
    .toLowerCase();

  if (normalized.startsWith("models/")) {
    normalized = normalized.replace("models/", "");
  }

  if (!normalized) return "gemini-3.1-flash-lite";

  // Standard admin shorthand mapping
  if (normalized === "flash") {
    return "gemini-3.1-flash-lite";
  }
  if (normalized === "pro" || normalized === "ultra") {
    return "gemini-3.1-pro";
  }

  // Check deprecated model map and log warning
  const deprecatedMatch = DEPRECATED_MODEL_MAP[normalized];
  if (deprecatedMatch) {
    console.warn(`[model-mapper] ⚠️ Deprecated model "${normalized}" → mapped to "${deprecatedMatch}"`);
    return deprecatedMatch;
  }

  // Pure passthrough: Let the requested model string pass to the API exactly as is.
  return normalized;
}

export type AiProviderName = "gemini" | "groq" | "fireworks" | "nvidia";
export type AiPlanName = "free" | "pro" | "ultra";

export function isGroqModel(modelName: string): boolean {
  const normalized = mapModelName(modelName);
  return (
    normalized.startsWith("llama-") ||
    normalized.startsWith("llama3-") ||
    normalized.startsWith("deepseek-") ||
    normalized.startsWith("qwen/") ||
    normalized.startsWith("openai/") ||
    normalized.includes("mixtral") ||
    normalized.includes("gemma") ||
    normalized.startsWith("whisper-")
  );
}

export function isGeminiModel(modelName: string): boolean {
  return mapModelName(modelName).startsWith("gemini-");
}

export function isFireworksModel(modelName: string): boolean {
  const normalized = mapModelName(modelName);
  return (
    normalized.startsWith("accounts/fireworks/") ||
    normalized.startsWith("fireworks/")
  );
}

export function isNvidiaModel(modelName: string): boolean {
  const normalized = mapModelName(modelName);
  return (
    normalized.startsWith("meta/llama") ||
    normalized.startsWith("deepseek-ai/") ||
    normalized.startsWith("nvidia/") ||
    normalized.startsWith("google/gemma") ||
    normalized.startsWith("mistralai/") ||
    normalized.startsWith("openai/gpt-oss") ||
    normalized.startsWith("moonshotai/") ||
    normalized.startsWith("stepfun-ai/")
  );
}

export function defaultNvidiaModelForPlan(plan: AiPlanName): string {
  if (plan === "ultra") return "nvidia/nemotron-3-super-120b-a12b";
  return "meta/llama-3.2-11b-vision-instruct";
}

export function defaultGeminiModelForPlan(plan: AiPlanName): string {
  if (plan === "ultra") return "gemini-3.1-pro";
  if (plan === "pro") return "gemini-3.1-flash-lite";
  return "gemini-3.1-flash-lite";
}

export function defaultGroqModelForPlan(plan: AiPlanName): string {
  if (plan === "free") return "deepseek-r1-distill-llama-70b";
  return "llama-3.3-70b-versatile";
}

export function defaultFireworksModelForPlan(plan: AiPlanName): string {
  if (plan === "ultra" || plan === "pro") return "accounts/fireworks/models/deepseek-v4-pro";
  return "accounts/fireworks/models/deepseek-v4-flash";
}

export function defaultModelForProvider(
  provider: AiProviderName,
  plan: AiPlanName,
): string {
  if (provider === "nvidia") {
    return defaultNvidiaModelForPlan(plan);
  }
  if (provider === "fireworks") {
    return defaultFireworksModelForPlan(plan);
  }
  return provider === "groq"
    ? defaultGroqModelForPlan(plan)
    : defaultGeminiModelForPlan(plan);
}

export function coerceModelForProvider(
  modelName: string | undefined,
  provider: AiProviderName,
  plan: AiPlanName,
): string {
  const mapped = mapModelName(
    modelName || defaultModelForProvider(provider, plan),
  );
  if (provider === "nvidia" && !isNvidiaModel(mapped)) {
    return defaultNvidiaModelForPlan(plan);
  }
  if (provider === "groq" && isGeminiModel(mapped)) {
    return defaultGroqModelForPlan(plan);
  }
  if (provider === "gemini" && isGroqModel(mapped)) {
    return defaultGeminiModelForPlan(plan);
  }
  if (provider === "fireworks" && !isFireworksModel(mapped)) {
    return defaultFireworksModelForPlan(plan);
  }
  return mapped;
}
