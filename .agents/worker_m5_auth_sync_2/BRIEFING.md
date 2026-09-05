# BRIEFING — 2026-08-29T10:52:05Z

## Mission
Implement Auth Multi-Tab Sync, Dual-Auth Consistency & Backend Rigor for Milestone M5.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: e:\smartspend_V1_fixed\.agents\worker_m5_auth_sync_2
- Original parent: 55abd75b-094b-4611-9e83-295fbad74ab0
- Milestone: M5 (Auth Multi-Tab Sync, Dual-Auth Consistency & Backend Rigor)

## 🔒 Key Constraints
- Exclusively owned files:
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
- Do not touch files outside this scope without strict need.
- Follow minimal change principle and rigorous TypeScript type safety.
- All implementations must be genuine, maintaining real state and behavior.

## Current Parent
- Conversation ID: 55abd75b-094b-4611-9e83-295fbad74ab0
- Updated: not yet

## Task Summary
- **What to build**:
  1. AuthProvider with BroadcastChannel + storage event listener for cross-tab auth state sync (LOGIN, LOGOUT, SESSION_EXPIRED), useAuth hook integration, React Query cache reset.
  2. Dual-auth precedence in `api/context.ts` (Bearer token prioritized over Google cookie). Set-Cookie google_session Max-Age=0 in auth logout procedures.
  3. In-flight token expiry 401 interceptor saving dirty form drafts to sessionStorage in `src/providers/trpc.ts`.
  4. Backend fixes: TS2344 generic lock in scheduler-lock.ts, TRPCError standardization in support/profile/admin-whatsapp routers, OAuth+local user aggregation in analytics-router.ts, remove redundant reports_user_idx in db/schema.ts.
- **Success criteria**: Typecheck passes (`npm run check`), vitest passes, genuine implementations, clean handoff report.
- **Interface contracts**: `contracts/` and `AGENTS.md`
- **Code layout**: Root `api/`, `src/`, `db/`

## Key Decisions Made
- [TBD]

## Artifact Index
- `.agents/worker_m5_auth_sync_2/DISPATCH.md` — Assignment instructions
- `.agents/worker_m5_auth_sync_2/progress.md` — Progress tracker
- `.agents/worker_m5_auth_sync_2/handoff.md` — Final handoff report

## Change Tracker
- **Files modified**: None yet
- **Build status**: Untested
- **Pending issues**: None

## Quality Status
- **Build/test result**: Not run yet
- **Lint status**: Not run yet
- **Tests added/modified**: TBD

## Loaded Skills
- None
