# Deep Technical Codebase Survey Report
**Target Platform:** SmartSpend AI Backend, Database & AI Architecture  
**Author:** `survey_explorer_1` (Teamwork Explorer)  
**Date:** 2026-08-28  
**Working Directory:** `e:/smartspend_V1_fixed/.agents/survey_explorer_1/`

---

## 1. Executive Summary & Scope Definition

SmartSpend AI is an Arabic-first behavioral financial platform targeting the Egyptian market (EGP, local e-wallets, bank SMS, Egyptian-dialect NLP). The backend is built on **Hono v4 + tRPC v11 + Drizzle ORM + MySQL 8**, sharing type contracts with a **React 18 + Vite 7** frontend.

This technical survey analyzes the existing backend codebase, database schemas, AI providers, rule engine, and 17 AI execution paths to establish the foundation for implementing:
1. **Dynamic AI Provider & Automatic Model Discovery Engine** (`ai_providers`, `ai_models`, remote model discovery, live connection testing, pricing overrides).
2. **Universal AI Gateway & Prompt Anatomy Deconstruction** (100% route interception across all 17 AI paths, granular input/output/cached/reasoning token metering, real USD/EGP cost computation, immutable `ai_token_ledgers`, per-cycle billing quotas).
3. **Context & Polarity-Aware Rule Confidence Engine** (3-factor probabilistic scoring formula: $Confidence = ((S_{semantic} \times 0.50) + (S_{context} \times 0.30) + (S_{category} \times 0.20)) \times PolarityMultiplier$, dialect negation & disambiguation).
4. **Admin AI Command Center & Token Inspector Frontend** (modular extraction from 2,099-line `Admin.tsx` into `src/components/admin/ai-center/`).

---

## 2. Database & Persistence Layer Analysis

### 2.1 Database Connection & ORM Topology
- **Connection File:** `api/queries/connection.ts`
- **Pool Driver:** `mysql2/promise` with pool size 10 (dev) / 30 (prod), `utf8mb4` charset, `connectTimeout: 10000ms`, `enableKeepAlive: true`.
- **Drizzle Configuration:** `drizzle(mysqlPool, { schema: { ...schema, ...relations }, mode: "default" })`.
- **Exported Handles:** `db` and backward-compatible `getDb()`.

### 2.2 Dual User Architecture & Authentication
The system implements a strict dual-user model across all database tables and procedures:
- **`users` table (`db/schema.ts:17-45`):** OAuth users (Google OAuth). Identified by `id: int`, `unionId: varchar(255)`, `email: varchar(255)`, `role: 'user' | 'moderator' | 'admin'`, `plan: 'free' | 'pro' | 'ultra'`, `aiTokensUsed: int`.
- **`localUsers` table (`db/schema.ts:48-77`):** Local password/OTP/WebAuthn users. Identified by `id: int`, `phone: varchar(20) unique`, `password: varchar(255)`, `role`, `plan`, `aiTokensUsed: int`.
- **Unified Context:** `api/context.ts` resolves credentials into `UnifiedUser` (`{ id, name, role, plan, type: 'oauth' | 'local', phone, email }`). All procedures receive `ctx.user`.
- **Dual Relations (`db/relations.ts`):** Every user-owned table references polymorphic keys `(userId, userType)` and defines relations for both `users` and `localUsers`.

