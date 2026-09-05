# Comprehensive Security Audit Report: Financial, Payments & Webhook Subsystems

**Target Component:** SmartSpend AI — Financial, Payments & Webhooks Infrastructure  
**Audited Modules:** `api/boot.ts`, `api/pro-router.ts`, `api/lib/paymob.ts`, `api/lib/subscription-service.ts`, `api/lib/env.ts`, `contracts/plans.ts`, `api/wallet-router.ts`, `db/schema.ts`  
**Audit Timestamp:** 2026-08-28T14:30:00Z  
**Audit Classification:** READ-ONLY SECURITY INVESTIGATION  

---

## Executive Summary

An exhaustive security audit was conducted on SmartSpend's financial transaction processing, Paymob webhook integration, subscription lifecycle management, wallet balance handling, and billing simulation flags.

The investigation identified **7 distinct vulnerabilities and architectural weaknesses**, including **1 Critical-severity logic vulnerability** that enables indefinite lifetime free Pro/Ultra access upon cancellation, **2 High-severity vulnerabilities** concerning database concurrency/replay race conditions and unauthenticated webhook bypasses in non-production environments, and multiple Medium/Low financial state integrity defects.

| Ref ID | Subsystem | Severity | Title | Location |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-FIN-01** | Billing / Subscriptions | **CRITICAL** | Infinite Lifetime Pro/Ultra Access Exploit via Cancellation State Logic Bug | `api/pro-router.ts:48-61`, `api/pro-router.ts:143-156` |
| **SEC-FIN-02** | Webhooks / Concurrency | **HIGH** | TOCTOU Race Condition & Replay Attack Vulnerability in `grantProSubscription` (Missing Unique Constraint) | `db/schema.ts:444-463`, `api/lib/subscription-service.ts:21-28` |
| **SEC-FIN-03** | Subscriptions / RBAC | **HIGH** | Indefinite Privilege Retention Post-Expiration (Missing Background Expiration Worker) | `api/context.ts:51-124`, `api/middleware.ts:112-134`, `api/pro-router.ts:43-62` |
| **SEC-FIN-04** | Webhooks / Auth | **HIGH** | Unauthenticated Webhook Processing in Non-Production / Default-Env Instances | `api/boot.ts:381-386`, `api/lib/env.ts:27` |
| **SEC-FIN-05** | Webhooks / Payments | **MEDIUM** | Missing Explicit Webhook Currency Guard (`EGP`) | `api/boot.ts:444-467` |
| **SEC-FIN-06** | Billing / Subscriptions | **MEDIUM** | Subscription Duration Truncation on Renewal / Upgrade | `api/lib/subscription-service.ts:30-34` |
| **SEC-FIN-07** | Wallets / Validation | **LOW** | Missing Numeric / Decimal Input Validation on Wallet Balances | `api/wallet-router.ts:53, 74` |

---

## Detailed Vulnerability Analysis

---

### SEC-FIN-01: Infinite Lifetime Pro/Ultra Access Exploit via Cancellation State Logic Bug

- **Severity:** **CRITICAL** (CWE-840: Business Logic Errors / Revenue Leakage)
- **Target Files:**
  - `api/pro-router.ts` (Lines 43–62 and Lines 137–158)
  - `src/pages/Pro.tsx` (Lines 26, 126–130)

#### 1. Vulnerability Mechanics
When a user subscribes to a paid tier (`pro_monthly`, `pro_yearly`, `ultra_monthly`), `proSubscriptions` records `status = "active"`, and the user table (`users` or `localUsers`) sets `plan = "pro"` or `plan = "ultra"`.

When the user cancels auto-renewal via the `pro.cancel` mutation (`api/pro-router.ts:143-152`):
```typescript
await db
  .update(proSubscriptions)
  .set({ status: "cancelled", autoRenew: false })
  .where(
    and(
      eq(proSubscriptions.userId, ctx.user.id),
      eq(proSubscriptions.userType, ctx.user.type),
      eq(proSubscriptions.status, "active"),
    ),
  );
```
The subscription status in the database is changed to `"cancelled"`.

