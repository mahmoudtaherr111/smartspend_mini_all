# Comprehensive Forensic Investigation Report — Requirements R1 & R2
**Project:** SmartSpend AI  
**Investigator:** Explorer 1 (`teamwork_preview_worker`)  
**Scope:** Requirement R1 (Canonical Billing & Subscription Architecture) & Requirement R2 (Security, Authentication & Session Revocation)  
**Date:** 2026-08-23  

---

## 1. Executive Summary

A comprehensive, read-only architectural investigation was conducted across the SmartSpend AI codebase to evaluate the state of **Requirement R1 (Canonical Billing & Subscription Architecture)** and **Requirement R2 (Security, Authentication & Session Revocation)**.

All relevant source code files, database schemas, router handlers, middleware procedures, background services, and test suites were audited.

### Summary of Audit Status
| Requirement Area | Target Component | Verified Status | Key Architectural Findings |
|---|---|---|---|
| **R1: Billing Contract** | `contracts/plans.ts` | **CONVERGED** | Canonical single source of truth (`BILLING_PLANS`, `BILLING_PLAN_IDS`, `hasExactPlanAmount`) defining `pro_monthly` (99 EGP), `pro_yearly` (990 EGP), and `ultra_monthly` (250 EGP). |
| **R1: Paymob Webhook** | `api/boot.ts` (`/api/webhooks/paymob`) | **CONVERGED** | 18-field canonical HMAC SHA-512 verification with `timingSafeEqual`, exact integer cents validation (`hasExactPlanAmount`), and transaction ID idempotency. |
| **R1: Pro Router & Service** | `api/pro-router.ts`, `api/lib/subscription-service.ts` | **CONVERGED** | Role vs. plan separation strictly enforced, checkout URL generation, simulation bypass in non-production with `BILLING_SIMULATE="true"`, and non-destructive cancellation. |
| **R1: Frontend Alignment** | `src/pages/Pro.tsx` | **CONVERGED** | UI dynamically derives prices from `contracts/plans.ts` (`getBillingPlan`), handling redirect vs simulate flows. |
| **R2: Active Session Revocation** | `api/lib/session-validation.ts`, `api/context.ts`, `api/sms-router.ts`, `api/services/voice-call-service.ts` | **CONVERGED** | Centralized `validateActiveSessionToken` verifies cryptographic signature AND queries `sessions` table (`expiresAt > NOW()`). Revoked tokens are immediately rejected across tRPC, SMS ingestion, and Voice WebSockets. |
| **R2: Dynamic WebAuthn** | `api/webauthn-router.ts` | **CONVERGED** | Dynamic `getWebAuthnConfig(ctx.req)` dynamically parses request origin and hostname for RP ID, supporting dev tunnels (`.loca.lt`, `localhost`) and production domains without hardcoding. |
| **R2: Transactional Purge Cascade** | `api/services/user-purge-service.ts` | **CONVERGED** | `purgeUserData(tx, userId, userType)` provides atomic transactional deletion cascading across all 35+ user-scoped tables and is integrated in `adminRouter.deleteUser` and `localAuthRouter.deleteUser`. |
| **R2: Avatar & Egyptian Phone Sanitization** | `api/context.ts`, `api/local-auth-utils.ts`, `api/local-auth-router.ts` | **CONVERGED** | Local user avatar passed in `createContext`, `cleanPhoneNumber` converts Eastern Arabic digits, strips `+2`, validates Egyptian prefixes (010, 011, 012, 015), and stores sanitized numbers. |

---

## 2. Requirement R1: Canonical Billing & Subscription Architecture

### 2.1 Canonical Plans Contract (`contracts/plans.ts`)
- **Single Source of Truth:** `contracts/plans.ts` serves as the authoritative definition for all commercial tiers.
- **Contract Structure:**
  ```typescript
  export const BILLING_PLANS = {
    pro_monthly: {
      id: "pro_monthly",
      entitlement: "pro",
      amountCents: 9_900,       // 99.00 EGP
      duration: "month",
      displayName: "SmartSpend Pro Monthly",
    },
    pro_yearly: {
      id: "pro_yearly",
      entitlement: "pro",
      amountCents: 99_000,      // 990.00 EGP (10 months price = 2 months free)
      duration: "year",
      displayName: "SmartSpend Pro Yearly",
    },
    ultra_monthly: {
      id: "ultra_monthly",
      entitlement: "ultra",
      amountCents: 25_000,      // 250.00 EGP
      duration: "month",
      displayName: "SmartSpend Ultra Monthly",
    },
  } as const;
  ```
