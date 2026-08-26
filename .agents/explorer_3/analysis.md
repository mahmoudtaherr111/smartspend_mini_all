# SmartSpend AI — Deep Forensic Investigation Report: R5, R6 & Baseline Diagnostics

**Author / Role:** Explorer 3 (Performance, Resilience, Error Standardization & Diagnostics)  
**Date:** August 23, 2026  
**Working Directory:** `E:/smartspend_V1_fixed/.agents/explorer_3/`  
**Reference Documents:** `ORIGINAL_REQUEST.md`, `MASTER_ROOT_CAUSE_CATALOG.md`, `AGENTS.md`, `docs/01-ARCHITECTURE.md` through `docs/09-RELEASE_AND_PLAYBOOK.md`

---

## Executive Summary

This forensic report provides exhaustive, line-by-line evidence and analysis covering:
1. **Requirement R5:** Server Performance, Advisory Locks, Background Schedulers & AI Provider Resilience
2. **Requirement R6:** Error Standardization, UI Resilience (Dialog accessibility & title sync), Repository Hygiene
3. **Full Monorepo Baseline Diagnostics:** Exact compiler diagnostic (`npm run check`) and test suite status (`npm test`)

---

## 1. Monorepo Baseline Diagnostics

### 1.1 TypeScript Type Check (`npm run check` $\rightarrow$ `tsc -b`)
- **Execution Command:** `npm run check`
- **Result:** **FAILED (Exit Code 1)**
- **Total Errors:** 1 TypeScript compilation error
- **Error Breakdown:**
  ```text
  api/services/scheduler-lock.ts(15,43): error TS2344: Type '{ acquired: number; }[]' does not satisfy the constraint 'QueryResult'.
    Type '{ acquired: number; }[]' is not assignable to type 'OkPacket | ResultSetHeader | ResultSetHeader[] | RowDataPacket[] | RowDataPacket[][] | OkPacket[]'.
      Type '{ acquired: number; }[]' is not assignable to type 'ResultSetHeader[]'.
        Type '{ acquired: number; }' is missing the following properties from type 'ResultSetHeader': affectedRows, fieldCount, info, insertId, and 3 more.
  ```
- **Root Cause:** `mysql2/promise` connection `connection.query<T>` requires `T` to satisfy `QueryResult` (e.g. `RowDataPacket[]` or `RowDataPacket & { acquired: number }[]`), whereas a plain interface array `{ acquired: number }[]` was passed.

### 1.2 Vitest Test Suite Baseline (`npm test`)
- **Execution Command:** `npm test`
- **Result:** **72 Suites, 431 Tests**
  - **Suites:** 69 Passed, 2 Failed, 1 Skipped
  - **Tests:** 422 Passed, 8 Failed, 1 Skipped
  - **Duration:** 74.96s
- **Failing Suites & Tests Breakdown:**
  1. `api/lib/classification-golden.test.ts` (3 failing tests):
     - `classification golden suite for Egyptian colloquial inputs > 'three local expenses in one sentence'` (Timeout > 5000ms)
     - `classification golden suite for Egyptian colloquial inputs > 'long narrative with known person'` (Timeout > 5000ms)
     - `classification golden suite for Egyptian colloquial inputs > 'long narrative stops for unknown person'` (Timeout > 5000ms)
  2. `api/lib/comprehensive-classification.test.ts` (5 failing tests):
     - `GROUP 1: Egyptian Slang & Complex Multi-Item Ingestion > 1. فول وطعمية + ميكروباص + قهوجي` (Timeout > 5000ms)
     - `GROUP 1: Egyptian Slang & Complex Multi-Item Ingestion > 3. حلاق + اوبر` (Timeout > 5000ms)
     - `GROUP 1: Egyptian Slang & Complex Multi-Item Ingestion > 5. كشري + بيبسي` (Timeout > 5000ms)
     - `GROUP 1: Egyptian Slang & Complex Multi-Item Ingestion > 6. شحن رصيد فودافون + كارت فكة` (Timeout > 5000ms)
     - `GROUP 1: Egyptian Slang & Complex Multi-Item Ingestion > 7. اشتراك جيم + مية` (Timeout > 5000ms)
