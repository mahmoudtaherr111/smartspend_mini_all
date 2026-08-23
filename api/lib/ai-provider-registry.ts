/**
 * SmartSpend AI Provider Registry — Single Source of Truth
 *
 * This file is the ONLY authoritative source for:
 *   1. Valid model IDs across all AI providers (Gemini, Groq, Fireworks)
 *   2. Deprecated model name → modern replacement mapping
 *   3. Default model selection per provider × plan × purpose
 *   4. Unified API key resolution (DB → env → empty)
 *   5. Placeholder key detection
 *
 * ⚠️  ALL other files must import from here instead of hardcoding model names
 *     or inventing their own key-resolution logic.
 *
 * Last verified against live provider APIs: 2026-08-01
 */

// ─── Types ─────────────────────────────────────────────────────────

export type AiProviderName = "gemini" | "groq" | "fireworks" | "nvidia";
export type AiPlanName = "free" | "pro" | "ultra";
export type AiPurpose =
  | "classification"     // Transaction classification pipeline
  | "chat"               // AI Center chatbot
  | "report"             // Monthly/yearly financial reports
  | "stt"                // Speech-to-text transcription
  | "voice_call"         // Live voice call (BidiGenerateContent)
  | "embedding"          // Vector embedding generation
  | "image"              // Receipt OCR / image analysis
  | "batch";             // Batch prediction jobs

export interface ModelEntry {
  id: string;
  provider: AiProviderName;
  displayName: string;
  /** Which subscription tiers may use this model */
  tiers: AiPlanName[];
  /** Primary use cases */
  purposes: AiPurpose[];
  /** Human-readable pricing hint (for admin UI) */
  pricingHint: string;
  /** Arabic description for admin UI */
  descriptionAr: string;
}

// ─── Model Catalog (Verified 2026-08-01) ───────────────────────────

