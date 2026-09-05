# Handoff Report — Phase 2 Architectural Hardening Survey

**Agent**: `explorer_p1` (Survey Specialist)  
**Recipient**: `parent` (Orchestrator: `35a6b3ae-9426-4ef9-afa2-ac347e84b92e`)  
**Scope**: Survey and vulnerability mapping of all 5 Phase 2 Architectural Hardening targets  
**Handoff Type**: Hard (Investigation Complete)  
**Analysis Reference**: `e:\smartspend_V1_fixed\.agents\explorer_p1\analysis.md`

---

## 1. Observation

Direct code inspection of the 5 Phase 2 architectural hardening targets revealed:

1. **OAuth CSRF & State Verification (`api/auth-router.ts`, `api/boot.ts`)**:
   - `api/auth-router.ts:74-76`: `googleCallback: strictPublicProcedure.input(z.object({ code: z.string(), redirectUri: z.string().optional() }))` — does not take `state` or validate against `oauth_state` cookie.
   - `api/boot.ts:253-255`: Uses `c.req.header("x-forwarded-host") || c.req.header("host")` directly without allowlist filtering to build `dynamicRedirectUri`.
   - `api/auth-router.ts:94`: Generates referral code via `Math.random().toString(36)`.
2. **Client IP & Rate Limiting Hardening (`api/lib/get-client-ip.ts`, `api/middleware.ts`)**:
   - `api/lib/get-client-ip.ts:23`: `const first = xff.split(",")[0]?.trim()` — extracts the leftmost client-controlled IP header element.
   - `api/lib/get-client-ip.ts:38`: Falls back to `"127.0.0.1"` when `req.socket` is undefined in Web standard requests when `TRUST_PROXY !== "true"`.
   - `api/middleware.ts:20-26`: `strictPublicProcedure` rate limiter maps to `strict:${ctx.ip}`, causing shared 127.0.0.1 global lockout.
3. **HTTP Security Headers & CORS (`api/boot.ts`, `api/server.ts`)**:
   - Neither `api/boot.ts` nor `api/server.ts` registers CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, or `Referrer-Policy`.
   - `api/boot.ts:153-154, 181-182`: `origin.includes("localhost") || origin.includes("127.0.0.1")` performs substring matching, accepting `https://attacker-localhost.com`.
4. **Subscription Concurrency & TOCTOU Race Condition (`api/lib/subscription-service.ts`, `db/schema.ts`)**:
   - `db/schema.ts:462`: `proSubscriptions` table defines `index("pro_sub_user_idx")` but lacks `uniqueIndex` on `transactionId`.
   - `api/lib/subscription-service.ts:21-28`: Multi-step `SELECT` then `INSERT` is not wrapped in `db.transaction`.
   - `api/lib/subscription-service.ts:31-33`: Always calculates `endDate = new Date() + duration`, truncating remaining days on early renewal.
5. **AI Rate Limiting & Prompt Injection Guards (`api/middleware.ts`, `api/services/ai-kernel/index.ts`)**:
   - `api/middleware.ts:36, 79-94`: `aiProcedure` enforces a flat `AI_MAX_REQUESTS = 100` req/min for all users, including `free` tier.
   - `api/services/ai-kernel/index.ts:1101-1114`: `buildActiveMessages` concatenates raw `request.message` without XML tags or boundary delimiter isolation.

---

## 2. Logic Chain

1. In `api/auth-router.ts`, exposing `googleCallback` via tRPC without checking `state` allows an attacker with an authorization code to invoke the mutation directly, circumventing the Hono route check and fixing the victim's session to the attacker's account.
2. In `api/lib/get-client-ip.ts`, picking `xff.split(",")[0]` trusts the first hop provided by the client instead of the proxy-verified IP, enabling IP spoofing and rate limit evasion. Falling back to `"127.0.0.1"` for all fetch requests locks out all users when `strictPublicIpLimiter` triggers.
3. In `api/boot.ts`, lack of security headers exposes the web app to clickjacking and MIME attacks. Substring origin checking (`origin.includes("localhost")`) allows malicious third-party origins to read credentialed responses in development.
4. In `api/lib/subscription-service.ts` and `db/schema.ts`, absence of a unique constraint on `transactionId` combined with non-transactional execution allows concurrent webhook deliveries to insert duplicate active subscriptions. Computing `endDate` from `new Date()` erases pre-existing paid subscription time.
5. In `api/middleware.ts` and `api/services/ai-kernel/index.ts`, flat 100 req/min limits on Free accounts expose upstream LLM APIs to quota exhaustion. Un-delimited user message string concatenation enables prompt injection where user input can override system instructions or falsify financial facts.

---

## 3. Caveats

- **Network Proxies in Production**: Cloudflare and Nginx configurations vary by deployment. `TRUST_PROXY="true"` must be set in environments behind reverse proxies; the code must prioritize `CF-Connecting-IP` and `X-Real-IP`.
- **Backward Compatibility**: To prevent breaking existing mobile/OAuth clients that might call `auth.googleCallback` without `state`, `state` should be validated when present and required on web clients.
- **Database Migrations**: Adding `uniqueIndex` to `pro_subscriptions.transaction_id` requires running `npm run db:push` or migration generation in development/staging.

---

## 4. Conclusion

All 5 Phase 2 P1 target areas have clear, localized vulnerabilities that can be remediated with 100% backward compatibility:
- Target 1: Add state checking to `googleCallback`, whitelist dynamic redirect hosts, and use cryptographic random for referrals.
- Target 2: Correct header precedence (`CF-Connecting-IP` > `X-Real-IP` > rightmost XFF), validate IP regex, and prevent loopback lockouts.
- Target 3: Add `secureHeaders` middleware and replace CORS substring matching with strict hostname validation.
- Target 4: Add `uniqueIndex` on `proSubscriptions.transactionId`, wrap `grantProSubscription` in a transaction, and extend existing `endDate` on early renewal.
- Target 5: Implement plan-aware rate limiting (`free`: 15, `pro`: 45, `ultra`: 100 req/min) in `aiProcedure` and isolate user inputs with `<user_query>` XML boundaries in AI prompt construction.

---

## 5. Verification Method

To verify the investigation and subsequent implementation:
1. **TypeScript Compilation**: `npm run check` (monorepo strict typecheck).
2. **Existing Test Suite**: `npm run test` (84 test files across monorepo).
3. **Target Unit Test Verification**:
   - `api/lib/get-client-ip.test.ts`
   - `api/middleware.test.ts`
   - `api/lib/billing-plans.test.ts`
   - `api/services/ai-kernel/index.test.ts`
4. **Invalidation Conditions**: If `npm run check` fails with type errors or any existing unit test fails, the changes must be adjusted.