Subsequently, when the user queries `pro.myPlan` (`api/pro-router.ts:45-62`), the expiration check is evaluated:
```typescript
const sub = subs[0];
if (
  sub &&
  plan !== "free" &&
  sub.status === "active" &&
  sub.endDate < new Date()
) {
  await db
    .update(proSubscriptions)
    .set({ status: "expired" })
    .where(eq(proSubscriptions.id, sub.id));
  await db
    .update(table)
    .set({ plan: "free" })
    .where(eq(table.id, ctx.user.id));
  plan = "free";
  sub.status = "expired";
}
```

Because `sub.status` was updated to `"cancelled"`, the condition `sub.status === "active"` evaluates to `false` even after `sub.endDate < new Date()` becomes true.

Consequently:
1. `proSubscriptions.status` is never updated to `"expired"`.
2. The user table (`users` / `localUsers`) `plan` is **never** reset to `"free"`.
3. `myPlan` computes `paid = true` and returns full paid features.
4. `api/context.ts` continues to load `plan: "pro"` / `plan: "ultra"` on every request.

#### 2. Threat Scenario
1. An attacker or ordinary user subscribes to SmartSpend Pro or Ultra for one billing cycle (e.g. 1 month).
2. Immediately after checkout succeeds, the user clicks "Cancel Subscription" in the settings.
3. When the 30-day period expires, the subscription is never downgraded.
4. The user retains unlimited AI models, advanced analytics, priority exports, and Pro/Ultra capabilities indefinitely without paying recurring fees.

#### 3. Concrete Remediation Code
In `api/pro-router.ts`:
```diff
--- a/api/pro-router.ts
+++ b/api/pro-router.ts
@@ -45,7 +45,7 @@ export const proRouter = router({
     if (
       sub &&
       plan !== "free" &&
-      sub.status === "active" &&
+      (sub.status === "active" || sub.status === "cancelled") &&
       sub.endDate < new Date()
     ) {
       await db
```

---

### SEC-FIN-02: TOCTOU Race Condition & Replay Attack Vulnerability in `grantProSubscription`

- **Severity:** **HIGH** (CWE-367: Time-of-check Time-of-use (TOCTOU) Race Condition / CWE-924: Improper Enforcement of Message Authenticity)
- **Target Files:**
  - `db/schema.ts` (Lines 444–463)
  - `api/lib/subscription-service.ts` (Lines 14–63)
  - `api/boot.ts` (Lines 471–480)

#### 1. Vulnerability Mechanics
Payment gateways frequently send duplicate webhook events (e.g., automated retries, dual server-to-server and client-return callbacks, or transient network bursts).

In `api/lib/subscription-service.ts`:
```typescript
export async function grantProSubscription(input: {
  userId: number;
  userType: "oauth" | "local";
  plan: BillingPlan;
  paymentMethod: string;
  transactionId: string;
}) {
  const existing = await db
    .select({ id: proSubscriptions.id, endDate: proSubscriptions.endDate })
    .from(proSubscriptions)
    .where(eq(proSubscriptions.transactionId, input.transactionId))
    .limit(1);
  if (existing.length > 0) {
    return { endDate: existing[0].endDate ?? new Date(), alreadyProcessed: true };
  }
  ...
  await db.insert(proSubscriptions).values({ ... });
```

In `db/schema.ts:444-463`:
```typescript
export const proSubscriptions = mysqlTable(
  "pro_subscriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    plan: varchar("plan", { length: 50 }).notNull().default("pro_monthly"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    autoRenew: boolean("auto_renew").notNull().default(true),
    startDate: datetime("start_date").notNull(),
    endDate: datetime("end_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 100 }),
    transactionId: varchar("transaction_id", { length: 255 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [index("pro_sub_user_idx").on(t.userId, t.userType)],
);
```

There is **no UNIQUE index or constraint** on `transaction_id`.
When two webhook requests arrive concurrently with the same `transactionId`:
1. Request A and Request B execute `SELECT ... WHERE transaction_id = ?` simultaneously.
2. Both queries return empty results (`existing.length === 0`).
3. Both requests execute `INSERT INTO pro_subscriptions`.
4. MySQL accepts both inserts without error.
5. Duplicate subscription records and duplicate analytics events are created.
6. In addition, the operations in `grantProSubscription` are not wrapped in `db.transaction`, risking partial writes if the database connection drops between the insert and the user update.

