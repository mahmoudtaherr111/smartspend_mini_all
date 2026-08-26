# SmartSpend AI — Comprehensive Specification Survey & System Architecture SSoT

> **Specification Miner Report (`spec_miner_survey_1`)**  
> **Repository:** `E:/smartspend_V1_fixed`  
> **Integrity Mode:** Development  
> **Authoritative Sources:** `AGENTS.md`, `docs/01-ARCHITECTURE.md` through `docs/09-RELEASE_AND_PLAYBOOK.md`, `db/schema.ts`, `api/router.ts`, test suites, and audit logs.

---

## 1. 🎯 Executive Overview & System Identity

**SmartSpend AI** is an enterprise-grade behavioral financial platform tailored specifically for Arabic speakers and Egyptian financial workflows (Egyptian Pound `EGP`, local banks, e-wallets like Vodafone Cash, InstaPay, Fawry, Apple Pay, and natural Egyptian colloquial dialect classification via Google Gemini, Groq, Fireworks, and local vector caches).

### Key System Characteristics
* **Frontend:** React 18, Vite 7, TypeScript 5.9, Tailwind CSS v3.4, shadcn/ui (40+ components), tRPC React Query Client (`src/providers/trpc.ts`).
* **Backend:** Hono v4 (`api/boot.ts` Vite plugin dev mode, `api/server.ts` standalone production), tRPC v11 App Router (`api/router.ts`), Drizzle ORM (`db/schema.ts`), MySQL 8.
* **AI Engine:** 5-Layer Hybrid Waterfall (Muscle Memory $\rightarrow$ Regex Rules $\rightarrow$ Vector Cosine $\rightarrow$ LLM Multi-intent $\rightarrow$ Dispute Resolver).
* **AI Chatbot Kernel:** Intent router fast-path (0-token SQL aggregation in `<15ms`), Hybrid Lexical-Semantic RAG Memory, and Action Runtime draft proposals with `idempotencyKey`.
* **Security & Auth:** Triple-Tier Auth (Google OAuth 2.0 via `google_session` cookie, Local Password/OTP via `Bearer` JWT, WebAuthn Passkeys via `userCredentials` + `authChallenges`).

---

## 2. 🏛️ Architectural Contracts & Monorepo Topology

### A. Monorepo Directory Layout

| Directory / File | Type | Target Scope & Responsibility |
| :--- | :--- | :--- |
| `AGENTS.md` | File | **Master Constitution & Onboarding SSoT.** System rules, constraints, and gotchas. |
| `docs/` | Dir | **Authoritative Domain Specifications.** 9 modular architecture and design files (`01`–`09`). |
| `contracts/` | Dir | **Shared Contracts & Boundaries.** TypeScript types, standard error tags (`errors.ts`), and limits (`constants.ts`). |
| `db/` | Dir | **Database Layer.** Schema (`schema.ts`), 100% relational mappings (`relations.ts`), migrations. |
| `api/` | Dir | **Hono Backend & tRPC Services.** Routers, middleware, AI classification, settings cache, services. |
| `scripts/` | Dir | **Utilities & Benchmarks.** AI provider validators, benchmarks, and backfill scripts. |
| `src/` | Dir | **Frontend React SPA.** Vite app, pages, components, hooks, and providers. |
| `android-app/` | Dir | **Android Companion.** Native source code for bank SMS capture. |
| `ios/` | Dir | **iOS Companion.** Configuration and native push notification listeners. |

### B. Execution Lifecycles & Gotchas

1. **Non-Blocking Embedding Warmup (`api/boot.ts`):** `warmupEmbeddingEngine()` is executed without `await` on startup to avoid blocking server boot for 10–30s.
2. **Redis Non-Blocking SCAN (`api/lib/redis-client.ts`):** Pattern invalidation utilizes `client.scanIterator({ MATCH: pattern, COUNT: 100 })` rather than blocking `client.keys()`, with automatic LRU in-memory fallback.
3. **In-Memory Settings Cache (`api/lib/settings-cache.ts`):** `getSystemSettings()` maintains a 5-minute TTL cache, invalidated instantly via `invalidateSettingsCache()`.
4. **CORS & Tunnel Whitelisting (`api/boot.ts`):** Tunnel origins (`.loca.lt`, `.serveousercontent.com`, `.lhr.life`) are enabled in development for Paymob and WhatsApp webhooks.
5. **SPA Catch-All Fallback (`api/boot.ts`):** Hono `app.notFound()` handler serves `dist/public/index.html` for all non-API GET routes to ensure client routing integrity.
6. **Automated Cron Schedules (`api/boot.ts`):**
   - `0 0 * * *`: Daily midnight cleanup of expired `sessions` and `authChallenges`.
   - `* * * * *`: Minutely execution of `processScheduledNotifications()` (paginated with `LIMIT 1000`).
   - `0 20 * * *`: Daily 8:00 PM behavioral analysis (`checkAndTriggerSmartActivityNotifications()`).
   - `0 3 * * 0`: Weekly Sunday 3:00 AM audit log retention trimming for logs older than 180 days.

---

## 3. 🗄️ Database Architecture: All 48 Tables across 6 Logical Groups

Every table is defined with Drizzle ORM in `db/schema.ts` and mapped with 100% full bidirectional relations in `db/relations.ts`. Tables containing `userId` and `userType` export both `localUser` and `oauthUser` relations.

