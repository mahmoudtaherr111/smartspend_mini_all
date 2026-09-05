# Handoff Report — Phase 2 Architectural Hardening & Infrastructure Security

## 1. Observation

Direct observations from codebase inspection, line references, and tool executions:

1. **OAuth State CSRF in tRPC Callback**:
   - In `api/auth-router.ts:74-76`:
     ```typescript
     googleCallback: strictPublicProcedure
       .input(z.object({ code: z.string(), redirectUri: z.string().optional() }))
       .mutation(async ({ input, ctx }) => { ... })
     ```
     `googleCallback` is exposed as a public tRPC mutation on `/api/trpc/auth.googleCallback`. It accepts only `code` and `redirectUri`, without accepting `state` or reading/verifying the `oauth_state` cookie.
   - In `api/boot.ts:251-270`, `/api/auth/google/start` creates `state = createOAuthState()` and sets `oauth_state` HttpOnly cookie. `/api/auth/google/callback` (lines 273–307) checks `stateMatches(stateCookie, c.req.query("state"))`, but an external client can bypass this endpoint entirely by posting directly to `/api/trpc/auth.googleCallback`.
   - In `api/boot.ts:253-255`, `dynamicRedirectUri` is constructed directly from unvalidated `c.req.header("x-forwarded-host") || c.req.header("host")`.

2. **Client IP Spoofing & Global Lockout in `get-client-ip.ts`**:
   - In `api/lib/get-client-ip.ts:20-25`:
     ```typescript
     if (trustProxy) {
       const xff = getIncomingHeader(req, "x-forwarded-for");
       if (xff) {
         const first = xff.split(",")[0]?.trim();
         if (first) return first;
       }
       const realIp = getIncomingHeader(req, "x-real-ip");
       if (realIp) return realIp.trim();
       const cfConnecting = getIncomingHeader(req, "cf-connecting-ip");
       if (cfConnecting) return cfConnecting.trim();
     }
     ```
     Leftmost element of `X-Forwarded-For` is extracted first, trusting user-supplied headers over proxy-appended IPs. `cf-connecting-ip` is evaluated last.
   - In `api/lib/get-client-ip.ts:33-40`, when `TRUST_PROXY !== "true"` or `req.socket` is undefined (standard Fetch `Request`), IP defaults to `"127.0.0.1"`.
   - In `api/middleware.ts:20-26`, `strictPublicProcedure` invokes `strictPublicIpLimiter.hit("strict:127.0.0.1")`. When 25 requests are made, all users sharing `"127.0.0.1"` are blocked globally.

