# Financial, Payments & Webhooks Security Audit Handoff

## 1. Observation

1. **Cancellation Expiration Bypass (`api/pro-router.ts:48-61`, `143-156`):**
   - Line 145: `await db.update(proSubscriptions).set({ status: "cancelled", autoRenew: false }).where(and(eq(proSubscriptions.userId, ctx.user.id), eq(proSubscriptions.userType, ctx.user.type), eq(proSubscriptions.status, "active")));`
   - Line 48: `if (sub && plan !== "free" && sub.status === "active" && sub.endDate < new Date()) { ... table.set({ plan: "free" }) ... }`
   - When a user cancels, `sub.status` is changed to `"cancelled"`. When `sub.endDate < new Date()`, line 48 evaluates to `false` because `sub.status !== "active"`. The user table `plan` is never reset to `"free"`.

2. **Missing Unique Constraint on Transaction ID (`db/schema.ts:444-463`, `api/lib/subscription-service.ts:21-45`):**
   - In `db/schema.ts:456`, `transactionId` is defined as `varchar("transaction_id", { length: 255 })` with only `(t) => [index("pro_sub_user_idx").on(t.userId, t.userType)]`. No `uniqueIndex` exists for `transactionId`.
   - In `api/lib/subscription-service.ts:21-25`, `grantProSubscription` executes `db.select(...).from(proSubscriptions).where(eq(proSubscriptions.transactionId, input.transactionId)).limit(1)`.
   - Duplicate concurrent requests race through the select check and both insert into `proSubscriptions`.

3. **Indefinite Privilege Retention & Missing Background Expiry Worker (`api/context.ts:61-74, 87-118`, `api/middleware.ts:112-134`, `api/jobs/`):**
   - `createContext` in `api/context.ts` reads `users.plan` / `localUsers.plan` without checking subscription expiration.
   - `proProcedure` and `ultraProcedure` in `api/middleware.ts` guard on `ctx.user.plan`.
   - Only 1 cron job exists in `api/jobs/` (`monthly-report-job.ts`). There is no subscription expiration worker.

4. **Fail-Open Webhook Verification when `PAYMOB_HMAC_SECRET` is Unset in Non-Prod (`api/boot.ts:381-386, 444-467`):**
   - In `api/boot.ts:382`: `if (env.NODE_ENV === "production" && !isPaymobWebhookVerificationConfigured()) { ... return c.json(..., 503); }`
   - In `api/boot.ts:386`: `if (secret) { ... HMAC check ... }`
   - If `env.NODE_ENV !== "production"` and `secret` is undefined, the signature verification block is skipped entirely and execution falls directly into `grantProSubscription`.
   - In `api/lib/env.ts:27`: `NODE_ENV: z.enum(["development", "production", "test"]).default("development")`.

5. **Webhook Currency Guard Missing (`api/boot.ts:460-466`):**
   - Webhook handler validates `hasExactPlanAmount(plan, obj.amount_cents)` but omits validation of `obj.currency === "EGP"`.

6. **Early Renewal Date Truncation (`api/lib/subscription-service.ts:30-34`):**
   - `endDate` is computed via `const endDate = new Date(); if (billingPlan.duration === "month") endDate.setMonth(endDate.getMonth() + 1);` relative to the current timestamp rather than the existing subscription's remaining validity.

7. **Missing Wallet Balance String Validation (`api/wallet-router.ts:53, 74`):**
   - `createWallet` and `updateWallet` accept `balance: z.string().optional()` without numeric or decimal regex constraints, risking MySQL data truncation runtime exceptions.

---

## 2. Logic Chain

1. From **Observation 1**, setting `status = "cancelled"` permanently disables the downstream expiration branch in `pro.myPlan` because the guard explicitly requires `sub.status === "active"`. Therefore, any user who cancels auto-renewal retains Pro/Ultra privileges indefinitely for free.
2. From **Observation 2**, without a database unique constraint on `proSubscriptions.transactionId` and without transaction-level table locks, concurrent webhook deliveries with the same transaction identifier result in duplicate records in `proSubscriptions` and duplicate analytics events.
3. From **Observation 3**, because `users.plan` is persistent and only modified upon visiting `pro.myPlan`, users with expired subscriptions who invoke API endpoints directly (e.g. mobile app background calls, automated exports, AI chatbot) retain un-downgraded paid access.
4. From **Observation 4**, defaulting `NODE_ENV` to `"development"` while gating webhook 503 rejection exclusively on `NODE_ENV === "production"` creates a state where unconfigured instances bypass all HMAC signature checks.
5. From **Observation 5**, validating only `amount_cents` without asserting `currency === "EGP"` creates exposure to multi-currency gateway arbitrage.
6. From **Observation 6**, resetting `endDate` from `new Date()` rather than `max(new Date(), currentSub.endDate)` unfairly truncates pre-paid days upon renewal.
7. From **Observation 7**, unvalidated strings passed to MySQL `decimal(12, 2)` trigger unhandled runtime database errors.

---

## 3. Caveats

- Live Paymob production API credentials were not invoked over the network during this read-only audit to prevent incurring live charges or modifying real merchant account states.
- The investigation assumes standard Paymob Accept HMAC-SHA512 hashing behavior as documented in official Paymob API specifications.
- No other caveats.

---

## 4. Conclusion

The SmartSpend financial and billing system possesses strong design foundations (such as canonical pricing contracts in `contracts/plans.ts`, server-to-server hosted checkout creation in `api/lib/paymob.ts`, and `timingSafeEqual` signature comparison in `api/boot.ts`).

However, **7 vulnerabilities were identified**:
1. **Critical:** Infinite lifetime Pro/Ultra access upon clicking subscription cancellation (`api/pro-router.ts:48`).
2. **High:** TOCTOU concurrency race condition and webhook replay vulnerability due to missing database `UNIQUE` constraint on `proSubscriptions.transactionId` (`db/schema.ts:456`).
3. **High:** Indefinite privilege retention past expiration due to lack of a background subscription expiry worker (`api/context.ts`, `api/middleware.ts`).
4. **High:** Unauthenticated webhook processing when `PAYMOB_HMAC_SECRET` is unset on instances where `NODE_ENV` defaults to development (`api/boot.ts:382`).
5. **Medium:** Missing explicit currency check (`obj.currency === 'EGP'`) in Paymob webhook handler (`api/boot.ts:460`).
6. **Medium:** Early renewal duration truncation wiping out remaining prepaid subscription days (`api/lib/subscription-service.ts:31`).
7. **Low:** Unvalidated string input on wallet balances causing 500 DB errors (`api/wallet-router.ts:53, 74`).

Full remediation diffs and architectural details are documented in `analysis.md`.

---

## 5. Verification Method

1. **Verify TypeScript Compilation:**
   ```bash
   npm run check
   ```

2. **Verify Billing Plan Tests:**
   ```bash
   npx vitest run api/lib/billing-plans.test.ts
   ```

3. **Verify Code Inspection:**
   - Inspect `api/pro-router.ts:45-62` to verify `sub.status === "active"` condition.
   - Inspect `db/schema.ts:444-463` to verify missing unique constraint on `transactionId`.
   - Inspect `api/boot.ts:381-386` to verify environment checks around `PAYMOB_HMAC_SECRET`.
