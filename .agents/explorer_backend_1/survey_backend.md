# SmartSpend AI — Comprehensive Backend & Architecture Audit Report

> **SSoT Survey Phase Report**  
> **Agent:** Backend & Architecture Explorer (`teamwork_preview_explorer`)  
> **Date:** August 23, 2026  
> **Workspace Root:** `E:/smartspend_V1_fixed/`  
> **Target Scope:** 48 Database Tables, 22 tRPC Sub-Routers, Dual-Auth Architecture, Transactional Boundaries, Settings Cache, and System Flaws.

---

## 1. 🏗️ Executive Architectural Summary

SmartSpend AI implements a modern TypeScript monorepo architecture leveraging Hono v4, tRPC v11, Drizzle ORM, and MySQL 8. The backend operates in two execution modes:
1. **Monorepo Integrated Mode (`api/boot.ts`):** Mounts the Hono application directly into the Vite development pipeline or unified production server with static SPA fallback.
2. **Standalone Server Mode (`api/server.ts`):** Wraps `boot.ts` for independent backend deployment, attaching a standalone `WebSocketServer` for live voice streaming over `/api/voice/live`.

### Request Lifecycle Flow
```
Client Request (Browser / Mobile / Shortcut / Webhook)
  │
  ├──► Hono App (`api/boot.ts`)
  │      ├── Sentry Profiling & Error Tracking
  │      ├── CORS Middleware (Whitelisting APP_URL, FRONTEND_URL, and dev tunnels)
  │      ├── CSRF Middleware (Origin validation)
  │      ├── Native Endpoints:
  │      │     ├── GET  /health
  │      │     ├── GET  /api/auth/google/callback
  │      │     ├── GET  /api/sse/otp (Zero-polling Server-Sent Events)
  │      │     ├── POST /api/webhooks/paymob (HMAC-SHA512 validation)
  │      │     └── Sub-App: /api/sms (`api/sms-router.ts`)
  │      └── tRPC Router: /api/trpc/*
  │             │
  │             ├──► Context Resolver (`api/context.ts`)
  │             │      ├── 1. `google_session` cookie -> JWT verify -> DB sessions check -> `users` table
  │             │      └── 2. `Authorization: Bearer` -> JWT verify -> DB sessions check -> `users` / `localUsers`
  │             │
  │             ├──► Middleware Procedures (`api/middleware.ts`)
  │             │      ├── publicProcedure (400 req/min IP cap)
  │             │      ├── strictPublicProcedure (25 req/15min IP cap)
  │             │      ├── authedProcedure (100 req/min User cap)
  │             │      ├── aiProcedure (100 req/min AI cap + Abuse guard)
  │             │      ├── moderatorProcedure (role: admin | moderator)
  │             │      ├── adminProcedure (role: admin)
  │             │      ├── proProcedure (plan: pro | ultra | role: admin)
  │             │      └── ultraProcedure (plan: ultra | role: admin)
  │             │
  │             └──► Master Router (`api/router.ts` -> 22 Sub-Routers)
  │                    └── Business Logic & Drizzle ORM Mutations (`db/schema.ts`)
```

---

## 2. 🗄️ Database Schema & Relational Integrity Audit (All 48 Tables)

All 48 tables defined in `db/schema.ts` have corresponding relational mappings in `db/relations.ts`. Because SmartSpend implements a dual-user identity model (`users` for Google OAuth and `localUsers` for phone/password/OTP users), all user-scoped tables utilize polymorphic `userId` (int) + `userType` ("oauth" | "local") columns.

### Logical Group Breakdown (48 Tables)

