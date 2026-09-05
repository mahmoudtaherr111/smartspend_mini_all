# Milestone 1: Dynamic AI Provider & Automatic Model Discovery Engine — Implementation Blueprint

**Author**: `explorer_m1` (Teamwork Preview Explorer)  
**Target Milestone**: Milestone 1 (F-01, F-02, F-03, F-04, F-05, F-06)  
**Status**: COMPLETE SPECIFICATION & BLUEPRINT  
**Target Files**:
1. `db/schema.ts` (Table definitions: `aiProviders`, `aiModels`)
2. `db/relations.ts` (Drizzle relational mappings)
3. `api/lib/crypto-vault.ts` (AES-256-GCM symmetric encryption & decryption)
4. `api/lib/model-discovery.ts` (Remote model discovery for OpenAI, Gemini, Anthropic)
5. `api/lib/ai-provider-registry.ts` (Dynamic database-backed provider & model registry with caching)
6. `api/lib/model-mapper.ts` (Dynamic model resolution, backward compatibility, and fallbacks)
7. `api/admin-router.ts` (Admin tRPC procedures for Provider & Model management)

---

## 1. Executive Summary

Milestone 1 transitions SmartSpend AI from a hardcoded 4-provider, 20-model static catalog into an extensible, multi-provider AI infrastructure. 

### Key Capabilities Delivered:
- **Zero-Code Provider Onboarding**: Admin enters provider name, base URL (OpenRouter, DeepSeek, Together, Ollama, vLLM, etc.), and API key.
- **Automated Model Discovery**: Single-click `GET /v1/models` (or Gemini/Anthropic equivalent) scans remote endpoints, infers capabilities (vision, reasoning, function calling), and extracts pricing.
- **AES-256-GCM Cryptographic Vault**: Securely encrypts provider API keys in MySQL with seamless fallback to legacy/unencrypted keys.
- **Dynamic Routing & Pricing Overrides**: Dynamic mapping of models to system purposes (`chat`, `classification`, `ocr`, `voice_stt`, `voice_call`, `report`, `goal`, `embedding`) and user subscription tiers (`free`, `pro`, `ultra`).
- **Sub-millisecond In-Process Caching**: 5-minute cached registry with instant admin invalidation, ensuring zero DB overhead per LLM request.

---

## 2. Database Schema & Relations Specifications

### 2.1 `db/schema.ts` — Drizzle Table Definitions

Add the following table definitions to `db/schema.ts`:

```typescript
// ─── AI Providers (Dynamic Provider Registry) ───
export const aiProviders = mysqlTable(
  "ai_providers",
  {
    id: int("id").primaryKey().autoincrement(),
    slug: varchar("slug", { length: 50 }).notNull().unique(), // e.g. "openrouter", "deepseek-direct", "groq", "gemini"
    displayName: varchar("display_name", { length: 100 }).notNull(), // e.g. "OpenRouter Global Gateway"
    protocol: varchar("protocol", { length: 30 }).notNull().default("openai"), // "openai" | "gemini" | "anthropic"
    baseUrl: varchar("base_url", { length: 500 }).notNull(), // e.g. "https://openrouter.ai/api/v1"
    apiKeyEncrypted: text("api_key_encrypted").notNull(), // AES-256-GCM encrypted key ("enc:v1:...")
    supportsModelDiscovery: boolean("supports_model_discovery").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    priority: int("priority").notNull().default(10), // Lower number = higher priority for failover
    healthStatus: varchar("health_status", { length: 20 }).notNull().default("unknown"), // "healthy" | "degraded" | "down" | "unknown"
    lastHealthCheck: datetime("last_health_check"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("ai_providers_active_priority_idx").on(t.isActive, t.priority),
    index("ai_providers_slug_idx").on(t.slug),
  ],
);

// ─── AI Models (Discovered & Configured Models) ───
export const aiModels = mysqlTable(
  "ai_models",
  {
    id: int("id").primaryKey().autoincrement(),
    providerId: int("provider_id").notNull(), // FK → ai_providers.id
    modelId: varchar("model_id", { length: 200 }).notNull(), // Provider-specific ID e.g. "deepseek/deepseek-r1"
    displayName: varchar("display_name", { length: 200 }).notNull(), // Display name e.g. "DeepSeek R1 (OpenRouter)"
    descriptionAr: text("description_ar"), // Arabic description for Admin UI
    purposes: json("purposes").notNull().$type<string[]>(), // ["chat", "classification", "ocr", "voice_stt", "voice_call", "report", "goal", "embedding"]
    allowedTiers: json("allowed_tiers").notNull().$type<string[]>(), // ["free", "pro", "ultra"]
    isDefaultForPurpose: boolean("is_default_for_purpose").notNull().default(false), // Primary model for assigned purpose/tier
    inputPricePer1M: decimal("input_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.000000"), // USD per 1M prompt tokens
    outputPricePer1M: decimal("output_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.000000"), // USD per 1M completion tokens
    cachedPricePer1M: decimal("cached_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.000000"), // USD per 1M cached input tokens
    maxContextWindow: int("max_context_window").notNull().default(128000), // Max context length in tokens
    supportsVision: boolean("supports_vision").notNull().default(false),
    supportsReasoning: boolean("supports_reasoning").notNull().default(false), // CoT thinking tokens
    supportsFunctionCalling: boolean("supports_function_calling").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    uniqueIndex("ai_models_provider_model_idx").on(t.providerId, t.modelId),
    index("ai_models_provider_id_idx").on(t.providerId),
    index("ai_models_active_sort_idx").on(t.isActive, t.sortOrder),
  ],
);
```

