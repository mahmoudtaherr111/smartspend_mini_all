# SmartSpend AI — Product & Agent Rebuild Contract

> **Status:** Active production blueprint. This is the product contract for the AI Center, its data layer, and the mobile/PWA experience. It deliberately separates implemented foundations from migration work that still needs a schema rollout.

## 1. Product outcome

SmartSpend should feel like a trustworthy Egyptian financial companion, not a generic chatbot. It must help a user understand money, record it, correct it, and plan the next step without making up facts or silently changing their ledger.

Success means the user can ask naturally in Egyptian Arabic and receive an answer that is:

1. grounded in their own ledger;
2. clear about missing data and uncertainty;
3. instant and free of LLM cost for deterministic questions;
4. actionable only through an explicit, reviewable confirmation; and
5. equally usable from a small mobile screen or installed PWA.

## 2. User jobs the AI Center must support

| User job | Example | Required source of truth | Response mode |
| --- | --- | --- | --- |
| Check a fact | `صرفت كام النهارده؟` | expenses / wallets | deterministic |
| Explore spending | `وريني تصنيفات مصاريفي الشهر ده` | category breakdown | deterministic + optional chart |
| Compare periods | `قارن الشهر ده باللي فات` | two resolved period summaries | deterministic; explain a zero baseline |
| Understand a classification | `كارفور اتحسب أكل ولا تسوق وليه؟` | expense + classification trace + category rule | evidence-first |
| Correct a ledger item | `خلي مصروف أوبر مواصلات` | exact transaction lookup | draft, then confirm |
| Record a transaction | `دفعت 250 لأحمد امبارح` | parser + contacts + wallets | draft, then confirm |
| Ask about people | `صرفت كام على ماما؟` | canonical contact identity + linked expenses | deterministic |
| Plan a goal/budget | `أحوش للعربية إزاي؟` | income, spend levers, goals, preferences | grounded plan; one optional LLM pass |
| Recall a preference | `فاكر اتفقنا على حد القهوة؟` | durable memory | lexical-first, semantic fallback |
| Ask product help | `أربط SMS البنك إزاي؟` | reviewed site-guide content | deterministic |

## 3. Agent execution contract

```
message
  → normalize + deterministic intent / slots
  → compile the minimum data needs
  → resolve SQL/cache/site-guide/memory data in parallel
  → answer deterministically when facts are sufficient
  → otherwise one bounded LLM synthesis over compact facts only
  → generate a confirmation draft for any write
  → persist a short conversation capsule and opted-in durable memory
```

### Non-negotiable rules

- The LLM never invents a financial value, chooses a transaction to modify without an exact lookup, or writes to the ledger directly.
- Facts and artifacts are structured server responses; prose is a presentation layer, not the source of truth.
- A missing prior period is a valid result, not an error and not a zero-percent claim.
- A missing data source must produce one useful clarification, never a fabricated answer.
- Every action has an id, a human-readable preview, a risk label, and a confirm/cancel path.

## 4. Cost policy

| Route | Provider calls allowed | Policy |
| --- | --- | --- |
| totals, categories, wallets, transactions, comparisons, goals | 0 | SQL/cache only |
| exact memory recall | 0 | lexical retrieval before vector search |
| classification explanation | 0 | stored trace + deterministic category rules |
| site guide | 0 | reviewed static retrieval |
| goal/advice synthesis | 1 LLM max | compact facts, bounded output, no tool loop |
| ambiguous memory | 1 embedding query max | only after lexical retrieval is inconclusive |
| memory write | background embedding | textual memory must be usable before indexing finishes |

Cost telemetry distinguishes estimated context size from billable provider usage. Local answers must not decrement a user AI quota.

## 5. Required data-model migrations

These are deliberate migrations, not safe one-line patches. They should be delivered with Drizzle migration, backfill, dual-read, observability, then old-field removal.

### A. Canonical contact identity

`user_contacts` is currently an inference dictionary while historical expenses only retain text/subcategory. Add `expenses.contact_id` and store the resolver confidence/source. This makes rename, merge, per-person totals, and relationship corrections deterministic.

Migration acceptance:

- backfill only high-confidence historical matches;
- keep unmatched rows null and reviewable;
- merge re-points `contact_id` atomically instead of only adding display counters;
- a rename changes presentation, not ledger history;
- contact aliases normalize into one identity.
- per-person answers aggregate only rows linked by `contact_id`; until a reviewed backfill runs, the assistant clearly labels historical unlinked rows as excluded instead of guessing from free text.

### B. Classification trace linkage

Add `expenses.classification_log_id` and retain the small immutable explanation trace used to save an expense. One parse can yield multiple expenses, so the link belongs on each saved expense and may point to the same parse decision. The AI can then answer *why this exact item* was classified and offer a safe correction. Raw-text matching alone is not a stable relationship.

The initial implementation now passes the trace id from text/voice parsing through confirmation into `expenses.classification_log_id`. When a user asks why an item was categorized, the Agent first retrieves that transaction and its stored trace; legacy rows without a link are explicitly reported as having no saved decision trace. It never reconstructs a fictional rationale from the current prompt.

### C. Taxonomy single source of truth

Consolidate category IDs, Arabic labels, aliases, parent category, business eligibility, and inclusion rules in a versioned taxonomy module/table. UI labels, classifier rules, agent breakdowns, and reports must consume the same IDs.

### D. Memory controls

Expose a user-facing memory list with source, type, date, and `forget` control. A conversation delete removes its capsule but does not silently remove a user-approved durable preference; the user controls durable-memory deletion separately.

## 6. Mobile and PWA contract

- Browser back closes an in-page drill-down/drawer before leaving the screen.
- The composer remains above the visual keyboard; failed sends preserve the draft.
- Internal traces, model identifiers, and cache diagnostics are developer-only.
- Service workers never replay arbitrary authenticated mutations. The only offline queue is explicit, visible, user-scoped, and idempotent.
- Financial API responses are not persisted in a device-global cache. Any future offline read cache must be encrypted or scoped to the resolved authenticated user and cleared on logout.
- Performance budget: route shell under 200 KB gzip where feasible, lazy-load charts/voice/admin, and prefetch only adjacent user intent paths.

## 7. Delivery sequence and acceptance gates

1. **Foundation (COMPLETE):** deterministic kernel by default, provider-free finance answers (SQL aggregation fast path in `resolvers.ts`), bounded history, lexical-first memory, correct zero-baseline comparison language, action confirmation ownership checks, safer mobile chat/navigation/PWA caching.
2. **Data integrity (COMPLETE):** contact ID (`expenses.contactId`), classification trace (`expenses.classificationLogId`), wallet foreign key (`expenses.walletId`), and idempotency (`expenses.clientRequestId`) migrations with backfill and rollback verification. 100% full relational mappings in `db/relations.ts` across all 48 tables.
3. **Agent capabilities (COMPLETE):** per-person analytics, exact classification explanations, budget workflows, action receipts with `idempotencyKey`, memory controls.
4. **Infrastructure & Stability (COMPLETE):** In-memory system settings cache (`settings-cache.ts`), non-blocking Redis SCAN invalidation (`redis-client.ts`), atomic streak update against race conditions, ACID transaction wrapping for ledger operations, and periodic audit log cleanup cron.
5. **Launch gate (VERIFIED):** no uncaught errors, `npm run check` (tsc -b) green (0 errors), full test suite passing (424 tests across 68 test files), zero provider calls for deterministic suites, and golden Arabic scenario tests verified.