### 2.3 Existing AI & Financial Database Tables (48 Tables Total)
| Table Name | Schema Location | Purpose & Dual-User Handling |
| :--- | :--- | :--- |
| `classificationLogs` | `schema.ts:601` | Records parse results, rule vs AI output, confidence, tokensUsed, processingTimeMs. |
| `chatConversations` | `schema.ts:892` | Stores conversation metadata, message counts, `totalTokens` (single cumulative int). |
| `chatMessages` | `schema.ts:912` | Stores message content, role, toolCalls, toolResults, `tokensUsed: int`, model string. |
| `aiConversationSummaries` | `schema.ts:931` | AI capsule summaries for long-term memory compression. |
| `aiMemoryItems` | `schema.ts:954` | Semantic memory facts extracted from conversation/transactions, SHA-256 contentHash. |
| `aiMemoryEmbeddings` | `schema.ts:983` | Vector embeddings (provider: Fireworks, dimensions: 768/1536). |
| `aiActionMemory` | `schema.ts:1008` | Tool execution memory and structured summaries. |
| `aiPendingActions` | `schema.ts:1032` | 2-phase confirmation queue for high-risk AI actions with idempotency keys. |
| `aiActionAuditLogs` | `schema.ts:1063` | Immutable audit trail for AI tool actions. |
| `voiceUsage` | `schema.ts:637` | Tracks audio duration in seconds per user per month. |
| `rawSmsEvents` | `schema.ts:720` | Stores raw SMS text for financial parser. |
| `systemSettings` | `schema.ts:480` | Key-value config store (`key: varchar(100) PK`, `value: text`). Cached via `settings-cache.ts`. |
| `userAnalytics` | `schema.ts:301` | Telemetry event store (`eventType`, `eventData: json`). Used by `recordAiUsageEvent` and `recordAICostMetric`. |
| `apiKeyErrors` | `schema.ts:756` | Logs upstream API provider errors (status, error body, timestamp). |

### 2.4 Database Gaps & Required New Schemas
Currently, AI model definitions and API keys are hardcoded in source code or flat in `system_settings`. Three new database tables must be introduced in `db/schema.ts` and `db/relations.ts`:

1. **`ai_providers`:**
   - Columns: `id (PK)`, `slug (varchar(50) unique)`, `displayName (varchar(100))`, `protocol ('openai' | 'gemini' | 'anthropic')`, `baseUrl (varchar(500))`, `apiKeyEncrypted (text)`, `supportsModelDiscovery (boolean)`, `isActive (boolean)`, `priority (int)`, `healthStatus (varchar(20))`, `lastHealthCheck (datetime)`, timestamps.
2. **`ai_models`:**
   - Columns: `id (PK)`, `providerId (FK -> ai_providers.id)`, `modelId (varchar(200))`, `displayName (varchar(200))`, `descriptionAr (text)`, `purposes (json array: 'chat'|'classification'|'ocr'|'report'|'voice_stt'|'voice_call'|'embedding')`, `allowedTiers (json array: 'free'|'pro'|'ultra')`, `isDefaultForPurpose (boolean)`, `inputPricePer1M (decimal(10,6))`, `outputPricePer1M (decimal(10,6))`, `cachedPricePer1M (decimal(10,6))`, `maxContextWindow (int)`, `supportsVision (boolean)`, `supportsReasoning (boolean)`, `supportsFunctionCalling (boolean)`, `isActive (boolean)`, `sortOrder (int)`, timestamps.
   - Unique Index: `(providerId, modelId)`.
3. **`ai_token_ledgers`:**
   - Columns: `id (PK)`, `traceId (varchar(64) unique)`, `userId (int)`, `userType (varchar(20))`, `billingPeriod (char(7))`, `channel (varchar(30))`, `providerId (FK)`, `providerSlug (varchar(50))`, `modelId (varchar(200))`, `promptTokens (int)`, `completionTokens (int)`, `cachedTokens (int)`, `reasoningTokens (int)`, `totalTokens (int)`, `systemPromptTokens (int)`, `memoryRagTokens (int)`, `historyTokens (int)`, `userInputTokens (int)`, `toolSchemaTokens (int)`, `costUsd (decimal(12,8))`, `costEgp (decimal(12,6))`, `latencyMs (int)`, `httpStatus (int)`, `finishReason (varchar(30))`, `conversationId (int nullable)`, `classificationLogId (int nullable)`, `metadata (json)`, `createdAt (datetime)`.
   - Indexes: `(userId, userType, billingPeriod)`, `(channel, createdAt)`, `(providerSlug, modelId, createdAt)`.