- **Root Cause of Test Failures:**
  During test execution in unit/offline mode, `smart-pipeline.ts:1162` triggers a direct database query `db.select(...).from(expenses)...` for RAG context retrieval. Because MySQL is offline or access is denied (`ER_ACCESS_DENIED_ERROR: Access denied for user 'test'@'localhost'`), it logs `RAG DB Fetch Failed` and then triggers fallback paths that wait on network timeouts exceeding the 5000ms default Vitest timeout.

---

## 2. Requirement R5: Server Performance, Advisory Locks & Provider Resilience

### 2.1 `batchCreate` in `api/expense-router.ts` (N+1 Query Bottleneck Analysis)
- **Observed File & Lines:** `api/expense-router.ts:378-460` and `api/expense-router.ts:108-176` (`resolveExpenseReferences`)
- **Current Behavior:**
  ```typescript
  // Lines 405-408 in api/expense-router.ts:
  const references = [] as Awaited<ReturnType<typeof resolveExpenseReferences>>[];
  for (const item of input) {
    references.push(await resolveExpenseReferences(item, userId, requestUserType));
  }
  ```
  And inside `resolveExpenseReferences` (lines 130-138 and 161-169):
  - If `contactId` is supplied: executes 1 SQL query per item (`SELECT id FROM user_contacts WHERE id = ? AND user_id = ? AND user_type = ? LIMIT 1`).
  - If `classificationLogId` is supplied: executes 1 SQL query per item (`SELECT id FROM classification_logs WHERE id = ? AND user_id = ? AND user_type = ? LIMIT 1`).
  - Inside the transaction loop (lines 435-440):
    ```typescript
    const linkedContactIds = references
      .map((reference) => reference.contactId)
      .filter((id): id is number => Boolean(id));
    for (const contactId of linkedContactIds) {
      await tx
        .update(userContacts)
        .set({ transactionCount: sql`${userContacts.transactionCount} + 1` })
        .where(eq(userContacts.id, contactId));
    }
    ```
- **Performance Impact:**
  For a batch of 100 transactions, `batchCreate` performs up to **200 sequential SELECT queries** plus **100 sequential UPDATE queries**, turning what should be a sub-50ms bulk insert into a 2–5 second sequential round-trip storm.
- **Architectural Solution:**
  1. Extract all non-null `contactId` values: `[...new Set(input.map(i => i.contactId).filter(Boolean))]`.
  2. Execute a single batched query with `inArray(userContacts.id, contactIds)` and `eq(userContacts.userId, userId)`.
  3. Extract all non-null `classificationLogId` values: `[...new Set(input.map(i => i.classificationLogId).filter(Boolean))]`.
  4. Execute a single batched query with `inArray(classificationLogs.id, logIds)`.
  5. Aggregate contact counts in-memory (`Map<number, number>`) and execute grouped `UPDATE user_contacts SET transactionCount = transactionCount + ${count} WHERE id = ${id}`.

### 2.2 MySQL Advisory Locks (`api/services/scheduler-lock.ts`)
- **Observed File & Lines:** `api/services/scheduler-lock.ts:1-30`
- **Implementation Status:**
  - Uses `mysqlPool.getConnection()` to acquire a dedicated MySQL connection.
  - Generates lock key: `smartspend:cron:${jobName}`.
  - Issues `SELECT GET_LOCK(?, 0) AS acquired`.
  - If acquired (`acquired === 1`), runs `await task()`, then safely issues `SELECT RELEASE_LOCK(?)` in `finally`, and releases the connection back to the pool.
