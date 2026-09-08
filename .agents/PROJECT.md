# Project: SmartSpend AI Enterprise-Grade Security Remediation (R1 - R8)

## Architecture
- **Monorepo**: TypeScript 5.9 + React 18 + Vite 7 (Frontend) & Hono v4 + tRPC v11 + Drizzle ORM + MySQL 8 (Backend)
- **Security Perimeter**: Hono `secureHeaders` (CSP, HSTS) + HTTPS redirection + Cloudflare Turnstile bot defense
- **Data Protection**: SHA-256 session token hashing (`tokenHash`), AES-256-GCM webhook encryption, zero plaintext secrets
- **Authorization Defense**: Centralized ownership guards (`api/lib/ownership-guard.ts`) preventing BOLA/IDOR across all mutations
- **Input & Output Neutralization**: HTML escaping in `pro-report-engine.ts`, spreadsheet formula neutralization in `export-router.ts`
- **File & Boundary Integrity**: Magic bytes verification for image uploads, strict Zod schemas, secure HttpOnly cookie transport

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Git History Secret Purge & Safeguards | Repo mirror backup, git-filter-repo purge of .env and API keys, hardened .gitignore, pre-commit hook | M5 | Survey (Explorer 1) |
| 2 | HTML XSS Neutralization in Reports | Robust HTML escaping for dynamic variables in `pro-report-engine.ts` with report `<meta>` CSP | M1 | Survey (Explorer 2) |
| 3 | Spreadsheet Formula Injection Sanitization | Prepend single quote `'` to fields starting with `=`, `+`, `-`, `@`, `\t`, `\r` in `export-router.ts` | M1 | Survey (Explorer 2) |
| 4 | Cloudflare Turnstile Bot & OTP Defense | Server-side Turnstile verification for WhatsApp OTP with dev bypass and test keys | M2 | Survey (Explorer 2) |
| 5 | Dependency Remediation (`exceljs` migration) | Replace abandoned `xlsx@0.18.5` with `exceljs@^4.4.0` in `export-router.ts` and automated CI audit | M1 | Survey (Explorer 1) |
| 6 | Plaintext Session Elimination & Token Hashing | Store `tokenHash` (SHA-256) only in `sessions` table, eliminate plaintext tokens, remove static keys | M3 | Survey (Explorer 3) |
| 7 | BOLA / IDOR Authorization Enforcement | Strict ownership validation on `walletId`, `contactId`, `businessId`, `linkedGoalId` in tRPC routers | M3 | Survey (Explorer 3) |
| 8 | HTTP Security Headers & HSTS Enforcement | Configure CSP tailored to app assets, HSTS (max-age >= 31536000) in prod, and HTTPS redirection | M2 | Survey (Explorer 2) |
| 9 | Secure Cookie Migration & Profile Boundaries | Dual-mode HttpOnly/Secure/SameSite cookie for local auth, tighten profile schemas, OTP phone change | M4 | Survey (Explorer 3) |
| 10 | Receipt Upload Magic Bytes Verification | Binary signature check (JPEG, PNG, WebP) for uploaded receipts rejecting disguised executables | M4 | Survey (Explorer 3) |
| 11 | Comprehensive E2E Security Test Suite | Vitest suites in `tests/security/` covering all acceptance criteria across Tiers 1-4 | E2E | Test Writer |
| 12 | Forensic Integrity & Regression Audit | Full verification (`npm run check`, `npm run test`, `npm audit`, git log secrets check) | M6 | Orchestrator / Auditor |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Injection Prevention & Secure Exports (R2 & R4) | `api/services/pro-report-engine.ts`, `api/export-router.ts`, `package.json`, `.github/workflows/ci.yml` | none | PLANNED |
| M2 | Bot Defense, Headers & TLS (R3 & R7) | `api/lib/env.ts`, `api/services/turnstile-service.ts`, `api/local-auth-router.ts`, `api/boot.ts`, `api/server.ts` | none | PLANNED |
| M3 | Session Hashing, Secrets & BOLA Defense (R5 & R6) | `db/schema.ts`, `api/lib/session-validation.ts`, `api/local-auth-utils.ts`, `api/lib/ownership-guard.ts`, `api/expense-router.ts`, `api/budget-router.ts`, `api/profile-router.ts` | none | PLANNED |
| M4 | Secure Cookies, Schemas & Upload Validation (R8) | `api/local-auth-router.ts`, `api/context.ts`, `api/profile-router.ts`, `api/lib/image-magic-bytes.ts`, `api/image-router.ts` | M3 | PLANNED |
| M5 | Git History Secret Purge & Safeguards (R1) | Repo backup, `git-filter-repo` secret purge, `.gitignore`, `.git/hooks/pre-commit` | M1-M4 | PLANNED |
| M6 | Full Monorepo Verification & Forensic Audit | Full Vitest test suite (`npm run test`), Typecheck (`npm run check`), npm audit, Forensic Auditor signoff | M1-M5 | PLANNED |

## Code Layout & File Ownership Boundaries
- **Worker M1**: Exclusively owns `api/services/pro-report-engine.ts`, `api/export-router.ts`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml`.
- **Worker M2**: Exclusively owns `api/lib/env.ts`, `api/services/turnstile-service.ts`, `api/boot.ts`, `api/server.ts`.
- **Worker M3**: Exclusively owns `db/schema.ts`, `api/lib/session-validation.ts`, `api/local-auth-utils.ts`, `api/lib/ownership-guard.ts`, `api/expense-router.ts`, `api/budget-router.ts`, `api/notification-engine.ts`, `api/lib/ai-gateway.ts`.
- **Worker M4**: Exclusively owns `api/context.ts`, `api/profile-router.ts`, `api/lib/image-magic-bytes.ts`, `api/image-router.ts` (and shares `api/local-auth-router.ts` sequentially after M2).
- **Worker M5**: Exclusively owns git history filtering, repo backup, `.gitignore`, `.git/hooks/pre-commit`.
- **Testing Track / Reviewers**: Exclusively owns `tests/security/` and verification runners.

## Interface Contracts
### Spreadsheet Export Contract (`api/export-router.ts`)
- Preserves `{ format: "xlsx", data: base64String, filename: string }` and `{ format: "csv", data: string, filename: string }` response shapes.
- Neutralizes formula triggers by prepending `'` without altering numeric fields.

### Turnstile Verification Contract (`api/services/turnstile-service.ts`)
- `verifyTurnstileToken(token?: string, remoteIp?: string): Promise<{ success: boolean; errorCodes?: string[] }>`
- In non-production or when token is a test key, returns `{ success: true }`.

### Session Hashing Contract (`api/lib/session-validation.ts`)
- In `sessions` table: `tokenHash` stores `crypto.createHash('sha256').update(bearerToken).digest('hex')`.
- Lookups match strictly via `eq(sessions.tokenHash, hash)`.

### Ownership Guard Contract (`api/lib/ownership-guard.ts`)
- `validateWalletOwnership(userId: number, walletId: number): Promise<boolean>`
- `validateBusinessOwnership(userId: number, businessId: number): Promise<boolean>`
- `validateGoalOwnership(userId: number, goalId: number): Promise<boolean>`
- Throws `TRPCError({ code: "FORBIDDEN", message: "Unauthorized entity access" })` on ownership mismatch.

### Image Magic Bytes Contract (`api/lib/image-magic-bytes.ts`)
- `verifyImageMagicBytes(buffer: Buffer): { valid: boolean; format?: "jpeg" | "png" | "webp" }`
- Rejects files with invalid magic byte headers with `TRPCError({ code: "BAD_REQUEST" })`.