---

## 3. AI Provider & Routing Infrastructure Survey

### 3.1 Static Registry vs Dynamic Target
- **`api/lib/ai-provider-registry.ts` (445 lines):** Contains static `MODEL_CATALOG` array (20 models), static default resolvers (`defaultGeminiModel`, `defaultGroqModel`, `defaultFireworksModel`, `defaultNvidiaModel`), and hardcoded `DEPRECATED_MODEL_MAP`.
- **`api/lib/model-mapper.ts` (140 lines):** Contains hardcoded prefix detectors `isGroqModel()`, `isGeminiModel()`, `isFireworksModel()`, `isNvidiaModel()` and fallback functions.
- **`api/lib/ai-usage-policy.ts` (300+ lines):** Implements static tier token caps (`free: 50,000`, `pro: 500,000`, `ultra: 2,000,000`), legacy in-memory rate limiting, and writes to `userAnalytics`.
- **`api/services/ai-cost-policy.ts` (22KB):** Uses synthetic "cost units" formula (`totalTokens + (outputTokens * 2) + (embeddingCalls * 25) + (llmCalls * 100)`) divided by 1000 to approximate EGP.

### 3.2 Individual AI Client Implementations
1. **`deepseek-client.ts` (`callChatCompletionAPI`):** OpenAI-compatible chat completions. Sends `messages`, `tools`, `tool_choice`. Captures `total_tokens`, `prompt_tokens`, `completion_tokens`. Does not capture `cached_tokens` or `reasoning_tokens`.
2. **`fireworks-client.ts` (`callFireworksAPI`):** Fixed endpoint `https://api.fireworks.ai/inference/v1/chat/completions`. Reads `cached_tokens` from `prompt_tokens_details.cached_tokens`.
3. **`nvidia-client.ts` (`callNvidiaAPI`):** Fixed endpoint `https://integrate.api.nvidia.com/v1/chat/completions`. Retries without `json_object` if HTTP 400/422. Reads `cached_tokens`.
4. **`groq-client.ts` (`callGroqAPI`):** Uses `@groq/groq-sdk`. Captures only `total_tokens`.
5. **`fireworks-embedding-client.ts` (`getFireworksEmbedding`):** Fixed model `qwen3-embedding-8b` (768 dims) with LRU caches and circuit breaker.

### 3.3 Target AI Gateway (`api/lib/ai-gateway.ts`) Architecture
The new Universal AI Gateway will unify all AI calls under a single contract:
- **Pre-execution:** Model resolution via DB `ai_models` matching `(purpose, tier)`, provider resolution via `ai_providers`, quota verification on `ai_token_ledgers` (with 5-min LRU caching), and prompt anatomy token estimation.
- **Execution:** Protocol dispatch (`openai` via fetch, `gemini` via SDK, `anthropic` via fetch) with automatic failover to healthy lower-priority providers on 429/500/503.
- **Post-execution:** Normalized usage extraction (`promptTokens`, `completionTokens`, `cachedTokens`, `reasoningTokens`, `totalTokens`), exact USD/EGP cost calculation using model rates & system exchange rate, asynchronous insertion into `ai_token_ledgers`, and legacy dual-user counter update.

---

## 4. Rule Engine & Classification Pipeline Survey

