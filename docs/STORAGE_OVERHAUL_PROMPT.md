# SmartSpend AI — Storage & Data-Lifecycle Overhaul

**Execution brief for an autonomous coding agent (Google Antigravity).**

---

## 0. Your role, and how to read this document

You are a **senior backend/database engineer** taking ownership of the storage layer of a
production Arabic-first fintech application. You are not prototyping. Every change you make
must be safe to run against a live database that contains real users' financial records.

This document is a **specification, not a suggestion list**. It contains:

- Section 1–2: how to orient yourself, and the *verified* current state.
- Section 3: the target architecture you are building toward, and *why* each decision exists.
- Section 4: invariants you may never violate.
- Section 5: the phased work plan (P0 → P8), each with concrete tasks, files, and acceptance gates.
- Section 6–7: migration policy and the verification protocol.
- Section 8: the report you must write back when you are done.
- Section 9: explicitly prohibited actions.

**Ground rule: verify before you trust.** Every factual claim in Section 2 was derived by
reading the repository, but you must re-confirm each one yourself before acting on it
(file paths and line numbers drift). If you find a claim here is wrong, **do not silently
work around it** — record the discrepancy in your report and adjust.

**Ground rule: phases are gates, not suggestions.** Do not begin phase N+1 until phase N's
acceptance criteria are demonstrably met, with evidence you can paste into the report.
If a phase cannot be completed, stop, complete every *other* independent phase, and report
precisely what was blocked and why. Do not silently reduce scope.

---

## 1. Repository orientation

Read these first, in this order:

1. `AGENTS.md` — the authoritative brief (stack, commands, layout, invariants). **Everything
   in it applies to you.**
2. `CLAUDE.md` — testing commands and the doc-trust order.
3. `db/schema.ts` — 52 tables. This is the single source of truth for the data model.
   It outranks anything in `docs/`.
4. `db/relations.ts` — 48 relation exports (Drizzle-level only; see §2.3).

### Stack facts you need

| Concern | Reality |
| :--- | :--- |
| Database | MySQL 8, InnoDB, `utf8mb4`, accessed via Drizzle ORM (`drizzle-orm/mysql2`) |
| Pool | `api/queries/connection.ts` — `connectionLimit` 30 (prod) / 10 (dev) |
| Migrations | `drizzle-kit`, output to `db/migrations/` (22 migrations exist) |
| Cache | Redis via the `redis` npm client, `api/lib/redis-client.ts` — **currently optional** |
| API | Hono v4 + tRPC v11, 22 sub-routers, root at `api/router.ts` |
| Frontend cache | TanStack Query + an IndexedDB persister (`src/lib/queryPersister.ts`) |
| Object storage | **None exists.** |
| Tests | Vitest, colocated `*.test.ts`. `vitest.config.ts` injects dummy env, so no real MySQL/Redis needed for unit tests. |

### Commands

```bash
npm run check          # tsc -b — MUST pass before any commit
npm run lint           # ESLint
npm run test           # Vitest
npm run test -- <path> # single file
npm run db:generate    # generate a Drizzle migration from schema.ts
npm run db:migrate     # apply migrations
npm run db:push        # DEV ONLY — never use for a change you intend to ship
```

---

## 2. Verified current state

This is what the code actually does today. Confirm each item before acting.

### 2.1 The five storage surfaces

1. **MySQL 8** — 52 tables. Everything durable lives here, at one temperature, forever.
2. **Redis** — optional. Used for: `expense_stats:*` cache, `finance_ai:*` cache,
   AI-memory cache, voice-call session state, OTP. If `REDIS_URL` is absent the client
   falls back to a per-process `Map` (dev only; disabled in production).
3. **Per-process RAM** — rate limiting (`api/lib/rate-limit.ts`), system-settings cache
   (`api/lib/settings-cache.ts`, 5-min TTL), WhatsApp OTP cache (`api/services/otp-cache.ts`),
   the Redis memory fallback.
4. **Static JSON files on disk** — RAG dictionaries in `api/lib/` (`egypt_merchants_rag.json`,
   `egypt_slang_local_rag.json`, `egypt_digital_fintech_rag.json`). Read at boot. Fine as-is.
5. **Client (browser)** — IndexedDB via `src/lib/queryPersister.ts` (12 h max age),
   plus ~134 `localStorage` call sites.

### 2.2 The historical-data problem (this is the core defect)

There is **no pre-aggregation in the live read path**. Every historical question is answered
by scanning raw rows from `expenses`.

- `api/expense-router.ts` → `getMonthSummary` — the one good one: aggregates with SQL `SUM`.
- `api/expense-router.ts` → `getMonthlyStats` — issues `SELECT *` for the *entire* requested
  month **and** the entire previous month, then aggregates in JavaScript with
  `.filter().reduce()`.
- `api/expense-router.ts` → `getYearlyStats` — issues `SELECT *` for a **full calendar year**
  and builds the 12-month series in Node. No cache at all.
- `api/services/finance-semantic-layer/resolvers.ts` → `loadRowsForPeriod` — `SELECT *` with
  **no `LIMIT`**, for any period the AI asks about. An "all time" or multi-year question
  loads the user's entire transaction history into process memory.

The tables that were meant to solve this exist but are effectively dead:

- **`monthly_reports`** — the table exists; `api/jobs/monthly-report-job.ts` exports
  `runMonthlyReportJob`; **that function has zero callers in the repository.** It is wired to
  no cron in `api/boot.ts`.
