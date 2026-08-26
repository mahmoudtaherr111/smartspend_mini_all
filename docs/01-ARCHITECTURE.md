# SmartSpend AI — System Architecture & Monorepo Structure

> **AI AGENT SSOT:** This document defines the monorepo folder hierarchy, request lifecycles, frontend shell architecture, and backend execution parameters.

---

## 1. 📂 Repository Folder Structure & Scopes

| Directory / File | Type | Target Scope & Purpose |
| :--- | :--- | :--- |
| [`AGENTS.md`](file:///e:/smartspend_V1_fixed/AGENTS.md) | File | **Onboarding Entrypoint.** Master system briefing, rules, constraints, and gotchas. Read first. |
| [`docs/`](file:///e:/smartspend_V1_fixed/docs/) | Dir | **Authoritative Domain Specifications.** 9 scoped architecture, DB schema, AI, and API documents (01 through 09). |
| [`contracts/`](file:///e:/smartspend_V1_fixed/contracts/) | Dir | **Shared Contracts.** TypeScript definitions, standard error tags (`errors.ts`), and input limits (`constants.ts`). |
| [`db/`](file:///e:/smartspend_V1_fixed/db/) | Dir | **Database Layer.** Schema definitions (`schema.ts` — 48 tables), relational graph (`relations.ts` — 44 relation exports), and migrations. |
| [`api/`](file:///e:/smartspend_V1_fixed/api/) | Dir | **Backend Hono Server.** 22 tRPC routers, RBAC middleware, AI classification engine, settings cache, and background services. |
| [`scripts/`](file:///e:/smartspend_V1_fixed/scripts/) | Dir | **Ops & Benchmarking Utilities.** AI provider validators, classification benchmarks, and migration backfill scripts. |
| [`src/`](file:///e:/smartspend_V1_fixed/src/) | Dir | **Frontend React SPA & PWA.** React 18, Vite 7, Tailwind CSS v3.4, shadcn/ui primitives, iOS 26 Liquid Glass components, and tRPC hooks. |
| [`android-app/`](file:///e:/smartspend_V1_fixed/android-app/) | Dir | **Android Companion.** Native Kotlin source code for background bank SMS capture and webhook forwarding. |
| [`ios/`](file:///e:/smartspend_V1_fixed/ios/) | Dir | **iOS Companion & Shortcuts.** Apple Pay capture shortcuts, configuration, and native push listeners. |

---

## 2. 🔄 Request Lifecycle & Pipeline Flow

```
[Client / Mobile PWA / Desktop Web]
       │
       ▼
[1. tRPC React Client Hook] (src/providers/trpc.ts, React Query cache)
       │
       ▼ (HTTP POST /api/trpc/:procedure or WebSocket /api/ws/voice)
[2. Hono v4 Router] (api/boot.ts plugin mode or api/server.ts standalone)
       │
       ▼
[3. Session & Context Resolution] (api/context.ts)
   ├── Checks 'google_session' HTTP-only cookie against 'users'
   └── Checks 'Authorization: Bearer <token>' against 'sessions' (validateActiveSessionToken)
   └── Returns normalized 'ctx.user: UnifiedUser'
       │
       ▼
[4. RBAC & Rate Limiting Middleware] (api/middleware.ts)
   ├── publicProcedure / strictPublicProcedure (anonymous, IP rate limited)
   ├── authedProcedure (ctx.user != null, 100 req/min)
   ├── aiProcedure (user AI token budget + 100 req/min rate limit)
   └── proProcedure / ultraProcedure / moderatorProcedure / adminProcedure
       │
       ▼
[5. Sub-Router Delegation] (api/router.ts — 22 sub-routers)
   ├── Core Financial: expenseRouter, walletRouter, budgetRouter, goalsRouter
   ├── AI Engine: aiRouter, chatRouter, imageRouter
   ├── Identity & Security: authRouter, localAuthRouter, webauthnRouter, sessionRouter
   └── System Ops: analyticsRouter, adminRouter, supportRouter, proRouter, exportRouter, etc.
       │
       ▼
[6. Service & Classification Execution] (api/services/ & api/lib/)
   ├── 5-Layer Classification Waterfall (Muscle Memory → Rules → Vector → LLM → Verifier)
   ├── Finance Semantic Layer (Fast-path SQL aggregation in <15ms)
   └── Action Runtime (Two-phase confirmation gate with idempotencyKey)
       │
       ▼
[7. Persistence & Transactional Storage] (db/schema.ts & Drizzle ORM)
   ├── ACID Transactions (db.transaction() for ledger writes & contact counter decrements)
   └── In-Memory Settings Cache (getSystemSettings() with 5-minute TTL)
       │
       ▼
[8. Typed Response Serialization]
   └── Returns typed JSON payload, automatically updating client-side cache and UI
```

---

## 3. 📱 Frontend PWA Shell & iOS 26 "Liquid Glass" Architecture

SmartSpend AI delivers a dual first-class experience: a responsive desktop/tablet web platform and an installed mobile Progressive Web App (PWA) indistinguishable from native iOS/Android software.

### A. Responsive Shell & Safe-Area Inset Management (`src/App.tsx`, `src/index.css`)
- **Route-Aware Safe-Area Padding:** `<main>` applies `pb-nav-safe` (`calc(5.25rem + env(safe-area-inset-bottom))`) across all routes rendering `MobileBottomNav` (`visibleRoutes = ["/dashboard", "/settings", "/support", "/pro", "/bank-sync", "/ai"]`), preventing bottom action buttons and chat inputs from clipping beneath navigation bars.
- **Horizontal & Vertical Safe Utilities:** `.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`, and `.px-safe` provide unified padding calculations using `max(0.75rem, env(safe-area-inset-*))`, supporting edge notches, Dynamic Islands, and foldable device orientations.
- **Synchronized Breakpoints (`src/hooks/use-mobile.ts`):** `MOBILE_BREAKPOINT` is set to `1024px` (`lg` breakpoint), ensuring 100% synchronization between the application layout shell and dynamic modal/sheet components on iPad and tablet viewports.
- **RTL-Aware Natural Swipe Gestures (`src/pages/Home.tsx`):** In RTL Arabic layouts (`document.dir === 'rtl'`), leftward swipes (`deltaX < 0`) advance forward through tabs (`record` → `stats` → `calendar`), while rightward swipes (`deltaX > 0`) recede, matching natural physical touch mechanics.

### B. iOS 26 "Liquid Glass" Material Suite (`src/components/ui/`)
- **`LiquidBottomSheet` (`src/components/ui/liquid-bottom-sheet.tsx`):** Dynamic responsive sheet built on `vaul` for touch viewports (`< 1024px`) and `@radix-ui/react-dialog` for desktop viewports (`>= 1024px`). Features fluid spring inertia (`stiffness: 320, damping: 30, mass: 0.85`), tactile drag handles, specular gradient rim borders, and adaptive luminance contrast.
- **`LiquidSidebar` (`src/components/ui/liquid-sidebar.tsx`):** Draggable edge drawer with spring physics, directional RTL gesture dismiss (`drag="x"`), and specular refraction.
- **`LiquidGlass` Primitives (`src/components/ui/liquid-glass.tsx`):** Reusable frosted glass containers (`LiquidGlassCard`, `LiquidGlassPanel`, `LiquidGlassBadge`) utilizing multi-stage backdrop filters (`blur(32px) saturate(190%) contrast(102%)`), luminance borders, and accessible solid fallbacks for low-power devices.

---

## 4. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Non-Blocking Embedding Warmup (`api/boot.ts`)
* **Rule:** Never prepend `await` to `warmupEmbeddingEngine()` in `boot.ts`.
* **Reason:** Pre-indexing 385 local category descriptors and initializing Fireworks embeddings takes 10–30 seconds. Synchronous awaiting blocks server boot and triggers healthcheck timeouts.

### B. Redis Non-Blocking Invalidation & In-Memory Fallback (`api/lib/redis-client.ts`)
* **Rule:** Pattern-based cache deletion uses `client.scanIterator({ MATCH: pattern, COUNT: 100 })` rather than blocking `client.keys()`.
* **Reason:** In production, `KEYS *` blocks Redis's single-threaded event loop. `scanIterator` streams keys safely without latency spikes. If Redis is unavailable, the system automatically falls back to an in-process LRU cache.

### C. In-Memory System Settings Cache (`api/lib/settings-cache.ts`)
* **Rule:** All `system_settings` reads must go through `getSystemSettings()`.
* **Reason:** Avoids 24+ duplicate SQL queries per request. The cache maintains a 5-minute TTL and is invalidated instantly via `invalidateSettingsCache()` when an administrator updates configuration.

### D. Cairo Business Time Engine (`api/lib/app-time.ts`)
* **Rule:** Always use `businessDateKey()`, `startOfBusinessDay()`, and `businessDayRange()` for financial calculations.
* **Reason:** Forces date calculations to `APP_TIMEZONE="Africa/Cairo"` regardless of host server UTC time or Egypt's Daylight Saving Time switches.

### E. Cron Job Schedules & Distributed Advisory Locks (`api/boot.ts`, `api/services/scheduler-lock.ts`)
* **Rule:** All cron jobs must be wrapped in `withScheduledJobLock(jobName, fn)`.
* **Reason:** Uses MySQL `GET_LOCK(?, 0)` advisory locks to ensure that only a single backend replica executes each scheduled job, preventing duplicate notifications or report generation.

| Cron Expression | Target Action | Description |
| :--- | :--- | :--- |
| `0 0 * * *` | `sessions` cleanup | Wipes expired active session tokens at midnight daily. |
| `* * * * *` | `processScheduledNotifications()` | Scans and sends timed notifications and reminders every minute (paginated with `LIMIT 1000`). |
| `0 20 * * *` | `checkAndTriggerSmartActivityNotifications()` | Runs behavior snapshot analysis at 8:00 PM daily. |
| `0 3 * * 0` | `classification_logs` retention | Trims classification audit logs older than 180 days every Sunday at 3:00 AM. |
