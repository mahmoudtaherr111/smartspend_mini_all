# SmartSpend AI — Capacity Planning Survey Report
## AI Pipelines, Realtime Connections, Redis Architecture & Background Workers
**Agent**: Explorer 2 (AI Pipelines, Realtime & Redis Specialist)  
**Date**: 2026-08-29  
**Status**: Complete (Hard Handoff)

---

## 1. Observations

### 1.1 AI Classification Pipeline & Model Infrastructure
* **Universal Model Registry & Mapping (`api/lib/model-mapper.ts`, `api/lib/ai-provider-registry.ts`)**:
  * Shorthands mapped in `api/lib/model-mapper.ts:21-26`: `"flash"` $\rightarrow$ `gemini-3.1-flash-lite`, `"pro"`/`"ultra"` $\rightarrow$ `gemini-3.1-pro`.
  * Verified catalog (`api/lib/ai-provider-registry.ts:47-298`):
    * **Google Gemini**: `gemini-3.1-flash-lite` (Free/Pro classification & chat), `gemini-3.1-pro` (Ultra chat & reports), `gemini-3.5-flash` (Fast fallback & STT), `gemini-2.5-flash-native-audio-latest` (Live WebSockets).
    * **Groq**: `deepseek-r1-distill-llama-70b` (Free reasoning), `llama-3.3-70b-versatile` (Pro/Ultra), `llama-3.1-8b-instant` (Fastest/cheapest), `whisper-large-v3-turbo` (STT).
    * **Fireworks**: `deepseek-v4-flash`, `deepseek-v4-pro`, `qwen3-embedding-8b` (768-dim vector embeddings).
    * **NVIDIA NIM**: `meta/llama-3.2-11b-vision-instruct` (~480ms), `nemotron-3-nano-30b-a3b` (~420ms), `nemotron-3-super-120b-a12b` (~470ms).
* **5-Layer Hybrid Classification Waterfall (`api/lib/smart-pipeline.ts:486-1250`)**:
  * **Layer 1: Muscle Memory Selective Cache** (`smart-pipeline.ts:501-633`, `muscle-memory.ts`):
    * In-memory LRU cache (`max: 5000, ttl: 7 days`) + selective 9-column SQL projection from `classification_logs`.
    * Latency: **<1ms**, Token Cost: **0 tokens ($0.00)**.
  * **Layer 2: Deterministic Rule Engine & Egyptian Slang Dictionary** (`smart-pipeline.ts:635-1103`, `rule-engine.ts`, `egyptian-dictionary.ts`):
    * Normalization via `normalizeV2` (`forRules` vs `forAI`), 200+ Egyptian colloquial terms (`كشري`, `فودافون كاش`, `اوبر`, `كارت فكة`, `جمعبة`).
    * Heuristic narrative decomposition (`decomposeHeuristic`) for compound transactions.
    * Latency: **<2ms**, Token Cost: **0 tokens ($0.00)**. Resolves ~40–60% of recurring user inputs.
  * **Layer 3: Vector Semantic Matching** (`smart-pipeline.ts:1109-1148`, `embedding-engine.ts`):
    * 385 local category descriptors indexed via TF-IDF character n-grams + Fireworks `qwen3-embedding-8b` 768-dim cosine vector search (`matchSegment`).
    * Latency: **10–15ms**, Token Cost: **~1 embedding call ($0.00001)**.
  * **Layer 4: Multi-Intent LLM Decomposition** (`smart-pipeline.ts:1150-1250`, `dynamic-prompt-builder.ts:15-104`):
    * Dynamic taxonomy category pruning via `scoreCategories()` reducing candidate taxonomy size by ~60%.
    * System prompt token size: **~400–800 prompt tokens**; User prompt: **~50–150 tokens**; Total prompt: **~500–1,200 tokens**; Completion: **~100–300 tokens**.
    * Latency: **400ms – 2,500ms** depending on provider (Groq/NVIDIA: ~400–600ms; Gemini Flash-Lite: ~500–800ms; Gemini Pro / DeepSeek R1: ~1,200–2,500ms).
  * **Layer 5: Post-Classifier Local Verifier & Action Runtime** (`smart-pipeline.ts:16`, `post-classifier-verifier.ts`):
    * Bounds validation, duplicate prevention, and two-phase action draft creation (`aiPendingActions` + `idempotencyKey`).
    * Latency: **<5ms**, Token Cost: **0 tokens ($0.00)**.
