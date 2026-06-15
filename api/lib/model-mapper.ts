/**
 * SmartSpend AI Model Mapper
 * Intercepts unsupported / development models (like gemini-3.1-flash-lite, gemma-4)
 * and safely maps them to standard, stable, supported Gemini API models.
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
    return "gemini-3.5-pro";
  }

  // Redirect legacy / deprecated models to the modern standard gemini-3.1-flash-lite / gemini-3.5-pro
  if (normalized.includes("1.5-flash") || normalized.includes("2.0-flash") || normalized.includes("2.5-flash")) {
    return "gemini-3.1-flash-lite";
  }
  if (normalized.includes("1.5-pro") || normalized.includes("2.0-pro") || normalized.includes("2.5-pro")) {
    return "gemini-3.5-pro";
  }

  // Pure passthrough: Let the requested model string pass to the API exactly as is.
  return normalized;
}

export type AiProviderName = "gemini" | "groq" | "fireworks";
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

export function defaultGeminiModelForPlan(plan: AiPlanName): string {
  if (plan === "ultra") return "gemini-3.5-pro";
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