### 4.1 Existing 5-Layer Hybrid Pipeline
The current classification pipeline in `api/lib/smart-pipeline.ts` (1,748 lines) and `api/lib/rule-engine.ts` (82KB) executes in stages:
1. **Normalization (`api/lib/text-normalizer.ts`, `normalizer-v2.ts`):** Cleans dialect slang, normalizes Arabic characters, handles eastern/western numerals, strips noise.
2. **Dictionary & Exact Regex Rules (`api/lib/rule-engine.ts`):** User personal dictionary lookup (`userDictionaries`), merchant mapping, regex category priors.
3. **Semantic Category Scorer (`api/lib/category-scorer.ts`):** 6-signal scoring (Keyword Priors: 40pts, Local RAG TF-IDF: 35pts, User History Prior: 20pts, Co-occurrence: 15pts, Intent Injection: 25pts, Person Detection: 20pts).
4. **Vector Embeddings (`api/lib/embedding-engine.ts`, `fireworks-embedding-client.ts`):** Qwen3 768-dimension cosine similarity against category centroid vectors.
5. **LLM Classification Layer (`api/lib/smart-pipeline.ts:1264`):** Passes candidate categories to Groq, Fireworks, NVIDIA, or Gemini.

### 4.2 Confidence Scorer (`api/lib/confidence-scorer.ts`)
- Current scoring uses heuristic adjustments (penalties for "متنوعات" and "عام", boosts for user dictionary and amounts).
- `DEFAULT_THRESHOLDS`: `autoSave >= 85`, `review: 60-84`, `clarify < 60`.

### 4.3 Target: 3-Factor Probabilistic Scoring & Polarity Multiplier
The system must be upgraded to enforce the rigorous 3-factor probabilistic scoring formula:
$$\text{Confidence} = ((\mathbf{S}_{\text{semantic}} \times 0.50) + (\mathbf{S}_{\text{context}} \times 0.30) + (\mathbf{S}_{\text{category}} \times 0.20)) \times \text{PolarityMultiplier}$$

Where:
- $\mathbf{S}_{\text{semantic}} \in [0, 100]$: Match strength from dictionary, regex keyword priors, and embedding cosine similarity.
- $\mathbf{S}_{\text{context}} \in [0, 100]$: Profile consistency, time-of-day/day-of-week patterns, merchant frequency, and amount plausibility.
- $\mathbf{S}_{\text{category}} \in [0, 100]$: Co-occurrence score and user historical category probability.
- $\mathbf{PolarityMultiplier} \in [0.0, 1.0]$:
  - $1.0$ = Unambiguous positive assertion ("دفعت 200 جنيه كافيه").
  - $0.2$ = Explicit negation / cancellation ("ما دفعتش", "ملغية", "مرتجع", "مخدتش فلوس").
  - $0.5$ = Ambiguous conditional / questioning ("لو دفعت", "ممكن احول", "تقريباً").

---

## 5. Comprehensive Audit of All 17 AI Execution Paths

