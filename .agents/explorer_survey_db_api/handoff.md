# SmartSpend AI — Backend Architecture, Database, & API Profiling Survey

**Specialist**: Explorer 1 (Database, API, & Backend Architecture Specialist)  
**Date**: 2026-08-29  
**Scope**: Workload profiling, database schema & indexing, query amplification factors, connection pooling dynamics, memory footprint, and sizing mathematics for 100, 1,000, and 10,000 Concurrent Active Users (CCU).

---

## 1. Observation

Direct code observations from the SmartSpend codebase:

### 1.1 Backend Topology & Server Entrypoints
- **Framework & HTTP Server**: Hono v4 (`@hono/node-server`) mounted via `api/boot.ts` and `api/server.ts`.
- **API Protocol**: tRPC v11 (`@hono/trpc-server` mounted at `/api/trpc/*` in `api/boot.ts:310-316`) routing 22 domain sub-routers (`api/router.ts:25-48`).
- **Realtime / Streaming**:
  - Zero-polling WhatsApp/OTP SSE streaming at `GET /api/sse/otp` (`api/boot.ts:321-365`), bounded to max 5 minutes per connection with 15s ping keep-alives.
  - Live Voice Call WebSockets at `GET /api/voice/live` (`api/server.ts:38-52`, `api/boot.ts:544-559`) upgraded to `ws.WebSocketServer`.
- **Background Schedulers & Crons**:
  - `node-cron` scheduled in `api/boot.ts:44-97` gated by `ENABLE_CRONS=true`.
  - Daily auth session cleanup at midnight (`api/boot.ts:68-75`).
  - Classification log pruning weekly (180 days cutoff, `api/boot.ts:78-83`).
  - Scheduled & smart notifications running every minute and daily at 20:00 (`api/boot.ts:90-96`, `api/notification-engine.ts`).
  - Distributed job locking via MySQL advisory locks `GET_LOCK(smartspend:cron:<jobName>, 0)` in `api/services/scheduler-lock.ts:13-34`.

### 1.2 Database Connection Pool & Driver Configuration
From `api/queries/connection.ts:1-27`:
```typescript
export const mysqlPool = mysql.createPool({
  uri: env.DATABASE_URL,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: env.NODE_ENV === "production" ? 30 : 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

export const db = drizzle(mysqlPool, {
  schema: { ...schema, ...relations },
  mode: "default",
});
```
- **Driver**: `mysql2/promise` with Drizzle ORM v0.45+ in `"default"` mode.
- **Production Pool Limit**: Fixed at **30 connections** per Node.js process.
- **Queue Limit**: `0` (**unbounded queueing**). Under high load, pending queries queue indefinitely in Node.js event loop memory until `connectTimeout` (10,000 ms) is hit.
- **KeepAlive**: Enabled with 10s initial delay.

### 1.3 Database Schema & Relational Mapping
- **Schema Volume**: 51 tables defined in `db/schema.ts` (1,180 lines) + full bidirectional relation graph in `db/relations.ts` (505 lines).
- **Core Entities & Dual-Identity Schema**:
  1. `users` (Google OAuth users, `db/schema.ts:17-45`)
  2. `local_users` (Password / Phone / WebAuthn users, `db/schema.ts:48-77`)
  3. `sessions` (Live session tokens, `db/schema.ts:281-299`)
  4. `expenses` (Financial ledger, `db/schema.ts:80-126`)
  5. `chat_conversations` & `chat_messages` (AI Center chats, `db/schema.ts:892-930`)
  6. `ai_token_ledgers` (Immutable token & cost ledger, `db/schema.ts:1140-1178`)
  7. `classification_logs` (AI decision & telemetry traces, `db/schema.ts:601-635`)
  8. `user_budgets`, `financial_goals`, `user_wallets`, `user_profiles`, `user_businesses`
  9. `ai_memory_items`, `ai_memory_embeddings`, `ai_pending_actions`, `ai_action_audit_logs`