```
                                  ┌─────────────────────────────┐
                                  │   Identity & Sessions (6)   │
                                  │  users, localUsers, etc.    │
                                  └──────────────┬──────────────┘
                                                 │
                  ┌──────────────────────────────┼──────────────────────────────┐
                  ▼                              ▼                              ▼
   ┌─────────────────────────────┐┌─────────────────────────────┐┌─────────────────────────────┐
   │ Financial Core Ledger (6)   ││ Freelance & Contacts (4)    ││ AI Layer & Memory (12)      │
   │ expenses, userWallets, etc. ││ userBusinesses, contacts    ││ aiMemoryItems, logs, etc.   │
   └──────────────┬──────────────┘└──────────────┬──────────────┘└──────────────┬──────────────┘
                  │                              │                              │
                  └──────────────────────────────┼──────────────────────────────┘
                                                 │
                  ┌──────────────────────────────┴──────────────────────────────┐
                  ▼                                                             ▼
   ┌─────────────────────────────┐                               ┌─────────────────────────────┐
   │ Conversational AI (5)       │                               │ System Ops & Alerts (15)    │
   │ chatConversations, etc.     │                               │ settings, profiles, ads...  │
   └─────────────────────────────┘                               └─────────────────────────────┘
```

### Group A: Identity & Sessions (6 Tables)

| # | Table Variable | SQL Table Name | Key Columns | Indexes & Constraints |
|---|---|---|---|---|
| 1 | `users` | `users` | `id`, `unionId`, `name`, `email`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `currentStreak`, `highestStreak`, `lastStreakAt`, `aiTokensUsed` | `users_role_idx`, `users_plan_idx`, `users_referral_idx`, `users_referred_by_idx`, unique `unionId`, unique `email`, unique `referralCode` |
| 2 | `localUsers` | `local_users` | `id`, `name`, `phone`, `password`, `email`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `aiTokensUsed`, `currentStreak`, `highestStreak`, `lastStreakAt` | `local_users_role_idx`, `local_users_plan_idx`, `local_users_referred_by_idx`, unique `phone`, unique `referralCode` |
| 3 | `sessions` | `sessions` | `id`, `token`, `userId`, `userType`, `expiresAt`, `createdAt` | `(userId, userType)`, `token`, `expiresAt` |
| 4 | `userCredentials` | `user_credentials` | `id`, `userId`, `userType`, `publicKey`, `counter`, `deviceType`, `backedUp`, `transports`, `lastUsedAt`, `createdAt` | `(userId, userType)` |
| 5 | `authChallenges` | `auth_challenges` | `id`, `challenge`, `userId`, `userType`, `expiresAt`, `createdAt` | `(userId, userType)` |
| 6 | `webhookTokens` | `webhook_tokens` | `id`, `token`, `userId`, `userType`, `name`, `createdAt`, `lastUsedAt` | `(userId, userType)`, `token` |

### Group B: Financial Core Ledger (6 Tables)

| # | Table Variable | SQL Table Name | Key Columns | Indexes & Constraints |
|---|---|---|---|---|
| 7 | `expenses` | `expenses` | `id`, `userId`, `userType`, `type`, `amount`, `category`, `subCategory`, `description`, `rawText`, `source`, `paymentMethod`, `placeHint`, `parsedMetadata`, `contactId`, `classificationLogId`, `businessId`, `walletId`, `clientRequestId`, `date`, `status` | `(userId, userType)`, `date`, `(userId, userType, date)`, `type`, `category`, `status`, `businessId`, `contactId`, `classificationLogId`, `walletId`, unique `(userId, userType, clientRequestId)` |
| 8 | `expenseCategories`| `expense_categories` | `id`, `userId`, `userType`, `name`, `icon`, `color`, `isDefault`, `createdAt` | `(userId, userType)` |
| 9 | `userWallets` | `user_wallets` | `id`, `userId`, `userType`, `name`, `provider`, `lastFourDigits`, `balance`, `createdAt`, `updatedAt` | `(userId, userType)` |
| 10 | `financialGoals` | `financial_goals` | `id`, `userId`, `userType`, `title`, `targetAmount`, `targetDate`, `status`, `aiPlan`, `aiAlerts`, `createdAt` | `(userId, userType)`, `status` |
| 11 | `userBudgets` | `user_budgets` | `id`, `userId`, `userType`, `title`, `category`, `monthlyLimit`, `linkedGoalId`, `status`, `alertThresholdPercent` | `(userId, userType, status)`, `category`, `linkedGoalId` |
| 12 | `monthlyReports` | `monthly_reports` | `id`, `userId`, `userType`, `month`, `totalAmount`, `totalIncome`, `categoryBreakdown`, `insights`, `aiReport` | `(userId, userType)`, `month` |

### Group C: Freelance & Contact Relationships (4 Tables)

| # | Table Variable | SQL Table Name | Key Columns | Indexes & Constraints |
|---|---|---|---|---|
| 13 | `userBusinesses` | `user_businesses` | `id`, `userId`, `userType`, `name`, `type`, `typeLabel`, `description`, `keywords`, `isActive` | `(userId, userType)`, `isActive` |
| 14 | `businessCategories`| `business_categories`| `id`, `businessId`, `name`, `nameAr`, `type`, `keywords`, `createdAt` | `businessId` |
| 15 | `userContacts` | `user_contacts` | `id`, `userId`, `userType`, `name`, `relationship`, `category`, `subCategory`, `isSilenced`, `transactionCount`, `totalSpent` | `(userId, userType)` |
| 16 | `pendingClarifications`| `pending_clarifications`| `id`, `userId`, `userType`, `expenseId`, `question`, `originalText`, `status`, `contextData`, `createdAt` | `(userId, userType)`, `status`, `expenseId` |

### Group D: AI Layer & Behavioral Memory (12 Tables)

