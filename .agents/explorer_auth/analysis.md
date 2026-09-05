# Exhaustive Security Audit Report: Authentication & Identity Management Architecture

**Platform**: SmartSpend AI Behavioral Financial Platform  
**Target Codebase**: `e:/smartspend_V1_fixed`  
**Auditor**: Auth & Identity Security Explorer  
**Date**: 2026-08-28  
**Classification**: High-Confidence Defensive Security Audit  

---

## 1. Executive Summary & Security Posture

SmartSpend AI utilizes a hybrid authentication architecture designed for the Egyptian fintech market. The identity system operates under a dual-user paradigm:
1. **Google OAuth Users (`users` table)**: Authenticated via OAuth 2.0 PKCE/State flow, receiving a signed JWT stored in an `HttpOnly` session cookie (`google_session`) and mirrored in a database `sessions` table.
2. **Local Users (`localUsers` table)**: Authenticated via Egyptian phone numbers (`010/011/012/015`), bcrypt-hashed passwords (cost factor 12), zero-polling WhatsApp OTP verification, and FIDO2/WebAuthn Passkeys (`userCredentials`), receiving a signed JWT transmitted via `Authorization: Bearer <token>`.

### Key Strengths Observed
- **DB-Backed Session Validation**: Both OAuth cookies and Bearer tokens are validated against the live `sessions` table via `validateActiveSessionToken` (`api/lib/session-validation.ts`), ensuring immediate token invalidation upon logout or revocation.
- **Robust Password Hashing**: Passwords use `bcryptjs` with 12 salt rounds, offering strong resistance against offline brute-force attacks.
- **WebAuthn Implementation**: Passkey implementation via `@simplewebauthn/server` properly validates cryptographic signatures, challenge nonces, RP ID (`hostname`), and anti-replay counters.
- **Constant-Time Timing Safety**: Cryptographic comparisons (OAuth state matching, Paymob HMAC signatures) utilize Node.js `timingSafeEqual` (`api/boot.ts:245, 436`).

### Critical Vulnerabilities & High-Risk Areas Discovered
- **Bypassed State CSRF on tRPC OAuth Callback**: `auth.googleCallback` is exposed as an open tRPC mutation without state parameter or correlation cookie verification (`api/auth-router.ts:74-133`), allowing direct OAuth Login CSRF exploitation.
- **Insecure PRNG (`Math.random()`) in OTP Generation**: WhatsApp OTP verification codes are generated using `Math.random()` (`api/local-auth-router.ts:179`), enabling deterministic PRNG state prediction and OTP hijacking.
- **Host Header Injection in OAuth Dynamic Redirect**: `/api/auth/google/start` builds redirect URIs directly from untrusted `Host` / `X-Forwarded-Host` headers without allowlist filtering (`api/boot.ts:253-268`).
- **Low-Entropy `JWT_SECRET` Validation**: Zod schema in `api/lib/env.ts:15` allows 1-character JWT secrets (`z.string().min(1)`), exposing HMAC-SHA256 signatures to offline dictionary attacks.
- **Missing Password Upper-Bound & DoS Vector**: Password input validation lacks maximum length limits (`api/local-auth-router.ts:61`), allowing CPU exhaustion attacks against the bcrypt hashing worker.
- **Unverified Phone Number Changes**: `profile.updateUserInfo` permits instant phone number changes without password verification or OTP confirmation (`api/profile-router.ts:336-365`).
- **Absence of Password Reset & Rotation Flows**: Local users have no self-service password reset or authenticated password change procedures.

---

## 2. Comprehensive Architecture & Data Flow Analysis

### 2.1 Dual-Identity Data Model
SmartSpend maintains two distinct user tables with independent auto-incrementing primary keys:
- `users`: `id` (int PK), `unionId` (Google sub/ID), `email`, `name`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `referredByType`.
- `localUsers`: `id` (int PK), `phone` (unique), `password` (bcrypt), `name`, `email`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `referredByType`.

To prevent cross-table ID collisions (e.g. `users.id = 1` vs `localUsers.id = 1`), downstream tables implement polymorphic foreign keys:
`userId: int` + `userType: varchar(50)` (`"oauth" | "local"`).

Tables following this polymorphic pattern include:
`expenses`, `sessions`, `userWallets`, `userProfiles`, `userCredentials`, `authChallenges`, `proSubscriptions`, `monthlyReports`, `supportTickets`, `webhookTokens`, `rawSmsEvents`, `userContacts`, `financialGoals`, `userBudgets`, `userAnalytics`, `aiSummaries`, `chatConversations`.

