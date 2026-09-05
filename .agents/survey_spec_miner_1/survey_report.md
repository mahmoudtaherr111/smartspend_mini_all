# SmartSpend AI Re-Architecture — Comprehensive Specification Mining Report

> **Document Version**: 1.0.0  
> **Date**: 2026-08-28  
> **Author**: `survey_spec_miner_1` (Teamwork Specification Miner)  
> **Status**: Completed Specification Discovery & Formal Architecture Blueprint  
> **Primary References**:  
> - `ORIGINAL_REQUEST.md` (Authoritative User Request)  
> - `C:/Users/hp/.gemini/antigravity/brain/9de0ffb3-09f5-4fd3-8336-f6eef5a741a9/engineering_specification.md` (Engineering Specification)  
> - `e:/smartspend_V1_fixed/AGENTS.md` (System Architecture & Invariants)

---

## 1. Executive Summary & System Overview

SmartSpend AI is an enterprise behavioral financial platform for Arabic-speaking users (Egyptian market: EGP, local e-wallets, Egyptian-dialect NLP). The re-architecture transitions SmartSpend AI from a static, hardcoded multi-model setup to an **enterprise-grade dynamic AI infrastructure** with:

1. **Dynamic Multi-Provider & Automatic Model Discovery Engine**: Zero-code onboarding of any OpenAI-compatible provider (OpenRouter, DeepSeek, Together, Groq, Fireworks, NVIDIA NIM, Ollama) plus native Google Gemini and Anthropic Claude SDKs, dynamic remote discovery (`GET /v1/models`), purpose & tier visual routing, and AES-256-GCM encrypted API key storage.
2. **Universal AI Gateway & Prompt Anatomy Deconstruction**: A single choke-point (`AiGateway.execute()`) intercepting 100% of all 17 AI execution paths in the codebase, recording granular input/execution token anatomy, calculating real monetary costs (USD/EGP) via exact provider rates, enforcing monthly billing cycle quotas, and logging an immutable audit trail in `ai_token_ledgers`.
3. **Context & Polarity-Aware Rule Confidence Engine**: Probabilistic 3-factor classification scoring combined with Egyptian-dialect polarity multipliers to prevent false expense high-confidence saves on negated/zero-payment phrases (e.g., "عزمني على غدا ومادفعتش"), while disambiguating polysemous Egyptian terms ("نور", "كريم", "مشروع", "شلت") using structural context.
4. **Admin AI Command Center & Token Inspector**: A modular admin frontend suite (`src/components/admin/ai-center/`) replacing the monolithic `Admin.tsx` AI sections with 4 comprehensive operational tabs, an in-depth token anatomy inspector modal, and a live Egyptian dialect rule engine sandbox.

---

## 2. Pillar 1: Dynamic AI Provider & Automatic Model Discovery Engine

### 2.1 Architectural Objectives
- Enable non-technical administrators to configure new AI providers and models dynamically from the Admin UI without touching TypeScript code or restarting the server.
- Support standard protocols:
  - `"openai"`: Any OpenAI-compatible endpoint (OpenRouter, DeepSeek Direct, Groq, Fireworks, NVIDIA NIM, Together AI, local Ollama, vLLM).
  - `"gemini"`: Google Generative AI SDK native protocol.
  - `"anthropic"`: Anthropic Claude Messages API.
- Support live endpoint health checks, connection testing, and automated model discovery (`GET /v1/models`).
- Support visual mapping of discovered models to specific system purposes (`chat`, `classification`, `ocr`, `voice_stt`, `voice_call`, `report`, `goal`, `embedding`) and subscription tiers (`free`, `pro`, `ultra`), with per-model pricing overrides.
- Provide secure AES-256-GCM symmetric key encryption for API keys stored at rest in the database.

---

### 2.2 Database Schema Specification

#### Table 1: `ai_providers`
```typescript
import { mysqlTable, int, varchar, text, datetime, boolean, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const aiProviders = mysqlTable(
  "ai_providers",
  {
    id: int("id").primaryKey().autoincrement(),
    slug: varchar("slug", { length: 50 }).notNull().unique(), // e.g. "openrouter", "deepseek-direct", "groq", "gemini-native"
    displayName: varchar("display_name", { length: 100 }).notNull(), // e.g. "OpenRouter Global Gateway"
    protocol: varchar("protocol", { length: 30 }).notNull().default("openai"), // "openai" | "gemini" | "anthropic"
    baseUrl: varchar("base_url", { length: 500 }).notNull(), // e.g. "https://openrouter.ai/api/v1" or "https://api.deepseek.com/v1"
    apiKeyEncrypted: text("api_key_encrypted").notNull(), // AES-256-GCM encrypted string: "iv:authTag:ciphertext"
    supportsModelDiscovery: boolean("supports_model_discovery").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    priority: int("priority").notNull().default(10), // Lower = higher preference for failover (e.g. 1 is highest priority)
    healthStatus: varchar("health_status", { length: 20 }).notNull().default("unknown"), // "healthy" | "degraded" | "down" | "unknown"
    lastHealthCheck: datetime("last_health_check"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_provider_active_priority").on(t.isActive, t.priority),
  ]
);
```

