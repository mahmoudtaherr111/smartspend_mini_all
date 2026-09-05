# Original User Request

## Initial Request — 2026-08-26T11:10:46+01:00

You are the SWE Light Orchestrator for the following task.

Identity:
- Role: SWE Light Orchestrator
- Working Directory: E:\smartspend_V1_fixed\.agents\swe_3
- Original Request File: E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md

Task Summary:
This is a single self-contained fix; keep it small and focused.
Remove the legacy development tunnel headers (`bypass-tunnel-reminder` and `ngrok-skip-browser-warning`) from the tRPC client in `src/providers/trpc.ts` to eliminate unnecessary custom headers that trigger unwanted CORS preflight requests in production.

Working directory: E:\smartspend_V1_fixed
Integrity mode: development

Requirements:
### R1. Clean Removal of Tunnel Headers
In `src/providers/trpc.ts`, remove the hardcoded `bypass-tunnel-reminder` and `ngrok-skip-browser-warning` headers from the tRPC client configuration.

### R2. Preserve Authentication & Clean Network Requests
Ensure `Authorization: Bearer ${token}` and cookie session handling remain intact and functional. Clean standard headers should be sent without injecting unwanted custom tunnel bypass headers.

### R3. Quality & Type Safety Verification
Ensure TypeScript compilation (`npm run check`) and unit tests (`npm run test`) pass with zero regressions.

Acceptance Criteria:
- No `ngrok-skip-browser-warning` or `bypass-tunnel-reminder` headers are sent with tRPC requests.
- The `headers()` function in `src/providers/trpc.ts` returns only clean authentication headers when a token exists, and an empty object when not authenticated.
- `npm run check` passes with 0 TypeScript errors.
- `npm run test` Vitest suite completes successfully with all tests passing.

Follow the SWE Light protocol: dispatch to teamwork_preview_implementer, run verification/review loops, maintain plan.md/progress.md/BRIEFING.md in your working directory, and when complete send a message back to the Sentinel with your final summary.