* **Token Budgets & Cost Policies (`api/services/ai-cost-policy.ts:177-230`)**:
  * `chat`: Free (700 in / 350 out), Pro (1200 in / 600 out), Ultra (1800 in / 900 out), Hard cap (2500 in / 1200 out).
  * `voice`: Free (350 in / 100 out), Pro (550 in / 140 out), Ultra (700 in / 180 out).
  * `report`: Free (1600 in / 900 out), Pro (2600 in / 1600 out), Ultra (3600 in / 2400 out), Hard cap (4200 in / 2600 out).
  * `parse`: Free (650 in / 260 out), Pro (1200 in / 420 out), Ultra (1500 in / 560 out).
* **Universal AI Gateway Non-Blocking Ledger (`api/lib/ai-gateway.ts:509-559`)**:
  * AbortController timeout set to **45,000ms** (`ai-gateway.ts:447`).
  * Ledger auditing is dispatched asynchronously (`void (async () => { await db.insert(aiTokenLedgers)... })()`), ensuring database token recording does not add to client response latency.

---

### 1.2 Redis Architecture & Rate Limiting
* **Redis Client Singleton (`api/lib/redis-client.ts:1-305`)**:
  * Connect timeout: `2,000ms` (`REDIS_CONNECT_TIMEOUT_MS`).
  * Fallback to in-process RAM cache (`Map<string, MemoryCacheEntry>`, `MEMORY_CACHE_MAX_ENTRIES = 2_000`) when `REDIS_URL` is omitted or in development mode (`redis-client.ts:9-87`).
  * Scan-based pattern deletion: `client.scanIterator({ MATCH: pattern, COUNT: 100 })` (`redis-client.ts:210`).
* **Active Redis Cache Usage in SmartSpend**:
  1. `finance-semantic-layer/cache.ts:16-36`: Keys formatted as `finance_ai:schema_v3_<ver>:<userId>:<userType>:<capability>:...`. TTLs: `today` = 60s, `yesterday` = 600s, historical/monthly = 3,600s.
  2. `ai-memory/embedding-client.ts`: Embedding vector cache for user query representations.
  3. `voice-kernel/voice-session-state.ts`: Active live voice call turn state and tool prefetch caching.
* **Rate Limiting Architecture (`api/middleware.ts:9-56`, `api/lib/rate-limit.ts:1-42`)**:
  * `publicProcedure`: `400 req/min/IP`.
  * `strictPublicProcedure`: `25 req/15min/IP`.
  * `authedProcedure`: `100 req/min/user`.
  * `aiProcedure` / `proAiProcedure`: `100 req/min/user`.
  * **Current Implementation**: Uses in-memory `Map<string, { count: number; resetAt: number }>` with a 5-minute unreferenced cleanup timer (`cleanupInterval.unref()`).
  * **Critical Horizontal Scaling Gap**: Because rate limits live in process memory, when scaling to multiple Node.js PM2 workers or Docker replicas, rate limit quotas multiply by the replica count (e.g. 4 replicas allow 400 req/min instead of 100 req/min) unless migrated to Redis `INCR` + `EXPIRE`.
* **System Settings Cache (`api/lib/settings-cache.ts:11-36`)**:
  * In-process memory cache with **5-minute TTL** (`CACHE_TTL_MS = 300,000ms`), invalidated upon admin updates via `invalidateSettingsCache()`.
* **Session Verification Overhead (`api/context.ts:88-150`, `api/lib/session-validation.ts:24-58`)**:
  * On **every** authenticated tRPC procedure request, `createContext()` executes:
    1. Cryptographic JWT verification (`verify(token, env.JWT_SECRET)`).
    2. `db.query.sessions.findFirst(...)` on MySQL `sessions` table.
    3. `db.query.users.findFirst(...)` or `db.query.localUsers.findFirst(...)` on MySQL `users`/`localUsers` table.
  * **Impact**: Generates **2 MySQL SELECT queries per authenticated API request** even for cached data!