#### 2. Threat Scenario
- A network blip causes Paymob to deliver duplicate webhook payloads concurrently.
- Both requests race past the non-atomic check, causing database inconsistency, corrupt subscription histories, and double tracking in business analytics.

#### 3. Concrete Remediation Code
1. Add a unique index to `proSubscriptions` in `db/schema.ts`:
```diff
--- a/db/schema.ts
+++ b/db/schema.ts
@@ -460,5 +460,8 @@ export const proSubscriptions = mysqlTable(
       sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
     ),
   },
-  (t) => [index("pro_sub_user_idx").on(t.userId, t.userType)],
+  (t) => [
+    index("pro_sub_user_idx").on(t.userId, t.userType),
+    uniqueIndex("pro_sub_transaction_unique_idx").on(t.transactionId),
+  ],
 );
```

2. Wrap `grantProSubscription` in a transaction and catch duplicate key errors:
```typescript
export async function grantProSubscription(input: {
  userId: number;
  userType: "oauth" | "local";
  plan: BillingPlan;
  paymentMethod: string;
  transactionId: string;
}) {
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: proSubscriptions.id, endDate: proSubscriptions.endDate })
      .from(proSubscriptions)
      .where(eq(proSubscriptions.transactionId, input.transactionId))
      .limit(1);
    if (existing.length > 0) {
      return { endDate: existing[0].endDate ?? new Date(), alreadyProcessed: true };
    }

    const billingPlan = getBillingPlan(input.plan);
    const endDate = new Date();
    if (billingPlan.duration === "month") endDate.setMonth(endDate.getMonth() + 1);
    else endDate.setFullYear(endDate.getFullYear() + 1);

    try {
      await tx.insert(proSubscriptions).values({
        userId: input.userId,
        userType: input.userType,
        plan: input.plan,
        status: "active",
        startDate: new Date(),
        endDate,
        paymentMethod: input.paymentMethod,
        transactionId: input.transactionId,
      });
    } catch (err: any) {
      if (err?.code === "ER_DUP_ENTRY" || String(err?.message || "").includes("pro_sub_transaction_unique_idx")) {
        const dup = await tx
          .select({ endDate: proSubscriptions.endDate })
          .from(proSubscriptions)
          .where(eq(proSubscriptions.transactionId, input.transactionId))
          .limit(1);
        return { endDate: dup[0]?.endDate ?? new Date(), alreadyProcessed: true };
      }
      throw err;
    }

    const table = input.userType === "oauth" ? users : localUsers;
    await tx
      .update(table)
      .set({ plan: billingPlan.entitlement })
      .where(eq(table.id, input.userId));

    await tx
      .insert(userAnalytics)
      .values({
        userId: input.userId,
        userType: input.userType,
        event: billingPlan.entitlement === "ultra" ? "upgrade_to_ultra" : "upgrade_to_pro",
        metadata: { plan: input.plan, transactionId: input.transactionId },
      })
      .catch(() => {});

    return { endDate };
  });
}
```

---

### SEC-FIN-03: Indefinite Privilege Retention Post-Expiration (Missing Background Expiration Worker)

- **Severity:** **HIGH** (CWE-284: Improper Access Control / CWE-613: Insufficient Session Expiration)
- **Target Files:**
  - `api/context.ts` (Lines 61–74, 87–118)
  - `api/middleware.ts` (Lines 112–134)
  - `api/jobs/monthly-report-job.ts` (Only job currently in `api/jobs/`)

#### 1. Vulnerability Mechanics
- In `api/context.ts`, user sessions are resolved by reading `users.plan` or `localUsers.plan`. No check is performed against `proSubscriptions.endDate`.
- In `api/middleware.ts`, `proProcedure`, `proAiProcedure`, and `ultraProcedure` check `ctx.user.plan`.
- In `api/jobs/`, there is no scheduled background task to downgrade expired subscriptions.
- As a result, expiration is evaluated **solely** when `trpc.pro.myPlan` is executed.
- If a client continues using API endpoints directly (e.g. mobile apps, saved tokens, AI chatbot queries, export endpoints) without loading the `/pro` page, the user's `users.plan` remains `"pro"` / `"ultra"` indefinitely.