- **`monthly_behavior_snapshots`** — written from exactly one place, `api/profile-router.ts`
  (`refreshMonthlyInferences`), on demand when a user opens their profile. Therefore it is
  full of gaps, and the AI code that reads it (`finance-semantic-layer/monthly-report-facts.ts`,
  `proactive-insights.ts`) frequently finds nothing.

There is **no archival, no tiering, and no partitioning**. `expenses` grows linearly forever
and every historical query walks it live.

### 2.3 Referential integrity

- `db/schema.ts` contains **zero** `references(...)` calls and **zero** `onDelete` clauses.
  There are no foreign keys in the database.
- `db/relations.ts` defines Drizzle-level relations only — these are a TypeScript/query-builder
  convenience. They do **not** create constraints and do **not** cascade.
- Consequently `api/services/user-purge-service.ts` performs **39 hand-written `tx.delete(...)`
  calls**. Any table added without updating this file leaks orphaned rows permanently.

### 2.4 The dual-identity tax

Two user tables — `users` (Google OAuth) and `localUsers` (phone/OTP/WebAuthn) — force a
polymorphic `(userId, userType)` discriminator into essentially every other table.
`userType` is stored as `varchar(50)` holding the string `"oauth"` or `"local"`, on every row
of every table, including the highest-volume ones.

### 2.5 The authentication hot path

`api/context.ts` → `createContext()` runs on **every request**:

1. `api/lib/session-validation.ts` → `validateActiveSessionToken()` verifies the JWT, then
   issues a `SELECT` against `sessions`.
2. A second `SELECT` fetches the user row from `users` or `localUsers`.
3. For non-free plans, `resolveAndSyncPlan()` issues a **third** `SELECT` against
   `proSubscriptions`, and may issue two `UPDATE`s inline.

There is **no cache on any of this**. Three-plus round trips to MySQL before request work
begins. This is the largest single source of constant database load in the system.

Additionally: `sessions.token` stores the **raw JWT in plaintext** in a `varchar(500)` column.
A database leak is a full session-hijack of every live user.

### 2.6 Cache defects

- `api/lib/redis-client.ts` → `deleteCacheByPattern()` invalidates by running
  `SCAN MATCH <pattern>` over the **entire keyspace** and deleting key-by-key.
  It is called on every expense create/update/delete via
  `api/expense-router.ts` → `invalidateExpenseCache()`. Cost is O(total keys) **per write**.
- `api/services/finance-semantic-layer/cache.ts` → `invalidateFinanceUserCache()` uses the
  pattern `finance_ai:*:<userId>:<userType>:*` — a wildcard in the **middle** of the key,
  so not even prefix scanning helps.
- The in-process `Map` fallback is **per process**. With more than one replica it does not
  degrade gracefully — it serves *divergent* numbers depending on which replica answers.
- `api/lib/rate-limit.ts` is an in-process fixed-window counter. With N replicas the effective
  limit is `max × N`, and it resets to zero on every restart/deploy.

### 2.7 Unbounded growth

Only three things are ever pruned, all in `api/boot.ts`:

| Cron | Schedule | Action |
| :--- | :--- | :--- |
| `daily-auth-cleanup` | `0 0 * * *` | deletes expired `sessions` and `auth_challenges` |
| `classification-log-cleanup` | `0 3 * * 0` | deletes `classification_logs` older than 180 days |
| `scheduled-notifications` | `* * * * *` | notification dispatch (not cleanup) |
| `smart-activity-notifications` | `0 20 * * *` | notification dispatch (not cleanup) |

Everything else grows forever, including the highest-write, lowest-long-term-value tables:
`ai_token_ledgers` (one row per AI call), `raw_sms_events` (full SMS body text),
`chat_messages`, `notification_logs`, `user_analytics`, `ad_clicks`, `voice_usage`,
`api_key_errors`, `profile_learning_events`, `ai_action_audit_logs`.

### 2.8 Index bloat on the hottest write table

`expenses` carries **ten** indexes: `date`, `(userId,userType,date)`, `type`, `category`,
`status`, `businessId`, `contactId`, `classificationLogId`, `walletId`, and a unique
`(userId,userType,clientRequestId)`. Several are single-column indexes on low-cardinality
values (`type` has ~4 distinct values, `status` ~2) that the optimizer will almost never
choose. Each one costs write amplification on every insert plus permanent disk.

### 2.9 Vector storage

`ai_memory_embeddings.vector` is a **MySQL `json` column** holding a float32 array.
`api/services/ai-memory/memory-retriever.ts` fetches up to **160 rows**, parses each JSON
array, and computes cosine similarity in Node. A JSON-encoded 768-dimension float array is
roughly 10–15 KB; the same vector as int8 is 768 bytes.

A `qdrant-vector-store.ts` and a `quantized-vector-store.ts` already exist in
`api/services/ai-memory/` but are not the default path.

### 2.10 Other confirmed hot spots

- `api/chat-router.ts` — `getMessages` loads **all** messages of a conversation with no `LIMIT`.
- `api/admin-router.ts` — runs `SELECT count(*)` over `expenses` (full index scan in InnoDB);
  loads **all** rows of `pushSubscriptions` and `notificationTemplates` with no limit.
- `api/notification-engine.ts` — the per-minute cron builds a segment filter containing a
  **correlated subquery** `(SELECT count(*) FROM expenses WHERE user_id = ...)` evaluated
  per candidate user row.