#### Table 2: `ai_models`
```typescript
export const aiModels = mysqlTable(
  "ai_models",
  {
    id: int("id").primaryKey().autoincrement(),
    providerId: int("provider_id").notNull(), // FK to ai_providers.id
    modelId: varchar("model_id", { length: 200 }).notNull(), // e.g. "deepseek/deepseek-r1", "meta-llama/llama-3.3-70b-instruct"
    displayName: varchar("display_name", { length: 200 }).notNull(), // e.g. "DeepSeek R1 (OpenRouter)"
    descriptionAr: text("description_ar"), // Arabic UI description
    
    // Assignment & Routing (Stored as JSON arrays of strings)
    purposes: json("purposes").notNull(), // Array<"chat"|"classification"|"ocr"|"voice_stt"|"voice_call"|"report"|"goal"|"embedding">
    allowedTiers: json("allowed_tiers").notNull(), // Array<"free"|"pro"|"ultra">
    isDefaultForPurpose: boolean("is_default_for_purpose").notNull().default(false), // Primary default for its assigned purpose×tier
    
    // Pricing Overrides (USD per 1,000,000 tokens)
    inputPricePer1M: decimal("input_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.000000"),
    outputPricePer1M: decimal("output_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.000000"),
    cachedPricePer1M: decimal("cached_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.000000"),
    
    // Model Capabilities & Limits
    maxContextWindow: int("max_context_window").notNull().default(128000),
    supportsVision: boolean("supports_vision").notNull().default(false),
    supportsReasoning: boolean("supports_reasoning").notNull().default(false), // CoT / <think> tags (e.g. DeepSeek R1, OpenAI o1)
    supportsFunctionCalling: boolean("supports_function_calling").notNull().default(false), // Tool call support
    
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("idx_model_provider_model_unique").on(t.providerId, t.modelId),
    index("idx_model_active_sort").on(t.isActive, t.sortOrder),
    index("idx_model_provider_fk").on(t.providerId),
  ]
);
```

#### Drizzle Relations (`db/relations.ts`)
```typescript
export const aiProvidersRelations = relations(aiProviders, ({ many }) => ({
  models: many(aiModels),
  ledgers: many(aiTokenLedgers),
}));

export const aiModelsRelations = relations(aiModels, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [aiModels.providerId],
    references: [aiProviders.id],
  }),
}));
```

---

### 2.3 Cryptographic Key Storage Specification (AES-256-GCM)

To protect third-party API credentials stored in MySQL, keys must be symmetrically encrypted at rest:
- **Algorithm**: `aes-256-gcm`
- **Key Derivation**: 32-byte key derived from `process.env.ENCRYPTION_KEY` (fallback: `createHash('sha256').update(process.env.JWT_SECRET).digest()`).
- **Initialization Vector (IV)**: 12-byte random bytes generated per encryption (`crypto.randomBytes(12)`).
- **Authentication Tag**: 16-byte GCM authentication tag ensuring tamper-proof ciphertext.
- **Serialized Storage Format**: `${ivHex}:${authTagHex}:${ciphertextHex}`.

```typescript
// api/lib/crypto-vault.ts
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getMasterKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "smartspend-master-encryption-secret-default";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plaintextKey: string): string {
  if (!plaintextKey) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  let encrypted = cipher.update(plaintextKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptApiKey(encryptedPayload: string): string {
  if (!encryptedPayload) return "";
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    // Fallback for unencrypted legacy keys during migration
    return encryptedPayload;
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

---

### 2.4 Automatic Model Discovery (`GET /v1/models`)

When testing a connection or discovering models, the engine dispatches to protocol-specific discovery handlers:

1. **OpenAI-Compatible (`protocol === "openai"`)**:
   - HTTP Request: `GET ${baseUrl}/models`
   - Headers: `Authorization: Bearer ${apiKey}`, `User-Agent: SmartSpend/2.0`
   - Response Extraction: `data.data[]` -> mapping `{ modelId: item.id, displayName: item.name || item.id, maxContextWindow: item.context_length || 128000 }`.
2. **Google Gemini (`protocol === "gemini"`)**:
   - HTTP Request / SDK: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
   - Response Extraction: `models[]` -> filter models with `supportedGenerationMethods.includes("generateContent")`, strip `models/` prefix.
3. **Anthropic (`protocol === "anthropic"`)**:
   - HTTP Request: `GET https://api.anthropic.com/v1/models` with `x-api-key: ${apiKey}` and `anthropic-version: 2023-06-01`.

---

## 3. Pillar 2: Universal AI Gateway & Prompt Anatomy Deconstruction

### 3.1 The 17 AI Execution Paths (Complete Audit & Migration Plan)

All 17 existing execution paths must be routed through `AiGateway.execute()`:

| # | Execution Source File & Line | Purpose / Channel | Provider / Protocol | Current Tracking Status | Gateway Channel Name |
|---|---|---|---|---|---|
| 1 | `api/ai-router.ts:205` | Speech-to-Text | Groq Whisper (`protocol: openai`) | Incomplete (returns 0 tokens) | `voice_stt` |
| 2 | `api/ai-router.ts:231` | Speech-to-Text | Gemini Flash (`protocol: gemini`) | Tracked via `usageMetadata` | `voice_stt` |
| 3 | `api/ai-router.ts:728` | Transaction Parsing | Smart Pipeline | Tracked via `trackTokens` | `classification` |
| 4 | `api/ai-router.ts:1544` | Voice Transaction Parsing | Smart Pipeline + Audio STT | Tracked via `trackTokens` (2 calls) | `classification` |
| 5 | `api/ai-router.ts:2692` | Monthly/Yearly Report Gen | Groq/Fireworks/NVIDIA/Gemini | Tracked via `trackTokens` | `report` |
| 6 | `api/ai-router.ts:3129` | Period Comparison Report | Deterministic Rule Logic | No LLM tokens (0 cost) | `report` (bypass/local) |
| 7 | `api/chat-router.ts:800` | AI Financial Assistant Chat | AI Kernel (DeepSeek/Fireworks) | Direct DB update (no quota cycle) | `chat` |
| 8 | `api/business-router.ts:139` | Business Category Suggestion | Gemini SDK | **ZERO TRACKING (LEAK)** | `business` |
| 9 | `api/goals-router.ts:244` | Financial Goal Optimization | Gemini SDK | Incomplete (no `recordAICostMetric`) | `goal` |
| 10 | `api/image-router.ts` / `receipt-image-parser.ts:110` | Receipt OCR & Vision Parsing | Gemini Pro Vision | Incomplete (no `recordAICostMetric`) | `ocr` |
| 11 | `api/lib/sms-ai-parser.ts:141` | SMS Bank Transaction Parsing | Gemini Flash | **ZERO TRACKING (LEAK)** | `sms` |
| 12 | `api/lib/narrative-decomposer.ts:903` | Multi-Transaction Decomp | Gemini Flash | **ZERO TRACKING (LEAK)** | `narrative_decomp` |
| 13 | `api/services/voice-call-service.ts:422` | Real-time Live Voice WebSocket | Gemini Live WebSocket | **ZERO TRACKING (LEAK)** | `voice_call` |
| 14 | `api/jobs/monthly-report-job.ts:260` | Background Batch Cron Reports | Fireworks | Admin batch (not user billed) | `report_batch` |
| 15 | `api/lib/fireworks-embedding-client.ts:90` | Vector Classifier Embeddings | Fireworks Qwen3 Embedding | **ZERO TRACKING (LEAK)** | `embedding` |
| 16 | `api/services/ai-memory/embedding-client.ts:111` | RAG Semantic Memory Embeddings | Fireworks Qwen3 Embedding | **ZERO TRACKING (LEAK)** | `embedding` |
| 17 | `api/lib/smart-pipeline.ts:1264-1332` | Layer 3/4 AI Fallback Classifier | Groq/Fireworks/NVIDIA/Gemini | Tracked via caller aggregation | `classification` |

