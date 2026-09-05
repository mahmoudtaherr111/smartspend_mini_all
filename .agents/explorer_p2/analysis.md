# Phase 3 Defense-in-Depth & Phase 4 Test Infrastructure: Survey & Technical Blueprint

**Author**: `explorer_p2` (Survey Specialist for Phase 3 Defense-in-Depth & Phase 4 Test Infra)  
**Date**: 2026-08-29  
**Status**: COMPLETE (Read-Only Analysis)  
**Scope**: All Phase 3 P2 defense-in-depth targets and Phase 4 test infrastructure mapping across `api/`, `contracts/`, `db/`, `tests/`.

---

## Executive Summary

This survey provides the complete source-code audit, vulnerability mechanics, and exact remediation blueprints for the six assigned Phase 3 (P2) defense-in-depth security targets and Phase 4 regression test harness:
1. **Expense Foreign Key & Ownership Validation** (`api/expense-router.ts`): Missing ownership checks on `walletId` and `businessId` in `create` and `batchCreate`, allowing cross-tenant attachment of expenses.
2. **Zod Bounds & Schemas** (`api/profile-router.ts`, `api/wallet-router.ts`, `api/ai-router.ts`, `api/sms-router.ts`, `api/goals-router.ts`, `api/budget-router.ts`): Missing string length caps, unbounded JSON objects (`z.record(z.string(), z.any())`), unvalidated decimal balances, and missing regex for dates.
3. **Execution Timeout Guards on External AI SDKs** (`api/lib/ai-gateway.ts`, `api/lib/smart-pipeline.ts`, `api/lib/sms-ai-parser.ts`, `api/lib/receipt-image-parser.ts`, `api/lib/narrative-decomposer.ts`): Missing 30s timeout wrappers on Google Generative AI SDK calls causing worker thread hangs during upstream network latency.
4. **WebSocket Security on `/api/voice/live`** (`api/server.ts`, `api/boot.ts`, `api/services/voice-call-service.ts`): Unvalidated `Origin` header on HTTP upgrade (Cross-Site WebSocket Hijacking / CSWSH), lack of pre-upgrade rate limiting, and unauthenticated handshake resource allocation.
5. **tRPC Production ErrorFormatter** (`api/middleware.ts`, `api/router.ts`): Unconfigured `errorFormatter` leaking database schemas, column names, SQL errors, and internal stack traces in production.
6. **Test Infrastructure & Regression Harness** (`vitest.config.ts`, `package.json`, `tests/`, `api/**/*.test.ts`): Vitest configuration analysis, test mock strategies, and concrete regression test suite plans for every audited component.

---

## 1. Expense Foreign Key & Ownership Checks

### 1.1 Affected Files & Exact Line Numbers
- `api/expense-router.ts`:
  - Lines 110–125: `ExpenseReferenceInput` and `ExpenseReferenceResult` type definitions.
  - Lines 127–201: `resolveBatchExpenseReferences` helper.
  - Lines 427–428 & 461–462: `create` procedure input schema and database insert statement.
  - Lines 505–506 & 532–533: `batchCreate` procedure input schema and batch values mapping.
  - Lines 643–648: `searchTransactions` unescaped SQL `LIKE` wildcard search.
  - Lines 679–737: `update` procedure.
  - Lines 1789–1803 & 1976–1988: `answerClarification` procedure item insertion.

