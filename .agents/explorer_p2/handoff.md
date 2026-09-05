# Handoff Report — Phase 3 Defense-in-Depth & Phase 4 Test Infrastructure Survey

**Agent**: `explorer_p2` (Survey Specialist for Phase 3 Defense-in-Depth & Phase 4 Test Infra)  
**Date**: 2026-08-29  
**Handoff Type**: Hard Handoff (Investigation Complete)  
**Target Audience**: Orchestrator, Implementer, and Reviewer agents

---

## 1. Observation

Direct observations and evidence gathered from the codebase:

1. **Expense Foreign Key & Ownership Checks (`api/expense-router.ts`)**:
   - Lines 427–428: `businessId: z.number().int().positive().optional(), walletId: z.number().int().positive().optional()` in `expense.create` input schema.
   - Lines 461–462: `businessId: input.businessId || null, walletId: input.walletId || null` inserted directly into `expenses` table without querying `userWallets` or `userBusinesses`.
   - Lines 505–506 & 532–533: `batchCreate` maps `item.businessId` and `item.walletId` directly into inserted values.
   - Lines 136–199: `resolveBatchExpenseReferences` validates `contactId` against `userContacts` and `classificationLogId` against `classificationLogs`, but completely omits `walletId` and `businessId`.
   - Lines 643–648: `searchTransactions` constructs SQL `LIKE %${input.query}%` without escaping `%` or `_`.

2. **Zod Bounds & Schema Validation**:
   - `api/profile-router.ts:37–46`: `smartProfilePatchSchema` uses `z.record(z.string(), z.any())` for multiple sub-properties (`basicInfo`, `financialInfo`, `lifestyleInfo`, `onboardingAnswers`, `aiInferredAttributes`, `preferences`).
   - `api/profile-router.ts:169–173`: `updateProfile` inputs `monthlyIncome: z.number().optional()` (no positive/max bound) and `financialGoal: z.string().optional()` (no length bound).
   - `api/wallet-router.ts:53, 74`: `createWallet` and `updateWallet` use `balance: z.string().optional()` without decimal/numeric regex.
   - `api/ai-router.ts:797`: `parseExpense` uses `text: z.string()` without min/max length boundaries.
   - `api/ai-router.ts:2081`: `generateMonthlyInsights` uses `month: z.string()` without `YYYY-MM` regex.
   - `api/ai-router.ts:3069–3070`: `compareMonths` uses `month1: z.string()`, `month2: z.string()` without `YYYY-MM` regex.

3. **Execution Timeout Guards on External AI SDKs**:
   - `api/lib/ai-gateway.ts:400–417`: Gemini SDK call `geminiModel.generateContent(...)` has no timeout or abort controller.
   - `api/lib/smart-pipeline.ts:1300–1330`: `geminiModel.generateContent(finalUserPrompt)` called without timeout wrappers.
   - `api/lib/sms-ai-parser.ts:141`, `api/lib/receipt-image-parser.ts:110`, `api/lib/narrative-decomposer.ts:903`: all call `generateContent` without execution timeouts.

4. **WebSocket Security on `/api/voice/live`**:
   - `api/server.ts:41–48` & `api/boot.ts:548–555`: `server.on("upgrade")` calls `wss.handleUpgrade` without validating `request.headers.origin` against `allowedOrigins`.
   - `api/services/voice-call-service.ts:32–59, 188–205`: Auth checking occurs only after TCP connection upgrade and WebSocket handshake completion.

5. **tRPC Production ErrorFormatter**:
   - `api/middleware.ts:5`: `const t = initTRPC.context<Context>().create();` does not configure `errorFormatter`.
   - `api/router.ts`: 22 sub-routers registered under root router without sanitized error formatting.

6. **Test Infrastructure**:
   - `vitest.config.ts`: Vitest configured with node environment for `api/**` and `tests/**`.
   - `package.json`: `npm run check` (`tsc -b`) and `npm run test` (`vitest run`).
   - 87 existing test files located across `api/` and `tests/`.

---

## 2. Logic Chain

