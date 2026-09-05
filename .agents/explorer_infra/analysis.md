# Deep Security Audit: Data Safety, Infrastructure, Rate Limiting & DoS Protections

**Target**: SmartSpend Platform  
**Auditor**: Data Safety, Infrastructure, Rate Limiting & DoS Explorer  
**Date**: 2026-08-28  
**Working Directory**: `e:/smartspend_V1_fixed/.agents/explorer_infra/`

---

## Executive Summary

An exhaustive security audit was conducted on SmartSpend's data safety layer, Drizzle ORM queries, input validation schemas (Zod), rate limiting architecture, real-time infrastructure (SSE, WebSockets, crons), security headers, CORS policies, and error handling mechanisms.

While the application demonstrates commendable security practices in several areas—such as universal parameterized Drizzle queries, explicit transaction isolation, distributed MySQL advisory locks for cron replicas, and HMAC-SHA512 verification for payment webhooks—several critical and high-severity architectural vulnerabilities were discovered in **Client IP resolution**, **Rate limiting bypass**, **Missing security headers**, **Unbounded JSON input schemas**, and **Real-time connection lifecycle handling**.

---

## Vulnerability Findings Matrix

| Ref ID | Vulnerability Title | Category | Severity | File Reference | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-INFRA-01** | Client-Controlled IP Spoofing via `X-Forwarded-For` Leftmost Element | Rate Limiting / Auth | **High** | `api/lib/get-client-ip.ts:21-25` | Confirmed |
| **SEC-INFRA-02** | Global Shared IP (`127.0.0.1`) Rate Limiting Denial of Service | Infrastructure / DoS | **High** | `api/lib/get-client-ip.ts:33-39` | Confirmed |
| **SEC-INFRA-03** | Total Absence of HTTP Security Headers (CSP, HSTS, X-Frame-Options, etc.) | Web Security / Headers | **High** | `api/boot.ts`, `api/server.ts` | Confirmed |
| **SEC-INFRA-04** | Unbounded Memory Leak in In-Memory Rate Limiting & SSE Maps | Infrastructure / Memory DoS | **Medium** | `api/boot.ts:318-335`, `api/services/otp-cache.ts:12-18` | Confirmed |
| **SEC-INFRA-05** | Unauthenticated & Un-rate-limited WebSocket Upgrade on `/api/voice/live` | Real-time / DoS / CSWSH | **Medium** | `api/server.ts:41-48`, `api/boot.ts:548-555` | Confirmed |
| **SEC-INFRA-06** | In-Process Memory Rate Limiters Multiplied in Multi-Replica Deployments | Architecture / Scalability | **Medium** | `api/middleware.ts:10-37`, `api/sms-router.ts:35` | Confirmed |
| **SEC-INFRA-07** | Overly Permissive Substring Origin Validation in Development CORS | CORS / Information Leak | **Medium** | `api/boot.ts:153-165, 181-193` | Confirmed |
| **SEC-INFRA-08** | Unbounded `z.any()` & `z.record()` Schemas in User Profiles & Admin Templates | Input Validation / DoS | **Medium** | `api/profile-router.ts:38-43`, `api/admin-router.ts:1723` | Confirmed |
| **SEC-INFRA-09** | Missing String Length & Numerical Upper Bounds on Router Inputs | Input Validation / DB Errors | **Low** | `api/sms-router.ts:193-208`, `api/wallet-router.ts:53`, `api/goals-router.ts:124` | Confirmed |
| **SEC-INFRA-10** | Missing tRPC `errorFormatter` & Raw Downstream Error Propagation | Error Handling / Information Leak | **Low** | `api/middleware.ts:5`, `api/lib/ai-gateway.ts:311` | Confirmed |
| **SEC-INFRA-11** | Unescaped Wildcard Characters in SQL `LIKE` Search Queries | Database Query Safety | **Low** | `api/expense-router.ts:643-647` | Confirmed |
| **SEC-INFRA-12** | Database Connection Pool Unbounded Queue Limit (`queueLimit: 0`) | Infrastructure / DoS | **Informational** | `api/queries/connection.ts:12` | Confirmed |

---

## Detailed Vulnerability Breakdown & Technical Analysis

