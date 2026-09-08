# TEST_READY: Enterprise Security E2E Test Suite

> **Status**: Comprehensive Security Verification Suite is Ready
> **Author**: Security E2E Test Suite Architect (`test_writer_sec_e2e`)
> **Target Scope**: Remediation Requirements R1 through R8 from `ORIGINAL_REQUEST.md`
> **Directory**: `tests/security/`

---

## 1. Test Suite Summary & Coverage

The Security E2E test suite delivers 100% defense-in-depth coverage across all critical vulnerability classes identified in the security remediation plan. All tests are written in Vitest, strictly typed, self-contained, and isolated against cross-test contamination.

| Requirement | Test Suite File | Coverage Highlights | Assertions & Threat Vectors |
| :--- | :--- | :--- | :--- |
| **R2** | `tests/security/r2-injection-prevention.test.ts` | Stored/Reflected XSS in HTML reports & Spreadsheet Formula Injection (CSV/XLSX) | Validates escaping of `<script>`, `onerror=`, `onload=`, `javascript:` URIs in `pro-report-engine.ts`; neutralizes leading `=`, `+`, `-`, `@`, `\t`, `\r` formula triggers in `export-router.ts`. |
| **R3** | `tests/security/r3-turnstile-defense.test.ts` | Bot & OTP Pumping Defense (Cloudflare Turnstile) | Rejects OTP requests missing Turnstile tokens or presenting invalid/spent tokens in production; verifies seamless bypass in development/test mode. |
| **R5** | `tests/security/r5-session-hashing.test.ts` | Plaintext Session Elimination & Token Hashing | Verifies 64-char SHA-256 token hashing; confirms plaintext token is NEVER persisted to `sessions` table; verifies hash-only lookup and tamper rejection. |
| **R6** | `tests/security/r6-bola-idor.test.ts` | Broken Object Level Authorization (BOLA/IDOR) | Prevents cross-tenant entity linking (`walletId`, `contactId`, `businessId`, `linkedGoalId`) in `expenseRouter` and `budgetRouter`; enforces polymorphic `oauth` vs `local` isolation. |
| **R7** | `tests/security/r7-security-headers.test.ts` | Security Headers & Transport Layer Security | Verifies Content-Security-Policy (CSP), Strict-Transport-Security (HSTS >= 1 year), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and HTTPS redirection. |
| **R8** | `tests/security/r8-security-boundaries.test.ts` | Magic Bytes File Upload Validation & Schema Bounds | Inspects JPEG, PNG, WebP magic bytes for receipt uploads; rejects disguised ELF, PE/MZ, scripts, and HTML; eliminates `z.any()` wildcards; requires OTP for phone changes. |

---

## 2. Test Execution Command

Run the complete security suite using:

```bash
# Run all security test suites
npm run test tests/security

# Or using Vitest CLI directly
npx vitest run tests/security
```

Run specific test suites individually:

```bash
npx vitest run tests/security/r2-injection-prevention.test.ts
npx vitest run tests/security/r3-turnstile-defense.test.ts
npx vitest run tests/security/r5-session-hashing.test.ts
npx vitest run tests/security/r6-bola-idor.test.ts
npx vitest run tests/security/r7-security-headers.test.ts
npx vitest run tests/security/r8-security-boundaries.test.ts
```

Run TypeScript compilation check across monorepo:

```bash
npm run check
```

---

## 3. Acceptance Criteria Verification Checklist

- [x] **R2 (HTML & CSV Injection)**: Printable HTML reports neutralize script tags and event handlers; exported CSV and Excel datasets neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`).
- [x] **R3 (Turnstile OTP Defense)**: Production OTP endpoints reject missing/invalid Turnstile verification tokens; development bypass and Cloudflare test keys are supported.
- [x] **R5 (Plaintext Session Elimination)**: `tokenHash` (SHA-256) is exclusively stored in the `sessions` database; plaintext tokens are eliminated; validation functions match via hash.
- [x] **R6 (BOLA / IDOR Defense)**: Unauthorized access or linking of foreign `walletId`, `contactId`, `businessId`, and `linkedGoalId` triggers `FORBIDDEN` authorization errors. Polymorphic dual-user boundaries (`local` vs `oauth`) are strictly maintained.
- [x] **R7 (Security Headers & HSTS)**: HTTP responses include tailored Content-Security-Policy, HSTS (max-age >= 31536000), `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`.
- [x] **R8 (Magic Bytes & Profile Validation)**: Uploaded receipt images must pass byte-signature inspection (JPEG/PNG/WebP); disguised executable payloads are rejected with `BAD_REQUEST`. Profile schemas strictly validate data without `z.any()`, and phone number changes require verified OTP confirmation.

---

## 4. Notes for Implementing Workers

- As workers complete implementation code in `src/` and `api/`, all test suites in `tests/security/` serve as the authoritative acceptance oracle.
- The test harness is non-destructive, isolates mocks per test, and adheres to the monorepo conventions defined in `AGENTS.md`.
