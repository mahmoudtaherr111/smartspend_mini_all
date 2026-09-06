# SmartSpend AI — 5-Layer Hybrid Classification & NLP Engine

> **AI AGENT SSOT:** This document defines the transaction classification pipeline, LLM model mapping, source evidence and capture review, slang processing, and fact verification gotchas.

---

**Journey branch update — 2026-09-06:** the diagram below describes the text/voice pipeline. `smsApp /ingest` and `image.parseReceipt` now create durable review drafts through `financial-capture-state` / `financial-capture-store`; they do not auto-save through this waterfall. See [the actual capture contracts](06-SMS_AND_APPLE_PAY.md) and [the integration plan and open release gates](reviews/classification-journey-design-2026-09-06.md).

## 1. 🧠 Classification pipeline — the order the code actually runs

Verified against `runSmartPipeline` in `api/lib/smart-pipeline.ts`, not from memory.
The entry point answers **"what happened financially"** before it answers
**"what category is it"**, and the first question can end the request on its own.

```
[Raw user text / audio STT]
               │
               ▼
   planFinancialEvents(text, knownNames)        api/lib/financial-event-plan.ts
   ├── Splits the utterance into events and gives each one a segmentIndex
   ├── Binds amounts to the event that mentioned them
   └── Labels every event: admitted · rejected · incomplete
               │
               ├── admitted.length === 0 ──▶ return decision "clarify"
               │                             route = "financial_event_gate"
               │                             No classification. No provider call.
               ▼
   classifyAdmittedEvents(input, plan)          api/lib/smart-pipeline.ts
   │   Runs over the ADMITTED text only. A rejected clause is not re-joined here,
   │   so it cannot re-enter recovery or the category prompt.
   │
   ├── Result cache            in-process LRU, keyed per user/plan/scope
   ├── Muscle memory           api/lib/muscle-memory.ts — recurring user patterns
   ├── Business scoring        business vs personal, gated on businessMode
   ├── Normalization           normalizer-v2 · forRules (aggressive) / forAI (semantic)
   ├── Rule engine             api/lib/rule-engine.ts + egyptian-dictionary.ts
   ├── Correction rules        what this user already corrected outranks a fresh guess
   ├── Calibration             api/lib/confidence-calibrator.ts — evidence → probability
   ├── Per-item acceptance     api/lib/final-acceptance.ts — the weakest item decides
   ├── Embedding layer         api/lib/embedding-engine.ts — local descriptors, then Fireworks
   ├── LLM category fallback   only for clauses the local pass could not categorise
   │     ├── classification-prompt.ts   numbered clauses, static prefix
   │     ├── llm-provider-chain.ts      ordered routes
   │     ├── llm-router.ts              one call site, circuit breaker, failover
   │     ├── classifier-contract.ts     validates the reply; the model is asked for a
   │     │                              CATEGORY only — no amount, no person, no confidence
   │     └── classification-merge.ts    merges the category onto the local item
   └── Verifier                api/lib/post-classifier-verifier.ts
               │
               ▼
   Result gates, back in runSmartPipeline
   ├── Per-event amount reconciliation — each event balances on its own amounts,
   │     so a missing event cannot be hidden by another event's matching total
   ├── Stated-total check — a spoken total that disagrees with the sum asks, and is
   │     never itself recorded as a transaction
   ├── Pending / unbound events force "clarify"
   └── Any surviving reviewReason downgrades "auto_save" to "review"
               │
               ▼
   auto_save · review · clarify
```

### What the log records, and what it means

| Field | Meaning |
| :--- | :--- |
| `routing.route` | `financial_event_gate` when the plan admitted nothing; otherwise `smart_hybrid`. |
| `routing.events` | Every event from the plan with its status, including the rejected ones. Rejection is a **result**, kept for diagnosis — not an erased clause. |
| `routing.eventLedgerBalanced` | Every admitted event's amounts were accounted for, no unbound item, no total mismatch. |
| `routing.statedTotals` | Totals the user spoke aloud. Checked against the sum; never recorded. |

### `sourceEventId` is request-scoped

It is the plan's `segmentIndex` — an identity **within one request**, used to keep an
amount attached to the event that produced it through merge, reordering and salvage.

It is **not** an idempotency key, **not** a database id, and **not** stable across
retries. Reusing it as any of those would tie two independent requests together.

### `parser_fast_decomposition_enabled` no longer disables the safety gate

The event gate runs unconditionally. An install that still has this setting stored as
`false` gets the gate anyway, because it is what stops a negated or unpriced clause from
being recorded — that is a correctness property, not a feature flag.

The log keeps both facts apart rather than pretending the setting is gone:

- `settings.decompositionEnabled: true` — what the pipeline actually did.
- `settings.legacyDecompositionEnabled` — the stored value, still reported.

The setting's description in the admin UI and in `docs/` still reads as though it can
turn decomposition off. **That text is now wrong and is not corrected here** — changing
the setting's meaning is a product decision, outside this round.

### Running the corpus and the quality gates

```bash
npm run test:classification:core      # every classification guard, including the quality gates
npm run report:classification:core    # same corpus, writes a comparable summary
```

The file list is not written by hand. It comes from
`api/qa/classification-test-manifest.ts`, and `classification-test-manifest.test.ts`
fails when a test file imports the classification surface and is in neither `INCLUDED`
nor `EXCLUDED` — so a new guard forces a decision instead of quietly falling outside the
command. The first version of this list was hand-copied and missed seventeen files that
exercised the same modules, including model mapping, corrections, muscle memory,
taxonomy, the LLM router and the voice intake gate. **No count is quoted here on
purpose:** a number in a document is stale the moment a guard is added, and the manifest
is the answer.

Both commands are offline. The quality run makes `executeLlmChain` throw and mocks the
database, and the manifest test asserts that no listed file imports a live connection,
reads a real provider key, or is an opt-in integration suite. **Token and latency figures
from these runs are therefore zero or local-only, and are not production numbers** — the
report repeats that in its own `warnings`.

`npm run test` does **not** include any of this; it runs a fixed list that predates the
classification work. The CI job `classification-core` is what enforces it.

### What the report does and does not tell you

`npm run report:classification:core` writes to an untracked, per-attempt path and carries
the commit, the tree, whether the tree was dirty, and the CI run and attempt. Two runs are
subtracted only when their `evaluationFingerprint` matches — same fixtures, count, mode,
scorer and experiment settings. A classifier change is deliberately **not** part of that
fingerprint, because measuring one is the reason to compare at all.

Two auto-save safety figures are reported, never one:

| Field | Counts |
| :--- | :--- |
| `tripleUnsafeAutoSaveCases` | auto-saved cases with a wrong amount, direction, category or item count |
| `autoSaveCasesWithAnyScoredError` | the same, plus subcategory errors — a strict superset |

They differ, and quoting either without its denominator is how two reports on this system
came to disagree by roughly a factor of two. Neither figure says anything about currency,
about the transaction date, or about whether the row was written correctly to the database.

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