#### Group A: Identity & Sessions (6 Tables)
1. **`users` (`db/schema.ts:17`):** OAuth user identity. Primary key `id`. Columns: `unionId` (unique), `name`, `email` (unique), `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `aiTokensUsed`, `currentStreak`, `highestStreak`, `lastStreakAt`. Indexes: `role`, `plan`, `referralCode`, `referredBy`.
2. **`localUsers` (`db/schema.ts:48`):** Phone/password user identity. Primary key `id`. Columns: `name`, `phone` (unique), `password`, `email`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `aiTokensUsed`, `currentStreak`, `highestStreak`, `lastStreakAt`. Indexes: `role`, `plan`, `referredBy`.
3. **`sessions` (`db/schema.ts:282`):** Active user sessions. Columns: `userId`, `userType`, `token`, `ipAddress`, `userAgent`, `expiresAt`. Indexes: `(userId, userType)`, `token`.
4. **`userCredentials` (`db/schema.ts:799`):** SimpleWebAuthn Passkey credentials. Columns: `id` (credential ID base64url), `userId`, `userType`, `publicKey`, `counter`, `deviceType`, `backedUp`, `transports`, `lastUsedAt`. Indexes: `(userId, userType)`.
5. **`authChallenges` (`db/schema.ts:821`):** Ephemeral WebAuthn challenge tokens. Columns: `id` (session ID), `userId`, `userType`, `challenge`, `expiresAt`.
6. **`webhookTokens` (`db/schema.ts:653`):** Companion app API tokens (Android / iOS Shortcut). Columns: `token`, `userId`, `userType`, `name`. Indexes: `(userId, userType)`, `token`.

#### Group B: Financial Core Ledger (6 Tables)
7. **`expenses` (`db/schema.ts:79`):** Primary financial ledger. Columns: `userId`, `userType`, `type` (expense/income/transfer/investment), `amount` (decimal 12,2), `category`, `subCategory`, `description`, `rawText`, `source`, `placeHint`, `parsedMetadata`, `contactId`, `classificationLogId`, `businessId`, `walletId`, `clientRequestId`, `date`, `status`. Indexes: 10 indexes including composite `(userId, userType, date)` and unique `(userId, userType, clientRequestId)` for idempotency.
8. **`expenseCategories` (`db/schema.ts:225`):** Custom user categories. Columns: `userId`, `userType`, `name`, `icon`, `color`, `isDefault`. Indexes: `(userId, userType)`.
9. **`userWallets` (`db/schema.ts:240`):** Financial accounts (InstaPay, Vodafone Cash, Bank accounts). Columns: `userId`, `userType`, `name`, `provider`, `lastFourDigits`, `balance`. Indexes: `(userId, userType)`.
10. **`financialGoals` (`db/schema.ts:670`):** Savings and debt goals. Columns: `userId`, `userType`, `title`, `targetAmount`, `targetDate`, `status`, `aiPlan`, `aiAlerts`. Indexes: `(userId, userType)`, `status`.
11. **`userBudgets` (`db/schema.ts:695`):** Spending budgets. Columns: `userId`, `userType`, `title`, `category`, `monthlyLimit`, `periodStartDay`, `linkedGoalId`, `alertThresholdPercent`, `status`. Indexes: `(userId, userType, status)`, `category`, `linkedGoalId`.
12. **`monthlyReports` (`db/schema.ts:256`):** Generated monthly financial statements. Columns: `userId`, `userType`, `month`, `totalAmount`, `totalIncome`, `categoryBreakdown`, `insights`, `aiReport`. Indexes: `(userId, userType)`, `month`.

#### Group C: Freelance & Contact Relationships (4 Tables)
13. **`userBusinesses` (`db/schema.ts:129`):** Freelance/business ledger profiles. Columns: `userId`, `userType`, `name`, `type`, `typeLabel`, `description`, `keywords`, `isActive`. Indexes: `(userId, userType)`, `isActive`.
14. **`businessCategories` (`db/schema.ts:153`):** Business-specific tax deduction and expense categories. Columns: `businessId`, `name`, `nameAr`, `type`, `keywords`, `matchExamples`, `isActive`. Indexes: `businessId`.
15. **`userContacts` (`db/schema.ts:176`):** Directory of contacts. Columns: `userId`, `userType`, `name`, `relationship`, `isSilenced`, `transactionCount`, `businessId`, `contactType`. Indexes: `(userId, userType)`.
16. **`pendingClarifications` (`db/schema.ts:204`):** Incomplete transactions awaiting user clarification. Columns: `userId`, `userType`, `expenseId`, `question`, `originalText`, `status`, `contextData`. Indexes: `(userId, userType)`, `status`, `expenseId`.

#### Group D: AI Layer & Behavioral Memory (12 Tables)
17. **`aiSummaries` (`db/schema.ts:360`):** Periodic AI trend summaries.
18. **`aiConversationSummaries` (`db/schema.ts:934`):** Chat token conservation capsules.
19. **`aiMemoryItems` (`db/schema.ts:957`):** Persistent user preferences & memory items.
20. **`aiMemoryEmbeddings` (`db/schema.ts:986`):** 768-dim Fireworks vector embeddings.
21. **`aiActionMemory` (`db/schema.ts:1012`):** Autonomous agent executed action history.
22. **`aiPendingActions` (`db/schema.ts:1036`):** Action proposal drafts awaiting user confirmation.
23. **`aiActionAuditLogs` (`db/schema.ts:1067`):** Action proposal execution audit logs.
24. **`classificationLogs` (`db/schema.ts:602`):** 5-layer classification pipeline audit logs.
25. **`onboardingQuestions` (`db/schema.ts:572`):** Onboarding questionnaire definitions.
26. **`userDictionaries` (`db/schema.ts:584`):** User vocabulary and muscle-memory keyword overrides.
27. **`profileLearningEvents` (`db/schema.ts:516`):** Correction events for AI profile learning.
28. **`monthlyBehaviorSnapshots` (`db/schema.ts:536`):** Longitudinal user spending behavior vectors.

#### Group E: Conversational AI & Communications (5 Tables)
29. **`chatConversations` (`db/schema.ts:894`):** AI chat threads.
30. **`chatMessages` (`db/schema.ts:914`):** Chat messages and tool call results.
31. **`rawSmsEvents` (`db/schema.ts:722`):** Ingested bank SMS messages.
32. **`whatsappOtpCodes` (`db/schema.ts:742`):** WhatsApp OTP verification challenges.
33. **`voiceUsage` (`db/schema.ts:638`):** Voice STT and live call usage records.

#### Group F: System Operations & Notifications (15 Tables)
34. **`systemSettings` (`db/schema.ts:480`):** Global dynamic configuration parameters.
35. **`userProfiles` (`db/schema.ts:487`):** Demographic, lifestyle, and inferred financial profile data.
36. **`userAnalytics` (`db/schema.ts:301`):** Clickstream and AI telemetry events.
37. **`supportTickets` (`db/schema.ts:318`):** Support tickets and moderator replies.
38. **`discountCodes` (`db/schema.ts:344`):** Promotional discount codes.
39. **`ads` (`db/schema.ts:384`):** Native advertisement banners and sponsor cards.
40. **`adClicks` (`db/schema.ts:406`):** Ad click telemetry.
41. **`referrals` (`db/schema.ts:420`):** Referral tracking ledger.
42. **`proSubscriptions` (`db/schema.ts:444`):** Pro and Ultra subscription records.
43. **`seoPages` (`db/schema.ts:466`):** Dynamic landing pages.
44. **`apiKeyErrors` (`db/schema.ts:758`):** Provider API error logging and fallback alerts.
45. **`pushSubscriptions` (`db/schema.ts:782`):** WebPush & FCM push subscription tokens.
46. **`notificationTemplates` (`db/schema.ts:833`):** Notification message templates.
47. **`inAppNotifications` (`db/schema.ts:856`):** In-app notification bell alerts.
48. **`notificationLogs` (`db/schema.ts:875`):** Notification delivery history.

---

## 3. 🔑 Dual-Auth & Security Architecture Audit

### Dual-User Identity Mechanism
SmartSpend distinguishes between two user pools:
1. **Google OAuth Users (`users` table):** Authenticated via Google OAuth 2.0. Server issues a signed JWT stored in the HTTP-only `google_session` cookie (and active session record in `sessions`).
2. **Local Users (`localUsers` table):** Authenticated via Egyptian phone number (`01xxxxxxxxx`), bcrypt-hashed password, and optional zero-polling WhatsApp OTP. Server issues a signed JWT transmitted via `Authorization: Bearer <token>` (and active session record in `sessions`).

### Context Resolution (`api/context.ts`)
The `createContext` function resolves requests uniformly into `UnifiedUser`:
- Checks `google_session` cookie -> verifies JWT signature -> verifies unexpired session in `sessions` table (`userType: "oauth"`) -> retrieves user from `users`.
- If no cookie user, checks `Authorization: Bearer <token>` -> verifies JWT signature -> verifies unexpired session in `sessions` table (`userType: tokenUserType`) -> retrieves user from `users` or `localUsers`.

### Discovered Dual-Auth Security & Consistency Issues:
1. **`localUsers.avatar` Omission (`api/context.ts:138-147`):** When resolving a local user, `context.ts` constructs `user = { id, name, email, role, plan, type: "local", phone }`, omitting `avatar: dbUser.avatar` even though `localUsers` has an `avatar` column (`schema.ts:56`).
2. **Phone Number Sanitization Discrepancy (`api/local-auth-router.ts:72, 128`):** During local user registration, `cleanPhone = cleanPhoneNumber(input.phone)` is used for the duplicate check, but `input.phone` (raw string) is inserted into `localUsers.phone` on line 128. Later, `login` queries by `cleanPhone`.
3. **Session Revocation Bypass in SMS Router (`api/sms-router.ts:133-170`):** `getUserFromSession` only cryptographically verifies the JWT signature with `verify(token, env.JWT_SECRET)` and fails to check the `sessions` database table. Revoked session tokens can still interact with SMS protected endpoints.
4. **Incomplete User Deletion Cascades (`api/local-auth-router.ts:348-372` & `api/admin-router.ts:360-384`):** When deleting a user, `deleteUser` only deletes records from 19 tables, leaving orphaned rows in `userCredentials`, `authChallenges`, `pushSubscriptions`, `chatConversations`, `chatMessages`, `aiConversationSummaries`, `aiMemoryItems`, `aiMemoryEmbeddings`, `aiActionMemory`, `aiPendingActions`, `aiActionAuditLogs`, `userBusinesses`, `userContacts`, `financialGoals`, `userBudgets`, `adClicks`, and `referrals`.
5. **Dashboard User Count Bias (`api/analytics-router.ts:165-168`):** In `getDashboardStats`, `adminCount`, `moderatorCount`, and `proCount` are queried exclusively from `localUsers`. All OAuth users (`users` table) with administrative roles or Pro/Ultra subscriptions are excluded from dashboard counts.

---

## 4. 🔀 Master tRPC Sub-Routers Audit (All 22 Sub-Routers)

| Sub-Router | File Location | Procedure Protection | Core Functionality | Audit Findings & Bugs |
| :--- | :--- | :--- | :--- | :--- |
| `auth` | `api/auth-router.ts` | `public` / `strictPublic` / `authed` | Google OAuth callback & token issuance | Correctly registers session in `sessions` table. Logout deletes session. |
| `localAuth` | `api/local-auth-router.ts` | `strictPublic` / `authed` / `admin` | Phone/password signup, login, OTP pairing | Raw `input.phone` inserted on line 128. `deleteUser` misses 14+ tables. |
| `expense` | `api/expense-router.ts` | `authedProcedure` | Transaction CRUD, bulk create, auto-learn | ACID `db.transaction()` applied to `create`, `batchCreate`, `delete`. Non-transactional fallback in `answerClarification` (line 1857). |
| `ai` | `api/ai-router.ts` | `aiProcedure` / `authed` | 5-layer classification, voice STT, monthly insights | `aiTokensUsed` update uses `sql`ai_tokens_used + ${tokens}`` without COALESCE. |
| `analytics` | `api/analytics-router.ts` | `authed` / `moderator` | Clickstream telemetry, paginated stats | Dashboard metrics omit OAuth users for admin/moderator/pro counts (lines 165-168). |
| `admin` | `api/admin-router.ts` | `adminProcedure` | System settings, user role/plan management | `setUserTokenLimit` (line 1355) directly writes to `systemSettings` without calling `invalidateSettingsCache()`. |
| `adminWhatsapp`| `api/admin-whatsapp-router.ts` | `adminProcedure` | WhatsApp bot status & QR bridge | Fully connected to `whatsappService` with SSE events. |
| `support` | `api/support-router.ts` | `authed` / `moderator` / `admin` | Support ticket CRUD & resolution | Throws generic `new Error("غير مصرح")` on lines 83 & 201 instead of `TRPCError`. |
| `export` | `api/export-router.ts` | `authed` / `pro` / `moderator` | CSV, XLSX, JSON, HTML exports | Hardcoded 5,000 row limits without cursor pagination in `allUsers` (line 119). |
| `session` | `api/session-router.ts` | `authed` / `moderator` | Session listings & token revocation | `sessions.ipAddress` and `userAgent` never populated in `createSession`. |
| `pro` | `api/pro-router.ts` | `authed` / `admin` | Paymob checkout, upgrade simulation | `listSubscriptions` (line 181) ignores `status` filter in total count query. |
| `ads` | `api/ads-router.ts` | `public` / `authed` / `admin` | Native sponsorship cards & click tracking | `delete` ad (line 122) does not delete child rows from `adClicks`. |
| `referral` | `api/referral-router.ts` | `authed` / `admin` | Referral codes & commission tracking | `applyCode` (lines 153-166) performs non-transactional dual write. |
| `seo` | `api/seo-router.ts` | `publicProcedure` | Landing page schema metadata | Clean schema queries by slug. |
| `profile` | `api/profile-router.ts` | `authedProcedure` | Profile attributes & contacts hub | `deleteContact` (line 723) and `mergeContacts` (line 820) execute non-transactional multi-step writes. |
| `wallet` | `api/wallet-router.ts` | `authedProcedure` | Wallet management & transactions | Indexed query `expenses.walletId`. Balances are not automatically modified on expense creation. |
| `image` | `api/image-router.ts` | `proProcedure` | Receipt OCR & Gemini 3.1 Flash vision | `expenseId` is returned as `null` on line 186. Does not run in transaction or update streaks. |
| `goals` | `api/goals-router.ts` | `authed` / `proProcedure` | Savings targets & AI planning | `delete` goal (line 297) does not nullify `userBudgets.linkedGoalId`. |
| `budget` | `api/budget-router.ts` | `authedProcedure` | Category spending limits & thresholds | `list` (lines 25-44) completely ignores `periodStartDay`, hardcoding calendar month 1-31. |
| `webauthn` | `api/webauthn-router.ts` | `public` / `authedProcedure` | SimpleWebAuthn Passkey registration/login | `origin` hardcoded to `http://localhost:5173` in development (lines 33-36). |
| `chat` | `api/chat-router.ts` | `aiProcedure` / `authed` | Conversational RAG assistant & tools | `clearConversation` (line 1133) deletes messages & conversations without transaction, leaving orphaned capsules. |
| `business` | `api/business-router.ts` | `authedProcedure` | Freelancer mode & business ledger | `getApiKey` (line 37) executes raw SQL on `system_settings` bypassing `getSystemSettings()`. |