3. **HTTP Security Headers & CORS**:
   - In `api/boot.ts` and `api/server.ts`, zero HTTP security headers (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`) are set.
   - In `api/boot.ts:153-154`:
     ```typescript
     if (origin.includes("localhost") || origin.includes("127.0.0.1") || ...) return origin;
     ```
     Loose substring matching permits origins such as `https://localhost.attacker.com` with `credentials: true`.
   - In `api/boot.ts:167`, non-matching origins in production return `allowedOrigins[0]` rather than `undefined` / `null`.

4. **TOCTOU Subscription Race Condition & Duration Truncation**:
   - In `db/schema.ts:444-463`, `proSubscriptions` table has only `index("pro_sub_user_idx").on(t.userId, t.userType)`. No unique index or constraint exists on `transactionId`.
   - In `api/lib/subscription-service.ts:21-28`:
     ```typescript
     const existing = await db
       .select({ id: proSubscriptions.id, endDate: proSubscriptions.endDate })
       .from(proSubscriptions)
       .where(eq(proSubscriptions.transactionId, input.transactionId))
       .limit(1);
     if (existing.length > 0) return { endDate: existing[0].endDate ?? new Date(), alreadyProcessed: true };
     ```
     `SELECT` before `INSERT` without unique constraint allows concurrent webhook retries to pass check simultaneously and insert duplicate rows.
   - In `api/lib/subscription-service.ts:31-33`:
     ```typescript
     const endDate = new Date();
     if (billingPlan.duration === "month") endDate.setMonth(endDate.getMonth() + 1);
     ```
     Early renewal always begins from `new Date()` (now), truncating any active remaining days on the user's prior subscription.
   - `grantProSubscription` operations (`db.insert`, `db.update`, `db.insert`) are not wrapped in a database transaction (`db.transaction()`).

5. **AI Rate Limiting & Prompt Injection Guards**:
   - In `api/middleware.ts:33-36, 79-94`: `aiProcedure` applies a flat rate limit of 100 req/min (`AI_MAX_REQUESTS = 100`) for all users regardless of plan (`free`, `pro`, `ultra`).
   - In `api/services/ai-kernel/index.ts:1102-1114`, `buildActiveMessages` concatenates `request.message` directly into `user` content alongside internal tokens (`intent=`, `recipe=`, `Facts:`, `Artifacts:`) without XML/structural boundary encapsulation.
   - In `api/lib/smart-pipeline.ts:434`, `buildGlobalVerifierPrompt` interpolates raw text directly into `النص الأصلي:\n${originalText}` without boundary encapsulation.

6. **Monorepo Build Status**:
   - `npm run check` failed with syntax errors in `api/goals-router.ts` (lines 69–190) and `api/sms-router.ts` (lines 321–396). The Phase 2 files are syntactically intact.

---

## 2. Logic Chain

1. **OAuth CSRF Logic**:
   - *From Observation 1*: Because `auth.googleCallback` is exposed on `/api/trpc/auth.googleCallback` as a public tRPC mutation without verifying `state` or correlation cookies, any client can initiate token exchange directly.
   - *Inference*: The anti-CSRF check in `api/boot.ts` is ineffective against direct API clients or CSRF exploits targeting the tRPC route.

2. **IP Spoofing & DoS Logic**:
   - *From Observation 2*: When proxies append client IPs to `X-Forwarded-For`, index 0 contains user-provided data.
   - *Inference*: Attackers can rotate `X-Forwarded-For: <random_ip>` to bypass the 25-request rate limiter on login/register.
   - *From Observation 2*: When `TRUST_PROXY !== "true"`, all requests resolve to `"127.0.0.1"`.
   - *Inference*: 25 failed attempts lock out all users on the instance from registering or logging in.

3. **HTTP Headers & CORS Logic**:
   - *From Observation 3*: Without CSP, HSTS, X-Frame-Options, and nosniff headers, the application is susceptible to Clickjacking (CWE-1021) and MIME sniffing.
   - *From Observation 3*: `origin.includes("localhost")` evaluates to `true` for `https://localhost.attacker.com`, allowing cross-origin credentialed requests in development.

4. **TOCTOU Subscription Race Condition Logic**:
   - *From Observation 4*: Because `transactionId` lacks a `UNIQUE` constraint and `SELECT` precedes `INSERT` without a transaction lock, parallel webhook delivery races into duplicate active subscriptions and duplicate analytics events.
   - *From Observation 4*: Computing `endDate` from `new Date()` discards unexpired subscription days on active renewals.

5. **AI Rate Limiting & Prompt Injection Logic**:
   - *From Observation 5*: A 100 req/min limit on `free` users permits excessive token drainage on expensive AI providers.
   - *From Observation 5*: Flat prompt string interpolation allows malicious user text containing `Facts: [...]` or control tokens to confuse LLMs regarding verified data vs. untrusted user input.

---

## 3. Caveats

- **Active Database Migrations**: Adding a `uniqueIndex` to `pro_subscriptions.transaction_id` requires running `npm run db:generate` or ensuring null/empty `transaction_id` values in legacy records are handled appropriately.
- **Goals Router & SMS Router Syntax Errors**: Monorepo typecheck is currently failing due to unrelated syntax issues in `api/goals-router.ts` and `api/sms-router.ts` being worked on by parallel tasks.
- **Read-Only Scope**: This investigation did not alter any application source files.

---

## 4. Conclusion

Phase 2 architectural and infrastructure security surfaces contain 5 high-impact vulnerabilities that can be remediated with targeted patches:
1. **OAuth State Verification**: Enforce state validation in `auth.googleCallback` and validate host headers in `boot.ts`.
2. **Client IP Extraction**: Prioritize `cf-connecting-ip`, use rightmost `X-Forwarded-For` hop, and eliminate global `"127.0.0.1"` lockout.
3. **HTTP Security Headers & CORS**: Register Hono `secureHeaders` (CSP, HSTS, X-Frame-Options: DENY, nosniff) and enforce strict regex origin matching.
4. **Subscription Integrity**: Add `uniqueIndex` on `pro_subscriptions.transaction_id`, wrap `grantProSubscription` in `db.transaction()`, and preserve remaining subscription time on early renewals.
5. **AI Protection**: Implement tiered AI rate limits in `middleware.ts` (`free: 15`, `pro: 60`, `ultra: 120`) and enforce XML delimiter encapsulation in `ai-kernel/index.ts` and `smart-pipeline.ts`.

---

## 5. Verification Method

To independently verify these findings and subsequent fixes:

1. **OAuth CSRF**:
   - Inspect `api/auth-router.ts:74-76`. Confirm whether `state` is present in `input` schema and whether cookie comparison is performed.
2. **Client IP Extraction**:
   - Inspect `api/lib/get-client-ip.ts:20-31`. Verify header evaluation order and `X-Forwarded-For` split index.
3. **HTTP Security Headers & CORS**:
   - Inspect `api/boot.ts:140-198`. Verify presence of `secureHeaders` middleware and strict regex in `cors`.
4. **Subscription TOCTOU & Uniqueness**:
   - Inspect `db/schema.ts:460-463` for `uniqueIndex("pro_sub_transaction_unique_idx").on(t.transactionId)`.
   - Inspect `api/lib/subscription-service.ts:14-63` for `db.transaction()` and `existing.endDate` duration preservation.
5. **AI Rate Limiting & Delimiters**:
   - Inspect `api/middleware.ts:79-94` for tiered plan checks (`ctx.user.plan`).
   - Inspect `api/services/ai-kernel/index.ts:1102-1114` for `<user_query>` / `<verified_facts>` XML boundary tags.
6. **Automated Verification**:
   - Fix pending syntax errors in `api/goals-router.ts` / `api/sms-router.ts` and run `npm run check`.
   - Run `npx vitest run api/lib/get-client-ip.test.ts api/lib/rate-limit.test.ts api/middleware.test.ts`.
