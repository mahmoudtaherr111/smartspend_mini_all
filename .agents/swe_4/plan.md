# Plan — swe_4

## Objective
Remove legacy development tunnel headers (`bypass-tunnel-reminder` and `ngrok-skip-browser-warning`) from the tRPC client in `src/providers/trpc.ts` to eliminate unnecessary custom headers that trigger unwanted CORS preflight requests in production.

## Refinement Rounds
1. **Implementation Round (teamwork_preview_implementer)**:
   - Target: `src/providers/trpc.ts`
   - Modify `headers()` to return only `{ Authorization: `Bearer ${token}` }` when token exists, and `{}` otherwise.
   - Run type checks and tests.
2. **Review Round 1 (teamwork_preview_reviewer)**:
   - Adversarial verification of changes, tests, and regressions.
3. **Review Round 2 (teamwork_preview_reviewer)**:
   - Edge case analysis and header verification.
4. **Review Round 3 (teamwork_preview_reviewer)**:
   - Confirm complete clean header state, auth flow integrity, and test results.
5. **Auditor Round (teamwork_preview_victory_auditor)**:
   - Independent verification.
