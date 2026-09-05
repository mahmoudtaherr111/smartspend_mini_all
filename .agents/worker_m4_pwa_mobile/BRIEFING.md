# BRIEFING — 2026-08-30T02:12:02Z

## Mission
Harden PWA Mobile UX (virtual keyboard & visual viewport consolidation) and Auth Synchronization (BroadcastChannel multi-tab sync, 401 form draft preservation, session storage memory leak prevention and teardown).

## 🔒 My Identity
- Archetype: Specialist / Implementer / QA
- Roles: implementer, qa, specialist
- Working directory: e:/smartspend_V1_fixed/.agents/worker_m4_pwa_mobile
- Original parent: cacd9dc6-f7a7-488d-bea7-a95c193ae218
- Milestone: M4 (PWA Viewport & Mobile UX Consolidation) & M5 (Auth Multi-Tab & Session Preservation)

## 🔒 Key Constraints
- Exclusively owned files:
  - `src/hooks/useVirtualKeyboard.ts`
  - `src/hooks/usePwaLifecycle.ts`
  - `src/hooks/useAuth.ts`
  - `src/providers/trpc.ts`
- Zero memory leaks, proper cleanup/teardown on unmount / page unload.
- Consistent visualViewport thresholds.
- `npm run check` and vitest tests pass.

## Current Parent
- Conversation ID: cacd9dc6-f7a7-488d-bea7-a95c193ae218
- Updated: not yet

## Task Summary
- **What to build**:
  1. Consolidate keyboard state management in `src/hooks/usePwaLifecycle.ts` and `src/hooks/useVirtualKeyboard.ts`.
  2. Verify and harden multi-tab auth sync (`BroadcastChannel`), 401 form draft preservation, and session storage handling in `src/hooks/useAuth.ts` and `src/providers/trpc.ts` ensuring clean listener teardown and zero memory leaks.
- **Success criteria**: Full type-check (`npm run check`) pass, test suite passes, seamless keyboard avoidance, robust multi-tab auth sync and draft preservation.
- **Interface contracts**: PROJECT.md & AGENTS.md
- **Code layout**: Frontend hooks and providers (`src/hooks/`, `src/providers/`)

## Key Decisions Made
- [TBD]

## Artifact Index
- `e:/smartspend_V1_fixed/.agents/worker_m4_pwa_mobile/DISPATCH.md` — Assignment dispatch
- `e:/smartspend_V1_fixed/.agents/worker_m4_pwa_mobile/progress.md` — Progress tracker
- `e:/smartspend_V1_fixed/.agents/worker_m4_pwa_mobile/handoff.md` — Final completion report

## Change Tracker
- **Files modified**: none yet
- **Build status**: not yet run
- **Pending issues**: none

## Quality Status
- **Build/test result**: pending
- **Lint status**: clean
- **Tests added/modified**: pending

## Loaded Skills
- None