---

### 3.2 Database Schema: `ai_token_ledgers`

```typescript
export const aiTokenLedgers = mysqlTable(
  "ai_token_ledgers",
  {
    id: int("id").primaryKey().autoincrement(),
    traceId: varchar("trace_id", { length: 64 }).notNull().unique(), // e.g. "chat_usr42_1724823730_a9f1"
    
    // Identity & Billing Period
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 20 }).notNull(), // "oauth" | "local"
    billingPeriod: varchar("billing_period", { length: 7 }).notNull(), // "YYYY-MM" (e.g. "2026-08")
    
    // Execution Routing
    channel: varchar("channel", { length: 30 }).notNull(), // "chat"|"classification"|"ocr"|"voice_stt"|"voice_call"|"report"|"goal"|"sms"|"business"|"embedding"|"narrative_decomp"
    providerId: int("provider_id"), // FK to ai_providers.id
    providerSlug: varchar("provider_slug", { length: 50 }).notNull(), // e.g. "openrouter", "deepseek"
    modelId: varchar("model_id", { length: 200 }).notNull(), // e.g. "deepseek/deepseek-r1"
    
    // Provider Actual Token Accounting
    promptTokens: int("prompt_tokens").notNull().default(0),
    completionTokens: int("completion_tokens").notNull().default(0),
    cachedTokens: int("cached_tokens").notNull().default(0),
    reasoningTokens: int("reasoning_tokens").notNull().default(0), // CoT tokens (thinking tokens)
    totalTokens: int("total_tokens").notNull().default(0),
    
    // Prompt Anatomy (Granular Input Token Decomposition)
    systemPromptTokens: int("system_prompt_tokens").notNull().default(0),
    memoryRagTokens: int("memory_rag_tokens").notNull().default(0),
    historyTokens: int("history_tokens").notNull().default(0),
    userInputTokens: int("user_input_tokens").notNull().default(0),
    toolSchemaTokens: int("tool_schema_tokens").notNull().default(0),
    
    // Cost Accounting (Real Currency)
    costUsd: decimal("cost_usd", { precision: 12, scale: 8 }).notNull().default("0.00000000"),
    costEgp: decimal("cost_egp", { precision: 12, scale: 6 }).notNull().default("0.000000"),
    
    // Performance & Execution Telemetry
    latencyMs: int("latency_ms").notNull().default(0),
    httpStatus: int("http_status").notNull().default(200),
    finishReason: varchar("finish_reason", { length: 30 }), // "stop" | "length" | "tool_calls" | "error"
    
    // Relational Context
    conversationId: int("conversation_id"), // FK to chatConversations
    classificationLogId: int("classification_log_id"), // FK to classificationLogs
    metadata: json("metadata"), // Extra context: { toolCalls: [...], retryCount: 0, cacheHitRate: 0.85 }
    
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_ledger_user_period").on(t.userId, t.userType, t.billingPeriod),
    index("idx_ledger_channel_date").on(t.channel, t.createdAt),
    index("idx_ledger_provider_model").on(t.providerSlug, t.modelId, t.createdAt),
    index("idx_ledger_created_at").on(t.createdAt),
  ]
);
```

---

### 3.3 Prompt Anatomy Decomposition & Token Accounting Formula

#### Granular Token Anatomy Breakdown
When assembling a request payload, the Gateway breaks down the input tokens into 5 distinct buckets before calling the external model:
1. **`systemPromptTokens`**: Base persona, system instructions, Egyptian dialect rules, and classification taxonomy.
2. **`memoryRagTokens`**: Injected RAG facts, past transactions, user profile constraints, and budget targets.
3. **`historyTokens`**: Previous conversation turns (`role: "user"` and `role: "assistant"`).
4. **`userInputTokens`**: Current user query, raw voice transcript, or SMS text.
5. **`toolSchemaTokens`**: JSON schema definitions for function calling (e.g. `saveExpense`, `searchTransactions`).

#### Cost Calculation Formula
$$\text{billablePromptTokens} = \max(0, \text{promptTokens} - \text{cachedTokens})$$

$$\text{costUsd} = \frac{\text{billablePromptTokens} \times \text{inputPricePer1M}}{1{,}000{,}000} + \frac{\text{cachedTokens} \times \text{cachedPricePer1M}}{1{,}000{,}000} + \frac{\text{completionTokens} \times \text{outputPricePer1M}}{1{,}000{,}000}$$

