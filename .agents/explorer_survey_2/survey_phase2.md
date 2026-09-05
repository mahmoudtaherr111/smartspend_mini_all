# Phase 2 Architectural Hardening & Infrastructure Security Survey

**Date**: August 29, 2026  
**Auditor**: Teamwork Explorer (Phase 2 Architectural Hardening & Infrastructure Security)  
**Target Codebase**: `e:/smartspend_V1_fixed`  
**Referenced Documents**: `SECURITY_AUDIT_REPORT.md`, `contracts/plans.ts`, `docs/05-AUTH_AND_SECURITY.md`

---

## 1. Executive Summary

This report delivers a thorough security and architectural investigation of the **Phase 2 Hardening & Infrastructure Security** requirements for the SmartSpend AI platform. We audited all relevant backend entry points, middleware, routers, database schemas, and AI pipelines:
1. **OAuth CSRF & State Verification** (`api/auth-router.ts`, `api/boot.ts`)
2. **Client IP Extraction & Rate Limiting** (`api/lib/get-client-ip.ts`, `api/middleware.ts`, `api/context.ts`)
3. **HTTP Security Headers & CORS Lockdown** (`api/boot.ts`, `api/server.ts`)
4. **TOCTOU Subscription Race Conditions & Durations** (`api/lib/subscription-service.ts`, `db/schema.ts`)
5. **AI Rate Limiting & Adversarial Prompt Isolation** (`api/middleware.ts`, `api/services/ai-kernel/index.ts`, `api/lib/smart-pipeline.ts`)

---

## 2. Item-by-Item Detailed Findings

### 2.1 OAuth CSRF & State Verification
- **Target Files**: `api/auth-router.ts` (Lines 65–133), `api/boot.ts` (Lines 230–307)
- **Current Architecture**:
  - Hono endpoint `/api/auth/google/start` in `api/boot.ts` correctly generates a 32-byte cryptographic random state (`createOAuthState()` using `crypto.randomBytes`) and stores it in an `HttpOnly; SameSite=Lax` cookie `oauth_state` scoped to `Path=/api/auth/google`.
  - Hono callback `/api/auth/google/callback` reads `oauth_state` from the incoming request cookie and performs constant-time comparison against `c.req.query("state")` via `stateMatches()` using `crypto.timingSafeEqual`.
- **Identified Flaws**:
  1. **Direct tRPC Mutation Bypass**: In `api/auth-router.ts:74-133`, `googleCallback` is defined as a public `strictPublicProcedure` accepting `{ code: z.string(), redirectUri: z.string().optional() }`. It does NOT accept a `state` parameter and does NOT inspect or validate the `oauth_state` cookie on `ctx.req`. An attacker can initiate OAuth token exchange and session creation by submitting a captured or attacker-controlled authorization code directly to `/api/trpc/auth.googleCallback`, bypassing all CSRF protections implemented in `boot.ts`.
  2. **Host Header Injection in Dynamic Redirect**: In `api/boot.ts:253-255`, `/api/auth/google/start` calculates `dynamicRedirectUri` using unvalidated `x-forwarded-host` / `host` headers without checking against `allowedOrigins` or `env.APP_URL`.
- **Remediation Strategy**:
  - Update `googleCallback` in `api/auth-router.ts` to accept `state: z.string().optional()` and enforce `stateMatches(readCookie(ctx.req, "oauth_state"), input.state)`.
  - Enforce host validation against `allowedOrigins` before constructing `dynamicRedirectUri`.

---

### 2.2 Client IP & Rate Limiting Hardening
- **Target Files**: `api/lib/get-client-ip.ts` (Lines 1–41), `api/middleware.ts` (Lines 9–27), `api/context.ts` (Line 210)
- **Current Architecture**:
  - `getClientIp` unifies header reads between Hono and Fetch API requests.
  - When `TRUST_PROXY === "true"`, it inspects `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip`.
