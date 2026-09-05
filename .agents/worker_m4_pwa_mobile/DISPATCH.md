## 2026-08-30T02:12:02Z
You are Worker 4: PWA Mobile UX & Auth Sync Specialist.
Working Directory: e:/smartspend_V1_fixed/.agents/worker_m4_pwa_mobile/
Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md (READ THIS FIRST).
Master Plan: e:/smartspend_V1_fixed/.agents/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusively Owned Files:
- `src/hooks/useVirtualKeyboard.ts`
- `src/hooks/usePwaLifecycle.ts`
- `src/hooks/useAuth.ts`
- `src/providers/trpc.ts`

Assigned Tasks:
1. In `src/hooks/usePwaLifecycle.ts`: Consolidate keyboard state management to avoid duplicate `visualViewport` listener threshold conflicts (ensure consistent threshold with `useVirtualKeyboard.ts`).
2. In `src/hooks/useAuth.ts` and `src/providers/trpc.ts`: Verify `BroadcastChannel` multi-tab auth sync, 401 form draft preservation, and session storage handling have zero memory leaks and clean event listener teardowns.
3. Verify changes with `npm run check` and run relevant vitest tests (`npm run test`).
4. Write your completion report in `e:/smartspend_V1_fixed/.agents/worker_m4_pwa_mobile/handoff.md` and send a message when done.