$$\text{costEgp} = \text{costUsd} \times \text{exchangeRate}$$

*Where `exchangeRate` is retrieved from `system_settings.usd_to_egp_rate` (default: `48.50`).*

---

### 3.4 Monthly Billing Cycle Quota Enforcement

1. **Cycle Determination**:
   - For users with active subscription in `proSubscriptions`: cycle starts on subscription anchor day `X` of the month. `billingPeriod` format: `YYYY-MM`.
   - For free tier users: cycle aligns with the current calendar month `YYYY-MM`.
2. **Plan Quotas**:
   - `free`: 50,000 tokens / billing period
   - `pro`: 500,000 tokens / billing period
   - `ultra`: 2,000,000 tokens / billing period
3. **Performance Optimization**:
   - Fast-path quota verification via in-memory LRU cache (`${userType}:${userId}:${billingPeriod}`, 5-minute TTL).
   - On cache miss: `SELECT SUM(total_tokens) FROM ai_token_ledgers WHERE user_id = ? AND user_type = ? AND billing_period = ?`.
4. **Quota Violation**:
   - Gateway immediately throws `TRPCError({ code: "FORBIDDEN", message: "لقد استهلكت رصيد التوكنز المخصص لباقة اشتراكك لهذا الشهر. يمكنك الترقية لباقة أعلى لمواصلة الاستخدام." })`.

---

## 4. Pillar 3: Context & Polarity-Aware Rule Confidence Engine

### 4.1 Probabilistic Scoring Formula

The rule engine in `api/lib/rule-engine.ts` replaces static, ad-hoc score adjustments with a formal 3-factor probabilistic scoring model:

$$\text{Confidence} = \left( (S_{\text{semantic}} \times 0.50) + (S_{\text{context}} \times 0.30) + (S_{\text{category}} \times 0.20) \right) \times \text{PolarityMultiplier}$$

Where:
- $S_{\text{semantic}} \in [0, 100]$: Lexical and synonym match score from the merchant/category dictionary (exact merchant = 100, trigram/bigram = 88–92, unigram exact = 85, fuzzy match = 55).
- $S_{\text{context}} \in [0, 100]$: Structural relation score based on surrounding action verbs, prepositions, and grammatical modifiers (e.g. "دفعت في المطعم" vs "عزمني في المطعم").
- $S_{\text{category}} \in [0, 100]$: Subcategory specificity and category coherence score (refined subcategory = 90–100, generic "عام" = 70).
- $\text{PolarityMultiplier} \in [0.0, 1.0]$: Contextual polarity modifier derived from negation, cancellation, or hypothetical statements.

---

### 4.2 Polarity Multipliers & Egyptian Dialect Negation Rules

To prevent false high-confidence auto-saves for non-transactions or negated spending, the `PolarityMultiplier` is assigned as follows:

| Condition / Dialect Pattern | Examples | PolarityMultiplier | Resulting Action |
|---|---|---|---|
| **Explicit Positive Payment** | "دفعت 200 جنية في كارفور", "شحنت رصيد 50" | **1.00** | Full confidence retained ($\ge 85\% \to$ Auto-Save) |
| **Direct Expense Negation** | "مادفعتش", "ماصرفتش", "مش هدفع", "مدفعتش", "مادفعناش", "مجبناش" | **0.10** | Confidence drops to $< 15\% \to$ Clarify / Cancel |
| **Social Invitation / Third-Party Payment** | "صاحبي عزمني على غدا ومادفعتش", "اتعزمت عند مروان ومادفعناش حاجة" | **0.15** | Confidence drops to $< 20\% \to$ Mark as non-expense |
| **Cancellation / Abandonment** | "كنت عايز اشتري بس لغيت", "طلبنا الأكل وبعدين كنسلنا", "رجعت في كلامي" | **0.15** | Confidence drops to $< 20\% \to$ Prevent expense recording |
| **Hypothetical / Inquiry** | "ادفع كام لو ركبت اوبر؟", "هو بكام المترو؟", "لو اشتريت هدوم" | **0.30** | Confidence drops to $< 30\% \to$ Route to AI conversational assistant |
| **Ambiguous / Split Uncertainty** | "حولت لأحمد خمسين ولا ستين", "تقريباً صرفت 100" | **0.60** | Confidence drops to $50-65\% \to$ Trigger User Review |

---

### 4.3 Polysemous Egyptian Terms & Structural Relational Disambiguation

The engine applies strict contextual rules for polysemous Egyptian financial and colloquial terms:

