# SmartSpend AI — System Architecture & Monorepo Structure

> **AI AGENT SSOT:** This document defines the monorepo folder hierarchy, request lifecycles, and backend execution parameters.

---

## 1. 📂 Repository Folder Structure & Scopes

| Directory / File | Type | Target AI Scope & Purpose |
| :--- | :--- | :--- |
| [`AGENTS.md`](file:///e:/smartspend_V1_fixed/AGENTS.md) | File | **Onboarding Entrypoint.** Master rules, constraints, and gotchas. Read first. |
| [`docs/`](file:///e:/smartspend_V1_fixed/docs/) | Dir | **Domain References.** Scoped architecture, DB schema, AI, and API documents. |
| [`contracts/`](file:///e:/smartspend_V1_fixed/contracts/) | Dir | **Shared Contracts.** TypeScript definitions, standard error tags, and limits. |
| [`db/`](file:///e:/smartspend_V1_fixed/db/) | Dir | **Database Layer.** Schema definitions and migration outputs. |
| [`api/`](file:///e:/smartspend_V1_fixed/api/) | Dir | **Backend Hono Server.** Routers, middleware, AI classification, services. |
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
| **7. Persistence**| [`db/schema.ts`](file:///e:/smartspend_V1_fixed/db/schema.ts) | Queries/mutates MySQL database via Drizzle ORM. |
| **8. Response**   | Frontend Client | Returns typed JSON payload, automatically updating React Query cache. |

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Non-Blocking Embedding Warmup (`api/boot.ts`)
* **Rule:** Never prepend `await` to `warmupEmbeddingEngine()` in `boot.ts`.
* **Reason:** Vector index building (local descriptor map + Fireworks embedding cache) takes 10–30 seconds. Synchronous awaiting blocks server start.

### B. Redis Connection & In-Memory Fallback (`api/lib/redis-client.ts`)
* **Rule:** Ensure Redis is active on startup. If unavailable, system defaults to in-memory fallback.
* **Reason:** Voice-call STT sessions are clustered and WebRTC state is kept in Redis pub/sub. If using memory fallback, voice connection will fail.

### C. CORS & CSRF Tunnel Origins (`api/boot.ts`)
* **Rule:** Do not restrict CORS/CSRF to localhost in development.
* **Reason:** Webhook captures from external simulators (Paymob, WhatsApp) require proxy tunnels (`.loca.lt`, `.serveousercontent.com`, `.lhr.life`). These are whitelisted under `NODE_ENV === "development"`.

### D. Single Page Application (SPA) Fallback (`api/boot.ts`)
* **Rule:** Do not remove the Hono `app.notFound()` index redirect handler in production.
* **Reason:** Any HTTP GET request that is not prefix-matched by `/api/` must return `dist/public/index.html` to allow React Router client-side path refreshes.

### E. Cron Job Schedules
| Cron Expression | Action / Target | Description |
| :--- | :--- | :--- |
| `0 0 * * *` | `sessions` cleanup | Wipes expired active session tokens at midnight daily. |
| `* * * * *` | `processScheduledNotifications()` | Scans and sends timed notifications and reminders every minute. |
| `0 20 * * *`| `checkAndTriggerSmartActivityNotifications()` | Runs behavior snapshot analysis at 8:00 PM daily. |
