# SmartSpend AI — AI Center & Chatbot Agent Architecture (مركز الذكاء الاصطناعي)

> **AI AGENT SSOT:** This document defines intent routing, SQL aggregation fast paths, RAG semantic memory, tool catalogs, and execution constraints of the AI Chatbot Agent.

---

## 1. 🧠 High-Level Agent Execution Flow

```
[User Input Text in Egyptian Arabic] 
               │
               ▼
[Intent Routing & Heuristic Classifier] (finance_query / action_request / advice_request / chat)
               │
               ├─────────────────────────────────────────┐
               ▼ (if deterministic finance query)        ▼ (if advice/action/chat)
[Finance Semantic Layer (resolvers.ts)]       [RAG Context Pipeline]
- SQL Aggregation Fast Path                   - Loads User Profile & Active Wallets
- Direct MySQL SUM/COUNT/GROUP BY             - Reformulates query (reformulateMemoryQuery)
- Wipes LLM Token Cost to $0.00               - Hybrid Lexical-Semantic Memory Retrieval
- Instant JSON response in <15ms              - Pre-run Anonymizer (redactSensitiveData)
                                                         │
                                                         ▼
                                              [LLM Agent Kernel (Gemini/Groq/Fireworks)]
                                              - Executes grounded chat + tool invocations
                                              - Validates numbers (validateNumbersAgainstFacts)
                                              - Generates pending action drafts with idempotencyKey
                                                         │
                                                         ▼
                                              [Memory Writer Pipeline]
                                              - Extracts durable facts (extractSemanticMemories)
                                              - Generates 768-dim embeddings in background
```

---

## 2. 🔀 Chatbot Intent Routing Map (`api/services/ai-kernel/`)

| Intent Kind | Matching Heuristics | Target Execution Path | LLM Token Cost |
| :--- | :--- | :--- | :--- |
| `finance_query` | Simple spending queries (e.g. *"صرفت كام الشهر ده؟"*, *"كام رصيدي؟"*) | SQL Aggregation in `resolvers.ts` | **$0.00 (0 Tokens)** |
| `action_request` | Intents to create budget, goals, or transfer records | Action proposal drafts (`aiPendingActions` + `idempotencyKey`) | Yes (Structured JSON) |
| `advice_request` | Lifestyle optimization, budget planning, savings ideas | Chat completions + RAG Memory context | Yes (Generative Text) |
| `general_chat` | Greetings, app guide, and non-financial conversation | Direct prompt loop with safety filters | Yes (Low Priority) |

---

## 3. 💾 Short-Term vs Long-Term Memory (RAG) Subsystem

### Short-Term Memory (Session Context)
* **Table:** `aiConversationSummaries` (`db/schema.ts`).
* **Mechanism:** Retains recent conversation turns and automatically collapses older messages into running summary capsules (`buildRunningSummary`), preventing LLM context window overflow and conserving token budgets.

### Long-Term Memory (Persistent Preferences)
* **Tables:** `aiMemoryItems` (textual facts & preferences) + `aiMemoryEmbeddings` (vector embeddings).
* **Embedding Model:** Fireworks `accounts/fireworks/models/qwen3-embedding-8b` (768 dimensions).
* **Storage Trigger:** Detected automatically via `extractSemanticMemories` on commitment keywords (`اتفقنا`, `موافق`, `بحب`, `بكره`, `مش هلمس`).

---

## 4. 🔍 Hybrid Lexical-Semantic Retrieval Scoring

During memory retrieval (`memory-retriever.ts`), candidate preferences are queried from `aiMemoryItems` and ranked using a multi-signal scoring formula:

\[\text{Total Score} = \text{Cosine Similarity} + \text{Lexical Score} + \text{Specific Token Boost} + \text{Recency Boost} + \text{Importance Bonus}\]

| Scoring Factor | Implementation Details | Weight / Range |
| :--- | :--- | :--- |
| **Cosine Similarity** | Angular proximity between 768-dim Fireworks vectors. | `[0.0, 1.0]` |
| **Lexical Score** | Keyword token overlap between query and memory content. | `[0.0, 0.3]` |
| **Specific Token Boost** | Exact matching of key financial nouns (e.g. `قهوة`, `مطعم`, `بنزين`). | `[0.0, 0.4]` |
| **Recency Boost** | Recency decay boosting memories created/updated recently. | `[0.0, 0.15]` |
| **Importance Bonus** | Assigned memory importance scaled down (`importance / 1000`). | `[0.0, 0.1]` |

---

## 5. 🛠️ Chatbot Function Calling Tool Catalog (`api/services/ai-chat-tools.ts`)

| Tool Name | Key Parameters | Return Format | Core Purpose |
| :--- | :--- | :--- | :--- |
| `finance_query` | `kind` (breakdown, summary, etc.), `period` | structured JSON | Main financial data retriever (SQL fast path). |
| `get_today_expenses` | None | JSON array | List of today's expense records. |
| `get_month_summary` | `month` (optional, YYYY-MM) | JSON object | Net spending, average, income, and expense totals. |
| `get_category_breakdown`| `month` (optional) | JSON object | Percentage and amount spends by category. |
| `get_recent_transactions`| `count` (1 to 30) | JSON array | Recent ledger transaction logs. |
| `get_spending_by_person`| `name` (required) | JSON object | Money transferred or spent with a specific contact. |
| `get_wallet_balances` | None | JSON array | Balances across Cash, Bank, and e-wallets (via `walletId`). |
| `get_financial_goals` | None | JSON array | Active financial goals and progress percentages. |
| `get_app_guide` | None | JSON array | Frequently asked questions, SMS linking guide, PWA tips. |

---

## 6. 🚨 Agent Capabilities vs Constraints

### What the Chat Agent CAN Do:
1. **Direct Data Retrieval:** Can read transactions, wallets, goals, budgets, and contacts via Drizzle schemas inside tools.
2. **Offline Local Processing:** Can resolve math stats and totals locally without invoking external LLMs.
3. **Action Suggestion:** Drafts proposed actions (`aiPendingActions`) with unique `idempotencyKey` for user UI approval.

### What the Chat Agent CANNOT Do:
1. **Direct Database Write Mutations:** The chatbot cannot delete expenses or modify wallet balances directly. It can only generate proposed suggestion drafts (`aiPendingActions`) that the user must explicitly approve in the UI.
2. **Execute Raw System Commands:** Tool executions are strictly restricted to registered helper queries and guides.
3. **Exceed Token Budgets:** Governed by `aiProcedure` rate limits (100 requests per minute) and tier allowances.