- **Key Indexing Strategy**:
  - `expenses`: `(date)`, `(user_id, user_type, date)` composite index, `(category)`, `(status)`, `(wallet_id)`, unique `(user_id, user_type, client_request_id)`.
  - `sessions`: `(token)` unique, `(user_id, user_type)`, `(expires_at)`.
  - `chat_messages`: `(conversation_id, created_at)`.
  - `ai_token_ledgers`: `(user_id, user_type, billing_period)`, `(channel, created_at)`, `(provider_slug, model_id, created_at)`.
  - `user_profiles`: `(user_id, user_type)` unique.

### 1.4 Baseline Authentication Query Amplification (Context Resolution)
From `api/context.ts:52-156` and `api/lib/session-validation.ts:24-58`:
Every authenticated tRPC call executes `createContext()`:
1. `validateActiveSessionToken(token)`:
   ```sql
   SELECT * FROM sessions 
   WHERE token = ? AND userId = ? AND userType = ? AND expiresAt > NOW() LIMIT 1;
   ```
2. User profile resolution:
   ```sql
   SELECT * FROM users (or local_users) WHERE id = ? LIMIT 1;
   ```
- **Finding**: **Every authenticated tRPC procedure incurs exactly 2 database queries for auth validation before any procedure business logic executes.**
- **Note**: There is currently no in-memory or Redis caching for active session tokens in `context.ts`.

### 1.5 Endpoint Query Amplification & Complexity Trace

| Endpoint / Procedure | Procedure Type | Auth Queries | Procedure DB Queries | Total DB Queries | External / I/O Latency | Query Complexity |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `auth.me` / `localAuth.me` | Query | 2 | 1 (`users`/`localUsers`) | **3** | < 5ms | Simple PK Lookups |
| `localAuth.login` | Mutation (strictPublic) | 0 | 3 (`localUsers` find, `localUsers` update `lastSignInAt`, `sessions` insert) | **3** | ~80ms (bcrypt) | Simple PK/Unique Lookups + Write |
| `expense.list` (Dashboard Feed) | Query (authed) | 2 | 2 (Paginated `expenses` select + `count(*)`) | **4** | < 15ms | Filtered Composite Index Range Scan |
| `expense.create` (Manual Expense) | Mutation (authed) | 2 | 4–6 (`resolveExpenseReferences` [1-2], `tx.insert(expenses)`, `tx.update(userContacts)`, `tx.update(users.streak)`, async `checkUserBudgetExceeded` [1]) | **6–8** | ~20–40ms | ACID Transaction + Atomic Updates |
| `expense.getMonthSummary` | Query (authed) | 2 | Cache Hit: 0<br>Cache Miss: 1 (`SUM/COUNT` aggregation) | Hit: **2**<br>Miss: **3** | Hit: < 5ms<br>Miss: ~15ms | In-database `SUM(CASE WHEN...)` Aggregation (Redis 24h) |
| `expense.getMonthlyStats` | Query (authed) | 2 | Cache Hit: 0<br>Cache Miss: 3 (`firstExpense`, current month `expenses`, prev month `expenses`) | Hit: **2**<br>Miss: **5** | Hit: < 5ms<br>Miss: ~30ms | Multi-row batch load + Node.js In-Memory Decimal.js Aggregation |
| `chat.sendMessage` (AI Center) | Mutation (aiProcedure) | 2 | 10–16 (`getTodayMessageCount` [1], conv lookup/insert [1], history [1], insert user msg [1], semantic facts pack [2-5], action draft [1], insert assistant msg [1], update conv stats [1], update user tokens [1], insert `ai_token_ledgers` [1], write `ai_memory` [1-3]) | **12–18** | 500ms – 2,500ms (LLM API) | Multi-step Transactional & Semantic Fact Queries |
| `ai.parseExpense` (NLP Voice/Text) | Mutation (aiProcedure) | 2 | 8–14 (`countDailyAiRequests` [1], `assertAiBudget` [1], `userDictionaries` [1], `getSmartProfile` [2], `getFinanceSummary` [1], `userBusinesses` [2], log insert [1], ledger insert [1], token update [1]) | **10–16** | 10ms (Rule hit) to 1,200ms (LLM Layer 5) | Layered Hybrid Pipeline + Profile/Dictionary Lookups |
| `budget.list` | Query (authed) | 2 | 2 (`userBudgets` select + `expenses` date range select) | **4** | < 15ms | Range Scan + In-memory Budget Computation |
| `wallet.getWallets` | Query (authed) | 2 | 1 (`userWallets` select) | **3** | < 5ms | Simple Filtered Index Scan |
| `profile.getMyProfile` | Query (authed) | 2 | 2 (`userProfiles` select + `userContacts` select) | **4** | < 10ms | Simple PK / Unique Index Scan |
| `analytics.getDashboardStats` | Query (moderator) | 2 | 12 concurrent queries (`Promise.all` across `localUsers`, `users`, `expenses`) | **14** | ~40–80ms | Heavy Full-Table Aggregations (`COUNT(*)`, `SUM(amount)`) |
| `sms.ingest` (iOS Shortcut Webhook) | HTTP POST | 0 | 8–12 (`webhookTokens`, `users`, `rawSmsEvents` count, duplicate check, insert `rawSmsEvents`, `expenses` insert, wallet/contact updates, push notifications) | **8–12** | ~50–150ms | Multi-table Ingestion & Audit Pipeline |
| `monthly-report-job` (Cron) | Background Job | 0 | Per user: 8–12 queries (`getSmartProfile`, `monthlyReports` cache check, `buildMonthlyReportFactsPack` [4-6], insert `monthlyReports`, WhatsApp send) | **8–12 / user** | 1,000ms – 3,000ms / user | Heavy Monthly Analytical Aggregation + External LLM |