#### 2. Threat Scenario
A user whose 1-month Pro subscription expired 6 months ago continues making expensive Gemini 3.1 Pro calls via `chat.sendMessage` or generating automated PDF exports via `export.exportData` because their account table was never updated to `"free"`.

#### 3. Concrete Remediation Code
Create a background subscription expiry cron job in `api/jobs/subscription-expiry-job.ts`:
```typescript
import { db } from "../queries/connection";
import { proSubscriptions, users, localUsers } from "../../db/schema";
import { and, inArray, lt, eq } from "drizzle-orm";

export async function runSubscriptionExpiryJob(): Promise<number> {
  const now = new Date();
  const expiredSubs = await db
    .select()
    .from(proSubscriptions)
    .where(
      and(
        inArray(proSubscriptions.status, ["active", "cancelled"]),
        lt(proSubscriptions.endDate, now),
      ),
    );

  for (const sub of expiredSubs) {
    await db.transaction(async (tx) => {
      await tx
        .update(proSubscriptions)
        .set({ status: "expired" })
        .where(eq(proSubscriptions.id, sub.id));

      const table = sub.userType === "oauth" ? users : localUsers;
      await tx
        .update(table)
        .set({ plan: "free" })
        .where(eq(table.id, sub.userId));
    });
  }

  return expiredSubs.length;
}
```

---

### SEC-FIN-04: Unauthenticated Webhook Processing in Non-Production / Default-Env Instances

- **Severity:** **HIGH** (CWE-306: Missing Authentication for Critical Function)
- **Target Files:**
  - `api/boot.ts` (Lines 381–441)
  - `api/lib/env.ts` (Line 27)

#### 1. Vulnerability Mechanics
In `api/boot.ts:381-386`:
```typescript
const secret = env.PAYMOB_HMAC_SECRET;
if (env.NODE_ENV === "production" && !isPaymobWebhookVerificationConfigured()) {
  console.error("Paymob webhook rejected: PAYMOB_HMAC_SECRET is not configured");
  return c.json({ error: "Webhook verification is unavailable" }, 503);
}
if (secret) {
  // HMAC check
}
// Handle successful transaction
const obj = parsed.obj;
if (obj && obj.success === true && !obj.pending) {
  // Directly grants subscription
}
```

In `api/lib/env.ts:27`:
```typescript
NODE_ENV: z.enum(["development", "production", "test"]).default("development")
```

If a server is deployed without explicitly passing `NODE_ENV=production`, `env.NODE_ENV` defaults to `"development"`.
If `PAYMOB_HMAC_SECRET` is not set:
1. `env.NODE_ENV === "production"` is false, so the 503 rejection is bypassed.
2. `secret` is falsy, so the `if (secret)` HMAC verification block is skipped.
3. The request falls directly into the subscription grant block.
4. Anyone can send a forged POST request to `/api/webhooks/paymob` and upgrade any account to Ultra for free.

#### 2. Concrete Remediation Code
Enforce strict fail-closed verification on the webhook endpoint:
```diff
--- a/api/boot.ts
+++ b/api/boot.ts
@@ -381,9 +381,8 @@ app.post("/api/webhooks/paymob", async (c) => {
   const secret = env.PAYMOB_HMAC_SECRET;
-  if (env.NODE_ENV === "production" && !isPaymobWebhookVerificationConfigured()) {
+  if (!isPaymobWebhookVerificationConfigured()) {
     console.error("Paymob webhook rejected: PAYMOB_HMAC_SECRET is not configured");
     return c.json({ error: "Webhook verification is unavailable" }, 503);
   }
-  if (secret) {
   if (!hmacParam) {
     console.warn(
       "Paymob webhook verification failed: Missing hmac query parameter",
@@ -440,7 +439,6 @@ app.post("/api/webhooks/paymob", async (c) => {
     return c.json({ error: "Invalid signature" }, 401);
   }
-  }
```