### 1.2 Current Vulnerable Behavior
In `api/expense-router.ts`, the `create` and `batchCreate` procedures accept `walletId` and `businessId` directly from client input:
```typescript
// api/expense-router.ts:427-428
businessId: z.number().int().positive().optional(),
walletId: z.number().int().positive().optional(),
```
While `contactId` and `classificationLogId` are verified via `resolveBatchExpenseReferences` (which executes `WHERE id IN (...) AND userId = ? AND userType = ?` against `userContacts` and `classificationLogs`), `walletId` and `businessId` are passed directly into the SQL insert statement:
```typescript
// api/expense-router.ts:461-462
businessId: input.businessId || null,
walletId: input.walletId || null,
```
**Vulnerability Mechanics (CWE-284 / CWE-639 / BOLA)**:
1. User A (Attacker) creates an expense specifying `walletId: 45` or `businessId: 12` belonging to User B (Victim).
2. The database inserts the record with `userId = UserA.id`, but `walletId = 45` and `businessId = 12`.
3. In `getWalletTransactions` (`api/wallet-router.ts:37`), queries filter on `userId = UserA.id AND walletId = 45`. But database integrity is corrupted, cross-tenant foreign keys are attached, and business analytics grouping by `businessId` across reporting tables can misattribute or leak financial activity.

### 1.3 Required Secure Behavior
1. In `api/expense-router.ts`, update `ExpenseReferenceInput` to include `walletId?: number` and `businessId?: number`.
2. In `resolveBatchExpenseReferences`:
   - Batch query `userWallets` for all explicit `walletId`s:
     ```typescript
     const explicitWalletIds = [...new Set(items.map((i) => i.walletId).filter((id): id is number => typeof id === "number" && id > 0))];
     if (explicitWalletIds.length > 0) {
       const foundWallets = await database
         .select({ id: userWallets.id })
         .from(userWallets)
         .where(
           and(
             inArray(userWallets.id, explicitWalletIds),
             eq(userWallets.userId, userId),
             eq(userWallets.userType, userType),
           ),
         );
       const validWalletIds = new Set(foundWallets.map((w) => w.id));
       for (const wid of explicitWalletIds) {
         if (!validWalletIds.has(wid)) {
           throw new TRPCError({
             code: "NOT_FOUND",
             message: "المحفظة غير موجودة",
           });
         }
       }
     }
     ```
   - Batch query `userBusinesses` for all explicit `businessId`s:
     ```typescript
     const explicitBusinessIds = [...new Set(items.map((i) => i.businessId).filter((id): id is number => typeof id === "number" && id > 0))];
     if (explicitBusinessIds.length > 0) {
       const foundBusinesses = await database
         .select({ id: userBusinesses.id })
         .from(userBusinesses)
         .where(
           and(
             inArray(userBusinesses.id, explicitBusinessIds),
             eq(userBusinesses.userId, userId),
             eq(userBusinesses.userType, userType),
           ),
         );
       const validBusinessIds = new Set(foundBusinesses.map((b) => b.id));
       for (const bid of explicitBusinessIds) {
         if (!validBusinessIds.has(bid)) {
           throw new TRPCError({
             code: "NOT_FOUND",
             message: "المشروع غير موجود",
           });
         }
       }
     }
     ```
3. In `searchTransactions` (`api/expense-router.ts:643`): Escape SQL wildcards before constructing the query:
   ```typescript
   const escapedQuery = input.query.replace(/[%_\\]/g, "\\$&");
   const q = `%${escapedQuery}%`;
   ```

---

## 2. Zod Bounds & Input Schemas

### 2.1 Affected Files & Exact Line Numbers
- `api/profile-router.ts`:
  - Lines 37–46: `smartProfilePatchSchema`
  - Lines 168–174: `updateProfile` input schema
  - Lines 264–273: `submitOnboardingAnswer` input schema
  - Lines 337–343: `updateUserInfo` input schema
  - Lines 452–460: `savePushSubscription` input schema
  - Lines 556–559: `listContacts` input schema
- `api/wallet-router.ts`:
  - Lines 23–28: `getWalletTransactions` input schema
  - Lines 48–55: `createWallet` input schema
  - Lines 69–76: `updateWallet` input schema
  - Line 98: `deleteWallet` input schema
- `api/ai-router.ts`:
  - Lines 795–804: `parseExpense` input schema
  - Lines 1341–1347: `speechToText` input schema
  - Lines 1611–1618: `parseVoiceExpense` input schema
  - Lines 2050–2056: `learnWord` input schema
  - Lines 2079–2085: `generateMonthlyInsights` input schema
  - Lines 3067–3073: `compareMonths` input schema
  - Lines 3234–3239: `generateYearlyInsights` input schema
