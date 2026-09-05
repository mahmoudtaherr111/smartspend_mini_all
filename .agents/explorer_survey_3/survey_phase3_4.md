# Deep Technical Investigation Report: Phase 3 Defense-in-Depth, Validation & Phase 4 Test Suite Baseline

**Target System**: SmartSpend AI Behavioral Financial Platform  
**Investigator**: teamwork_preview_explorer (Survey Explorer 3)  
**Date**: August 29, 2026  
**Status**: COMPLETE  

---

## Executive Summary

This report delivers an exhaustive, source-level investigation of **Phase 3 (Defense-in-Depth, Validation & Hygiene)** and **Phase 4 (Verification & Regression Testing Suites)** for SmartSpend AI. Every item specified in the audit scope has been inspected with exact file paths, line numbers, threat mechanics, and concrete remediation code.

### Summary Matrix

| # | Investigation Area | Target Component | Current Vulnerability / Gap | Risk Level |
| :-: | :--- | :--- | :--- | :---: |
| **1** | Foreign Key & Ownership Checks | `api/expense-router.ts` | `walletId` and `businessId` are inserted directly without checking ownership in `userWallets` or `userBusinesses`. | **HIGH** |
| **2** | Strict Zod Bounds & Schemas | `api/profile-router.ts`<br>`api/wallet-router.ts`<br>`api/ai-router.ts` | Unbounded `z.record(z.string(), z.any())`, missing decimal regex on wallet balances, unbounded raw text and missing date/month regex in AI router. | **MEDIUM** |
| **3** | 30s Execution Timeouts on AI SDKs | `api/lib/ai-gateway.ts`<br>`api/lib/smart-pipeline.ts` | Google Gemini `generateContent` calls lack timeouts/AbortSignals, leading to unrecoverable server hangs during network stalls. | **MEDIUM** |
| **4** | WebSocket Upgrade Hardening | `api/server.ts`<br>`api/boot.ts` | `/api/voice/live` upgrades TCP connections without origin verification or pre-upgrade authentication (CSWSH & DoS). | **HIGH** |
| **5** | Production `errorFormatter` Sanitization | `api/middleware.ts` | tRPC root router lacks `errorFormatter`; internal database errors and stack traces leak to client in production. | **LOW-MED** |
| **6** | Baseline of Test Suites & Regression Inventory | Monorepo Test Baseline | `npm run check` caught 2 syntax errors in `goals-router.ts` and `sms-router.ts`. Vitest has 92 test files (89 pass, 638 tests pass). 8 major security regression suites are missing. | **ACTION REQUIRED** |

---

## 1. Foreign Key & Ownership Validation in `api/expense-router.ts`

### 1.1 Current Implementation & Code Observation
In `api/expense-router.ts`:
- **`create` mutation** (lines 444–445, 505–506):
  ```typescript
  // Input schema:
  businessId: z.number().int().positive().optional(),
  walletId: z.number().int().positive().optional(),
  // Insert values:
  businessId: input.businessId || null,
  walletId: input.walletId || null,
  ```
- **`batchCreate` mutation** (lines 577–578, 642–643):
  ```typescript
  // Input item schema:
  businessId: z.number().int().positive().optional(),
  walletId: z.number().int().positive().optional(),
  // Insert values:
  businessId: item.businessId || null,
  walletId: item.walletId || null,
  ```
- **`resolveBatchExpenseReferences`** (lines 144–240):
  - Validates `contactId` against `userContacts` with `eq(userContacts.userId, userId)` and `eq(userContacts.userType, userType)`.
  - Validates `classificationLogId` against `classificationLogs` with `eq(classificationLogs.userId, userId)` and `eq(classificationLogs.userType, userType)`.
  - **Critical Gap**: `userWallets` (`db/schema.ts:239`) is **not imported** and **never queried**. `userBusinesses` (`db/schema.ts:129`) is **never validated** for the incoming `businessId`.