| # | File & Line | Target Model / Provider | Purpose / Channel | Current Token Tracking State | Gateway Interception Strategy |
|---|---|---|---|---|---|
| **1** | `api/ai-router.ts:205` | Groq Whisper | Speech-to-Text (`voice_stt`) | ⚠️ Returns `tokensUsed: 0` | Intercept via Gateway audio transcription adapter; log ledger entry. |
| **2** | `api/ai-router.ts:231` | Gemini STT | Speech-to-Text (`voice_stt`) | ✅ `usageMetadata.totalTokenCount` | Route through Gateway; record prompt/completion/audio tokens. |
| **3** | `api/ai-router.ts:728` | Smart Pipeline (Multi-LLM) | `parseExpense` (`classification`) | ✅ Cumulative via `trackTokens` | Replace inline LLM dispatch with `aiGateway.execute()`. |
| **4** | `api/ai-router.ts:1544` | Smart Pipeline + STT | `parseVoiceExpense` (`voice_stt` + `classification`) | ✅ Tracked (2 separate calls) | Route both STT and classification stages through Gateway. |
| **5** | `api/ai-router.ts:2692` | Gemini / Fireworks / NVIDIA | `generateReport` (`report`) | ✅ Tracked via `trackTokens` | Route prompt generation through Gateway with prompt anatomy tracking. |
| **6** | `api/ai-router.ts:3129` | Deterministic Engine | Period Comparison (`report`) | ❌ No LLM (Deterministic) | Keep zero LLM call telemetry, record deterministic audit ledger. |
| **7** | `api/chat-router.ts:800` | AI Kernel (DeepSeek / Fireworks) | AI Center Chatbot (`chat`) | ✅ Direct DB update on `chatMessages` | Intercept inside `ai-kernel/index.ts` via Gateway with RAG/history anatomy. |
| **8** | **`api/business-router.ts:139`** | Gemini | Category Suggestions (`business`) | **❌ ZERO TRACKING / NO TELEMETRY** | **CRITICAL FIX**: Wrap in `aiGateway.execute({ channel: 'business' })`. |
| **9** | `api/goals-router.ts:244` | Gemini | Goal Advisory (`goal`) | ⚠️ `trackGoalTokens` only; missing `recordAICostMetric` | Route through Gateway; record real EGP cost and ledger entry. |
| **10** | `api/image-router.ts` & `receipt-image-parser.ts:110` | Gemini Vision | Receipt OCR (`ocr`) | ⚠️ `trackImageTokens` only; missing `recordAICostMetric` | Route through Gateway with vision payload token calculation. |
| **11** | **`api/lib/sms-ai-parser.ts:141`** | Gemini | SMS Transaction Extraction (`sms`) | **❌ ZERO TRACKING / NO TELEMETRY** | **CRITICAL FIX**: Route SMS parsing through Gateway. |
| **12** | **`api/lib/narrative-decomposer.ts:903`** | Gemini | Multi-transaction Decomposer (`narrative_decomp`) | **❌ ZERO TRACKING / NO TELEMETRY** | **CRITICAL FIX**: Route narrative decomposition through Gateway. |
| **13** | **`api/services/voice-call-service.ts:422`** | Gemini Live WebSocket | Real-time Voice Call (`voice_call`) | **❌ ZERO TRACKING / NO TELEMETRY** | **CRITICAL FIX**: Intercept session start/end; meter audio stream & tools in ledger. |
| **14** | `api/jobs/monthly-report-job.ts:260` | Fireworks | Batch Cron Reports (`report`) | ⚠️ `recordAICostMetric` called, but unbilled | Route through Gateway; assign system/batch billing ledger. |
| **15** | **`api/lib/fireworks-embedding-client.ts:90`** | Fireworks Qwen3 | Vector Classification Embedding (`embedding`) | **❌ ZERO TRACKING / NO TELEMETRY** | Route through Gateway embedding method; record token ledger. |
| **16** | **`api/services/ai-memory/embedding-client.ts:111`** | Fireworks Qwen3 | Long-term Memory Embedding (`embedding`) | **❌ ZERO TRACKING / NO TELEMETRY** | Route through Gateway embedding method; record token ledger. |
| **17** | `api/lib/smart-pipeline.ts:1264-1332` | Groq / Fireworks / NVIDIA / Gemini | Pipeline Fallback LLM (`classification`) | ✅ Accumulated `totalTokens` | Intercept LLM execution block via Gateway. |

---

## 6. AI Memory, Kernel & Action Runtime Analysis

### 6.1 AI Kernel (`api/services/ai-kernel/`)
- **`index.ts` (1,549 lines):** Orchestrates intent detection, fact compilation, RAG context packing, LLM call, numeric guard, response quality guard, and action planning.
- **`agent-planner.ts` & `capability-registry.ts`:** Maps user queries into structured tools (e.g. `log_expense`, `search_expenses`, `adjust_budget`, `create_goal`).
- **`context-packer.ts` & `data-need-compiler.ts`:** Assembles system prompt, profile context, financial facts, and conversation history into budget-capped token payloads.
- **Integration with Gateway:** The LLM call at `ai-kernel/index.ts:1218` must be swapped from `callChatCompletionAPI` to `aiGateway.execute()`, automatically capturing prompt anatomy (System, RAG Memory, History, User Input, Tools).