```typescript
// Disambiguation matrix for high-frequency ambiguous Egyptian terms
export const POLYSEMOUS_DISAMBIGUATION_RULES = {
  "نور": {
    utility_bill: {
      regex: /(?:فاتور[ةه]|وصل|عداد|شركة|سداد|دفع|شحن|قطع)\s*(?:نور|الكهربا|النور)|(?:نور|النور)\s*(?:القطع|قطع|جه)/i,
      category: "فواتير",
      subCategory: "كهرباء",
      scoreBoost: 95
    },
    person_transfer: {
      regex: /(?:حولت|بعتت|سلفت|اديت|أديت|خدت|اخدت)\s*(?:لـ?نور|من\s+نور)|(?:نور)\s*(?:حولتلي|بعتتلي|سلفتني)/i,
      category: "تحويل",
      subCategory: "أشخاص",
      scoreBoost: 90
    }
  },
  "كريم": {
    ride_hailing: {
      regex: /(?:ركبت|طلبت|مشوار|كابتن|رحل[ةه]|توصيل[ةه]|اوبر\s+و?كريم)\s*(?:كريم|careem)?|(?:كريم)\s*(?:كابتن|السواق)/i,
      category: "مواصلات",
      subCategory: "أوبر/كريم",
      scoreBoost: 95
    },
    person_contact: {
      regex: /(?:سلفت|اديت|أديت|حولت|استلمت|خدت|من|لـ?)\s*(?:كريم|كرييم)(?!\s*(?:كابتن|مشوار|اوبر))/i,
      category: "تحويل",
      subCategory: "أشخاص",
      scoreBoost: 90
    }
  },
  "مشروع": {
    business_investment: {
      regex: /(?:استثمرت|دفعت|حطيت|شريك|تأسيس|ارباح|رأس\s*مال)\s*(?:في\s+المشروع|مشروع)/i,
      category: "استثمار",
      subCategory: "مشاريع وأعمال",
      scoreBoost: 92
    },
    alexandria_microbus: {
      regex: /(?:ركبت|نزلت\s+من|اجر[ةه]|سواق|موقف)\s*(?:المشروع|مشروع)/i,
      category: "مواصلات",
      subCategory: "أتوبيس",
      scoreBoost: 88
    }
  },
  "شلت": {
    gold_investment: {
      regex: /(?:شلت|اشتريت)\s*(?:دهب|ذهب|سبيك[ةه]|جنيه\s*دهب|جرام)/i,
      category: "استثمار",
      subCategory: "ذهب",
      scoreBoost: 95
    },
    atm_withdrawal: {
      regex: /(?:شلت|سحبت)\s*(?:فلوس|كاش|من\s*(?:الـ?atm|البنك|الفيزا))/i,
      category: "تحويل",
      subCategory: "سحب ATM",
      scoreBoost: 92
    }
  }
};
```

---

### 4.4 Decision Thresholds & Review Actions
- **Auto-Save ($\text{Confidence} \ge 85\%$)**: Direct insertion into `expenses` table, zero user intervention, response labeled `needsReview: false`.
- **Review Mode ($60\% \le \text{Confidence} < 85\%$)**: Inserted with `status: "pending_clarification"`, flagged on user dashboard with amber indicator, response labeled `needsReview: true`.
- **Clarification / AI Fallback ($\text{Confidence} < 60\%$)**: Dispatches to Layer 4 AI Gateway with structured clarification prompt or conversational question.

---

## 5. Pillar 4: Admin AI Command Center & Token Inspector Frontend

### 5.1 Modular Frontend Architecture (`src/components/admin/ai-center/`)

```
src/components/admin/ai-center/
├── AiCommandCenter.tsx              -- Parent tab controller & header
├── tabs/
│   ├── AiTelemetryTab.tsx           -- Tab 1: Global token burn rate, USD/EGP spend, provider distribution
│   ├── AiProviderManagerTab.tsx     -- Tab 2: Dynamic provider & model discovery/routing manager
│   ├── AiUserQuotaInspectorTab.tsx  -- Tab 3: User search, billing cycle quota gauge, itemized request ledger
│   └── AiRuleSandboxTab.tsx         -- Tab 4: Live Egyptian dialect NLP sandbox & factor weight inspector
├── modals/
│   ├── AddProviderModal.tsx         -- New provider form + live connection test + auto-discovery
│   ├── ModelConfigModal.tsx         -- Model assignment (purpose, tier, pricing overrides $/1M)
│   └── TokenAnatomyModal.tsx        -- Deep request trace inspector (System vs RAG vs History vs User vs CoT)
└── shared/
    ├── TokenBreakdownBar.tsx        -- Stacked horizontal proportion bar
    ├── QuotaGauge.tsx               -- Circular/linear billing cycle consumption gauge
    └── CostBadge.tsx                -- Interactive USD/EGP currency toggler
```

---

### 5.2 UI Tab Specifications

#### Tab 1: Global AI Telemetry & Cost Dashboard (`AiTelemetryTab.tsx`)
- **Hero Metrics Row**:
  1. Total Tokens Consumed (Current Month) + Trend vs Last Month.
  2. Total Real Cost in EGP (with USD hover/toggle).
  3. Prompt Cache Hit Rate & Savings Percentage (`cachedTokens / promptTokens * 100`).
  4. Average Execution Latency (P50 & P95 ms).
- **Provider Distribution Breakdown**: Donut chart & stacked percentage bar showing share of traffic and cost per provider (e.g. OpenRouter 45%, Gemini 35%, Groq 20%).
- **Channel Breakdown Table**: Requests, Input Tokens, Output Tokens, Cached Tokens, Real Cost (EGP), and Avg Latency grouped by channel (`chat`, `classification`, `ocr`, `voice_stt`, `report`, `goal`).

#### Tab 2: Dynamic Provider & Model Hub (`AiProviderManagerTab.tsx`)
- **Active Providers Grid**: Status badge (Healthy 🟢, Degraded 🟡, Down 🔴), protocol type, base URL, model count, priority order, and action buttons (`Test Connection`, `Discover Models`, `Edit`, `Toggle Status`).
- **Add Provider Modal**: Fields for Provider Name, Protocol (`openai` | `gemini` | `anthropic`), Base URL, API Key, and Priority $\to$ "Test & Discover Models" trigger button.
- **Model Routing Table**: Lists all discovered models with inline editable Purpose dropdown, Allowed Tiers checkboxes, Input/Output/Cache pricing per 1M, and "Default Model" radio button per purpose $\times$ tier.

#### Tab 3: User Quota & Itemized Billing Inspector (`AiUserQuotaInspectorTab.tsx`)
- **Debounced Search**: Search by phone number, email, User ID, or name.
- **User Quota Summary Card**: Shows user avatar, name, plan badge (`FREE` | `PRO` | `ULTRA`), active billing cycle range (`Aug 15 → Sep 14`), animated circular consumption gauge (`340,000 / 500,000 Tokens (68%)`), and itemized spend by channel.
- **Paginated Request Ledger**: Real-time tabular stream of `ai_token_ledgers` entries showing Timestamp, Channel, Provider $\to$ Model, Input Tokens, Output Tokens, Cached Tokens, Cost (EGP), and an Inspect `[🔍]` trigger button.