---

### 1.3 Realtime Connections & Background Workers
* **SSE Endpoint for Zero-Polling OTP (`api/boot.ts:321-365`)**:
  * Route: `GET /api/sse/otp?phone=...`.
  * Max duration guard: `MAX_SSE_DURATION = 300,000ms` (5 minutes).
  * Keep-alive ping interval: `15,000ms` (`stream.sleep(15000)`).
  * Rate limit: Max 5 concurrent SSE streams per IP per 5 minutes.
  * Event-driven: Subscribes to `otpEvents.on('otp:${phone}', listener)` and cleans up listener on socket abort or timeout.
  * Memory footprint: **~20KB – 50KB per open connection**.
* **Live Voice Call WebSockets (`api/server.ts:38-53`, `api/services/voice-call-service.ts:188-450`)**:
  * Dual WebSocket proxy architecture:
    $$\text{Browser Client} \xleftrightarrow[\text{PCM Audio}]{\text{WebSocket 1}} \text{Node.js Server} \xleftrightarrow[\text{BidiGenerateContent}]{\text{WebSocket 2}} \text{Gemini Live API}$$
  * Streams raw 16-bit PCM audio bidirectionally at 24kHz.
  * Call limits per month: Free (5 min, max 120s/call), Pro (60 min, max 600s/call), Ultra (Unlimited, max 1200s/call).
  * Memory footprint: **~5MB – 15MB per active call** (dual socket buffers, audio streaming pipeline, turn prefetch context).
* **WhatsApp Baileys Worker (`api/services/whatsapp-service.ts:1-150`)**:
  * Engine: `@whiskeysockets/baileys` using filesystem auth credentials in `whatsapp_auth_info/`.
  * Gated by `ENABLE_WHATSAPP="true"`.
  * Memory footprint: **~60MB – 150MB baseline V8 heap** (noise socket protocol, protobuf deserializers, contact state).
  * Operational constraint: Single-process only. Multiple replicas sharing `whatsapp_auth_info/` will corrupt credentials.
* **Cron Jobs & Distributed Locking (`api/boot.ts:44-96`, `api/jobs/monthly-report-job.ts:134-310`, `api/services/scheduler-lock.ts:13-34`)**:
  * Cross-replica lock mechanism: MySQL advisory lock `GET_LOCK('smartspend:cron:<jobName>', 0)` on a dedicated `mysqlPool` connection.
  * `runMonthlyReportJob`:
    * Sequential iteration over all Pro users (`for (const u of [...proOauthUsers, ...proLocalUsers])`).
    * Per user: RAG facts calculation + Fireworks/DeepSeek LLM call (1.0s – 3.0s) + WhatsApp message dispatch.
    * For 1,000 Pro users, runtime is $1000 \times 2.5\text{s} = 2,500\text{s} \approx 41.6\text{ minutes}$.
    * Occupies 1 dedicated MySQL connection holding `GET_LOCK` for the entire 41-minute window.
* **Push Notification Engine (`api/notification-engine.ts:27-100`)**:
  * FCM batching: 500 messages per chunk with 2-second cooldown.
  * Legacy Web Push: 10 messages per chunk with 1-second cooldown to avoid socket pool exhaustion.

---

## 2. Logic Chain & Mathematical Modeling

### 2.1 External AI Latency & Node.js Event Loop Profile
* **Observation**: AI requests wait 500ms – 2,500ms for Gemini/Groq/Fireworks responses via `fetch()` or SDK.
* **Logic**:
  1. In Node.js / `libuv`, HTTP network requests are completely non-blocking asynchronous socket operations. While waiting for external AI responses, the event loop thread is 100% idle and available to process other requests, execute Drizzle queries, and dispatch SSE pings.
  2. Each in-flight AI request holds an open TCP socket and V8 Promise closure ($S_{\text{req}} \approx 150\text{KB} - 350\text{KB}$).
  3. Under peak concurrency, the active memory for in-flight AI requests is:
     $$M_{\text{AI\_inflight}} = N_{\text{concurrent\_AI}} \times S_{\text{req}}$$
  4. CPU time spent on classification before and after the LLM call:
     * Normalization + Slang matching (Layer 2): $\approx 0.5\text{ms} - 1.5\text{ms}$ CPU time.
     * TF-IDF vector cosine matching (Layer 3): $\approx 1.0\text{ms} - 2.5\text{ms}$ CPU time.
     * Dynamic Prompt building & JSON parsing (Layer 4 & 5): $\approx 1.5\text{ms} - 3.0\text{ms}$ CPU time.
     * Total CPU time per classification request: $\approx 3.0\text{ms} - 7.0\text{ms}$.

