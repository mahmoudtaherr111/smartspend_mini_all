## 2026-08-29T10:24:25Z

You are worker_m1 (Implementation Specialist for Phase 1 P0 Hotfixes).
Working directory: e:\smartspend_V1_fixed\.agents\worker_m1
Original User Request: e:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md
General project rules: e:\smartspend_V1_fixed\AGENTS.md
Project Blueprint: e:\smartspend_V1_fixed\PROJECT.md
Survey Analysis Report: e:\smartspend_V1_fixed\.agents\explorer_p0\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your mission:
Implement the 6 Phase 1 P0 security hotfixes across the codebase with 100% backward compatibility:
1. Business Multi-Tenant Authorization (BOLA/IDOR): Fix `api/business-router.ts` (`updateCategory`, `removeCategory`, `linkContact`) by strictly enforcing ownership checks against active `userBusinesses` (`userId` + `userType`).
2. Subscription Lifecycle & Expiry: Fix `api/pro-router.ts` and `api/context.ts` so that cancelled subscriptions (`sub.status === "cancelled"`) correctly transition to `expired` status and downgrade user tier after `endDate`.
3. Cryptographic Security & OTP: Replace `Math.random()` with `crypto.randomInt` in `api/local-auth-router.ts` for all OTP generation.
4. Admin Secret Redaction: Sanitize `api/admin-router.ts` backup demo endpoints (`triggerBackupDemo`) to redact all live API keys, JWT secrets, and HMAC secrets.
5. Cross-Tenant SMS Cache Isolation: Namespace the in-memory SMS parsing cache in `api/lib/sms-ai-parser.ts` by `(userId, userType)` and enforce LRU size bounds (e.g. 500 items max).
6. Paymob Webhook Verification: Ensure fail-closed HMAC signature verification on `/api/webhooks/paymob` across all environments in `api/boot.ts` and `api/lib/paymob.ts`.

Verification requirements:
- Run `npm run check` to ensure zero type errors.
- Author unit tests for these fixes (e.g., in `api/business-router.p0.test.ts`, `api/pro-router.p0.test.ts`, `api/local-auth-router.p0.test.ts`, `api/admin-router.p0.test.ts`, `api/lib/sms-ai-parser.p0.test.ts`, etc.) and run them using `npx vitest run`.
- Ensure all existing unit tests in affected areas still pass.

Deliverables:
- Write `changes.md` and `handoff.md` in `e:\smartspend_V1_fixed\.agents\worker_m1\`.
- Send a completion message back with summary of changes and verification test output.