#### Tab 4: Token Anatomy Inspector Modal (`TokenAnatomyModal.tsx`)
- **Top Bar**: Request Trace ID, execution timestamp, provider/model badge, HTTP status, and latency.
- **Visual Token Breakdown Bar (`TokenBreakdownBar.tsx`)**:
  `[██ System Prompt 38% ██][██ RAG Memory 24% ██][█ History 19% █][ User 1% ][💭 CoT 7%][💬 Output 11%]`
- **Detailed Itemized Metrics**:
  - Input: System Persona (700 tok), Financial RAG (450 tok), Conversation History (350 tok), User Input (25 tok), Tool Schemas (120 tok).
  - Execution: Prompt Cache Hit (800 tok @ 90% discount), Reasoning CoT (120 tok), Visible Output (205 tok).
  - Cost: Input Cost (\$0.00032) + Output Cost (\$0.00045) = Total USD (\$0.00077) $\to$ **0.037 EGP**.
- **Collapsible Payload Accordions**:
  1. System Prompt Preview (with full copy button).
  2. Injected RAG Context / Memory Facts.
  3. Raw User Message.
  4. Model Response / `<think>` Chain-of-Thought.
  5. Raw Provider `usage` JSON.

#### Tab 5: Rule Engine NLP Sandbox (`AiRuleSandboxTab.tsx`)
- **Interactive Egyptian Input**: Textarea for testing arbitrary Egyptian dialect strings.
- **Real-Time Probabilistic Breakdown**:
  - Displays $S_{\text{semantic}}$, $S_{\text{context}}$, $S_{\text{category}}$, and $\text{PolarityMultiplier}$.
  - Displays final calculated confidence score, decision outcome (`auto_save` | `review` | `clarify`), and detected ambiguity flags.
  - Interactive explanation of dialect reasoning (e.g. why "عزمني على غدا ومادفعتش" scored 12% and was rejected).

---

## 6. Complete Feature Inventory

### Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| F-01 | Dynamic Providers | `aiProviders` Table & Relations | Database schema for dynamic multi-provider registry | Migration script | Drizzle schema & tables | Rollback migration on SQL error | `engineering_specification.md` §B.1 |
| F-02 | Dynamic Providers | API Key Vault Encryption | AES-256-GCM encryption/decryption for provider keys at rest | Plaintext API key | Ciphertext payload `iv:tag:data` | Throw Error on tampering / bad key | `engineering_specification.md` §B.1 |
| F-03 | Dynamic Providers | Remote Model Discovery | Automatic retrieval of models via `GET /v1/models` | Base URL + Decrypted API Key | Discovered model list with context sizes | Return structured failure with HTTP status | `engineering_specification.md` §B.1, R1 |
| F-04 | Dynamic Providers | Purpose & Tier Visual Routing | Admin mapping of models to purposes (`chat`, `classification`, etc.) and tiers (`free`, `pro`, `ultra`) | Model ID, Purposes[], Tiers[], isDefault | Updated `ai_models` record | Validate unique default per purpose×tier | `engineering_specification.md` §B.1, R1 |
| F-05 | Dynamic Providers | Per-Model Pricing Overrides | Custom $/1M token rates for input, output, and cache | `inputPricePer1M`, `outputPricePer1M`, `cachedPricePer1M` | Stored pricing rates | Validate non-negative decimal | `engineering_specification.md` §B.1, R1 |
| F-06 | Dynamic Providers | Automatic Failover & Health Checks | Priority-based automatic fallback upon 429/500/503 errors | Failed request error status | Next available provider/model attempt | Throw fallback exhausted error if all fail | `engineering_specification.md` §B.2 |
| F-07 | Universal Gateway | `AiGateway.execute()` Engine | Central gateway function intercepting all LLM execution | `GatewayRequest` (userId, channel, purpose, messages) | `GatewayResponse` (text, usage, cost, latency) | Throw TRPC error with user-friendly Arabic text | `engineering_specification.md` §B.2, R2 |
| F-08 | Universal Gateway | 17 Route Interception | Full coverage of all 17 AI paths with zero unmetered leaks | Router payloads | Normalized Gateway executions | Log anomaly metric if unmetered call occurs | `engineering_specification.md` §A.1, R2 |
| F-09 | Universal Gateway | Prompt Anatomy Token Decomposition | Granular breakdown of input tokens into System, RAG, History, User, Tools | Raw message payload | `PromptAnatomy` token metrics | Estimate via heuristic if tokenizer unavailable | `engineering_specification.md` §B.1, R2 |
| F-10 | Universal Gateway | Real USD/EGP Cost Computation | Accurate monetary cost calculation using actual rates and exchange setting | Provider usage + Model pricing rates | `costUsd` and `costEgp` | Fallback to default exchange rate 48.50 | `engineering_specification.md` §B.1, R2 |
| F-11 | Universal Gateway | `ai_token_ledgers` Audit Log | Immutable ledger storing all request metrics and token anatomy | Gateway execution telemetry | Inserted `ai_token_ledgers` row | Asynchronous fire-and-forget (non-blocking) | `engineering_specification.md` §B.1, R2 |
| F-12 | Universal Gateway | Monthly Billing Quota Enforcement | Subscription cycle token quota check with LRU caching | `userId`, `userType`, `billingPeriod` | Quota check pass / TRPC Forbidden | Block execution if token limit exceeded | `engineering_specification.md` §B.3, R2 |
| F-13 | Rule Engine | 3-Factor Probabilistic Scoring | Confidence scoring formula balancing semantic, context, and category | Extracted terms & structural syntax | Calculated confidence score (0–100) | Fallback to AI if score < 60 | `ORIGINAL_REQUEST.md` R3 |
| F-14 | Rule Engine | Egyptian Negation & Polarity Filter | Multipliers detecting non-payment, invitations, cancellations | Egyptian text context | Adjusted confidence score | Lower score below auto-save threshold | `ORIGINAL_REQUEST.md` R3 |
| F-15 | Rule Engine | Polysemous Egyptian Disambiguation | Contextual disambiguation for "نور", "كريم", "مشروع", "شلت" | Surrounding word patterns | Disambiguated category & subcategory | Set review flag if context is ambiguous | `ORIGINAL_REQUEST.md` R3 |
| F-16 | Admin Frontend | Global AI Telemetry Dashboard | Tab 1 displaying total burn rate, real EGP cost, cache savings, latency | Date range / billing cycle | Aggregated charts & metrics | Show empty state if no logs exist | `engineering_specification.md` §C.2, R4 |
| F-17 | Admin Frontend | Dynamic Provider & Model Hub | Tab 2 managing custom providers, connection tests, and model routing | Provider & model form edits | Updated provider/model records | Toast error on invalid credentials | `engineering_specification.md` §C.3, R4 |
| F-18 | Admin Frontend | User Quota & Ledger Inspector | Tab 3 searching users, showing quota gauges, and browsing request stream | User query (phone/ID) | Itemized ledger history & gauge | Show "User not found" on invalid query | `engineering_specification.md` §C.4, R4 |
| F-19 | Admin Frontend | Token Anatomy Inspector Modal | Modal displaying granular token anatomy bar and raw payloads | `ledgerId` or `traceId` | Detailed token anatomy popup | Handle truncated or missing raw payloads | `engineering_specification.md` §C.5, R4 |
| F-20 | Admin Frontend | Rule Engine NLP Sandbox | Tab 5 providing live Egyptian dialect classification testing | Egyptian test string | Interactive factor weights & rationale | Display syntax warning on empty input | `ORIGINAL_REQUEST.md` R4 |