### 2.2 Concurrency & Workload Mathematical Formulas

| Parameter | Formula / Derivation | Typical Value |
| :--- | :--- | :--- |
| **Total Request Rate ($RPS$)** | $RPS = CCU \times U_{\text{activity}} \times F_{\text{req}}$ | $CCU \times 0.15\text{ req/s}$ |
| **AI Request Rate ($RPS_{\text{AI}}$)** | $RPS_{\text{AI}} = RPS \times P_{\text{AI\_trigger}}$ | $RPS \times 0.08$ |
| **In-Flight Concurrent AI Requests ($C_{\text{AI}}$)** | $C_{\text{AI}} = RPS_{\text{AI}} \times T_{\text{latency\_AI}}$ | $RPS_{\text{AI}} \times 1.5\text{s}$ |
| **Database Queries Per Second ($QPS_{\text{raw}}$)** | $QPS_{\text{raw}} = RPS \times (Q_{\text{auth}} + Q_{\text{business}})$ | $RPS \times (2.0 + 0.8) = 2.8 \times RPS$ |
| **Database QPS with Redis Session Cache ($QPS_{\text{opt}}$)** | $QPS_{\text{opt}} = RPS \times (0.05 + 0.8) = 0.85 \times RPS$ | $\mathbf{70\% \text{ reduction}}$ |
| **Redis Operations Per Second ($OPS_{\text{redis}}$)** | $OPS = RPS \times (O_{\text{rate\_limit}} + O_{\text{session}} + O_{\text{cache}})$ | $RPS \times (1.0 + 1.0 + 0.3) = 2.3 \times RPS$ |
| **Node.js Memory Allocation ($RAM_{\text{node}}$)** | $RAM = M_{\text{base}} + (CCU \times M_{\text{conn}}) + (C_{\text{AI}} \times M_{\text{AI}}) + (N_{\text{voice}} \times M_{\text{voice}})$ | See Tier Breakdown |

---

### 2.3 Comprehensive CCU Capacity Sizing Matrix

#### Tier 1: 100 Concurrent Active Users (CCU)
* **Workload Characteristics**:
  * $RPS$: $100 \times 0.15 = 15\text{ req/sec}$ (Peak: $25\text{ RPS}$).
  * $RPS_{\text{AI}}$: $15 \times 0.08 = 1.2\text{ AI calls/sec}$.
  * In-Flight AI Concurrency: $1.2 \times 1.5\text{s} = 1.8 \approx \mathbf{2 - 4 \text{ concurrent AI requests}}$.
  * $QPS_{\text{DB}}$: $15 \times 2.8 = \mathbf{42\text{ QPS}}$ (Without Redis session cache) / $\mathbf{13\text{ QPS}}$ (With Redis session cache).
  * $OPS_{\text{Redis}}$: $15 \times 2.3 = \mathbf{35\text{ OPS}}$.
  * SSE OTP Connections: $1 - 3$ concurrent.
  * Live Voice Calls: $0 - 2$ concurrent ($\approx 10\text{MB} - 20\text{MB}$).
* **Resource Requirements**:
  * **App / API Server**: 1 Process / 1 Replica, **1-2 vCPU**, **1 GB RAM** (Node.js Heap: ~250MB, OS: ~400MB).
  * **Redis**: **256 MB RAM**, Standalone, RDB persistence.
  * **MySQL Connection Pool**: `connectionLimit = 10`, `max_connections = 50`.
  * **Network Bandwidth**: $15\text{ RPS} \times 15\text{ KB/req} = 225\text{ KB/s} \approx \mathbf{1.8\text{ Mbps}}$ (Monthly: ~150 GB).