### 1. SEC-INFRA-01: Client-Controlled IP Spoofing via `X-Forwarded-For` Leftmost Element
- **Severity**: High (CVSS 7.5)
- **OWASP**: A04:2021 – Insecure Design / A07:2021 – Identification and Authentication Failures
- **Location**: `api/lib/get-client-ip.ts`, Lines 20–25
- **Vulnerability Mechanics**:
  ```typescript
  // api/lib/get-client-ip.ts
  if (trustProxy) {
    const xff = getIncomingHeader(req, "x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    ...
  }
  ```
  When behind a standard reverse proxy (e.g. Nginx, Cloudflare, AWS ALB), the proxy appends the upstream client IP to the existing `X-Forwarded-For` header. If a client transmits `X-Forwarded-For: 1.1.1.1`, the proxy sends `X-Forwarded-For: 1.1.1.1, <real_client_ip>` to Hono. By selecting `xff.split(",")[0]`, `getClientIp` chooses the client-supplied spoofed IP instead of the trusted proxy's appended IP.
- **Threat Scenario**:
  An attacker attempting brute-force password cracking on `/api/trpc/localAuth.login` or spamming WhatsApp OTP generation via `/api/trpc/localAuth.generateVerificationCode` simply passes a randomized `X-Forwarded-For: <random-ip>` header on each request. The `strictPublicProcedure` rate limiter (`strict:${ctx.ip}`) creates a new bucket for every request, completely bypassing the 25 req / 15 min protection.
- **Remediation**:
  Extract the rightmost IP address from `X-Forwarded-For` or use verified Cloudflare header `cf-connecting-ip` / proxy socket address:
  ```typescript
  export function getClientIp(req: HonoRequest | Request): string {
    const trustProxy = env.TRUST_PROXY === "true";
    if (trustProxy) {
      const cfConnecting = getIncomingHeader(req, "cf-connecting-ip");
      if (cfConnecting) return cfConnecting.trim();

      const realIp = getIncomingHeader(req, "x-real-ip");
      if (realIp) return realIp.trim();

      const xff = getIncomingHeader(req, "x-forwarded-for");
      if (xff) {
        const ips = xff.split(",").map((s) => s.trim()).filter(Boolean);
        if (ips.length > 0) return ips[ips.length - 1]; // Use rightmost trusted proxy hop
      }
    }
    const rawReq = (req as any).raw || req;
    return rawReq.socket?.remoteAddress || rawReq.connection?.remoteAddress || "127.0.0.1";
  }
  ```

---

### 2. SEC-INFRA-02: Global Shared IP (`127.0.0.1`) Rate Limiting Denial of Service
- **Severity**: High (CVSS 7.2)
- **OWASP**: A04:2021 – Insecure Design / Availability
- **Location**: `api/lib/get-client-ip.ts`, Lines 33–40; `api/context.ts`, Line 123
- **Vulnerability Mechanics**:
  When `TRUST_PROXY` is not set or false (the default out-of-the-box setting), `getClientIp` tries `(req as any).raw.socket?.remoteAddress`. However, in standard Node.js `@hono/trpc-server` and Fetch API adapters, `req` is a standard web `Request` object where `req.socket` is `undefined`. Consequently, `getClientIp` returns literal `"127.0.0.1"` for **100% of all incoming requests**.
- **Threat Scenario**:
  Every user in production shares the exact same rate-limiting bucket `strict:127.0.0.1` and `pub:127.0.0.1`. A single user making 25 failed login attempts or rapid page navigations exhausts the quota for all users worldwide, locking out all legitimate users from authentication for 15 minutes.
- **Remediation**:
  Pass the underlying Node.js `IncomingMessage` or Hono context connection info into `createContext` so `getClientIp` can inspect the underlying TCP socket when proxies are not configured, and ensure proper proxy configuration guides in `.env.example`.

---

### 3. SEC-INFRA-03: Total Absence of HTTP Security Headers
- **Severity**: High (CVSS 7.1)
- **OWASP**: A05:2021 – Security Misconfiguration
- **Location**: `api/boot.ts`, `api/server.ts`
- **Vulnerability Mechanics**:
  Neither `api/boot.ts` nor `api/server.ts` configures HTTP security headers. Standard browser defenses are entirely missing from responses:
  - No `Content-Security-Policy` (CSP)
  - No `X-Frame-Options` or `frame-ancestors` (Clickjacking defense)
  - No `X-Content-Type-Options: nosniff` (MIME sniffing defense)
  - No `Strict-Transport-Security` (HSTS)
  - No `Referrer-Policy`
  - No `Permissions-Policy`
- **Threat Scenario**:
  An attacker embeds the SmartSpend web interface inside an invisible `<iframe>` on `https://attacker-site.com/prize`. By tricking an authenticated user into clicking on a deceptive overlay button, the user unknowingly performs state-changing financial mutations (Clickjacking).
- **Remediation**:
  Add `secureHeaders` middleware to `api/boot.ts`:
  ```typescript
  import { secureHeaders } from "hono/secure-headers";

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:", "wss:"],
        frameAncestors: ["'none'"],
      },
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      strictTransportSecurity: "max-age=31536000; includeSubDomains; preload",
      referrerPolicy: "strict-origin-when-cross-origin",
    }),
  );
  ```