---

### SEC-FIN-05: Missing Explicit Webhook Currency Guard (`EGP`)

- **Severity:** **MEDIUM** (CWE-20: Improper Input Validation / Multi-Currency Arbitrage)
- **Target Files:**
  - `api/boot.ts` (Lines 444–467)

#### 1. Vulnerability Mechanics
In `api/boot.ts:460-466`:
```typescript
if (userId && (userType === "oauth" || userType === "local") && isBillingPlan(plan)) {
  if (!hasExactPlanAmount(plan, obj.amount_cents)) {
    console.warn(
      `Paymob webhook: amount mismatch — expected ${expectedAmountCents} cents for ${plan}, got ${paidCents}. Rejecting.`,
    );
    return c.json({ error: "Amount mismatch" }, 400);
  }
```
While `hasExactPlanAmount` validates `obj.amount_cents === configuredPlan.amountCents`, it does not assert that `obj.currency === "EGP"`. If an integration or gateway profile supports multi-currency processing (e.g. USD, SAR, or currencies with lower unit values), paying `9900` in a cheaper currency would pass amount validation.

#### 2. Concrete Remediation Code
```diff
--- a/api/boot.ts
+++ b/api/boot.ts
@@ -460,6 +460,9 @@ app.post("/api/webhooks/paymob", async (c) => {
     if (userId && (userType === "oauth" || userType === "local") && isBillingPlan(plan)) {
+      if (obj.currency && obj.currency !== "EGP") {
+        return c.json({ error: "Invalid currency" }, 400);
+      }
       if (!hasExactPlanAmount(plan, obj.amount_cents)) {
           console.warn(
             `Paymob webhook: amount mismatch — expected ${expectedAmountCents} cents for ${plan}, got ${paidCents}. Rejecting.`,
```

---

### SEC-FIN-06: Subscription Duration Truncation on Renewal / Upgrade

- **Severity:** **MEDIUM** (CWE-840: Business Logic Errors / Premature Expiration)
- **Target Files:**
  - `api/lib/subscription-service.ts` (Lines 30–34)

#### 1. Vulnerability Mechanics
In `api/lib/subscription-service.ts:30-33`:
```typescript
const billingPlan = getBillingPlan(input.plan);
const endDate = new Date();
if (billingPlan.duration === "month") endDate.setMonth(endDate.getMonth() + 1);
else endDate.setFullYear(endDate.getFullYear() + 1);
```
`endDate` is always calculated from `new Date()` (the time of payment). If an active subscriber with 20 days remaining on their current cycle renews early, their new `endDate` is set to 30 days from now, losing the 20 unspent prepaid days.

#### 2. Concrete Remediation Code
```typescript
const latestActiveSub = await tx
  .select({ endDate: proSubscriptions.endDate })
  .from(proSubscriptions)
  .where(
    and(
      eq(proSubscriptions.userId, input.userId),
      eq(proSubscriptions.userType, input.userType),
      eq(proSubscriptions.status, "active"),
    ),
  )
  .orderBy(desc(proSubscriptions.endDate))
  .limit(1);

const baseDate =
  latestActiveSub.length > 0 && latestActiveSub[0].endDate > new Date()
    ? new Date(latestActiveSub[0].endDate)
    : new Date();

const endDate = new Date(baseDate);
if (billingPlan.duration === "month") endDate.setMonth(endDate.getMonth() + 1);
else endDate.setFullYear(endDate.getFullYear() + 1);
```

---

### SEC-FIN-07: Missing Numeric / Decimal Input Validation on Wallet Balances

- **Severity:** **LOW** (CWE-1284: Improper Input Validation / 500 Unhandled Exception)
- **Target Files:**
  - `api/wallet-router.ts` (Lines 53, 74)

#### 1. Vulnerability Mechanics
In `api/wallet-router.ts`:
- `createWallet`: `balance: z.string().optional()`
- `updateWallet`: `balance: z.string().optional()`
Passing non-numeric strings or extreme precision numbers to MySQL `decimal(12, 2)` causes unhandled database exceptions (`ER_TRUNCATED_WRONG_VALUE_FOR_FIELD`).