| # | Table Variable | SQL Table Name | Key Columns | Indexes & Constraints |
|---|---|---|---|---|
| 17 | `aiSummaries` | `ai_summaries` | `id`, `userId`, `userType`, `period`, `periodValue`, `content`, `createdAt` | `(userId, userType)`, unique `(userId, userType, period, periodValue)` |
| 18 | `aiConversationSummaries`| `ai_conversation_summaries`| `id`, `conversationId`, `userId`, `userType`, `capsule`, `runningSummary`, `messageCount`, `lastTurnNumber`, `createdAt`, `updatedAt` | unique `conversationId`, `(userId, userType)`, `updatedAt` |
| 19 | `aiMemoryItems` | `ai_memory_items` | `id`, `userId`, `userType`, `memoryType`, `content`, `contentHash`, `importance`, `sourceConversationId`, `sourceMessageId`, `status`, `metadata`, `createdAt`, `updatedAt` | `(userId, userType, status)`, unique `(userId, userType, contentHash)`, `memoryType`, `updatedAt`, `sourceConversationId`, `sourceMessageId` |
| 20 | `aiMemoryEmbeddings`| `ai_memory_embeddings`| `id`, `memoryItemId`, `userId`, `userType`, `provider`, `model`, `dimensions`, `vector`, `createdAt` | `memoryItemId`, `(userId, userType)`, unique `(memoryItemId, provider, model, dimensions)` |
| 21 | `aiActionMemory` | `ai_action_memory` | `id`, `userId`, `userType`, `actionName`, `status`, `summary`, `payload`, `sourceConversationId`, `createdAt`, `updatedAt` | `(userId, userType)`, `(actionName, status)`, `updatedAt`, `sourceConversationId` |
| 22 | `aiPendingActions`| `ai_pending_actions` | `id`, `userId`, `userType`, `conversationId`, `actionName`, `status`, `risk`, `payload`, `idempotencyKey`, `expiresAt`, `createdAt` | `(userId, userType, status)`, `expiresAt`, `conversationId`, `idempotencyKey` |
| 23 | `aiActionAuditLogs`| `ai_action_audit_logs`| `id`, `actionId`, `userId`, `userType`, `actionName`, `event`, `status`, `payload`, `createdAt` | `actionId`, `(userId, userType)`, `event` |
| 24 | `classificationLogs`| `classification_logs` | `id`, `userId`, `userType`, `originalText`, `parsedBy`, `finalResult`, `confidence`, `wasCorrected`, `tokensUsed`, `createdAt` | `(userId, userType)`, `parsedBy`, `createdAt` |
| 25 | `onboardingQuestions`| `onboarding_questions`| `id`, `questionKey`, `questionText`, `inputType`, `options`, `isActive`, `createdAt` | — |
| 26 | `userDictionaries`| `user_dictionaries` | `id`, `userId`, `userType`, `word`, `category`, `subCategory`, `createdAt` | `(userId, userType)`, unique `(userId, userType, word)` |
| 27 | `profileLearningEvents`| `profile_learning_events`| `id`, `userId`, `userType`, `eventType`, `previousAttributes`, `newAttributes`, `createdAt` | `(userId, userType)`, `eventType` |
| 28 | `monthlyBehaviorSnapshots`| `monthly_behavior_snapshots`| `id`, `userId`, `userType`, `month`, `totalIncome`, `totalExpense`, `behaviorFlags`, `createdAt` | unique `(userId, userType, month)`, `month` |

### Group E: Conversational AI & Logs (5 Tables)

| # | Table Variable | SQL Table Name | Key Columns | Indexes & Constraints |
|---|---|---|---|---|
| 29 | `chatConversations`| `chat_conversations`| `id`, `userId`, `userType`, `title`, `messageCount`, `totalTokens`, `metadata`, `createdAt`, `lastMessageAt` | `(userId, userType)`, `lastMessageAt` |
| 30 | `chatMessages` | `chat_messages` | `id`, `conversationId`, `role`, `content`, `toolCalls`, `toolResults`, `tokensUsed`, `model`, `createdAt` | `conversationId`, `(conversationId, createdAt)` |
| 31 | `rawSmsEvents` | `raw_sms_events` | `id`, `userId`, `userType`, `message`, `sender`, `status`, `parsedExpenseId`, `createdAt` | `(userId, userType)`, `status` |
| 32 | `whatsappOtpCodes`| `whatsapp_otp_codes`| `id`, `phone`, `code`, `verified`, `expiresAt`, `createdAt` | `phone` |
| 33 | `voiceUsage` | `voice_usage` | `id`, `userId`, `userType`, `durationSeconds`, `month`, `source`, `createdAt` | `(userId, userType, month)` |

### Group F: System Operations & Notifications (15 Tables)

| # | Table Variable | SQL Table Name | Key Columns | Indexes & Constraints |
|---|---|---|---|---|
| 34 | `systemSettings` | `system_settings` | `key`, `value`, `updatedAt` | Primary key `key` |
| 35 | `userProfiles` | `user_profiles` | `id`, `userId`, `userType`, `lifestyleInfo`, `financialInfo`, `createdAt`, `updatedAt` | unique `(userId, userType)` |
| 36 | `userAnalytics` | `user_analytics` | `id`, `userId`, `userType`, `eventName`, `eventData`, `createdAt` | `(userId, userType)`, `eventName`, `createdAt` |
| 37 | `supportTickets` | `support_tickets` | `id`, `userId`, `userType`, `subject`, `status`, `assignedTo`, `createdAt`, `updatedAt` | `(userId, userType)`, `status`, `assignedTo` |
| 38 | `discountCodes` | `discount_codes` | `id`, `code`, `type`, `discountPercent`, `createdBy`, `createdAt` | `createdBy`, unique `code` |
| 39 | `ads` | `ads` | `id`, `title`, `content`, `link`, `isActive`, `createdBy`, `createdAt` | `(createdBy, isActive)` |
| 40 | `adClicks` | `ad_clicks` | `id`, `adId`, `userId`, `userType`, `createdAt` | `(adId, userId, userType)` |
| 41 | `referrals` | `referrals` | `id`, `referrerId`, `referrerType`, `referredId`, `referredType`, `rewardStatus`, `createdAt` | `(referrerId, referrerType)`, `(referredId, referredType)` |
| 42 | `proSubscriptions`| `pro_subscriptions` | `id`, `userId`, `userType`, `plan`, `provider`, `status`, `currentPeriodEnd`, `createdAt`, `updatedAt` | `(userId, userType)`, `status` |
| 43 | `seoPages` | `seo_pages` | `id`, `slug`, `title`, `metaDescription`, `content`, `createdAt`, `updatedAt` | unique `slug` |
| 44 | `apiKeyErrors` | `api_key_errors` | `id`, `provider`, `keyLabel`, `errorType`, `userId`, `resolved`, `createdAt` | `provider`, `errorType`, `resolved`, `createdAt`, `userId` |
| 45 | `pushSubscriptions`| `push_subscriptions`| `id`, `userId`, `userType`, `endpoint`, `fcmToken`, `createdAt` | `(userId, userType)` |
| 46 | `notificationTemplates`| `notification_templates`| `id`, `name`, `eventType`, `targetSegment`, `createdBy`, `createdAt` | `createdBy`, `eventType` |
| 47 | `inAppNotifications`| `in_app_notifications`| `id`, `userId`, `userType`, `title`, `body`, `isRead`, `createdAt` | `(userId, userType)`, `isRead` |
| 48 | `notificationLogs`| `notification_logs` | `id`, `templateId`, `userId`, `userType`, `sentVia`, `status`, `createdAt` | `(userId, userType)`, `templateId` |