---

## 7. Edge Cases & Boundary Behaviors

| # | Feature | Input / Condition | Observed & Specified Behavior |
|---|---|---|---|
| E-01 | Key Decryption | Malformed or unencrypted legacy key in `apiKeyEncrypted` | System catches decipher failure, checks if plaintext key exists (backward compat), logs warning, and proceeds without crash. |
| E-02 | Model Discovery | Remote provider returns invalid JSON or HTTP 401/403 during discovery | Discovery procedure catches error, returns `{ success: false, error: "فشل التحقق من مفتاح الـ API أو العنوان" }`, leaves existing models intact. |
| E-03 | Failover | Primary provider returns HTTP 429 (Rate Limit) mid-request | Gateway catches 429, marks provider as "degraded", looks up next priority provider for same purpose×tier, and retries seamlessly. |
| E-04 | Failover Exhaustion | All configured providers for a purpose return errors or are inactive | Gateway throws `TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "جميع مزودي الخدمة غير متاحين حالياً. يرجى المحاولة لاحقاً." })`. |
| E-05 | Quota Enforcement | User token usage is at 499,999 / 500,000 and sends a 2,000 token request | Request executes successfully (soft landing), subsequent request is immediately blocked by hard quota check. |
| E-06 | Ledger Storage | MySQL connection pool drops during post-execution ledger INSERT | Gateway logs error to Pino/Sentry, does NOT fail user request (user gets response seamlessly), retries insert in memory queue. |
| E-07 | Negation Dialect | "صاحبي عزمني على غدا ومادفعتش جنيه" | $S_{\text{semantic}} = 90$, Context detects invitation + negation $\to \text{PolarityMultiplier} = 0.10 \to \text{Confidence} = 9\%$. Not saved as expense. |
| E-08 | Ambiguous Egyptian | "دفعت لنور 500 جنيه" vs "دفعت وصل النور 500 جنيه" | First matches transfer to person ("نور" $\to$ تحويل/أشخاص), second matches utility bill ("وصل النور" $\to$ فواتير/كهرباء). Both $\ge 90\%$ confidence. |
| E-09 | Token Anatomy | Model provider does not return `prompt_tokens_details.cached_tokens` | Gateway defaults `cachedTokens = 0`, computes cost using standard input token rate without crashing. |
| E-10 | Currency Conversion | `usd_to_egp_rate` missing or non-numeric in `system_settings` | Gateway falls back to default constant `48.50`, logs configuration warning to admin console. |

---

## 8. Complete tRPC API Contracts (`adminRouter` & AI Procedures)

### 8.1 Provider Management Procedures

```typescript
// 1. List all configured AI providers with model counts
getAiProviders: adminProcedure.query(async () => {
  // Returns: Array<{ id, slug, displayName, protocol, baseUrl, isActive, priority, healthStatus, lastHealthCheck, modelCount }>
});

// 2. Add new AI provider
createAiProvider: adminProcedure
  .input(z.object({
    slug: z.string().min(2).max(50),
    displayName: z.string().min(2).max(100),
    protocol: z.enum(["openai", "gemini", "anthropic"]),
    baseUrl: z.string().url(),
    apiKey: z.string().min(5),
    priority: z.number().int().min(1).max(100).default(10),
  }))
  .mutation(async ({ input }) => {
    // Encrypts apiKey with AES-256-GCM and inserts into ai_providers
    // Returns: { id, slug, displayName }
  });

// 3. Test connection and discover remote models
testAndDiscoverModels: adminProcedure
  .input(z.object({
    providerId: z.number().optional(),
    protocol: z.enum(["openai", "gemini", "anthropic"]),
    baseUrl: z.string().url(),
    apiKey: z.string(), // Plaintext (if new) or empty (if testing existing providerId)
  }))
  .mutation(async ({ input }) => {
    // Calls remote GET /models, returns:
    // { success: boolean, models: Array<{ modelId, displayName, maxContextWindow, supportsVision, supportsReasoning }> }
  });

// 4. Update AI provider details & status
updateAiProvider: adminProcedure
  .input(z.object({
    id: z.number(),
    displayName: z.string().optional(),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional(), // If provided, re-encrypts
    isActive: z.boolean().optional(),
    priority: z.number().optional(),
  }))
  .mutation(async ({ input }) => { ... });

// 5. Delete AI provider and associated models
deleteAiProvider: adminProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ input }) => { ... });
```

