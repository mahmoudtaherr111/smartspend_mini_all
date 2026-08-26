# Milestone 1: Database Schema, Advisory Lock & Backend Error Hardening — Handoff Report

> **Agent:** `worker_m1_backend_1`  
> **Milestone:** Milestone 1 (Backend Hardening & Schema Optimizations)  
> **Date:** August 25, 2026  
> **Status:** Fully Completed & Verified  

---

## 1. Observation

Direct code analysis and file modifications across the 7 owned files revealed the following exact states and changes:

1. **`db/schema.ts` (`monthlyReports` Table, lines 275–278):**
   - **Before:**
     ```typescript
     (t) => [
       index("reports_user_idx").on(t.userId, t.userType),
       index("reports_month_idx").on(t.month),
       uniqueIndex("reports_user_month_unique").on(t.userId, t.userType, t.month),
     ]
     ```
   - **After:** Removed redundant `reports_user_idx`. Left-prefix indexing on `(userId, userType)` is fully satisfied by `uniqueIndex("reports_user_month_unique").on(t.userId, t.userType, t.month)`.

2. **`api/services/scheduler-lock.ts` (lines 1–25):**
   - **Before:** Generic query used `RowDataPacket[] & Array<{ acquired: number }>` which triggered TypeScript TS2344 generic constraint violation against `mysql2/promise`.
   - **After:** Added explicit interface:
     ```typescript
     interface LockAcquiredRow extends RowDataPacket {
       acquired: number | null;
     }
     ```
     Updated query signature to `await connection.query<LockAcquiredRow[]>("SELECT GET_LOCK(?, 0) AS acquired", [lockName])`.

3. **`api/support-router.ts` (lines 82 and 204):**
   - **Before:** Raw `throw new Error("غير مصرح")` in `getById` and `close` endpoints returned ambiguous 500 HTTP status.
   - **After:** Replaced with structured tRPC error:
     ```typescript
     throw new TRPCError({
       code: "FORBIDDEN",
       message: "غير مصرح لك بالوصول لهذه التذكرة",
     });
     ```

4. **`api/profile-router.ts` (line 420):**
   - **Before:** Raw `throw new Error("لازم تعمل Token الأول قبل ما تستخدم Magic Link.")` in `generateMagicCode`.
   - **After:** Replaced with structured tRPC error:
     ```typescript
     throw new TRPCError({
       code: "PRECONDITION_FAILED",
       message: "يجب إنشاء رمز ربط أولاً قبل استخدام الرابط السريع",
     });
     ```

5. **`api/admin-whatsapp-router.ts` (lines 121 and 171):**
   - **Before:** Imported no `TRPCError`, threw raw errors `throw new Error(err.message || "فشل إرسال الرسالة")` in `sendDirectMessage` and `throw new Error("لا يوجد مستخدمين بأرقام هواتف مسجلة")` in `broadcastMessage`.
   - **After:** Added `import { TRPCError } from "@trpc/server"`, converted line 121 to `throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message || "فشل إرسال الرسالة" })`, and converted line 171 to `throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد مستخدمين بأرقام هواتف مسجلة" })`.

6. **`api/ai-router.ts` (lines 1988, 2960, 3127):**
   - **Before:** `generateMonthlyInsights`, `compareMonths`, and `generateYearlyInsights` were declared with `authedProcedure`, bypassing AI rate limiting and token consumption tracking.
   - **After:** Switched all three procedures to `aiProcedure`.

7. **`api/analytics-router.ts` (lines 143–190):**
   - **Before:** `getDashboardStats` counted `adminCount`, `moderatorCount`, and `proCount` solely from `localUsers`, omitting Google OAuth users in the `users` table and ignoring the `ultra` plan.
   - **After:** Imported `inArray` from `drizzle-orm`, queried `oauthAdminCount`, `oauthModeratorCount`, and `oauthProCount` from `users` (using `inArray(plan, ["pro", "ultra"])` on both tables), and summed both datasets into the final dashboard metrics.

---

## 2. Logic Chain

1. **Schema Optimization:** Compound B-Tree indexes satisfy queries filtering on any leftmost prefix. Having `reports_user_idx` on `(userId, userType)` alongside `reports_user_month_unique` on `(userId, userType, month)` duplicated index maintenance on every monthly report generation. Dropping the former removes disk and write overhead with zero query performance regression.
2. **Type Safety in Advisory Lock:** `mysql2/promise` requires `connection.query<T>` type parameter `T` to extend `RowDataPacket[] | RowDataPacket[][] | ...`. Defining `interface LockAcquiredRow extends RowDataPacket` cleanly satisfies this constraint and resolves TS2344.
3. **Error Handling Architecture:** tRPC maps `TRPCError` codes to explicit HTTP status codes (e.g. `FORBIDDEN` -> 403, `PRECONDITION_FAILED` -> 412, `NOT_FOUND` -> 404, `INTERNAL_SERVER_ERROR` -> 500). Raw JavaScript `Error` throws are caught by tRPC as generic internal server errors (500), losing semantics for frontend error handling.
4. **AI Rate Limiting & Resource Protection:** `aiProcedure` applies user-level AI budget checks and 100 req/min rate limits. Heavy analytical LLM generation procedures (`generateMonthlyInsights`, `compareMonths`, `generateYearlyInsights`) consume significant external tokens; placing them behind `aiProcedure` prevents abuse.
5. **Dual-User Multi-Tenant Metric Accuracy:** The architecture operates dual identity tables (`users` for Google OAuth and `localUsers` for OTP/password). In `getDashboardStats`, filtering only `localUsers` caused OAuth admins, moderators, and Pro/Ultra subscribers to be completely hidden in executive metrics. Querying both tables and aggregating provides full system observability.

---

## 3. Caveats

- **No Caveats:** All changes were confined strictly within the designated 7 files. No unintended files or migrations were touched.
- **External AI & Offline Vitest Suites:** 6 tests in `classification-golden.test.ts` and `comprehensive-classification.test.ts` hit the known offline database timeout issue (as identified in M2 / PROJECT.md Feature 8). All other 69 test suites (424 tests) passed with 0 regressions.

---

## 4. Conclusion

Milestone 1 is completely implemented and verified:
- Redundant index removed from `db/schema.ts`.
- Advisory lock typing fixed in `api/services/scheduler-lock.ts`.
- Structured `TRPCError` exceptions standardized in `api/support-router.ts`, `api/profile-router.ts`, and `api/admin-whatsapp-router.ts`.
- AI procedures properly protected in `api/ai-router.ts`.
- Dual-user analytics metrics properly aggregated in `api/analytics-router.ts`.
- Full monorepo type-checking passed cleanly via `npm run check`.

---

## 5. Verification Method

To independently verify these changes:

1. **TypeScript Typecheck:**
   ```bash
   npm run check
   ```
   *Expected result:* `tsc -b` exits with code 0 and 0 errors.

2. **Test Suite Execution:**
   ```bash
   npm test
   ```
   *Expected result:* 69 test suites pass (424 tests pass, 0 regressions introduced).

3. **File Inspection:**
   - Verify `reports_user_idx` is absent in `db/schema.ts:275-279`.
   - Verify `LockAcquiredRow` in `api/services/scheduler-lock.ts`.
   - Verify `TRPCError` in `api/support-router.ts`, `api/profile-router.ts`, and `api/admin-whatsapp-router.ts`.
   - Verify `aiProcedure` on `generateMonthlyInsights`, `compareMonths`, and `generateYearlyInsights` in `api/ai-router.ts`.
   - Verify dual-user queries in `api/analytics-router.ts`.