- **Identified Flaws**:
  1. **Client-Controlled IP Spoofing via Leftmost Header Element**: `api/lib/get-client-ip.ts:23` uses `xff.split(",")[0]?.trim()`. In standard reverse proxy configurations (e.g. AWS ALB, Nginx), client-supplied `X-Forwarded-For` headers are prepended, with the true proxy-added IP appended at the end. Taking index 0 allows attackers to spoof arbitrary client IPs by sending `X-Forwarded-For: <spoofed_ip>`, completely bypassing `strictPublicIpLimiter` (25 req/15min) on login, registration, and OTP endpoints.
  2. **Suboptimal Header Precedence**: `cf-connecting-ip` is evaluated after `x-forwarded-for` and `x-real-ip`. If a client behind Cloudflare sends a spoofed `X-Forwarded-For` header, the spoofed header overrides Cloudflare's verified `cf-connecting-ip`.
  3. **Global Shared `127.0.0.1` Rate-Limit Lockout**: When `TRUST_PROXY !== "true"`, `req.socket` is undefined for standard Fetch `Request` objects, causing `getClientIp` to return `"127.0.0.1"` for all callers. A single user exhausting 25 login attempts locks out all users globally on that server instance.
- **Remediation Strategy**:
  - Prioritize `cf-connecting-ip` first, then `x-real-ip`.
  - For `x-forwarded-for`, take the rightmost trusted IP entry (`ips[ips.length - 1]`) when behind a trusted proxy.
  - Add safeguards to prevent global lockout on loopback addresses.

---

### 2.3 HTTP Security Headers & CORS Lockdown
- **Target Files**: `api/boot.ts` (Lines 140–198), `api/server.ts` (Lines 1–53)
- **Current Architecture**:
  - `cors` and `csrf` middleware from `hono` are mounted in `api/boot.ts`.
- **Identified Flaws**:
  1. **Complete Absence of HTTP Security Headers**: Neither `api/boot.ts` nor `api/server.ts` sets standard security headers. Responses lack:
     - `Content-Security-Policy` (CSP)
     - `Strict-Transport-Security` (HSTS)
     - `X-Frame-Options` (Clickjacking protection)
     - `X-Content-Type-Options: nosniff` (MIME confusion protection)
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Permissions-Policy`
  2. **Overly Permissive Substring Origin Matching in Development CORS**:
     In `api/boot.ts:153-154`:
     ```typescript
     if (origin.includes("localhost") || origin.includes("127.0.0.1") || ...)
     ```
     This matches attacker origins like `https://localhost.attacker.com` or `https://attacker-127.0.0.1.com` with `credentials: true`.
  3. **CORS Production Fallback**: In `api/boot.ts:167`, unlisted origins return `allowedOrigins[0]` rather than rejecting or returning `undefined`, causing Hono to return `Access-Control-Allow-Origin` headers for arbitrary origins.
- **Remediation Strategy**:
  - Register Hono's `secureHeaders` middleware with strict CSP directives, HSTS (`maxAge: 31536000`), `X-Frame-Options: "DENY"`, and `X-Content-Type-Options: "nosniff"`.
  - Tighten development CORS origin matching using strict regex (`/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/`).
  - Return `undefined` or `null` for unallowed origins in production CORS.

---

### 2.4 Duplicate Subscription TOCTOU Race Condition & Early Renewal Duration
- **Target Files**: `db/schema.ts` (Lines 444–463), `api/lib/subscription-service.ts` (Lines 1–64)
- **Current Architecture**:
  - `grantProSubscription` processes billing upgrades and inserts active subscription records into `proSubscriptions`.
- **Identified Flaws**:
  1. **Missing Unique Constraint on `transactionId`**: In `db/schema.ts:462`, `proSubscriptions` has only `index("pro_sub_user_idx").on(t.userId, t.userType)`. There is no `uniqueIndex` on `transactionId`.
  2. **TOCTOU Race Condition in Webhook Processing**: `api/lib/subscription-service.ts:21-28` checks `db.select().from(proSubscriptions).where(eq(proSubscriptions.transactionId, input.transactionId))` prior to inserting. Under concurrent webhook delivery (e.g. Paymob automated retries or network bursts), two threads pass the check simultaneously and insert duplicate records.
  3. **Non-Transactional State Updates**: `grantProSubscription` updates `proSubscriptions`, `users`/`localUsers`, and `userAnalytics` in separate uncoordinated queries without `db.transaction()`.
  4. **Subscription Duration Truncation on Early Renewal**: In `api/lib/subscription-service.ts:31-33`, `endDate` is calculated from `new Date()` instead of extending from the existing active subscription's `endDate`, penalizing users who renew before expiration.
- **Remediation Strategy**:
  - Add `uniqueIndex("pro_sub_transaction_unique_idx").on(t.transactionId)` to `proSubscriptions` in `db/schema.ts`.
  - Wrap all operations in `grantProSubscription` inside `db.transaction()` and catch duplicate entry errors (`ER_DUP_ENTRY`).
  - Extend `endDate` from `existing.endDate` if the current subscription is still active and in the future.

