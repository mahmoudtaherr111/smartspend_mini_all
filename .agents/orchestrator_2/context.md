# Context — SmartSpend Full-Stack Security Remediation

## Domain & Architecture Context
- **Platform**: SmartSpend AI Behavioral Financial Platform (Web & PWA, Egyptian market: EGP, local wallets, Arabic dialect NLP).
- **Stack**:
  - Frontend: React 18, Vite 7, TypeScript 5.9, Tailwind CSS 3.4, shadcn/ui, tRPC React Query
  - Backend: Hono v4, tRPC v11 (`api/router.ts`, 22 sub-routers), Drizzle ORM (`db/schema.ts`, 48 tables), MySQL 8 (`mysql2/promise`)
  - Auth: Dual-auth model (`users` for Google OAuth and `localUsers` for local phone/password + WebAuthn passkeys). `ctx.user` is normalized to `UnifiedUser { id, name, email, avatar, role, plan, type, phone }`.
  - Procedures: `publicProcedure`, `strictPublicProcedure`, `authedProcedure`, `aiProcedure`, `proProcedure`, `proAiProcedure`, `ultraProcedure`, `adminProcedure`, `moderatorProcedure`.
  - AI Services: Google Gemini, Groq Whisper/Llama, Fireworks, NVIDIA NIM, 5-layer classification engine, vector memory stores.

## Dual User ID Architecture Invariant
`users.id = 1` and `localUsers.id = 1` can both exist. Every multi-tenant entity must match on BOTH `userId` AND `userType` (`"oauth" | "local"`).

## Target Remediation Scope from SECURITY_AUDIT_REPORT.md & ORIGINAL_REQUEST.md
1. **Phase 1 (Critical & P0 Hotfixes)**:
   - `VULN-ROUTER-01` & `VULN-ROUTER-02`: BOLA in `api/business-router.ts` (`updateCategory`, `removeCategory`, `linkContact`).
   - `VULN-FIN-01` & `VULN-FIN-03`: Subscriptions in `api/pro-router.ts` and `api/context.ts` (cancelled status transition, expiration downgrade).
   - `VULN-AUTH-02`: Cryptographically secure OTP using `crypto.randomInt` in `api/local-auth-router.ts`.
   - `VULN-AI-02`: Redact live secrets from `api/admin-router.ts` backup demo endpoints.
   - `VULN-AI-01`: Partition SMS AI parsing cache by `(userId, userType)` with LRU bounds in `api/lib/sms-ai-parser.ts`.
   - `VULN-FIN-04`: Fail-closed Paymob HMAC verification on `/api/webhooks/paymob` across all environments.

2. **Phase 2 (Architectural Hardening & Infrastructure Security)**:
   - `VULN-AUTH-01`: Google OAuth CSRF & state verification in `api/auth-router.ts` and `api/boot.ts`.
   - `VULN-INFRA-01` & `VULN-INFRA-02`: Client IP extraction and rate limiting in `api/lib/get-client-ip.ts`.
   - `VULN-INFRA-03` & `VULN-INFRA-07`: HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) & CORS restriction in `api/boot.ts` and `api/server.ts`.
   - `VULN-FIN-02`: TOCTOU subscription race conditions in `api/lib/subscription-service.ts`.
   - `VULN-AI-03` & `VULN-AI-04`: AI rate limiting & prompt injection delimiters in `api/middleware.ts` and `api/services/ai-kernel/`.

3. **Phase 3 (Defense-in-Depth & Validation)**:
   - `VULN-ROUTER-03`: Explicit foreign key and ownership checks for `walletId` and `businessId` in `api/expense-router.ts`.
   - `VULN-INFRA-08`, `VULN-AI-05`, `VULN-FIN-07`: Zod runtime schema validation, bounds, and string length restrictions in `api/profile-router.ts`, `api/wallet-router.ts`, `api/ai-router.ts`.
   - `VULN-AI-07`: 30s execution timeout guards in `api/lib/ai-gateway.ts` and `api/lib/smart-pipeline.ts`.
   - `VULN-INFRA-05`: WebSocket upgrade origin & session checks for `/api/voice/live`.
   - `VULN-INFRA-10`: Production `errorFormatter` sanitization in `api/middleware.ts`.

4. **Phase 4 (Verification & Regression Testing)**:
   - Type check verification: `npm run check` (0 errors).
   - Automated test suite: `npm run test` (100% passing).
   - Dedicated regression test files verifying security boundaries for all patched vulnerabilities.