export const MODEL_CATALOG: ModelEntry[] = [
  // ── Gemini ──
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    displayName: "Gemini 3.6 Flash",
    tiers: ["free", "pro", "ultra"],
    purposes: ["classification", "chat", "stt"],
    pricingHint: "Free Tier",
    descriptionAr: "أحدث وأسرع موديل — مثالي للتصنيف والشات السريع",
  },
  {
    id: "gemini-3.5-flash",
    provider: "gemini",
    displayName: "Gemini 3.5 Flash",
    tiers: ["free", "pro", "ultra"],
    purposes: ["classification", "chat", "stt"],
    pricingHint: "Free Tier",
    descriptionAr: "سريع وفعّال للغاية — مناسب لتحويل الصوت والتصنيف",
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    displayName: "Gemini 3.5 Flash-Lite",
    tiers: ["free", "pro"],
    purposes: ["classification", "batch"],
    pricingHint: "Free Tier",
    descriptionAr: "خفيف وسريع جداً للمهام الكبيرة",
  },
  {
    id: "gemini-3.1-pro",
    provider: "gemini",
    displayName: "Gemini 3.1 Pro",
    tiers: ["pro", "ultra"],
    purposes: ["report", "chat", "image"],
    pricingHint: "Professional Tier",
    descriptionAr: "النموذج الاحترافي الأقوى — للتقارير والمهام المعقدة",
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "gemini",
    displayName: "Gemini 3.1 Flash-Lite",
    tiers: ["free", "pro"],
    purposes: ["classification", "chat", "stt", "batch"],
    pricingHint: "Free Tier",
    descriptionAr: "اقتصادي للغاية — المعيار الأساسي للتصنيف السريع",
  },
  {
    id: "gemini-2.5-flash-native-audio-latest",
    provider: "gemini",
    displayName: "Gemini 2.5 Flash Native Audio",
    tiers: ["free", "pro", "ultra"],
    purposes: ["voice_call"],
    pricingHint: "Audio Tier",
    descriptionAr: "مخصص للمكالمات الصوتية الحية (WebSocket)",
  },

  // ── Groq ──
  {
    id: "deepseek-r1-distill-llama-70b",
    provider: "groq",
    displayName: "DeepSeek R1 Distill (Groq)",
    tiers: ["free"],
    purposes: ["classification", "chat"],
    pricingHint: "مجاني / Free",
    descriptionAr: "موديل تفكير قوي وسريع للتحليل المعقد",
  },
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    displayName: "Llama 3.3 70B Versatile",
    tiers: ["pro", "ultra"],
    purposes: ["classification", "chat"],
    pricingHint: "$0.59/$0.79 /1M",
    descriptionAr: "متوازن وقوي — ينصح لباقة Pro",
  },
  {
    id: "llama-3.1-8b-instant",
    provider: "groq",
    displayName: "Llama 3.1 8B Instant",
    tiers: ["free"],
    purposes: ["classification", "chat"],
    pricingHint: "$0.05/$0.08 /1M",
    descriptionAr: "الأسرع والأرخص — ينصح لأول نطاق Free",
  },
  {
    id: "whisper-large-v3",
    provider: "groq",
    displayName: "Whisper Large V3 (Groq)",
    tiers: ["free", "pro", "ultra"],
    purposes: ["stt"],
    pricingHint: "مجاني / Free",
    descriptionAr: "المحرك الصوتي الفائق لتحويل الصوت لنص",
  },
  {
    id: "whisper-large-v3-turbo",
    provider: "groq",
    displayName: "Whisper V3 Turbo (Groq)",
    tiers: ["free", "pro", "ultra"],
    purposes: ["stt"],
    pricingHint: "مجاني / Free",
    descriptionAr: "المحرك الصوتي الأسرع لتحويل الصوت لنص",
  },
  {
    id: "qwen/qwen3-32b",
    provider: "groq",
    displayName: "Qwen3 32B (Groq)",
    tiers: ["pro"],
    purposes: ["classification", "chat"],
    pricingHint: "$0.29/$0.59 /1M",
    descriptionAr: "قوي وأرخص من 70B",
  },
  {
    id: "gemma2-9b-it",
    provider: "groq",
    displayName: "Gemma2 9B (Groq)",
    tiers: ["free"],
    purposes: ["classification"],
    pricingHint: "$0.20/$0.20 /1M",
    descriptionAr: "مفتوح المصدر على Groq",
  },
  {
    id: "openai/gpt-oss-120b",
    provider: "groq",
    displayName: "GPT-OSS 120B (Groq)",
    tiers: ["ultra"],
    purposes: ["chat"],
    pricingHint: "مخصص",
    descriptionAr: "الأقوى على Groq — للحالات الصعبة",
  },
  {
    id: "openai/gpt-oss-20b",
    provider: "groq",
    displayName: "GPT-OSS 20B (Groq)",
    tiers: ["pro"],
    purposes: ["classification", "chat"],
    pricingHint: "$0.40/$0.60 /1M",
    descriptionAr: "موديل ممتاز للتصنيف مفتوح المصدر",
  },

  // ── Fireworks ──
  {
    id: "accounts/fireworks/models/deepseek-v4-flash",
    provider: "fireworks",
    displayName: "DeepSeek V4 Flash (Fireworks)",
    tiers: ["free"],
    purposes: ["classification", "chat"],
    pricingHint: "سريع واقتصادي / Fast",
    descriptionAr: "موديل تفكير خفيف وسريع جداً مع ذاكرة 1M توكن",
  },
  {
    id: "accounts/fireworks/models/deepseek-v4-pro",
    provider: "fireworks",
    displayName: "DeepSeek V4 Pro (Fireworks)",
    tiers: ["pro", "ultra"],
    purposes: ["classification", "chat"],
    pricingHint: "ذكي للغاية / Smart",
    descriptionAr: "موديل تفكير متطور للمهام المعقدة والتحليل المتقدم مع ذاكرة 1M توكن",
  },
  {
    id: "accounts/fireworks/models/qwen3-embedding-8b",
    provider: "fireworks",
    displayName: "Qwen3 Embedding 8B (Fireworks)",
    tiers: ["free", "pro", "ultra"],
    purposes: ["embedding"],
    pricingHint: "Embedding Model",
    descriptionAr: "موديل المتجهات الدلالية — 768 بُعد",
  },

  // ── NVIDIA NIM ──
  {
    id: "deepseek-ai/deepseek-v4-flash",
    provider: "nvidia",
    displayName: "DeepSeek V4 Flash (NVIDIA NIM)",
    tiers: ["free", "pro", "ultra"],
    purposes: ["classification", "chat"],
    pricingHint: "NVIDIA NIM / Ultra Fast",
    descriptionAr: "موديل DeepSeek V4 Flash الفائق السرعة عبر بنية إنفيديا المسرّعة للتصنيف والتحليل المالي",
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    provider: "nvidia",
    displayName: "Llama 3.3 70B Instruct (NVIDIA NIM)",
    tiers: ["pro", "ultra"],
    purposes: ["classification", "chat", "report"],
    pricingHint: "NVIDIA NIM / SOTA 70B",
    descriptionAr: "موديل Llama 3.3 70B الفائق الدقة والسرعة على سيرفرات إنفيديا للتقارير والتصنيف المتقدم",
  },
];

// ─── Deprecated Model Map ──────────────────────────────────────────
// Maps old/phantom model names to their correct modern replacements.
// Used by mapModelName() as a safety net with warning logs.