#### Tier 2: 1,000 Concurrent Active Users (CCU)
* **Workload Characteristics**:
  * $RPS$: $1,000 \times 0.15 = 150\text{ req/sec}$ (Peak: $250\text{ RPS}$).
  * $RPS_{\text{AI}}$: $150 \times 0.08 = 12\text{ AI calls/sec}$.
  * In-Flight AI Concurrency: $12 \times 1.5\text{s} = \mathbf{18 - 30 \text{ concurrent AI requests}}$.
  * $QPS_{\text{DB}}$: $150 \times 2.8 = \mathbf{420\text{ QPS}}$ (Raw) $\rightarrow$ $\mathbf{128\text{ QPS}}$ (Optimized with Redis session cache).
  * $OPS_{\text{Redis}}$: $150 \times 2.3 = \mathbf{345\text{ OPS}}$ (Peak: $\approx 600\text{ OPS}$).
  * SSE OTP Connections: $10 - 25$ concurrent ($\approx 1\text{MB}$).
  * Live Voice Calls: $5 - 10$ concurrent ($\approx 50\text{MB} - 100\text{MB}$).
* **Resource Requirements**:
  * **App / API Server**: 2–4 PM2 cluster workers across 1–2 replicas, **2–4 vCPU**, **2–4 GB RAM** (Node.js Heap: ~1.2GB).
  * **Redis**: **512 MB – 1 GB RAM**, Standalone with AOF (everysec) + RDB.
  * **MySQL Connection Pool**: `connectionLimit = 25` per worker, Total DB `max_connections = 150`.
  * **Network Bandwidth**: $150\text{ RPS} \times 15\text{ KB/req} = 2.25\text{ MB/s} \approx \mathbf{18\text{ Mbps}}$ (Monthly: ~1.5 TB).

#### Tier 3: 10,000 Concurrent Active Users (CCU)
* **Workload Characteristics**:
  * $RPS$: $10,000 \times 0.15 = 1,500\text{ req/sec}$ (Peak: $2,500\text{ RPS}$).
  * $RPS_{\text{AI}}$: $1,500 \times 0.08 = 120\text{ AI calls/sec}$.
  * In-Flight AI Concurrency: $120 \times 1.5\text{s} = \mathbf{180 - 300 \text{ concurrent AI requests}}$.
  * In-Flight AI Memory: $250 \times 250\text{KB} \approx \mathbf{62.5\text{ MB}}$.
  * $QPS_{\text{DB}}$: $1,500 \times 2.8 = \mathbf{4,200\text{ QPS}}$ (CRITICAL BOTTLENECK if unmanaged!) $\rightarrow$ $\mathbf{1,275\text{ QPS}}$ (With Redis session caching & read-replicas).
  * $OPS_{\text{Redis}}$: $1,500 \times 2.3 = \mathbf{3,450\text{ OPS}}$ (Peak: $\approx 6,000\text{ OPS}$).
  * SSE OTP Connections: $100 - 250$ concurrent ($\approx 10\text{MB}$).
  * Live Voice Calls: $30 - 60$ concurrent ($\approx 300\text{MB} - 600\text{MB}$).
* **Resource Requirements**:
  * **App / API Server**: 8–16 Node.js workers across 2–4 container replicas behind Nginx/Traefik load balancer, **8–16 vCPU**, **8–16 GB RAM**.
  * **Redis**: **2 GB – 4 GB RAM**, Redis Sentinel or AWS ElastiCache / GCP Memorystore with persistence.
  * **MySQL Database**: Dedicated 8–16 vCPU, 16–32 GB RAM, `innodb_buffer_pool_size = 12GB - 24GB`, NVMe SSD with $\ge 3,000$ IOPS, `max_connections = 400 - 500`. Read replica for analytical & reporting queries.
  * **Upstream AI API Tier**: 120 AI calls/sec $= 7,200\text{ RPM}$. Requires Google Gemini / Groq Enterprise Tier with custom TPM/RPM quota or multi-provider dynamic failover (`api/lib/ai-provider-registry.ts`).
  * **Network Bandwidth**: $1,500\text{ RPS} \times 15\text{ KB/req} = 22.5\text{ MB/s} \approx \mathbf{180\text{ Mbps}}$ (Monthly: ~15 TB).