### 2.2 `db/relations.ts` — Drizzle Relation Mappings

Import `aiProviders` and `aiModels` and define their 1-to-many and many-to-1 relationships:

```typescript
export const aiProvidersRelations = relations(aiProviders, ({ many }) => ({
  models: many(aiModels),
}));

export const aiModelsRelations = relations(aiModels, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [aiModels.providerId],
    references: [aiProviders.id],
  }),
}));
```

---

## 3. Cryptographic Vault (`api/lib/crypto-vault.ts`)

Create `api/lib/crypto-vault.ts` implementing AES-256-GCM symmetric encryption with authentication tag validation and transparent legacy plaintext fallback.

```typescript
import crypto from "node:crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const CIPHER_PREFIX = "enc:v1:";

/**
 * Derives a deterministic 32-byte (256-bit) encryption key from the environment secret.
 */
function getDerivedKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || env.JWT_SECRET || "smartspend-default-vault-key-32b";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts an API key using AES-256-GCM.
 * Output format: `enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encryptApiKey(plainText: string): string {
  if (!plainText || typeof plainText !== "string") return "";
  const trimmed = plainText.trim();
  if (!trimmed) return "";

  // If already encrypted, return as is
  if (trimmed.startsWith(CIPHER_PREFIX)) return trimmed;

  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(trimmed, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${CIPHER_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an encrypted API key with backward compatibility for unencrypted legacy keys.
 */
export function decryptApiKey(cipherTextOrPlain: string | undefined | null): string {
  if (!cipherTextOrPlain || typeof cipherTextOrPlain !== "string") return "";
  const trimmed = cipherTextOrPlain.trim();
  if (!trimmed) return "";

  // Fallback for unencrypted legacy keys
  if (!trimmed.startsWith(CIPHER_PREFIX)) {
    return trimmed;
  }

  try {
    const parts = trimmed.slice(CIPHER_PREFIX.length).split(":");
    if (parts.length !== 3) {
      // Malformed format, return as fallback
      return trimmed;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      return trimmed;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.warn("⚠️ Failed to decrypt API key, returning fallback string:", error);
    return trimmed;
  }
}

/**
 * Masks an API key for safe UI display (e.g. "sk-o...9f3a" or "AIza...4B1c").
 */
export function maskApiKey(apiKey: string | undefined | null): string {
  if (!apiKey || typeof apiKey !== "string") return "";
  const decrypted = decryptApiKey(apiKey);
  if (!decrypted) return "";
  if (decrypted.length <= 8) return "********";
  return `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}`;
}
```

---

## 4. Remote Model Discovery Engine (`api/lib/model-discovery.ts`)

Create `api/lib/model-discovery.ts` to query external provider endpoints across OpenAI, Google Gemini, and Anthropic protocols, extract pricing/context metadata, and auto-detect capabilities.

```typescript
export interface DiscoveredModel {
  modelId: string;
  displayName: string;
  descriptionAr?: string;
  maxContextWindow: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedPricePer1M: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
  supportsFunctionCalling: boolean;
  suggestedPurposes: string[];
  suggestedTiers: string[];
}

export interface ModelDiscoveryOptions {
  protocol: "openai" | "gemini" | "anthropic";
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  discoveredCount: number;
  models: DiscoveredModel[];
  error?: string;
}

/**
 * Discovers models from a remote AI provider endpoint.
 */
export async function discoverRemoteModels(
  options: ModelDiscoveryOptions,
): Promise<ConnectionTestResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let models: DiscoveredModel[] = [];

    switch (options.protocol) {
      case "openai":
        models = await discoverOpenAiModels(options, controller.signal);
        break;
      case "gemini":
        models = await discoverGeminiModels(options, controller.signal);
        break;
      case "anthropic":
        models = await discoverAnthropicModels(options, controller.signal);
        break;
      default:
        throw new Error(`Unsupported protocol: ${options.protocol}`);
    }

    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      latencyMs,
      discoveredCount: models.length,
      models,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      latencyMs,
      discoveredCount: 0,
      models: [],
      error: err.name === "AbortError" ? "انتهت مهلة الاتصال بالمزود (Timeout)" : (err.message || String(err)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * OpenAI-Compatible Protocol Discovery (GET ${baseUrl}/models)
 */
async function discoverOpenAiModels(
  options: ModelDiscoveryOptions,
  signal: AbortSignal,
): Promise<DiscoveredModel[]> {
  const cleanBase = options.baseUrl.trim().replace(/\/+$/, "");
  const url = cleanBase.endsWith("/models") ? cleanBase : `${cleanBase}/models`;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://smartspend.app",
    "X-Title": "SmartSpend AI",
  };

  const response = await fetch(url, { method: "GET", headers, signal });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenAI Provider HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const json = await response.json();
  const rawModels: any[] = Array.isArray(json) ? json : json.data || [];

  return rawModels.map((m: any) => {
    const modelId = m.id || m.name;
    const name = m.name || m.id || "Unknown Model";
    const contextWindow = m.context_length || m.max_context_length || 128000;

    // Pricing extraction (OpenRouter returns per-token pricing)
    let inputPricePer1M = 0;
    let outputPricePer1M = 0;
    let cachedPricePer1M = 0;

    if (m.pricing) {
      if (typeof m.pricing.prompt === "number" || typeof m.pricing.prompt === "string") {
        inputPricePer1M = Number(m.pricing.prompt) * 1_000_000;
      }
      if (typeof m.pricing.completion === "number" || typeof m.pricing.completion === "string") {
        outputPricePer1M = Number(m.pricing.completion) * 1_000_000;
      }
      if (typeof m.pricing.input_cached === "number" || typeof m.pricing.input_cached === "string") {
        cachedPricePer1M = Number(m.pricing.input_cached) * 1_000_000;
      }
    }

    const { supportsVision, supportsReasoning, supportsFunctionCalling, suggestedPurposes, suggestedTiers } =
      inferModelCapabilities(modelId, m);

    return {
      modelId,
      displayName: name,
      descriptionAr: m.description ? String(m.description).slice(0, 500) : undefined,
      maxContextWindow: contextWindow,
      inputPricePer1M: Math.round(inputPricePer1M * 1_000_000) / 1_000_000,
      outputPricePer1M: Math.round(outputPricePer1M * 1_000_000) / 1_000_000,
      cachedPricePer1M: Math.round(cachedPricePer1M * 1_000_000) / 1_000_000,
      supportsVision,
      supportsReasoning,
      supportsFunctionCalling,
      suggestedPurposes,
      suggestedTiers,
    };
  });
}

/**
 * Google Gemini Protocol Discovery (GET /v1beta/models)
 */
async function discoverGeminiModels(
  options: ModelDiscoveryOptions,
  signal: AbortSignal,
): Promise<DiscoveredModel[]> {
  const cleanBase = options.baseUrl.trim().replace(/\/+$/, "") || "https://generativelanguage.googleapis.com";
  const url = `${cleanBase}/v1beta/models?key=${options.apiKey}`;

  const response = await fetch(url, { method: "GET", signal });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gemini API HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const json = await response.json();
  const rawModels: any[] = json.models || [];

  return rawModels
    .filter((m: any) => {
      const methods: string[] = m.supportedGenerationMethods || [];
      return methods.includes("generateContent") || methods.includes("bidiGenerateContent") || methods.includes("embedContent");
    })
    .map((m: any) => {
      const rawName: string = m.name || "";
      const modelId = rawName.replace(/^models\//, "");
      const displayName = m.displayName || modelId;
      const contextWindow = m.inputTokenLimit || 128000;
      const methods: string[] = m.supportedGenerationMethods || [];

      const { supportsVision, supportsReasoning, supportsFunctionCalling, suggestedPurposes, suggestedTiers } =
        inferModelCapabilities(modelId, m);

      if (methods.includes("embedContent")) {
        suggestedPurposes.push("embedding");
      }
      if (methods.includes("bidiGenerateContent") || modelId.includes("native-audio")) {
        suggestedPurposes.push("voice_call");
      }

      return {
        modelId,
        displayName,
        descriptionAr: m.description ? String(m.description).slice(0, 500) : undefined,
        maxContextWindow: contextWindow,
        inputPricePer1M: 0,
        outputPricePer1M: 0,
        cachedPricePer1M: 0,
        supportsVision,
        supportsReasoning,
        supportsFunctionCalling,
        suggestedPurposes: Array.from(new Set(suggestedPurposes)),
        suggestedTiers,
      };
    });
}

/**
 * Anthropic Protocol Discovery (GET /v1/models)
 */
async function discoverAnthropicModels(
  options: ModelDiscoveryOptions,
  signal: AbortSignal,
): Promise<DiscoveredModel[]> {
  const cleanBase = options.baseUrl.trim().replace(/\/+$/, "") || "https://api.anthropic.com";
  const url = `${cleanBase}/v1/models`;

  const headers: Record<string, string> = {
    "x-api-key": options.apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(url, { method: "GET", headers, signal });
    if (response.ok) {
      const json = await response.json();
      const rawModels: any[] = json.data || [];
      return rawModels.map((m: any) => {
        const modelId = m.id;
        const displayName = m.display_name || modelId;
        const { supportsVision, supportsReasoning, supportsFunctionCalling, suggestedPurposes, suggestedTiers } =
          inferModelCapabilities(modelId, m);

        return {
          modelId,
          displayName,
          descriptionAr: "Anthropic Claude Model",
          maxContextWindow: 200000,
          inputPricePer1M: modelId.includes("3-7-sonnet") ? 3.0 : modelId.includes("3-5-haiku") ? 0.8 : 3.0,
          outputPricePer1M: modelId.includes("3-7-sonnet") ? 15.0 : modelId.includes("3-5-haiku") ? 4.0 : 15.0,
          cachedPricePer1M: modelId.includes("3-7-sonnet") ? 0.3 : modelId.includes("3-5-haiku") ? 0.08 : 0.3,
          supportsVision: true,
          supportsReasoning: modelId.includes("3-7-sonnet") || modelId.includes("thinking"),
          supportsFunctionCalling: true,
          suggestedPurposes,
          suggestedTiers,
        };
      });
    }
  } catch {
    // Fallback if Anthropic endpoint does not support /v1/models
  }

  // Fallback curated Anthropic catalog
  const fallbackAnthropic = [
    { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet (Hybrid Reasoning)", reasoning: true, inPrice: 3.0, outPrice: 15.0 },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", reasoning: false, inPrice: 3.0, outPrice: 15.0 },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", reasoning: false, inPrice: 0.8, outPrice: 4.0 },
  ];

  return fallbackAnthropic.map((m) => ({
    modelId: m.id,
    displayName: m.name,
    descriptionAr: "Anthropic Claude Model",
    maxContextWindow: 200000,
    inputPricePer1M: m.inPrice,
    outputPricePer1M: m.outPrice,
    cachedPricePer1M: m.inPrice * 0.1,
    supportsVision: true,
    supportsReasoning: m.reasoning,
    supportsFunctionCalling: true,
    suggestedPurposes: ["chat", "classification", "report", "ocr"],
    suggestedTiers: ["pro", "ultra"],
  }));
}

/**
 * Heuristics to infer capabilities, purposes, and tiers from model ID and metadata.
 */
function inferModelCapabilities(modelId: string, raw: any): {
  supportsVision: boolean;
  supportsReasoning: boolean;
  supportsFunctionCalling: boolean;
  suggestedPurposes: string[];
  suggestedTiers: string[];
} {
  const id = modelId.toLowerCase();

  const isVision =
    id.includes("vision") ||
    id.includes("vl") ||
    id.includes("4o") ||
    id.includes("gemini") ||
    id.includes("claude") ||
    raw.architecture?.modality?.includes("image->text");

  const isReasoning =
    id.includes("r1") ||
    id.includes("o1") ||
    id.includes("o3") ||
    id.includes("reason") ||
    id.includes("thinking") ||
    id.includes("3-7-sonnet");

  const isAudio =
    id.includes("whisper") ||
    id.includes("audio") ||
    id.includes("stt") ||
    id.includes("speech");

  const isEmbedding =
    id.includes("embedding") ||
    id.includes("embed") ||
    id.includes("bge-") ||
    id.includes("qwen3-embedding");

  const isFunctionCalling =
    !isAudio && !isEmbedding && (id.includes("gpt") || id.includes("llama-3") || id.includes("gemini") || id.includes("claude") || id.includes("qwen"));

  const suggestedPurposes: string[] = [];

  if (isAudio) {
    suggestedPurposes.push("voice_stt");
  } else if (isEmbedding) {
    suggestedPurposes.push("embedding");
  } else {
    suggestedPurposes.push("chat");
    suggestedPurposes.push("classification");
    if (isVision) suggestedPurposes.push("ocr");
    if (isReasoning || id.includes("70b") || id.includes("pro") || id.includes("sonnet")) {
      suggestedPurposes.push("report");
    }
  }

  const suggestedTiers: string[] = [];
  if (id.includes("nano") || id.includes("flash-lite") || id.includes("8b") || id.includes("instant") || id.includes("haiku")) {
    suggestedTiers.push("free", "pro", "ultra");
  } else if (id.includes("70b") || id.includes("pro") || id.includes("sonnet") || isReasoning) {
    suggestedTiers.push("pro", "ultra");
  } else if (id.includes("ultra") || id.includes("opus") || id.includes("120b") || id.includes("550b") || id.includes("o1")) {
    suggestedTiers.push("ultra");
  } else {
    suggestedTiers.push("free", "pro", "ultra");
  }

  return {
    supportsVision: !!isVision,
    supportsReasoning: !!isReasoning,
    supportsFunctionCalling: !!isFunctionCalling,
    suggestedPurposes,
    suggestedTiers,
  };
}
```

---

## 5. Dynamic AI Provider & Model Registry (`api/lib/ai-provider-registry.ts` & `api/lib/model-mapper.ts`)

### 5.1 Dynamic Registry Architecture (`api/lib/ai-provider-registry.ts`)
Refactor `api/lib/ai-provider-registry.ts` to query MySQL with an in-process 5-minute cache and instantaneous cache invalidation upon admin changes.

```typescript
import { db } from "../queries/connection";
import { aiProviders, aiModels } from "../../db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { decryptApiKey } from "./crypto-vault";
import { env } from "./env";

export type AiProviderName = "gemini" | "groq" | "fireworks" | "nvidia" | string;
export type AiPlanName = "free" | "pro" | "ultra";
export type AiPurpose =
  | "classification"
  | "chat"
  | "report"
  | "voice_stt"
  | "voice_call"
  | "embedding"
  | "ocr"
  | "goal";

export interface DynamicAiProvider {
  id: number;
  slug: string;
  displayName: string;
  protocol: "openai" | "gemini" | "anthropic";
  baseUrl: string;
  apiKey: string; // Decrypted at runtime
  isActive: boolean;
  priority: number;
  healthStatus: string;
}

export interface DynamicAiModel {
  id: number;
  providerId: number;
  providerSlug: string;
  modelId: string;
  displayName: string;
  descriptionAr: string | null;
  purposes: string[];
  allowedTiers: string[];
  isDefaultForPurpose: boolean;
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedPricePer1M: number;
  maxContextWindow: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
  supportsFunctionCalling: boolean;
  isActive: boolean;
  sortOrder: number;
}

// ── In-Memory Cache (5-Minute TTL) ──
let cachedProviders: DynamicAiProvider[] | null = null;
let cachedModels: DynamicAiModel[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateAiRegistryCache(): void {
  cachedProviders = null;
  cachedModels = null;
  cacheExpiresAt = 0;
}

/**
 * Loads all active providers and active models from the database with decryption.
 */
export async function getActiveAiRegistry(): Promise<{
  providers: DynamicAiProvider[];
  models: DynamicAiModel[];
}> {
  const now = Date.now();
  if (cachedProviders && cachedModels && cacheExpiresAt > now) {
    return { providers: cachedProviders, models: cachedModels };
  }

  try {
    const rawProviders = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.isActive, true))
      .orderBy(asc(aiProviders.priority));

    const rawModels = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels.isActive, true))
      .orderBy(asc(aiModels.sortOrder));

    const providerMap = new Map<number, DynamicAiProvider>();

    const providers: DynamicAiProvider[] = rawProviders.map((p) => {
      const decryptedKey = decryptApiKey(p.apiKeyEncrypted);
      const provider: DynamicAiProvider = {
        id: p.id,
        slug: p.slug,
        displayName: p.displayName,
        protocol: (p.protocol as any) || "openai",
        baseUrl: p.baseUrl,
        apiKey: decryptedKey,
        isActive: p.isActive,
        priority: p.priority,
        healthStatus: p.healthStatus,
      };
      providerMap.set(p.id, provider);
      return provider;
    });

    const models: DynamicAiModel[] = rawModels.map((m) => {
      const provider = providerMap.get(m.providerId);
      return {
        id: m.id,
        providerId: m.providerId,
        providerSlug: provider?.slug || "unknown",
        modelId: m.modelId,
        displayName: m.displayName,
        descriptionAr: m.descriptionAr,
        purposes: Array.isArray(m.purposes) ? m.purposes : [],
        allowedTiers: Array.isArray(m.allowedTiers) ? m.allowedTiers : [],
        isDefaultForPurpose: !!m.isDefaultForPurpose,
        inputPricePer1M: Number(m.inputPricePer1M || 0),
        outputPricePer1M: Number(m.outputPricePer1M || 0),
        cachedPricePer1M: Number(m.cachedPricePer1M || 0),
        maxContextWindow: m.maxContextWindow || 128000,
        supportsVision: !!m.supportsVision,
        supportsReasoning: !!m.supportsReasoning,
        supportsFunctionCalling: !!m.supportsFunctionCalling,
        isActive: m.isActive,
        sortOrder: m.sortOrder,
      };
    });

    cachedProviders = providers;
    cachedModels = models;
    cacheExpiresAt = now + CACHE_TTL_MS;

    return { providers, models };
  } catch (error) {
    console.warn("⚠️ Failed to load AI registry from DB, falling back to static catalog:", error);
    return {
      providers: getStaticFallbackProviders(),
      models: getStaticFallbackModels(),
    };
  }
}

/**
 * Resolves the primary model and provider for a specific purpose and plan tier.
 */
export async function resolveModelForPurposeAndTier(
  purpose: AiPurpose,
  plan: AiPlanName = "free",
): Promise<{
  model: DynamicAiModel;
  provider: DynamicAiProvider;
} | null> {
  const { providers, models } = await getActiveAiRegistry();

  // 1. Filter models matching purpose, tier, and active status
  const candidates = models.filter(
    (m) => m.purposes.includes(purpose) && m.allowedTiers.includes(plan),
  );

  if (candidates.length === 0) {
    // Fallback: try candidate matching purpose regardless of tier
    const relaxed = models.filter((m) => m.purposes.includes(purpose));
    if (relaxed.length > 0) {
      const chosen = relaxed[0];
      const provider = providers.find((p) => p.id === chosen.providerId);
      if (provider) return { model: chosen, provider };
    }
    return null;
  }

  // 2. Sort by isDefaultForPurpose DESC, then sortOrder ASC
  candidates.sort((a, b) => {
    if (a.isDefaultForPurpose && !b.isDefaultForPurpose) return -1;
    if (!a.isDefaultForPurpose && b.isDefaultForPurpose) return 1;
    return a.sortOrder - b.sortOrder;
  });

  const selectedModel = candidates[0];
  const provider = providers.find((p) => p.id === selectedModel.providerId);

  if (!provider) return null;
  return { model: selectedModel, provider };
}

/**
 * Resolves pricing for a specific modelId.
 */
export async function getModelPricing(modelId: string): Promise<{
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedPricePer1M: number;
}> {
  const { models } = await getActiveAiRegistry();
  const match = models.find((m) => m.modelId === modelId);
  if (match) {
    return {
      inputPricePer1M: match.inputPricePer1M,
      outputPricePer1M: match.outputPricePer1M,
      cachedPricePer1M: match.cachedPricePer1M,
    };
  }
  return { inputPricePer1M: 0, outputPricePer1M: 0, cachedPricePer1M: 0 };
}
```

### 5.2 Dynamic & Backward-Compatible Model Mapper (`api/lib/model-mapper.ts`)
Maintain all existing exported functions while linking them directly with the dynamic model catalog.

```typescript
import { DEPRECATED_MODEL_MAP } from "./ai-provider-registry";

export function mapModelName(modelName: string): string {
  let normalized = String(modelName || "").trim().toLowerCase();

  if (normalized.startsWith("models/")) {
    normalized = normalized.replace("models/", "");
  }

  if (!normalized) return "gemini-3.1-flash-lite";

  if (normalized === "flash") return "gemini-3.1-flash-lite";
  if (normalized === "pro" || normalized === "ultra") return "gemini-3.1-pro";

  const deprecatedMatch = DEPRECATED_MODEL_MAP[normalized];
  if (deprecatedMatch) {
    console.warn(`[model-mapper] ⚠️ Deprecated model "${normalized}" → mapped to "${deprecatedMatch}"`);
    return deprecatedMatch;
  }

  return normalized;
}

export type AiProviderName = "gemini" | "groq" | "fireworks" | "nvidia" | string;
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

export function defaultModelForProvider(
  provider: AiProviderName,
  plan: AiPlanName,
): string {
  if (provider === "nvidia") return plan === "ultra" ? "nvidia/nemotron-3-super-120b-a12b" : "meta/llama-3.2-11b-vision-instruct";
  if (provider === "fireworks") return plan === "ultra" || plan === "pro" ? "accounts/fireworks/models/deepseek-v4-pro" : "accounts/fireworks/models/deepseek-v4-flash";
  if (provider === "groq") return plan === "free" ? "deepseek-r1-distill-llama-70b" : "llama-3.3-70b-versatile";
  return plan === "ultra" ? "gemini-3.1-pro" : "gemini-3.1-flash-lite";
}

export function coerceModelForProvider(
  modelName: string | undefined,
  provider: AiProviderName,
  plan: AiPlanName,
): string {
  const mapped = mapModelName(modelName || defaultModelForProvider(provider, plan));
  if (provider === "nvidia" && !isNvidiaModel(mapped)) return defaultModelForProvider("nvidia", plan);
  if (provider === "groq" && isGeminiModel(mapped)) return defaultModelForProvider("groq", plan);
  if (provider === "gemini" && isGroqModel(mapped)) return defaultModelForProvider("gemini", plan);
  if (provider === "fireworks" && !isFireworksModel(mapped)) return defaultModelForProvider("fireworks", plan);
  return mapped;
}
```

---

## 6. Admin tRPC Router Specifications (`api/admin-router.ts`)

Add 8 dedicated tRPC procedures to `api/admin-router.ts`:

### 6.1 Procedure Implementations

```typescript
import { encryptApiKey, decryptApiKey, maskApiKey } from "./lib/crypto-vault";
import { discoverRemoteModels } from "./lib/model-discovery";
import { invalidateAiRegistryCache } from "./lib/ai-provider-registry";
import { aiProviders, aiModels } from "../db/schema";

// ── 1. getAiProviders ──
getAiProviders: adminProcedure.query(async () => {
  const providers = await db
    .select()
    .from(aiProviders)
    .orderBy(asc(aiProviders.priority));

  const modelCounts = await db
    .select({
      providerId: aiModels.providerId,
      totalModels: count(aiModels.id),
      activeModels: sum(sql`CASE WHEN ${aiModels.isActive} = 1 THEN 1 ELSE 0 END`),
    })
    .from(aiModels)
    .groupBy(aiModels.providerId);

  const countMap = new Map(modelCounts.map((c) => [c.providerId, c]));

  return providers.map((p) => ({
    id: p.id,
    slug: p.slug,
    displayName: p.displayName,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    maskedApiKey: maskApiKey(p.apiKeyEncrypted),
    supportsModelDiscovery: p.supportsModelDiscovery,
    isActive: p.isActive,
    priority: p.priority,
    healthStatus: p.healthStatus,
    lastHealthCheck: p.lastHealthCheck,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    modelCount: Number(countMap.get(p.id)?.totalModels || 0),
    activeModelCount: Number(countMap.get(p.id)?.activeModels || 0),
  }));
}),

// ── 2. createAiProvider ──
createAiProvider: adminProcedure
  .input(
    z.object({
      slug: z.string().min(1).max(50),
      displayName: z.string().min(1).max(100),
      protocol: z.enum(["openai", "gemini", "anthropic"]).default("openai"),
      baseUrl: z.string().min(1).max(500),
      apiKey: z.string().min(1),
      priority: z.number().int().default(10),
      isActive: z.boolean().default(true),
      supportsModelDiscovery: z.boolean().default(true),
    }),
  )
  .mutation(async ({ input }) => {
    const encryptedKey = encryptApiKey(input.apiKey);

    await db.insert(aiProviders).values({
      slug: input.slug.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      protocol: input.protocol,
      baseUrl: input.baseUrl.trim(),
      apiKeyEncrypted: encryptedKey,
      priority: input.priority,
      isActive: input.isActive,
      supportsModelDiscovery: input.supportsModelDiscovery,
      healthStatus: "unknown",
    });

    invalidateAiRegistryCache();
    return { success: true, message: "تم إضافة مزود الذكاء الاصطناعي بنجاح" };
  }),

// ── 3. testAndDiscoverModels ──
testAndDiscoverModels: adminProcedure
  .input(
    z.object({
      providerId: z.number().optional(),
      protocol: z.enum(["openai", "gemini", "anthropic"]),
      baseUrl: z.string().min(1),
      apiKey: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    let resolvedKey = input.apiKey || "";

    // If key not provided or is masked, fetch from existing provider in DB
    if ((!resolvedKey || resolvedKey.includes("...")) && input.providerId) {
      const [existing] = await db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.id, input.providerId));
      if (existing) {
        resolvedKey = decryptApiKey(existing.apiKeyEncrypted);
      }
    }

    if (!resolvedKey) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "مفتاح API مطلوب لاختبار الاتصال واستكشاف الموديلات",
      });
    }

    const result = await discoverRemoteModels({
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      apiKey: resolvedKey,
    });

    if (input.providerId) {
      await db
        .update(aiProviders)
        .set({
          healthStatus: result.success ? "healthy" : "down",
          lastHealthCheck: new Date(),
        })
        .where(eq(aiProviders.id, input.providerId));
    }

    return result;
  }),

