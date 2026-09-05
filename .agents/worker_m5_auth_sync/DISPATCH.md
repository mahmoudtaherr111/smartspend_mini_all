## 2026-08-29T12:05:14Z
You are Worker M5 (worker_m5_auth_sync).
Working Directory: e:/smartspend_V1_fixed/.agents/worker_m5_auth_sync
Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md
Project Spec: e:/smartspend_V1_fixed/PROJECT.md
Survey Report: e:/smartspend_V1_fixed/.agents/explorer_mutations_pwa_auth/report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusively Owned Files:
- `src/hooks/useAuth.ts`
- `src/providers/trpc.ts` (or auth sync provider)

Your Tasks:
1. Read `e:/smartspend_V1_fixed/.agents/explorer_mutations_pwa_auth/report.md` for detailed auth findings.
2. In `src/hooks/useAuth.ts`:
   - Implement real-time multi-tab session synchronization using `BroadcastChannel("smartspend_auth")` and `window.addEventListener("storage", ...)`.
   - When a user logs in, logs out, or refreshes their token in one tab, broadcast the event so all open tabs synchronize their auth state immediately without full page reloads.
3. In `src/providers/trpc.ts` / auth layer:
   - Handle 401 unauthenticated errors gracefully: notify user of session expiration, preserve any active form draft state, and avoid hard page crashes.
4. Run `npm run check` and auth vitest suites.
5. Write `progress.md` and `handoff.md` in your working directory. Send a completion message back when done.
