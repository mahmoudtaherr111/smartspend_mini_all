# BRIEFING — 2026-08-29T12:05:14Z

## Mission
Implement real-time multi-tab session synchronization (BroadcastChannel + storage event) in `src/hooks/useAuth.ts` and graceful 401 unauthenticated session handling in `src/providers/trpc.ts`.

## 🔒 My Identity
- Archetype: worker_m5_auth_sync
- Roles: implementer, qa, specialist
- Working directory: e:/smartspend_V1_fixed/.agents/worker_m5_auth_sync
- Original parent: 13a0f7a9-dce8-4335-a285-380e454ff5a6
- Milestone: M5 - Multi-Tab Auth Sync & Graceful 401 Session Handling

## 🔒 Key Constraints
- Exclusively Owned Files: `src/hooks/useAuth.ts`, `src/providers/trpc.ts` (or auth sync provider).
- DO NOT CHEAT. Genuine implementations only.
- Implement multi-tab sync using `BroadcastChannel("smartspend_auth")` and `window.addEventListener("storage", ...)`.
- Sync login, logout, and token refresh across tabs without full page reloads.
- Handle 401 unauthenticated errors gracefully: notify user of session expiration, preserve any active form draft state, avoid hard page crashes.
- Pass `npm run check` and vitest test suite.

## Current Parent
- Conversation ID: 13a0f7a9-dce8-4335-a285-380e454ff5a6
- Updated: 2026-08-29T12:05:14Z

## Task Summary
- **What to build**: Multi-tab auth synchronization with BroadcastChannel & storage event listeners in `useAuth.ts`, and graceful 401 interceptor/handling in `trpc.ts` with session expiration notifications and form state preservation.
- **Success criteria**: All tabs synchronize login/logout/refresh without full page reloads; 401 errors are intercepted gracefully; tests pass; `npm run check` passes.
- **Interface contracts**: `contracts/` and `src/hooks/useAuth.ts`.
- **Code layout**: `src/hooks/useAuth.ts`, `src/providers/trpc.ts`.

## Change Tracker
- **Files modified**: [None yet]
- **Build status**: Pending
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pending
- **Lint status**: Pending
- **Tests added/modified**: Pending

## Loaded Skills
- None

## Key Decisions Made
- [Initial planning phase]

## Artifact Index
- `.agents/worker_m5_auth_sync/DISPATCH.md` — Dispatch logs
- `.agents/worker_m5_auth_sync/progress.md` — Progress tracker
- `.agents/worker_m5_auth_sync/handoff.md` — Final handoff report
