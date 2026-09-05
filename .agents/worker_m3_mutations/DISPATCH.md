## 2026-08-30T01:12:02Z
You are Worker 3: Financial Ledger, Idempotency & Offline DLQ Specialist.
Working Directory: e:/smartspend_V1_fixed/.agents/worker_m3_mutations/
Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md (READ THIS FIRST).
Master Plan: e:/smartspend_V1_fixed/.agents/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusively Owned Files:
- `api/wallet-router.ts`
- `api/budget-router.ts`
- `src/components/expenses/ExpenseForm.tsx` (offline sync queue section & voice timeout)

Assigned Tasks:
1. In `api/wallet-router.ts`: Add `clientRequestId: z.string().min(1).max(64).optional()` to `createWallet` schema and mutation with idempotency pre-check and duplicate handling.
2. In `api/budget-router.ts`: Add `clientRequestId: z.string().min(1).max(64).optional()` to `create` schema and mutation with idempotency pre-check and duplicate handling.
3. In `src/components/expenses/ExpenseForm.tsx`:
   - In `syncOfflineData`: Wrap single-item sync in error inspection. If an offline item fails with an unrecoverable 4xx validation error, remove it from `smartspend_offline_manual` and push to `smartspend_offline_deadletter` with an explanatory error, allowing remaining valid queued items to proceed without head-of-line blocking.
   - In `parseVoiceMutation`: Add a 30s timeout guard to eliminate infinite spinner under severe network drops.
4. Verify changes with `npm run check` and run relevant vitest tests (`npm run test`).
5. Write your completion report in `e:/smartspend_V1_fixed/.agents/worker_m3_mutations/handoff.md` and send a message when done.