export const DEPRECATED_MODEL_MAP: Record<string, string> = {
  // Gemini legacy → modern
  "gemini-1.5-flash":       "gemini-3.1-flash-lite",
  "gemini-1.5-flash-001":   "gemini-3.1-flash-lite",
  "gemini-1.5-flash-002":   "gemini-3.1-flash-lite",
  "gemini-1.5-flash-8b":    "gemini-3.1-flash-lite",
  "gemini-1.5-pro":         "gemini-3.1-pro",
  "gemini-1.5-pro-001":     "gemini-3.1-pro",
  "gemini-1.5-pro-002":     "gemini-3.1-pro",
  "gemini-2.0-flash":       "gemini-3.1-flash-lite",
  "gemini-2.0-flash-001":   "gemini-3.1-flash-lite",
  "gemini-2.0-flash-lite":  "gemini-3.1-flash-lite",
  "gemini-2.5-flash":       "gemini-3.5-flash",
  "gemini-2.5-pro":         "gemini-3.1-pro",
  // Phantom model that was never released
  "gemini-3.5-pro":         "gemini-3.1-pro",
};

// ─── Default Model Selection ───────────────────────────────────────

/** Default Gemini model for a given plan */
export function defaultGeminiModel(plan: AiPlanName, purpose: AiPurpose = "classification"): string {
  if (purpose === "voice_call") return "gemini-2.5-flash-native-audio-latest";
  if (purpose === "report" || purpose === "image") {
    return plan === "ultra" ? "gemini-3.1-pro" : "gemini-3.5-flash";
  }
  if (purpose === "stt") return "gemini-3.5-flash";
  // classification / chat / batch
  if (plan === "ultra") return "gemini-3.1-pro";
  return "gemini-3.1-flash-lite";
}

/** Default Groq model for a given plan */
export function defaultGroqModel(plan: AiPlanName): string {
  if (plan === "free") return "deepseek-r1-distill-llama-70b";
  return "llama-3.3-70b-versatile";
}

/** Default Fireworks model for a given plan */
export function defaultFireworksModel(plan: AiPlanName): string {
  if (plan === "ultra" || plan === "pro") return "accounts/fireworks/models/deepseek-v4-pro";
  return "accounts/fireworks/models/deepseek-v4-flash";
}

/** Universal default model resolver */
export function defaultModelForProvider(
  provider: AiProviderName,
  plan: AiPlanName,
  purpose: AiPurpose = "classification",
): string {
  if (provider === "fireworks") return defaultFireworksModel(plan);
  if (provider === "groq") return defaultGroqModel(plan);
  return defaultGeminiModel(plan, purpose);
}

// ─── Model Validation ──────────────────────────────────────────────

const _catalogIds = new Set(MODEL_CATALOG.map((m) => m.id));

/** Returns true if the model ID exists in our verified catalog */
export function isKnownModel(modelId: string): boolean {
  return _catalogIds.has(modelId);
}

/** Returns the catalog entry for a model, or undefined */
export function getModelEntry(modelId: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}

/** List all models for a given provider, optionally filtered by tier */
export function listModels(provider?: AiProviderName, tier?: AiPlanName): ModelEntry[] {
  return MODEL_CATALOG.filter((m) => {
    if (provider && m.provider !== provider) return false;
    if (tier && !m.tiers.includes(tier)) return false;
    return true;
  });
}

// ─── API Key Resolution ────────────────────────────────────────────

const PLACEHOLDER_KEYS = new Set([
  "",
  "YOUR_GEMINI_API_KEY",
  "your_api_key_here",
  "YOUR_API_KEY",
  "your_gemini_api_key",
  "sk-...",
  "PLACEHOLDER",
]);

/** Returns true if the key looks like a placeholder or is empty */
export function isPlaceholderKey(key: string | undefined | null): boolean {
  if (!key) return true;
  const trimmed = key.trim();
  if (trimmed.length < 10) return true;
  return PLACEHOLDER_KEYS.has(trimmed);
}

/**
 * Resolves an API key with consistent priority:
 *   1. system_settings DB value (if present and not a placeholder)
 *   2. .env fallback
 *   3. empty string
 *
 * @param dbValue   - Value from system_settings table (e.g. cfg.ai_api_key)
 * @param envValue  - Value from process.env (e.g. env.GEMINI_API_KEY)
 */
export function resolveApiKey(
  dbValue: string | undefined | null,
  envValue: string | undefined | null,
): string {
  if (dbValue && !isPlaceholderKey(dbValue)) return dbValue;
  if (envValue && !isPlaceholderKey(envValue)) return envValue;
  return "";
}

/**
 * Resolves the Gemini API key with failover between key1 and key2.
 * Priority: dbKey1 → dbKey2 → envKey → ""
 */
export function resolveGeminiKey(
  dbKey1: string | undefined | null,
  dbKey2: string | undefined | null,
  envKey: string | undefined | null,
): string {
  if (dbKey1 && !isPlaceholderKey(dbKey1)) return dbKey1;
  if (dbKey2 && !isPlaceholderKey(dbKey2)) return dbKey2;
  if (envKey && !isPlaceholderKey(envKey)) return envKey;
  return "";
}
