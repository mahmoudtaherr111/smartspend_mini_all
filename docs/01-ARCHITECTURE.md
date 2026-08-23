# SmartSpend AI — System Architecture & Monorepo Structure

> **AI AGENT SSOT:** This document defines the monorepo folder hierarchy, request lifecycles, and backend execution parameters.

---

## 1. 📂 Repository Folder Structure & Scopes

| Directory / File | Type | Target AI Scope & Purpose |
| :--- | :--- | :--- |
| [`AGENTS.md`](file:///e:/smartspend_V1_fixed/AGENTS.md) | File | **Onboarding Entrypoint.** Master rules, constraints, and gotchas. Read first. |
| [`docs/`](file:///e:/smartspend_V1_fixed/docs/) | Dir | **Domain References.** 9 scoped architecture, DB schema, AI, and API documents. |
| [`contracts/`](file:///e:/smartspend_V1_fixed/contracts/) | Dir | **Shared Contracts.** TypeScript definitions, standard error tags, and limits. |
| [`db/`](file:///e:/smartspend_V1_fixed/db/) | Dir | **Database Layer.** Schema definitions (`schema.ts`), 100% relations (`relations.ts`), migrations. |
| [`api/`](file:///e:/smartspend_V1_fixed/api/) | Dir | **Backend Hono Server.** Routers, middleware, AI classification, settings cache, services. |
| [`scripts/`](file:///e:/smartspend_V1_fixed/scripts/) | Dir | **Ops & Testing Utilities.** AI provider validators, benchmarks, and backfill scripts. |
| [`src/`](file:///e:/smartspend_V1_fixed/src/) | Dir | **Frontend React SPA.** Vite app, page components, and tRPC hooks. |
| [`android-app/`](file:///e:/smartspend_V1_fixed/android-app/) | Dir | **Android companion.** Native source code for bank SMS capture. |
| [`ios/`](file:///e:/smartspend_V1_fixed/ios/) | Dir | **iOS companion.** Configuration and native push notification listeners. |

---

## 2. 🔄 Request Lifecycle & Pipeline Flow

| Stage | Path / Component | Core Actions Taken |
| :--- | :--- | :--- |
| **1. UI Trigger** | [`src/pages/`](file:///e:/smartspend_V1_fixed/src/pages/) | Component triggers mutation/query via tRPC React Query client hook. |
| **2. Routing** | [`api/boot.ts`](file:///e:/smartspend_V1_fixed/api/boot.ts) | Request enters Hono app on `/api/trpc/*`. |
| **3. Context** | [`api/context.ts`](file:///e:/smartspend_V1_fixed/api/context.ts) | Resolves user identity from cookie (`google_session`) or `Bearer` token. |
| **4. Middleware**| [`api/middleware.ts`](file:///e:/smartspend_V1_fixed/api/middleware.ts) | Evaluates rate limits and roles (`moderator`, `admin`, `pro`, `ultra`). |
| **5. Sub-Router**| [`api/router.ts`](file:///e:/smartspend_V1_fixed/api/router.ts) | Delegates payload to specific domain router (`expense`, `ai`, `chat`). |
| **6. Execution** | [`api/services/`](file:///e:/smartspend_V1_fixed/api/services/) | Executes business logic, resolves contacts, or runs AI classifiers. |
| **7. Persistence**| [`db/schema.ts`](file:///e:/smartspend_V1_fixed/db/schema.ts) | Queries/mutates MySQL database via Drizzle ORM (wrapped in `db.transaction()` for financial writes). |
| **8. Response**   | Frontend Client | Returns typed JSON payload, automatically updating React Query cache. |

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Non-Blocking Embedding Warmup (`api/boot.ts`)
* **Rule:** Never prepend `await` to `warmupEmbeddingEngine()` in `boot.ts`.
* **Reason:** Vector index building (local descriptor map + Fireworks embedding cache) takes 10–30 seconds. Synchronous awaiting blocks server start.

### B. Redis Non-Blocking Invalidation & In-Memory Fallback (`api/lib/redis-client.ts`)
* **Rule:** Pattern-based cache deletion uses `client.scanIterator({ MATCH: pattern, COUNT: 100 })` rather than blocking `client.keys()`.
* **Reason:** In production, `KEYS *` blocks the single-threaded Redis event loop. `scanIterator` streams keys safely without latency spikes. If Redis is unavailable, the system automatically falls back to an in-process LRU cache.

### C. In-Memory System Settings Cache (`api/lib/settings-cache.ts`)
* **Rule:** All `system_settings` reads must go through `getSystemSettings()`.
* **Reason:** Avoids 24+ duplicate SQL queries per request. The cache maintains a 5-minute TTL and is invalidated instantly via `invalidateSettingsCache()` when an administrator updates configuration.

### D. CORS & CSRF Tunnel Origins (`api/boot.ts`)
* **Rule:** Do not restrict CORS/CSRF to localhost in development.
* **Reason:** Webhook captures from external simulators (Paymob, WhatsApp) require proxy tunnels (`.loca.lt`, `.serveousercontent.com`, `.lhr.life`). These are whitelisted under `NODE_ENV === "development"`.

### E. Single Page Application (SPA) Fallback (`api/boot.ts`)
* **Rule:** Do not remove the Hono `app.notFound()` index redirect handler in production.
* **Reason:** Any HTTP GET request that is not prefix-matched by `/api/` must return `dist/public/index.html` to allow React Router client-side path refreshes.

### F. Cron Job Schedules (`api/boot.ts`)
| Cron Expression | Action / Target | Description |
| :--- | :--- | :--- |
| `0 0 * * *` | `sessions` cleanup | Wipes expired active session tokens at midnight daily. |
| `* * * * *` | `processScheduledNotifications()` | Scans and sends timed notifications and reminders every minute (paginated with `LIMIT 1000`). |
| `0 20 * * *`| `checkAndTriggerSmartActivityNotifications()` | Runs behavior snapshot analysis at 8:00 PM daily. |
| `0 3 * * 0` | `classification_logs` retention | Trims classification audit logs older than 180 days every Sunday at 3:00 AM. |
