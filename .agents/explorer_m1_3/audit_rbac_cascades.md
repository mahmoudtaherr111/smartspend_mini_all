# SmartSpend AI — Deep Security & Architectural Audit Report
## RBAC Middleware, WebAuthn Passkeys, and Cascading Deletion Relational Integrity

> **Audit Identifier:** Milestone 1 — Security Audit (`explorer_m1_3`)  
> **Target Systems:** RBAC Middleware (`api/middleware.ts`), WebAuthn Passkeys (`api/webauthn-router.ts`), User Deletion & Cascades (`api/admin-router.ts`, `api/local-auth-router.ts`, `api/profile-router.ts`), Database Schema & Relations (`db/schema.ts`, `db/relations.ts`).  
> **Date of Audit:** August 23, 2026  
> **Integrity Mode:** Development (Read-Only Investigation)  
> **Auditor:** Teamwork Security Explorer (`explorer_m1_3`)

---

## 1. 🎯 Executive Summary

A comprehensive security and architectural audit was performed on the SmartSpend AI platform focusing on:
1. **Role-Based Access Control (RBAC) & Rate Limiting:** Verification of procedural gates, strict isolation between administrative roles (`user.role`) and subscription tiers (`user.plan`), rate limit thresholds, and privilege elevation vectors.
2. **WebAuthn Biometric Passkey Flow:** Cryptographic challenge generation, public key attestation/assertion verification, counter-based replay attack mitigation, RP ID/origin configuration, and credential lifecycle management.
3. **Dual-User Cascading Account Deletion & Relational Integrity:** Complete audit of all 48 database tables against dual-user deletion routines (`adminRouter.deleteUser` and `localAuthRouter.deleteUser`) to identify orphaned tables, data leaks, and ACID boundary gaps.

### Key Audit Findings at a Glance
* **Critical Cascading Deletion Flaws:** Neither `adminRouter.deleteUser` nor `localAuthRouter.deleteUser` deletes user data comprehensively. Out of 35 user-scoped tables, `adminRouter.deleteUser` completely misses **18 tables** and `localAuthRouter.deleteUser` misses **17 tables**, leaving sensitive conversational histories (`chatConversations`, `chatMessages`), persistent AI memories (`aiMemoryItems`, `aiMemoryEmbeddings`, `aiActionMemory`), biometric credentials (`userCredentials`, `authChallenges`), and business records (`userBusinesses`, `businessCategories`, `userContacts`) orphaned in the database.
* **Unprotected AI Feature & Plan Downgrade in Business Router:** `businessRouter` protects all endpoints with `authedProcedure` instead of `proProcedure`. The `suggestCategories` endpoint invokes Google Gemini AI (`gemini-3.1-flash-lite`) without requiring a Pro subscription and without enforcing `aiProcedure` rate limits.
* **Unused Security Procedures:** `ultraProcedure` is exported in `api/middleware.ts` but is **never used** across any of the 22 tRPC sub-routers.
* **WebAuthn Configuration Hardcoding & Missing Revocation:** WebAuthn RP ID and Origin are hardcoded to `"localhost"` / `"http://localhost:5173"` in development and `"smartspend.ai"` in production, ignoring custom domains, staging tunnels (`loca.lt`), and ports. Additionally, no endpoints exist for users to list or revoke registered passkeys.
* **Non-Transactional Cascade Gaps in Entity Deletion:** Multiple entity deletion procedures (`businessRouter.delete`, `profileRouter.deleteContact`, `chatRouter.clearConversation`, `goalsRouter.delete`, `adsRouter.delete`) execute multi-step database mutations outside of `db.transaction()`, leaving orphaned foreign keys and desynchronized records.

---

## 2. 🛡️ RBAC Middleware & Procedure Security Audit

### 2.1 Role (`user.role`) vs. Plan (`user.plan`) Separation Architecture

SmartSpend AI strictly differentiates between administrative authorization and monetization subscription tiers:
* **Administrative Roles (`user.role`):** `"user"` | `"moderator"` | `"admin"`
  - Controls access to admin panels, system settings, moderator queues, and user management.
* **Subscription Tiers (`user.plan`):** `"free"` | `"pro"` | `"ultra"`
  - Controls feature accessibility (e.g., unlimited AI queries, receipt OCR, HTML export, freelance ledgers).