1. **Expense Ownership (BOLA)**:
   - Observation: `expenses.walletId` and `expenses.businessId` are accepted from user input and inserted without checking ownership against `userWallets` and `userBusinesses`.
   - Invariant: Multi-tenant data isolation requires all foreign keys to belong to the authenticated `(userId, userType)`.
   - Deduction: User A can attach transactions to User B's wallet or business, corrupting ledger data and breaking multi-tenant boundaries.
   - Remediation: Extend `resolveBatchExpenseReferences` to query `userWallets` and `userBusinesses` matching `(userId, userType)` and throw `NOT_FOUND` if any referenced ID is unauthorized.

2. **Zod Bounds & Schema Validation**:
   - Observation: Text inputs (`parseExpense.text`, `sms-router.message`) lack length caps; `smartProfilePatchSchema` accepts unbounded arbitrary JSON; `wallet.balance` accepts unvalidated strings.
   - Invariant: Production input schemas must enforce strict bounds and format checks.
   - Deduction: Unbounded text inputs allow Memory DoS and LLM token exhaustion; unvalidated balance strings cause MySQL unhandled runtime 500 errors.
   - Remediation: Apply explicit `.max()`, `.min()`, regex (`/^-?\d+(\.\d{1,2})?$/`, `/^\d{4}-\d{2}$/`), and bounded record structures.

3. **AI SDK Timeouts**:
   - Observation: `GoogleGenerativeAI.generateContent` calls lack abort signals or timeout promises.
   - Invariant: External network I/O must never block server threads indefinitely.
   - Deduction: Upstream Gemini latency or dropped TCP connections will hang server requests and exhaust connection pools.
   - Remediation: Wrap all AI SDK calls in `withTimeout(..., 30_000)` with clean `TRPCError(TIMEOUT)` fallback.

4. **WebSocket Security (CSWSH)**:
   - Observation: `server.on("upgrade")` immediately executes `handleUpgrade` for `/api/voice/live` without checking the `Origin` header.
   - Invariant: Browsers send cookies automatically on WebSocket upgrades; cross-origin sites must be blocked.
   - Deduction: Malicious websites can initiate cross-site WebSocket hijacking attacks against authenticated SmartSpend users.
   - Remediation: Validate `request.headers.origin` against `allowedOrigins` before `wss.handleUpgrade`, rejecting invalid origins with HTTP 403.

5. **tRPC Error Sanitization**:
   - Observation: `initTRPC.create()` does not supply an `errorFormatter`.
   - Invariant: Production API responses must never leak database internals or stack traces.
   - Deduction: Unhandled exceptions expose SQL syntax, table structures, and internal paths to clients.
   - Remediation: Add `errorFormatter` in `api/middleware.ts` to sanitize `INTERNAL_SERVER_ERROR` messages and strip `stack` traces in `NODE_ENV=production`.

---

## 3. Caveats

- **No Caveats**. All 6 survey targets have been examined directly against the source code, line numbers verified, schema requirements mapped, and testing harness confirmed.

---

## 4. Conclusion

The Phase 3 defense-in-depth targets and Phase 4 test infrastructure are fully mapped with precise line numbers, current vs required behaviors, and ready-to-implement code patches. Detailed blueprints and test plans are documented in `analysis.md`. The implementer agent can proceed immediately with zero ambiguity.

---

## 5. Verification Method

To verify these findings and test future implementations:

1. **Type Checking**:
   ```bash
   npm run check
   ```
2. **Automated Unit & Integration Test Suite**:
   ```bash
   npm run test
   ```
3. **Specific Test Harness**:
   - Run `vitest run tests/security-phase3.test.ts` (once implemented).
4. **Files to Inspect**:
   - `api/expense-router.ts` (Lines 110–201, 427–465, 505–536, 643–648)
   - `api/profile-router.ts` (Lines 37–46, 168–174, 337–343)
   - `api/wallet-router.ts` (Lines 48–76)
   - `api/ai-router.ts` (Lines 795–804, 2050–2085, 3067–3073)
   - `api/lib/ai-gateway.ts` (Lines 400–421, 447)
   - `api/lib/smart-pipeline.ts` (Lines 1300–1330)
   - `api/server.ts` (Lines 41–48) & `api/boot.ts` (Lines 548–555)
   - `api/middleware.ts` (Line 5)