// ── 4. updateAiProvider ──
updateAiProvider: adminProcedure
  .input(
    z.object({
      id: z.number(),
      slug: z.string().min(1).max(50).optional(),
      displayName: z.string().min(1).max(100).optional(),
      protocol: z.enum(["openai", "gemini", "anthropic"]).optional(),
      baseUrl: z.string().min(1).max(500).optional(),
      apiKey: z.string().optional(),
      priority: z.number().int().optional(),
      isActive: z.boolean().optional(),
      supportsModelDiscovery: z.boolean().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const updateData: Record<string, any> = {};

    if (input.slug !== undefined) updateData.slug = input.slug.trim().toLowerCase();
    if (input.displayName !== undefined) updateData.displayName = input.displayName.trim();
    if (input.protocol !== undefined) updateData.protocol = input.protocol;
    if (input.baseUrl !== undefined) updateData.baseUrl = input.baseUrl.trim();
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.supportsModelDiscovery !== undefined) updateData.supportsModelDiscovery = input.supportsModelDiscovery;

    if (input.apiKey && !input.apiKey.includes("...")) {
      updateData.apiKeyEncrypted = encryptApiKey(input.apiKey);
    }

    await db
      .update(aiProviders)
      .set(updateData)
      .where(eq(aiProviders.id, input.id));

    invalidateAiRegistryCache();
    return { success: true, message: "تم تحديث المزود بنجاح" };
  }),