- `api/sms-router.ts`:
  - Lines 193–208: `parseSmsWebhook` body parsing
- `api/goals-router.ts`:
  - Lines 120–127: `create` goal input schema
- `api/budget-router.ts`:
  - Lines 107–116: `create` budget input schema

### 2.2 Detailed Gap Analysis & Proposed Schema Hardening

#### A. Profile Router (`api/profile-router.ts`)
| Parameter | Current Definition | Required Secure Definition | Rationale |
| :--- | :--- | :--- | :--- |
| `smartProfilePatchSchema` | `z.record(z.string(), z.any())` | Structured sub-record: `z.record(z.string().max(64), z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(100)).max(50)])).optional()` | Prevents deeply nested JSON bombs and heap DoS. |
| `avatarId` | `z.string().nullable().optional()` | `z.string().max(100).nullable().optional()` | Enforces bounded avatar identifier length. |
| `updateProfile.monthlyIncome` | `z.number().optional()` | `z.number().positive().max(ExpenseInputLimits.amountMax).optional()` | Prevents negative or trillion-value overflows. |
| `updateProfile.financialGoal` | `z.string().optional()` | `z.string().min(1).max(500).optional()` | Restricts free-form goal length. |
| `updateUserInfo.phone` | `z.string().optional()` | `z.string().min(8).max(20).regex(/^\+?[0-9\s-]+$/).optional()` | Validates telephone format. |
| `updateUserInfo.avatar` | `z.string().optional()` | `z.string().max(2048).url().or(z.string().max(100)).optional()` | Prevents multi-megabyte string injections. |
| `savePushSubscription` | `endpoint: z.string().optional()` | `endpoint: z.string().max(2048).optional()`, `p256dh: z.string().max(500).optional()`, `auth: z.string().max(500).optional()`, `fcmToken: z.string().max(2048).optional()` | Prevents oversized token spamming. |
| `listContacts.search` | `z.string().optional()` | `z.string().max(100).optional()` | Restricts contact query length. |

#### B. Wallet Router (`api/wallet-router.ts`)
| Parameter | Current Definition | Required Secure Definition | Rationale |
| :--- | :--- | :--- | :--- |
| `createWallet.balance` | `z.string().optional()` | `z.string().regex(/^-?\d+(\.\d{1,2})?$/, "المبلغ غير صحيح").max(15).optional()` | Prevents MySQL `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD` error 500s on malformed balance strings. |
| `createWallet.lastFourDigits` | `z.string().max(4).optional()` | `z.string().regex(/^\d{4}$/, "يجب أن تكون 4 أرقام").optional()` | Ensures strictly 4 numeric digits. |
| `createWallet.provider` | `z.string().min(1).max(50)` | `z.enum(["Visa", "Mastercard", "VodafoneCash", "InstaPay", "BankTransfer", "OrangeCash", "EtisalatCash", "Cash", "Other"]).or(z.string().min(1).max(50))` | Validates recognized wallet providers. |
| `updateWallet.id` | `z.number()` | `z.number().int().positive()` | Enforces valid positive primary key. |
| `updateWallet.balance` | `z.string().optional()` | `z.string().regex(/^-?\d+(\.\d{1,2})?$/, "المبلغ غير صحيح").max(15).optional()` | Enforces decimal number format. |
| `updateWallet.lastFourDigits` | `z.string().max(4).optional()` | `z.string().regex(/^\d{4}$/, "يجب أن تكون 4 أرقام").optional()` | Ensures 4 numeric digits. |