---

## 4. 🔀 Master tRPC API: All 22 Sub-Routers, Procedures & Security RBAC

All sub-routers are unified inside `appRouter` (`api/router.ts`). Procedure rate limits and access gates are enforced via `api/middleware.ts`.

| # | Router Key | Source File | Procedure Level | Scope & Key Endpoints |
|---|---|---|---|---|
| 1 | `auth` | `api/auth-router.ts` | `publicProcedure` | Google OAuth token exchange, `google_session` cookie issuance, callback handling. |
| 2 | `localAuth` | `api/local-auth-router.ts` | `strictPublicProcedure` | Local password/phone signup, login, OTP verification (`25 req/15min` per IP). |
| 3 | `expense` | `api/expense-router.ts` | `authedProcedure` | Transaction CRUD, bulk categorize, ACID `db.transaction()` mutations with atomic contact count updates. |
| 4 | `ai` | `api/ai-router.ts` | `aiProcedure` | 5-layer classification, multi-intent narrative parser, STT audio, receipt OCR vision. |
| 5 | `analytics` | `api/analytics-router.ts` | `authedProcedure` | Paginated `getAllUserStats` (`limit`, `offset`, `{ total, users }`), spending trends, cache resolvers. |
| 6 | `admin` | `api/admin-router.ts` | `adminProcedure` | System metrics, user dashboard audits, fallback model overrides, settings cache invalidation. |
| 7 | `adminWhatsapp`| `api/admin-whatsapp-router.ts` | `adminProcedure` | WhatsApp bot instance pairing, QR SSE stream, token regeneration. |
| 8 | `support` | `api/support-router.ts` | `authedProcedure` | User support ticket creation, status queries, bug reporting. |
| 9 | `export` | `api/export-router.ts` | `authedProcedure` | Streamed financial exports (CSV, PDF, Excel) with transaction formatting. |
| 10 | `session` | `api/session-router.ts` | `authedProcedure` | Active session token inspection, multi-device revocation, midnight TTL cleanup. |
| 11 | `pro` | `api/pro-router.ts` | `authedProcedure` | Paymob checkout link creation, plan verification, promo code redemption. |
| 12 | `ads` | `api/ads-router.ts` | `publicProcedure` | Dynamic sponsor cards delivery, impression & click logging. |
| 13 | `referral` | `api/referral-router.ts` | `authedProcedure` | Referral link generation, invite attribution, reward status. |
| 14 | `seo` | `api/seo-router.ts` | `publicProcedure` | Programmatic dynamic SEO metadata and page slug resolvers. |
| 15 | `profile` | `api/profile-router.ts` | `authedProcedure` | User profile setup, onboarding questionnaire, canonical contact hub. |
| 16 | `wallet` | `api/wallet-router.ts` | `authedProcedure` | Account/card CRUD, direct `eq(expenses.walletId, ...)` queries replacing slow `LIKE` scans. |
| 17 | `image` | `api/image-router.ts` | `authedProcedure` | Receipt upload, avatar management, Gemini 3.1 Flash OCR parsing. |
| 18 | `goals` | `api/goals-router.ts` | `authedProcedure` | Savings target CRUD, AI-assisted timeline recommendations. |
| 19 | `budget` | `api/budget-router.ts` | `authedProcedure` | Category budget limit management and threshold alert configurations. |
| 20 | `webauthn` | `api/webauthn-router.ts` | `public` / `authed` | Passkey biometric challenge registration and verification (`authChallenges`). |
| 21 | `chat` | `api/chat-router.ts` | `aiProcedure` | AI financial assistant chat, hybrid RAG memory, SQL fast path, and action confirmation. |
| 22 | `business` | `api/business-router.ts` | `proProcedure` | Freelancer mode ledgers, business categories, tax deduction tagging. |

---

## 5. 🧠 5-Layer Hybrid Classification & NLP Waterfall

The transaction classification engine balances near-zero latency with extreme accuracy on Egyptian colloquial dialect.

```
[Raw User Input] (e.g. "دفعت 200 اكل و50 مواصلات")
       │
       ├──────────────────────────────────────────────────┐
       ▼                                                  ▼
[Layer 1: Muscle Memory Cache] (<1ms, $0)     [Layer 2: Regex Rule Engine] (2ms, $0)
- Exact normalized phrase lookup              - Keyword matching for Egyptian merchants
- Selective 9-column projection               - STRONG_INCOME / STRONG_EXPENSE filters
       │ (if miss)                                        │ (if miss)
       └─────────────────────────┬────────────────────────┘
                                 ▼
              [Layer 3: Vector Semantic Search] (15ms, $0)
              - Cosine similarity on qwen3-embedding-8b (768-dim)
              - Local merchant descriptor map
                                 │ (if similarity < 0.88)
                                 ▼
              [Layer 4: Multi-Intent LLM Decomposition] (400-600ms, API Cost)
              - Gemini 3.1 Flash Lite / Groq / Fireworks / NVIDIA
              - Multi-turn narrative decomposition (narrative-decomposer.ts)
                                 │
                                 ▼
              [Layer 5: Dispute Resolver & Feedback Runtime] (Continuous)
              - Ingests user UI corrections & updates userDictionaries
              - Promotes future hits to Layer 1 cache
```

