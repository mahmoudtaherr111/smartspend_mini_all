# Original User Request

## Initial Request — 2026-08-30T12:06:53Z

You are the Project Orchestrator for SmartSpend AI mobile fidelity implementation.

Working directory: e:/smartspend_V1_fixed/.agents/orchestrator_1
Project root: e:/smartspend_V1_fixed
Original request file: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md

Your mission:
Execute the remaining core mobile pillars of SmartSpend AI to deliver 100% native fidelity (iOS Swift / Flutter grade) with deep architectural rigor, zero regressions, and robust handling of all edge cases (gesture conflicts, keyboard collisions, scroll trapping, and memory persistence).

Key Requirements to execute and coordinate:
1. Universal Polymorphic AdaptiveDialog & Bottom Sheet Architecture (vaul on mobile <768px, Radix Dialog on desktop, BackButtonManager integration, form/focus preservation).
2. Continuous 1:1 Interactive Tab Pager with Gesture Isolation (embla-carousel-react, RTL calibration, iOS momentum/spring settling, pointer-capture isolation .no-swipe for charts/calendars/sliders).
3. Directional Spatial Transitions & Tab State Keep-Alive (hardware-accelerated slide transitions, scroll offset retention across bottom nav routes, offscreen keep-alive for intensive views like AICenter tabs).
4. GPU Compositing Optimization & Performance Hardening (eliminate heavy backdrop-filter blur in scrolling lists, will-change: transform, composite layering, 60-120fps fluidity).
5. Comprehensive Zero-Regression Test Suite & Verification (npm run check, npm run test, mobile test coverage, zero type errors, zero regressions).

Please initialize your working directory, maintain your BRIEFING.md and progress.md, dispatch specialized subagents to implement and verify, and report back when finished.

## Follow-up — 2026-09-08T04:33:08Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full Team (تنفيذ خطة الأمان الشاملة لكافة النقاط مع التحقق التلقائي الكامل)

Execute an enterprise-grade security remediation across the SmartSpend AI codebase to eliminate all identified vulnerabilities and enforce architectural best practices with zero regressions.

Working directory: e:/smartspend_V1_fixed
Integrity mode: development

## Requirements

### R1. Git History Secret Purge & Rotation Safeguards (P0)
- Create a backup of the current Git repository prior to modifying history.
- Purge all historical commits leaking `.env` files and Google Gemini API keys using repository filtering tools so secrets no longer appear in `git log` or commit blobs.
- Ensure pre-commit or automated checks prevent any `.env` or API key leaks from entering Git going forward.

### R2. Injection Prevention: Stored/Reflected XSS and CSV Formula Injection (P0)
- Sanitize all user-controlled text rendered in HTML reports (`pro-report-engine.ts`) to prevent HTML injection and Stored/Reflected Cross-Site Scripting (XSS).
- Sanitize all exported transaction descriptions and fields in CSV/Excel generation (`export-router.ts`) to neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`).

### R3. Bot & OTP Pumping Defense (P0)
- Protect the WhatsApp OTP verification code endpoint against automated distributed bot abuse by verifying Cloudflare Turnstile tokens on the server.
- Provide a seamless development mode bypass or test key support so local development and automated CI tests are not impeded.

### R4. Dependency Vulnerability Resolution (P0)
- Remediate all high-severity package vulnerabilities reported by `npm audit` (including vulnerabilities in `xlsx`, `vite`, `sharp`, `rollup`). Replace `xlsx` with a secure alternative (such as `exceljs`) if necessary.
- Add an automated security audit step to GitHub Actions CI (`.github/workflows/ci.yml`).

### R5. Plaintext Session Elimination & Sensitive Data Encryption (P1)
- Eliminate plaintext session token storage in the `sessions` database table, storing only cryptographic hashes (`tokenHash`).
- Ensure webhook tokens and sensitive credentials are encrypted or hashed, and avoid relying on fallback static keys.

### R6. Broken Object Level Authorization (BOLA/IDOR) Prevention (P1)
- Enforce strict ownership verification on all foreign-key references supplied in requests (including `walletId`, `contactId`, `businessId`, and `linkedGoalId`) to ensure users cannot attach or manipulate entities belonging to other accounts.

### R7. Security Headers & Transport Layer Security (P1)
- Configure strict HTTP security headers in Hono (`api/boot.ts`), including Content-Security-Policy (CSP) tailored to application assets, and HTTP Strict Transport Security (HSTS) for production.
- Enforce HTTPS redirection for unencrypted traffic in production environments.

### R8. Secure Cookie Migration, Schema Boundaries & File Upload Validation (P2)
- Provide support for transmitting local authentication tokens via HttpOnly, Secure, SameSite cookies while preserving backward compatibility for API / companion clients.
- Tighten profile validation schemas to eliminate permissive `z.any()` wildcards and require verified OTP confirmation for phone number changes.
- Enforce magic bytes verification on uploaded image receipts to prevent disguised malicious file payloads.

## Acceptance Criteria

### Security & Functional Verification
- [ ] `git log --all --full-history -- "**.env*"` returns no occurrences of `.env` files or API keys in git history.
- [ ] Stored user input containing HTML tags (e.g. `<script>alert(1)</script>`) is escaped or sanitized when generating printable HTML reports.
- [ ] Exported CSV and Excel files neutralize formulas starting with `=`, `+`, `-`, `@` without corrupting normal financial text.
- [ ] Calling the OTP code generation endpoint without a valid Turnstile token is rejected in production mode.
- [ ] `npm audit --audit-level=high` runs with 0 high or critical vulnerabilities detected.
- [ ] No plaintext session tokens are written to the database; session lookups resolve exclusively via cryptographic hash matching.
- [ ] Attempting to associate a transaction or budget with a foreign `walletId`, `contactId`, or `linkedGoalId` owned by another user returns an authorization error.
- [ ] HTTP responses include Content-Security-Policy and Strict-Transport-Security headers in production.
- [ ] TypeScript type validation (`npm run check`) succeeds across the entire monorepo with 0 errors.
- [ ] The full Vitest test suite (`npm run test`) runs and 100% of tests pass with zero regressions.

