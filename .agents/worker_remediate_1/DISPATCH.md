# Dispatch — Worker Remediate 1 (Backend Router AST Fix & Type Safety)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Context & References
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/.agents/teamwork_preview_auditor_m1/handoff.md` (Forensic Audit Report)
- `e:/smartspend_V1_fixed/.agents/explorer_remediate_1/report.md` (Goals router fix specification)
- `e:/smartspend_V1_fixed/.agents/explorer_remediate_2/report.md` (SMS router fix specification)

## Your Tasks:
1. **Apply Goals Router Fix**:
   - Open `api/goals-router.ts` and apply the complete type-safe router implementation detailed in `e:/smartspend_V1_fixed/.agents/explorer_remediate_1/report.md` (resolving the broken AST at line 68, implementing `list`, `create`, `analyze`, `setStatus`, and `delete` procedures).
2. **Apply SMS Router Fix**:
   - Open `api/sms-router.ts` and apply the complete transaction block and closure fix detailed in `e:/smartspend_V1_fixed/.agents/explorer_remediate_2/report.md` (resolving the malformed closure between lines 275 and 321).
3. **Verification**:
   - Run `npm run check` (`tsc -b`) to verify 0 errors across the monorepo.
   - Run `npm run test` to verify test suite passes.
4. **Report**:
   - Write your handoff to `e:/smartspend_V1_fixed/.agents/worker_remediate_1/handoff.md` with compiler and test outputs.
