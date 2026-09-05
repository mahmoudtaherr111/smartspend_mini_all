# Comprehensive Engineering Audit & Remediation Survey
**Focus Areas: Backend AI Streaming & Services, Financial Mutations Resilience, and Type Safety/Contracts**

---

## 1. Observation

### 1.1 Backend AI Streaming, Services & Rate Limiting

#### A. Chat Generation & Streaming Architecture
- **Location**: `api/chat-router.ts` (lines 428–492) and `src/components/ai/AIChatbot.tsx` (lines 133, 217–277).
- **Observation**:
  - `chatRouter.sendMessage` is implemented strictly as a unary tRPC mutation (`aiProcedure.input(...).mutation(...)`).
  - In `src/components/ai/AIChatbot.tsx`, `handleSend` triggers `sendMessage.mutateAsync(...)` without streaming token feedback or exposing an `AbortController` to cancel in-flight network requests.
  - While `/api/sse/otp` exists in `api/boot.ts` (lines 320–350) for WhatsApp OTP events, there is no Server-Sent Events (SSE) or chunked HTTP streaming pipeline for AI Chat or AI Insights generation.
  - If a user changes tabs, closes the app, or cancels a chat turn, the server-side kernel and remote LLM provider call (`callChatCompletionAPI`) continue running to completion, consuming provider tokens and database writes unnecessarily.

#### B. Timeout Management & Hanging Promise Risks
- **Locations**:
  - `api/lib/deepseek-client.ts` (lines 78–92, 139–145): Uses `const controller = new AbortController(); setTimeout(() => controller.abort(), 45000);`. Throws Arabic timeout error `"الرد من الـ AI أخد وقت طويل. جرب تاني."`.
  - `api/lib/fireworks-client.ts` (lines 21–36): Uses `setTimeout(() => controller.abort(), 25000)`.
  - `api/lib/nvidia-client.ts` (lines 30–46): Uses `setTimeout(() => controller.abort(), 30000)`. Retries once without `response_format` on 400/422.
  - `api/lib/groq-client.ts` (lines 11–28): Uses `groq.chat.completions.create` without any explicit timeout option or `AbortSignal`. If the remote network connection stalls, the request can hang indefinitely.
  - `api/lib/ai-gateway.ts` (lines 399–421): The Gemini protocol branch (`genAI.getGenerativeModel(...).generateContent(...)`) does not supply an `AbortSignal` or request timeout wrapper.
  - `api/goals-router.ts` (lines 232–246) and `api/business-router.ts` (lines 117–139): Direct calls to `GoogleGenerativeAI.generateContent` without timeout guards or network error normalization.

#### C. Rate-Limit Backoff & Localized Arabic Error Messaging
- **Locations**:
  - `api/middleware.ts` (lines 9–94):
    - `publicIpLimiter` (400 req/min/IP): `"طلبات كتير جداً من نفس الشبكة. جرب بعد دقيقة."`
    - `strictPublicIpLimiter` (25 req/15min/IP): `"محاولات كتيرة لتسجيل الدخول أو التسجيل من نفس الشبكة. استنى شوية وحاول تاني."`
    - `authedProcedure` (100 req/min/user): `"طلبات كتير جداً! اهدى شوية."`
    - `aiProcedure` (100 req/min/user): `"طلبات الذكاء الاصطناعي كتير جداً! استنى دقيقة وحاول تاني."`
  - `api/chat-router.ts` (lines 481–491): Daily limits enforce Arabic TRPCError: `"وصلت الحد اليومي (${dailyLimit} رسالة). جرب بكره أو ترقي خطتك! 💎"`.
  - `api/lib/deepseek-client.ts` (lines 96–103): HTTP 429 returns `"الـ API وصل الحد الأقصى. جرب تاني بعد شوية."`.
  - **Missing**: No exponential backoff with jitter on upstream LLM provider calls when encountering transient HTTP 429 / 503 / 504 errors before failing the user request.

---

### 1.2 Financial Mutations & Forms Resilience

#### A. Idempotency Keys & Concurrency Deduplication
- **Locations**:
  - `db/schema.ts` (lines 102, 120–124):
    ```ts
    clientRequestId: varchar("client_request_id", { length: 64 }),
    uniqueIndex("expenses_user_client_request_unique").on(t.userId, t.userType, t.clientRequestId),
    ```
  - `api/expense-router.ts` (lines 406–489, 491–550): `create` and `batchCreate` accept `clientRequestId`. However, if a duplicate key error (`ER_DUP_ENTRY` / code `1062`) is thrown by MySQL on retry, it is **unhandled** and bubbles up as an `INTERNAL_SERVER_ERROR` (500) rather than returning the existing transaction or an idempotent `{ success: true, duplicate: true }`.
  - `api/budget-router.ts` (lines 106–132): `userBudgets` table lacks a `clientRequestId` column and idempotency key check. Double-tapping "Create Budget" creates duplicate budget entries.
  - `api/goals-router.ts` (lines 119–175): `financialGoals` lacks idempotency keys; duplicate submissions create duplicate active goals.
  - `api/wallet-router.ts` (lines 47–66): `userWallets` lacks idempotency keys.
  - `api/sms-router.ts` (lines 263–279, 438–450): Duplicate SMS detection performs a non-atomic `SELECT` (lines 264–275) before `INSERT`. Concurrent requests from iOS Shortcuts arriving within milliseconds both pass the select and insert duplicate expenses.

