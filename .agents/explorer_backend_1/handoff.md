# Backend & Architecture Audit Handoff Report

> **Handoff Type:** Hard Handoff (Phase 0 Survey Complete)  
> **Agent:** Backend & Architecture Explorer (`teamwork_preview_explorer`)  
> **Target Audience:** Orchestrator & Implementation Team  
> **Date:** August 23, 2026  
> **Detailed Report:** `E:/smartspend_V1_fixed/.agents/explorer_backend_1/survey_backend.md`

---

## 1. Observation

1. **48 Database Tables:** Verified in `db/schema.ts` (1,086 lines) and `db/relations.ts` (405 lines). All 48 tables are fully defined with relational mappings to both `users` (OAuth) and `localUsers` (phone/password).
2. **22 tRPC Sub-Routers & Hono Endpoints:** Verified in `api/router.ts` (22 sub-routers mounted) and `api/boot.ts` (native endpoints including Paymob webhooks, SSE OTP streaming, and `/api/sms`).
3. **Dual-Auth Context Resolution (`api/context.ts:52-158`):** `context.ts` resolves `google_session` cookie against `users` and `Bearer` token against `users`/`localUsers`, checking the `sessions` DB table. However, line 144 omits `avatar` for `localUsers`.
4. **Phone Registration Discrepancy (`api/local-auth-router.ts:72, 128`):** Line 72 sanitizes input using `cleanPhoneNumber()`, but line 128 inserts `input.phone` (raw string) into `localUsers.phone`.
5. **User Deletion Data Cascades (`api/local-auth-router.ts:348-372` & `api/admin-router.ts:360-384`):** Deleting a user only deletes from 19 tables, leaving orphaned rows across 14+ newer tables (`userCredentials`, `authChallenges`, `chatConversations`, `aiMemoryItems`, `aiPendingActions`, etc.).
6. **Dashboard Stats Dual-Auth Omission (`api/analytics-router.ts:165-168`):** Lines 165-168 query `adminCount`, `moderatorCount`, and `proCount` exclusively from `localUsers`, omitting all OAuth users.
7. **ACID Boundaries in Ledger Operations:**
   - Compliant: `expenseRouter.create` (`api/expense-router.ts:336-364`), `batchCreate` (`api/expense-router.ts:430-444`), `delete` (`api/expense-router.ts:771-782`), and `walletRouter.deleteWallet` (`api/wallet-router.ts:100-122`) are wrapped in `db.transaction()`.
   - Non-compliant: `profileRouter.deleteContact` (`api/profile-router.ts:723-738`), `profileRouter.mergeContacts` (`api/profile-router.ts:820-845`), `imageRouter.parseReceipt` (`api/image-router.ts:156-174`), `smsRouter.ingest` (`api/sms-router.ts:450-489`), and `referralRouter.applyCode` (`api/referral-router.ts:153-166`) execute multi-step mutations without `db.transaction()`.
8. **Settings Cache Violations:** `businessRouter.getApiKey` (`api/business-router.ts:37-49`) queries raw SQL on `system_settings`, and `adminRouter.setUserTokenLimit` (`api/admin-router.ts:1355-1381`) mutates `system_settings` without calling `invalidateSettingsCache()`.
9. **Salary Day Budget Calculation Ignored (`api/budget-router.ts:25-44`):** `budgetRouter.list` calculates spending between day 1 and end of calendar month, completely ignoring user-configured `periodStartDay`.
10. **Error Standardization Inconsistencies:** `supportRouter.getById` (`api/support-router.ts:83`) and `supportRouter.close` (`api/support-router.ts:201`) throw raw JS `new Error("غير مصرح")` instead of `TRPCError`.

---

## 2. Logic Chain

1. From (1) and (3), SmartSpend relies on polymorphic user references across 48 tables. When user attributes are omitted in context normalization (e.g. `avatar` for local users), frontend profiles fail to render local user avatars.
2. From (4), storing raw `input.phone` while authenticating via `cleanPhone` introduces edge-case login failures for numbers containing whitespace or non-standard formatting.
3. From (5), because MySQL lacks polymorphic foreign key cascade constraints across dual user tables, user deletion must be explicitly coordinated. Omitting newer tables in `deleteUser` leads to database bloat and dangling foreign keys.
4. From (7), multi-step writes without `db.transaction()` (such as unlinking expenses and deleting contacts) risk partial failure during network drops, leaving expenses pointing to non-existent contacts or in half-merged states.
5. From (8), direct reads or un-invalidated updates of `system_settings` cause node processes to run on stale configuration (such as model overrides or token limits) for up to the 5-minute cache TTL.
6. From (9), ignoring `periodStartDay` causes users on non-calendar monthly pay cycles (e.g., paid on the 25th) to receive inaccurate budget progress notifications and UI progress bars.

---

## 3. Caveats

1. **Production Database Constraints:** Native foreign key `ON DELETE CASCADE` cannot be added to `(userId, userType)` columns in MySQL without trigger-based workarounds; application-level transactional cascading remains mandatory.
2. **AI Provider Latency:** External LLM calls (Gemini, Fireworks, Groq) cannot be wrapped in database transactions to avoid holding open DB connection locks during network I/O. Non-critical AI side-effects must remain outside transactional blocks.
3. **Live Voice WebSockets:** WebSocket connections under `/api/voice/live` depend on Redis; if Redis is unavailable, the fallback memory cache limits voice session scalability to single-process deployments.

---

## 4. Conclusion

The SmartSpend backend architecture is robust, cleanly modularized, and enforces strict RBAC and rate-limiting middleware. The financial ledger in `expenseRouter` demonstrates exemplary ACID transaction safety and streak gamification. However, 25 specific architectural and logical flaws (cataloged in `survey_backend.md`) require remediation:
- Dual-auth normalization and complete cascade deletion across all 48 tables.
- Transactional wrapping of contact mutations, SMS ingestion, and image ingestion.
- Strict adherence to `settings-cache.ts` and `TRPCError` throwing.
- Budget calculation alignment with user salary days (`periodStartDay`).

---

## 5. Verification Method

1. **Static Type Validation:**
   ```bash
   npm run check
   ```
   Verifies that all 22 sub-routers in `api/router.ts` conform to tRPC v11 contracts and Drizzle schema types.
2. **Automated Test Suite:**
   ```bash
   npm run test
   ```
   Runs Vitest test suites (e.g., `api/expense-router.test.ts`, `api/middleware.test.ts`, `api/chat-router.phase0.test.ts`).
3. **Key Files to Inspect:**
   - `api/context.ts` (lines 138-147 for UnifiedUser avatar resolution)
   - `api/local-auth-router.ts` (lines 128, 348-372 for registration and deletion cascade)
   - `api/admin-router.ts` (lines 360-384, 1355-1381 for admin user deletion and settings cache)
   - `api/budget-router.ts` (lines 25-44 for salary day calculation)
   - `api/profile-router.ts` (lines 723-738, 820-845 for transactional contact operations)