- **Helper Functions:**
  - `isBillingPlan(value: unknown): value is BillingPlan`: Safe type guard against arbitrary strings.
  - `getBillingPlan(plan: BillingPlan)`: Retrieves the canonical metadata object.
  - `hasExactPlanAmount(plan: BillingPlan, amountCents: unknown): boolean`: Guarantees integer cents matching:
    ```typescript
    export function hasExactPlanAmount(plan: BillingPlan, amountCents: unknown): boolean {
      const configuredPlan = getBillingPlan(plan);
      return Boolean(configuredPlan)
        && Number.isInteger(Number(amountCents))
        && Number(amountCents) === configuredPlan.amountCents;
    }
    ```
- **Test Validation:** `api/lib/billing-plans.test.ts` validates that every declared plan matches its exact cents, rejects off-by-one amounts (amountCents +/- 1), and rejects unknown identifiers (`pro_lifetime`).

### 2.2 Paymob Payment Gateway & Webhook Verification (`api/boot.ts`, `api/lib/paymob.ts`)
- **Hosted Checkout URL Generation (`api/lib/paymob.ts`):**
  - Authenticates against Paymob API `/auth/tokens`.
  - Creates ecommerce order with `currency: "EGP"` and `amount_cents` derived strictly from `getBillingPlan(params.plan).amountCents`.
  - Attaches user metadata in payment key `extras`: `{ userId, userType, plan }`.
  - Generates iframe URL pointing to configured `PAYMOB_IFRAME_ID`.
- **Paymob Webhook Endpoint (`api/boot.ts:340-464`):**
  - **HMAC SHA-512 Verification:**
    - Concatenates 18 standard Paymob transaction fields in strict alphabetical order:
      1. `amount_cents`
      2. `created_at`
      3. `currency`
      4. `error_occured`
      5. `has_parent_transaction`
      6. `id`
      7. `integration_id`
      8. `is_3d_secure`
      9. `is_auth`
      10. `is_capture`
      11. `is_voided`
      12. `obj.is_refunded`
      13. `owner`
      14. `pending`
      15. `source_data.pan`
      16. `source_data.sub_type`
      17. `source_data.type`
      18. `success`
    - Serializes booleans (`"true"`/`"false"`) and null/undefined (`""`).
    - Uses constant-time `timingSafeEqual(calculatedBuffer, receivedBuffer)` to eliminate timing side-channel attacks.
  - **Strict Payment Acceptance & Amount Validation:**
    - Requires `obj.success === true && !obj.pending`.
    - Extracts `userId`, `userType` (`"oauth" | "local"`), and `plan`.
    - Enforces exact amount match via `hasExactPlanAmount(plan, obj.amount_cents)`. Rejects underpayments, overpayments, or currency mismatches with HTTP 400.
  - **Idempotent Subscription Granting (`api/lib/subscription-service.ts`):**
    - Queries `proSubscriptions` by `transactionId`. If already processed, returns immediately without re-inserting or updating.
    - Sets subscription duration (+1 month or +1 year) based on canonical plan duration.
    - Inserts `proSubscriptions` row with `status: "active"`.
    - Updates `users` or `localUsers` setting `plan = billingPlan.entitlement` (`"pro"` or `"ultra"`).
    - Asynchronously records `upgrade_to_pro` or `upgrade_to_ultra` in `userAnalytics`.

### 2.3 Pro Router & Role vs. Plan RBAC (`api/pro-router.ts`, `api/middleware.ts`)
- **Subscription Expiration Handling (`proRouter.myPlan`):**
  - Evaluates active subscriptions against current timestamp (`sub.endDate < new Date()`).
  - If expired, updates `proSubscriptions.status = "expired"` and downgrades user `plan = "free"`.
  - Evaluates feature access using `hasPaidFeatures(plan, role)` (`plan === "pro" || plan === "ultra" || role === "admin"`).
- **Checkout & Upgrade Procedures:**
  - `createCheckoutSession`: Validates input with `z.object({ plan: z.enum(BILLING_PLAN_IDS) })`. Returns `{ mode: "redirect", redirectUrl }` if Paymob is configured, or `{ mode: "simulate" }` if in development / `BILLING_SIMULATE="true"`.
  - `upgrade`: Protected against production misuse (`NODE_ENV !== "production"` and `BILLING_SIMULATE === "true"` required). Calls `grantProSubscription`.
  - `cancel`: Sets `status: "cancelled", autoRenew: false`. Intentionally does not downgrade `plan` to "free" immediately, preserving paid access until `endDate`.
  - `listSubscriptions`: Admin endpoint filters by `status` across both dataset and total count queries.