### 1.2 Vulnerability & Impact
An authenticated user can submit an arbitrary `walletId` or `businessId` belonging to another user.
1. **Data Pollution & Cross-Tenant Association**: Expenses created by User A can link to User B's wallet or business entity.
2. **Broken Analytics**: When business or wallet aggregations run, foreign keys can cross tenant boundaries or point to non-existent entities.

### 1.3 Concrete Remediation Blueprint
In `api/expense-router.ts`:
1. Import `userWallets` from `../db/schema`.
2. Expand `resolveBatchExpenseReferences` to validate `walletId` and `businessId`:
```typescript
// 3. Batched Wallet Ownership Validation
const explicitWalletIds = [
  ...new Set(
    items
      .map((item) => item.walletId)
      .filter((id): id is number => typeof id === "number" && id > 0),
  ),
];
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
  for (const requestedId of explicitWalletIds) {
    if (!validWalletIds.has(requestedId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "المحفظة المحددة غير موجودة",
      });
    }
  }
}

// 4. Batched Business Ownership Validation
const explicitBusinessIds = [
  ...new Set(
    items
      .map((item) => item.businessId)
      .filter((id): id is number => typeof id === "number" && id > 0),
  ),
];
if (explicitBusinessIds.length > 0) {
  const foundBusinesses = await database
    .select({ id: userBusinesses.id })
    .from(userBusinesses)
    .where(
      and(
        inArray(userBusinesses.id, explicitBusinessIds),
        eq(userBusinesses.userId, userId),
        eq(userBusinesses.userType, userType),
        eq(userBusinesses.isActive, true),
      ),
    );
  const validBusinessIds = new Set(foundBusinesses.map((b) => b.id));
  for (const requestedId of explicitBusinessIds) {
    if (!validBusinessIds.has(requestedId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "المشروع المحدد غير موجود أو غير نشط",
      });
    }
  }
}
```

---

## 2. Strict Bounds, String Length & Zod Schemas

### 2.1 `api/profile-router.ts`

| Procedure / Schema | Current Definition | Security Gap | Required Remediation |
| :--- | :--- | :--- | :--- |
| `smartProfilePatchSchema` (lines 37–46) | `basicInfo: z.record(z.string(), z.any()).optional()`<br>`financialInfo: z.record(z.string(), z.any()).optional()`<br>`lifestyleInfo: z.record(z.string(), z.any()).optional()`<br>`onboardingAnswers: z.record(z.string(), z.any()).optional()`<br>`aiInferredAttributes: z.record(z.string(), z.any()).optional()`<br>`preferences: z.record(z.string(), z.any()).optional()`<br>`avatarId: z.string().nullable().optional()` | Unbounded JSON payloads; allows huge memory allocations and arbitrary payload injection. | Replace `z.any()` with structured primitives or bounded maps: `z.record(z.string().max(64), z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(200)).max(50)])).optional()`. Enforce `avatarId: z.string().max(100).nullable().optional()`. |
| `updateProfile` (lines 168–174) | `monthlyIncome: z.number().optional()`<br>`financialGoal: z.string().optional()` | No numerical upper bound, no string length cap. | `monthlyIncome: z.number().min(0).max(100_000_000).optional()`<br>`financialGoal: z.string().max(500).optional()` |
| `updateUserInfo` (lines 337–343) | `name: z.string().min(2).optional()`<br>`phone: z.string().optional()`<br>`avatar: z.string().optional()` | Name has no max length; phone has no Egyptian phone regex; avatar has no max length. | `name: z.string().min(2).max(100).optional()`<br>`phone: z.string().regex(/^01[0125][0-9]{8}$/, "رقم الهاتف غير صحيح").optional()`<br>`avatar: z.string().max(500).optional()` |
| `savePushSubscription` (lines 452–460) | `endpoint`, `p256dh`, `auth`, `fcmToken`, `deviceType` all unbounded `z.string().optional()` | Unbounded string inputs. | `endpoint: z.string().max(1000).optional()`<br>`p256dh: z.string().max(255).optional()`<br>`auth: z.string().max(255).optional()`<br>`fcmToken: z.string().max(1000).optional()`<br>`deviceType: z.string().max(50).optional()` |

### 2.2 `api/wallet-router.ts`