- `src/App.tsx` — TanStack Query `staleTime` is **10 seconds** globally, so the client
  re-fetches almost everything on every focus/mount.

### 2.11 What is already correct — do not "fix" these

- Passwords: **bcrypt, cost 12** (`api/local-auth-utils.ts`). Correct. Leave it.
- Money: `decimal(12,2)` columns plus `decimal.js` in application code. Correct.
- Idempotency: `expenses.clientRequestId` with a unique index. Correct.
- Session revocation semantics: JWT alone is deliberately not sufficient; the DB row is the
  authority so logout is immediate. **Preserve this property** — you may cache it, you may
  not remove it.
- The client IndexedDB query persister. Correct and useful.
- The composite `(userId, userType, date)` index on `expenses`. Correct and load-bearing.

---

## 3. Target architecture

### 3.1 The organizing principle: data temperature

Today every byte lives in one place, at one temperature, forever. The target model assigns
every table exactly one **class**, and the class determines where it lives, how it is
indexed, how it is cached, and when it dies.

| Class | Meaning | Storage rule | Lifetime |
| :--- | :--- | :--- | :--- |
| **A — Identity & Config** | users, credentials, settings, providers, templates, categories | MySQL; small; cached aggressively in Redis with explicit invalidation | Forever |
| **B — Core Ledger** | `expenses` — the truth about user money | MySQL; narrow hot table; covering indexes; never auto-deleted | Forever |
| **C — Derived / Rollup** | pre-aggregated facts computed from B | MySQL; tiny; **rebuildable from B at any time** | Forever (cheap) |
| **D — Operational / Ephemeral** | sessions, challenges, OTPs, pending actions | Redis primary, MySQL as durable fallback/audit | Minutes → days |
| **E — Telemetry / Logs** | classification logs, token ledgers, analytics, notification logs | MySQL, chunk-pruned on a schedule, rolled up before deletion | 30–365 days |
| **F — AI Memory** | memory items + embeddings | text/metadata in MySQL; **vectors in a vector store or quantized binary** | Forever (items), rebuildable (vectors) |
| **G — Conversation** | `chat_messages` | MySQL raw for a window, then summarized and pruned | 90 days raw |

**Every table in `db/schema.ts` must be assigned a class**, and that assignment must live in
code (see P4), not in a document that will drift.

### 3.2 Decision 1 — Answer history from rollups, not from scans

Introduce **one** new rollup table at **day** grain:

```
expense_daily_rollups
  user_id        INT       NOT NULL
  user_type      ENUM('oauth','local') NOT NULL
  business_id    INT       NOT NULL DEFAULT 0      -- 0 = personal. NOT NULL is mandatory; see below.
  day            DATE      NOT NULL
  income              DECIMAL(14,2) NOT NULL DEFAULT 0
  expense             DECIMAL(14,2) NOT NULL DEFAULT 0
  transfer            DECIMAL(14,2) NOT NULL DEFAULT 0
  investment          DECIMAL(14,2) NOT NULL DEFAULT 0
  automated_income    DECIMAL(14,2) NOT NULL DEFAULT 0   -- source = 'sms'
  automated_expense   DECIMAL(14,2) NOT NULL DEFAULT 0
  txn_count           INT NOT NULL DEFAULT 0
  updated_at     TIMESTAMP
  UNIQUE KEY (user_id, user_type, business_id, day)
```

**Critical implementation trap:** `business_id` must be `NOT NULL DEFAULT 0`, not nullable.
MySQL treats `NULL` values as distinct in a `UNIQUE` index, so a nullable `business_id`
silently breaks `INSERT ... ON DUPLICATE KEY UPDATE` for personal (non-business) rows and
you will accumulate duplicate rollup rows that double-count. Use `0` as the sentinel for
"personal" and normalize at the boundary.

**Why day grain and not month grain:** the product supports a user-configurable salary day
(`api/services/financial-month.ts` → `getFinancialMonthDates`), so a "month" is not a
calendar month. Day grain sums correctly over *any* boundary — calendar months, salary-day
months, weeks, arbitrary ranges — with at most ~31 rows per month read.

**Maintenance is incremental and transactional, not batch.** Write one function:

```
applyExpenseRollupDelta(tx, {
  userId, userType, businessId, date, txnType, source, amountDelta, countDelta
})
```

- On insert: apply `+amount, +1`.
- On delete: apply `−amount, −1`.
- On update: apply the **negative delta using the OLD row values**, then the **positive delta
  using the NEW row values**. Amount, date, type, businessId and source can all change in one
  update — you must reverse the old row completely before applying the new one.
- It must run **inside the same database transaction** as the mutation of `expenses`.
  If it cannot, the rollup will drift and the feature is worse than useless.

Call sites you must cover — find all of them, do not assume this list is complete:
single create, bulk create, update, delete, bulk delete, SMS-ingested expenses
(`api/sms-router.ts`), receipt-image expenses (`api/image-router.ts`), AI-agent-created
expenses (`api/services/action-runtime/`), and the clarification-resolution path.

**Backfill:** one migration that builds the whole table with a single `INSERT ... SELECT
... GROUP BY` over `expenses`. Run it in date-bounded chunks (e.g. per calendar quarter) so
it does not hold a long transaction.