#### C. AI Router (`api/ai-router.ts`)
| Parameter | Current Definition | Required Secure Definition | Rationale |
| :--- | :--- | :--- | :--- |
| `parseExpense.text` | `z.string()` | `z.string().min(1).max(ExpenseInputLimits.rawTextMax)` (5,000 chars) | Prevents megabyte prompt injection and token exhaustion. |
| `parseExpense.voiceModelUsed` | `z.string().optional()` | `z.string().max(100).optional()` | Bounds model identifier. |
| `parseExpense.sttTokensUsed` | `z.number().optional()` | `z.number().int().nonnegative().max(1_000_000).optional()` | Validates integer token count. |
| `learnWord.word` | `z.string()` | `z.string().min(1).max(100)` | Prevents dictionary table bloat. |
| `learnWord.category` | `z.string()` | `z.string().min(1).max(100)` | Validates category name length. |
| `learnWord.subCategory` | `z.string().optional()` | `z.string().max(100).optional()` | Validates subcategory length. |
| `generateMonthlyInsights.month` | `z.string()` | `z.string().regex(/^\d{4}-\d{2}$/, "الصيغة يجب أن تكون YYYY-MM")` | Standardizes month query format. |
| `compareMonths.month1 & month2` | `z.string()` | `z.string().regex(/^\d{4}-\d{2}$/, "الصيغة يجب أن تكون YYYY-MM")` | Validates month parameters. |
| `generateYearlyInsights.year` | `z.string()` | `z.string().regex(/^\d{4}$/, "الصيغة يجب أن تكون YYYY")` | Validates 4-digit year format. |

#### D. Goals & Budget Routers (`api/goals-router.ts`, `api/budget-router.ts`, `api/sms-router.ts`)
| Parameter | Current Definition | Required Secure Definition | Rationale |
| :--- | :--- | :--- | :--- |
| `goals.create.targetAmount` | `z.number().positive().optional()` | `z.number().positive().max(ExpenseInputLimits.amountMax).optional()` | Prevents integer/decimal overflow in goal calculations. |
| `budget.create.monthlyLimit` | `z.number().positive()` | `z.number().positive().max(ExpenseInputLimits.amountMax)` | Prevents overflow in budget tracking. |
| `sms-router.parseSmsWebhook` | `typeof message !== "string" \|\| message.trim().length < 5` | `typeof message === "string" && message.length >= 5 && message.length <= 5000` | Prevents denial of service on SMS ingestion webhook. |

---

## 3. Execution Timeout Guards on External AI SDKs

### 3.1 Affected Files & Exact Line Numbers
- `api/lib/ai-gateway.ts`:
  - Lines 400–421: `geminiModel.generateContent(userPromptContent || ...)`
  - Line 447: `setTimeout(() => controller.abort(), 45000)` (OpenAI protocol timeout)
- `api/lib/smart-pipeline.ts`:
  - Lines 1300–1330: `geminiModel.generateContent(finalUserPrompt)` inside retry loop.
- `api/lib/sms-ai-parser.ts`:
  - Lines 129–145: `model.generateContent(prompt)`
- `api/lib/receipt-image-parser.ts`:
  - Lines 96–115: `model.generateContent([...])`
- `api/lib/narrative-decomposer.ts`:
  - Lines 890–915: `model.generateContent(...)`

### 3.2 Current Vulnerability Mechanics (CWE-400 / Uncontrolled Resource Consumption)
1. `GoogleGenerativeAI` SDK calls in `ai-gateway.ts` and `smart-pipeline.ts` execute over network HTTP connections without an explicit timeout wrapper or AbortSignal.
2. In the event of Google Gemini API slowdowns, network drops, or dropped TLS keep-alives, the Node.js event loop maintains open socket connections indefinitely.
3. Multiple concurrent user requests to `ai.parseExpense` or `ai.chat` accumulate in memory, exhausting the server connection pool and causing cascading timeouts across the entire platform.

### 3.3 Required Secure Architecture & Helper Blueprint
Create a shared async execution wrapper utility `withTimeout`:

```typescript
// api/lib/async-timeout.ts
import { TRPCError } from "@trpc/server";

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 30_000,
  errorMessage = "استغرقت معالجة الذكاء الاصطناعي وقتاً أطول من المتوقع. يرجى المحاولة لاحقاً.",
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new TRPCError({
          code: "TIMEOUT",
          message: errorMessage,
        }),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
```

#### Application in `ai-gateway.ts`:
```typescript
// Replace api/lib/ai-gateway.ts:416-417
const result = await withTimeout(
  geminiModel.generateContent(userPromptContent || params.userQuery || "تحليل البيانات"),
  30_000,
  "استغرقت معالجة نموذج Gemini وقتاً أطول من المتوقع (30 ثانية).",
);
```

#### Application in `smart-pipeline.ts`:
```typescript
// Replace api/lib/smart-pipeline.ts:1314
dRes = await withTimeout(
  geminiModel.generateContent(finalUserPrompt),
  30_000,
  "استغرق تحليل العملية وقتاً أطول من المتوقع.",
);
```

---

## 4. WebSocket Security on `/api/voice/live`

### 4.1 Affected Files & Exact Line Numbers
- `api/server.ts`: Lines 41–52 (`server.on("upgrade")`, `wss.on("connection")`)
- `api/boot.ts`: Lines 548–559 (`server.on("upgrade")`, `wss.on("connection")`)
- `api/services/voice-call-service.ts`: Lines 32–59 (`authenticateUser`), Lines 188–205 (`handleVoiceCallWebSocket`)

### 4.2 Current Vulnerability Mechanics (CWE-287 / CWE-346 / CSWSH)
1. **Cross-Site WebSocket Hijacking (CSWSH)**:
   In `server.on("upgrade")`, the upgrade handler only inspects `url.pathname.startsWith("/api/voice/live")`. It does NOT validate the incoming `Origin` HTTP header.
   Because browsers automatically attach ambient credentials (HTTP-only cookie `google_session`) during WebSocket upgrade requests, a malicious website `https://attacker-bank.com` can initiate `new WebSocket("wss://smartspend.ai/api/voice/live")`. The browser sends the victim's session cookie, establishing an authenticated live voice session controlled by the attacker site.
2. **Unauthenticated Resource Consumption & Handshake Exhaustion**:
   TCP sockets are upgraded to WebSocket protocol *before* checking whether the request contains a valid session token. An unauthenticated attacker can open thousands of simultaneous WebSocket connections, allocating WebSocket server buffers and triggering database lookups in `authenticateUser` before the connection is closed with `1008`.

### 4.3 Required Secure Architecture & Upgrade Guard
1. **Origin Verification Guard**:
   Define an `isAllowedWebSocketOrigin(origin: string | undefined): boolean` function matching CORS rules:
   ```typescript
   function isAllowedWebSocketOrigin(origin: string | undefined): boolean {
     if (!origin) return true; // Non-browser clients (Capacitor mobile, native)
     const allowedOrigins = [env.APP_URL, env.FRONTEND_URL].filter(Boolean) as string[];
     if (allowedOrigins.includes(origin)) return true;
     if (env.NODE_ENV === "development") {
       try {
         const parsed = new URL(origin);
         const host = parsed.hostname;
         if (
           host === "localhost" ||
           host === "127.0.0.1" ||
           host.endsWith(".loca.lt") ||
           host.endsWith(".ngrok-free.dev") ||
           host.endsWith(".ngrok-free.app") ||
           host.endsWith(".ngrok.app") ||
           host.endsWith(".trycloudflare.com")
         ) {
           return true;
         }
       } catch {
         return false;
       }
     }
     return false;
   }
   ```
2. **Pre-Upgrade Authentication & Origin Rejection**:
   In `server.on("upgrade")` (`api/server.ts` & `api/boot.ts`):
   ```typescript
   server.on("upgrade", async (request, socket, head) => {
     const url = new URL(request.url || "", "http://localhost");
     if (!url.pathname.startsWith("/api/voice/live")) {
       socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
       socket.destroy();
       return;
     }

     const origin = request.headers.origin;
     if (!isAllowedWebSocketOrigin(origin)) {
       socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
       socket.destroy();
       return;
     }

     // Upgrade to WebSocket
     wss.handleUpgrade(request, socket, head, (ws) => {
       wss.emit("connection", ws, request);
     });
   });
   ```