| Procedure | Current Definition | Security Gap | Required Remediation |
| :--- | :--- | :--- | :--- |
| `createWallet` (lines 48–54) | `balance: z.string().optional()`<br>`lastFourDigits: z.string().max(4).optional()` | `balance` accepts arbitrary non-numeric strings causing MySQL `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD`. `lastFourDigits` is not validated for digits. | `balance: z.string().regex(/^\d+(\.\d{1,2})?$/, "المبلغ غير صحيح").optional()`<br>`lastFourDigits: z.string().regex(/^\d{4}$/, "يجب إدخال 4 أرقام").optional()` |
| `updateWallet` (lines 69–76) | `id: z.number()`<br>`balance: z.string().optional()`<br>`lastFourDigits: z.string().max(4).optional()` | Missing positive integer constraint on `id`; unvalidated balance and digits. | `id: z.number().int().positive()`<br>`balance: z.string().regex(/^\d+(\.\d{1,2})?$/, "المبلغ غير صحيح").optional()`<br>`lastFourDigits: z.string().regex(/^\d{4}$/, "يجب إدخال 4 أرقام").optional()` |
| `getWalletTransactions` (lines 22–28) | `walletId: z.number()` | `walletId` lacks `.int().positive()`. | `walletId: z.number().int().positive()` |

### 2.3 `api/ai-router.ts`

| Procedure | Current Definition | Security Gap | Required Remediation |
| :--- | :--- | :--- | :--- |
| `parseExpense` (lines 795–805) | `text: z.string()`<br>`voiceModelUsed: z.string().optional()`<br>`sttTokensUsed: z.number().optional()` | Unbounded text string; could trigger LLM token overflow or memory exhaustion. | `text: z.string().min(1).max(2000)`<br>`voiceModelUsed: z.string().max(100).optional()`<br>`sttTokensUsed: z.number().int().nonnegative().optional()` |
| `speechToText` (lines 1341–1346) | `audioBase64: z.string()`<br>`mimeType: z.string().default("audio/webm")`<br>`durationSeconds: z.number().default(0)` | Missing upper bounds on base64, mimeType, and durationSeconds. | `audioBase64: z.string().min(1).max(14_000_000)`<br>`mimeType: z.string().max(50).default("audio/webm")`<br>`durationSeconds: z.number().min(0).max(600).default(0)` |
| `learnWord` (lines 2050–2055) | `word: z.string()`<br>`category: z.string()`<br>`subCategory: z.string().optional()` | Unbounded strings for user dictionary insertions. | `word: z.string().min(1).max(100)`<br>`category: z.string().min(1).max(100)`<br>`subCategory: z.string().max(100).optional()` |
| `generateMonthlyInsights` (lines 2079–2085) | `month: z.string()` | Lacks `YYYY-MM` regex check. | `month: z.string().regex(/^\d{4}-\d{2}$/, "الشهر غير صحيح (YYYY-MM)")` |
| `compareMonths` (lines 3067–3072) | `month1: z.string()`<br>`month2: z.string()` | Both inputs lack `YYYY-MM` regex checks. | `month1: z.string().regex(/^\d{4}-\d{2}$/)`<br>`month2: z.string().regex(/^\d{4}-\d{2}$/)` |
| `generateYearlyInsights` (lines 3234–3238) | `year: z.string()` | Missing `YYYY` regex check in Zod schema. | `year: z.string().regex(/^\d{4}$/, "السنة غير صحيحة (YYYY)")` |

---

## 3. 30s Execution Timeout Guards on External AI SDK Calls

### 3.1 Investigation of `api/lib/ai-gateway.ts`
- **Location**: `api/lib/ai-gateway.ts` (lines 399–421).
- **Observation**:
  ```typescript
  if (protocol === "gemini" || (!route && providerSlug === "gemini")) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model: modelId, ... });
    const result = await geminiModel.generateContent(userPromptContent || params.userQuery || "تحليل البيانات");
  ```
  `geminiModel.generateContent` is called **without** timeout options or AbortControllers. If Google's API hangs, the Node worker request hangs indefinitely.