---

### 2.5 AI Rate Limiting & Prompt Injection Guards
- **Target Files**: `api/middleware.ts` (Lines 33–36, 79–94), `api/services/ai-kernel/index.ts` (Lines 1064–1115), `api/lib/smart-pipeline.ts` (Lines 428–446)
- **Current Architecture**:
  - `aiProcedure` in `api/middleware.ts` enforces an in-memory rate limit using `aiRateLimitMap`.
  - `buildActiveMessages` in `ai-kernel/index.ts` constructs prompt payloads for deepseek/gemini.
- **Identified Flaws**:
  1. **Flat / Plan-Blind AI Rate Limiting**: `AI_MAX_REQUESTS = 100` req/min is applied identically across `free`, `pro`, `ultra`, and `admin` tiers. Free users can consume up to 100 expensive LLM requests per minute, creating a severe Denial-of-Wallet vulnerability.
  2. **Adversarial Delimiter Bleed & Prompt Injection**:
     In `api/services/ai-kernel/index.ts:1102-1114`:
     ```typescript
     content: [
       `سؤال: ${request.message}`,
       `intent=${intent.kind} recipe=${recipe}`,
       history ? `سياق: ${history}` : "",
       `Facts: ${factsJson || "[]"}`,
       artifacts.length ? `Artifacts: ${artifactBriefs(artifacts)}` : "",
       "اكتب الرد النهائي.",
     ].filter(Boolean).join("\n")
     ```
     Untrusted user input `request.message` is concatenated directly into the same text block as internal control tokens (`intent=`, `recipe=`, `Facts:`, `Artifacts:`). An attacker can craft inputs mimicking `Facts: [...]` or overriding system instructions.
  3. **Unencapsulated Text in Smart Pipeline**: In `api/lib/smart-pipeline.ts:434`, `buildGlobalVerifierPrompt` interpolates raw text directly (`النص الأصلي:\n${originalText}`) without XML/structural boundary tags.
- **Remediation Strategy**:
  - Update `api/middleware.ts` to implement tiered AI rate limits based on `ctx.user.plan`:
    - `free`: 15 requests / min
    - `pro`: 60 requests / min
    - `ultra`: 120 requests / min
    - `admin`: 300 requests / min
  - Implement XML/structural boundary delimiters (`<user_query>${message}</user_query>`, `<verified_facts>${factsJson}</verified_facts>`) in `ai-kernel` and `smart-pipeline`.
  - Add explicit system instructions enforcing that text within user query tags is untrusted and cannot override system directives or verified facts.

---

## 3. Monorepo Build & Test Assessment

- **TypeScript Typecheck (`npm run check`)**:
  - Current status: Type check revealed syntax errors in `api/goals-router.ts` (lines 69–190) and `api/sms-router.ts` (lines 321–396) from recent edits.
  - Phase 2 files (`api/auth-router.ts`, `api/boot.ts`, `api/lib/get-client-ip.ts`, `api/middleware.ts`, `api/lib/subscription-service.ts`, `api/services/ai-kernel/index.ts`) are syntactically intact.
- **Vitest Unit Tests**:
  - Existing test `api/lib/get-client-ip.test.ts` asserts the vulnerable behavior (using the first element of `X-Forwarded-For`). This test will need updating when the rightmost IP fix is implemented.
  - Rate limiting tests in `api/middleware.test.ts` and `api/lib/rate-limit.test.ts` verify the in-memory bucket mechanics.

---

## 4. Priority Remediation Matrix for Implementers

| Priority | Item | Target Files | Nature of Fix |
| :--- | :--- | :--- | :--- |
| **P0** | OAuth State CSRF in tRPC Mutation | `api/auth-router.ts` | Add state parameter validation & cookie verification |
| **P0** | TOCTOU Subscription Race Condition | `db/schema.ts`, `api/lib/subscription-service.ts` | Add unique index on `transaction_id`, use `db.transaction()` |
| **P1** | Client IP Spoofing & Global Lockout | `api/lib/get-client-ip.ts` | Rightmost XFF hop, prioritize `cf-connecting-ip`, safe fallback |
| **P1** | Missing HTTP Security Headers & CORS | `api/boot.ts`, `api/server.ts` | Mount `secureHeaders`, restrict dev CORS regex |
| **P1** | Plan-Aware AI Rate Limits & Delimiters | `api/middleware.ts`, `api/services/ai-kernel/` | Tiered plan limits (15/60/120), XML boundary isolation |