**Reconciliation:** a nightly cron that, for the trailing 60 days only, compares
`SUM(expense_daily_rollups)` against `SUM(expenses)` per user and repairs any mismatch,
logging every repair. Drift that is never detected is drift that becomes wrong numbers on a
user's screen; drift that is detected and repaired nightly is an acceptable engineering
reality. **Do not skip this.**

### 3.3 Decision 2 — Category breakdowns come from a covering index, not from JavaScript

Time-series and totals come from the rollup table. Category/sub-category breakdowns need
per-row taxonomy normalization, so they stay on `expenses` — but they must be computed by
MySQL, not Node.

Add one covering composite index:

```
(user_id, user_type, business_id, date, type, category, sub_category, amount)
```

With this index, a `GROUP BY category` over a date range is an index-only scan: MySQL never
touches the row data, never reads the `TEXT`/`JSON` columns, and returns a handful of rows
instead of thousands.

Then **drop** the four low-value indexes that this makes redundant or that the optimizer
will not use: `expenses_type_idx`, `expenses_category_idx`, `expenses_status_idx`, and
`expenses_date_idx`. Before dropping each one, prove it is unused:

- Check `performance_schema.table_io_waits_summary_by_index_usage` for that index on a
  production-like dataset, **and**
- Grep the repository for any query whose `WHERE`/`ORDER BY` leads with that column alone.

If you cannot prove an index is unused, keep it and say so in the report. Do not drop on
intuition.

### 3.4 Decision 3 — The authenticated request must not touch MySQL

Target: **zero MySQL queries** on an authenticated request when the session cache is warm.

1. **Hash the session token.** Add `token_hash BINARY(32)` (SHA-256 of the JWT), backfill,
   add a unique index on it, and switch all lookups to it. Keep the `token` column through
   one release, then drop it in a follow-up migration. A leaked database must not yield
   usable session tokens.
2. **Cache the resolved principal in Redis:** key `sess:<hex token_hash>` → the full
   `UnifiedUser` plus the session expiry. TTL = `min(session remaining lifetime, 15 minutes)`.
3. **Invalidate without scanning:** maintain `authver:<userType>:<userId>` in Redis, an
   integer bumped on logout, plan change, role change, or session revocation. Embed the
   current value in the cached blob; on read, compare and treat a mismatch as a miss. Logout
   additionally deletes the specific `sess:` key.
4. **Move `resolveAndSyncPlan` off the request path.** Subscription expiry is a scheduled
   concern, not a per-request concern. Add a daily cron that expires `proSubscriptions` and
   downgrades the corresponding user rows, and bump `authver` for each user it touches.
5. **Preserve immediate revocation.** On a cache miss, fall through to exactly today's
   MySQL logic. A Redis outage must degrade performance, never correctness or security.

### 3.5 Decision 4 — O(1) cache invalidation

Delete the `SCAN`-based invalidation from all write paths.

Replace it with a **generation counter** per user: `cachegen:<userType>:<userId>` in Redis,
`INCR`-ed on any write that affects that user's derived data. Every cache key embeds the
current generation:

```
stats:g<gen>:<userType>:<userId>:<month>:<salaryDay>:<businessId>
```

Invalidation becomes a single `INCR` — O(1), no keyspace walk. Stale keys are never read
again and expire on their own TTL. Also embed a **schema version constant** in the prefix so
a deploy that changes a payload shape invalidates everything at once, exactly as
`finance-semantic-layer/cache.ts` already does with `CACHE_SCHEMA_VERSION` — keep that idea,
it is the right one.

`deleteCacheByPattern` survives **only** for admin/maintenance tooling. Add a comment saying
so, and assert it is never reachable from a request handler.

Fix the in-process fallback while you are here: it must be namespaced by the same generation
key, and it must be documented as **single-process-only**, never as a production
multi-replica cache.

### 3.6 Decision 5 — Rate limiting moves to Redis

Replace the in-process fixed window in `api/lib/rate-limit.ts` with a Redis
**sliding-window or token-bucket** limiter implemented as a single Lua script (atomic,
one round trip). Keep the existing per-tier limits from `api/middleware.ts` unchanged —
you are changing the *backend*, not the policy.

The in-process implementation stays as an explicit development/test fallback and must log a
warning when used with `NODE_ENV=production`.

### 3.7 Decision 6 — Every log table gets a lifecycle, declared in code

Create `api/jobs/data-retention-job.ts` driven by a single declarative array:

```ts
type RetentionPolicy = {
  table: MySqlTable;
  dateColumn: AnyColumn;
  retainDays: number;
  where?: SQL;            // e.g. only prune rows already processed
  rollupBefore?: () => Promise<void>;  // aggregate, then delete
  class: "E" | "G";
};
```

Requirements:

- Deletes must be **chunked** (`LIMIT 5000` in a loop with a small pause) so no single
  statement holds locks long enough to stall writes.
- The job must support a **dry-run mode** that reports counts without deleting.
- It must log, per table, how many rows were removed and how long it took.
- Add a **test that fails when a table in `db/schema.ts` has no class assignment**, so future
  tables cannot silently join the "grows forever" set. This is the part that makes the fix
  permanent rather than a one-time cleanup.

Proposed starting policy — adjust with justification if you disagree, but every table must
get an explicit entry, including `"forever"` where that is the right answer:

