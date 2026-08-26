# Handoff Report — Explorer 2: Requirements R3 & R4

> **Agent:** `explorer_2` (Teamwork Explorer)  
> **Milestone:** Remediation Phase 1 Exploration (R3 & R4)  
> **Date:** August 23, 2026  
> **Status:** Complete (Hard Handoff)  

---

## 1. Observation

### R3: Relational Database Integrity & Schema Optimization
1. **Table Definitions (`db/schema.ts`):**
   - Exactly 48 tables are defined using `mysqlTable` across 1,091 lines.
   - 4 tables are non-relational or stateless admin pools (`systemSettings` line 485, `onboardingQuestions` line 577, `seoPages` line 471, `whatsappOtpCodes` line 747).
   - 44 tables are relational and associate with users, businesses, chats, or other records.
2. **Relational Coverage (`db/relations.ts`):**
   - Exactly 41 relation blocks are exported across 405 lines.
   - Three relational tables (`discountCodes` imported line 18, `referrals` imported line 22, `apiKeyErrors` imported line 32) have **zero exported relations blocks**.
   - `usersRelations` (lines 49-81) and `localUsersRelations` (lines 83-115) currently omit inverse `many(...)` relations for: `adClicks`, `aiMemoryEmbeddings`, `authChallenges`, `classificationLogs`, `discountCodes`, `apiKeyErrors`, `referralsMade`, `referralsReceived`.
3. **Index Topology in `db/schema.ts`:**
   - Production critical indexes are present:
     * `sessions.expiresAt`: `index("sessions_expires_idx").on(t.expiresAt)` at line 300.
     * `monthlyReports(userId, userType, month)`: `uniqueIndex("reports_user_month_unique").on(t.userId, t.userType, t.month)` at line 281.
     * `referrals(referredId, referredType)`: `uniqueIndex("referral_referred_unique_idx").on(t.referredId, t.referredType)` at line 444.
   - Exactly 8 redundant / left-prefix duplicate secondary indexes are present:
     * `expenses_user_idx` (`db/schema.ts:112`) on `(userId, userType)` [left prefix of `expenses_user_date_idx` at line 114].
     * `users_referral_idx` (`db/schema.ts:43`) on `(referralCode)` [duplicates column `.unique()` at line 27].
     * `webhook_tokens_token_idx` (`db/schema.ts:670`) on `(token)` [duplicates column `.unique()` at line 664].
     * `user_dict_user_idx` (`db/schema.ts:601`) on `(userId, userType)` [left prefix of `user_dict_word_unique` at line 602].
     * `ai_summary_user_idx` (`db/schema.ts:377`) on `(userId, userType)` [left prefix of `ai_summary_period_idx` at line 378].
     * `chat_msg_conv_idx` (`db/schema.ts:933`) on `(conversationId)` [left prefix of `chat_msg_created_idx` at line 934].
     * `business_cat_idx` (`db/schema.ts:172`) on `(businessId)` [left prefix of `business_cat_active_idx` at line 173].
     * `ai_memory_embedding_item_idx` (`db/schema.ts:1006`) on `(memoryItemId)` [left prefix of `ai_memory_embedding_unique_idx` at line 1008].
4. **Referral Code Concurrency & Atomicity:**
   - In `api/referral-router.ts:90-178` (`applyCode`), redemption runs inside `db.transaction(async (tx) => { ... })`.
   - Double redemption is prevented at the schema level by `uniqueIndex("referral_referred_unique_idx").on(t.referredId, t.referredType)` (`db/schema.ts:444`).
   - Duplicate entry errors (`ER_DUP_ENTRY` / `referral_referred_unique_idx`) are caught at lines 171-173 and returned as `TRPCError({ code: "CONFLICT", message: "أنت مسجل بالفعل بكود إحالة" })`.

### R4: Timezone & Egyptian Business-Day Consistency
1. **Core Timezone Primitives (`api/lib/app-time.ts`):**
   - Configured with `APP_TIMEZONE` (`"Africa/Cairo"`, `api/lib/env.ts:30`).
   - `businessDateKey`: Formats `YYYY-MM-DD` via `Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" })`.
   - `startOfBusinessDay`: Computes UTC instant for Cairo `00:00:00.000`, iteratively compensating for Egyptian DST shifts (UTC+2 / UTC+3).
   - `businessDayRange`: Resolves half-open `[start, endExclusive)` by stepping 36h from `start`, preventing 23:59:59 day-skip bugs.
   - `businessMonthRange`: Resolves half-open `[start, endExclusive)` for the Cairo calendar month.
   - Tested in `api/lib/app-time.test.ts` (covers midnight transitions `21:59:59.999Z` vs `22:00:00.000Z`, 23:59 boundaries, and month ranges).