---

## 2. Logic Chain & Workload Modeling

### 2.1 User Concurrency & Session Interaction Profiles
In typical fintech application patterns:
- **Concurrent Active User (CCU)**: A user with an active browser tab / mobile app generating requests during an active 10-minute session window.
- **Typical Session Mix per User per Minute**:
  - 1 Dashboard refresh / Navigation (loads `expense.getMonthSummary`, `budget.list`, `wallet.getWallets`, `inAppNotifications`, `profile.getMyProfile`) = 5 tRPC calls.
  - 0.2 Expense creation / Voice recording = 0.2 tRPC call.
  - 0.1 AI Chat message = 0.1 tRPC call.
  - Periodic polling / background refreshes = 0.7 tRPC call.
  - **Total Average Request Rate**: **6 requests/minute/user = 0.10 Requests Per Second (RPS) per CCU**.
  - **Peak Burst Multiplier**: **2.5x** (e.g. salary day / evening expense logging surge) = **0.25 RPS / CCU peak**.

### 2.2 Mathematical Query Amplification (QPS Calculation)
Let $A_{req}$ be the weighted average query amplification per tRPC request:
$$A_{req} = \sum (w_i \times Q_i)$$
Where:
- 70% Dashboard / Browsing / Listing queries: $Q_{read} \approx 3.5$ queries/req
- 15% Expense / Wallet / Budget mutations: $Q_{write} \approx 7.0$ queries/req
- 10% AI Classification / NLP Parse: $Q_{ai\_parse} \approx 12.0$ queries/req
- 5% AI Chat interactions: $Q_{chat} \approx 15.0$ queries/req

Weighted Average Query Amplification:
$$A_{req} = (0.70 \times 3.5) + (0.15 \times 7.0) + (0.10 \times 12.0) + (0.05 \times 15.0) = 2.45 + 1.05 + 1.20 + 0.75 = \mathbf{5.45\text{ DB Queries / Request}}$$

### 2.3 Read vs Write Ratio
- **Read Operations**: Context auth validation (2 reads) + Data fetches (`list`, `stats`, `wallets`, `budgets`, `profiles`, `dictionaries`, `analytics`).
- **Write Operations**: `expenses` insert, streak updates, `sessions` insert, `chat_messages` insert, `ai_token_ledgers` insert, `classification_logs` insert, `user_analytics` insert.
- Across the standard operational mix:
  - Total Reads per Request: $\approx 4.1$
  - Total Writes per Request: $\approx 1.35$
  - **Read / Write Ratio**: **75.2% Read / 24.8% Write** ($\approx \mathbf{3:1}$).