---

### 4. SEC-INFRA-04: Unbounded Memory Leak in In-Memory Rate Limiting & SSE Maps
- **Severity**: Medium (CVSS 6.5)
- **OWASP**: A04:2021 – Denial of Service
- **Location**: `api/boot.ts`, Lines 318–335; `api/services/otp-cache.ts`, Lines 12, 15, 18
- **Vulnerability Mechanics**:
  In `api/boot.ts`:
  ```typescript
  const sseRateLimit = new Map<string, { count: number; resetAt: number }>();
  // Inside /api/sse/otp:
  if (!sseEntry || sseEntry.resetAt <= now) {
    sseRateLimit.set(clientIp, { count: 1, resetAt: now + 5 * 60 * 1000 });
  } else {
    sseEntry.count++;
  }
  ```
  `sseRateLimit` has NO cleanup routine, TTL expiration, or max-entries bound. Similarly, `otpCache`, `rateLimitCache`, and `blocklist` in `api/services/otp-cache.ts` store entries indefinitely without automated purge.
- **Threat Scenario**:
  An attacker generates millions of distinct phone numbers or connects from a botnet of IPs to `/api/sse/otp` and OTP endpoints. The Maps continuously accumulate entries in V8 heap memory until the Node.js process runs out of memory (OOM Crash).
- **Remediation**:
  Add an auto-cleanup interval to `sseRateLimit` and `otp-cache.ts`, or cap Map size using LRU semantics.

---

### 5. SEC-INFRA-05: Unauthenticated & Un-rate-limited WebSocket Upgrade on `/api/voice/live`
- **Severity**: Medium (CVSS 6.3)
- **OWASP**: A07:2021 – Identification and Authentication Failures / DoS
- **Location**: `api/server.ts`, Lines 41–48; `api/boot.ts`, Lines 548–555
- **Vulnerability Mechanics**:
  The HTTP Upgrade handler immediately upgrades the TCP connection:
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
  - Origin header is never checked during the handshake upgrade (allowing Cross-Site WebSocket Hijacking).
  - No connection rate limit or connection concurrency cap exists.
  - Authentication occurs *after* socket upgrade and full memory allocation.
- **Remediation**:
  Validate `request.headers.origin` against `allowedOrigins` and reject unauthenticated / excess upgrade requests before calling `wss.handleUpgrade`.

---

### 6. SEC-INFRA-06: In-Process Memory Rate Limiters Multiplied Across Multi-Replica Deployments
- **Severity**: Medium (CVSS 5.8)
- **OWASP**: A04:2021 – Insecure Design
- **Location**: `api/middleware.ts:10-37`, `api/sms-router.ts:35`
- **Vulnerability Mechanics**:
  Rate limits for `publicIpLimiter` (400 req/min), `strictPublicIpLimiter` (25 req/15 min), `authedProcedure` (100 req/min), `aiProcedure` (100 req/min), and `smsApp` are held in process-local `Map` instances. If SmartSpend is deployed across $N$ instances (e.g. 5 containers behind a load balancer), an attacker effectively receives $5 \times 25 = 125$ attempts on sensitive auth endpoints.
- **Remediation**:
  Use Redis `INCR` + `EXPIRE` via `api/lib/redis-client.ts` for distributed rate limiting with fallback to in-memory limiter when Redis is unconfigured.

---

### 7. SEC-INFRA-07: Overly Permissive Substring Origin Matching in Development CORS
- **Severity**: Medium (CVSS 5.4)
- **OWASP**: A01:2021 – Broken Access Control / CORS Misconfiguration
- **Location**: `api/boot.ts`, Lines 153–165, 181–193
- **Vulnerability Mechanics**:
  ```typescript
  if (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.endsWith(".loca.lt") ||
    ...
  ) {
    return origin;
  }
  ```
  `origin.includes("localhost")` evaluates to `true` for domains like `https://attacker-localhost.com` or `http://localhost.malicious.io`. With `credentials: true`, any such origin can make authenticated requests with cookies attached in non-production environments.
- **Remediation**:
  Replace `.includes(...)` with strict regex matching `^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$`.

---

