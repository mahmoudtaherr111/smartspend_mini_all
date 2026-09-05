# Security Remediation Plan — SmartSpend Full-Stack

## 1. Objectives & Quality Gates
Remediate all vulnerabilities from `SECURITY_AUDIT_REPORT.md` across P0, P1, P2, and P3 while maintaining 100% backward compatibility, passing `npm run check` with 0 type errors, and 100% passing `npm run test` suites.

## 2. Milestones & Phases

### Phase 0: Survey & Current State Assessment
- Map current codebase status for all 38 findings.
- Check which patches are already complete vs. partially implemented vs. pending.
- Run baseline `npm run check` and `npm run test` to verify starting baseline.

### Phase 1: Critical & P0 Immediate Security Hotfixes
- **M1.1**: Business BOLA/IDOR (`api/business-router.ts`: `updateCategory`, `removeCategory`, `linkContact`) with multi-tenant `userBusinesses` ownership.
- **M1.2**: Subscription Lifecycle & Expiry (`api/pro-router.ts`, `api/context.ts`: cancelled -> expired downgrade after `endDate`).
- **M1.3**: Cryptographic Security & OTP (`api/local-auth-router.ts`: replace `Math.random` with `crypto.randomInt`).
- **M1.4**: Admin Secrets Redaction (`api/admin-router.ts`: sanitize live API keys and HMAC secrets in backup demo).
- **M1.5**: Tenant-Isolated SMS AI Cache (`api/lib/sms-ai-parser.ts`: namespace cache by `userId` + `userType` with LRU).
- **M1.6**: Paymob Webhook HMAC Enforcement (`api/boot.ts`: fail-closed verification).

### Phase 2: Architectural Hardening & Infrastructure Security
- **M2.1**: OAuth CSRF & State Verification (`api/auth-router.ts`, `api/boot.ts`).
- **M2.2**: Client IP & Rate Limiting Hardening (`api/lib/get-client-ip.ts`: anti-spoofing and isolated local buckets).
- **M2.3**: HTTP Security Headers & CORS Lockdown (`api/boot.ts`, `api/server.ts`: CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
- **M2.4**: TOCTOU Subscription Race Condition (`api/lib/subscription-service.ts`: transactional locks / idempotency).
- **M2.5**: AI Rate Limiting & Prompt Injection Guards (`api/middleware.ts`, `api/services/ai-kernel/`).

### Phase 3: Defense-in-Depth, Validation & Hygiene
- **M3.1**: Expense Router Foreign Key & Ownership Validation (`api/expense-router.ts`: `walletId`, `businessId`).
- **M3.2**: Zod Runtime Schema Validation & Bounds (`api/profile-router.ts`, `api/wallet-router.ts`, `api/ai-router.ts`).
- **M3.3**: AI SDK Execution Timeouts (`api/lib/ai-gateway.ts`, `api/lib/smart-pipeline.ts`: 30s abort signal).
- **M3.4**: WebSocket Upgrade Origin & Session Protection (`api/server.ts`, `api/boot.ts`: `/api/voice/live`).
- **M3.5**: tRPC Error Formatter Sanitization (`api/middleware.ts`).

### Phase 4: Verification, Regression Testing & Final Gate
- **M4.1**: Full TypeScript Check (`npm run check`).
- **M4.2**: Vitest Test Suite (`npm run test`) and dedicated security regression tests.
- **M4.3**: Independent Review (2 Reviewers), Adversarial Verification (2 Challengers), and Forensic Integrity Audit (Auditor).
- **M4.4**: Final Completion Report & Artifact Delivery.

## 3. Subagent Directory Map
- Survey Explorers: `.agents/explorer_survey_1`, `.agents/explorer_survey_2`, `.agents/explorer_survey_3`
- Phase Workers: `.agents/worker_p0`, `.agents/worker_p1`, `.agents/worker_p2`
- Reviewers: `.agents/reviewer_1`, `.agents/reviewer_2`
- Challengers: `.agents/challenger_1`, `.agents/challenger_2`
- Forensic Auditor: `.agents/auditor_1`
