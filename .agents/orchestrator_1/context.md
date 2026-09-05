# Project Context & Invariants

## 1. System Invariants (from AGENTS.md)
- **User Identity**: Two user tables: `users` (OAuth) and `localUsers` (local/password/OTP). `api/context.ts` resolves into `UnifiedUser`: `{ id, name, email, avatar, role, plan, type, phone }`. Always use `ctx.user`.
- **RBAC**: `role` is `"user" | "moderator" | "admin"` (admin access only). Subscription tier is `plan` (`"free" | "pro" | "ultra"`). Never mix role and plan.
- **Procedure Factories**: Use factories from `api/middleware.ts` (`publicProcedure`, `strictPublicProcedure`, `authedProcedure`, `aiProcedure`, `moderatorProcedure`, `adminProcedure`, `proProcedure`, `proAiProcedure`, `ultraProcedure`).
- **Env & Secrets**: Validated via Zod in `api/lib/env.ts`. Redact all secrets in logs/backups.
- **Model Mapping**: Always map through `api/lib/model-mapper.ts` and `ai-provider-registry.ts`.
- **System Settings**: Always use `getSystemSettings()` in `api/lib/settings-cache.ts`.
- **Drizzle Relations**: Use `db.query.*` or schema in `db/schema.ts` and `db/relations.ts`.
- **SSE / Webhooks / OAuth**: `api/boot.ts` handles SSE, webhooks, and Google OAuth start/callback.

## 2. Security Remediation Matrix
- **P0 Hotfixes**:
  1. `api/business-router.ts`: Category update, delete, contact link BOLA.
  2. `api/pro-router.ts` & `api/context.ts`: Subscription status "cancelled" vs "expired", tier downgrade.
  3. `api/local-auth-router.ts`: Replace `Math.random()` with `crypto.randomInt`.
  4. `api/admin-router.ts`: Redact env secrets in `triggerBackupDemo`.
  5. `api/lib/sms-ai-parser.ts`: SMS parsing cache per-user namespace and LRU size bound.
  6. `api/boot.ts` / `api/lib/paymob.ts`: Paymob webhook fail-closed HMAC check.
- **P1 Architectural Hardening**:
  1. `api/auth-router.ts` & `api/boot.ts`: OAuth state validation & CSRF tokens.
  2. `api/lib/get-client-ip.ts`: IP spoofing prevention, trust proxy config.
  3. `api/boot.ts` & `api/server.ts`: HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) & CORS lockdown.
  4. `api/lib/subscription-service.ts`: Subscription race condition / locking.
  5. `api/middleware.ts` & `api/services/ai-kernel/`: AI rate limits & prompt boundary delimiters.
- **P2 Defense-in-Depth**:
  1. `api/expense-router.ts`: Wallet and business ownership & foreign key validation.
  2. `api/profile-router.ts`, `api/wallet-router.ts`, `api/ai-router.ts`: Strict Zod bounds.
  3. `api/lib/ai-gateway.ts` & `api/lib/smart-pipeline.ts`: 30s timeout guards.
  4. `/api/voice/live`: WebSocket upgrade auth & origin check.
  5. `api/middleware.ts`: tRPC error formatter sanitization.

## 3. Communication & Safety Invariants
- Dispatch-only orchestrator: Never edit application code or execute test commands directly.
- Strict subagent isolation in `.agents/` directories.
- Zero regression, 100% backward compatibility.