#### 2. Concrete Remediation Code
In `api/wallet-router.ts`:
```diff
--- a/api/wallet-router.ts
+++ b/api/wallet-router.ts
@@ -53,3 +53,3 @@ export const walletRouter = router({
-        balance: z.string().optional(),
+        balance: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
       }),
@@ -74,3 +74,3 @@ export const walletRouter = router({
-        balance: z.string().optional(),
+        balance: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
       }),
```

---

## Detailed Investigation on Specific Audit Inquiries

### 1. Paymob HMAC Signature & Timing Attack Resistance
- **Signature Calculation:**
  The 18 standard fields are extracted from `parsed.obj`, string-coerced, concatenated without delimiters, and hashed using `crypto.createHmac("sha512", secret)`.
- **Timing Safe Comparison:**
  `api/boot.ts:436` uses `timingSafeEqual(calculatedBuffer, receivedBuffer)` after checking buffer lengths. This is safe against byte-by-byte timing attacks on the hash comparison.
- **Order Dependency:**
  Paymob's HMAC concatenation requires strict alphabetical ordering of parameters. In `api/boot.ts:410-411`, `is_voided` and `is_refunded` were noted. Paymob specifications dictate `is_refunded` precedes `is_voided`.

### 2. Billing Simulation (`BILLING_SIMULATE`) Gating & Production Isolation
- In `api/pro-router.ts:110-116`, `upgrade` explicitly checks `if (env.NODE_ENV === "production") throw new TRPCError({ code: "FORBIDDEN" })`.
- An attacker cannot trigger `pro.upgrade` in production to bypass Paymob checkout.
- `BILLING_SIMULATE` is parsed once from `process.env` in `api/lib/env.ts` and cannot be toggled via HTTP headers, query parameters, or regular user requests.
- **Risk Identified:** If a production deployment omits `NODE_ENV=production` from the environment, `env.NODE_ENV` defaults to `"development"`. Under this misconfiguration, if `BILLING_SIMULATE="true"` is present, the simulation bypass becomes active on a publicly accessible instance.

### 3. Price Manipulation & Tampering
- Plan prices are not client-controlled. `api/pro-router.ts:81` accepts only `plan: z.enum(BILLING_PLAN_IDS)`.
- `api/lib/paymob.ts` retrieves the exact amount from `contracts/plans.ts` (Single Source of Truth) and submits it server-to-server to Paymob.
- In `api/boot.ts:461`, the webhook verifies `hasExactPlanAmount(plan, obj.amount_cents)`. Clients cannot modify prices during checkout.

---

## Summary Matrix of Findings & Recommendations

| Finding ID | Severity | Description | Fix Summary |
| :--- | :--- | :--- | :--- |
| **SEC-FIN-01** | **CRITICAL** | Cancelled subscriptions never expire in `myPlan` | Check `sub.status === 'active' \|\| sub.status === 'cancelled'` in `myPlan` |
| **SEC-FIN-02** | **HIGH** | Missing unique constraint on `proSubscriptions.transactionId` allows race condition | Add `uniqueIndex` on `transactionId` in `db/schema.ts` and wrap in transaction |
| **SEC-FIN-03** | **HIGH** | No background worker downgrades expired subscriptions | Implement `subscription-expiry-job.ts` cron worker |
| **SEC-FIN-04** | **HIGH** | Webhook verification bypassed when secret is unset in non-prod | Fail-closed: reject Paymob webhook if `!secret` in all environments |
| **SEC-FIN-05** | **MEDIUM** | Missing `obj.currency === 'EGP'` check in webhook | Add explicit currency validation guard |
| **SEC-FIN-06** | **MEDIUM** | Early subscription renewals truncate unspent days | Extend from `max(now, latestSub.endDate)` |
| **SEC-FIN-07** | **LOW** | Malformed balance strings cause 500 DB crash | Add regex validation `^\d+(\.\d{1,2})?$` in `walletRouter` |
