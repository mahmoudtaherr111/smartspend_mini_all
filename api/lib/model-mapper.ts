/**
 * SmartSpend AI Model Mapper
 * Intercepts unsupported / development models (like gemini-3.1-flash-lite, gemma-4)
 * and safely maps them to standard, stable, supported Gemini API models.
 */

export function mapModelName(modelName: string): string {
  const normalized = String(modelName || "").trim().toLowerCase();

  // 1) Explicit custom models / settings mappings
  if (normalized.includes("3.1-flash-lite") || normalized === "flash-lite") {
    return "gemini-2.5-flash"; // Stable, fast, highly capable
  }
  if (normalized.includes("3.1-flash-tts")) {
    return "gemini-2.5-flash";
  }
  if (normalized.includes("gemma-4-26b-a4b-it") || normalized.includes("gemma-4-31b-it") || normalized.includes("gemma")) {
    return "gemini-2.5-pro"; // Map heavy or speculative models to stable Pro
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
  if (normalized === "pro") {
    return "gemini-2.5-pro";
  }
  if (normalized === "ultra") {
    return "gemini-2.5-pro";
  }

  // 3) Fallback if it's already a valid SDK name
  const validModels = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];

  if (validModels.includes(normalized)) {
    return normalized;
  }

  // If it's something unsupported or completely customized, use stable flash
  return "gemini-2.5-flash";
}