| Table | Retain | Notes |
| :--- | :--- | :--- |
| `classification_logs` | 90 days | Reduced from 180. Additionally null out `reasoning_trace_light` and `ai_result` after 30 days — the JSON blobs are the bulk of the bytes and are only useful while debugging a recent regression. |
| `ai_token_ledgers` | 90 days raw | **Roll up first** into a new `ai_cost_monthly` table (`user_id, user_type, billing_period, provider_slug, model_id` → summed tokens + cost). Billing and admin analytics read the rollup; the raw ledger is for recent debugging only. |
| `user_analytics` | 30 days | Pure product telemetry. |
| `notification_logs` | 90 days | Keep long enough for the "did we already warn this user this month" checks, which look back one month. |
| `ad_clicks` | 90 days | Roll up into `ad_stats_daily` before pruning; `ads.clicks` / `ads.impressions` counters stay authoritative. |
| `raw_sms_events` | 30 days where `status IN ('processed','ignored')`; 90 days where `status = 'error'` | Contains full SMS bodies — this is both the largest text payload per row and the most privacy-sensitive log in the system. |
| `api_key_errors` | 30 days resolved / 90 days unresolved | |
| `profile_learning_events` | 180 days | |
| `voice_usage` | 90 days raw | Monthly totals already derivable; roll up if a quota feature depends on it. |
| `ai_action_audit_logs` | 365 days | Audit trail for actions the AI took on a user's money. Longest retention deliberately. |
| `chat_messages` | 90 days | Only after `ai_conversation_summaries` holds a summary for that conversation. **Never delete a message whose conversation has no summary row.** |
| `pending_clarifications` | 30 days where `status != 'pending'` | |
| `ai_pending_actions` | 30 days past `expires_at` | |
| `auth_challenges`, `sessions`, `whatsapp_otp_codes` | already handled / move to Redis | |
| `expenses`, `users`, `local_users`, `user_profiles`, `monthly_*`, all config tables | **forever** | Explicitly declared, never pruned. |

### 3.8 Decision 7 — Wire the dead jobs

`runMonthlyReportJob` has no caller. `monthly_behavior_snapshots` is written only on demand.
Both must become real scheduled jobs registered through the existing
`scheduleProtectedJob(...)` helper in `api/boot.ts` (which already handles the `ENABLE_CRONS`
flag and the cross-replica lock in `api/services/scheduler-lock.ts` — use it, do not invent
a second locking mechanism).

Add, at minimum:

- Monthly report generation — early on the 1st, for the previous month.
- Monthly behavior snapshot generation — same schedule, for every user with activity, so the
  AI's context layer stops finding gaps.
- The data-retention job — daily, off-peak.
- The rollup reconciliation job — nightly.
- Subscription expiry — daily (moved off the request path per §3.4).

Every one of these must be idempotent and safe to run twice.

### 3.9 Decision 8 — Narrow the hot table

`expenses` currently stores `raw_text TEXT`, `description TEXT`, and `parsed_metadata JSON`
inline. InnoDB stores large values off-page, but the row overhead and buffer-pool pressure
are real, and none of these columns is needed by any aggregate query.

Move `raw_text` and `parsed_metadata` to a side table:

```
expense_details
  expense_id     INT PRIMARY KEY
  raw_text       TEXT
  parsed_metadata JSON
```

Keep `description` on the main table (it is displayed in list views). Join only when detail
is actually requested. This makes the hot table narrower, so more rows fit per page and the
buffer pool covers more of the working set.

**Sequence this carefully:** add the table and dual-write first, backfill, switch reads,
verify, and only then drop the old columns in a *separate later migration*. Never drop a
column in the same migration that creates its replacement.

### 3.10 Decision 9 — Column-type diet

Across the schema, replace `varchar(50)` discriminators with `ENUM` (1–2 bytes):

- `user_type` → `ENUM('oauth','local')` — this appears on ~40 tables including the
  highest-volume ones, and is the single highest-leverage type change in the schema.
- `role` → `ENUM('user','moderator','admin')`
- `plan` → `ENUM('free','pro','ultra')`
- `expenses.type` → `ENUM('income','expense','transfer','investment')`
- `expenses.status`, `expenses.source`, and the various `status` columns → `ENUM`

Also: `sessions.token varchar(500)` → replaced by `token_hash BINARY(32)` (§3.4).

**Two cautions.** First, Drizzle's `mysqlEnum` changes the inferred TypeScript type; expect
`npm run check` to surface every place that assigned a loose string, and fix those properly
rather than casting. Second, an `ENUM` whose value set later needs a new member requires a
DDL change — this is acceptable for these columns because their value sets are already
enumerated as invariants in `AGENTS.md` §4.1/§4.2, but do **not** apply `ENUM` to any column
whose values are user-supplied or provider-supplied.

### 3.11 Decision 10 — Vectors leave MySQL JSON

Two-tier target:

- **Preferred:** when a vector-store URL is configured, use the existing
  `api/services/ai-memory/qdrant-vector-store.ts` path. MySQL keeps only the memory item's
  text and metadata.
- **Fallback (no external service):** store the embedding as **int8-quantized
  `VARBINARY`** plus a stored `norm` float, using the existing `quantized-vector-store.ts`.
  This is roughly a 15× size reduction versus a JSON float array and makes the similarity
  loop dramatically cheaper.

Either way, delete the `json` vector column once migrated, and treat embeddings as
**rebuildable** — an embedding is a derived artifact, not a record of truth. Document that
`api/services/ai-memory/embedding-backfill.ts` is the rebuild path.

Also: raise the retrieval candidate ceiling off the hard-coded `160` and make it a function
of the store in use — with a real vector index there is no reason to brute-force a fixed slab.

