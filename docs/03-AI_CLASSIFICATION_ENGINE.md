# SmartSpend AI — 5-Layer Hybrid Classification & NLP Engine

> **AI AGENT SSOT:** This document defines the transaction classification pipeline, LLM model mapping, deterministic SMS condensation, slang processing, and fact verification gotchas.

---

## 1. 🧠 Hybrid Classification Pipeline Waterfall (0ms to 600ms)

The classification pipeline uses a 5-layer waterfall architecture to maximize accuracy, minimize latency, and eliminate unnecessary external token costs:

```
[Raw User Input / Bank SMS / Audio STT]
               │
               ▼
   [Layer 1: Muscle Memory Selective Cache] (<1ms, $0.00)
   ├── In-process LRU cache (500 entries, 30 min TTL) + historical classificationLogs
   ├── Template normalization ({X}) & multi-factor similarity (Jaccard + Word Order + Levenshtein)
   └── Person resolution integration (auto-saves known contacts, clarifies unknown)
               │ (if no cache hit)
               ▼
   [Layer 2: Deterministic Rule Engine & Slang Map] (<2ms, $0.00)
   ├── Dual normalization: forRules (aggressive) & forAI (semantic-preserving)
   ├── Narrative decomposition (decomposeHeuristic) for compound multi-item sentences
   ├── Egyptian dialect dictionary (200+ mappings: كشري, قهوجي, اوبر, فودافون كاش, كارت فكة)
   ├── Zero-API Local RAG engine (3 JSON knowledge bases: fintech, merchants, slang)
   └── Business vs Personal scoring (freelance mode salary & project detection)
               │ (if rule confidence < 0.85)
               ▼
   [Layer 3: Vector Semantic Search] (Hybrid V4 Engine) (<15ms, $0.00)
   ├── Primary: 385 local category descriptors pre-indexed via character n-gram TF-IDF vectors
   └── Fallback: Fireworks Qwen3-8B 768-dim embeddings with Egyptian Arabic instruction prefix
               │ (if semantic ambiguity persists)
               ▼
   [Layer 4: Multi-Intent LLM Decomposition] (400–600ms, API Cost)
   ├── Dynamic taxonomy category pruning (scoreCategories filters candidate pool, saving ~60% tokens)
   ├── Adaptive reasoning schema: Chain-of-Thought (CoT) vs Direct JSON extraction
   ├── Strict JSON sanitization (robustJsonParse with thought tag stripping)
   └── Model routing via model-mapper.ts (Gemini / Groq / Fireworks / NVIDIA)
               │
               ▼
   [Layer 5: Post-Classifier Verifier & Action Runtime] (<5ms, $0.00)
   ├── verifyClassifiedItems: Amount bounds (max 10M EGP), duplicate checks, intent conflict checks
   ├── Content-based reverse recovery for unclassified 'متنوعات'
   ├── Amount reconciliation recovery for missing items
   └── Two-Phase Action Runtime (aiPendingActions table + idempotencyKey for UI confirmation)
```

---

## 2. 📱 Deterministic SMS Input Condensation (`api/lib/sms-rule-parser.ts`, `sms-ai-parser.ts`)

Bank and e-wallet SMS messages (CIB, NBE, QNB, Banque Misr, Vodafone Cash, InstaPay) contain 40–70% non-financial boilerplate (greetings, customer care hotlines like `19666`, marketing promotions, and legal disclaimers).

- **`condenseSmsNotification(text)`:** Deterministically strips boilerplate, contact numbers, and promotional suffixes while preserving the 7 essential financial entities:
  1. Action verb (خصم, إيداع, شراء, تحويل, debited, credited, paid)
  2. Amount & currency (e.g. `500.00 EGP`, `ج.م`)
  3. Merchant / Counterparty (e.g. `Carrefour`, `InstaPay-Ahmed`)
  4. Card / Account mask (e.g. `**1234`)
  5. Timestamp / Date
  6. Transaction reference / OTP indicators
  7. Remaining balance (e.g. `الرصيد المتاح`)
- **In-Memory Cache (`aiParseCache`):** Caches parsed SMS results in-memory with a 15-minute TTL to prevent duplicate AI invocations for identical notifications.

