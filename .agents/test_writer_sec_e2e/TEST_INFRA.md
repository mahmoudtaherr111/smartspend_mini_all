# Security E2E Test Infrastructure & Test Matrix

## 1. Security Architecture & Testing Philosophy
- **Authoritative Specification**: `ORIGINAL_REQUEST.md` (Remediation Requirements R1 through R8).
- **Testing Approach**: Defense-in-depth opaque-box and contract testing. Each security requirement is mapped 1:1 to dedicated, self-contained Vitest test suites under `tests/security/`.
- **Zero Hallucination & Strict Isolation**: Tests set up their own state, mock external providers (e.g., Cloudflare Turnstile verify, Gemini vision) deterministically, and test security boundaries and tRPC middleware authorization contracts directly.
- **Dual-User Identity Enforcement**: Tests verify that polymorphic identity separation (`users` table for OAuth vs `localUsers` for Local/OTP) is strictly respected with zero cross-tenant contamination.

---

## 2. Security Test Suite Inventory & Matrix

| Requirement | Test Suite File | Threat Model / Vulnerability | Verification Target | Status |
|:---|:---|:---|:---|:---:|
| **R2** | `tests/security/r2-injection-prevention.test.ts` | Stored/Reflected XSS in HTML reports; Spreadsheet Formula Injection (CSV/XLSX) | `wrapReportAsPrintableHtml` in `pro-report-engine.ts`; `exportRouter` in `export-router.ts` | Ready |
| **R3** | `tests/security/r3-turnstile-defense.test.ts` | Distributed OTP Pumping & SMS/WhatsApp exhaustion bots | `localAuthRouter.generateVerificationCode`; Turnstile validation contract | Ready |
| **R5** | `tests/security/r5-session-hashing.test.ts` | Plaintext bearer token theft via database dump/SQLi | `createSession`, `hashSessionToken`, `validateActiveSessionToken` in `session-validation.ts` | Ready |
| **R6** | `tests/security/r6-bola-idor.test.ts` | Broken Object Level Authorization (BOLA/IDOR) on foreign keys | `expenseRouter` (`walletId`, `contactId`, `businessId`); `budgetRouter` (`linkedGoalId`) | Ready |
| **R7** | `tests/security/r7-security-headers.test.ts` | Clickjacking, MIME sniffing, plaintext transport downgrade | Hono `app` middleware in `api/boot.ts`: CSP, HSTS, secure headers | Ready |
| **R8** | `tests/security/r8-security-boundaries.test.ts` | Disguised malicious file uploads (executables/scripts as receipts); unverified phone changes | `imageRouter.parseReceipt` magic bytes verification; `profileRouter` schema bounds | Ready |

---

## 3. Detailed Test Suite Specifications

### R2: Injection Prevention (`r2-injection-prevention.test.ts`)
- **HTML Injection & XSS**:
  - Injects `<script>alert(1)</script>`, `<img src=x onerror=...>`, `<svg onload=...>`, `"><script>...`, and `javascript:...` URIs across all user-controlled report fields (`userName`, `month`, `response_text`, `invoice_header`, `invoice_footer`, `alerts`).
  - Asserts that all dangerous HTML tags and event handlers are neutralized (entity-escaped or stripped) and never rendered as executable markup.
- **Spreadsheet Formula Injection (CSV/Excel)**:
  - Injects formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) such as `=SUM(...)`, `=cmd|' /C calc'!A0`, `+123456`, `@HYPERLINK(...)` into transaction descriptions, categories, and sources.
  - Asserts that exported CSV rows and Excel cells neutralize formula triggers (e.g., prefixing with single-quote `'` or sanitizing) while preserving readable financial text.

### R3: Turnstile Bot & OTP Defense (`r3-turnstile-defense.test.ts`)
- **Production Mode Enforcement**:
  - Tests that calling `generateVerificationCode` without a `turnstileToken` or with an invalid token rejects with `BAD_REQUEST` or `FORBIDDEN`.
- **Cloudflare Verification Contract**:
  - Validates interaction with `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
  - Supports standard Cloudflare test keys (`1x0000000000000000000000000000000AA` always passes, `2x...` fails).
- **Development & CI Bypass**:
  - Verifies that when `NODE_ENV !== "production"` or in automated test mode, OTP generation operates smoothly without blocking test runners.

### R5: Plaintext Session Elimination (`r5-session-hashing.test.ts`)
- **Cryptographic Hash Generation**:
  - Verifies SHA-256 output (64-char lowercase hex string and 32-byte binary Buffer) from `hashSessionToken`.
- **Zero Plaintext Token Storage**:
  - Verifies that `createSession` writes only `tokenHash` to the `sessions` table, setting `token` to `null`.
- **Hash-Based Lookup**:
  - Verifies that `validateActiveSessionToken` resolves active sessions exclusively by matching `sessions.tokenHash = sha256(token)`.
  - Asserts that tampered token hashes immediately fail authentication.

### R6: BOLA / IDOR Defense (`r6-bola-idor.test.ts`)
- **Multi-Tenant Ownership Verification**:
  - Tenant A (User 1) attempting to attach `walletId` belonging to Tenant B (User 2) is rejected.
  - Tenant A attempting to attach `contactId` belonging to Tenant B is rejected.
  - Tenant A attempting to attach `businessId` belonging to Tenant B is rejected.
  - Tenant A attempting to link `linkedGoalId` belonging to Tenant B in `budgetRouter.create` is rejected.
- **Dual-User Polymorphic Isolation**:
  - Local User 1 (type: "local") cannot link entities belonging to OAuth User 1 (type: "oauth") despite identical numeric ID 1.

### R7: Security Headers & Transport Security (`r7-security-headers.test.ts`)
- **Content-Security-Policy (CSP)**:
  - Asserts presence of `Content-Security-Policy` with restrictive `default-src`, `object-src 'none'`, and `frame-ancestors 'none'`.
- **HTTP Strict Transport Security (HSTS)**:
  - Asserts presence of `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production environments.
- **Core Security Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`

### R8: Security Boundaries & File Validation (`r8-security-boundaries.test.ts`)
- **Magic Bytes Validation**:
  - Inspects file byte signatures in `imageRouter.parseReceipt`.
  - Accepts authentic JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), and WebP (`RIFF...WEBP`).
  - Rejects disguised ELF binaries, Windows PE executables (`MZ`), shell scripts, and HTML files disguised as images.
- **Profile Schema Boundaries**:
  - Rejects wildcard / unvalidated objects in profile schemas.
  - Requires verified OTP confirmation for updating user phone numbers.

---

## 4. Test Execution
```bash
# Run all security test suites
npm run test tests/security

# Run individual security suites
npx vitest run tests/security/r2-injection-prevention.test.ts
npx vitest run tests/security/r3-turnstile-defense.test.ts
npx vitest run tests/security/r5-session-hashing.test.ts
npx vitest run tests/security/r6-bola-idor.test.ts
npx vitest run tests/security/r7-security-headers.test.ts
npx vitest run tests/security/r8-security-boundaries.test.ts
```
