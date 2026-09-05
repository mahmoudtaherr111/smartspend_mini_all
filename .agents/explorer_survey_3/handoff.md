# Handoff Report: Phase 3 Defense-in-Depth & Phase 4 Test Suite Survey

**Agent**: teamwork_preview_explorer (Survey Explorer 3)  
**Parent Agent**: fba4270d-610c-4ac3-b2e3-fb04fe9959e3  
**Working Directory**: `e:/smartspend_V1_fixed/.agents/explorer_survey_3`  
**Report Artifact**: `e:/smartspend_V1_fixed/.agents/explorer_survey_3/survey_phase3_4.md`  

---

## 1. Observation

### Exact File Paths, Line Numbers & Verbatim Findings:
1. **Expense Router Foreign Key Ownership (`api/expense-router.ts`)**:
   - Lines 444–445 & 505–506 (`create`), lines 577–578 & 642–643 (`batchCreate`): accepts `walletId: z.number().int().positive().optional()` and `businessId: z.number().int().positive().optional()`.
   - `resolveBatchExpenseReferences` (lines 144–240) validates `contactId` against `userContacts` and `classificationLogId` against `classificationLogs`, but **never queries `userWallets` or `userBusinesses`**. `userWallets` is not even imported in `api/expense-router.ts`.
2. **Strict Zod Bounds & Validation**:
   - `api/profile-router.ts` (lines 37–46): `smartProfilePatchSchema` uses `z.record(z.string(), z.any())` with unbounded payloads; `updateProfile` (lines 168–174) has unbounded `monthlyIncome: z.number()` and `financialGoal: z.string()`.
   - `api/wallet-router.ts` (lines 53, 74): `balance: z.string().optional()` lacks decimal regex, risking MySQL `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD` errors; `lastFourDigits` lacks digit regex.
   - `api/ai-router.ts` (lines 797, 2052, 2081, 3069): `parseExpense.text` is unbounded `z.string()`; `learnWord` strings are unbounded; `generateMonthlyInsights.month` lacks `^\d{4}-\d{2}$` regex.
3. **AI SDK Execution Timeouts**:
   - `api/lib/ai-gateway.ts` (lines 400–421) and `api/lib/smart-pipeline.ts` (lines 1300–1329): `geminiModel.generateContent(...)` calls lack timeout guards or `AbortController` signals.
4. **WebSocket Upgrade Security (`/api/voice/live`)**:
   - `api/server.ts` (lines 41–48) and `api/boot.ts` (lines 548–555): `server.on("upgrade")` calls `wss.handleUpgrade` immediately without inspecting `request.headers.origin` or performing pre-upgrade token checks.
5. **Production Error Sanitization (`api/middleware.ts`)**:
   - Line 5: `initTRPC.context<Context>().create()` does not declare an `errorFormatter`, allowing database error details and stack traces to reach clients in production.
6. **Test Suite Baseline & Tool Execution**:
   - `npm run check` failed with syntax/type errors in `api/goals-router.ts:68` (`await recordAiUsageEvent({ const profile = ...`) and `api/sms-router.ts:276-321`.
   - `npm run test` ran 92 test files: **89 passed**, 2 failed (due to importing `goals-router.ts`), 1 skipped. **638 tests passed**.
   - Identified zero existing dedicated test suites for business BOLA, pro cancellation expiry, expense wallet/business ownership, and error sanitization.

---

## 2. Logic Chain

1. **Foreign Key Cross-Tenant Risk**:
   - `api/expense-router.ts` allows any authenticated user to specify `walletId` and `businessId`.
   - Because `resolveBatchExpenseReferences` only checks `contactId` and `logId`, an unowned `walletId` (or `businessId`) is inserted directly into the database.
   - Therefore, an attacker can corrupt another user's wallet analytics or associate expenses with businesses they do not own.
2. **Unbounded Input Vector**:
   - In `profile-router.ts`, `smartProfilePatchSchema` uses `z.record(z.string(), z.any())`.
   - An attacker can send multi-megabyte JSON payloads that pass tRPC validation and consume server heap memory during Drizzle serialization.
3. **Availability / Hanging Requests**:
   - Google Generative AI SDK calls in `ai-gateway.ts` and `smart-pipeline.ts` do not pass timeout options or race with a timeout timer.
   - If Google's API degrades or hangs, worker connections will remain held indefinitely, causing cascading request backlog.
4. **Cross-Site WebSocket Hijacking**:
   - WebSockets in `server.ts` and `boot.ts` upgrade connections prior to checking the `Origin` header.
   - Web browsers include session cookies on cross-origin WebSocket requests.
   - A malicious site can establish an active audio call connection under the victim's session.
5. **Information Disclosure via Errors**:
   - Unhandled tRPC errors propagate raw Error instances.
   - Without an `errorFormatter` stripping stack traces in production, internal schema and path info are exposed to API consumers.

---

## 3. Caveats

- **Active Syntax Defect in Codebase**: `api/goals-router.ts:68` and `api/sms-router.ts:275` contain syntax errors introduced by previous file edits. These prevent `npm run check` from passing and cause 2 test files importing the root router to fail during `npm run test`.
- **Read-Only Explorer Scope**: As an explorer, no changes to source code were made; complete remediation diffs and implementation blueprints are documented in `survey_phase3_4.md`.

---

## 4. Conclusion

All Phase 3 Defense-in-Depth items and Phase 4 Test Suite baselines have been fully audited:
1. Ownership validation for `walletId` and `businessId` in `api/expense-router.ts` is currently missing and must be added to `resolveBatchExpenseReferences`.
2. Zod input bounds must be tightened across `profile-router.ts`, `wallet-router.ts`, and `ai-router.ts`.
3. 30s timeout guards must be applied around `geminiModel.generateContent` in `ai-gateway.ts` and `smart-pipeline.ts`.
4. WebSocket origin validation must be enforced in `server.on("upgrade")` before `wss.handleUpgrade`.
5. Global `errorFormatter` must be added to `api/middleware.ts`.
6. Automated test baseline is healthy (638 passing tests), but 8 critical security regression suites must be implemented.

---

## 5. Verification Method

To verify these findings:
1. Inspect `api/expense-router.ts:144-240` to confirm absence of `userWallets` and `userBusinesses` queries.
2. Inspect `api/middleware.ts:5` to confirm absence of `errorFormatter`.
3. Inspect `api/server.ts:41-48` to confirm unvalidated `server.on("upgrade")`.
4. Run `npm run check` to verify TypeScript compile errors in `goals-router.ts` and `sms-router.ts`.
5. Run `npx vitest run api/lib/rate-limit.test.ts api/lib/get-client-ip.test.ts api/middleware.test.ts` to verify existing security-adjacent test suites pass.
