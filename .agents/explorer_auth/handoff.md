# Handoff Report: Auth & Identity Security Audit

**Working Directory**: `e:/smartspend_V1_fixed/.agents/explorer_auth/`  
**Report Artifact**: `e:/smartspend_V1_fixed/.agents/explorer_auth/analysis.md`  
**Date**: 2026-08-28  

---

## 1. Observation

Direct code examination revealed the following concrete observations:

1. **OAuth Callback State Bypass (`api/auth-router.ts:74-85`)**:
   - `auth.googleCallback` is exposed as a public tRPC mutation (`strictPublicProcedure`).
   - Input schema is `z.object({ code: z.string(), redirectUri: z.string().optional() })`.
   - The procedure contains zero state parameter acceptance or state cookie validation, allowing direct execution via `/api/trpc/auth.googleCallback`.
2. **Insecure PRNG for Verification OTPs (`api/local-auth-router.ts:179`)**:
   - OTP code generation uses `Math.random()`:
     `const code = "SS-" + Math.floor(100000 + Math.random() * 900000).toString();`
   - Similarly, referral codes in `api/local-auth-utils.ts:105` and `api/auth-router.ts:94` use `Math.random().toString(36)`.
3. **Unvalidated Host Header in Dynamic OAuth Redirect (`api/boot.ts:253-268`)**:
   - `const host = c.req.header("x-forwarded-host") || c.req.header("host");`
   - `host` is interpolated directly into `dynamicRedirectUri` without validation against `allowedOrigins` or `env.APP_URL`.
4. **Permissive `JWT_SECRET` Length Validation (`api/lib/env.ts:15`)**:
   - `JWT_SECRET: z.string().min(1)` allows 1-character HMAC-SHA256 signing keys.
5. **Missing Upper Bound on Password Inputs (`api/local-auth-router.ts:61, 224`)**:
   - `password: z.string().min(6)` lacks `.max()`, allowing arbitrarily large payloads to be processed by bcrypt (cost factor 12).
6. **Unauthenticated Phone Mutation (`api/profile-router.ts:336-365`)**:
   - `updateUserInfo` allows local users to mutate `phone` without password re-entry or OTP verification.
7. **Public SSE Phone Leakage (`api/services/whatsapp-service.ts:271-275` & `api/boot.ts:321-365`)**:
   - Mismatched OTP verification emits `{ status: "fraud", expected: ..., actual: senderPhone }` over the public `/api/sse/otp` endpoint.

---

## 2. Logic Chain

1. **Observation 1 → Vulnerability SS-AUTH-01**: While `boot.ts` enforces OAuth state matching on `GET /api/auth/google/callback`, exposing `auth.googleCallback` over tRPC without state verification allows direct HTTP POST requests to bypass the CSRF guard entirely, enabling OAuth Login CSRF.
2. **Observation 2 → Vulnerability SS-AUTH-02**: V8's `Math.random()` (XorShift128+) is non-cryptographic. An attacker observing a small sequence of outputs can reconstruct internal state and compute future OTP codes, bypassing WhatsApp verification.
3. **Observation 3 → Vulnerability SS-AUTH-03**: Unfiltered `Host` header interpolation into redirect URIs and session cookies creates Host Header Injection and open redirect risks.
4. **Observation 4 → Vulnerability SS-AUTH-04**: `JWT_SECRET` of length 1 allows weak secrets susceptible to offline HS256 dictionary cracking.
5. **Observation 5 → Vulnerability SS-AUTH-05**: Bcrypt cost factor 12 without password length caps allows CPU exhaustion DoS via oversized password payloads.
6. **Observation 6 → Vulnerability SS-AUTH-06**: Mutating primary phone credentials without verification allows session hijackers to lock out legitimate users.

---

## 3. Caveats

- In-memory OTP caching (`otpCache`) was analyzed for a single process; under multi-replica clustering without Redis session affinity, OTP state will be segregated per-process.
- Google OAuth rejection behavior on Google's domain mitigates arbitrary redirection if Google Cloud Console restricts redirect URIs to strict URIs.

---

## 4. Conclusion

The core cryptographic architecture (bcrypt-12, WebAuthn FIDO2 signatures, DB session table validation, timing-safe equality) provides a strong foundation. However, 2 High-severity issues (OAuth state bypass over tRPC, insecure `Math.random()` OTP generation) and 4 Medium-severity issues (Host header injection, weak JWT secret constraint, bcrypt DoS vulnerability, unverified phone mutation) must be remediated to achieve complete authentication hardening.

---

## 5. Verification Method

1. **Typecheck & Lint Validation**:
   ```bash
   npm run check
   npm run lint
   ```
2. **Unit & Auth Route Testing**:
   ```bash
   npm test api/middleware.test.ts
   npm test api/lib/session-validation.test.ts
   ```
3. **Static Inspection of Critical Auth Files**:
   - Inspect `api/auth-router.ts` lines 74-133
   - Inspect `api/local-auth-router.ts` lines 170-192
   - Inspect `api/boot.ts` lines 251-307
   - Inspect `api/profile-router.ts` lines 336-365