---

### 8.2 Model Management Procedures

```typescript
// 1. List configured models (optionally filtered by provider or purpose)
getAiModels: adminProcedure
  .input(z.object({
    providerId: z.number().optional(),
    purpose: z.string().optional(),
    tier: z.enum(["free", "pro", "ultra"]).optional(),
  }).optional())
  .query(async ({ input }) => {
    // Returns: Array<AiModel & { providerName: string, providerSlug: string }>
  });

// 2. Import discovered models into database
importDiscoveredModels: adminProcedure
  .input(z.object({
    providerId: z.number(),
    models: z.array(z.object({
      modelId: z.string(),
      displayName: z.string(),
      descriptionAr: z.string().optional(),
      purposes: z.array(z.string()),
      allowedTiers: z.array(z.enum(["free", "pro", "ultra"])),
      inputPricePer1M: z.number().min(0).default(0),
      outputPricePer1M: z.number().min(0).default(0),
      cachedPricePer1M: z.number().min(0).default(0),
      maxContextWindow: z.number().default(128000),
      supportsVision: z.boolean().default(false),
      supportsReasoning: z.boolean().default(false),
      isDefaultForPurpose: z.boolean().default(false),
    })),
  }))
  .mutation(async ({ input }) => { ... });

// 3. Update model configuration & routing
updateAiModelConfig: adminProcedure
  .input(z.object({
    id: z.number(),
    displayName: z.string().optional(),
    descriptionAr: z.string().optional(),
    purposes: z.array(z.string()).optional(),
    allowedTiers: z.array(z.enum(["free", "pro", "ultra"])).optional(),
    inputPricePer1M: z.number().optional(),
    outputPricePer1M: z.number().optional(),
    cachedPricePer1M: z.number().optional(),
    isDefaultForPurpose: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }))
  .mutation(async ({ input }) => { ... });
```

---

### 8.3 Token Ledger & Telemetry Procedures

```typescript
// 1. Get global AI telemetry metrics for admin dashboard
getAiGlobalTelemetry: adminProcedure
  .input(z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/).optional(), // "YYYY-MM"
  }).optional())
  .query(async ({ input }) => {
    // Returns: {
    //   totalTokens: number,
    //   totalCostUsd: number,
    //   totalCostEgp: number,
    //   cachedTokens: number,
    //   cacheSavingsPercentage: number,
    //   avgLatencyMs: number,
    //   p95LatencyMs: number,
    //   byProvider: Array<{ providerSlug, tokens, costEgp, percentage }>,
    //   byChannel: Array<{ channel, requests, promptTokens, completionTokens, cachedTokens, costEgp, avgLatencyMs }>,
    // }
  });

// 2. Query user billing cycle quota & itemized ledgers
getUserAiLedger: adminProcedure
  .input(z.object({
    query: z.string(), // phone, email, userId
    period: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
    cursor: z.number().optional(),
  }))
  .query(async ({ input }) => {
    // Returns: {
    //   user: { id, name, phone, email, plan, billingCycleStart, billingCycleEnd },
    //   quota: { usedTokens, limitTokens, percentage, totalCostEgp },
    //   channelBreakdown: Record<string, number>,
    //   ledgers: Array<AiTokenLedger>,
    //   nextCursor?: number,
    // }
  });

// 3. Get single ledger request anatomy details
getLedgerAnatomyDetails: adminProcedure
  .input(z.object({ traceId: z.string() }))
  .query(async ({ input }) => {
    // Returns full record with prompt anatomy breakdown, raw messages (if stored), and provider response
  });

// 4. Test rule engine in NLP sandbox
testRuleEngineSandbox: adminProcedure
  .input(z.object({ text: z.string().min(1) }))
  .mutation(async ({ input }) => {
    // Returns: {
    //   items: ParsedTransaction[],
    //   factors: { semanticScore, contextScore, categoryScore, polarityMultiplier },
    //   finalConfidence: number,
    //   decision: "auto_save" | "review" | "clarify",
    //   rationaleAr: string,
    // }
  });
```

---

## 9. Migration & Backward Compatibility Strategy

1. **Schema Migration**:
   - Create `ai_providers`, `ai_models`, and `ai_token_ledgers` via Drizzle migration.
   - Seed initial default providers (Gemini Native, Groq, Fireworks, NVIDIA NIM) with encrypted keys extracted from existing `.env` / `system_settings`.
   - Populate `ai_models` with the existing 20 models from `MODEL_CATALOG`.
2. **Denormalized Legacy Fields**:
   - `users.aiTokensUsed` and `localUsers.aiTokensUsed` remain in schema and are incremented asynchronously for backwards compatibility with existing legacy dashboards.
   - `classificationLogs.tokensUsed` continues to receive the total token count.
   - Historical `userAnalytics` events (`ai_*`, `ai_cost_*`) are preserved.
3. **Transition of Source of Truth**:
   - All quota validation and cost dashboards read exclusively from indexed queries on `ai_token_ledgers`.
   - Model resolution delegates entirely to `ai_models` and `ai_providers` via `getSystemSettings()` and in-memory caches.

---

## 10. Conclusion

This mined specification provides the complete, authoritative, mathematically rigorous blueprint for executing the SmartSpend AI re-architecture across all 4 pillars. All database tables, cryptographic protocols, token accounting formulas, Egyptian dialect NLP rules, and frontend component hierarchies are defined with production-grade precision.