- **Defect Identified:**
  - Line 15 uses `connection.query<Array<{ acquired: number }>>`, which fails TypeScript check TS2344.
  - Fix: Use `import type { RowDataPacket } from "mysql2/promise";` and `connection.query<RowDataPacket[] & Array<{ acquired: number }>>("SELECT GET_LOCK(?, 0) AS acquired", [lockName])`.

### 2.3 Background Worker & Scheduler Environment Flags
- **Observed Files:** `api/lib/env.ts:47-49`, `api/boot.ts:41-65`, `api/boot.ts:507-514`
- **Verification:**
  - `ENABLE_CRONS`: Defined in `env.ts` as `z.enum(["true", "false"]).optional()`. Defaults to `undefined` (falsy) in development/testing.
  - `scheduleProtectedJob` in `boot.ts:48`: `if (!cronsEnabled) return;` prevents cron registration unless explicitly configured.
  - `ENABLE_WHATSAPP`: Defined in `env.ts` as `z.enum(["true", "false"]).optional()`. In `boot.ts:507`, WhatsApp client will NOT start unless `env.ENABLE_WHATSAPP === "true"`.
- **Status:** **Compliant with zero-leakage defaults.**

### 2.4 AI Provider Resilience & Circuit Breakers
- **Observed Files:** `api/lib/fireworks-embedding-client.ts:42-63`, `api/lib/fireworks-embedding-client.test.ts:1-23`
- **Implementation Details:**
  - `markProviderUnavailable(status)`:
    - HTTP 429 (Rate Limit): Circuit opens for 60 seconds (`60_000ms`).
    - HTTP 401, 402, 403 (Auth/Suspension/Payment Required): Circuit opens for 15 minutes (`15 * 60_000ms`).
  - `isProviderUnavailable()`: When open, fast-paths to `null` without invoking `fetch`, avoiding retry storms and upstream lag.
  - In-memory LRU vector cache (`queryEmbeddingCache` and `descriptorEmbeddingCache`) remains operational during open circuit.
  - Verified by Vitest test in `api/lib/fireworks-embedding-client.test.ts` (`suppresses repeated provider calls after an authorization failure`).

---

## 3. Requirement R6: Error Standardization & UI Resilience

### 3.1 tRPC Sub-Router Error Standardization Audit
A comprehensive scan for generic `throw new Error(...)` across all 22 sub-routers identified 7 remaining unstandardized error throws that must be replaced with typed `TRPCError`:

| Sub-Router | Line Number | Current Code | Target TRPC Code & Message |
|---|---|---|---|
| `api/support-router.ts` | 82 | `throw new Error("غير مصرح");` | `throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح لك بالوصول إلى هذه التذكرة" });` |
| `api/support-router.ts` | 201 | `throw new Error("غير مصرح");` | `throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح لك بتنفيذ هذا الإجراء" });` |
| `api/expense-router.ts` | 1728 | `throw new Error(err instanceof Error ? err.message : "تعذر حفظ العمليات بعد التوضيح.");` | `throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "تعذر حفظ العمليات بعد التوضيح." });` |
| `api/expense-router.ts` | 1851 | `throw new Error("التوضيح لسه مش كافي لتسجيل العملية بدقة.");` | `throw new TRPCError({ code: "BAD_REQUEST", message: "التوضيح لسه مش كافي لتسجيل العملية بدقة." });` |
| `api/expense-router.ts` | 1902 | `throw new Error(err instanceof Error ? err.message : "تعذر حفظ التوضيح. جرّب توضيح العلاقة بشكل أبسط.");` | `throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "تعذر حفظ التوضيح." });` |
| `api/profile-router.ts` | 420 | `throw new Error("لازم تعمل Token الأول قبل ما تستخدم Magic Link.");` | `throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لازم تعمل Token الأول قبل ما تستخدم Magic Link." });` |
| `api/admin-whatsapp-router.ts` | 120, 167 | `throw new Error(err.message || "فشل إرسال الرسالة");` and `throw new Error("لا يوجد مستخدمين بأرقام هواتف مسجلة");` | `throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ... })` and `throw new TRPCError({ code: "NOT_FOUND", message: ... })` |

