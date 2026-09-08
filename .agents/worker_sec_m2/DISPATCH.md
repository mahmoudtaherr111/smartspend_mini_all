## 2026-09-08T05:12:16Z

You are Worker M2 for the SmartSpend AI enterprise-grade security remediation project.

Your Identity & Working Directory:
- Role: Security Implementation Worker (Milestone M2: R3 & R7)
- Working Directory: e:/smartspend_V1_fixed/.agents/worker_sec_m2/
- Project Root: e:/smartspend_V1_fixed
- Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md (MANDATORY: READ THIS FIRST!)
- Project Scope: e:/smartspend_V1_fixed/.agents/PROJECT.md
- Survey Report to read:
  - e:/smartspend_V1_fixed/.agents/explorer_sec_r2_r3_r7/report.md and handoff.md
- Test Oracles:
  - `tests/security/r3-turnstile-defense.test.ts`
  - `tests/security/r7-security-headers.test.ts`
- Rules: Follow AGENTS.md in project root. Note Gotcha #3: `api/lib/env.ts` validates env at boot time.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Exclusive File Ownership:
- `api/lib/env.ts`
- `api/services/turnstile-service.ts`
- `api/local-auth-router.ts`
- `api/boot.ts`
- `api/server.ts`

Your Tasks:
1. R3 (Cloudflare Turnstile Bot & OTP Pumping Defense):
   - In `api/lib/env.ts`, add `TURNSTILE_SECRET_KEY: z.string().optional()` to `envSchema`.
   - Create `api/services/turnstile-service.ts`:
     - Implement `verifyTurnstileToken(token?: string, remoteIp?: string): Promise<{ success: boolean; errorCodes?: string[] }>`.
     - Implement Cloudflare test keys:
       - `1x0000000000000000000000000000000AA`: always passes (`success: true`)
       - `2x0000000000000000000000000000000AA`: always fails (`success: false`, `errorCodes: ["invalid-input-response"]`)
       - `3x0000000000000000000000000000000AA`: spent/duplicate (`success: false`, `errorCodes: ["timeout-or-duplicate"]`)
     - In development / test mode (`process.env.NODE_ENV !== 'production'`), allow bypass if token is omitted or equals `'dev-bypass-key'`.
     - In production mode, query `https://challenges.cloudflare.com/turnstile/v0/siteverify` using `fetch` with 5000ms timeout guard. If `token` is missing or fails verification, return `{ success: false }`.
     - Implement `guardOtpGeneration(token?: string, remoteIp?: string)` helper that throws `TRPCError({ code: "BAD_REQUEST", message: "Cloudflare Turnstile verification failed. Bot defense triggered." })` if `verifyTurnstileToken` returns false.
   - In `api/local-auth-router.ts`:
     - Update `generateVerificationCode` procedure input schema to accept `{ phone: z.string(), turnstileToken: z.string().optional() }`.
     - Call `await guardOtpGeneration(input.turnstileToken, clientIp)` before generating the OTP.

2. R7 (HTTP Security Headers & Transport Layer Security):
   - In `api/boot.ts` and `api/server.ts`:
     - Configure Hono `secureHeaders` middleware:
       - Tailored Content-Security-Policy (CSP):
         - `default-src 'self'`
         - `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`
         - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
         - `font-src 'self' https://fonts.gstatic.com data:`
         - `img-src 'self' data: blob: https://*.googleusercontent.com`
         - `connect-src 'self' https://challenges.cloudflare.com`
         - `frame-src https://challenges.cloudflare.com`
         - `frame-ancestors 'none'`
         - `object-src 'none'`
         - `base-uri 'self'`
       - HSTS header enabled only in production: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`. In development/test, omit or disable HSTS.
       - Security standard headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
       - Permissions-Policy allowing `microphone: ["self"]` for voice features.
     - Add HTTPS redirection middleware: in production (`process.env.NODE_ENV === 'production'`), if `x-forwarded-proto === 'http'`, redirect with HTTP 301 to `https://${c.req.header('host')}${c.req.path}`.

3. Verification:
   - Verify alignment with `tests/security/r3-turnstile-defense.test.ts` and `tests/security/r7-security-headers.test.ts`.
4. Output Deliverables:
   - Write handoff report to `e:/smartspend_V1_fixed/.agents/worker_sec_m2/handoff.md`.
   - Send completion message to orchestrator.
