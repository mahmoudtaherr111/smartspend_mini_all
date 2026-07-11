# SmartSpend AI — 5-Layer Hybrid Classification & NLP Engine

> **AI AGENT SSOT:** This document defines the transaction classification pipeline, LLM model mapping, slang processing, and fact verification gotchas.

---

## 1. 🧠 Hybrid Classification Pipeline Waterfall (0ms to 600ms)

| Layer | Component | Latency | Token Cost | Action / Recovery |
| :--- | :--- | :--- | :--- | :--- |
| **Layer 1** | Zero-Token Cache (`muscle-memory.ts`) | `<1ms` | `$0.00` | Exact phrase match lookup in `userDictionaries`/`aiMemoryItems`. |
| **Layer 2** | Regex Rule Engine (`rule-engine.ts`) | `2ms` | `$0.00` | Keyword match against known Egyptian merchants (Talabat, Fawry, etc.). |
| **Layer 3** | Vector Semantic Search (`smart-pipeline.ts`) | `15ms` | `$0.00` | Cosine similarity comparison using `qwen3-embedding-8b` vectors. |
| **Layer 4** | Gemini/Fireworks LLM (`ai-router.ts`) | `600ms` | API Cost | Multi-intent decompose prompt (Gemini/DeepSeek v4). |
| **Layer 5** | Dispute Resolver (`action-runtime/`) | Continuous | `$0.00` | Learns from user UI edits, updating dictionaries for future Layer 1 hits. |

---

## 2. 🤖 Production LLM Model Configurations

| Provider | Shorthand | Target Model ID | Usage Scope |
| :--- | :--- | :--- | :--- |
| **Gemini (Native)** | `flash` | `gemini-3.1-flash-lite` | Default Free/Pro chat & classification. |
| | `pro` / `ultra` | `gemini-3.5-pro` | Default Ultra chat / monthly reports. |
| | — | `gemini-3.5-flash` | Secondary fallback option / STT. |
| | — | `gemini-1.5-flash` | Default Speech-to-Text (STT) model. |
| **Groq** | `free` | `deepseek-r1-distill-llama-70b` | Free tier fallback for Groq provider. |
| | `pro` / `ultra` | `llama-3.3-70b-versatile` | Pro/Ultra tier fallback for Groq provider. |
| | — | `whisper-large-v3` / `-turbo` | Audio STT transcription. |
| **Fireworks** | `free` | `accounts/fireworks/models/deepseek-v4-flash` | Free Fireworks chatbot model. |
| | `pro` / `ultra` | `accounts/fireworks/models/deepseek-v4-pro` | Pro/Ultra Fireworks chatbot model. |
| | — | `accounts/fireworks/models/qwen3-embedding-8b` | Cosine vector semantic matching. |

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Model Interception Rules (`api/lib/model-mapper.ts`)
* **Gotcha:** Do not pass raw legacy Gemini strings to the Google Generative AI SDK.
* **Rule:** `mapModelName()` intercepts and maps `"flash"`, `"1.5-flash"`, `"2.0-flash"` to `gemini-3.1-flash-lite` and `"pro"`, `"ultra"` to `gemini-3.5-pro`. Any `llama-` or `deepseek-` string routes to Groq/Fireworks.

### B. Math Hallucination Safeguard (`validateNumbersAgainstFacts`)
* **Gotcha:** LLM monthly reports often hallucinate wrong financial metrics.
* **Rule:** LLM outputs must be parsed by `validateNumbersAgainstFacts()`. If LLM generated numbers contradict facts compiled by `buildMonthlyReportFactsPack()`, they are blocked or fallback text is returned.

### C. Egyptian Slang Directionality (`egyptian-dictionary.ts`)
* **Gotcha:** General LLMs confuse Egyptian colloquial verbs (e.g. "قبضت" vs "صرفت") when classifying transaction direction (income vs expense).
* **Rule:** Terms in `STRONG_INCOME` and `STRONG_EXPENSE` dictionaries must be resolved locally first before submitting vector searches.

### D. Layer 1 Cache Precedence (`muscle-memory.ts`)
* **Gotcha:** Triggering LLM pipelines for recurring payments wastes API budgets.
* **Rule:** Always call `muscle-memory.ts` cache checks first before initializing Gemini or Fireworks API clients.