- **OpenAI Standard Branch** (lines 446–447): Uses a 45s timeout (`setTimeout(() => controller.abort(), 45000)`).
- **Remediation**:
  Wrap all AI SDK calls in a standard 30s timeout wrapper:
  ```typescript
  export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = 30_000,
    errorMessage: string = "AI operation timed out after 30s",
  ): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }
  ```
  Apply `withTimeout(geminiModel.generateContent(...), 30_000)` in `ai-gateway.ts:416`.

### 3.2 Investigation of `api/lib/smart-pipeline.ts`
- **Location**: `api/lib/smart-pipeline.ts` (lines 1299–1329).
- **Observation**:
  ```typescript
  const genAI = new GoogleGenerativeAI(input.apiKey);
  const geminiModel = genAI.getGenerativeModel({ model: modelUsed, ... });
  dRes = await geminiModel.generateContent(finalUserPrompt);
  ```
  Called without timeout wrappers.
- **Remediation**:
  Wrap `geminiModel.generateContent` with `withTimeout(..., 30_000)`.

### 3.3 Investigation of Other AI Clients
- `api/lib/nvidia-client.ts` (line 31): Has a 30s timeout (`setTimeout(() => controller.abort(), 30000)`). ✅
- `api/lib/fireworks-client.ts` (line 22): Has a 25s timeout (`setTimeout(() => controller.abort(), 25000)`). ✅
- `api/lib/groq-client.ts` (lines 13–22): Groq SDK `groq.chat.completions.create(...)` lacks explicit timeout. ⚠️ Needs `{ timeout: 30000 }` in Groq client options.

---

## 4. WebSocket Upgrade Hardening on `/api/voice/live`

### 4.1 Investigation of `api/server.ts` & `api/boot.ts`
- **Location**: `api/server.ts` (lines 41–48) and `api/boot.ts` (lines 548–555).
- **Observation**:
  ```typescript
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", "http://localhost");
    if (url.pathname.startsWith("/api/voice/live")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
  ```
- **Vulnerability Mechanics**:
  1. **Cross-Site WebSocket Hijacking (CSWSH)**: Browsers automatically send ambient cookies (e.g. `google_session`) with cross-origin WebSocket handshakes. Because no `Origin` validation occurs before upgrade, malicious websites can initiate live audio calls on behalf of logged-in victims.
  2. **Unauthenticated Resource Consumption (DoS)**: Full TCP socket upgrade and WebSocket allocation occur *before* `handleVoiceCallWebSocket` validates credentials. An attacker can exhaust Node sockets with unauthenticated handshakes.

### 4.2 Concrete Remediation Blueprint
In `api/server.ts` and `api/boot.ts`:
```typescript
const ALLOWED_ORIGINS = new Set([
  env.APP_URL?.replace(/\/+$/, ""),
  "https://nutty-husband-customary.ngrok-free.dev",
  "http://localhost:3000",
  "http://localhost:5173",
  "capacitor://localhost",
  "http://localhost",
].filter(Boolean));

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // Direct non-browser clients (Capacitor native shell)
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) return true;
  return false;
}

server.on("upgrade", async (request, socket, head) => {
  const url = new URL(request.url || "", "http://localhost");
  if (url.pathname.startsWith("/api/voice/live")) {
    const origin = request.headers["origin"] as string | undefined;
    if (!isOriginAllowed(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
});
```

---

## 5. Production `errorFormatter` Sanitization in `api/middleware.ts`

### 5.1 Investigation of `api/middleware.ts`
- **Location**: `api/middleware.ts` (line 5).
- **Observation**:
  ```typescript
  const t = initTRPC.context<Context>().create();
  ```
- **Vulnerability**: Without an explicit `errorFormatter`, tRPC's default formatter propagates internal error details, database table names, SQL syntax errors, and stack traces to client responses.