---

## 3. Caveats

1. **Baileys WhatsApp Persistence**: `@whiskeysockets/baileys` currently stores auth keys in the local directory `whatsapp_auth_info/`. When horizontally scaling the backend to multiple instances/containers, only **one single worker instance** must enable WhatsApp (`ENABLE_WHATSAPP="true"`), or auth keys must be backed by a distributed store (e.g. S3 or MySQL/Redis Baileys adapter).
2. **In-Memory Rate Limiting**: As noted in `api/middleware.ts`, rate limiters (`publicIpLimiter`, `rateLimitMap`, `aiRateLimitMap`) are currently process-local `Map` structures. In a multi-worker cluster, rate limits do not synchronize across processes.
3. **Upstream AI Quotas**: Google Gemini Free/Tier 1 rate limits (15 RPM on free tier, 1,000–2,000 RPM on standard pay-as-you-go) will throttle under 1,000 and 10,000 CCU unless enterprise provisioning or multi-key / multi-provider routing (Groq, Fireworks, NVIDIA NIM) is active.

---

## 4. Conclusion & Actionable Recommendations

1. **Implement Redis Session Caching (`session:<token>`)**:
   * Storing validated session user payloads in Redis with a 10-minute TTL will eliminate 2 MySQL SELECT queries per authenticated API call, slashing MySQL QPS by **60% to 70%** under 1,000 and 10,000 CCU.
2. **Migrate Rate Limiting to Redis**:
   * Replace `api/lib/rate-limit.ts` in-memory `Map` with Redis sliding window or `INCR` + `EXPIRE` keys (`ratelimit:ip:<ip>`, `ratelimit:user:<id>`, `ratelimit:ai:<id>`) for unified enforcement across PM2 / Docker replicas.
3. **Decouple Monthly Report Cron Job via Queue**:
   * Migrate `runMonthlyReportJob` from a 40-minute synchronous `for...of` loop holding a MySQL advisory lock into a background worker queue (e.g. BullMQ on Redis) processing in parallel chunks of 5–10 users with rate pacing.
4. **Deploy Dedicated WhatsApp Worker**:
   * Isolate `whatsappService` into a dedicated single-instance microservice or dedicated worker container to prevent multi-instance filesystem collisions.

---

## 5. Verification Method

To independently verify all findings and measurements in this report:

1. **Inspect AI Model Mapping & Gateway**:
   * Check model definitions: `view_file` on `api/lib/model-mapper.ts` lines 20–37 and `api/lib/ai-provider-registry.ts` lines 47–298.
   * Verify non-blocking async ledger: `view_file` on `api/lib/ai-gateway.ts` lines 508–559.
2. **Inspect Hybrid 5-Layer Classification**:
   * Check waterfall layers: `view_file` on `api/lib/smart-pipeline.ts` lines 486–1250.
   * Verify dynamic prompt token reduction: `view_file` on `api/lib/dynamic-prompt-builder.ts` lines 25–104.
3. **Inspect Redis & Rate Limiting**:
   * Check in-memory rate limiting implementation: `view_file` on `api/middleware.ts` lines 28–56 and `api/lib/rate-limit.ts` lines 10–41.
   * Check Redis wrapper and fallback: `view_file` on `api/lib/redis-client.ts` lines 9–87.
   * Check session database query count: `view_file` on `api/context.ts` lines 88–150 and `api/lib/session-validation.ts` lines 24–58.
4. **Inspect Realtime, SSE & WebSockets**:
   * Check SSE OTP 5-minute timeout and keep-alive: `view_file` on `api/boot.ts` lines 321–365.
   * Check Live Voice dual WebSocket proxy: `view_file` on `api/services/voice-call-service.ts` lines 188–450.
   * Check MySQL advisory lock in cron jobs: `view_file` on `api/services/scheduler-lock.ts` lines 13–34 and `api/jobs/monthly-report-job.ts` lines 134–310.
5. **Run Test Suites**:
   * Execute unit tests for classification, model mapper, and Redis client: `npm test` or `npx vitest run api/lib/model-mapper.test.ts api/lib/redis-client.test.ts`.