---

## 5. ⚖️ Transactional Boundaries & ACID Integrity Audit

Financial ledger accuracy is paramount for an Egyptian financial companion. The audit evaluated all write operations across the codebase:

### Verified ACID Compliant Operations
- `expenseRouter.create` (`api/expense-router.ts:336-364`): Wrapped in `db.transaction(async (tx) => { ... })`. Atomically writes expense, updates `userContacts.transactionCount`, and updates streaks.
- `expenseRouter.batchCreate` (`api/expense-router.ts:430-444`): Wrapped in `db.transaction()`. Atomically writes all batch expenses, updates multiple contact counts, and updates streaks.
- `expenseRouter.delete` (`api/expense-router.ts:771-782`): Wrapped in `db.transaction()`. Atomically deletes expense and decrements `userContacts.transactionCount`.
- `walletRouter.deleteWallet` (`api/wallet-router.ts:100-122`): Wrapped in `db.transaction()`. Atomically nullifies `expenses.walletId` before deleting the wallet.

### Identified Transactional Gaps (Non-ACID Operations)
1. **Contact Deletion & Merging (`api/profile-router.ts:723-738, 820-845`):** `deleteContact` and `mergeContacts` update linked expenses, profile lifestyle arrays, and contact records sequentially without a `db.transaction()`. A connection drop mid-mutation corrupts contact associations.
2. **Clarification Fallback Branch (`api/expense-router.ts:1856-1895`):** In `answerClarification`, the fallback branch loops through items inserting expenses without `db.transaction()`, without `resolveExpenseReferences`, and without streak updates.
3. **Receipt Image Ingestion (`api/image-router.ts:156-174`):** Expense creation in `parseReceipt` is not executed inside a transaction and omits streak updates and budget checks.
4. **SMS Ingestion (`api/sms-router.ts:450-489`):** Inserting into `expenses` and updating `rawSmsEvents` to `"processed"` are two separate queries without transaction isolation.
5. **Referral Code Application (`api/referral-router.ts:153-166`):** Inserting into `referrals` and updating `users.referredBy` are separate non-transactional queries.
6. **Chat Thread Cleanup (`api/chat-router.ts:1156-1163`):** Deleting messages and conversations are separate queries without transaction protection.

