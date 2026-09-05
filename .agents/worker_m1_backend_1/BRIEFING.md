# BRIEFING — 2026-08-28T14:56:00Z

## Mission
Implement Milestone 5: Auth Multi-Tab Sync, Dual-Auth Consistency & Backend Rigor.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: E:\smartspend_V1_fixed\.agents\worker_m1_backend_1\
- Original parent: 55abd75b-094b-4611-9e83-295fbad74ab0
- Milestone: Milestone 5 (Auth Multi-Tab Sync, Dual-Auth Consistency & Backend Rigor)

## 🔒 Key Constraints
- File boundaries: own and edit ONLY:
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
- Genuine implementation only, no cheating or facade logic.
- Verify using `npm run check` and relevant vitest tests.

## Current Parent
- Conversation ID: 55abd75b-094b-4611-9e83-295fbad74ab0
- Updated: 2026-08-28T14:56:00Z

## Task Summary
- **What to build**:
  1. Multi-Tab Auth Synchronization (`AuthProvider.tsx`, `useAuth.ts`):
     - BroadcastChannel("smartspend_auth") + window "storage" listener for `local_auth_token` changes.
     - Broadcast LOGIN, LOGOUT, SESSION_EXPIRED across tabs.
     - Reset React Query cache on logout/account switch.
  2. Dual-Auth Precedence & Server Cookie Clearing:
     - In `api/context.ts`, give `Authorization: Bearer <token>` evaluation precedence when present.
     - In `api/auth-router.ts` and `api/local-auth-router.ts`, set server-side `Set-Cookie: google_session=; Max-Age=0; Path=/` on logout to guarantee HttpOnly cookie removal.
  3. In-Flight Token Expiry & Form State:
     - In `src/providers/trpc.ts`, add a 401 interceptor saving dirty form drafts to `sessionStorage`.
  4. Backend Rigor & Bug Fixes:
     - Fix TS2344 generic lock typing in `api/services/scheduler-lock.ts`.
     - Standardize `TRPCError` in `support-router.ts`, `profile-router.ts`, `admin-whatsapp-router.ts`.
     - Aggregate OAuth + local users for admin/moderator/pro in `analytics-router.ts`.
     - Remove redundant `reports_user_idx` in `db/schema.ts`.
- **Success criteria**: All items implemented cleanly, `npm run check` passes with 0 errors, `npm test` passes with 0 regressions.
- **Interface contracts**: AGENTS.md, docs/05-AUTH_AND_SECURITY.md.
- **Code layout**: Standard monorepo layout.

## Key Decisions Made
- [TBD - to be recorded during implementation]

## Artifact Index
- `E:\smartspend_V1_fixed\.agents\worker_m1_backend_1\DISPATCH.md` — Dispatch briefing
- `E:\smartspend_V1_fixed\.agents\worker_m1_backend_1\progress.md` — Progress tracker
- `E:\smartspend_V1_fixed\.agents\worker_m1_backend_1\handoff.md` — Handoff report

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: [TBD]
- **Pending issues**: none

## Quality Status
- **Build/test result**: [TBD]
- **Lint status**: [TBD]
- **Tests added/modified**: [TBD]

## Loaded Skills
- None