#### B. Double-Tap Prevention & Form Lifecycle
- **Locations**:
  - `src/components/goals/FinancialGoalsPanel.tsx` (lines 69–85):
    ```ts
    const handleCreate = () => {
      ...
      createMutation.mutate({ title: finalTitle, description: description.trim() || undefined, targetAmount });
      setTitle("");
      setCost("");
      setDescription("");
    };
    ```
    Form fields are cleared *before* the mutation completes. If the mutation fails (e.g. offline, validation error, rate limit), the user's entered text is permanently lost.
  - `src/components/expenses/ExpenseForm.tsx` (lines 513–600, 730–809): Submit buttons are guarded by `isSubmitting`, but client-side generation of `clientRequestId` is only bound to offline outbox items (`pendingOfflineTextId`), not guaranteed for standard direct submissions.

#### C. Boundary Validations & Type Safety
- **Locations**:
  - `api/budget-router.ts` (lines 106–116, 134–145):
    - `monthlyLimit: z.number().positive()` lacks `.finite()` and `.max(ExpenseInputLimits.amountMax)`. Extreme numbers (e.g., `1e15` or `Infinity`) cause MySQL `decimal(12, 2)` arithmetic overflow crashes.
  - `api/goals-router.ts` (lines 120–127):
    - `targetAmount: z.number().positive().optional()` lacks `.max(ExpenseInputLimits.amountMax)`.
    - `targetDate: z.string().optional()` lacks ISO/date regex validation.
  - `api/wallet-router.ts` (lines 47–55, 68–76):
    - `balance: z.string().optional()` accepts arbitrary strings (e.g., `"NaN"`, `"-100000000000"`, `"invalid"`).
  - `api/support-router.ts` (lines 15–24, 150–159):
    - `message: z.string().min(10)` has no `.max()` limit.
  - `api/profile-router.ts` (lines 37–46):
    - `smartProfilePatchSchema` uses `z.record(z.string(), z.any())`, permitting unbounded arbitrary nested payloads.

#### D. Offline Optimistic Update Rollback & React Query Cache Synchronization
- **Locations**:
  - `src/components/expenses/ExpenseForm.tsx` (lines 513–573):
    - `createMutation.onMutate` optimistically updates `utilsTrpc.expense.list.setData({ limit: 10, offset: 0 }, ...)` only.
    - If other query caches exist (e.g. `{ limit: 20 }`, filter queries, monthly summaries), they are not updated optimistically until `onSettled` calls `invalidate()`.
    - `batchCreateMutation.onMutate` (lines 575–580) cancels queries but performs zero optimistic appending.
  - `api/wallet-router.ts` (lines 56–66, 77–95, 97–124): Mutations `createWallet`, `updateWallet`, and `deleteWallet` do NOT call `invalidateFinanceUserCache(ctx.user.id, ctx.user.type)`, causing AI Kernel and Semantic Layer caches to operate on stale wallet balances.

---

## 2. Logic Chain

```
[Observation 1.1.A: No AbortController / Streaming in Chat]
  └── In-flight AI requests cannot be cancelled by user or tab navigation
  └── Upstream LLM tokens and server resources wasted on abandoned sessions

[Observation 1.1.B: Inconsistent Timeouts & Hangs in Gemini/Groq SDKs]
  └── Remote provider stalling can hang Node.js worker event loop connection pool
  └── Leads to client-side perpetual loading spinners and UX freeze

[Observation 1.2.A: Idempotency Key Unhandled Duplicate Key / Missing on Budgets & Goals]
  └── Retrying an expense with clientRequestId throws 500 error instead of idempotent success
  └── Rapid tapping on Budget / Goal creation creates duplicate financial entities

[Observation 1.2.C: Missing Boundary Checks on Numeric Fields]
  └── Extreme/infinite numbers bypass Zod and trigger MySQL decimal overflow errors (ER_DATA_OUT_OF_RANGE)
  └── Unsanitized balance strings in wallets cause database corruption or NaN stats

[Observation 1.2.D: Missing Wallet Cache Invalidation]
  └── Creating or deleting a wallet leaves Redis/in-memory cache intact
  └── AI Kernel RAG provides answers referencing deleted or stale wallets
```