---

## 6. 🐛 Comprehensive System Flaws & Backend Code Citations

The following catalog provides exact file paths and line citations for backend bugs, architectural mismatches, and data integrity vulnerabilities:

| Flaw ID | Category | Summary / Description | Exact File & Line Citations |
| :--- | :--- | :--- | :--- |
| **FLAW-BE-01** | Dual-Auth | `UnifiedUser` omits `avatar` for local users in context resolution | `api/context.ts:138-147` |
| **FLAW-BE-02** | Dual-Auth | Phone registration saves uncleaned raw string instead of `cleanPhone` | `api/local-auth-router.ts:128` |
| **FLAW-BE-03** | Auth / Security | SMS router session helper bypasses database session revocation check | `api/sms-router.ts:133-170` |
| **FLAW-BE-04** | Data Integrity | `deleteUser` in localAuthRouter misses 14+ tables, leaving orphaned records | `api/local-auth-router.ts:348-372` |
| **FLAW-BE-05** | Data Integrity | `deleteUser` in adminRouter misses businesses, contacts, budgets, goals, WebAuthn | `api/admin-router.ts:360-384` |
| **FLAW-BE-06** | Analytics | `getDashboardStats` counts admin, moderator, pro users only from `localUsers` | `api/analytics-router.ts:165-168` |
| **FLAW-BE-07** | Cache Violation | `setUserTokenLimit` updates `system_settings` without invalidating cache | `api/admin-router.ts:1355-1381` |
| **FLAW-BE-08** | Cache Violation | `businessRouter.getApiKey` executes direct raw SQL on `system_settings` | `api/business-router.ts:37-49` |
| **FLAW-BE-09** | Error Standards | `supportRouter` throws generic JS `new Error("غير مصرح")` instead of `TRPCError` | `api/support-router.ts:83, 201` |
| **FLAW-BE-10** | Error Standards | `expenseRouter.answerClarification` throws generic JS `Error` | `api/expense-router.ts:1729, 1904` |
| **FLAW-BE-11** | Business Logic | `budgetRouter.list` ignores user-configured `periodStartDay` (salary day) | `api/budget-router.ts:25-44` |
| **FLAW-BE-12** | Business Logic | `proRouter.listSubscriptions` total count query ignores `status` filter | `api/pro-router.ts:181` |
| **FLAW-BE-13** | Bug / Response | `imageRouter.parseReceipt` always returns `expenseId: null` | `api/image-router.ts:154, 186` |
| **FLAW-BE-14** | Data Integrity | `goalsRouter.delete` does not nullify `userBudgets.linkedGoalId` | `api/goals-router.ts:297` |
| **FLAW-BE-15** | Data Integrity | `adsRouter.delete` leaves orphaned click records in `adClicks` | `api/ads-router.ts:122` |
| **FLAW-BE-16** | ACID Gap | `profileRouter.deleteContact` executes non-transactional multi-step mutation | `api/profile-router.ts:723-738` |
| **FLAW-BE-17** | ACID Gap | `profileRouter.mergeContacts` executes non-transactional multi-step mutation | `api/profile-router.ts:820-845` |
| **FLAW-BE-18** | ACID Gap | `chatRouter.clearConversation` non-transactional delete leaves orphaned capsules | `api/chat-router.ts:1156-1163` |
| **FLAW-BE-19** | ACID Gap | `referralRouter.applyCode` dual-write lacks transaction wrapper | `api/referral-router.ts:153-166` |
| **FLAW-BE-20** | ACID Gap | `smsRouter.ingest` expense insert and event update lack transaction | `api/sms-router.ts:450-489` |
| **FLAW-BE-21** | Ledger / Wallet | Expense creation does not update `userWallets.balance` | `api/expense-router.ts:337-353` |
| **FLAW-BE-22** | WebAuthn | WebAuthn origin hardcoded to `http://localhost:5173` in dev | `api/webauthn-router.ts:33-36` |
| **FLAW-BE-23** | SQL Safety | Token increment uses `sql`ai_tokens_used + ${tokens}`` without COALESCE | `api/ai-router.ts:431, chat-router.ts:719` |
| **FLAW-BE-24** | Session Info | `createSession` never populates `ipAddress` or `userAgent` in `sessions` table | `api/local-auth-utils.ts:38-43` |
| **FLAW-BE-25** | Polymorphic FK | `users.referredBy` lacks `referredByType`, creating ambiguous user links | `db/schema.ts:28, 60` |

