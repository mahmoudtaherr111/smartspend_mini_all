## 2026-08-29T10:52:05Z
Read e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md and e:/smartspend_V1_fixed/AGENTS.md before starting.
Your working directory is e:/smartspend_V1_fixed/.agents/worker_m5_auth_sync_2/. Create and maintain progress.md and BRIEFING.md there.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Assigned Scope: M5 (Auth Multi-Tab Sync, Dual-Auth Consistency & Backend Rigor)
Exclusively Owned Files:
- `src/providers/AuthProvider.tsx` (new)
- `src/hooks/useAuth.ts`
- `src/providers/trpc.ts`
- `api/context.ts`
- `api/auth-router.ts`
- `api/local-auth-router.ts`
- `api/services/scheduler-lock.ts`
- `api/analytics-router.ts`
- `api/support-router.ts`
- `api/profile-router.ts`
- `api/admin-whatsapp-router.ts`
- `db/schema.ts`

Step-by-Step Instructions:
1. Multi-Tab Auth Synchronization:
   - Create `src/providers/AuthProvider.tsx` context with BroadcastChannel("smartspend_auth") and window.addEventListener("storage", ...) listening for local_auth_token changes. Broadcast LOGIN, LOGOUT, and SESSION_EXPIRED events across tabs.
   - Update `src/hooks/useAuth.ts` to consume AuthProvider context and sync state across tabs.
   - Reset React Query cache on logout/account switch.
2. Dual-Auth Precedence & Server Cookie Clearing:
   - In `api/context.ts`, give Authorization: Bearer <token> evaluation precedence when present so stale Google OAuth HttpOnly cookies do not shadow local phone/password sessions.
   - In `api/auth-router.ts` and `api/local-auth-router.ts`, set server-side Set-Cookie: google_session=; Max-Age=0; Path=/ on logout to guarantee HttpOnly cookie removal.
3. In-Flight Token Expiry & Form State:
   - In `src/providers/trpc.ts`, add a 401 interceptor saving dirty form drafts to sessionStorage.
4. Backend Rigor & Bug Fixes:
   - Fix TS2344 generic lock typing in `api/services/scheduler-lock.ts`.
   - Standardize TRPCError in support-router.ts, profile-router.ts, admin-whatsapp-router.ts.
   - Aggregate OAuth + local users for admin/moderator/pro in analytics-router.ts.
   - Remove redundant reports_user_idx in db/schema.ts.
5. Validate your changes with `npm run check` and vitest tests.
6. Write your comprehensive completion report to `e:/smartspend_V1_fixed/.agents/worker_m5_auth_sync_2/handoff.md` and notify orchestrator via send_message.
