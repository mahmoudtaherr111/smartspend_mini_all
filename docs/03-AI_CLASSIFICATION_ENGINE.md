# SmartSpend AI — 5-Layer Hybrid Classification & NLP Engine

> **AI AGENT SSOT:** This document defines the transaction classification pipeline, LLM model mapping, slang processing, and fact verification gotchas.

---

## 1. 🧠 Hybrid Classification Pipeline Waterfall (0ms to 600ms)

| Layer | Component | Latency | Token Cost | Action / Recovery |
| :--- | :--- | :--- | :--- | :--- |
| **Layer 1** | Muscle Memory Cache (`muscle-memory.ts`) | `<1ms` | `$0.00` | Exact phrase match lookup in `userDictionaries` and historical `classificationLogs` using selective column projection (id, originalText, normalizedText, finalResult, confidence, wasCorrected, decision, parsedBy, createdAt). |
| **Layer 2** | Regex Rule Engine (`rule-engine.ts`) | `2ms` | `$0.00` | Keyword match against known Egyptian merchants (Talabat, Fawry, Kazyon, etc.) and `STRONG_INCOME` / `STRONG_EXPENSE` terms. |
| **Layer 3** | Vector Semantic Search (`smart-pipeline.ts`) | `15ms` | `$0.00` | Cosine similarity comparison using `qwen3-embedding-8b` 768-dim descriptor vectors. |
| **Layer 4** | Gemini / Groq / Fireworks / NVIDIA LLM (`ai-router.ts`) | `400–600ms` | API Cost | Multi-intent narrative decomposition (`narrative-decomposer.ts`) returning structured JSON transactions. |
| **Layer 5** | Dispute Resolver & Feedback (`action-runtime/`) | Continuous | `$0.00` | Learns from user UI corrections, storing validated patterns for instant Layer 1 cache hits on subsequent entries. |

---

## 2. 🤖 Production LLM Model Configurations (`api/lib/model-mapper.ts`)

| Provider | Shorthand | Target Model ID | Usage Scope |
| :--- | :--- | :--- | :--- |
| **Gemini (Native)** | `flash` | `gemini-3.1-flash-lite` | Default Free/Pro chat, auto-classification, and receipt OCR. |
| | `pro` / `ultra` | `gemini-3.5-pro` | Default Ultra chat and monthly report generation. |
| | — | `gemini-3.5-flash` | Secondary fallback option / STT. |
| | — | `gemini-1.5-flash` | Speech-to-Text (STT) audio transcription fallback. |
| **Groq** | `free` | `deepseek-r1-distill-llama-70b` | Free tier fallback for Groq provider. |
| | `pro` / `ultra` | `llama-3.3-70b-versatile` | Pro/Ultra tier fallback for Groq provider. |
| | — | `whisper-large-v3` / `-turbo` | Ultra-fast audio STT voice transcription. |
| **Fireworks** | `free` | `accounts/fireworks/models/deepseek-v4-flash` | Free Fireworks chatbot model. |
| | `pro` / `ultra` | `accounts/fireworks/models/deepseek-v4-pro` | Pro/Ultra Fireworks chatbot model. |
| | — | `accounts/fireworks/models/qwen3-embedding-8b` | Cosine vector semantic matching (768-dim). |
| **NVIDIA AI** | `deepseek` | `deepseek-ai/deepseek-r1` | High-reasoning classification & financial planning. |
| | `llama` | `meta/llama-3.3-70b-instruct` | Secondary high-throughput instruction model. |

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Model Interception Rules (`api/lib/model-mapper.ts`)
* **Gotcha:** Do not pass raw legacy Gemini strings to the Google Generative AI SDK.
* **Rule:** `mapModelName()` intercepts and maps `"flash"`, `"1.5-flash"`, `"2.0-flash"` to `gemini-3.1-flash-lite` and `"pro"`, `"ultra"` to `gemini-3.5-pro`. Any `llama-` or `deepseek-` string routes to Groq/Fireworks/NVIDIA via `ai-provider-registry.ts`.

### B. Math Hallucination Safeguard (`validateNumbersAgainstFacts`)
* **Gotcha:** LLM monthly reports often hallucinate wrong financial metrics.
* **Rule:** LLM outputs must be parsed by `validateNumbersAgainstFacts()`. If LLM generated numbers contradict facts compiled by `buildMonthlyReportFactsPack()`, they are blocked or fallback text is returned.

### C. Egyptian Slang Directionality (`egyptian-dictionary.ts`)
* **Gotcha:** General LLMs confuse Egyptian colloquial verbs (e.g. "قبضت" vs "صرفت") when classifying transaction direction (income vs expense).
* **Rule:** Terms in `STRONG_INCOME` and `STRONG_EXPENSE` dictionaries must be resolved locally first before submitting vector searches.

### D. Layer 1 Selective Projection (`muscle-memory.ts`)
* **Gotcha:** Fetching entire rows from `classification_logs` loads large JSON blobs into memory.
* **Rule:** Always use selective column projection in `loadUserPatterns` to query only the 9 required fields (`id`, `originalText`, `normalizedText`, `finalResult`, `confidence`, `wasCorrected`, `decision`, `parsedBy`, `createdAt`).

### E. Taxonomy Single Source of Truth (`taxonomy-ssot.ts`)
* **Rule:** All category IDs, subcategory labels, and transaction types must align with `src/lib/financial-taxonomy.ts` and `api/lib/taxonomy-ssot.ts`. Never introduce ad-hoc category strings.