### 3.12 Decision 11 — Referential integrity (gated; highest risk)

**Only attempt this after P0–P5 are complete, verified, and committed.**

The goal is real foreign keys with `ON DELETE CASCADE`, which requires a single-column
parent key. Approach:

1. Add `accounts (account_id BIGINT PK AUTO_INCREMENT, user_type ENUM, legacy_id INT,
   UNIQUE(user_type, legacy_id))`. Backfill one row per existing `users` and `localUsers` row.
2. Add a nullable `account_id BIGINT` to every child table. Backfill from the existing
   `(user_id, user_type)` pair.
3. Verify zero nulls, then make it `NOT NULL` and add the FK with `ON DELETE CASCADE`.
4. Switch reads/writes to `account_id` behind a feature flag, keeping the legacy columns
   populated for one full release.
5. Only in a later, separate change: drop the legacy columns and shrink
   `user-purge-service.ts` from 39 deletes to a single delete on `accounts`.

If at any point the risk looks unacceptable on the live dataset — say so and stop at step 3.
A half-finished identity migration is far worse than none. **Delivering P0–P5 well and
declining P6 with a clear explanation is a success. Rushing P6 and corrupting the identity
mapping is not.**

### 3.13 Decision 12 — Object storage abstraction

Create `api/services/storage/` with a driver interface and two implementations:

- `local-driver.ts` — writes under a gitignored directory; the default for development, so
  the project keeps working with no cloud credentials.
- `s3-driver.ts` — S3-compatible. Recommend **Cloudflare R2** in the docs: S3-compatible API,
  and zero egress fees, which matters for an image-serving workload with a MENA user base.

First consumer: user avatars. Today `users.avatar` is a `varchar(500)` hotlinking a Google
CDN URL, which breaks when the upstream rotates and offers no upload path. Upload → resize →
convert to WebP (target ≤ 30 KB) → store → keep only the key in the database.

Do **not** start persisting receipt images by default. `api/image-router.ts` currently
receives base64, sends it to the model, and discards it — that is the correct default for
storage cost and privacy. Build the capability; leave it off behind a setting.

### 3.14 Decision 13 — Bounded reads, everywhere

Establish and enforce the rule: **no query returns an unbounded number of rows.**

Fix at least these, and search for others:

- `finance-semantic-layer/resolvers.ts` → `loadRowsForPeriod` — add an explicit cap
  (suggest 2000) and, when the cap is hit, serve the answer from rollups instead of rows and
  mark the result as aggregate-only.
- `chat-router.ts` → `getMessages` — paginate.
- `admin-router.ts` — paginate `pushSubscriptions`, `notificationTemplates`, `discountCodes`,
  `onboardingQuestions`, `ads`, `aiProviders`, `aiModels`.
- `admin-router.ts` — replace `SELECT count(*)` over `expenses` with a maintained counter or
  an approximate count from `information_schema`; an exact global count is not worth a full
  index scan on every admin dashboard load.
- `notification-engine.ts` — remove the correlated `(SELECT count(*) FROM expenses ...)`
  subquery from the per-minute segment filter; derive `minUsage` from the rollup table.

### 3.15 Decision 14 — Client-side

- Raise the global TanStack Query `staleTime` in `src/App.tsx` from 10 s to something honest
  per data class: config/profile ~5 min, historical months ~1 hour (they cannot change),
  current-month stats ~60 s. Use per-query overrides; do not just raise the global number and
  make live data stale.
- Historical months are **immutable once closed** — mark those queries with a long
  `staleTime` and let the IndexedDB persister serve them offline. This removes a large share
  of repeat traffic for free.

### 3.16 Decision 15 — Observability, or none of this is verifiable

- Log every query slower than a threshold (start at 100 ms) with its shape, behind an env flag.
- Expose cache hit-rate, Redis backend status, and pool utilisation on the existing admin
  surface — `getCacheRuntimeStatus()` in `api/lib/redis-client.ts` already exists, build on it.
- Record, per phase, before/after numbers. A performance change you cannot measure is a
  performance change you cannot defend.

---

## 4. Invariants — never violate these

1. **`AGENTS.md` §4 applies in full.** In particular: always use `ctx.user`; never check
   `role === "pro"` (role is RBAC, plan is subscription tier); always use the procedure
   factories from `api/middleware.ts`; always read settings via `getSystemSettings()`;
   route model names through `api/lib/model-mapper.ts`.
2. **Both user types keep working.** Every change must be tested against `oauth` and `local`
   users. A change that works for one and breaks the other is a regression, not a partial win.
3. **Session revocation stays immediate.** Caching is allowed; weakening logout is not.
4. **Money is never computed in floating point.** `decimal.js` in application code,
   `DECIMAL` in SQL. Rollup columns are `DECIMAL(14,2)`.
5. **No migration destroys data.** Additive first, backfill, verify, switch reads, and only
   then remove — in a *separate* migration.
6. **`npm run check` must pass** before any commit. `npm run lint` too.
7. **Never widen a type to silence the compiler** (`AGENTS.md` §6). If Drizzle's inferred
   types fight you, fix the model, not the type.
8. **User-facing strings stay Arabic**; identifiers, code, and comments stay English.
   `TRPCError` messages remain Arabic with stable English codes.
9. **Redis may not become a hard boot requirement.** Production should *expect* Redis and
   warn loudly without it, but every Redis read needs a MySQL fallback path. Degrade
   performance, never correctness.