---

## 5. tRPC Production ErrorFormatter

### 5.1 Affected Files & Exact Line Numbers
- `api/middleware.ts`: Line 5 (`const t = initTRPC.context<Context>().create();`)
- `api/router.ts`: Lines 1–50 (`appRouter`)

### 5.2 Current Vulnerability Mechanics (CWE-209 / Information Exposure Through Error Messages)
1. In `api/middleware.ts:5`, `initTRPC.context<Context>().create()` is called with empty options.
2. By default in tRPC, if a database error occurs (e.g. MySQL constraint failure, foreign key mismatch, connection pool error) or an upstream third-party SDK throws an unexpected exception, tRPC formats the error with full message details and stack traces.
3. In production, this can expose database table names, SQL query syntax, internal file system paths, and runtime library versions to unauthenticated or malicious clients.

### 5.3 Required Secure Configuration
Configure `errorFormatter` in `api/middleware.ts:5`:

```typescript
// api/middleware.ts:5
import { env } from "./lib/env";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const isProd = env.NODE_ENV === "production";
    const isInternalError =
      shape.data.code === "INTERNAL_SERVER_ERROR" ||
      !error.code ||
      !(error instanceof TRPCError);

    return {
      ...shape,
      message:
        isProd && isInternalError
          ? "حدث خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى لاحقاً."
          : shape.message,
      data: {
        ...shape.data,
        stack: isProd ? undefined : shape.data.stack,
      },
    };
  },
});
```

---

## 6. Test Infrastructure & Regression Harness

### 6.1 Test Runner Topology & Configuration
- **Configuration File**: `vitest.config.ts`
- **Root Directory**: `e:/smartspend_V1_fixed`
- **Environment Mapping**:
  - `src/**` -> `jsdom` (React components, UI hooks)
  - `api/**` -> `node` (Hono, tRPC, Drizzle, AI services)
  - `tests/**` -> `node` (Integration & regression suites)
- **Included Glob Patterns**: `api/**/*.test.ts`, `api/**/*.spec.ts`, `src/**/*.test.ts`, `src/**/*.test.tsx`, `tests/**/*.test.ts`
- **Environment Variables Preset**:
  - `DATABASE_URL`: `mysql://test:test@localhost:3306/test`
  - `NODE_ENV`: `test`
  - `JWT_SECRET`: `test`
  - `GEMINI_API_KEY`: `test`
  - `TRUST_PROXY`: `true`

### 6.2 Test Architecture for Phase 3 Defense-in-Depth

To guarantee 100% regression coverage without touching production databases, five focused test suites should be constructed:

```
tests/
├── security-expense-ownership.test.ts   # Verifies walletId/businessId cross-tenant isolation
├── security-zod-bounds.test.ts          # Verifies string length, decimal regex, profile bounds
├── security-ai-timeout.test.ts          # Verifies 30s timeout guard and Promise.race behavior
├── security-websocket-origin.test.ts    # Verifies WS upgrade origin validation & rejection
└── security-error-formatter.test.ts     # Verifies production error redaction & stack stripping
```

#### Detailed Test Specification Matrix:

| Test File | Test Case | Target Under Test | Input / Action | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `security-expense-ownership.test.ts` | TC-EXP-01 | `expense.create` | `create` with `walletId` belonging to User 2 | Throws `TRPCError(NOT_FOUND)` ("المحفظة غير موجودة") |
| `security-expense-ownership.test.ts` | TC-EXP-02 | `expense.create` | `create` with `businessId` belonging to User 2 | Throws `TRPCError(NOT_FOUND)` ("المشروع غير موجود") |
| `security-expense-ownership.test.ts` | TC-EXP-03 | `expense.batchCreate` | `batchCreate` with mixed valid & invalid `walletId` | Entire batch rejected; throws `TRPCError(NOT_FOUND)` |
| `security-zod-bounds.test.ts` | TC-ZOD-01 | `wallet.createWallet` | `createWallet` with invalid balance (`"not_a_number"`) | Zod validation error thrown (`BAD_REQUEST`) |
| `security-zod-bounds.test.ts` | TC-ZOD-02 | `wallet.createWallet` | `createWallet` with 5-digit `lastFourDigits` (`"12345"`) | Zod validation error thrown (`BAD_REQUEST`) |
| `security-zod-bounds.test.ts` | TC-ZOD-03 | `ai.parseExpense` | `parseExpense` with 10,000-character text | Zod validation error thrown (`BAD_REQUEST`) |
| `security-zod-bounds.test.ts` | TC-ZOD-04 | `ai.generateMonthlyInsights` | `generateMonthlyInsights` with invalid month (`"2026/08"`) | Zod validation error thrown (`BAD_REQUEST`) |
| `security-zod-bounds.test.ts` | TC-ZOD-05 | `profile.updateSmartProfile`| `updateSmartProfile` with deeply nested payload | Bounded payload schema validation enforced |
| `security-ai-timeout.test.ts` | TC-AI-01 | `withTimeout` | Promise resolving in 50ms with 200ms timeout | Resolves successfully |
| `security-ai-timeout.test.ts` | TC-AI-02 | `withTimeout` | Promise hanging for 1000ms with 100ms timeout | Rejects with `TRPCError(TIMEOUT)` |
| `security-websocket-origin.test.ts` | TC-WS-01 | `isAllowedWebSocketOrigin` | Origin `https://evil-hacker.com` | Returns `false` |
| `security-websocket-origin.test.ts` | TC-WS-02 | `isAllowedWebSocketOrigin` | Origin matching `env.APP_URL` | Returns `true` |
| `security-websocket-origin.test.ts` | TC-WS-03 | `isAllowedWebSocketOrigin` | Localhost origin in `NODE_ENV=development` | Returns `true` |
| `security-error-formatter.test.ts` | TC-ERR-01 | `tRPC errorFormatter` | `INTERNAL_SERVER_ERROR` in `NODE_ENV=production` | Masked message returned; `stack` is `undefined` |
| `security-error-formatter.test.ts` | TC-ERR-02 | `tRPC errorFormatter` | `BAD_REQUEST` with custom Arabic message in production | Preserves client-safe message |
| `security-error-formatter.test.ts` | TC-ERR-03 | `tRPC errorFormatter` | Internal error in `NODE_ENV=development` | Preserves original message and `stack` |

---

## 7. Implementation Roadmap & File Changes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 3 REMEDIATION FILE MAPPING                      │
├────────────────────────────────┬────────────────────────────────────────────┤
│ Target Component               │ Files Modified                             │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 1. Expense Ownership & FKs     │ api/expense-router.ts                      │
│ 2. Zod Bounds & Schemas        │ api/profile-router.ts, api/wallet-router.ts│
│                                │ api/ai-router.ts, api/sms-router.ts        │
│                                │ api/goals-router.ts, api/budget-router.ts  │
│ 3. AI SDK Execution Timeouts   │ api/lib/async-timeout.ts (NEW)             │
│                                │ api/lib/ai-gateway.ts, smart-pipeline.ts   │
│ 4. WebSocket Upgrade Security  │ api/server.ts, api/boot.ts                 │
│                                │ api/services/voice-call-service.ts         │
│ 5. tRPC ErrorFormatter         │ api/middleware.ts                          │
│ 6. Regression Test Suite       │ tests/security-phase3.test.ts (NEW)        │
└────────────────────────────────┴────────────────────────────────────────────┘
```

---
*Report certified by `explorer_p2` (Teamwork Survey Specialist).*