### Layer Details:
1. **Layer 1 (Muscle Memory):** Instant match against `userDictionaries` and historical `classificationLogs` using selective projection (`id`, `originalText`, `normalizedText`, `finalResult`, `confidence`, `wasCorrected`, `decision`, `parsedBy`, `createdAt`).
2. **Layer 2 (Rule Engine):** High-speed regex for known Egyptian brands (Talabat, Fawry, Kazyon, Uber, Instapay) and disambiguation between person names and brands.
3. **Layer 3 (Vector Semantic Search):** 768-dimensional embeddings comparing against merchant descriptors.
4. **Layer 4 (LLM Narrative Decomposer):** Intercepted via `mapModelName()`, extracting multiple discrete transactions from single conversational inputs (e.g. "دفعت 200 اكل و50 مواصلات" $\rightarrow$ 2 items).
5. **Layer 5 (Dispute Feedback):** Continuous learning from UI corrections, persisting verified patterns.

---

## 6. 🤖 AI Center Agent, Memory Architecture & Action Runtime Engine

### A. Intent Router & Zero-Token Fast Path (`resolvers.ts`)

| Intent Kind | Route Heuristics | Execution Engine | Token & Provider Cost |
| :--- | :--- | :--- | :--- |
| `finance_query` | Spending questions (*"صرفت كام النهارده؟"*) | SQL Aggregation in `resolvers.ts` | **0 Tokens ($0.00)** |
| `action_request` | Intents to create/modify budgets, goals, transactions | Drafts `aiPendingActions` + `idempotencyKey` | 1 Structured Call |
| `advice_request` | Financial advice & savings strategies | RAG Context + Fact-verified LLM | 1 Bounded LLM Call |
| `general_chat` | Greetings & basic guidance | Static / Low-cost prompt | 1 LLM Call |

### B. Dual-Tier RAG Memory System

1. **Short-Term Context:** `aiConversationSummaries` retains the last 8 conversation turns and auto-summarizes older turns (`buildRunningSummary`) to control context size.
2. **Long-Term Durable Memory:** `aiMemoryItems` (preferences, plans, facts, agreements) paired with Fireworks `qwen3-embedding-8b` 768-dim embeddings in `aiMemoryEmbeddings`.
3. **Hybrid Retrieval Scoring Formula:**
   $$\text{Score} = \text{Cosine Similarity} + \text{Lexical Score} + \text{Specific Token Boost} + \text{Recency Boost} + \text{Importance Bonus}$$

### C. Action Runtime & Safety Gate

The Chatbot Agent **cannot directly execute write mutations** to the ledger. Every action follows this lifecycle:
```
LLM Suggestion 
  → Generate Draft in aiPendingActions (with UUID idempotencyKey & risk level)
  → Render interactive action_confirmation card in React UI
  → User clicks "Confirm" or "Cancel"
  → Backend executes within db.transaction() and invalidates cache
```

---

## 7. 🔑 Triple-Tier Authentication Model & RBAC

1. **Google OAuth 2.0:** Issues HTTP-only `google_session` cookie mapped to `users` table (`type: "oauth"`).
2. **Local Phone/Password & OTP:** Issues JWT Bearer token authenticated against `sessions` table and mapped to `localUsers` (`type: "local"`).
3. **WebAuthn Passkeys:** TouchID/FaceID biometric authentication validated via `userCredentials` and ephemeral `authChallenges`.
4. **Context Normalization:** `createContext` resolves either method into a uniform `ctx.user` object of type `UnifiedUser`.
5. **RBAC Procedures:**
   - `publicProcedure` (400 req/min/IP)
   - `strictPublicProcedure` (25 req/15min/IP)
   - `authedProcedure` (100 req/min/User)
   - `aiProcedure` (100 req/min/User)
   - `proProcedure` (plan pro/ultra or admin)
   - `ultraProcedure` (plan ultra or admin)
   - `moderatorProcedure` (role moderator or admin)
   - `adminProcedure` (role admin)

---

## 8. 🔌 External Integrations & Telemetry

* **Android Companion App:** Background SMS capture forwarding bank texts to `POST /api/sms/ingest` authenticated via `webhookTokens`.
* **Apple Pay iOS:** Push notification interception forwarding transaction events to `POST /api/sms/ingest`.
* **WhatsApp Bot & OTP:** Server-Sent Events at `GET /api/sse/otp?phone=X` using `otpEvents.emit` for instant zero-polling verification.
* **Paymob Payment Gateway:** Webhook listener at `POST /api/webhooks/paymob` enforcing SHA-512 HMAC validation on strict alphabetical parameter concatenation.

---

## 9. 📱 Client UI, Responsive Architecture & PWA Contracts

* **Mobile Navigation Contract:** Hardware/browser back button closes active drawers/modals first before leaving the screen.
* **Input Composer Safe Areas:** Chat composer dynamically remains above mobile virtual keyboards (`pb-safe`) without obstructing viewport.
* **Resilient Draft UX:** Failed network requests preserve the user's unsent message in the composer textarea.
* **Telemetry Privacy:** Internal trace IDs, model metadata, and cache diagnostics are collapsible/hidden for production users.
* **PWA & Offline Security:** Service worker strictly excludes `/api/*` from caching to avoid stale or unauthenticated offline data leaks.
* **Design System:** Full RTL support, dark/light modes, min 44x44px touch targets (`tap-target`), Recharts dynamic visualizations.

---

## 10. 🚨 Master Catalog of All 31 Discovered Logical Flaws & System Requirements

Below is the exhaustive catalog of all 31 system flaws, architectural requirements, and their exact engineering specifications.