---

## 3. 🤖 Production LLM Model Configurations (`api/lib/model-mapper.ts`)

| Provider | Shorthand | Target Model ID | Usage Scope |
| :--- | :--- | :--- | :--- |
| **Gemini (Native)** | `flash` | `gemini-3.1-flash-lite` | Default Free/Pro chat, auto-classification, and receipt OCR. |
| | `pro` / `ultra` | `gemini-3.1-pro` | Default Ultra chat and monthly report generation. |
| | — | `gemini-3.5-flash` | Secondary fast fallback / STT audio transcription. |
| | — | `gemini-2.5-flash-native-audio-latest` | Real-time WebSocket live audio calls. |
| **Groq** | `free` | `deepseek-r1-distill-llama-70b` | High-reasoning classification & complex query analysis. |
| | `pro` / `ultra` | `llama-3.3-70b-versatile` | Pro/Ultra tier fallback for Groq provider. |
| | — | `llama-3.1-8b-instant` | Lowest-cost fast classification on Groq. |
| | — | `whisper-large-v3` / `-turbo` | Ultra-fast audio STT voice transcription. |
| **Fireworks** | `free` | `accounts/fireworks/models/deepseek-v4-flash` | Fast reasoning chatbot with 1M token context. |
| | `pro` / `ultra` | `accounts/fireworks/models/deepseek-v4-pro` | High-capacity reasoning for Pro/Ultra. |
| | — | `accounts/fireworks/models/qwen3-embedding-8b` | Cosine vector semantic matching (768-dim). |
| **NVIDIA AI** | `deepseek` | `deepseek-ai/deepseek-r1` | High-reasoning classification & financial planning. |
| | `llama` | `meta/llama-3.3-70b-instruct` | High-throughput instruction model. |

---

## 4. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Model Shorthand & Deprecation Interception (`api/lib/model-mapper.ts`)
* **Gotcha:** Passing deprecated model strings (such as `gemini-1.5-flash` or `gemini-2.0-flash`) or unreleased phantom models (such as `gemini-3.5-pro`) triggers SDK runtime errors.
* **Rule:** Always call `mapModelName(modelName)`:
  - `"flash"`, `"1.5-flash"`, `"2.0-flash"` $\rightarrow$ `gemini-3.1-flash-lite`
  - `"pro"`, `"ultra"`, `"3.5-pro"`, `"1.5-pro"` $\rightarrow$ `gemini-3.1-pro`
  - External models (`llama-`, `deepseek-`, `mixtral`) $\rightarrow$ routed via Groq/Fireworks/NVIDIA (`ai-provider-registry.ts`).

### B. Math Hallucination Safeguard (`validateNumbersAgainstFacts`)
* **Gotcha:** LLMs frequently hallucinate incorrect financial sums in narrative reports.
* **Rule:** All LLM generated monthly/yearly reports must pass through `validateNumbersAgainstFacts()`. If generated numbers contradict facts compiled by `buildMonthlyReportFactsPack()`, the response is rejected or reverted to deterministic financial summaries.

### C. Egyptian Slang Directionality (`egyptian-dictionary.ts`)
* **Gotcha:** Generic LLMs confuse colloquial Egyptian verbs (e.g. "قبضت الجمعية" vs "دفعت الجمعية") when classifying transaction direction (income vs expense).
* **Rule:** Terms in `STRONG_INCOME` and `STRONG_EXPENSE` dictionaries must be resolved locally in Layer 2 before invoking vector searches or LLMs.

### D. Layer 1 Selective Projection (`muscle-memory.ts`)
* **Gotcha:** Fetching entire rows from `classification_logs` loads large JSON payloads into Node.js heap.
* **Rule:** Always use selective 9-column projection in `loadUserPatterns` (`id`, `originalText`, `normalizedText`, `finalResult`, `confidence`, `wasCorrected`, `decision`, `parsedBy`, `createdAt`).

### E. Taxonomy Single Source of Truth (`taxonomy-ssot.ts`)
* **Rule:** All category IDs, subcategory labels, and transaction types must strictly align with `src/lib/financial-taxonomy.ts` and `api/lib/taxonomy-ssot.ts`. Never introduce ad-hoc category strings.