10. **Add a test when you change behaviour.** Colocated `*.test.ts`, Vitest.

---

## 5. Phased work plan

Each phase lists tasks, the primary files, and the **acceptance gate**. Do not proceed past
a gate you cannot demonstrate.

### P0 — Baseline and instrumentation *(no behaviour change)*

**Tasks**
- Add a script (`npm run db:report`) that queries `information_schema.TABLES` and
  `information_schema.STATISTICS` and emits per table: row count, data size, index size,
  index count, and the per-index size breakdown.
- Add threshold-based slow-query logging behind an env flag.
- Assign a **class (A–G)** to all 52 tables in `db/schema.ts` and record it in code.
- Write `docs/STORAGE_BASELINE.md` with the real measured numbers and the ten slowest
  endpoints you can identify.

**Gate:** the baseline document exists and contains measured numbers, not estimates. Every
table has a class. `npm run check` and `npm run test` pass.

---

### P1 — Authentication hot path *(highest ROI, low risk)*

**Tasks:** §3.4 in full — token hashing, Redis session cache, `authver` invalidation,
subscription expiry moved to a daily cron, MySQL fallback preserved.

**Files:** `api/lib/session-validation.ts`, `api/context.ts`, `api/auth-router.ts`,
`api/local-auth-router.ts`, `api/session-router.ts`, `api/webauthn-router.ts`,
`db/schema.ts`, a new migration.

**Gate:**
- An authenticated request with a warm cache issues **zero** MySQL queries for auth. Prove it
  with a query counter or log.
- Logout invalidates access **immediately** — automated test.
- Plan upgrade is reflected within one request — automated test.
- Both `oauth` and `local` paths covered by tests.
- With Redis unavailable, every auth test still passes (slower).

---

### P2 — Cache and rate limiting

**Tasks:** §3.5 and §3.6 — generation-counter invalidation, remove `SCAN` from write paths,
Redis-backed rate limiting with a Lua script, namespaced in-process fallback.

**Files:** `api/lib/redis-client.ts`, a new `api/lib/cache-keys.ts`, `api/lib/rate-limit.ts`,
`api/expense-router.ts`, `api/services/finance-semantic-layer/cache.ts`, `api/middleware.ts`.

**Gate:**
- No code path reachable from a request handler calls `deleteCacheByPattern`. Prove by grep.
- Creating an expense triggers exactly one `INCR`, not a scan.
- A rate limit is enforced consistently across two separate processes sharing one Redis —
  demonstrate with a test or a scripted two-process run.
- Existing rate-limit tests still pass.

---

### P3 — The rollup layer *(the core fix)*

**Tasks:** §3.2 and §3.3 — `expense_daily_rollups`, transactional delta maintenance at every
mutation site, the covering index, the chunked backfill migration, nightly reconciliation,
and rewrites of `getMonthSummary`, `getMonthlyStats`, `getYearlyStats`, `loadRowsForPeriod`.

**Files:** `db/schema.ts`, new migration(s), a new `api/services/expense-rollups.ts`,
`api/expense-router.ts`, `api/services/finance-semantic-layer/resolvers.ts`,
`api/sms-router.ts`, `api/image-router.ts`, `api/services/action-runtime/*`, `api/boot.ts`.

**Gate:**
- `getYearlyStats` reads **zero** rows from `expenses`; it reads at most 366 rollup rows.
- `getMonthlyStats` computes totals and trends from rollups, and the category breakdown from
  a SQL `GROUP BY` — no `SELECT *`, no `.reduce()` over raw rows.
- **Numerical equivalence test:** on a seeded fixture covering multiple months, multiple
  categories, a custom salary day, business and personal expenses, and at least one edit and
  one delete, the new implementation returns values identical to the old one to the last
  piastre. This test is mandatory and must be committed.
- Reconciliation job detects and repairs an artificially introduced drift — tested.
- Every expense mutation path updates rollups; demonstrate coverage explicitly, path by path.

---

### P4 — Retention and lifecycle

**Tasks:** §3.7 and §3.8 — the declarative retention job, the `ai_cost_monthly` and
`ad_stats_daily` rollups, chunked deletes, dry-run mode, the class-coverage test, and wiring
every missing cron including `runMonthlyReportJob`.

**Files:** new `api/jobs/data-retention-job.ts`, `api/boot.ts`, `db/schema.ts`, migration.

**Gate:**
- Every table has an explicit policy, including `"forever"`.
- Dry-run mode reports counts and deletes nothing.
- Deletes are chunked; no statement exceeds a bounded row count.
- `runMonthlyReportJob` and the behaviour-snapshot job are registered and idempotent —
  running twice produces the same state.
- A test fails if a new table is added to `db/schema.ts` without a class.

---

### P5 — Storage diet

**Tasks:** §3.3 (index removal, with proof), §3.9 (`expense_details` split), §3.10 (ENUM
conversion), §3.11 (vector quantization).

**Gate:**
- `npm run db:report` shows measured before/after sizes for `expenses`, its indexes, and
  `ai_memory_embeddings`. Report the actual numbers.
- Every dropped index is justified with evidence in the report.
- No column drop happens in the same migration as its replacement's creation.
- `npm run check` passes with no `any` casts introduced by the ENUM change.

---

### P6 — Referential integrity *(gated, highest risk — see §3.12)*

Attempt only after P0–P5 are committed and verified. Stopping at step 3 with a clear
explanation is an acceptable outcome.