#### Procedure Definitions in `api/middleware.ts`
```typescript
// api/middleware.ts:58-126
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  // Enforces 100 req/min per user
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const aiProcedure = authedProcedure.use(async ({ ctx, next }) => {
  // Enforces AI rate limit (100 req/min)
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const moderatorProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية الوصول" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية الأدمن" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const proProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.plan !== "pro" && ctx.user.plan !== "ultra" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه الميزة متاحة فقط للبرو" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const ultraProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.plan !== "ultra" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه الميزة متاحة فقط لمشتركي الألترا 💎" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
```

### 2.2 RBAC Audit Evaluation & Procedure Distribution

| Router | File Location | Procedure Levels Used | Security & RBAC Evaluation |
| :--- | :--- | :--- | :--- |
| `auth` | `api/auth-router.ts` | `publicProcedure`, `authedProcedure` | Correct. Public callback and OAuth exchange. |
| `localAuth` | `api/local-auth-router.ts` | `strictPublicProcedure`, `authedProcedure`, `adminProcedure` | `updateRole` & `deleteUser` are correctly protected by `adminProcedure`. |
| `expense` | `api/expense-router.ts` | `authedProcedure` | User-scoped financial CRUD operations. |
| `ai` | `api/ai-router.ts` | `aiProcedure`, `authedProcedure` | ⚠️ **AI Limit Bypass:** `generateMonthlyInsights` (line 1988), `compareMonths` (line 2960), and `generateYearlyInsights` (line 3127) use `authedProcedure` instead of `aiProcedure`. `proProcedure` is imported on line 5 but never applied. |
| `analytics` | `api/analytics-router.ts` | `authedProcedure`, `moderatorProcedure` | `getAllUserStats` and `getDashboardStats` are properly gated by `moderatorProcedure`. |
| `admin` | `api/admin-router.ts` | `adminProcedure`, `moderatorProcedure` | Read-only logs (`getClassificationLogs`, `getActivityLog`, `getLearnedRules`, `getApiKeyErrors`) use `moderatorProcedure`; mutation endpoints use `adminProcedure`. |
| `adminWhatsapp` | `api/admin-whatsapp-router.ts` | `adminProcedure` | Full admin protection for QR code bridge and session restarts. |
| `support` | `api/support-router.ts` | `authedProcedure`, `moderatorProcedure`, `adminProcedure` | ⚠️ **Error Standard Violation:** `getById` (line 83) and `close` (line 201) throw generic `new Error("غير مصرح")` instead of `TRPCError({ code: "FORBIDDEN" })`. |
| `export` | `api/export-router.ts` | `authedProcedure`, `proProcedure`, `moderatorProcedure` | `monthlyReportHtml` correctly requires `proProcedure`; `allUsers` correctly requires `moderatorProcedure`. |
| `session` | `api/session-router.ts` | `authedProcedure`, `moderatorProcedure` | User can only revoke own sessions (`revokeMine`); `listAll` and `stats` require `moderatorProcedure`. |
| `pro` | `api/pro-router.ts` | `authedProcedure`, `adminProcedure` | Upgrade simulation is gated by `NODE_ENV !== "production"` and `BILLING_SIMULATE === "true"`. `listSubscriptions` uses `adminProcedure`. |
| `ads` | `api/ads-router.ts` | `publicProcedure`, `authedProcedure`, `adminProcedure` | Ad impressions are public; click tracking is authed; ad CRUD is admin-gated. |
| `referral` | `api/referral-router.ts` | `authedProcedure`, `adminProcedure` | Referral codes user-gated; `listAll` admin-gated. |
| `seo` | `api/seo-router.ts` | `publicProcedure` | Dynamic landing pages public read. |
| `profile` | `api/profile-router.ts` | `authedProcedure` | Profile, onboarding, contacts, and notifications. |
| `wallet` | `api/wallet-router.ts` | `authedProcedure` | Account balances and wallet CRUD. |
| `image` | `api/image-router.ts` | `proProcedure` | Receipt OCR correctly gated to Pro/Ultra users. |
| `goals` | `api/goals-router.ts` | `authedProcedure`, `proProcedure` | `analyze` requires `proProcedure`; free user limit capped at 3 goals. |
| `budget` | `api/budget-router.ts` | `authedProcedure` | Category budgets. |
| `webauthn` | `api/webauthn-router.ts` | `publicProcedure`, `strictPublicProcedure`, `authedProcedure` | Biometric options and verification. |
| `chat` | `api/chat-router.ts` | `aiProcedure`, `authedProcedure` | Chat messages and actions use `aiProcedure`. |
| `business` | `api/business-router.ts` | `authedProcedure` | ⚠️ **Plan Isolation Violation:** Freelance ledger and `suggestCategories` (Gemini API calls) use `authedProcedure` instead of `proProcedure`. |