### 2.2 Context Resolution Flow (`api/context.ts`)

```
Client Request
      │
      ▼
1. Check "google_session" cookie
      ├─► Found: validateActiveSessionToken(token, "oauth")
      │     └─► Valid: Query `users` table by `activeSession.userId` ──► ctx.user (type="oauth")
      │
      └─► Not Found / Invalid
            │
            ▼
2. Check "Authorization: Bearer <token>" header
      ├─► Found: validateActiveSessionToken(token)
      │     ├─► userType == "oauth": Query `users` table ──► ctx.user (type="oauth")
      │     └─► userType == "local": Query `localUsers` table ──► ctx.user (type="local")
      │
      └─► Not Found / Invalid ──► ctx.user = null
```

---

## 3. Vulnerability Breakdown & Threat Models

---

### Finding SS-AUTH-01 (High): Bypassed OAuth State CSRF in Public tRPC Callback Mutation

- **File & Line Numbers**: `api/auth-router.ts:74-133`
- **OWASP Category**: A01:2021 – Broken Access Control / A07:2021 – Identification and Authentication Failures
- **CVSS v3.1 Score**: **7.5** (High) `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N`

#### Vulnerability Mechanics
In `api/boot.ts:251-307`, a secure OAuth flow is defined where `GET /api/auth/google/start` sets an `HttpOnly` correlation cookie `oauth_state`, and `GET /api/auth/google/callback` validates this cookie against `c.req.query("state")` via `timingSafeEqual`.
However, the underlying handler is implemented as a public tRPC mutation:
```ts
// api/auth-router.ts:74-80
googleCallback: strictPublicProcedure
  .input(z.object({ code: z.string(), redirectUri: z.string().optional() }))
  .mutation(async ({ input, ctx }) => {
    const tokens = await getGoogleTokens(input.code, input.redirectUri);
    if (!tokens.access_token) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "فشل في المصادقة مع Google" });
    }
```
`auth.googleCallback` accepts only `code` and optional `redirectUri`. It does not accept `state` and does not verify any state cookie. Because `/api/trpc/auth.googleCallback` is exposed directly over HTTP POST, an attacker can bypass the Hono GET callback route entirely.

#### Theoretical Threat Scenario (Defensive Model)
1. Attacker starts an OAuth authorization flow on Google using their own account and intercepts the authorization `code`.
2. Attacker induces a victim to trigger an API call to `/api/trpc/auth.googleCallback` with the attacker's authorization code.
3. The victim's session is updated to the attacker's Google account (OAuth Login CSRF).
4. Any financial records, transactions, or confidential logs created by the victim are linked to the attacker's account, allowing the attacker to harvest sensitive behavioral data.

#### Impact & Blast Radius
OAuth session fixation, cross-account transaction leakage, identity spoofing.

#### Remediation Diff
```diff
--- a/api/auth-router.ts
+++ b/api/auth-router.ts
@@ -72,8 +72,18 @@ export const authRouter = router({
   ),
 
   googleCallback: strictPublicProcedure
-    .input(z.object({ code: z.string(), redirectUri: z.string().optional() }))
+    .input(z.object({ code: z.string(), state: z.string().optional(), redirectUri: z.string().optional() }))
     .mutation(async ({ input, ctx }) => {
+      // If invoked directly via tRPC, ensure state validation is enforced
+      let cookieHeader = "header" in ctx.req && typeof ctx.req.header === "function"
+        ? ctx.req.header("cookie")
+        : (ctx.req as Request).headers?.get("cookie");
+      const match = cookieHeader?.match(/(?:^|;\s*)oauth_state=([^;]*)/);
+      const stateCookie = match ? decodeURIComponent(match[1]) : undefined;
+      if (!stateCookie || !input.state || stateCookie !== input.state) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired OAuth state parameter" });
+      }
+
       const tokens = await getGoogleTokens(input.code, input.redirectUri);
```

---

### Finding SS-AUTH-02 (High): Insecure PRNG (`Math.random()`) Used for OTP Verification Codes

- **File & Line Numbers**: `api/local-auth-router.ts:179`, `api/local-auth-utils.ts:105`, `api/auth-router.ts:94`
- **OWASP Category**: A02:2021 – Cryptographic Failures
- **CVSS v3.1 Score**: **7.4** (High) `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N`