### 6.2 AI Memory (`api/services/ai-memory/`)
- **`memory-writer.ts` & `memory-retriever.ts`:** Ingests facts from chat messages, detects duplicates via SHA-256 `contentHash`, generates 768-dim embeddings, stores in MySQL `aiMemoryItems` / `aiMemoryEmbeddings` and optional Qdrant.
- **`embedding-client.ts`:** Communicates with Fireworks embedding API.

### 6.3 Action Runtime (`api/services/action-runtime/`)
- **`index.ts`, `types.ts`, `extended-actions.ts`:** Executes validated financial actions, supports two-phase commit for high-risk modifications (deleting expenses, updating budget), logs to `aiActionAuditLogs`.

---

## 7. Frontend Admin & Telemetry Survey

### 7.1 Monolithic `Admin.tsx` Structure
- `src/pages/Admin.tsx` is currently **2,099 lines long** with 13 tab views.
- The AI functionality is embedded inline:
  - Tab "ai" (lines 877–914): Inline `ClassificationDashboard` (lines 1672–1919) and `AICostDashboard` (lines 1920–2098).
  - Tab "settings" -> subtabs "keys" & "plans": `AdminKeysTab.tsx` (hardcoded 7 key slots) and `AdminPlansTab.tsx`.

### 7.2 Target Component Architecture (`src/components/admin/ai-center/`)
To achieve clean separation of concerns and support the full Command Center specification, the AI tab will be extracted into:
```
src/components/admin/ai-center/
├── AiCommandCenter.tsx              -- Root AI Center container with 4 sub-tabs
├── tabs/
│   ├── AiTelemetryTab.tsx           -- Tab 1: Hero metrics, real EGP cost, cache efficiency, channel breakdown
│   ├── AiProviderManagerTab.tsx     -- Tab 2: Dynamic provider CRUD, GET /v1/models discovery, model matrix
│   ├── AiUserQuotaInspectorTab.tsx  -- Tab 3: User search, billing cycle quota gauge, request audit log
│   └── AiRuleSandboxTab.tsx         -- Tab 4: Live 3-factor rule confidence tester & dialect sandbox
├── modals/
│   ├── AddProviderModal.tsx         -- Provider creation & connection testing
│   ├── ModelConfigModal.tsx         -- Model assignment to purpose, tier, pricing overrides
│   └── TokenAnatomyModal.tsx        -- Deep token inspector breakdown popup
└── shared/
    ├── TokenBreakdownBar.tsx        -- Proportional stacked bar (System, RAG, Hist, User, Tools, CoT, Out)
    ├── QuotaGauge.tsx               -- Billing cycle circular/linear progress gauge
    └── CostBadge.tsx                -- Real USD / EGP cost indicator
```

---

## 8. Contracts, Environment & Test Suites Survey

### 8.1 Shared Contracts (`contracts/`)
- **`contracts/plans.ts`:** Canonical commercial tiers (`pro_monthly: 99 EGP`, `pro_yearly: 990 EGP`, `ultra_monthly: 250 EGP`).
- **`contracts/constants.ts`:** Input validation limits (`ExpenseInputLimits`, `Paths`, `ErrorMessages`).
- **`contracts/errors.ts` & `contracts/types.ts`:** Shared error codes and Drizzle re-exports.

