# SmartSpend AI — AI Center & Chatbot Agent Architecture (مركز الذكاء الاصطناعي)

> **AI AGENT SSOT:** This document defines the intent routing, RAG semantic memory writer/retriever, tool schemas, and capabilities/constraints of the AI Chatbot Agent.

---

## 1. 🧠 High-Level Agent Execution Flow

```
[User Input Text] 
       │
       ▼
[Intent Routing & Intent Classifier] (finance_query / action_request / chat)
       │
       ├─────────────────────────────────┐
       ▼ (if finance_query)              ▼ (if advice/action)
[Local Semantic Layer]             [RAG Context Pipeline]
- Wipes LLM Token Cost to $0       - Loads User Profile Settings
- Direct MySQL Queries             - Reformulates query (`reformulateMemoryQuery`)
- Fast JSON response in <15ms      - Hybrid Lexical-Semantic retrieval from Memory
                                   - Pre-run Anonymizer (`redactSensitiveData`)
                                         │
                                         ▼
                               [Fireworks / Gemini LLM]
                               - Executes chat + function calling loop
                               - Runs groundings (`validateNumbersAgainstFacts`)
                                         │
                                         ▼
                               [Memory Writer Pipeline]
                               - Extracts memories (`extractSemanticMemories`)
                               - Generates 768-dim embeddings in background
```

---

## 2. 🔀 Chatbot Intent Routing Map (`api/services/ai-kernel/`)

| Intent Kind | Matching Heuristics | Target Execution Path | LLM Cost |
| :--- | :--- | :--- | :--- |
| `finance_query` | Simple spending queries (e.g. *"صرفت كام الشهر ده؟"*) | Local Query Engine (MySQL direct) | **0 LLM Tokens** |
| `action_request` | Intents to create budget/goals/transfers | suggestion drafts (`aiPendingActions`) | Yes (Structured output) |
| `advice_request` | Lifestyle and saving optimization requests | Chat completions + RAG Memory context | Yes (Generative text) |
| `general_chat` | Greetings and non-financial chit-chat | Simple OpenAI-compatible prompt | Yes (Low priority) |

---

## 3. 💾 Short-Term vs Long-Term Memory (RAG) Subsystem

### Short-Term Memory (Session Context)
* **Table:** `aiConversationSummaries` (`schema.ts`).
* **Mechanism:** Saves the last 8 turns of context, auto-collapsing old chats into running summaries (`buildRunningSummary`) to preserve the LLM token budget.

### Long-Term Memory (Persistent Preferences)
* **Tables:** `aiMemoryItems` (textual preferences) + `aiMemoryEmbeddings` (vector embeddings).
* **Embedding Model:** Fireworks `accounts/fireworks/models/qwen3-embedding-8b` (768 dimensions).
* **Storage Trigger:** If a user says commit keywords, `writeConversationMemory` is invoked.

---

## 4. 📝 Deterministic Memory Extraction Signals (`api/services/ai-memory/`)

The writer (`memory-writer.ts`) uses keyword triggers to parse memories before vector indexing:

| Memory Type | Signal Keywords (Egyptian Slang) | Reason/Category |
| :--- | :--- | :--- |
| **`preference`** | `بحب`, `بكره`, `افضل`, `مفضل`, `prefer`, `like`, `avoid` | User spending likes/dislikes |
| **`plan`** | `مش هلمس`, `ما تلمسش`, `حد اقصي`, `ميزانيه`, `budget`, `limit` | Commitment / constraints |
| **`fact`** | `ازاي اربط`, `اربط الفيزا`, `اربط الكارت`, `sms`, `bank`, `visa` | Application help/interest |
| **`agreement`** | `اتفقنا`, `موافق`, `تمام افتكر`, `خزن`, `save this`, `remember` | Commits suggestions from previous assistant turn |

---

## 5. 🔍 Hybrid Lexical-Semantic Retrieval Scoring

During retrieval (`memory-retriever.ts`), candidates are queried from `aiMemoryItems` and ranked using a custom scoring formula:

\[\text{Total Score} = \text{Cosine Similarity} + \text{Lexical Score} + \text{Specific Token Boost} + \text{Recency Boost} + \text{Importance Bonus}\]

| Variable | Implementation Details | Weight / Range |
| :--- | :--- | :--- |
| **Cosine Similarity** | Angular proximity between Fireworks embeddings. | `[0.0, 1.0]` |
| **Lexical Score** | Keyword token overlaps (`lexicalScore`). | `[0.0, 0.3]` |
| **Specific Token Boost** | Exact matching of key noun tokens (`specificTokenScore`). | `[0.0, 0.4]` |
| **Recency Boost** | Timestamps boost (`recencyBoost`). Ages days degrade. | `[0.0, 0.15]` |
| **Importance Bonus** | Extracted signal importance divided by 1000. | `[0.0, 0.1]` |

---

## 6. 🛠️ Chatbot Function Calling Tool Catalog (`api/services/ai-chat-tools.ts`)

| Tool Name | Key Parameters | Return Format | Core Purpose |
| :--- | :--- | :--- | :--- |
| `finance_query` | `kind` (breakdown, summary, etc.), `period` | structured JSON | Main financial data retriever. |
| `get_today_expenses` | None | JSON array | List of today's logs. |
| `get_month_summary` | `month` (optional, YYYY-MM) | JSON object | Net, average, income, expense totals. |
| `get_category_breakdown`| `month` (optional) | JSON object | Percentage spends by category. |
| `get_recent_transactions`| `count` (1 to 30) | JSON array | Historical logs list. |
| `get_spending_by_person`| `name` (required) | JSON object | Money transferred/spent on contact. |
| `get_wallet_balances` | None | JSON array | Lists Cash, Bank, and e-wallets. |
| `get_financial_goals` | None | JSON array | Active goals and progress percentages. |
| `get_app_guide` | None | JSON array | FAQ on linking bank cards, PWA etc. |

---

## 7. 🚨 Agent Capabilities vs Constraints

### What the Chat Agent CAN Do:
1. **Direct Data Retrieval:** Can read transactions, wallets, goals, and contacts via Drizzle schemas inside tools.
2. **Offline Local Processing:** Can resolve simple math stats locally without invoking external LLMs.
3. **Action Suggestion:** Drafts proposed actions (`aiPendingActions`) for user UI approval.

### What the Chat Agent CANNOT Do:
1. **Direct Database Write Mutations:** The chatbot cannot delete expenses or modify wallet balances directly. It can only generate proposed suggestion drafts (`aiPendingActions`) that the user must explicitly approve in the UI.
2. **Execute Raw CLI/System Scripts:** Tool executions are restricted to helper queries and guides.
3. **Exceed Cost Budgets:** Governed by `ai-usage-policy.ts` rate limits (100 requests per minute). If a user exceeds token thresholds, requests are clamped.
