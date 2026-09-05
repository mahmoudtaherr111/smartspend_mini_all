# Orchestration Plan: SmartSpend Security Remediation

## 1. Objectives & Scope
Remediate all vulnerabilities in `SECURITY_AUDIT_REPORT.md` and fulfill all requirements in `ORIGINAL_REQUEST.md`:
- Phase 1 (P0 Hotfixes): Business BOLA, Pro Expiry, Crypto OTP, Admin Secret Redaction, Cross-Tenant SMS Cache, Paymob HMAC
- Phase 2 (P1 Architectural Hardening): OAuth CSRF, IP Rate Limiting, HTTP Security Headers/CORS, Subscription Race Conditions, AI Rate Limiting/Prompt Injection
- Phase 3 (P2 Defense-in-Depth): Expense FK & Ownership checks, Zod schema validation, AI timeouts, WebSocket auth, tRPC error sanitization
- Phase 4 (P3 Verification & Regression Suite): Full suite tests, regression tests for every fix, `npm run check` and `npm run test` green.

## 2. Orchestration Strategy & Pattern
We follow the Project Pattern with Dual-Track execution:
- **Track 1: Implementation Track**: Sub-orchestrators for Phase 1, Phase 2, Phase 3 using the standard loop: Explorer -> Worker -> Reviewer -> Challenger -> Forensic Auditor.
- **Track 2: Testing & Verification Track**: Comprehensive regression test authoring, validating every security invariant and ensuring 0 regressions.

## 3. Milestones Breakdown
- **M0: Survey & Scope Mapping**:
  - Spawn 3 parallel Explorers to inspect code, dependencies, contracts, and test files for P0, P1, P2 requirements.
  - Formulate unified `PROJECT.md` and `TEST_INFRA.md`.
- **M1: Phase 1 Hotfixes (P0)**:
  - Fix Business multi-tenant BOLA in `api/business-router.ts`.
  - Fix Pro subscription cancellation & expiry downgrades in `api/pro-router.ts` and `api/context.ts`.
  - Fix OTP generation to use `crypto.randomInt` in `api/local-auth-router.ts`.
  - Redact sensitive keys in `api/admin-router.ts` `triggerBackupDemo`.
  - Namespace SMS AI parser cache per `(userId, userType)` with LRU bounds in `api/lib/sms-ai-parser.ts`.
  - Ensure fail-closed Paymob webhook HMAC verification in `api/boot.ts` and `api/lib/paymob.ts`.
- **M2: Phase 2 Architectural Hardening (P1)**:
  - Fix OAuth CSRF & state verification in `api/auth-router.ts` and `api/boot.ts`.
  - Harden client IP extraction in `api/lib/get-client-ip.ts` (anti-spoofing, local proxy handling).
  - Add secure HTTP headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) and lock down CORS in `api/boot.ts` and `api/server.ts`.
  - Fix duplicate subscription TOCTOU race condition in `api/lib/subscription-service.ts`.
  - Enforce plan-aware rate limiting in `api/middleware.ts` and AI prompt delimiters in `api/services/ai-kernel/`.
- **M3: Phase 3 Defense-in-Depth (P2)**:
  - Add explicit foreign key and ownership checks for `walletId` and `businessId` in `api/expense-router.ts`.
  - Enforce strict Zod bounds across `api/profile-router.ts`, `api/wallet-router.ts`, `api/ai-router.ts`.
  - Add 30s timeout guards on AI SDK calls in `api/lib/ai-gateway.ts` and `api/lib/smart-pipeline.ts`.
  - Secure `/api/voice/live` WebSocket upgrade with origin and session verification.
  - Sanitize tRPC production error responses in `api/middleware.ts`.
- **M4: Phase 4 Verification, Testing & Regression Hardening**:
  - Run full test suites, typecheck, verify backward compatibility across all modules.
  - Generate comprehensive verification and audit artifacts.

## 4. Verification & Gate Criteria
- 100% type safety: `npm run check` passes with 0 errors.
- 100% test pass: `npm run test` passes.
- Independent Reviewers and Forensic Auditor verify all fixes against cheating, facade implementations, and regressions.