### 2.3 Rate Limiting Architecture & Edge Cases

1. **IP-Based Limiting (`api/lib/rate-limit.ts`):**
   - `publicIpLimiter`: Fixed window, 400 requests / 60,000ms per IP (`pub:${ctx.ip}`).
   - `strictPublicIpLimiter`: Fixed window, 25 requests / 900,000ms (15 minutes) per IP (`strict:${ctx.ip}`).
2. **User-Based Limiting (`api/middleware.ts`):**
   - `rateLimitMap`: 100 requests / 60,000ms per user (`${user.type}:${user.id}`).
   - `aiRateLimitMap`: 100 requests / 60,000ms per user (`${user.type}:${user.id}`).
3. **Memory Leak Protection:**
   - Background timer `cleanupInterval` executes every 5 minutes (`api/middleware.ts:39-55`), deleting entries where `entry.resetAt < Date.now()`. `cleanupInterval.unref()` ensures smooth server shutdown.
4. **Proxy IP Spoofing & Throttling Risk (`api/lib/get-client-ip.ts:16-40`):**
   - Forwarded headers (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`) are only parsed if `env.TRUST_PROXY === "true"`.
   - **Risk:** If deployed in production behind an Nginx or Cloudflare reverse proxy without setting `TRUST_PROXY="true"`, all incoming requests will resolve to `"127.0.0.1"`, sharing a single 400 req/min bucket across all concurrent users.

---

## 3. 🔑 WebAuthn Passkeys End-to-End Flow Audit

### 3.1 Architecture & Database Tables

WebAuthn Passkey support is powered by `@simplewebauthn/server` and backed by two tables in `db/schema.ts`:
1. **`userCredentials` (`db/schema.ts:799-818`):** Stored public keys, credential IDs (base64url), counters, device types (`singleDevice` | `multiDevice`), and transports (`"internal,usb,ble,nfc"`).
2. **`authChallenges` (`db/schema.ts:821-830`):** Ephemeral cryptographic challenge strings indexed by `(userId, userType)` with an expiration timestamp (`expiresAt`).

```
[Client (Browser / Native Authenticator)]
      │
      ├── 1. POST generateRegistrationOptions (authedProcedure)
      │      └── Creates options + saves challenge to authChallenges (5 min TTL)
      │
      ├── 2. POST verifyRegistration (authedProcedure)
      │      └── Validates attestation response -> saves public key in userCredentials -> deletes challenge
      │
      ├── 3. POST generateAuthenticationOptions (strictPublicProcedure)
      │      └── Creates random sessionId UUID -> saves challenge to authChallenges (5 min TTL)
      │
      └── 4. POST verifyAuthentication (strictPublicProcedure)
             └── Validates signature against stored publicKey in userCredentials
                 -> Increments counter (anti-replay) -> deletes challenge
                 -> Issues Bearer JWT via generateToken() + creates session in sessions table
```

### 3.2 WebAuthn Vulnerabilities & Edge Cases

#### 1. Hardcoded RP ID and Origin (`api/webauthn-router.ts:31-36`)
```typescript
// api/webauthn-router.ts:31-36
const rpName = "SmartSpend";
const rpID = process.env.NODE_ENV === "production" ? "smartspend.ai" : "localhost";
const origin =
  process.env.NODE_ENV === "production"
    ? "https://smartspend.ai"
    : "http://localhost:5173";
```
* **Flaw:** WebAuthn specification strictly requires the client `origin` to match `expectedOrigin` and RP ID to match `expectedRPID`.
* **Impact:**
  - Any developer running the frontend on port 3000, 4173, or using local tunnel URLs (`loca.lt`, `serveousercontent.com`) experiences instant authentication failure (`400 Bad Request: Origin mismatch`).
  - In production, subdomains like `app.smartspend.ai` or `staging.smartspend.ai` fail assertion verification because `expectedOrigin` is hardcoded strictly to `"https://smartspend.ai"`.

#### 2. Missing Passkey Management & Revocation Procedures
* **Flaw:** `api/webauthn-router.ts` contains only 5 procedures: `checkHasPasskey`, `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, and `verifyAuthentication`.
* **Impact:** Users have **no ability to list registered passkey devices** (e.g. "MacBook TouchID", "iPhone FaceID") or **delete/revoke a lost or stolen credential**.

#### 3. Duplicate Key Registration Conflict (`api/webauthn-router.ts:164-173`)
```typescript
await db.insert(userCredentials).values({
  id: credential.id,
  userId,
  userType,
  publicKey: Buffer.from(credential.publicKey).toString("base64"),
  counter: credential.counter,
  deviceType: credentialDeviceType,
  backedUp: credentialBackedUp,
  transports: credential.transports?.join(",") || "",
});
```
* **Flaw:** If a user re-registers an existing passkey or authenticator updates its attestation, `db.insert` throws a duplicate primary key error on `user_credentials.id` without `onDuplicateKeyUpdate` or graceful handling.

#### 4. Orphaned Biometric Credentials upon User Deletion
* **Flaw:** As detailed in Section 4, neither `adminRouter.deleteUser` nor `localAuthRouter.deleteUser` deletes rows from `userCredentials` or `authChallenges`. Stored public keys remain in the database indefinitely.

---

## 4. 🗄️ User Account Deletion & Cascading Relational Integrity Audit

### 4.1 Polymorphic Foreign Key Architecture

Because SmartSpend AI operates a dual-user model (`users` for Google OAuth and `localUsers` for phone/password), foreign keys linking to users cannot use MySQL native engine-level `ON DELETE CASCADE` across two disparate parent tables. Therefore, **all cascading deletions must be orchestrated at the application service layer within an ACID transaction**.

### 4.2 Comprehensive 48-Table Relational Inventory

Out of the 48 database tables defined in `db/schema.ts`, **35 tables are user-scoped** containing direct or indirect user data:

```
Total Database Tables: 48
├── System / Global Tables (13 Tables)
│   ├── systemSettings, onboardingQuestions, discountCodes, ads, seoPages
│   ├── notificationTemplates, apiKeyErrors (system), whatsappOtpCodes
│   └── (plus 5 lookup/meta structures)
└── User-Scoped & Dependent Tables (35 Tables)
    ├── Financial Core (6): expenses, expenseCategories, userWallets, financialGoals, userBudgets, monthlyReports
    ├── Freelance & Contacts (4): userBusinesses, businessCategories, userContacts, pendingClarifications
    ├── AI Memory & Classification (12): aiSummaries, aiConversationSummaries, aiMemoryItems, aiMemoryEmbeddings,
    │   aiActionMemory, aiPendingActions, aiActionAuditLogs, classificationLogs, userDictionaries,
    │   profileLearningEvents, monthlyBehaviorSnapshots, voiceUsage
    ├── Communications & Chat (4): chatConversations, chatMessages, rawSmsEvents, webhookTokens
    └── Sessions, Profiles & Alerts (9): users / localUsers, sessions, userProfiles, userAnalytics,
        supportTickets, adClicks, referrals, proSubscriptions, pushSubscriptions,
        userCredentials, authChallenges, inAppNotifications, notificationLogs
```

### 4.3 Deep Comparison: `adminRouter` vs `localAuthRouter` Deletion Code

Below is the line-by-line comparison of tables deleted during account deletion:

| # | Table Name | Deleted in `adminRouter.deleteUser` (`api/admin-router.ts:360-384`) | Deleted in `localAuthRouter.deleteUser` (`api/local-auth-router.ts:348-372`) | Audit Assessment & Orphan Risk |
| :---: | :--- | :---: | :---: | :--- |
| 1 | `expenses` | ✅ Line 361 | ✅ Line 349 | Properly deleted |
| 2 | `sessions` | ✅ Line 362 | ✅ Line 350 | Properly deleted |
| 3 | `userAnalytics` | ✅ Line 363 | ✅ Line 351 | Properly deleted |
| 4 | `supportTickets` | ✅ Line 364 | ✅ Line 352 | Properly deleted |
| 5 | `userWallets` | ✅ Line 365 | ✅ Line 353 | Properly deleted |
| 6 | `proSubscriptions` | ✅ Line 366 | ✅ Line 354 | Properly deleted |
| 7 | `monthlyReports` | ✅ Line 367 | ✅ Line 355 | Properly deleted |
| 8 | `aiSummaries` | ✅ Line 368 | ✅ Line 356 | Properly deleted |
| 9 | `userProfiles` | ✅ Line 369 | ✅ Line 357 | Properly deleted |
| 10 | `profileLearningEvents` | ✅ Line 370 | ✅ Line 358 | Properly deleted |
| 11 | `monthlyBehaviorSnapshots` | ✅ Line 371 | ✅ Line 359 | Properly deleted |
| 12 | `userDictionaries` | ✅ Line 372 | ✅ Line 360 | Properly deleted |
| 13 | `classificationLogs` | ✅ Line 373 | ✅ Line 361 | Properly deleted |
| 14 | `voiceUsage` | ✅ Line 374 | ✅ Line 362 | Properly deleted |
| 15 | `webhookTokens` | ✅ Line 375 | ✅ Line 363 | Properly deleted |
| 16 | `rawSmsEvents` | ✅ Line 376 | ✅ Line 364 | Properly deleted |
| 17 | `expenseCategories` | ✅ Line 377 | ✅ Line 365 | Properly deleted |
| 18 | `pushSubscriptions` | ✅ Line 378 | ❌ **MISSED!** | Push notifications may target deleted user device |
| 19 | `pendingClarifications` | ✅ Line 379 | ❌ **MISSED!** | Unresolved clarification questions remain orphaned |
| 20 | `financialGoals` | ❌ **MISSED!** | ✅ Line 366 | Savings targets orphaned when deleted by admin |
| 21 | `userBudgets` | ❌ **MISSED!** | ✅ Line 367 | Category budgets orphaned when deleted by admin |
| 22 | `userBusinesses` | ❌ **MISSED!** | ✅ Line 368 | Freelancer business ledgers orphaned |
| 23 | `businessCategories` | ❌ **MISSED!** | ❌ **MISSED!** | Child categories of businesses orphaned in both |
| 24 | `userContacts` | ❌ **MISSED!** | ✅ Line 369 | People Hub contacts orphaned when deleted by admin |
| 25 | `adClicks` | ❌ **MISSED!** | ✅ Line 370 | Ad tracking data orphaned when deleted by admin |
| 26 | `userCredentials` (Passkeys) | ❌ **MISSED!** | ❌ **MISSED!** | **Severe:** Passkey credentials orphaned in both |
| 27 | `authChallenges` | ❌ **MISSED!** | ❌ **MISSED!** | Ephemeral auth challenges orphaned in both |
| 28 | `chatConversations` | ❌ **MISSED!** | ❌ **MISSED!** | **Severe:** Chat threads orphaned in both |
| 29 | `chatMessages` | ❌ **MISSED!** | ❌ **MISSED!** | **Severe:** All chat message history orphaned in both |
| 30 | `aiConversationSummaries` | ❌ **MISSED!** | ❌ **MISSED!** | Chat context capsules orphaned in both |
| 31 | `aiMemoryItems` | ❌ **MISSED!** | ❌ **MISSED!** | **Severe:** Durable AI user facts & memory orphaned |
| 32 | `aiMemoryEmbeddings` | ❌ **MISSED!** | ❌ **MISSED!** | 768-dim Fireworks vector embeddings orphaned |
| 33 | `aiActionMemory` | ❌ **MISSED!** | ❌ **MISSED!** | Autonomous agent action history orphaned |
| 34 | `aiPendingActions` | ❌ **MISSED!** | ❌ **MISSED!** | Pending action proposal drafts orphaned |
| 35 | `aiActionAuditLogs` | ❌ **MISSED!** | ❌ **MISSED!** | Action audit trail rows orphaned |
| 36 | `inAppNotifications` | ❌ **MISSED!** | ❌ **MISSED!** | In-app notification bell messages orphaned |
| 37 | `notificationLogs` | ❌ **MISSED!** | ❌ **MISSED!** | Notification delivery history orphaned |
| 38 | `referrals` | ❌ **MISSED!** | ❌ **MISSED!** | Referral connections (referrer & referred) orphaned |
| 39 | `apiKeyErrors` | ❌ **MISSED!** | ❌ **MISSED!** | User-attributed API errors orphaned |

### 4.4 Missing Self-Deletion Endpoint in `profileRouter`

* **Observation:** `api/profile-router.ts` contains 22 procedures but **lacks any `deleteAccount` or `deleteMe` procedure**.
* **Impact:** Regular users cannot exercise their right to erasure (account deletion) from their profile settings; account deletion can only be triggered by an administrator via `adminRouter.deleteUser` or `localAuthRouter.deleteUser`.

### 4.5 Hierarchical Foreign Key Cascading Failures

Deleting records across composite tables requires a strict top-down or bottom-up deletion sequence to avoid foreign key dependency errors or detached child rows:

1. **Chat Hierarchy:**
   - To purge chat history, one must delete `chatMessages` where `conversationId IN (SELECT id FROM chat_conversations WHERE userId = ? AND userType = ?)`, along with `aiConversationSummaries`, before deleting `chatConversations`.
2. **Business Hierarchy:**
   - To purge freelance businesses, one must delete `businessCategories` where `businessId IN (SELECT id FROM user_businesses WHERE userId = ? AND userType = ?)` before deleting `userBusinesses`.
3. **AI Memory Hierarchy:**
   - To purge durable memory, one must delete `aiMemoryEmbeddings` where `memoryItemId IN (SELECT id FROM ai_memory_items WHERE userId = ? AND userType = ?)` before deleting `aiMemoryItems`.
4. **Action Runtime Hierarchy:**
   - To purge pending actions, one must delete `aiActionAuditLogs` where `actionId IN (SELECT id FROM ai_pending_actions WHERE userId = ? AND userType = ?)` before deleting `aiPendingActions`.
5. **Referral Linkage:**
   - To purge referrals, records where `(referrerId = ? AND referrerType = ?)` OR `(referredId = ? AND referredType = ?)` must be removed, and `referredBy` foreign keys in `users` / `localUsers` must be set to `NULL`.

---

## 5. 🚨 Master Vulnerability & Flaw Catalog

| Flaw ID | Category | Severity | Code Location | Description & Root Cause | Security & Data Integrity Impact |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **SEC-M1-01** | Data Cascade | **HIGH** | `api/admin-router.ts:360-384` | `adminRouter.deleteUser` misses 18 tables including chat messages, AI memory, credentials, contacts, businesses, budgets, and goals. | Massive privacy leak; deleted user data remains in DB; breaks GDPR/data protection compliance. |
| **SEC-M1-02** | Data Cascade | **HIGH** | `api/local-auth-router.ts:348-372` | `localAuthRouter.deleteUser` misses 17 tables including push subscriptions, clarifications, chat messages, AI memory, and credentials. | Unpurged user biometric credentials, push notifications sent to deleted accounts, orphaned chat history. |
| **SEC-M1-03** | RBAC / Plan | **MEDIUM** | `api/business-router.ts:52-400` | All business mode procedures use `authedProcedure` instead of `proProcedure`. `suggestCategories` (line 112) calls Gemini without Pro check. | Free users can access premium Freelance features and generate unlimited AI categories without subscription. |
| **SEC-M1-04** | RBAC / AI | **LOW** | `api/ai-router.ts:1988, 2960, 3127` | `generateMonthlyInsights`, `compareMonths`, and `generateYearlyInsights` use `authedProcedure` instead of `aiProcedure`. | Bypasses `aiProcedure` per-minute rate limiter (100 req/min) for heavy LLM generation endpoints. |
| **SEC-M1-05** | Dead Code | **LOW** | `api/middleware.ts:121-126` | `ultraProcedure` is exported in middleware but never referenced across any sub-router. | Ultra subscription tier is not enforced at the procedure level on top-tier features. |
| **SEC-M1-06** | WebAuthn | **MEDIUM** | `api/webauthn-router.ts:31-36` | RP ID and Origin are hardcoded to `"smartspend.ai"` and `"http://localhost:5173"`. | Verification fails on alternative ports, preview deployments, local tunnels (`loca.lt`), and subdomains. |
| **SEC-M1-07** | WebAuthn | **LOW** | `api/webauthn-router.ts` | No procedure exists to list or revoke registered passkeys (`userCredentials`). | Users cannot manage multiple devices or revoke lost/compromised passkeys. |
| **SEC-M1-08** | WebAuthn | **LOW** | `api/webauthn-router.ts:164-173` | Registration `insert(userCredentials)` lacks duplicate key handling. | Re-registering an existing passkey crashes with MySQL duplicate key error. |
| **SEC-M1-09** | Dual-Auth | **LOW** | `api/context.ts:138-147` | Local user resolution in `createContext` omits `avatar: dbUser.avatar`. | Local user avatars fail to render across profile headers, comments, and support tickets. |
| **SEC-M1-10** | Dual-Auth | **MEDIUM** | `api/local-auth-router.ts:128` | Local user registration inserts raw `input.phone` rather than `cleanPhone`. | If registered with spaces/country code, user is permanently locked out on login (queries by `cleanPhone`). |
| **SEC-M1-11** | Auth / SMS | **MEDIUM** | `api/sms-router.ts:133-166` | `getUserFromSession` validates JWT signature but ignores database session revocation. | Revoked session tokens can continue interacting with SMS ingestion endpoints. |
| **SEC-M1-12** | ACID Gap | **MEDIUM** | `api/profile-router.ts:666-743` | `deleteContact` updates profiles, unlinks expenses, and deletes contact without `db.transaction()`. | Connection failure mid-mutation leaves dangling contact links or unscrubbed lifestyle profiles. |
| **SEC-M1-13** | ACID Gap | **MEDIUM** | `api/business-router.ts:281-315` | `businessRouter.delete` deletes categories, updates contacts, updates expenses, and deletes business non-transactionally. | Partial execution corrupts business categories and expense associations. |
| **SEC-M1-14** | ACID Gap | **LOW** | `api/chat-router.ts:1133-1163` | `clearConversation` deletes messages and conversations sequentially without `db.transaction()` and misses `aiConversationSummaries`. | Orphaned summaries left in `ai_conversation_summaries` referencing deleted conversation ID. |
| **SEC-M1-15** | Data Integrity | **LOW** | `api/goals-router.ts:297-305` | `goalsRouter.delete` does not nullify `userBudgets.linkedGoalId`. | Budgets retain dangling foreign key references pointing to deleted goal IDs. |
| **SEC-M1-16** | Data Integrity | **LOW** | `api/ads-router.ts:119-124` | `adsRouter.delete` deletes ad without deleting child `adClicks`. | Orphaned click records accumulate in `ad_clicks`. |
| **SEC-M1-17** | Error Format | **LOW** | `api/support-router.ts:83, 201` | Support ticket endpoints throw generic `new Error("غير مصرح")` instead of `TRPCError`. | Client receives unformatted 500 error instead of structured 403 `FORBIDDEN` error code. |

---

## 6. 🛠️ Remediation & Architecture Action Plan

### Step 1: Implement Unified User Purge Service (`api/services/user-purge-service.ts`)
Create a single authoritative cascading deletion service wrapped in a strict database transaction (`db.transaction`) that completely purges all 35 user-scoped tables in correct hierarchical order:

```typescript
// Proposed Purge Service Pseudocode:
export async function purgeUserAccount(userId: number, userType: "oauth" | "local", tx: any) {
  // 1. Chat Hierarchy
  const convs = await tx.select({ id: chatConversations.id }).from(chatConversations)
    .where(and(eq(chatConversations.userId, userId), eq(chatConversations.userType, userType)));
  const convIds = convs.map((c: any) => c.id);
  if (convIds.length > 0) {
    await tx.delete(chatMessages).where(inArray(chatMessages.conversationId, convIds));
    await tx.delete(aiConversationSummaries).where(inArray(aiConversationSummaries.conversationId, convIds));
  }
  await tx.delete(chatConversations).where(and(eq(chatConversations.userId, userId), eq(chatConversations.userType, userType)));

  // 2. Business Hierarchy
  const bizs = await tx.select({ id: userBusinesses.id }).from(userBusinesses)
    .where(and(eq(userBusinesses.userId, userId), eq(userBusinesses.userType, userType)));
  const bizIds = bizs.map((b: any) => b.id);
  if (bizIds.length > 0) {
    await tx.delete(businessCategories).where(inArray(businessCategories.businessId, bizIds));
  }
  await tx.delete(userBusinesses).where(and(eq(userBusinesses.userId, userId), eq(userBusinesses.userType, userType)));

  // 3. AI Memory & Actions Hierarchy
  await tx.delete(aiMemoryEmbeddings).where(and(eq(aiMemoryEmbeddings.userId, userId), eq(aiMemoryEmbeddings.userType, userType)));
  await tx.delete(aiMemoryItems).where(and(eq(aiMemoryItems.userId, userId), eq(aiMemoryItems.userType, userType)));
  await tx.delete(aiActionAuditLogs).where(and(eq(aiActionAuditLogs.userId, userId), eq(aiActionAuditLogs.userType, userType)));
  await tx.delete(aiPendingActions).where(and(eq(aiPendingActions.userId, userId), eq(aiPendingActions.userType, userType)));
  await tx.delete(aiActionMemory).where(and(eq(aiActionMemory.userId, userId), eq(aiActionMemory.userType, userType)));

  // 4. Financial & Goal Hierarchy
  await tx.delete(expenses).where(and(eq(expenses.userId, userId), eq(expenses.userType, userType)));
  await tx.delete(expenseCategories).where(and(eq(expenseCategories.userId, userId), eq(expenseCategories.userType, userType)));
  await tx.delete(userWallets).where(and(eq(userWallets.userId, userId), eq(userWallets.userType, userType)));
  await tx.delete(userBudgets).where(and(eq(userBudgets.userId, userId), eq(userBudgets.userType, userType)));
  await tx.delete(financialGoals).where(and(eq(financialGoals.userId, userId), eq(financialGoals.userType, userType)));
  await tx.delete(monthlyReports).where(and(eq(monthlyReports.userId, userId), eq(monthlyReports.userType, userType)));
  await tx.delete(pendingClarifications).where(and(eq(pendingClarifications.userId, userId), eq(pendingClarifications.userType, userType)));

  // 5. Auth, Sessions, WebAuthn & Push
  await tx.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.userType, userType)));
  await tx.delete(userCredentials).where(and(eq(userCredentials.userId, userId), eq(userCredentials.userType, userType)));
  await tx.delete(authChallenges).where(and(eq(authChallenges.userId, userId), eq(authChallenges.userType, userType)));
  await tx.delete(webhookTokens).where(and(eq(webhookTokens.userId, userId), eq(webhookTokens.userType, userType)));
  await tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.userType, userType)));

  // 6. Profiles, Analytics, Logs & Alerts
  await tx.delete(userProfiles).where(and(eq(userProfiles.userId, userId), eq(userProfiles.userType, userType)));
  await tx.delete(userAnalytics).where(and(eq(userAnalytics.userId, userId), eq(userAnalytics.userType, userType)));
  await tx.delete(supportTickets).where(and(eq(supportTickets.userId, userId), eq(supportTickets.userType, userType)));
  await tx.delete(proSubscriptions).where(and(eq(proSubscriptions.userId, userId), eq(proSubscriptions.userType, userType)));
  await tx.delete(aiSummaries).where(and(eq(aiSummaries.userId, userId), eq(aiSummaries.userType, userType)));
  await tx.delete(profileLearningEvents).where(and(eq(profileLearningEvents.userId, userId), eq(profileLearningEvents.userType, userType)));
  await tx.delete(monthlyBehaviorSnapshots).where(and(eq(monthlyBehaviorSnapshots.userId, userId), eq(monthlyBehaviorSnapshots.userType, userType)));
  await tx.delete(userDictionaries).where(and(eq(userDictionaries.userId, userId), eq(userDictionaries.userType, userType)));
  await tx.delete(classificationLogs).where(and(eq(classificationLogs.userId, userId), eq(classificationLogs.userType, userType)));
  await tx.delete(voiceUsage).where(and(eq(voiceUsage.userId, userId), eq(voiceUsage.userType, userType)));
  await tx.delete(rawSmsEvents).where(and(eq(rawSmsEvents.userId, userId), eq(rawSmsEvents.userType, userType)));
  await tx.delete(userContacts).where(and(eq(userContacts.userId, userId), eq(userContacts.userType, userType)));
  await tx.delete(adClicks).where(and(eq(adClicks.userId, userId), eq(adClicks.userType, userType)));
  await tx.delete(inAppNotifications).where(and(eq(inAppNotifications.userId, userId), eq(inAppNotifications.userType, userType)));
  await tx.delete(notificationLogs).where(and(eq(notificationLogs.userId, userId), eq(notificationLogs.userType, userType)));
  await tx.delete(referrals).where(or(
    and(eq(referrals.referrerId, userId), eq(referrals.referrerType, userType)),
    and(eq(referrals.referredId, userId), eq(referrals.referredType, userType))
  ));

  // 7. Identity Table
  const table = userType === "oauth" ? users : localUsers;
  await tx.delete(table).where(eq(table.id, userId));
}
```

### Step 2: Unify Account Deletion Across Routers
Replace the fragmented deletion code in `adminRouter.deleteUser` and `localAuthRouter.deleteUser` with `purgeUserAccount()`, and expose a `deleteAccount: authedProcedure` in `profileRouter` for user self-deletion.

### Step 3: Hardening RBAC & WebAuthn Configurations
1. Change `businessRouter` procedures to `proProcedure`.
2. Wrap `suggestCategories` in `aiProcedure` rate limiting.
3. Refactor WebAuthn origin/RP ID resolution to dynamically read from `env.APP_URL` / request origin headers.
4. Add `listPasskeys` and `revokePasskey` endpoints to `webauthnRouter`.
5. Fix phone sanitization in `localAuthRouter.register` to persist `cleanPhone`.
6. Add `avatar: dbUser.avatar` in `api/context.ts` for local users.

---

*Report compiled by Explorer 3 (Milestone 1 RBAC, Passkeys & Cascading Deletion Security Auditor).*