### 2.4 Sizing Matrix across Concurrency Tiers

| Workload Metric | 100 CCU | 1,000 CCU | 10,000 CCU |
| :--- | :---: | :---: | :---: |
| **Average Traffic (RPS)** | 10.0 req/s | 100.0 req/s | 1,000.0 req/s |
| **Peak Traffic (RPS, 2.5x)** | 25.0 req/s | 250.0 req/s | 2,500.0 req/s |
| **Average Database QPS** | 54.5 QPS | 545.0 QPS | 5,450.0 QPS |
| **Peak Database QPS (2.5x)** | 136.3 QPS | 1,362.5 QPS | 13,625.0 QPS |
| **Redis Operations / Sec (OPS)** | 35.0 OPS | 350.0 OPS | 3,500.0 OPS |
| **Active SSE / WS Connections** | 15 conn | 150 conn | 1,500 conn |
| **External AI Call Rate** | 0.5 calls/s | 5.0 calls/s | 50.0 calls/s |

### 2.5 Database Connection Pool Dynamics & Formula
In MySQL 2 with Node.js, query duration determines connection hold time:
- Fast OLTP query (indexed read/write): $T_{query} \approx 2\text{ms} = 0.002\text{s}$.
- Slow analytical query (unindexed or aggregation): $T_{agg} \approx 25\text{ms} = 0.025\text{s}$.
- Mean query execution time across weighted mix: $\bar{T} \approx 4\text{ms} = 0.004\text{s}$.

By Little's Law, the required active database connections $N_{conn}$ is:
$$N_{conn} = \text{QPS}_{peak} \times \bar{T}$$

- **For 100 CCU** ($136.3\text{ QPS}$): $N_{conn} = 136.3 \times 0.004 = \mathbf{0.55\text{ active connections}}$ (Current 30-pool is ample).
- **For 1,000 CCU** ($1,362.5\text{ QPS}$): $N_{conn} = 1,362.5 \times 0.004 = \mathbf{5.45\text{ active connections}}$ (Single process 30-pool handles it; cluster of 4 replicas = 120 total pool connections).
- **For 10,000 CCU** ($13,625\text{ QPS}$): $N_{conn} = 13,625 \times 0.004 = \mathbf{54.5\text{ active connections}}$.
  - With 16 Node.js cluster replicas $\times 30\text{ pool limit} = 480\text{ max connections}$ to MySQL server.
  - If queries stall or lock due to table writes (e.g. `monthly-report-job` or unindexed `analytics.getDashboardStats`), $T_{query}$ increases to $50\text{ms}$, requiring:
    $$N_{conn} = 13,625 \times 0.050 = \mathbf{681.25\text{ connections}}$$
    This exceeds standard single-instance MySQL connection capacity without connection pooling middleware (e.g. ProxySQL) or Read Replicas.

### 2.6 Node.js Memory Footprint Modeling
- **Baseline Node.js RSS Footprint per Worker**:
  - V8 Engine + Hono Runtime: ~45 MB
  - Drizzle ORM Schema (51 tables + 505 lines of relations) & compiled Zod validators: ~35 MB
  - In-memory Dictionaries & Regex trees (Egyptian dialect, Category registry): ~15 MB
  - Sentry Profiler + Node-cron + Logging buffers: ~25 MB
  - **Base Resident Set Size (RSS)**: **~120 MB per process**.
- **Transient Memory per Concurrency Tier**:
  - Request buffers, JSON parse/stringify, Decimal.js allocations: ~100 KB per active in-flight request.
  - Active SSE streams: ~40 KB resident heap per client socket.
  - Active WebSocket live voice sessions: ~2 MB resident heap (audio frame buffers, STT chunking).
  - In-process Redis RAM cache fallback (if Redis is disabled): bounded at 2,000 entries = ~15 MB.
