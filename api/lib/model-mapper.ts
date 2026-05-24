/**
 * SmartSpend AI Model Mapper
 * Intercepts unsupported / development models (like gemini-3.1-flash-lite, gemma-4)
 * and safely maps them to standard, stable, supported Gemini API models.
 */

export function mapModelName(modelName: string): string {
  const normalized = String(modelName || "").trim().toLowerCase();

  if (!normalized) return "gemini-2.5-flash";

  // 1) Explicit custom models / settings mappings
  if (normalized.includes("3.1-flash-lite") || normalized === "flash-lite") {
    return "gemini-2.5-flash"; // Stable, fast, highly capable
  }
  if (normalized.includes("3.1-flash-tts")) {
    return "gemini-2.5-flash";
  }
  if (normalized.includes("3.0-flash-live") || normalized.includes("3.1-flash")) {
    return "gemini-2.0-flash";
  }
  if (normalized.includes("3.1-pro")) {
    return "gemini-2.5-pro";
  }

  // 2) Standard admin shorthand mapping
  if (normalized === "flash") {
    return "gemini-2.5-flash";
  }
  if (normalized === "pro" || normalized === "ultra") {
    return "gemini-2.5-pro";
  }

  // 3) Just return the model name! This allows Groq models (llama3-8b-8192, mixtral-8x7b-32768, etc.) 
  // and new Gemini models to pass through to the provider successfully.
  return normalized;
}

export type AiProviderName = "gemini" | "groq";
export type AiPlanName = "free" | "pro" | "ultra";

export function isGroqModel(modelName: string): boolean {
  const normalized = mapModelName(modelName);
  return (
    normalized.startsWith("llama-") ||
    normalized.startsWith("llama3-") ||
    normalized.startsWith("qwen/") ||
    normalized.startsWith("openai/") ||
    normalized.includes("mixtral") ||
    normalized.includes("gemma")
  );
}

export function isGeminiModel(modelName: string): boolean {
  return mapModelName(modelName).startsWith("gemini-");
}

export function defaultGeminiModelForPlan(plan: AiPlanName): string {
  if (plan === "ultra") return "gemini-2.5-pro";
  if (plan === "pro") return "gemini-2.5-flash";
  return "gemini-2.0-flash";
}

export function defaultGroqModelForPlan(plan: AiPlanName): string {
  if (plan === "free") return "llama-3.1-8b-instant";
  return "llama-3.3-70b-versatile";
}

export function defaultModelForProvider(provider: AiProviderName, plan: AiPlanName): string {
  return provider === "groq"
    ? defaultGroqModelForPlan(plan)
    : defaultGeminiModelForPlan(plan);
}

export function coerceModelForProvider(
  modelName: string | undefined,
  provider: AiProviderName,
  plan: AiPlanName
): string {
  const mapped = mapModelName(modelName || defaultModelForProvider(provider, plan));
  if (provider === "groq" && isGeminiModel(mapped)) {
    return defaultGroqModelForPlan(plan);
  }
  if (provider === "gemini" && isGroqModel(mapped)) {
    return defaultGeminiModelForPlan(plan);
  }
  return mapped;
}