// ── 5. deleteAiProvider ──
deleteAiProvider: adminProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ input }) => {
    // Cascade delete models first
    await db.delete(aiModels).where(eq(aiModels.providerId, input.id));
    await db.delete(aiProviders).where(eq(aiProviders.id, input.id));

    invalidateAiRegistryCache();
    return { success: true, message: "تم حذف المزود وكافة الموديلات المرتبطة به" };
  }),

// ── 6. getAiModels ──
getAiModels: adminProcedure
  .input(
    z
      .object({
        providerId: z.number().optional(),
        purpose: z.string().optional(),
        tier: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    let query = db
      .select({
        id: aiModels.id,
        providerId: aiModels.providerId,
        providerSlug: aiProviders.slug,
        providerName: aiProviders.displayName,
        modelId: aiModels.modelId,
        displayName: aiModels.displayName,
        descriptionAr: aiModels.descriptionAr,
        purposes: aiModels.purposes,
        allowedTiers: aiModels.allowedTiers,
        isDefaultForPurpose: aiModels.isDefaultForPurpose,
        inputPricePer1M: aiModels.inputPricePer1M,
        outputPricePer1M: aiModels.outputPricePer1M,
        cachedPricePer1M: aiModels.cachedPricePer1M,
        maxContextWindow: aiModels.maxContextWindow,
        supportsVision: aiModels.supportsVision,
        supportsReasoning: aiModels.supportsReasoning,
        supportsFunctionCalling: aiModels.supportsFunctionCalling,
        isActive: aiModels.isActive,
        sortOrder: aiModels.sortOrder,
        createdAt: aiModels.createdAt,
        updatedAt: aiModels.updatedAt,
      })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .orderBy(asc(aiModels.sortOrder));

    const rows = await query;

    return rows.filter((row) => {
      if (input?.providerId && row.providerId !== input.providerId) return false;
      if (input?.isActive !== undefined && row.isActive !== input.isActive) return false;
      if (input?.purpose && !((row.purposes as string[]) || []).includes(input.purpose)) return false;
      if (input?.tier && !((row.allowedTiers as string[]) || []).includes(input.tier)) return false;
      return true;
    });
  }),

// ── 7. importDiscoveredModels ──
importDiscoveredModels: adminProcedure
  .input(
    z.object({
      providerId: z.number(),
      models: z.array(
        z.object({
          modelId: z.string().min(1),
          displayName: z.string().min(1),
          descriptionAr: z.string().optional(),
          purposes: z.array(z.string()).default(["chat", "classification"]),
          allowedTiers: z.array(z.string()).default(["free", "pro", "ultra"]),
          isDefaultForPurpose: z.boolean().default(false),
          inputPricePer1M: z.number().default(0),
          outputPricePer1M: z.number().default(0),
          cachedPricePer1M: z.number().default(0),
          maxContextWindow: z.number().default(128000),
          supportsVision: z.boolean().default(false),
          supportsReasoning: z.boolean().default(false),
          supportsFunctionCalling: z.boolean().default(false),
          isActive: z.boolean().default(true),
          sortOrder: z.number().default(0),
        }),
      ),
    }),
  )
  .mutation(async ({ input }) => {
    let imported = 0;
    for (const m of input.models) {
      await db
        .insert(aiModels)
        .values({
          providerId: input.providerId,
          modelId: m.modelId,
          displayName: m.displayName,
          descriptionAr: m.descriptionAr,
          purposes: m.purposes,
          allowedTiers: m.allowedTiers,
          isDefaultForPurpose: m.isDefaultForPurpose,
          inputPricePer1M: m.inputPricePer1M.toString(),
          outputPricePer1M: m.outputPricePer1M.toString(),
          cachedPricePer1M: m.cachedPricePer1M.toString(),
          maxContextWindow: m.maxContextWindow,
          supportsVision: m.supportsVision,
          supportsReasoning: m.supportsReasoning,
          supportsFunctionCalling: m.supportsFunctionCalling,
          isActive: m.isActive,
          sortOrder: m.sortOrder,
        })
        .onDuplicateKeyUpdate({
          set: {
            displayName: m.displayName,
            descriptionAr: m.descriptionAr,
            purposes: m.purposes,
            allowedTiers: m.allowedTiers,
            inputPricePer1M: m.inputPricePer1M.toString(),
            outputPricePer1M: m.outputPricePer1M.toString(),
            cachedPricePer1M: m.cachedPricePer1M.toString(),
            maxContextWindow: m.maxContextWindow,
            supportsVision: m.supportsVision,
            supportsReasoning: m.supportsReasoning,
            supportsFunctionCalling: m.supportsFunctionCalling,
            isActive: m.isActive,
          },
        });
      imported++;
    }

    invalidateAiRegistryCache();
    return { success: true, importedCount: imported, message: `تم استيراد ${imported} موديل بنجاح` };
  }),

// ── 8. updateAiModelConfig ──
updateAiModelConfig: adminProcedure
  .input(
    z.object({
      id: z.number(),
      displayName: z.string().optional(),
      descriptionAr: z.string().optional(),
      purposes: z.array(z.string()).optional(),
      allowedTiers: z.array(z.string()).optional(),
      isDefaultForPurpose: z.boolean().optional(),
      inputPricePer1M: z.number().optional(),
      outputPricePer1M: z.number().optional(),
      cachedPricePer1M: z.number().optional(),
      maxContextWindow: z.number().optional(),
      supportsVision: z.boolean().optional(),
      supportsReasoning: z.boolean().optional(),
      supportsFunctionCalling: z.boolean().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const updateData: Record<string, any> = {};

    if (input.displayName !== undefined) updateData.displayName = input.displayName;
    if (input.descriptionAr !== undefined) updateData.descriptionAr = input.descriptionAr;
    if (input.purposes !== undefined) updateData.purposes = input.purposes;
    if (input.allowedTiers !== undefined) updateData.allowedTiers = input.allowedTiers;
    if (input.isDefaultForPurpose !== undefined) updateData.isDefaultForPurpose = input.isDefaultForPurpose;
    if (input.inputPricePer1M !== undefined) updateData.inputPricePer1M = input.inputPricePer1M.toString();
    if (input.outputPricePer1M !== undefined) updateData.outputPricePer1M = input.outputPricePer1M.toString();
    if (input.cachedPricePer1M !== undefined) updateData.cachedPricePer1M = input.cachedPricePer1M.toString();
    if (input.maxContextWindow !== undefined) updateData.maxContextWindow = input.maxContextWindow;
    if (input.supportsVision !== undefined) updateData.supportsVision = input.supportsVision;
    if (input.supportsReasoning !== undefined) updateData.supportsReasoning = input.supportsReasoning;
    if (input.supportsFunctionCalling !== undefined) updateData.supportsFunctionCalling = input.supportsFunctionCalling;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

    await db
      .update(aiModels)
      .set(updateData)
      .where(eq(aiModels.id, input.id));

    invalidateAiRegistryCache();
    return { success: true, message: "تم تحديث إعدادات الموديل بنجاح" };
  }),
```

---

## 7. Verification & Testing Strategy

### 7.1 Unit & Integration Test Suites
Create test file `api/lib/crypto-vault.test.ts` and `api/lib/model-discovery.test.ts`:
1. **Crypto Vault Unit Tests**:
   - Encrypts and decrypts various API keys (`sk-ant-...`, `gsk_...`, `AIzaSy...`).
   - Verifies random IV generation produces different ciphertexts for identical plaintext.
   - Verifies transparent fallback when input is plaintext.
   - Verifies key masking.
2. **Model Discovery Unit Tests**:
   - Mocks OpenAI `/models` response, tests capability parsing, pricing per 1M conversion, and purpose inferencing.
   - Mocks Gemini `/v1beta/models` response, tests `models/` prefix stripping and generation method mapping.
3. **Dynamic Registry & Fallback Tests**:
   - Verifies DB caching with TTL and invalidation.
   - Verifies `resolveModelForPurposeAndTier` fallback behavior.
4. **Type Check & Suite Run**:
   - `npm run check` (100% strict TypeScript pass).
   - `npm run test` (All Vitest suites pass).

---

## 8. Summary of Milestones Readiness

This blueprint provides the complete, authoritative, copy-paste ready implementation specifications for Milestone 1. Once implemented by the team workers, Milestone 2 (Universal AI Gateway & Prompt Anatomy) can immediately build on top of these dynamic provider and model tables.