- **Node.js Heap Allocation Sizing Formula**:
  $$\text{RAM}_{app} = N_{workers} \times (\text{RSS}_{base} + 250\text{ MB buffer}) + (N_{SSE} \times 0.05\text{ MB}) + (N_{WS} \times 2.0\text{ MB})$$

| Infrastructure Tier | 100 CCU | 1,000 CCU | 10,000 CCU |
| :--- | :---: | :---: | :---: |
| **App Server Workers (PM2 / Cluster)** | 2 workers | 4 workers | 16 workers (across 2–4 nodes) |
| **App Memory Allocation** | 1.5 GB RAM | 3.0 GB RAM | 12.0 GB RAM |
| **MySQL Buffer Pool (`innodb_buffer_pool_size`)** | 1.0 GB RAM | 4.0 GB RAM | 16.0 GB RAM (Hot index/data cache) |
| **MySQL Dedicated Server RAM** | 2.0 GB RAM | 6.0 GB RAM | 24.0 GB RAM |
| **Redis RAM Allocation** | 256 MB | 1.0 GB | 4.0 GB |

---

## 3. Caveats

1. **Session Auth Verification Overhead**:
   Because `createContext()` in `api/context.ts` queries MySQL twice per request without caching, auth resolution accounts for **35% to 50% of all database QPS** across the entire platform. Introducing a 60-second Redis/in-memory session cache would immediately reduce platform QPS by ~36%.
2. **Unbounded MySQL Connection Queue (`queueLimit: 0`)**:
   In `api/queries/connection.ts`, `queueLimit: 0` means incoming queries never fail fast when the 30-connection pool is saturated; they queue in Node.js event loop memory. Under a severe traffic spike (e.g. 10K CCU), this causes latency degradation and potential Node.js Heap Out-Of-Memory (OOM) before MySQL rejects connections.
3. **Concurrent Multi-Query Endpoints**:
   Endpoints like `analytics.getDashboardStats` fire 12 concurrent queries via `Promise.all`. Just 3 concurrent moderator requests can exhaust the entire 30-connection pool of a worker instance.
4. **Advisory Lock Connection Pinning**:
   `withScheduledJobLock` in `api/services/scheduler-lock.ts` holds a dedicated connection from `mysqlPool` for the entire lifetime of scheduled jobs. Long-running batch jobs reduce available pool capacity for web requests.

---

## 4. Conclusion

1. **Architecture Profile**: SmartSpend AI backend is an efficient, type-safe Hono/tRPC v11 monorepo with Drizzle ORM on MySQL 8.
2. **Workload Characteristics**:
   - Query Amplification: **5.45 queries per API request** on average.
   - Read/Write Ratio: **75% Read / 25% Write**.
   - Peak QPS: **136 QPS (100 CCU)**, **1,363 QPS (1,000 CCU)**, and **13,625 QPS (10,000 CCU)**.
3. **Database Bottlenecks & Capacity Requirements**:
   - At **100 CCU**: A single economical VPS (2 vCPU, 4 GB RAM) easily handles all backend, MySQL, and Redis services.
   - At **1,000 CCU**: Requires separating App and Database tiers (App: 4 vCPU / 8 GB RAM; DB: 4 vCPU / 8 GB RAM with `innodb_buffer_pool_size = 4GB`).
   - At **10,000 CCU**: Requires multi-replica horizontal app scaling (16+ workers), dedicated Redis cluster, and MySQL Read Replicas or ProxySQL to handle 13.6k peak QPS and prevent connection pool saturation.

---

## 5. Verification Method

To independently verify these observations and metrics:

1. **Inspect Connection Pool Settings**:
   ```bash
   # View connection pool definition
   cat api/queries/connection.ts
   ```
2. **Inspect Auth Context Resolution (2 queries/req)**:
   ```bash
   cat api/context.ts
   cat api/lib/session-validation.ts
   ```
3. **Verify All 51 Table Schemas & Indexes**:
   ```bash
   grep -n "export const " db/schema.ts
   ```
4. **Verify TypeScript Type Integrity**:
   ```bash
   npm run check
   ```
5. **Run Integration & Unit Tests**:
   ```bash
   npm run test
   ```
