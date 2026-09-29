# 0013. Caching as one system: a cache is correct by its key, not by being cleared

- Status: accepted, implemented in `api/lib/classification-cache.ts`, `api/lib/muscle-memory.ts`,
  `api/lib/settings-cache.ts`, `api/services/finance-semantic-layer/cache.ts`, `ledgerCacheTtl` in
  `api/expense-router.ts`, `src/lib/ledger-refresh.ts` and the write paths named below.
- Decided and recorded: 2026-09-29.

## Context
Each cache was built on its own, and each was kept correct by someone remembering to clear it. Looked at together,
they served wrong answers in ways no single one of them showed:

1. **The classification result cache** was keyed by the text, the plan and a few settings, and kept correct by
   clearing it on every save from every write path that remembered to. That wiped every repeat the user had on each
   coffee; cleared only the process that handled the write, so any other server process kept answering from the old
   state for a week; and missed whatever it did not name (a dictionary word, a correction rule, a known person, a
   setting other than the thresholds, the clarification switch, the month's totals).
2. **It froze degraded answers.** A result was kept whenever it was `auto_save` or `review`, including when the model
   was needed and timed out or failed: the local guess was served for seven days and the sentence never reached the
   model again.
3. **It billed hits.** A hit carried the model attempts of the request that first produced it, and the caller wrote
   them to the AI cost ledger again on every repeat.
4. **It handed out the stored object.** A caller that changed the result changed what the next request was served.
5. **Muscle memory learned from parses, not decisions.** Any auto-saved parse counted, saved or not: a sentence the
   user abandoned, undid or saved under another category taught the pattern anyway, and a wrong answer shown twice (a
   repeat, or a cache hit, which writes its own log) became a trusted pattern that is never escalated. Its per-process
   copy was cleared only on the process that handled the write.
6. **Settings** were held five minutes per process and cleared only on the process the admin's write reached.
7. **The ledger figures** (Home summary, statistics, year) were kept 24 hours in Redis and refreshed by bumping the
   user's generation; a bump lost to a Redis error left the current month wrong all day. Deleting a wallet and
   merging or deleting a person changed expense rows without bumping at all.
8. **The screens** refreshed what each write's author thought of: a delete from the list left the month's totals, the
   installments, the seasons and «ليك وعليك» on the old numbers; an action confirmed in the AI Center refreshed
   nothing.

## Decision
1. **A cache's key holds everything its value depends on.** The classification cache key carries the user's
   dictionary and known people, profile hints, business categories, settings, correction rules (loaded with the
   key), a fingerprint of muscle memory, the clarification switch and the month's totals in 10% steps. No write
   clears it; `invalidateUserClassificationCache` is gone. A change misses by construction, in every process.
2. **Only complete answers are kept.** `auto_save` or `review`, and when the model was needed, only if it answered
   every clause. Questions and degraded answers are served and not kept.
3. **Values are copied in and out**, and a hit reports no model attempts and no spend (the SMS parse cache too).
4. **Muscle memory learns only what the user kept**: a log counts when it became exactly one saved expense
   (`classificationLogId`) with the same category, subcategory and type. Its patterns are reloaded when the Redis
   generation `memgen:<type>:<id>` moves, which `invalidateUserMemory` bumps on every save, edit, delete and
   correction.
5. **Per-process copies of shared data reload on a shared generation**: settings compare `settingsgen` at most every
   ten seconds; admin writes bump it through `invalidateSettingsCache`.
6. **Every write to `expenses` bumps the user's ledger generation** (`bumpFinanceCacheGen`), and a period that can
   still change is cached briefly: the current or previous month and the current year five minutes in Redis
   (`ledgerCacheTtl`), an AI Center period that holds today five minutes (`financeCacheTtl`); closed periods keep a
   day and an hour.
7. **The screens refresh everything computed from the ledger after any write** (`refreshLedgerViews`: every
   `expense.*` query, budgets, wallets and the usage limits).

## The caches, and what bounds each
| Cache | Where | Key / scope | Lifetime | Kept current by |
| --- | --- | --- | --- | --- |
| Classification results | process | inputs + knowledge hash | 7 days, LRU 5,000 | its key (1) |
| Muscle memory patterns | process | user | 30 min | `memgen` generation (4) |
| System settings | process | global | 5 min | `settingsgen`, checked every 10 s (5) |
| AI routes and prices | process | global | 1 min | admin writes refresh their own process; others within a minute |
| Provider circuit breakers | process | provider | minutes | state, not data: each process learns failures itself |
| SMS parse | process | user + message | 15 min, 500 | copies; an identical message is a duplicate anyway |
| Ledger figures | Redis | user generation + period | 5 min open, 24 h closed | `cachegen` bump on every write (6) |
| AI Center finance answers | Redis | user generation + period + taxonomy version | 1-5 min open, 1 h closed | `finance_cachegen` bump (6) |
| Session principal | Redis | token | 15 min | `authver` bump on logout, role and plan change |
| AI memory retrieval | Redis | `ai_memgen` generation | per call | its generation |
| Market prices (voice) | Redis | item | 30 min | time only: prices, not user data |
| App queries | browser | query | React Query | `refreshLedgerViews` after writes (7) |
| Service worker | browser | static assets | versioned | API responses are never cached |

## Consequences
- A save no longer empties the user's classification cache: a repeated sentence stays a hit unless the save changed
  something the answer reads (muscle memory's patterns, which change only when a pattern forms or breaks).
- A request now reads the correction rules and the memory generation before the cache, one indexed query and one
  Redis read, and the memory patterns (two queries) when their generation moved.
- Muscle memory forms more slowly: parses the user never kept no longer count. That is the point.
- Without Redis in production, generations are per process and the lifetimes above are the bound; running more than
  one server process requires Redis.
- A generation counter evicted from Redis restarts at zero; entries written under the old zero expire within their
  lifetime (five minutes for anything open).
- Adding an input to the pipeline means adding it to the classification cache key; the invalidation tests
  (`api/lib/classification-cache-invalidation.test.ts`) show the pattern.
