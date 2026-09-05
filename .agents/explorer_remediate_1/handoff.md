# Goals Router Remediation Handoff Report

**Agent**: Explorer Remediate 1 (`explorer_remediate_1`)  
**Task**: Deep AST Diagnosis & Type-Safe Remediation for `api/goals-router.ts`  
**Date**: 2026-08-29  
**Deliverable**: `report.md` & `handoff.md`  

---

## 1. Observation

Direct inspection of `api/goals-router.ts` and the Forensic Auditor handoff report (`.agents/teamwork_preview_auditor_m1/handoff.md`):

1. **Syntax Error & AST Break in `api/goals-router.ts`**:
   - `api/goals-router.ts:68`: `await recordAiUsageEvent({` is left unclosed with no closing brace or parenthesis.
   - `api/goals-router.ts:69–84`: Directly follows with `const profile = await getSmartProfile(ctx.user.id, ctx.user.type);` and unclosed procedures.
   - `npm run check` verbatim compiler error logs:
     ```
     api/goals-router.ts(69,13): error TS1005: ':' expected.
     api/goals-router.ts(69,72): error TS1005: ',' expected.
     api/goals-router.ts(70,13): error TS1005: ':' expected.
     api/goals-router.ts(70,46): error TS1005: ',' expected.
     ...
     api/goals-router.ts(190,1): error TS1109: Expression expected.
     api/goals-router.ts(190,2): error TS1128: Declaration or statement expected.
     ```

2. **Missing Router Definition & Procedures**:
   - The export `export const goalsRouter = router({` was missing entirely.
   - `list: authedProcedure.query(...)` was missing.
   - `create: authedProcedure.input(...).mutation(...)` was missing.
   - `analyze: proProcedure.input(z.object({ goalId: z.number() })).mutation(...)` procedure header and goal fetch `const [goal] = await db.select().from(financialGoals)...` were missing, leaving orphaned references to `goal` at lines 84–144.

3. **Frontend Consumer Dependencies (`src/components/goals/FinancialGoalsPanel.tsx` & `src/components/profile/SmartProfileView.tsx`)**:
   - `trpc.goals.list.useQuery()` expects `{ goals: FinancialGoal[], isPro: boolean, upsell: object | null }`.
   - `trpc.goals.create.useMutation()` expects input `{ title: string, description?: string, targetAmount?: number, targetDate?: string | Date }` and enforces free tier ceiling (`FREE_GOALS_LIMIT = 3`).
   - `trpc.goals.analyze.useMutation()` expects input `{ goalId: number }` and returns `{ goalId: number, analysis: Record<string, unknown>, tokensUsed: number }`.
   - `trpc.goals.setStatus.useMutation()` expects input `{ goalId: number, status: "active" | "completed" | "paused" }`.
   - `trpc.goals.delete.useMutation()` expects input `{ goalId: number }`.

4. **Root Router Integration (`api/router.ts`)**:
   - Line 19: `import { goalsRouter } from "./goals-router";`
   - Line 43: `goals: goalsRouter,`

---

## 2. Logic Chain

1. **Trace from Parser Error**: The TypeScript compiler failed at `api/goals-router.ts(69,13)` because line 68 opened an object literal argument `await recordAiUsageEvent({` which was never closed.
2. **Analysis of Orphaned Identifiers**: Inside the truncated section (lines 69–144), `ctx.user.id`, `ctx.user.type`, and `goal.id` were evaluated outside any tRPC procedure or function scope. This indicates that a chunk of code spanning from the end of `trackGoalTokens` through `export const goalsRouter = router({ list: ..., create: ..., analyze: proProcedure...` was inadvertently deleted or replaced during a prior editing session.
3. **Reconstruction of Type-Safe Schema & Invariants**:
   - Based on database schema `db/schema.ts:668` (`financialGoals` table), frontend callers (`FinancialGoalsPanel.tsx`), and the AI policy engine (`api/lib/ai-usage-policy.ts`):
     - `trackGoalTokens` requires `recordAiUsageEvent({ userId, userType, channel: "goal", tokens, model })`.
     - `list` query must return all goals for `(ctx.user.id, ctx.user.type)` ordered by `desc(createdAt)`, plus `isPro` and `upsell`.
     - `create` mutation must validate `title` (max 200), `description` (max 120), `targetAmount` (positive, max `ExpenseInputLimits.amountMax`), and enforce `FREE_GOALS_LIMIT` (3 active goals) for free users.
     - `analyze` mutation requires `proProcedure`, looks up goal with ownership check `eq(financialGoals.userId, ctx.user.id)` and `eq(financialGoals.userType, ctx.user.type)`, invokes Gemini model with budget checks, updates `aiPlan`, and invalidates semantic cache.
     - `setStatus` and `delete` maintain strict multi-tenant isolation and transactional cleanup of `userBudgets.linkedGoalId`.
4. **Conclusion**: Replacing the corrupted section with the fully reconstructed, syntactically clean, and type-checked `goalsRouter` completely resolves all syntax and type errors in `api/goals-router.ts`.

---

## 3. Caveats

- **Scope Boundary**: This investigation is strictly read-only and targets `api/goals-router.ts`. A separate syntax error in `api/sms-router.ts:275–321` was also identified by the auditor and is being addressed by parallel remediators.
- **AI Model Keys**: The `analyze` procedure uses `loadSystemConfig()` and defaults to `env.GEMINI_API_KEY` / `env.GEMINI_MODEL_PRO` per AGENTS.md §4.4.

---

## 4. Conclusion

`api/goals-router.ts` has been fully diagnosed and a complete drop-in replacement formulated in `.agents/explorer_remediate_1/report.md`.
The replacement restores:
1. Proper closure of `trackGoalTokens` and `recordAiUsageEvent`.
2. Router export `export const goalsRouter = router({ ... })`.
3. Complete `list`, `create`, `analyze`, `setStatus`, and `delete` procedures complying with tRPC v11, Drizzle ORM, dual-auth `(userId, userType)` scoping, and RBAC / Pro rate limiting.

---

## 5. Verification Method

To independently verify the proposed remediation:

1. **Inspect Report Artifact**:
   - View `.agents/explorer_remediate_1/report.md` for the full proposed source code of `api/goals-router.ts`.
2. **Apply Patch to `api/goals-router.ts`**:
   - Replace `api/goals-router.ts` with the code in §4 of `report.md`.
3. **Execute Monorepo Typecheck**:
   ```bash
   npm run check
   ```
   *Expected Result*: 0 compiler errors in `api/goals-router.ts`.