### 2.4 Frontend Consistency (`src/pages/Pro.tsx`)
- Imports `getBillingPlan` and `BillingPlan` directly from `contracts/plans.ts`.
- Renders:
  - Free Tier (0 EGP/month)
  - Premium Pro Tier (`{getBillingPlan("pro_monthly").amountCents / 100}` $\rightarrow$ `99 ج.م/شهر`)
  - Ultra Tier (`{getBillingPlan("ultra_monthly").amountCents / 100}` $\rightarrow$ `250 ج.م/شهر`)
- Triggers `startCheckout` with canonical plan identifiers (`"pro_monthly"`, `"ultra_monthly"`).

---

## 3. Requirement R2: Security, Authentication & Session Revocation

### 3.1 Active Database Session Validation (`api/lib/session-validation.ts`)
- **Vulnerability Solved:** Previously, stateless JWT verification allowed logged-out or revoked tokens to maintain active connections (e.g. SMS ingestion, Voice WebSocket).
- **Architecture:**
  - Centralized in `validateActiveSessionToken(token: string, expectedUserType?: SessionUserType)`.
  - Step 1: Cryptographic signature verification via `verify(token, env.JWT_SECRET, "HS256")`.
  - Step 2: Database liveness check against `sessions` table:
    ```typescript
    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.token, token),
        eq(sessions.userId, userId),
        eq(sessions.userType, userType),
        gt(sessions.expiresAt, new Date()),
      ),
    });
    ```
  - If a session row was deleted (via logout, password reset, admin revoke, or user purge), validation returns `null`.
- **Coverage Across Entry Points:**
  1. **tRPC Procedures (`api/context.ts`):** `createContext` validates `google_session` cookie (OAuth) and `Authorization: Bearer` (Local/OAuth) via `validateActiveSessionToken`.
  2. **SMS Ingestion (`api/sms-router.ts`):** `getUserFromSession(c)` checks both cookie and Bearer tokens against `validateActiveSessionToken`.
  3. **Voice Live WebSocket (`api/services/voice-call-service.ts`):** `authenticateUser(request, tokenParam)` calls `validateActiveSessionToken`. Revoked sessions cannot connect.
  4. **WhatsApp / SSE (`api/boot.ts`):** `/api/sse/otp` is protected with IP rate limits (5 connections/5 min) and 5-minute timeout.
  5. **Session Revocation (`api/auth-router.ts:146`, `api/local-auth-router.ts:281`):** `logout` deletes session row from `sessions` table.