#### Vulnerability Mechanics
In `api/local-auth-router.ts:179`:
```ts
const code = "SS-" + Math.floor(100000 + Math.random() * 900000).toString();
```
`Math.random()` in Node.js (V8) uses the XorShift128+ algorithm. XorShift128+ is non-cryptographic and maintains only 128 bits of state. By observing a small sequence of outputs from the same Node process (e.g. by generating several referral codes or OTPs), the internal state can be computed in under 1 second using standard Z3 solvers.

#### Theoretical Threat Scenario (Defensive Model)
1. Attacker calls `localAuth.generateVerificationCode` for multiple test phone numbers.
2. Attacker reconstructs the V8 PRNG seed/state.
3. Attacker requests an OTP code for a victim's phone number.
4. Attacker predicts the exact 6-digit OTP code (`SS-XXXXXX`) and submits it to the WhatsApp verification bot or registration endpoint before the victim receives it.

#### Impact & Blast Radius
Bypass of WhatsApp phone verification, unauthorized account creation under arbitrary phone numbers.

#### Remediation Diff
```diff
--- a/api/local-auth-router.ts
+++ b/api/local-auth-router.ts
@@ -37,6 +37,7 @@ import {
   cleanPhoneNumber,
   getSessionMetadata,
 } from "./local-auth-utils";
+import { randomInt } from "crypto";
 import { getIncomingHeader } from "./lib/get-client-ip";
 import { whatsappService } from "./services/whatsapp-service";
 import { otpCache, checkRateLimit } from "./services/otp-cache";
@@ -176,7 +177,7 @@ export const localAuthRouter = router({
         throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: rateLimit.message });
       }
 
-      const code = "SS-" + Math.floor(100000 + Math.random() * 900000).toString();
+      const code = "SS-" + randomInt(100000, 1000000).toString();
       const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes standard
```

---

### Finding SS-AUTH-03 (Medium): Host Header Injection in Dynamic OAuth Redirect Computation

- **File & Line Numbers**: `api/boot.ts:253-268`
- **OWASP Category**: A05:2021 – Security Misconfiguration
- **CVSS v3.1 Score**: **5.3** (Medium) `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:H/A:N`

#### Vulnerability Mechanics
In `api/boot.ts:253-268`:
```ts
app.get("/api/auth/google/start", (c) => {
  const state = createOAuthState();
  const host = c.req.header("x-forwarded-host") || c.req.header("host");
  const proto = c.req.header("x-forwarded-proto") || (host?.includes("ngrok") ? "https" : "http");
  const dynamicRedirectUri = host ? `${proto}://${host}/api/auth/google/callback` : undefined;
