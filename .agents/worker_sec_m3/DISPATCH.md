## 2026-09-08T05:12:27Z

You are Worker M3 for the SmartSpend AI enterprise-grade security remediation project.

Your Identity & Working Directory:
- Role: Security Implementation Worker (Milestone M3: R5 & R6)
- Working Directory: e:/smartspend_V1_fixed/.agents/worker_sec_m3/
- Project Root: e:/smartspend_V1_fixed
- Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md (MANDATORY: READ THIS FIRST!)
- Project Scope: e:/smartspend_V1_fixed/.agents/PROJECT.md
- Survey Report to read:
  - e:/smartspend_V1_fixed/.agents/explorer_sec_r5_r6_r8/report.md and handoff.md
- Test Oracles:
  - `tests/security/r5-session-hashing.test.ts`
  - `tests/security/r6-bola-idor.test.ts`
- Rules: Follow AGENTS.md in project root.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Exclusive File Ownership:
- `db/schema.ts`
- `api/lib/session-validation.ts`
- `api/local-auth-utils.ts`
- `api/lib/ownership-guard.ts`
- `api/expense-router.ts`
- `api/budget-router.ts`
- `api/notification-engine.ts`
- `api/lib/ai-gateway.ts`

Your Tasks:
1. R5 (Plaintext Session Elimination & Sensitive Data Encryption):
   - In `db/schema.ts`:
     - Inspect `sessions` table (line ~314). Ensure `tokenHash: varchar("token_hash", { length: 64 })` is defined and indexed.
   - In `api/local-auth-utils.ts`:
     - When saving a newly issued session, calculate `tokenHash = crypto.createHash('sha256').update(token).digest('hex')`.
     - Insert `tokenHash` into `sessions` table. Ensure plaintext `token` is NOT persisted to the database (or set to null/omitted).
   - In `api/lib/session-validation.ts`:
     - In `validateActiveSessionToken(bearerToken)`: compute SHA-256 `hash = crypto.createHash('sha256').update(bearerToken).digest('hex')`.
     - Query `sessions` table strictly by `eq(sessions.tokenHash, hash)`. Eliminate fallback plaintext token lookup.
   - In `api/notification-engine.ts` and `api/lib/ai-gateway.ts`:
     - Eliminate any static hardcoded secrets or static fallback encryption keys. Require proper env configuration or ephemeral cryptographic generation.

2. R6 (Broken Object Level Authorization - BOLA/IDOR Defense):
   - Create `api/lib/ownership-guard.ts`:
     - Implement helper functions checking ownership against `ctx.user.id`:
       - `validateWalletOwnership(userId: number, walletId: number): Promise<boolean>`
       - `validateBusinessOwnership(userId: number, businessId: number): Promise<boolean>`
       - `validateGoalOwnership(userId: number, goalId: number): Promise<boolean>`
       - `validateContactOwnership(userId: number, contactId: number): Promise<boolean>`
       - `assertEntityOwnership(params: { userId: number; walletId?: number | null; businessId?: number | null; linkedGoalId?: number | null; contactId?: number | null }): Promise<void>`
     - If an entity belongs to another user (or doesn't exist for this user), throw `new TRPCError({ code: "FORBIDDEN", message: "Unauthorized entity access" })`.
   - In `api/expense-router.ts`:
     - In `create` and `batchCreate`: validate that any supplied `walletId` and `businessId` belong to `ctx.user.id`.
     - In `update` / `delete`: ensure user owns the expense, and any newly supplied `walletId`/`businessId` belong to `ctx.user.id`.
   - In `api/budget-router.ts`:
     - In `create` and `update`: validate that any supplied `linkedGoalId` belongs to `ctx.user.id`.

3. Verification:
   - Verify alignment with `tests/security/r5-session-hashing.test.ts` and `tests/security/r6-bola-idor.test.ts`.
4. Output Deliverables:
   - Write your handoff report to `e:/smartspend_V1_fixed/.agents/worker_sec_m3/handoff.md`.
   - Send a message to the orchestrator with your results.