### 5.2 Concrete Remediation Blueprint
Update `api/middleware.ts:5`:
```typescript
import { env } from "./lib/env";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const isProduction = env.NODE_ENV === "production";
    const isInternalError = error.code === "INTERNAL_SERVER_ERROR";

    return {
      ...shape,
      data: {
        ...shape.data,
        stack: isProduction ? undefined : shape.data.stack,
      },
      message:
        isProduction && isInternalError
          ? "حدث خطأ غير متوقع في الخادم. يرجى المحاولة لاحقاً."
          : shape.message,
    };
  },
});
```

---

## 6. Overall Baseline of Test Suites & Security Regression Inventory

### 6.1 `npm run check` (TypeScript Compilation)
- **Status**: Exited with code 1.
- **Failures Identified**:
  1. `api/goals-router.ts` (lines 68–69): Incomplete call `await recordAiUsageEvent({ const profile = ...` causing syntax parse errors.
  2. `api/sms-router.ts` (lines 276–321): Truncated lines around `duplicateCheck` and `parseSmsMessage`.

### 6.2 `npm run test` (Vitest Suite Execution)
- **Total Test Files**: 92
- **Passed Test Files**: 89
- **Failed Test Files**: 2 (`api/compression.test.ts` and `tests/static-compression.test.ts` — both failed solely because they import `goals-router.ts` through `server.ts`).
- **Total Tests Passed**: **638 passed**, 0 failed, 1 skipped (639 total).

### 6.3 Security Regression Test Inventory

| Category | Existing Test Files | Required Security Regression Test Files (To Be Added) |
| :--- | :--- | :--- |
| **BOLA / Authorization** | None | `tests/security/business-bola.test.ts` (verify `updateCategory`, `removeCategory`, `linkContact` reject non-owned tenant resources). |
| **Subscription Lifecycle** | `api/lib/billing-plans.test.ts` | `tests/security/pro-subscription-expiry.test.ts` (verify cancelled subscriptions transition to expired after `endDate` and downgrade user plan to `free`). |
| **Cryptographic PRNG** | None | `tests/security/otp-randomness.test.ts` (verify OTP generation uses `crypto.randomInt` and distribution is cryptographically uniform). |
| **Admin Secrets Masking** | None | `tests/security/admin-backup-redaction.test.ts` (verify `triggerBackupDemo` redacts all API keys, HMAC secrets, and JWT secrets). |
| **SMS Cache Multi-Tenancy**| `api/lib/sms-ai-parser.ts` tests | `tests/security/sms-cache-isolation.test.ts` (verify SMS cache is isolated by `(userId, userType)` and never leaks cross-tenant bank balances). |
| **Expense FK Ownership** | `api/expense-router.test.ts` (minimal) | `tests/security/expense-ownership.test.ts` (verify `walletId` and `businessId` reject foreign IDs belonging to other users). |
| **Input Validation Bounds** | None | `tests/security/input-validation.test.ts` (verify strict Zod schema rejection on huge JSON strings, invalid wallet balances, malformed month dates). |
| **WebSocket Security** | None | `tests/security/websocket-origin.test.ts` (verify `/api/voice/live` rejects unauthorized origins and unauthenticated connection upgrades). |
| **Error Sanitization** | `api/middleware.test.ts` (rate limit only)| `tests/security/error-formatter.test.ts` (verify production errorFormatter suppresses SQL errors and stack traces). |

---

## 7. Actionable Recommendation & Roadmap

1. **Fix Compile-Time Syntax Defects**: Clean up `api/goals-router.ts:68` and restore missing parsing block in `api/sms-router.ts:275-300` to bring `npm run check` to 0 errors.
2. **Implement Phase 3 Validations**:
   - Add batched ownership checks for `walletId` and `businessId` in `api/expense-router.ts`.
   - Tighten Zod schemas in `api/profile-router.ts`, `api/wallet-router.ts`, `api/ai-router.ts`.
   - Wrap Gemini calls with 30s `withTimeout` in `ai-gateway.ts` and `smart-pipeline.ts`.
   - Add origin and session checks to WebSocket upgrade in `server.ts` / `boot.ts`.
   - Register `errorFormatter` in `api/middleware.ts`.
3. **Write Missing Security Regression Suites**: Create dedicated security test files in `tests/security/` to lock in vulnerability fixes and ensure zero regression across future releases.