```
The application dynamically trusts incoming `Host` and `X-Forwarded-Host` headers without validating them against `allowedOrigins` or configured domains.

#### Theoretical Threat Scenario (Defensive Model)
If reverse proxy host sanitization is misconfigured, an attacker can craft a request with `X-Forwarded-Host: attacker-controlled-domain.com`. The server sets `oauth_redirect_uri` in the user's cookies. If broad wildcards or reverse proxies are utilized, this can redirect the authentication token or authorization code to an external domain.

#### Remediation Diff
```diff
--- a/api/boot.ts
+++ b/api/boot.ts
@@ -250,8 +250,11 @@ function stateMatches(expected: string | undefined, received: string | undefined
 // present on the callback. This prevents OAuth login-CSRF account swapping.
 app.get("/api/auth/google/start", (c) => {
   const state = createOAuthState();
-  const host = c.req.header("x-forwarded-host") || c.req.header("host");
-  const proto = c.req.header("x-forwarded-proto") || (host?.includes("ngrok") ? "https" : "http");
+  const rawHost = c.req.header("x-forwarded-host") || c.req.header("host") || "";
+  const isValidHost = allowedOrigins.some((origin) => origin.includes(rawHost)) || 
+    (env.NODE_ENV === "development" && (rawHost.includes("localhost") || rawHost.endsWith(".ngrok-free.dev")));
+  const host = isValidHost ? rawHost : new URL(env.APP_URL).host;
+  const proto = c.req.header("x-forwarded-proto") || (host.includes("ngrok") || env.NODE_ENV === "production" ? "https" : "http");
   const dynamicRedirectUri = host ? `${proto}://${host}/api/auth/google/callback` : undefined;
```

---

### Finding SS-AUTH-04 (Medium): Permissive `JWT_SECRET` Validation in Environment Schema

- **File & Line Numbers**: `api/lib/env.ts:15`
- **OWASP Category**: A02:2021 – Cryptographic Failures
- **CVSS v3.1 Score**: **6.5** (Medium) `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N`

#### Vulnerability Mechanics
In `api/lib/env.ts:15`:
```ts
JWT_SECRET: z.string().min(1),
```
A 1-character secret is accepted. HMAC-SHA256 requires 256 bits (32 bytes) of cryptographic key material. Weak or short secrets (e.g. `JWT_SECRET="secret"`) can be brute-forced offline at gigahashes/sec on commodity hardware.

#### Impact & Blast Radius
If a weak secret is deployed, an attacker can forge arbitrary JWT payloads with `{ userId: 1, userType: "local" }` or `{ role: "admin" }`.

#### Remediation Diff
```diff
--- a/api/lib/env.ts
+++ b/api/lib/env.ts
@@ -12,7 +12,7 @@ const envSchema = z.object({
     .default("http://localhost:3000/api/auth/google/callback"),
 
   // JWT
-  JWT_SECRET: z.string().min(1),
+  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters for HS256 security"),
 
   // AI
```

---

### Finding SS-AUTH-05 (Medium): Password Input Lacks Upper-Bound Length Limit (Bcrypt DoS Vector)

- **File & Line Numbers**: `api/local-auth-router.ts:61, 224`
- **OWASP Category**: A04:2021 – Insecure Design / A07:2021 – Identification and Authentication Failures
- **CVSS v3.1 Score**: **5.3** (Medium) `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`

#### Vulnerability Mechanics
In `api/local-auth-router.ts:61, 224`:
```ts
password: z.string().min(6, "الباسورد لازم يكون 6 أحرف على الأقل")
```
No `.max()` constraint is enforced. Bcrypt processes strings up to 72 bytes. Passing megabyte-sized password strings forces the Node.js event loop to process extensive string hashing in `bcrypt.hash` (cost factor 12), causing high CPU consumption and service latency degradation. Furthermore, minimum length 6 is below standard NIST SP 800-63B guidelines (minimum 8).

#### Remediation Diff
```diff
--- a/api/local-auth-router.ts
+++ b/api/local-auth-router.ts
@@ -58,7 +58,7 @@ export const localAuthRouter = router({
         name: z.string().min(2, "الاسم لازم يكون حرفين على الأقل").max(100),
         phone: z.string().min(11, "رقم التليفون لازم يكون 11 رقم").max(11),
         email: z.string().email("الإيميل مش صحيح").optional().or(z.literal("")),
-        password: z.string().min(6, "الباسورد لازم يكون 6 أحرف على الأقل"),
+        password: z.string().min(8, "الباسورد لازم يكون 8 أحرف على الأقل").max(72, "الباسورد لا يتجاوز 72 حرف"),
         referralCode: z.string().optional(),
       }),
     )
@@ -221,7 +221,7 @@ export const localAuthRouter = router({
   login: strictPublicProcedure
     .input(
       z.object({
-        phone: z.string(),
-        password: z.string(),
+        phone: z.string().min(11).max(11),
+        password: z.string().min(1).max(72),
       }),
     )
```

---

### Finding SS-AUTH-06 (Medium): Unrestricted Phone Number Mutation Without Authentication or Session Invalidation

- **File & Line Numbers**: `api/profile-router.ts:336-365`
- **OWASP Category**: A07:2021 – Identification and Authentication Failures
- **CVSS v3.1 Score**: **6.5** (Medium) `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:H`

#### Vulnerability Mechanics
In `api/profile-router.ts:336-365`:
```ts
updateUserInfo: authedProcedure
  .input(z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    avatar: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    ...
    if (input.phone) updates.phone = input.phone;
    await db.update(localUsers).set(updates).where(eq(localUsers.id, ctx.user.id));
```
- Any authenticated local user can modify their phone number without providing their existing password or verifying ownership of the new number via OTP.
- No normalization or validation (`validatePhone`) is applied to `input.phone`.
- Active sessions in `sessions` table are not invalidated upon credential mutation.

#### Theoretical Threat Scenario (Defensive Model)
If an attacker obtains an active session token (via physical device access or XSS), they call `profile.updateUserInfo({ phone: "010XXXXXXXX" })`. The account phone is instantly changed, preventing the legitimate owner from logging back in or receiving verification messages.

#### Remediation Diff
```diff
--- a/api/profile-router.ts
+++ b/api/profile-router.ts
@@ -337,7 +337,6 @@ export const profileRouter = router({
   updateUserInfo: authedProcedure
     .input(
       z.object({
         name: z.string().min(2).optional(),
-        phone: z.string().optional(),
         avatar: z.string().optional(),
       }),
     )
```
*(Phone number changes must be moved to a dedicated, OTP-verified endpoint with password re-entry and session revocation).*

---

### Finding SS-AUTH-07 (Low): Third-Party Phone Number Leakage via Public SSE Endpoint

- **File & Line Numbers**: `api/boot.ts:321-365`, `api/services/whatsapp-service.ts:271-275`
- **OWASP Category**: A01:2021 – Broken Access Control / Information Disclosure
- **CVSS v3.1 Score**: **4.3** (Low) `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`

#### Vulnerability Mechanics
When a verification mismatch occurs:
```ts
// api/services/whatsapp-service.ts:271-275
otpEvents.emit(`otp:${record.phone}`, { 
  status: "fraud", 
  expected: record.phone, 
  actual: senderPhone 
});
```
The unauthenticated public SSE stream at `/api/sse/otp?phone=<target>` broadcasts the `actual` sender's raw phone number to anyone connected to that stream.

#### Remediation Diff
```diff
--- a/api/services/whatsapp-service.ts
+++ b/api/services/whatsapp-service.ts
@@ -270,9 +270,7 @@ class WhatsAppService {
                   recordWrongAttempt(senderPhone);
 
                   otpEvents.emit(`otp:${record.phone}`, { 
-                    status: "fraud", 
-                    expected: record.phone, 
-                    actual: senderPhone 
+                    status: "failed",
+                    message: "Verification failed. Phone mismatch."
                   });
```

---

### Finding SS-AUTH-08 (Low): Dual Identity Session Resolution Precedence

- **File & Line Numbers**: `api/context.ts:56-83`
- **OWASP Category**: A07:2021 – Identification and Authentication Failures
- **CVSS v3.1 Score**: **3.7** (Low) `CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N`

#### Vulnerability Mechanics
In `api/context.ts`, cookie validation (`google_session`) runs prior to `Authorization: Bearer <token>` evaluation. If a client explicitly transmits a Bearer token (representing a `local` user) in a browser that retains an active `google_session` cookie, the request executes under the `oauth` user context. Standard RFC 6750 dictates that explicit authorization headers should take precedence over ambient cookies.

---

## 4. Verification & Testing Matrix

| Vulnerability ID | Target Module | Verification Method | Expected Result |
| :--- | :--- | :--- | :--- |
| **SS-AUTH-01** | `api/auth-router.ts` | Invoke tRPC mutation `auth.googleCallback` without state | Throws validation error if fixed; executes if vulnerable |
| **SS-AUTH-02** | `api/local-auth-router.ts` | Inspect PRNG implementation via unit test | Must use `crypto.randomInt` |
| **SS-AUTH-03** | `api/boot.ts` | Send `GET /api/auth/google/start` with `X-Forwarded-Host: evil.com` | Redirect URI must remain locked to `env.APP_URL` |
| **SS-AUTH-04** | `api/lib/env.ts` | Test parsing with `JWT_SECRET="short"` | Zod validation must throw error |
| **SS-AUTH-05** | `api/local-auth-router.ts` | Send registration request with 100KB password | Must be rejected by Zod schema `.max(72)` |
| **SS-AUTH-06** | `api/profile-router.ts` | Attempt `updateUserInfo` with new phone | Schema should reject phone mutation or require verification |
| **SS-AUTH-07** | `api/boot.ts` | Connect to `/api/sse/otp` during failed verification | `actual` sender phone must not be broadcast |

---

## 5. Security Posture Summary & Next Steps

SmartSpend's underlying cryptographic foundations (bcrypt-12, WebAuthn FIDO2, database session revocation, timing-safe equality) are sound. The critical focus areas for immediate hardening are:
1. **Enforcing CSRF state verification across all OAuth entry points**.
2. **Replacing non-cryptographic `Math.random()` with `crypto.randomInt`**.
3. **Restricting Host header reflection in dynamic OAuth redirects**.
4. **Hardening Zod input validation constraints (JWT secrets, password length limits, phone mutations)**.
5. **Implementing standardized password reset and rotation procedures**.
