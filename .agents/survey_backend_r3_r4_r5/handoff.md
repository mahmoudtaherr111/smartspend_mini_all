# SmartSpend AI — Backend Survey & Architectural Audit Report (R3, R4, R5) 🤖🚀

> **Auditor / Agent:** `survey_backend_r3_r4_r5` (Teamwork Explorer)  
> **Target Scope:** R3 (Performance Optimization), R4 (Database Architecture & Schema Review), R5 (Code Logic, Security & Quality Hardening)  
> **Repository Root:** `E:\smartspend_V1_fixed`  
> **Date:** August 25, 2026  
> **Mode:** Read-Only Forensic Architecture Investigation  

---

# Table of Contents
1. [Component 1: Direct Observations](#component-1-direct-observations)
   - 1.1 R4: Database Schema (All 48 Tables) & Relational Mapping Audit
   - 1.2 R4: Index Redundancy & Coverage Analysis
   - 1.3 R3: Performance Bottlenecks & N+1 Batch Ingestion Audit
   - 1.4 R5: Dual-Auth, Active Session Verification & Context Resolution
   - 1.5 R5: Error Standardization (TRPCError vs Generic Error)
   - 1.6 R5: Advisory Lock Typing (TS2344) in `scheduler-lock.ts`
   - 1.7 R5: Role vs. Plan RBAC & AI Procedure Capping
   - 1.8 R5: Dual-User Multi-Tenant Analytics Metrics Defect
   - 1.9 Cairo Timezone & App Time Engine
2. [Component 2: Logic Chain & Root-Cause Analysis](#component-2-logic-chain--root-cause-analysis)
3. [Component 3: Concrete Implementation Diffs & File Boundaries](#component-3-concrete-implementation-diffs--file-boundaries)
4. [Component 4: Caveats & Edge-Case Disclosures](#component-4-caveats--edge-case-disclosures)
5. [Component 5: Conclusion & Prioritized Action Roadmap](#component-5-conclusion--prioritized-action-roadmap)
6. [Component 6: Independent Verification Method](#component-6-independent-verification-method)

---

# Component 1: Direct Observations

## 1.1 R4: Database Schema (All 48 Tables) & Relational Mapping Audit

Direct source inspection of `db/schema.ts` (1,083 lines) and `db/relations.ts` (466 lines) reveals exactly 48 MySQL tables across 6 logical domain groupings:

### Table Inventory by Logical Group
1. **Group A: Identity, Sessions & Passkeys (6 Tables):**
   - `users` (`db/schema.ts:17`): Google OAuth primary identity table.
   - `localUsers` (`db/schema.ts:48`): Password and WhatsApp OTP local identity table.
   - `sessions` (`db/schema.ts:282`): Bearer & cookie session tokens with `userId`, `userType`, `expiresAt`, `ipAddress`, `userAgent`.
   - `userCredentials` (`db/schema.ts:798`): WebAuthn Level 3 biometric passkeys.
   - `authChallenges` (`db/schema.ts:820`): Ephemeral WebAuthn challenge store.
   - `webhookTokens` (`db/schema.ts:653`): External ingestion pairing keys for iOS Shortcuts & Android companion app.

2. **Group B: Financial Core Ledger (6 Tables):**
   - `expenses` (`db/schema.ts:80`): Primary ledger entries. Features canonical `contactId`, `classificationLogId`, `businessId`, `walletId`, `clientRequestId`.
   - `expenseCategories` (`db/schema.ts:224`): Custom & system-default expense categories.
   - `userWallets` (`db/schema.ts:239`): Financial accounts (cards, e-wallets, bank accounts).
   - `financialGoals` (`db/schema.ts:669`): Savings and debt goals.
   - `userBudgets` (`db/schema.ts:694`): Monthly budgets with custom salary day (`periodStartDay`) and `linkedGoalId`.
   - `monthlyReports` (`db/schema.ts:255`): Materialized monthly summaries with AI narrative reports.

3. **Group C: Freelance & Contacts (4 Tables):**
   - `userBusinesses` (`db/schema.ts:129`): Freelance project and business profiles.
   - `businessCategories` (`db/schema.ts:153`): Custom business categories with Egyptian slang keywords.
   - `userContacts` (`db/schema.ts:175`): People Hub entities with `relation`, `aliases`, `contactType`, `transactionCount`.
   - `pendingClarifications` (`db/schema.ts:203`): Suspended classification states awaiting interactive user clarification.

4. **Group D: AI Layer & Behavioral Memory (12 Tables):**
   - `aiSummaries` (`db/schema.ts:361`): Historical period LLM summaries.
   - `aiConversationSummaries` (`db/schema.ts:932`): Rolling chat context capsules.
   - `aiMemoryItems` (`db/schema.ts:955`): User semantic facts & behavioral signals with deduplication `contentHash`.
   - `aiMemoryEmbeddings` (`db/schema.ts:984`): Vector embeddings (768-dim Fireworks/Qwen).
   - `aiActionMemory` (`db/schema.ts:1009`): Autonomous action history.
   - `aiPendingActions` (`db/schema.ts:1033`): Action Runtime 2-phase safety gate with `idempotencyKey`.
   - `aiActionAuditLogs` (`db/schema.ts:1064`): AI compliance and execution audit trail.
   - `classificationLogs` (`db/schema.ts:602`): 5-layer classification traces with light reasoning and ambiguity flags.
   - `onboardingQuestions` (`db/schema.ts:572`): Admin question catalog.
   - `userDictionaries` (`db/schema.ts:584`): Layer 1 muscle memory personal dictionary.
   - `profileLearningEvents` (`db/schema.ts:517`): User profile evolution audit trail.
   - `monthlyBehaviorSnapshots` (`db/schema.ts:537`): Longitudinal financial behavioral vectors.

5. **Group E: Conversational AI & Communications (5 Tables):**
   - `chatConversations` (`db/schema.ts:893`): Chat conversation sessions.
   - `chatMessages` (`db/schema.ts:913`): Chat messages with tool calls and token counts.
   - `rawSmsEvents` (`db/schema.ts:721`): Ingested SMS and bank notification payloads.
   - `whatsappOtpCodes` (`db/schema.ts:741`): Zero-polling SSE OTP pairing table.
   - `voiceUsage` (`db/schema.ts:638`): Monthly voice call and Gemini STT duration tracking.

6. **Group F: System Operations & Notifications (15 Tables):**
   - `systemSettings` (`db/schema.ts:481`): Dynamic key-value configuration.
   - `userProfiles` (`db/schema.ts:488`): 1:1 financial context profile.
   - `userAnalytics` (`db/schema.ts:302`): Event telemetry tracking (`event`, `metadata`).
   - `supportTickets` (`db/schema.ts:319`): Customer support requests.
   - `discountCodes` (`db/schema.ts:345`): Promo and referral discount codes.
   - `ads` (`db/schema.ts:384`): In-app sponsorship cards.
   - `adClicks` (`db/schema.ts:406`): Ad click logs.
   - `referrals` (`db/schema.ts:420`): Referral pairings with `referrerId`, `referrerType`, `referredId`, `referredType`.
   - `proSubscriptions` (`db/schema.ts:445`): Paid tier subscriptions (`plan`, `status`, `startDate`, `endDate`).
   - `seoPages` (`db/schema.ts:467`): Dynamic SEO landing pages (`path`, `title`, `description`).
   - `apiKeyErrors` (`db/schema.ts:757`): Admin AI key error logger (`provider`, `keyLabel`, `errorType`).
   - `pushSubscriptions` (`db/schema.ts:781`): WebPush & FCM push tokens.
   - `notificationTemplates` (`db/schema.ts:832`): Multi-channel notification templates.
   - `inAppNotifications` (`db/schema.ts:855`): User in-app notifications.
   - `notificationLogs` (`db/schema.ts:874`): Multi-channel delivery logs.

### Relational Mapping Status (`db/relations.ts`)
- **Relation Exports:** Exactly 44 relation blocks are exported.
- **Previously Missing Relation Exports:** `discountCodesRelations` (`db/relations.ts:422`), `referralsRelations` (`db/relations.ts:433`), and `apiKeyErrorsRelations` (`db/relations.ts:456`) are now fully exported.
- **Inverse Relations on `usersRelations` and `localUsersRelations`:** Both `usersRelations` (`db/relations.ts:49-89`) and `localUsersRelations` (`db/relations.ts:91-131`) export relations for all 35 user-scoped tables, including `adClicks`, `aiMemoryEmbeddings`, `authChallenges`, `classificationLogs`, `discountCodes`, `apiKeyErrors`, `referralsMade`, and `referralsReceived`.

---

## 1.2 R4: Index Redundancy & Coverage Analysis

### Redundant Left-Prefix Index Audit
MySQL creates B-Tree indexes that can satisfy queries on any leftmost prefix of the indexed column tuple. Redundant indexes consume disk space and add write I/O overhead on every `INSERT`/`UPDATE`/`DELETE`.

1. **`monthlyReports` Redundant Index:**
   - Location: `db/schema.ts:276-278`
   - Existing:
     ```typescript
     index("reports_user_idx").on(t.userId, t.userType),
     index("reports_month_idx").on(t.month),
     uniqueIndex("reports_user_month_unique").on(t.userId, t.userType, t.month),
     ```
   - Observation: `reports_user_month_unique` indexes `(userId, userType, month)`. Any query filtering by `(userId, userType)` is 100% satisfied by the left prefix of `reports_user_month_unique`.
   - Finding: `reports_user_idx` is redundant and should be removed.

2. **Previously Pruned Left-Prefix Indexes Verified Absent:**
   - `expenses_user_idx` (pruned in favor of `expenses_user_date_idx`)
   - `users_referral_idx` (pruned in favor of `referralCode.unique()`)
   - `webhook_tokens_token_idx` (pruned in favor of `token.unique()`)
   - `user_dict_user_idx` (pruned in favor of `user_dict_word_unique`)
   - `ai_summary_user_idx` (pruned in favor of `ai_summary_period_idx`)
   - `chat_msg_conv_idx` (pruned in favor of `chat_msg_created_idx`)
   - `business_cat_idx` (pruned in favor of `business_cat_active_idx`)
   - `ai_memory_embedding_item_idx` (pruned in favor of `ai_memory_embedding_unique_idx`)

3. **Critical High-Frequency Indexes Verified Present:**
   - `sessions_expires_idx` (`db/schema.ts:297`): On `sessions.expiresAt` for midnight TTL purge cron.
   - `reports_user_month_unique` (`db/schema.ts:278`): Prevents duplicate report generation.
   - `referral_referred_unique_idx` (`db/schema.ts:440`): Rapid reverse lookup on `(referredId, referredType)`.
   - `expenses_wallet_idx` (`db/schema.ts:119`): Direct indexed foreign key for wallet transactions.

---

## 1.3 R3: Performance Bottlenecks & N+1 Batch Ingestion Audit

### Batch Expense Ingestion (`api/expense-router.ts`)
- In `api/expense-router.ts:130-202`, `resolveBatchExpenseReferences` validates contact and classification log references across the entire batch:
  - Contact lookup: Uses `inArray(userContacts.id, explicitContactIds)` in a single query (`api/expense-router.ts:151`).
  - Log lookup: Uses `inArray(classificationLogs.id, explicitLogIds)` in a single query (`api/expense-router.ts:185`).
  - Insertion: In `batchCreate` (`api/expense-router.ts:540`), all items are inserted via `tx.insert(expenses).values(valuesToInsert)` in a single SQL statement inside `db.transaction()`.
  - Dynamic contacts are memoized in-memory during the batch via `dynamicContactCache` (`api/expense-router.ts:204-250`), preventing duplicate queries and duplicate contact inserts.

---

## 1.4 R5: Dual-Auth, Active Session Verification & Context Resolution

1. **Dual-Auth Context Resolution (`api/context.ts`):**
   - Resolves `google_session` cookie against `users` table via `validateActiveSessionToken(googleToken, "oauth")`.
   - Resolves `Authorization: Bearer <token>` against `sessions` table, dynamically supporting both `localUsers` and OAuth `users`.
   - Local user avatar resolution verified at `api/context.ts:111`: `avatar: dbUser.avatar` is assigned to `UnifiedUser`.

2. **Active Database Session Checks (`api/lib/session-validation.ts`):**
   - Canonical validation function `validateActiveSessionToken(token, expectedUserType?)` validates JWT signature AND verifies active presence in `sessions` table where `expiresAt > NOW()`.
   - Verified active integration across:
     - `api/context.ts:59, 83` (tRPC procedure context)
     - `api/sms-router.ts:140, 149` (`getUserFromSession` for SMS ingestion & webhook status)
     - `api/services/voice-call-service.ts:38` (`authenticateUser` for WebSocket live audio calls)

3. **Phone Number Sanitization in Registration (`api/local-auth-router.ts`):**
   - Verified at `api/local-auth-router.ts:130`: `phone: cleanPhone` is stored, eliminating registration lockout when phone numbers are entered with leading zeros, spaces, or international `+20` prefixes.

4. **Universal Transactional Cascade Purge (`api/services/user-purge-service.ts`):**
   - `purgeUserData(tx, userId, userType)` provides atomic cascading deletion covering all 35 user-owned tables, chat message hierarchies, business categories, and identity tables within a single database transaction.
   - Connected in both `api/local-auth-router.ts:352` and `api/admin-router.ts:362`.

---

## 1.5 R5: Error Standardization (TRPCError vs Generic Error)

Audit of error handling across all 22 sub-routers revealed remaining instances of generic `new Error(...)` that bypass tRPC HTTP status translation:

1. **`api/support-router.ts:82` & `api/support-router.ts:201`:**
   - Code: `throw new Error("غير مصرح");`
   - Defect: Throws generic error resulting in ambiguous 500 response instead of 403 Forbidden.
   - Requirement: Throw `new TRPCError({ code: "FORBIDDEN", message: "غير مصرح لك بالوصول لهذه التذكرة" })`.

2. **`api/profile-router.ts:420`:**
   - Code: `throw new Error("لازم تعمل Token الأول قبل ما تستخدم Magic Link.");`
   - Defect: Throws generic error instead of structured tRPC error.
   - Requirement: Throw `new TRPCError({ code: "PRECONDITION_FAILED", message: "يجب إنشاء رمز ربط أولاً" })`.

3. **`api/admin-whatsapp-router.ts:120` & `api/admin-whatsapp-router.ts:167`:**
   - Code: `throw new Error(err.message || "فشل إرسال الرسالة");` and `throw new Error("لا يوجد مستخدمين بأرقام هواتف مسجلة");`
   - Defect: Unstructured errors in admin WhatsApp endpoints.
   - Requirement: Throw `new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ... })` and `new TRPCError({ code: "NOT_FOUND", message: ... })`.

---

## 1.6 R5: Advisory Lock Typing (TS2344) in `scheduler-lock.ts`

- Location: `api/services/scheduler-lock.ts:16-18`
- Existing Code:
  ```typescript
  const [rows] = await connection.query<
    RowDataPacket[] & Array<{ acquired: number }>
  >("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
  ```
- Observation: In `mysql2/promise`, `connection.query<T>` expects `T extends RowDataPacket[]`. Intersection of arrays `RowDataPacket[] & Array<{ acquired: number }>` does not cleanly satisfy this generic constraint in all TypeScript versions, causing TS2344 type check failures.
- Requirement: Define explicit interface `interface LockAcquiredRow extends RowDataPacket { acquired: number | null; }` and query as `connection.query<LockAcquiredRow[]>(...)`.

---

## 1.7 R5: Role vs. Plan RBAC & AI Procedure Capping

1. **RBAC Middleware Hierarchy (`api/middleware.ts`):**
   - `publicProcedure` & `strictPublicProcedure`: Anonymous traffic with IP rate limits.
   - `authedProcedure`: Logged in users (`ctx.user != null`, 100 req/min).
   - `aiProcedure`: AI rate limit (100 req/min) and user AI token limits.
   - `moderatorProcedure`: `role === "admin" || role === "moderator"`.
   - `adminProcedure`: `role === "admin"`.
   - `proProcedure`: `plan === "pro" || plan === "ultra" || role === "admin"`.
   - `proAiProcedure`: `proProcedure` composed with `aiProcedure`.
   - `ultraProcedure`: `plan === "ultra" || role === "admin"`.

2. **AI Procedure Gaps Identified in `api/ai-router.ts`:**
   - `generateMonthlyInsights` (`api/ai-router.ts:1988`): Uses `authedProcedure` instead of `aiProcedure`.
   - `compareMonths` (`api/ai-router.ts:2960`): Uses `authedProcedure` instead of `aiProcedure`.
   - `generateYearlyInsights` (`api/ai-router.ts:3127`): Uses `authedProcedure` instead of `aiProcedure`.
   - Defect: Heavy generative LLM operations are not gated by `aiProcedure`, allowing unmetered concurrent calls to bypass AI rate limiting.

---

## 1.8 R5: Dual-User Multi-Tenant Analytics Metrics Defect

- Location: `api/analytics-router.ts:165-168`
- Existing Code:
  ```typescript
  const [
    totalLocalUsers,
    totalOAuthUsers,
    totalExpenses,
    totalAmount,
    totalIncome,
    todayExpenses,
    adminCount,
    moderatorCount,
    proCount,
  ] = await Promise.all([
    db.select({ count: sql`count(*)` }).from(localUsers),
    db.select({ count: sql`count(*)` }).from(users),
    db.select({ count: sql`count(*)` }).from(expenses),
    db.select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(eq(expenses.type, "expense")),
    db.select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(eq(expenses.type, "income")),
    db.select({ count: sql`count(*)` }).from(expenses).where(and(gte(expenses.createdAt, today), eq(expenses.type, "expense"))),
    db.select({ count: sql`count(*)` }).from(localUsers).where(eq(localUsers.role, "admin")),
    db.select({ count: sql`count(*)` }).from(localUsers).where(eq(localUsers.role, "moderator")),
    db.select({ count: sql`count(*)` }).from(localUsers).where(eq(localUsers.plan, "pro")),
  ]);
  ```
- Observation: Lines 165–167 query only `localUsers` for `admin`, `moderator`, and `pro` counts. All Google OAuth users in the `users` table are completely omitted from administrative and subscription metrics.
- Requirement: Aggregate `adminCount`, `moderatorCount`, and `proCount` (including `ultra`) across both `localUsers` and `users`.

---

## 1.9 Cairo Timezone & App Time Engine

- Location: `api/lib/app-time.ts` (73 lines)
- Observation: Standardized functions `businessDateKey()`, `startOfBusinessDay()`, `businessDayRange()`, and `businessMonthRange()` correctly resolve calendar boundaries in the configured business timezone (`APP_TIMEZONE="Africa/Cairo"`) regardless of server UTC time and Egypt's Daylight Saving Time (DST) switches.
- Integration: Utilized in `api/budget-router.ts:7`, `api/expense-router.ts:357`, `api/analytics-router.ts:146`, `api/goals-router.ts`, and `api/notification-engine.ts`.

---

# Component 2: Logic Chain & Root-Cause Analysis

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             LOGICAL FORENSIC INFERENCE CHAIN                             │
└──────────────────────────────────────────────────────────────────────────────────────────┘

1. Observation [1.1 & 1.2]: `monthlyReports` table defines `reports_user_idx` on (userId, userType)
   and `reports_user_month_unique` on (userId, userType, month).
   └─► Logic: In MySQL B-Tree indexing, any compound index (A, B, C) can service queries filtering on
       (A, B). Maintaining a separate index on (A, B) causes duplicate index pages, memory waste, and
       extra I/O on monthly report inserts.
   └─► Remediation: Remove `reports_user_idx` from `db/schema.ts:276`.

2. Observation [1.6]: `withScheduledJobLock` in `api/services/scheduler-lock.ts:16-18` types query
   as `RowDataPacket[] & Array<{ acquired: number }>`.
   └─► Logic: TypeScript generic constraint requires `T extends RowDataPacket[]`. An intersection of two
       array types is not directly assignable to `RowDataPacket[]` in strict type-check mode.
   └─► Remediation: Define `interface LockAcquiredRow extends RowDataPacket { acquired: number | null; }`
       and type query as `LockAcquiredRow[]`.

3. Observation [1.5]: `support-router.ts:82, 201`, `profile-router.ts:420`, `admin-whatsapp-router.ts:120, 167`
   throw raw `new Error(...)`.
   └─► Logic: tRPC interceptors catch unhandled `Error` and return generic 500 INTERNAL_SERVER_ERROR
       responses with unformatted messages, preventing client UI from detecting 403 Forbidden or 412 Precondition Failed.
   └─► Remediation: Replace all instances with `TRPCError({ code: ..., message: ... })`.

4. Observation [1.7]: `generateMonthlyInsights`, `compareMonths`, `generateYearlyInsights` in `api/ai-router.ts`
   are declared with `authedProcedure`.
   └─► Logic: These procedures make external calls to Google Gemini / Groq LLMs consuming thousands of tokens.
       Using `authedProcedure` bypasses the AI-specific rate limiter (`aiProcedure`), enabling API exhaustion.
   └─► Remediation: Switch all 3 procedures from `authedProcedure` to `aiProcedure`.

5. Observation [1.8]: `analyticsRouter.getDashboardStats` computes admin/moderator/pro totals using only `localUsers`.
   └─► Logic: SmartSpend AI employs a dual-user architecture. Any Google OAuth user who is assigned admin/moderator
       role or purchases a Pro/Ultra subscription is invisible in administrative metrics.
   └─► Remediation: Query both `localUsers` and `users` (with `inArray(plan, ["pro", "ultra"])`) and sum the results.
```

---

# Component 3: Concrete Implementation Diffs & File Boundaries

### 1. Remove Redundant Index in `db/schema.ts`
```diff
--- a/db/schema.ts
+++ b/db/schema.ts
@@ -273,7 +273,6 @@ export const monthlyReports = mysqlTable("monthly_reports", {
   ),
 },
 (t) => [
-  index("reports_user_idx").on(t.userId, t.userType),
   index("reports_month_idx").on(t.month),
   uniqueIndex("reports_user_month_unique").on(t.userId, t.userType, t.month),
 ]);
```

### 2. Fix Advisory Lock TypeScript Typing (TS2344) in `api/services/scheduler-lock.ts`
```diff
--- a/api/services/scheduler-lock.ts
+++ b/api/services/scheduler-lock.ts
@@ -1,6 +1,10 @@
 import type { RowDataPacket } from "mysql2/promise";
 import { mysqlPool } from "../queries/connection";
 
+interface LockAcquiredRow extends RowDataPacket {
+  acquired: number | null;
+}
+
 /**
  * Holds a MySQL advisory lock on a dedicated connection while one scheduled
  * job runs.  Every replica may register the cron expression safely; at most
@@ -14,9 +18,7 @@ export async function withScheduledJobLock(
   const lockName = `smartspend:cron:${jobName}`;
   try {
-    const [rows] = await connection.query<
-      RowDataPacket[] & Array<{ acquired: number }>
-    >("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
+    const [rows] = await connection.query<LockAcquiredRow[]>(
+      "SELECT GET_LOCK(?, 0) AS acquired",
+      [lockName],
+    );
     if (Number(rows[0]?.acquired) !== 1) return false;
     try {
```

### 3. Standardize TRPCError in `api/support-router.ts`
```diff
--- a/api/support-router.ts
+++ b/api/support-router.ts
@@ -79,7 +79,10 @@ export const supportRouter = router({
         ticket[0].userType !== ctx.user.type
       ) {
         if (ctx.user.role !== "moderator" && ctx.user.role !== "admin") {
-          throw new Error("غير مصرح");
+          throw new TRPCError({
+            code: "FORBIDDEN",
+            message: "غير مصرح لك بالوصول لهذه التذكرة",
+          });
         }
       }
       return ticket[0];
@@ -198,7 +201,10 @@ export const supportRouter = router({
         ticket[0].userType !== ctx.user.type
       ) {
         if (ctx.user.role !== "moderator" && ctx.user.role !== "admin") {
-          throw new Error("غير مصرح");
+          throw new TRPCError({
+            code: "FORBIDDEN",
+            message: "غير مصرح لك بالوصول لهذه التذكرة",
+          });
         }
       }
       await db
```

### 4. Standardize TRPCError in `api/profile-router.ts`
```diff
--- a/api/profile-router.ts
+++ b/api/profile-router.ts
@@ -417,7 +417,10 @@ export const profileRouter = router({
       .limit(1);
 
     if (!record) {
-      throw new Error("لازم تعمل Token الأول قبل ما تستخدم Magic Link.");
+      throw new TRPCError({
+        code: "PRECONDITION_FAILED",
+        message: "يجب إنشاء رمز ربط أولاً قبل استخدام الرابط السريع",
+      });
     }
 
     const { storeMagicCode } = await import("./sms-router");
```

### 5. Standardize TRPCError in `api/admin-whatsapp-router.ts`
```diff
--- a/api/admin-whatsapp-router.ts
+++ b/api/admin-whatsapp-router.ts
@@ -117,7 +117,10 @@ export const adminWhatsappRouter = router({
         await whatsappService.sendMessage(input.phone, input.text);
         return { success: true, message: "تم إرسال الرسالة بنجاح" };
       } catch (err: any) {
-        throw new Error(err.message || "فشل إرسال الرسالة");
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: err.message || "فشل إرسال الرسالة",
+        });
       }
     }),
@@ -164,7 +167,10 @@ export const adminWhatsappRouter = router({
       const allPhones = [...new Set([...localPhones, ...oauthPhones])];
       if (allPhones.length === 0) {
-        throw new Error("لا يوجد مستخدمين بأرقام هواتف مسجلة");
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "لا يوجد مستخدمين بأرقام هواتف مسجلة",
+        });
       }
```

### 6. Protect AI Endpoints with `aiProcedure` in `api/ai-router.ts`
```diff
--- a/api/ai-router.ts
+++ b/api/ai-router.ts
@@ -1985,7 +1985,7 @@ export const aiRouter = router({
     }),
 
   // ─── Financial Copilot: Monthly Insights ───
-  generateMonthlyInsights: authedProcedure
+  generateMonthlyInsights: aiProcedure
     .input(
       z.object({
         month: z.string(),
@@ -2957,7 +2957,7 @@ export const aiRouter = router({
     }),
 
   // ─── Compare Months ───
-  compareMonths: authedProcedure
+  compareMonths: aiProcedure
     .input(
       z.object({
         month1: z.string(),
@@ -3124,7 +3124,7 @@ export const aiRouter = router({
     }),
 
   // ─── Generate Yearly Insights ───
-  generateYearlyInsights: authedProcedure
+  generateYearlyInsights: aiProcedure
     .input(
       z.object({
         year: z.string(),
```

### 7. Dual-User Analytics Metrics Aggregation in `api/analytics-router.ts`
```diff
--- a/api/analytics-router.ts
+++ b/api/analytics-router.ts
@@ -3,7 +3,7 @@ import { router, moderatorProcedure } from "./middleware";
 import { getDb } from "./queries/connection";
 import { expenses, users, localUsers } from "../db/schema";
-import { sql, eq, gte, and } from "drizzle-orm";
+import { sql, eq, gte, and, inArray } from "drizzle-orm";
 import { businessDayRange } from "./lib/app-time";
 
 export const analyticsRouter = router({
@@ -155,9 +155,12 @@ export const analyticsRouter = router({
       adminCount,
       moderatorCount,
       proCount,
+      oauthAdminCount,
+      oauthModeratorCount,
+      oauthProCount,
     ] = await Promise.all([
       db.select({ count: sql`count(*)` }).from(localUsers),
       db.select({ count: sql`count(*)` }).from(users),
       db.select({ count: sql`count(*)` }).from(expenses),
       db.select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(eq(expenses.type, "expense")),
       db.select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(eq(expenses.type, "income")),
       db.select({ count: sql`count(*)` }).from(expenses).where(and(gte(expenses.createdAt, today), eq(expenses.type, "expense"))),
       db.select({ count: sql`count(*)` }).from(localUsers).where(eq(localUsers.role, "admin")),
       db.select({ count: sql`count(*)` }).from(localUsers).where(eq(localUsers.role, "moderator")),
       db.select({ count: sql`count(*)` }).from(localUsers).where(inArray(localUsers.plan, ["pro", "ultra"])),
+      db.select({ count: sql`count(*)` }).from(users).where(eq(users.role, "admin")),
+      db.select({ count: sql`count(*)` }).from(users).where(eq(users.role, "moderator")),
+      db.select({ count: sql`count(*)` }).from(users).where(inArray(users.plan, ["pro", "ultra"])),
     ]);
 
     return {
       totalUsers:
         Number(totalLocalUsers[0]?.count || 0) +
         Number(totalOAuthUsers[0]?.count || 0),
       totalLocalUsers: Number(totalLocalUsers[0]?.count || 0),
       totalOAuthUsers: Number(totalOAuthUsers[0]?.count || 0),
       totalExpenses: Number(totalExpenses[0]?.count || 0),
       totalAmount: Number(totalAmount[0]?.total || 0),
       totalIncome: Number(totalIncome[0]?.total || 0),
       todayExpenses: Number(todayExpenses[0]?.count || 0),
-      adminCount: Number(adminCount[0]?.count || 0),
-      moderatorCount: Number(moderatorCount[0]?.count || 0),
-      proCount: Number(proCount[0]?.count || 0),
+      adminCount: Number(adminCount[0]?.count || 0) + Number(oauthAdminCount[0]?.count || 0),
+      moderatorCount: Number(moderatorCount[0]?.count || 0) + Number(oauthModeratorCount[0]?.count || 0),
+      proCount: Number(proCount[0]?.count || 0) + Number(oauthProCount[0]?.count || 0),
     };
   }),
 });
```

---

# Component 4: Caveats & Edge-Case Disclosures

1. **Live External AI & MySQL Connections in Vitest:**
   - Vitest test suites that require a live MySQL database or live Gemini API keys (e.g. `api/lib/classification-golden.test.ts`, `api/lib/comprehensive-classification.test.ts`) require local MySQL running or mock fallbacks to prevent 5000ms timeouts when run offline.
2. **Database Push vs. Existing Production Schemas:**
   - Removing the redundant `reports_user_idx` index is 100% backward-compatible and requires no data transformation.
3. **No Unaudited Areas:**
   - All 48 schema tables, 44 relation definitions, 22 sub-routers, session verification, user purging, advisory locks, settings cache, and app time modules were inspected.

---

# Component 5: Conclusion & Prioritized Action Roadmap

| Priority | Task Description | Target File(s) | Impact / Rationale |
|---|---|---|---|
| **P0** | **Advisory Lock TS2344 Fix** | `api/services/scheduler-lock.ts` | Eliminates TypeScript type constraint error in MySQL lock helper. |
| **P0** | **TRPCError Standardization** | `api/support-router.ts`, `api/profile-router.ts`, `api/admin-whatsapp-router.ts` | Eliminates raw JavaScript 500 errors; delivers structured status codes to frontend. |
| **P1** | **Dual-User Analytics Aggregation** | `api/analytics-router.ts` | Fixes missing OAuth admin/moderator/pro counts in dashboard stats. |
| **P1** | **AI Procedure Rate Limit Protection** | `api/ai-router.ts` | Gates `generateMonthlyInsights`, `compareMonths`, `generateYearlyInsights` behind `aiProcedure`. |
| **P2** | **Redundant Index Removal** | `db/schema.ts` | Drops `reports_user_idx` to eliminate redundant index maintenance overhead on monthly reports. |

---

# Component 6: Independent Verification Method

### Step 1: TypeScript Monorepo Typecheck
```bash
npm run check
```
- **Expected Result:** `tsc -b` completes with 0 errors across all routers, schema definitions, and frontend components.

### Step 2: Full Test Suite Execution
```bash
npm test
```
- **Expected Result:** All unit, integration, and semantic layer test suites pass with zero regressions.

### Step 3: Schema Generation & Verification
```bash
npm run db:generate
```
- **Expected Result:** Drizzle successfully evaluates `db/schema.ts` and `db/relations.ts` with 0 syntax or relation mismatch errors.
