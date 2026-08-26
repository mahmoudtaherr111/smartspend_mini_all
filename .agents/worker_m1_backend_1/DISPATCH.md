## 2026-08-25T03:18:00Z
You are worker_m1_backend_1.
Your working directory is E:\smartspend_V1_fixed\.agents\worker_m1_backend_1\ (metadata only, no source files).
The workspace root is E:\smartspend_V1_fixed.
The constitution is E:\smartspend_V1_fixed\AGENTS.md.
The user request is E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md.
The project plan is E:\smartspend_V1_fixed\PROJECT.md.
The backend survey report is E:\smartspend_V1_fixed\.agents\survey_backend_r3_r4_r5\handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission: Implement Milestone 1 (Database Schema, Advisory Lock & Backend Error Hardening).

File Boundaries & Exclusive Ownership:
You own and edit ONLY:
- `db/schema.ts`
- `api/services/scheduler-lock.ts`
- `api/support-router.ts`
- `api/profile-router.ts`
- `api/admin-whatsapp-router.ts`
- `api/ai-router.ts`
- `api/analytics-router.ts`

Tasks:
1. `db/schema.ts`: Drop redundant `reports_user_idx` in `monthlyReports` table (line ~276).
2. `api/services/scheduler-lock.ts`: Define `interface LockAcquiredRow extends RowDataPacket { acquired: number | null; }` and query as `connection.query<LockAcquiredRow[]>(...)` to resolve TS2344 generic typing.
3. `api/support-router.ts`: Replace raw `throw new Error("غير مصرح")` with `throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح لك بالوصول لهذه التذكرة" })` at lines 82 and 201.
4. `api/profile-router.ts`: Replace raw `throw new Error("لازم تعمل Token الأول...")` with `throw new TRPCError({ code: "PRECONDITION_FAILED", message: "يجب إنشاء رمز ربط أولاً قبل استخدام الرابط السريع" })` at line 420.
5. `api/admin-whatsapp-router.ts`: Replace raw `throw new Error(...)` with `throw new TRPCError` at lines 120 and 167.
6. `api/ai-router.ts`: Switch `generateMonthlyInsights`, `compareMonths`, and `generateYearlyInsights` from `authedProcedure` to `aiProcedure`.
7. `api/analytics-router.ts`: Update `getDashboardStats` to query and sum admin, moderator, and pro/ultra counts across both `localUsers` and `users` (using `inArray(plan, ["pro", "ultra"])`).

Verification:
- Run `npm run check` (TypeScript typecheck).
- Run `npm test` or relevant test suites to ensure 0 regressions.

Output:
Write a comprehensive handoff report to E:\smartspend_V1_fixed\.agents\worker_m1_backend_1\handoff.md detailing all modifications and verification results.
Send a completion message back to parent when finished.