### 3.2 Radix Dialog & Accessibility Warnings
- **Observed Files:** `src/components/ui/command.tsx:45-56`, `src/components/ui/dialog.tsx:47-79`, `src/pages/Admin.tsx:1039-1365`
- **Defects Identified:**
  1. `src/components/ui/command.tsx`: `DialogHeader` containing `DialogTitle` and `DialogDescription` is positioned outside `DialogContent`. Radix UI requires `DialogTitle` to be inside `DialogContent` to establish the accessible label.
  2. Dialog instances lacking `DialogDescription` (e.g. `src/pages/Admin.tsx:1039`, `1085`, `1325`) trigger Radix accessibility warnings unless `aria-describedby={undefined}` or a visually hidden description is provided.
- **Remediation Specification:**
  - Move `DialogHeader` inside `DialogContent` in `src/components/ui/command.tsx`.
  - In `src/components/ui/dialog.tsx`, pass `aria-describedby={props["aria-describedby"] ?? undefined}` so Radix does not log missing description warnings when description is intentionally omitted.

### 3.3 Document Title & SEO Synchronization (`src/components/seo/SEOMeta.tsx`)
- **Observed File:** `src/components/seo/SEOMeta.tsx:1-66`
- **Defects Identified:**
  1. Line 19: `if (!seo) return;` aborts the effect before setting `document.title` if the backend `trpc.seo.getPage` query is pending or returns `null` (e.g. for `/bank-sync` which has no SEO row in DB).
  2. If the user navigates between pages, `document.title` fails to update to the page prop `title`, leaving the browser tab displaying the previous route's title.
  3. `trpc.seo.getPage` query omits `{ retry: false }`, potentially generating retry storms on 404/database errors.
- **Remediation Specification:**
  - Update `document.title = title || data?.title || "SmartSpend AI"` unconditionally at the start of `useEffect`.
  - Pass `{ retry: false, staleTime: 5 * 60 * 1000 }` to `trpc.seo.getPage.useQuery`.

### 3.4 Repository Cleanliness & Hygiene
- **Observed State:**
  - `.gitignore` misses `dev-dist/`, `.audit-pwa-build*`, and root `*.png` screenshot files.
  - Root directory currently contains:
    - 9 root PNG screenshots (`after-record.png`, `ai-center.png`, `bank-sync.png`, `chat-response.png`, `dashboard-desktop.png`, `landing-desktop.png`, `login-desktop.png`, `mobile-dashboard.png`, `pro-page.png`).
    - Build audit scratch folders: `.audit-pwa-build/`, `.audit-pwa-build-final/`, `.audit-pwa-build-next/`, `.audit-pwa-build-release/`, `.audit-server-build/`.
  - `docker-compose.yml` and `Dockerfile` are present and structured with MySQL 8.4, Redis 7.4-alpine, and Node 20 multi-stage build.

---

## 4. Prioritized Engineering Action Plan

1. **Fix `api/services/scheduler-lock.ts`:**
   Import `RowDataPacket` from `mysql2/promise` to eliminate the only TS compilation error.
2. **Optimize `batchCreate` in `api/expense-router.ts`:**
   Refactor `resolveExpenseReferences` to support batched IN queries for `contactId` and `classificationLogId`, and batch the `userContacts` update.
3. **Standardize Sub-Router Errors:**
   Replace raw `Error` throws in `support-router.ts`, `expense-router.ts`, `profile-router.ts`, and `admin-whatsapp-router.ts` with `TRPCError`.
4. **Fix UI Resilience & Title Synchronization:**
   - Move `DialogHeader` inside `DialogContent` in `command.tsx`.
   - Update `SEOMeta.tsx` to set `document.title` immediately from props with `{ retry: false }`.
5. **Clean Repository & `.gitignore`:**
   Add `dev-dist/`, `*.png`, and `.audit-*` to `.gitignore`.