---

## 3. Caveats

1. **MySQL 8 Schema Constraints**:
   - Adding unique indexes across `(userId, userType, clientRequestId)` on existing large tables requires handling legacy `NULL` entries (MySQL permits multiple `NULL` values in unique indexes, but non-null values must be unique).
2. **Offline LocalStorage Limitations**:
   - `localStorage` has a ~5MB quota per origin. Long offline stints with numerous queued transactions must enforce the existing item limit (`userLimits.offline.limit`) and compact old sync logs.
3. **Dual-User Identity (`users` vs `localUsers`)**:
   - Any new idempotency or transaction constraint must always include both `userId` and `userType` to maintain strict dual-auth partition integrity.

---

## 4. Conclusion & Remediation Specifications

### Remediation 1: Unified AI Provider Resilience & Timeout Wrapper
- **Specification**:
  1. Centralize all LLM provider calls (`deepseek`, `groq`, `gemini`, `fireworks`, `nvidia`) through a unified resilience wrapper in `api/lib/ai-gateway.ts`.
  2. Enforce a strict `AbortController` timeout (default 30s) across all providers.
  3. Implement transient error retry with exponential backoff (e.g. 1s, 2s) for upstream 429/503/504 responses before throwing.
  4. Ensure Arabic localized error messages are returned for `AbortError`, `RateLimitError`, and `AuthError`.

### Remediation 2: Universal Idempotency & Duplicate Catching
- **Specification**:
  1. In `api/expense-router.ts`, wrap `tx.insert(expenses)` in a try-catch for `ER_DUP_ENTRY` / code `1062`. If a duplicate `clientRequestId` is encountered, query and return the existing expense record with `{ success: true, duplicate: true }`.
  2. Add `clientRequestId` to `userBudgets`, `financialGoals`, and `userWallets` schemas in `db/schema.ts` with `(userId, userType, clientRequestId)` unique indexes.
  3. In `api/sms-router.ts`, compute a SHA-256 idempotency hash over `${userId}:${userType}:${message.trim()}:${businessDateKey()}` and use atomic insertion into `rawSmsEvents`.

### Remediation 3: Strict Zod Contract Boundaries & Sanitization
- **Specification**:
  1. In `contracts/constants.ts`, export shared validation schemas:
     ```ts
     export const FinancialAmountSchema = z.number().positive().finite().max(999_999_999).transform((val) => Math.round(val * 100) / 100);
     export const SafeStringSchema = (min: number, max: number) => z.string().trim().min(min).max(max);
     ```
  2. Apply `FinancialAmountSchema` to `budgetRouter`, `goalsRouter`, and validate `walletRouter` balance string via `z.string().regex(/^-?\d+(\.\d{1,2})?$/, "المبلغ غير صالح")`.
  3. Constrain `supportRouter.create` message to `z.string().trim().min(10).max(5000)`.
  4. Constrain `profileRouter.updateSmartProfile` sub-records with max depth and key limits.

### Remediation 4: Cache Invalidation & UI Rollback Safety
- **Specification**:
  1. Add `await invalidateFinanceUserCache(ctx.user.id, ctx.user.type)` to all mutations in `api/wallet-router.ts`.
  2. In `src/components/goals/FinancialGoalsPanel.tsx`, only clear form inputs inside `onSuccess` callback of `createMutation`.
  3. In `src/components/expenses/ExpenseForm.tsx`, ensure every form submit generates a client UUID `clientRequestId` if not already set.

---

## 5. Verification Method

### Automated Test Suite Commands
1. **Type Safety & Contract Check**:
   ```bash
   npm run check
   ```
2. **Backend Routers Unit & Integration Tests**:
   ```bash
   npm run test api/expense-router.test.ts api/chat-router.phase0.test.ts api/ai-router.test.ts
   ```
3. **Idempotency & Concurrent Submission Verification**:
   - Implement test cases simulating duplicate `clientRequestId` submissions in parallel via `Promise.all([caller.expense.create(...), caller.expense.create(...)])` and verify exactly 1 database row is created without 500 error.
4. **Boundary Validation Verification**:
   - Test inputs with `Infinity`, `NaN`, `1e20`, negative numbers, and oversized text strings against `budget.create`, `goals.create`, and `wallet.createWallet` to ensure Zod `BAD_REQUEST` is returned cleanly with 0 database exceptions.

### Invalidation Conditions
- Any mutation crashing with raw MySQL `ER_DATA_OUT_OF_RANGE` or unhandled `ER_DUP_ENTRY`.
- Any AI generation hanging past 45s without an Arabic timeout error.
- Any cache inconsistency where wallet edits fail to reflect in subsequent financial summary queries.