---

## 7. 🚀 Recommended Remediation & Hardening Roadmap

1. **Transactional Consolidation:** Create a centralized helper `withTransaction()` or wrap all multi-table mutations (`deleteContact`, `mergeContacts`, `clearConversation`, `applyCode`, `smsIngest`) in `db.transaction()`.
2. **Dual-Auth Normalization:**
   - Update `api/context.ts` line 144 to include `avatar: dbUser.avatar`.
   - Update `api/local-auth-router.ts` line 128 to store `cleanPhone`.
   - Update `api/sms-router.ts` to check active session presence in the database.
3. **Comprehensive Cascade Cleanup:** Implement a unified `purgeUserData(userId, userType, tx)` service used by both `localAuthRouter.deleteUser` and `adminRouter.deleteUser` that cleans all 35 user-owned tables atomically.
4. **Salary Day Budget Calculation:** Refactor `budgetRouter.list` to call `getFinancialMonthDates(currentMonth, b.periodStartDay)` per budget item.
5. **Settings Cache Enforcement:** Replace direct SQL queries in `businessRouter` and `adminRouter` with `getSystemSettings()` and guarantee `invalidateSettingsCache()` is called on every configuration update.

---
*Report compiled by Backend & Architecture Explorer (teamwork_preview_explorer).*