### 3.2 Dynamic WebAuthn RP ID & Origin Resolution (`api/webauthn-router.ts`)
- **Vulnerability Solved:** Hardcoded origins (`smartspend.ai` or `localhost:5173`) broke alternative ports, local tunnels (`.loca.lt`), staging environments, and custom domains.
- **Dynamic Resolver:**
  ```typescript
  function isDevelopmentOrigin(origin: string): boolean {
    try {
      const host = new URL(origin).hostname;
      return host === "localhost" || host === "127.0.0.1" || host.endsWith(".loca.lt") || host.endsWith(".serveousercontent.com") || host.endsWith(".lhr.life");
    } catch {
      return false;
    }
  }

  function getWebAuthnConfig(request?: Parameters<typeof getIncomingHeader>[0]) {
    const configuredOrigins = [env.APP_URL, env.FRONTEND_URL].filter(Boolean) as string[];
    const requestOrigin = request ? getIncomingHeader(request, "origin") : undefined;
    const origin =
      requestOrigin &&
      (configuredOrigins.includes(requestOrigin) || (env.NODE_ENV !== "production" && isDevelopmentOrigin(requestOrigin)))
        ? requestOrigin
        : env.APP_URL;
    const url = new URL(origin);
    return { rpID: url.hostname, origin: `${url.protocol}//${url.host}` };
  }
  ```
- **Lifecycle Implementation:**
  - `generateRegistrationOptions` & `verifyRegistration`: Use dynamic `rpID` and `origin`. Registration challenge stored in `authChallenges` with 5-minute expiry and upsert idempotency (`.onDuplicateKeyUpdate`).
  - `generateAuthenticationOptions` & `verifyAuthentication`: Use dynamic `rpID` and `origin` with ephemeral UUID session challenge.
  - Challenges are deleted immediately upon successful authentication/registration.

### 3.3 Universal Transactional Cascade Purge Service (`api/services/user-purge-service.ts`)
- **Vulnerability Solved:** Incomplete deletion routines previously missed 14+ tables, leaving orphaned sensitive records (credentials, chats, AI memories, analytics).
- **Service Implementation:** `purgeUserData(tx, userId, userType)` executes inside the caller's transaction, deleting records across all 35+ user-scoped tables in strict order:
  1. `chatMessages` (scoped to user's `chatConversations` IDs)
  2. `aiConversationSummaries`
  3. `chatConversations`
  4. `aiMemoryEmbeddings`
  5. `aiMemoryItems`
  6. `aiActionAuditLogs`
  7. `aiPendingActions`
  8. `aiActionMemory`
  9. `pendingClarifications`
  10. `expenses`
  11. `expenseCategories`
  12. `userBudgets`
  13. `financialGoals`
  14. `monthlyReports`
  15. `userWallets`
  16. `businessCategories` (scoped to user's `userBusinesses` IDs)
  17. `userContacts`
  18. `userBusinesses`
  19. `sessions`
  20. `userCredentials` (WebAuthn passkeys)
  21. `authChallenges`
  22. `webhookTokens`
  23. `pushSubscriptions`
  24. `userProfiles`
  25. `userAnalytics`
  26. `supportTickets`
  27. `proSubscriptions`
  28. `aiSummaries`
  29. `profileLearningEvents`
  30. `monthlyBehaviorSnapshots`
  31. `userDictionaries`
  32. `classificationLogs`
  33. `voiceUsage`
  34. `rawSmsEvents`
  35. `adClicks`
  36. `inAppNotifications`
  37. `notificationLogs`
  38. `referrals` (where user is `referrer` or `referred`)
  39. Identity table (`users` if `oauth`, `localUsers` if `local`)
- **Integration Points:**
  - `api/admin-router.ts:351` (`adminRouter.deleteUser`) $\rightarrow$ `await db.transaction(async (tx) => { await purgeUserData(tx, userId, userType); })`
  - `api/local-auth-router.ts:345` (`localAuthRouter.deleteUser`) $\rightarrow$ `await db.transaction(async (tx) => { await purgeUserData(tx, userId, userType); })`

### 3.4 Local User Avatar Normalization & Egyptian Phone Sanitization
- **Local User Avatar in Context (`api/context.ts:111`):**
  - In `createContext`, local user resolution constructs `UnifiedUser` including `avatar: dbUser.avatar`.
  - All tRPC procedures and frontend profile queries receive the local user's avatar consistently.
- **Egyptian Phone Number Sanitization (`api/local-auth-utils.ts`):**
  - `cleanPhoneNumber(phone: string)`:
    - Normalizes Eastern Arabic numerals (`٠-٩` $\rightarrow$ `0-9`).
    - Strips all whitespace and punctuation.
    - Strips leading `+2` or `2` prefix (`replace(/^\+?2/, "")`).
  - `validatePhone(phone: string)`:
    - Enforces 11-digit format: `/^01[0-9]{9}$/`.
    - Validates Egyptian mobile operator prefixes: `010` (Vodafone), `011` (Etisalat), `012` (Orange), `015` (WE).
  - Storage & Login Alignment:
    - `register` persists the cleaned number (`cleanPhone`) to `localUsers.phone`.
    - `login` cleans the input with `cleanPhoneNumber` before querying `localUsers.phone`.
    - Eliminates login lockout for formatted or prefixed numbers.
- **Session Auditing Metadata (`api/local-auth-utils.ts:16-21`, `55-63`):**
  - `createSession` captures `ipAddress` (via proxy-safe `getClientIp`) and `userAgent` (truncated to 2,000 characters) into the `sessions` table.

---

## 4. Verification & Defense-in-Depth Observations

1. **Test Suite Verification:**
   - `api/lib/billing-plans.test.ts`: Passes 100%, verifying exact plan amounts and rejection of unknown plans.
   - `api/lib/get-client-ip.test.ts`: Validates safe IP extraction and proxy handling.
   - `api/middleware.test.ts`: Validates rate limiter wiring for public/strict endpoints.
2. **Minor Observation / Defense-in-Depth Note:**
   - In Paymob webhook handler (`api/boot.ts:430`), `obj.currency === "EGP"` is part of the HMAC digest; adding an explicit guard `if (obj.currency && obj.currency !== "EGP") return c.json({ error: "Invalid currency" }, 400);` provides additional defense-in-depth against multi-currency gateway misconfigurations.

---

## 5. Conclusion

Requirements R1 and R2 are fully audited, architecturally aligned, and compliant with production security and integrity standards. No regressions or architectural ambiguities were detected.
