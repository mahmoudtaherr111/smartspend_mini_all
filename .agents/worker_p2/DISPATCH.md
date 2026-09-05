## 2026-08-29T12:07:09Z
You are a teamwork_preview_worker assigned to implement Phase 3 Defense-in-Depth Security Remediations and fix baseline syntax defects for SmartSpend.
Your working directory is: e:/smartspend_V1_fixed/.agents/worker_p2
The authoritative user request is: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md
The security audit report is: e:/smartspend_V1_fixed/SECURITY_AUDIT_REPORT.md
Survey analysis reference: e:/smartspend_V1_fixed/.agents/explorer_survey_3/survey_phase3_4.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusively Owned Files:
- api/expense-router.ts
- api/profile-router.ts
- api/wallet-router.ts
- api/ai-router.ts
- api/lib/ai-gateway.ts
- api/goals-router.ts
- api/sms-router.ts

Tasks to Implement:
1. Baseline Syntax Fixes:
   - Fix syntax defect in api/goals-router.ts (around line 68 where recordAiUsageEvent call had broken syntax).
   - Fix syntax defect in api/sms-router.ts (around line 276-321).
   - Ensure npm run check passes cleanly.
2. Expense Router Ownership Checks (api/expense-router.ts):
   - Import userWallets and userBusinesses.
   - Update resolveBatchExpenseReferences to validate that any provided walletId belongs to the authenticated user (userId + userType in userWallets) and any businessId belongs to the authenticated user in userBusinesses.
   - Throw TRPCError NOT_FOUND if walletId or businessId does not belong to the user.
3. Strict Zod Bounds & Validation:
   - api/profile-router.ts: Replace unbounded z.record(z.string(), z.any()) in smartProfilePatchSchema with bounded, typed schemas; bound monthlyIncome and string lengths in updateProfile.
   - api/wallet-router.ts: Validate balance string with decimal regex (/^-?\d+(\.\d{1,2})?$/) and bound max digits; validate lastFourDigits with /^\d{4}$/.
   - api/ai-router.ts: Bound parseExpense text (max 2000 chars), learnWord strings (max 200 chars), and validate generateMonthlyInsights month with /^\d{4}-\d{2}$/.
4. AI SDK 30s Execution Timeouts:
   - api/lib/ai-gateway.ts: Wrap geminiModel.generateContent calls in a 30-second timeout promise race or AbortController to prevent hanging connections.

Run builds/tests after implementation:
- Run npm run check to verify 0 type errors.
- Run vitest tests for modified routers.
- Document exact changes and test results in e:/smartspend_V1_fixed/.agents/worker_p2/changes.md and handoff in e:/smartspend_V1_fixed/.agents/worker_p2/handoff.md.
When done, notify parent with send_message.