**Gate:** zero orphan rows across all child tables — prove with a verification query per
table. `user-purge-service.ts` behaviour is unchanged or simplified, with tests.

---

### P7 — Object storage *(independent; can run in parallel with P4/P5)*

**Tasks:** §3.13.

**Gate:** development works with no cloud credentials. Avatar upload produces a WebP
≤ 30 KB. No secret is committed.

---

### P8 — Observability

**Tasks:** §3.15 and §3.16 — slow query logging, cache hit-rate and pool metrics on the admin
surface, per-phase before/after measurements consolidated.

**Gate:** the admin surface shows cache hit rate, Redis backend, and pool utilisation. The
final report contains before/after numbers for each phase.

---

## 6. Migration policy

1. Every schema change ships as a **generated Drizzle migration** in `db/migrations/`
   (`npm run db:generate`). Never ship a change made only with `db:push`.
2. Every migration file gets a header comment stating: what it does, whether it is reversible,
   and the rollback procedure.
3. Additive → backfill → verify → switch reads → (separate migration) remove. Never collapse
   these steps.
4. Backfills over large tables run in bounded chunks, never one statement.
5. Any migration that could take more than a few seconds on a large table must say so in its
   header, with an estimate and a note on lock behaviour.
6. If a migration is not safely reversible, say so explicitly and describe the forward-fix.

---

## 7. Verification protocol

After **every** phase:

```bash
npm run check
npm run lint
npm run test
```

Plus, for the phase you just finished:

- Run the tests you added, named, and paste the output into the report.
- Re-run `npm run db:report` and record the deltas.
- Manually exercise both an `oauth` user and a `local` user through the affected paths.

Before declaring the whole job done:

```bash
npm run test:all
```

**Report failures honestly.** If a test fails, say so and paste the output. A report claiming
success that a reviewer disproves in thirty seconds is worse than a report that says
"P5 incomplete: the ENUM migration broke three type assertions I could not resolve without
widening a type, so I stopped." The second is useful engineering. The first is not.

---

## 8. The report you must produce

Write `docs/STORAGE_OVERHAUL_REPORT.md`. It will be read by a reviewer who has independently
audited this codebase and knows the current state in detail. Structure it exactly as follows:

1. **Executive summary** — what changed, in ten lines or fewer.
2. **Phase-by-phase**, for each of P0–P8:
   - Status: `COMPLETE` / `PARTIAL` / `SKIPPED` / `BLOCKED`
   - What you changed, with file paths and a short rationale.
   - The acceptance gate, and **the concrete evidence** it was met (test names, command
     output, measured numbers). Not "verified" — the actual evidence.
   - What you deliberately did **not** do, and why.
3. **Measured results** — a table of before/after for: table sizes, index sizes, query counts
   per authenticated request, `getMonthlyStats` / `getYearlyStats` row counts and latency,
   embedding storage size, and cache invalidation cost.
4. **Discrepancies** — every place where Section 2 of this brief was wrong about the codebase.
   This section is important; do not leave it empty out of politeness. If everything matched,
   say that explicitly.
5. **Risks and known gaps** — what is now fragile, what is untested, what you would do next.
6. **Migration inventory** — every migration added, what it does, whether it is reversible,
   and its expected runtime on a large table.
7. **Rollback plan** — how to revert this work, in order.

---

## 9. Prohibited actions

- **Do not** change the database engine, add PostgreSQL, MongoDB, ClickHouse, or a message
  queue. The fix is proper use of MySQL and Redis, not new infrastructure.
- **Do not** rewrite the AI classification pipeline, the NLP layer, or the prompt engineering.
  They are out of scope. You may change *how their data is stored and retrieved*; you may not
  change *what they decide*.
- **Do not** modify `.agents/`, `.opencode/`, `photos/`, `scratch/`, root-level `*.png`,
  `*.jsonl`, or root-level `*_REPORT.md` files. `AGENTS.md` §3 lists these as ignored.
- **Do not** weaken authentication or authorization anywhere. Caching a permission check is
  fine; skipping one is not.
- **Do not** change bcrypt cost, replace bcrypt, or touch password handling. It is correct.
- **Do not** delete user financial data. Not in a migration, not in a retention job, not
  "temporarily". `expenses` is class B: **forever**.
- **Do not** commit secrets, connection strings, or API keys.
- **Do not** use `db:push` for a shippable change.
- **Do not** widen types, add `any`, or add `@ts-ignore` to get `npm run check` to pass.
- **Do not** mark a phase complete without the evidence its gate requires.
- **Do not** silently reduce scope. If something cannot be done, finish everything else and
  say clearly what was left and why.

---

## 10. Priority, if you must choose

If time or risk forces a reduction, this is the order of value:

1. **P3** (rollups) — fixes the core defect; the largest user-visible speed win.
2. **P1** (auth hot path) — the largest constant-load reduction on the database.
3. **P4** (retention) — stops unbounded storage growth; the largest cost win.
4. **P2** (cache/rate limit) — removes an O(keyspace) operation from every write.
5. **P5** (storage diet) — meaningful size reduction, moderate risk.
6. **P8** (observability) — makes everything above provable.
7. **P7** (object storage) — enables future features; not urgent.
8. **P6** (identity/FK) — the biggest architectural improvement and the biggest risk. Last.

Four out of eight phases done properly, measured, and honestly reported beats eight phases
done hastily. Build it as if you will be the one maintaining it.