### 8.2 Environment Configuration (`api/lib/env.ts`)
- **Zod Schema:** Validated on boot.
- **Mandatory Variables:** `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `GEMINI_API_KEY`.
- **Optional Provider Keys:** `GROQ_API_KEY`, `FIREWORKS_API_KEY`, `NVIDIA_API_KEY`, `PAYMOB_*`, `REDIS_URL`, `FIREBASE_*`.
- **Target Evolution:** Provider API keys will be stored encrypted in `ai_providers.apiKeyEncrypted` in the database, with `.env` acting strictly as a seed/fallback.

### 8.3 Test Suite Baseline
- **Vitest Suites:** 87 test files colocated across `api/` and `src/`.
- **Key Test Suites to Preserve & Validate:**
  - `api/lib/classification-golden.test.ts` (golden dataset validation)
  - `api/lib/comprehensive-classification.test.ts` (comprehensive dialect tests)
  - `api/lib/category-scorer.test.ts` (category scoring signals)
  - `api/lib/model-mapper.test.ts` (model mapping invariants)
  - `api/services/ai-kernel/agent-contract.test.ts` (agent planner & kernel contracts)
  - `api/services/ai-cost-policy.test.ts` (token & cost policies)
  - `api/middleware.test.ts` (RBAC procedure factories)

---

## 9. Architectural Dependency Graph & Call Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT INGRESS                                │
│       Web App (React 18) / Mobile Shell (Capacitor) / WhatsApp         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        tRPC ROUTER LAYER                               │
│  aiRouter | chatRouter | businessRouter | goalsRouter | imageRouter    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    UNIVERSAL AI GATEWAY (NEW)                          │
│                      api/lib/ai-gateway.ts                             │
│                                                                        │
│  1. Check Quota & Rate Limit (ai_token_ledgers + 5-min LRU Cache)      │
│  2. Resolve Active Model & Provider (ai_models + ai_providers)         │
│  3. Calculate Prompt Anatomy (System, RAG, History, User, Tools)       │
│  4. Execute Protocol (OpenAI / Gemini SDK / Anthropic) with Failover   │
│  5. Calculate Real Cost (USD / EGP via Model Rates & Exchange Rate)    │
│  6. Insert Immutable Audit Entry (ai_token_ledgers)                    │
└───────┬───────────────────────────┬───────────────────────────┬────────┘
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│ Google Gemini │           │ OpenAI Proto  │           │ Anthropic SDK │
│ (Native SDK)  │           │ (OpenRouter,  │           │ (Messages API)│
│               │           │ DeepSeek,     │           │               │
│               │           │ Groq, NVIDIA) │           │               │
└───────────────┘           └───────────────┘           └───────────────┘
```

---

## 10. Potential Risks, Pitfalls & Invariant Safeguards

1. **Dual User Polymorphism Trap:**
   - *Risk:* Queries joining `users` table directly will miss local phone/password users (`localUsers`).
   - *Safeguard:* Always resolve `(userId, userType)` and query against `ai_token_ledgers` indexed by `(userId, userType, billingPeriod)`.
2. **Unmetered AI Backdoors (The 9 Leak Paths):**
   - *Risk:* Direct calls to `genAI.getGenerativeModel()` or `fetch()` in `business-router`, `sms-ai-parser`, `narrative-decomposer`, `voice-call-service`, or `embedding-client` will bypass token ledgers.
   - *Safeguard:* Intercept 100% of these calls through `aiGateway.execute()` or `aiGateway.embed()`.
3. **Database Migration & Encryption Invariants:**
   - *Risk:* Storing raw API keys in plaintext in `ai_providers` is a severe security vulnerability.
   - *Safeguard:* Implement AES-256-GCM encryption for `apiKeyEncrypted` using `JWT_SECRET` as key material.
4. **Fast-Path Quota Overhead:**
   - *Risk:* Running `SELECT SUM(totalTokens)` on `ai_token_ledgers` on every single LLM call could overload MySQL.
   - *Safeguard:* Maintain an in-memory LRU counter with a 5-minute TTL, incremented atomically upon gateway execution.
5. **Prompt Anatomy Accuracy:**
   - *Risk:* Gemini SDK only reports aggregate `promptTokenCount`, not sub-breakdown.
   - *Safeguard:* Pre-calculate token counts per segment (System, RAG facts, History, User input, Tool definitions) before dispatch using standard character-to-token heuristics (~3.5 chars/token for Arabic).

---
*Report successfully compiled for SmartSpend AI re-architecture.*
