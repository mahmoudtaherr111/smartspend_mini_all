## 2026-08-28T14:20:54Z
You are the Financial, Payments & Webhooks Security Explorer for the SmartSpend platform security audit.

Your working directory is: e:/smartspend_V1_fixed/.agents/explorer_billing/
Original Request path: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md

Your mission:
Conduct an exhaustive, code-level security audit of the Financial, Billing, and Webhook systems in SmartSpend.

Key Areas to Inspect:
1. Paymob Webhook Security in `api/boot.ts` and `api/billing-router.ts`:
   - HMAC signature calculation and validation:
     - Exact HMAC formula/keys used
     - Is comparison done with `crypto.timingSafeEqual` or standard string comparison (`===`) vulnerable to timing attacks?
     - Are raw request body bytes used or parsed JSON fields (order dependency / serialization tampering)?
   - Webhook replay attack protection (idempotency keys, transaction ID deduplication in database)
2. Billing Simulation & Environment Flags:
   - `BILLING_SIMULATE` logic in `api/billing-router.ts` and `api/lib/env.ts`
   - Can an attacker bypass payment in production by triggering simulated checkout or passing simulation parameters?
   - Is `BILLING_SIMULATE` strictly gated on `NODE_ENV !== 'production'` or can it be toggled via request/config?
3. Financial State Consistency & Race Conditions:
   - Subscription upgrades/downgrades (`pro`, `ultra`, `free`) in `api/billing-router.ts`
   - Balance calculations, transaction reconciliation, wallet updates
   - Concurrency risks: race conditions on duplicate checkout requests, double crediting, balance overdraft
4. Price Manipulation & Tampering:
   - Can a client tamper with plan prices, currencies, transaction amounts, or duration?