| # | Flaw / Requirement Name | Architectural Domain | Exact Code Location | Root Cause & Impact | Engineering Specification & Resolution |
|---|---|---|---|---|---|
| **1** | **Dual-User Identity & Context Resolution** | Auth / Context | `api/context.ts`, `api/middleware.ts` | Checking a single user table or `kimi_sid` cookie causes local or OAuth users to be unrecognized. | `createContext` resolves `google_session` cookie against `users` first, then falls back to `Bearer` JWT against `sessions` (`userType == 'local'`) for `localUsers`. Both map to `UnifiedUser`. |
| **2** | **Role vs. Plan RBAC Separation** | RBAC / Security | `api/middleware.ts`, `api/business-router.ts` | Checking `user.role === "pro"` locks out paying users because `role` is for admin access, while `plan` dictates feature tiers. | Strictly separate `user.role` (`user`, `moderator`, `admin`) from `user.plan` (`free`, `pro`, `ultra`) across `proProcedure` and `adminProcedure`. |
| **3** | **Boot-Time Zod Environment Validation** | Server Bootstrap | `api/lib/env.ts`, `api/boot.ts` | Missing environment keys crash server boot; inability to test checkout flows without live payment gateways. | Strict Zod validation on boot (`DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `GEMINI_API_KEY`) plus `BILLING_SIMULATE="true"` bypass for tests. |
| **4** | **Legacy LLM Model Shorthand Interception** | AI Layer | `api/lib/model-mapper.ts`, `api/lib/ai-provider-registry.ts` | Passing legacy model names (`flash`, `1.5-flash`, `2.0-flash`) directly to Google GenAI SDK throws runtime exceptions. | `mapModelName()` intercepts strings, routing `flash` $\rightarrow$ `gemini-3.1-flash-lite`, `pro`/`ultra` $\rightarrow$ `gemini-3.5-pro`, and `llama`/`deepseek` to Groq/Fireworks/NVIDIA. |
| **5** | **System Settings N+1 Query Storm** | Performance / DB | `api/lib/settings-cache.ts`, `api/admin-router.ts` | Direct `system_settings` table queries generate 24+ duplicate SQL calls per request. | In-memory cache `getSystemSettings()` with 5-minute TTL, invalidated immediately on admin update via `invalidateSettingsCache()`. |
| **6** | **100% Drizzle ORM Relational Coverage** | Database Layer | `db/relations.ts`, `db/schema.ts` | Missing relation definitions break Drizzle relational queries (`findMany({ with: ... })`). | Complete mapping across all 48 tables, exporting both `localUser` and `oauthUser` relations on all dual-user entities. |
| **7** | **Zero-Polling WhatsApp OTP via SSE** | Integrations / Webhooks | `api/boot.ts`, `api/admin-whatsapp-router.ts` | Polling backend for OTP verification drains mobile battery and increases server load. | Server-Sent Events at `GET /api/sse/otp?phone=X` triggered via `otpEvents.emit("otp:${phone}", data)` with 15s keep-alive. |
| **8** | **Paymob Webhook HMAC Concatenation Order** | Billing / Security | `api/boot.ts`, `api/pro-router.ts` | Arbitrary parameter ordering causes SHA-512 HMAC verification failure, returning 401 Unauthorized. | Strict alphabetical concatenation of Paymob transaction fields signed with `PAYMOB_HMAC_SECRET`. |
| **9** | **Non-Blocking Vector Warmup on Boot** | Server Bootstrap | `api/boot.ts`, `api/lib/embedding-engine.ts` | Prepending `await` to `warmupEmbeddingEngine()` freezes Hono server startup for 10–30s. | Fire-and-forget background execution of `warmupEmbeddingEngine()` during server boot. |
| **10** | **Redis Non-Blocking SCAN Key Invalidation** | Cache / Performance | `api/lib/redis-client.ts` | Using blocking `KEYS *` freezes single-threaded Redis event loops under production load. | Cursor-based streaming via `client.scanIterator({ MATCH: pattern, COUNT: 100 })` with LRU in-memory fallback. |
| **11** | **Single Page Application (SPA) Fallback** | Routing / Client | `api/boot.ts` | Client route refreshes return 404 from Hono backend. | Wildcard `app.notFound()` handler serving `dist/public/index.html` for all non-API GET requests. |
| **12** | **Bounded Cron Notification Processing** | Background Jobs | `api/boot.ts`, `api/services/notification-service.ts` | Unbounded notification scans cause memory and CPU spikes. | Enforce pagination with `LIMIT 1000` on minutely `processScheduledNotifications()`. |
| **13** | **Ledger Mutation Idempotency Safety** | Financial Integrity | `db/schema.ts`, `api/expense-router.ts` | Mobile network retries and double clicks create duplicate expense rows. | Unique constraint index `expenses_user_client_request_unique` on `(userId, userType, clientRequestId)`. |
| **14** | **Direct Indexed Wallet Ledger Querying** | Performance / DB | `db/schema.ts`, `api/wallet-router.ts` | Querying wallet expenses via `LIKE '%walletName%'` text scans causes slow table scans and false positives. | Foreign key `walletId` with index `expenses_wallet_idx` and direct SQL equality `eq(expenses.walletId, walletId)`. |
| **15** | **ACID Financial Transactions & Atomic Decrements** | Financial Integrity | `api/expense-router.ts`, `db/schema.ts` | Non-transactional writes leave orphaned ledger entries and desynchronized contact counts. | Wrap `create`, `batchCreate`, `delete` in `db.transaction()`, automatically decrementing `userContacts.transactionCount` on delete. |
| **16** | **Egyptian Slang Directionality Disambiguation** | AI Classification | `api/lib/egyptian-dictionary.ts`, `api/lib/rule-engine.ts` | LLMs confuse Egyptian colloquial verbs (e.g. `قبضت` vs `صرفت`), flipping income/expense direction. | Pre-layer deterministic dictionary matching against `STRONG_INCOME` and `STRONG_EXPENSE` lists before vector search. |
| **17** | **Muscle Memory Selective Column Projection** | AI Classification | `api/lib/muscle-memory.ts` | Loading full rows from `classification_logs` loads large JSON blobs into RAM. | Selective projection in `loadUserPatterns` querying only 9 primitive columns (`id`, `originalText`, `normalizedText`, etc.). |
| **18** | **LLM Financial Metric Hallucination Safeguard** | AI Layer / Reporting | `api/lib/numeric-guard.ts`, `api/jobs/monthly-report-job.ts` | Generative LLMs hallucinate inaccurate totals or percentages in reports. | Ground truth facts compiled via `buildMonthlyReportFactsPack()` and verified post-generation via `validateNumbersAgainstFacts()`. |
| **19** | **Taxonomy Single Source of Truth Alignment** | Domain Modeling | `src/lib/financial-taxonomy.ts`, `api/lib/taxonomy-ssot.ts` | Inconsistent category names between frontend and backend cause broken charts and filters. | Versioned taxonomy SSoT module defining canonical category IDs, Arabic labels, icons, and business eligibility. |
| **20** | **Strict API Input Boundary Constraints** | API Contracts | `contracts/constants.ts`, `api/expense-router.ts` | Inconsistent input boundaries in Zod schemas cause validation errors. | Enforce `ExpenseInputLimits` (`rawTextMax: 5000`, `descriptionMax: 2000`, `amountMax: 999_999_999`) across all schemas. |
| **21** | **Standardized tRPC Semantic Error Throwing** | API Contracts | `contracts/errors.ts`, `contracts/constants.ts` | Generic JavaScript errors produce unhelpful 500 responses without localized tags. | Throw `TRPCError` instances paired with standardized `ErrorMessages` enum tags. |
| **22** | **Master Sub-Router Registry Synchronization** | API Contracts | `api/router.ts` | Creating sub-routers without registering them in `appRouter` causes silent tRPC type check failures (`npm run check`). | Register all 22 sub-routers in `appRouter` inside `api/router.ts` with complete type exports. |
| **23** | **Biometric Passkey Challenge Lifecycle** | Auth / Security | `db/schema.ts`, `api/webauthn-router.ts` | WebAuthn challenges expiring prematurely during multi-step biometric logins. | Store ephemeral challenge tokens in `authChallenges` table with daily midnight TTL cleanup. |
| **24** | **Android Companion Webhook Token Rotation** | Mobile / Integrations | `api/profile-router.ts`, `android-app/` | Rotating webhook pairing keys causes Android companion app to fail with 401 Unauthorized. | Enforce token rotation flow requiring companion app QR re-scan and validation against `webhookTokens`. |
| **25** | **Headless Browser Voice Call State Handling** | Testing / Audio | `src/components/ai/AIVoiceCall.tsx`, `docs/06-SMS_AND_APPLE_PAY.md` | E2E headless tests hanging indefinitely on `"جاري الاتصال..."` due to missing WebRTC media devices. | Implement graceful media device fallback states and mock QA bypass flags for automated runners. |
| **26** | **Autonomous Direct-Write Safety Gate in Chatbot** | AI Safety / Agent | `api/services/action-runtime/`, `db/schema.ts` | AI chatbot directly mutating or deleting database records without explicit user consent. | Action drafting engine (`aiPendingActions` + `idempotencyKey`) requiring user to click explicit UI Confirm/Cancel buttons. |
| **27** | **Zero-Token SQL Aggregation Fast Path** | AI Efficiency / Cost | `api/services/ai-kernel/intent-router.ts`, `resolvers.ts` | Running expensive LLM prompts for basic spending queries (*"صرفت كام النهارده؟"*). | Intent router fast path executing direct SQL `SUM`/`COUNT` in `<15ms` with 0 token cost. |
| **28** | **Grounded Zero-Baseline Period Comparisons** | Analytics / AI | `api/services/finance-semantic-layer/`, `docs/08` | Comparing current spending to an empty historical period reporting infinite or 0% changes. | Explicit zero-baseline detection returning clear Arabic explanations that no prior data exists. |
| **29** | **Canonical Contact Identity & Foreign Key Linkage** | Domain Modeling | `db/schema.ts` (`expenses.contactId`), `userContacts` | Tracking contacts via loose strings causes name collisions and broken per-person analytics. | Canonical `expenses.contactId` foreign key with atomic merge, rename, and per-person aggregation. |
| **30** | **Immutable Classification Trace Linkage** | AI Auditing | `db/schema.ts` (`expenses.classificationLogId`), `classificationLogs` | Users unable to get explanations for past classifications due to missing linkage to parse traces. | Link `expenses.classificationLogId` to `classificationLogs.id`, enabling instant retrieval of exact decision rationale. |
| **31** | **Mobile UX, PWA Caching & Telemetry Security** | Client / PWA | `src/components/layout/`, `src/components/ai/AIChatbot.tsx`, `sw.js` | Back button closing app; keyboard covering composer; traces leaking in UI; unsafe service worker mutations; unencrypted localStorage. | In-page history listeners for drawers, dynamic `pb-safe` keyboard positioning, collapsible dev traces, no-cache on `/api/*`, and user-scoped logout purge. |

---

## 11. 📋 Specification Miner Findings Tables

### Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | **Auth** | Google OAuth Callback | Authenticates user via Google OAuth 2.0 and issues HTTP-only `google_session` cookie | `code`, `state` | Redirect + session cookie | Redirects to login with error query | `docs/05-AUTH_AND_SECURITY.md`, `api/auth-router.ts` |
| 2 | **Auth** | Local Phone/OTP Auth | Registers or logs in users via Egyptian phone number and password/OTP | `phone`, `password`, `otp` | JWT Bearer Token | `TRPCError` with `BAD_REQUEST` | `api/local-auth-router.ts` |
| 3 | **Auth** | Passkey Registration | Registers WebAuthn biometric passkey credentials | WebAuthn attestation response | Stored `userCredentials` | `TRPCError` on challenge mismatch | `api/webauthn-router.ts` |
| 4 | **Core Ledger** | ACID Expense Create | Records an expense with idempotency key and updates contact stats | `amount`, `category`, `clientRequestId`, etc. | Created `Expense` object | `TRPCError` on duplicate `clientRequestId` | `api/expense-router.ts` |
| 5 | **Core Ledger** | Atomic Expense Delete | Deletes an expense and automatically decrements contact transaction count | `expenseId` | Success status | `TRPCError` `NOT_FOUND` if absent | `api/expense-router.ts` |
| 6 | **Core Ledger** | Indexed Wallet Transfers | Executes transfers between wallets via indexed `walletId` foreign keys | `fromWalletId`, `toWalletId`, `amount` | Updated wallet balances | `TRPCError` on insufficient funds | `api/wallet-router.ts` |
| 7 | **Classification** | Muscle Memory Lookup | Matches exact normalized phrase against user dictionary and history | `text`, `userId`, `userType` | Parsed items (`<1ms`) | Falls through to Layer 2 on miss | `api/lib/muscle-memory.ts` |
| 8 | **Classification** | Egyptian Rule Engine | Evaluates regex for known Egyptian brands and slang directionality | `text` | Parsed items (`2ms`) | Falls through to Layer 3 on miss | `api/lib/rule-engine.ts` |
| 9 | **Classification** | Vector Semantic Match | Matches transaction against merchant embeddings using Qwen 768-dim vectors | `text` | Parsed items (`15ms`) | Falls through to Layer 4 on $<0.88$ | `api/lib/smart-pipeline.ts` |
| 10 | **Classification** | Multi-Intent Decompose | Decomposes multi-item Egyptian narrative into structured JSON | `text` | Array of discrete expenses | Fallback to manual review | `api/lib/narrative-decomposer.ts` |
| 11 | **AI Center** | SQL Fast Path | Instant 0-token answers for spending totals (*"صرفت كام؟"*) | Egyptian question string | Aggregated total in Arabic | Falls back to RAG/LLM on complex query | `api/services/finance-semantic-layer/resolvers.ts` |
| 12 | **AI Center** | Action Draft Proposal | Creates a pending action proposal with risk rating for user approval | User action intent | Interactive UI card | Rejects unauthorized or expired actions | `api/services/action-runtime/` |
| 13 | **AI Memory** | Hybrid RAG Recall | Retrieves durable user preferences using hybrid lexical-semantic scoring | Question text | Top ranked memory facts | Returns empty if below threshold | `api/services/ai-memory/` |
| 14 | **Integrations** | Zero-Polling OTP SSE | Pushes WhatsApp pairing confirmation instantly over SSE | `phone` query parameter | SSE event stream | 15-second keepalive timeout | `api/boot.ts`, `api/admin-whatsapp-router.ts` |
| 15 | **Integrations** | Paymob Webhook | Verifies Paymob SHA-512 HMAC on subscription checkout | Paymob webhook payload | HTTP 200 OK | HTTP 401 on HMAC mismatch | `api/boot.ts`, `api/pro-router.ts` |
| 16 | **Analytics** | Paginated User Stats | Retrieves user spending analytics with bounded pagination | `limit`, `offset` | `{ total, users }` | `TRPCError` on invalid bounds | `api/analytics-router.ts` |
| 17 | **Auditing** | Classification Trace Link | Provides exact explanation for past categorization decisions | `expenseId` | Stored `classificationLog` trace | Reports "no saved trace" for legacy rows | `api/expense-router.ts`, `docs/08` |
| 18 | **Auditing** | Settings Cache Hook | Caches global settings in RAM with instant invalidation on update | Settings key-value pairs | Cached settings object | Bypasses cache if invalidated | `api/lib/settings-cache.ts` |

### Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---|---|---|
| 1 | Egyptian Slang Decompose | `"دفعت 200 اكل و50 مواصلات"` | Accurately split into two expenses: 200 EGP (food) and 50 EGP (transport). |
| 2 | Egyptian Conjunction Prefix | `"100 جنيه مواصلات وب50 جنيه أكل"` | Strips attached `"وب"` prefix without corrupting the amount or category. |
| 3 | Waw-Initial Arabic Words | `"دفعت 100 جنيه وجبة كشري"` | Preserves `"وجبة"` as part of food context; does NOT treat `"و"` as a split conjunction. |
| 4 | Multi-Word Theophoric Names | `"سلفت عبد الرحمن 5000"` | Retains compound name `"عبد الرحمن"` intact; extracts 5000 EGP. |
| 5 | Disambiguation: Person vs Merchant | `"ركبت كريم بـ 50"` vs `"اديت كريم 100"` | `"ركبت كريم"` classifies as Transport (Careem); `"اديت كريم"` classifies as Contact Transfer (Kareem). |
| 6 | Unknown Contact Ingestion | `"حولت لمصطفى 500"` (unknown contact) | Emits clarification question `"مين مصطفى؟"` instead of silently guessing relationship. |
| 7 | Zero-Baseline Period Comparison | Query comparing to a period with 0 prior spending | Returns natural Arabic explanation of zero baseline instead of infinite/0% claims. |
| 8 | Numeric Hallucination Guard | LLM output claiming ungrounded numbers | `validateNumbersAgainstFacts()` blocks hallucinated metrics and injects grounded facts. |
| 9 | Dev QA Limit Bypass | `devQaBypassDailyLimit: true` in development | Bypasses daily AI rate limit for testing; strictly ignored under `NODE_ENV === "production"`. |
| 10 | Headless Voice Call Automation | Headless browser without microphone | Displays fallback message without crashing or hanging the test runner. |

---

## 12. 🏁 Conclusion & Verification Roadmap

SmartSpend AI's architecture is completely specified across all 48 database tables, 22 tRPC sub-routers, 5-layer classification waterfall, and 31 system flaws.

### Independent Verification Commands
```bash
# 1. Type validation across monorepo
npm run check

# 2. Complete test suite verification (424 tests across 68 suites)
npm test

# 3. Full build verification
npm run backend:build
npm run frontend:build
```