### 8. SEC-INFRA-08: Unbounded `z.any()` & `z.record()` in User Profiles & Admin Templates
- **Severity**: Medium (CVSS 5.3)
- **OWASP**: A04:2021 – Insecure Design / Validation
- **Location**: `api/profile-router.ts`, Lines 38–43, 206; `api/admin-router.ts`, Line 1723
- **Vulnerability Mechanics**:
  `smartProfilePatchSchema` defines:
  ```typescript
  basicInfo: z.record(z.string(), z.any()).optional(),
  financialInfo: z.record(z.string(), z.any()).optional(),
  lifestyleInfo: z.record(z.string(), z.any()).optional(),
  onboardingAnswers: z.record(z.string(), z.any()).optional(),
  aiInferredAttributes: z.record(z.string(), z.any()).optional(),
  preferences: z.record(z.string(), z.any()).optional(),
  ```
  No validation is performed on keys, depth, or value sizes. An authenticated user can submit multi-megabyte JSON payloads that are written directly into `user_profiles` longtext columns.
- **Remediation**:
  Define explicit schemas for each profile section and enforce max length bounds on individual keys and values.

---

### 9. SEC-INFRA-09: Missing String Length & Numerical Upper Bounds on Router Inputs
- **Severity**: Low (CVSS 4.3)
- **OWASP**: A04:2021 – Insecure Design
- **Location**:
  - `api/sms-router.ts:193-208`: `message`, `sender`, `timestamp` lack maximum length bounds before insertion into `rawSmsEvents`.
  - `api/wallet-router.ts:53, 74`: `balance: z.string().optional()` lacks regex/numerical validation.
  - `api/goals-router.ts:124`: `targetAmount: z.number().positive().optional()` lacks upper bound `.max(ExpenseInputLimits.amountMax)`.
  - `api/budget-router.ts:111`: `monthlyLimit: z.number().positive()` lacks upper bound.
- **Remediation**:
  Apply centralized bounds from `contracts/constants.ts` across all input fields.

---

### 10. SEC-INFRA-10: Missing tRPC `errorFormatter` & Raw Downstream Error Propagation
- **Severity**: Low (CVSS 3.7)
- **OWASP**: A05:2021 – Security Misconfiguration
- **Location**: `api/middleware.ts:5`, `api/lib/ai-gateway.ts:311, 334`
- **Vulnerability Mechanics**:
  `initTRPC.context<Context>().create()` does not declare a custom `errorFormatter`. If an unhandled downstream error (e.g. raw database syntax error or provider API failure) is thrown, internal server details can leak to the client response data.
- **Remediation**:
  Configure `errorFormatter` to sanitize internal error shapes in production.

---

### 11. SEC-INFRA-11: Unescaped Wildcard Characters in SQL `LIKE` Search Queries
- **Severity**: Low (CVSS 3.1)
- **OWASP**: A03:2021 – Injection / Performance
- **Location**: `api/expense-router.ts`, Lines 643–647
- **Vulnerability Mechanics**:
  `const q = \`%${input.query}%\`` is parameterized by Drizzle (no SQL injection), but wildcards `%` and `_` inside `input.query` are not escaped. A user searching for `%` or `____` forces broad table scans.
- **Remediation**:
  Escape `%` and `_` characters in search queries: `input.query.replace(/[%_]/g, "\\$&")`.

---

### 12. SEC-INFRA-12: Database Pool Unbounded Queue Limit (`queueLimit: 0`)
- **Severity**: Informational
- **Location**: `api/queries/connection.ts:12`
- **Vulnerability Mechanics**:
  `queueLimit: 0` allows an infinite number of queries to queue up if database connections are exhausted under heavy traffic.
- **Remediation**:
  Set a reasonable finite queue limit (e.g. `queueLimit: 1000`) with connection timeout handlers.

---

## Positive Security Practices Identified

1. **Strict Parameterized Queries**: All Drizzle ORM queries across all 22 routers use parameterized SQL expressions (`eq`, `and`, `sql\`...\`` interpolation). No `sql.raw()` concatenation with user input was identified.
2. **Multi-Tenant Scoping**: All user data queries consistently enforce dual scoping: `eq(table.userId, ctx.user.id)` and `eq(table.userType, ctx.user.type)`.
3. **Comprehensive Cascading Purge**: `purgeUserData` in `api/services/user-purge-service.ts` encapsulates complete transactional deletion across all 35+ user-scoped tables.
4. **Advisory Lock for Distributed Cron Jobs**: `withScheduledJobLock` in `api/services/scheduler-lock.ts` utilizes MySQL `GET_LOCK(?, 0)` to guarantee single-replica execution across clustered deployments.
5. **Constant-Time Verification**: Paymob HMAC signature validation in `api/boot.ts` utilizes `crypto.timingSafeEqual` to prevent timing attacks.
6. **Financial Anonymizer**: `api/lib/anonymizer.ts` redacts credit card numbers, phone numbers, and Egyptian P2P transaction identifiers before AI model transit.