2. **Subsystem Implementations:**
   - Daily Chat Messages: `api/chat-router.ts:108-132` queries `gte(chatMessages.createdAt, today.start)` & `lt(chatMessages.createdAt, today.endExclusive)` using `businessDayRange()`.
   - Daily Streaks: `api/expense-router.ts:238-273` uses `businessDayRange(now)` and `businessDayRange(today.start - 1ms)` in atomic SQL `CASE` expressions.
   - Budget Salary Cycles: `api/budget-router.ts:9-33, 51-85` calculates spending periods from `userBudgets.periodStartDay` (e.g., 25th of month) anchored to Cairo midnight via `businessDateKey` and `startOfBusinessDay`.
   - Minor non-standardized host date call sites: `api/lib/ai-usage-policy.ts:289`, `api/analytics-router.ts:145-146`, and `api/notification-engine.ts:641` use `setHours(0, 0, 0, 0)` instead of `businessDayRange().start`.

---

## 2. Logic Chain

1. From observation (R3.2), `db/relations.ts` imports `discountCodes`, `referrals`, and `apiKeyErrors` but does not export `relations()` for them. Therefore, Drizzle relational queries (`db.query.discountCodes...`, `db.query.referrals...`, `db.query.apiKeyErrors...`) cannot resolve these relationships, resulting in type errors and relational query failures.
2. From observation (R3.3), MySQL composite B-Tree indexes automatically support lookups on any leftmost subset of indexed columns. Secondary indexes that index only a left prefix of an existing composite index (or duplicate an existing `.unique()` column index) consume write I/O and memory without providing index lookup benefit. Dropping the 8 identified indexes optimizes database insert/update throughput.
3. From observation (R3.4), wrapping referral application in `db.transaction()` combined with the unique index `(referredId, referredType)` guarantees ACID isolation. Concurrent attempts to redeem a code will result in exactly one insert succeeding and all others failing with unique constraint violations mapped cleanly to `CONFLICT`.
4. From observation (R4.1 & R4.2), Egyptian business operations (salary dates, daily expense counts, chat quota resets, streaks) must align strictly with Cairo local calendar days. Using `Intl.DateTimeFormat` with `Africa/Cairo` and computing UTC instant boundaries in `app-time.ts` guarantees host UTC invariance. Replacing the remaining 3 legacy `setHours(0, 0, 0, 0)` call sites guarantees 100% codebase consistency.

---

## 3. Caveats

1. **MySQL Migration Execution:** Dropping redundant indexes and updating relations requires schema synchronization via `npm run db:generate` or SQL migrations.
2. **Registration Referral Flow:** In `api/local-auth-router.ts:118-124`, when a referral code is passed during registration, it checks `localUsers` and records `referredBy` on `localUsers`. It does not insert a row into the `referrals` table at registration time; `referrals` rows are populated via `referralRouter.applyCode`.
3. **Database Client Mode:** `api/queries/connection.ts` passes `{ ...schema, ...relations }` into Drizzle ORM `drizzle()`. Once `db/relations.ts` exports all missing relations, Drizzle schema types refresh automatically on `npm run check`.

---

## 4. Conclusion

- **Requirement R3 Status:** Ready for implementation. Add 3 missing relation blocks (`discountCodesRelations`, `referralsRelations`, `apiKeyErrorsRelations`) and inverse mappings to `db/relations.ts`. Remove 8 redundant left-prefix duplicate indexes from `db/schema.ts`. Referral application is fully verified as atomic and concurrency-safe.
- **Requirement R4 Status:** Core timezone architecture in `api/lib/app-time.ts` is fully compliant and tested for Egyptian midnight transitions. Daily chat limits, streaks, and `periodStartDay` salary cycles correctly use `Africa/Cairo`. Standardize the remaining 3 legacy `setHours(0, 0, 0, 0)` call sites to use `businessDayRange().start`.

---

## 5. Verification Method

To independently verify the findings and code state:
1. **Schema & Relations Typecheck:**
   ```bash
   npm run check
   ```
2. **Timezone & Time Boundaries Test Suite:**
   ```bash
   npx vitest run api/lib/app-time.test.ts
   npx vitest run api/services/finance-semantic-layer/period-resolver.test.ts
   ```
3. **Inspect Target Files:**
   - `db/schema.ts`: Check lines 43, 112, 172, 377, 444, 601, 670, 933, 1006.
   - `db/relations.ts`: Check lines 18, 22, 32, 49-115, 400-405.
   - `api/referral-router.ts`: Check lines 90-178.
   - `api/lib/app-time.ts` & `api/lib/app-time.test.ts`.
   - `api/budget-router.ts`: Check lines 9-33, 51-85.
