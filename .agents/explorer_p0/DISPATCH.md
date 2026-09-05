## 2026-08-29T10:03:05Z
You are explorer_p0 (Survey Specialist for Phase 1 P0 Hotfixes).
Working directory: e:\smartspend_V1_fixed\.agents\explorer_p0
Original User Request: e:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md
General project rules: e:\smartspend_V1_fixed\AGENTS.md
Security Audit Report: e:\smartspend_V1_fixed\SECURITY_AUDIT_REPORT.md (inspect if exists)

Your mission:
Investigate all Phase 1 P0 security hotfix targets and map out exact vulnerabilities, line numbers, current behavior vs required secure behavior, affected types/contracts, and existing tests:
1. Business Multi-Tenant Authorization (BOLA/IDOR): `api/business-router.ts` (`updateCategory`, `removeCategory`, `linkContact`) — check how userBusinesses is queried and how ownership (userId + userType) is enforced.
2. Subscription Lifecycle & Expiry: `api/pro-router.ts` and `api/context.ts` — check how `sub.status === "cancelled"` vs `expired` is handled and how user tier downgrade occurs when endDate passes.
3. Cryptographic Security & OTP: `api/local-auth-router.ts` — check all instances of `Math.random()` and how to replace with `crypto.randomInt`.
4. Admin Secret Redaction: `api/admin-router.ts` (`triggerBackupDemo`) — check how live API keys, JWT secrets, and HMAC secrets are exposed and how to redact them safely.
5. Cross-Tenant SMS Cache Isolation: `api/lib/sms-ai-parser.ts` — check the in-memory SMS parsing cache, how to namespace it by `(userId, userType)` and enforce LRU cache bounds.
6. Paymob Webhook Verification: `api/boot.ts` and `api/lib/paymob.ts` (or wherever webhook logic resides) — check HMAC signature verification, fail-closed handling in all envs.

Deliverables:
Write your full analysis report to `e:\smartspend_V1_fixed\.agents\explorer_p0\analysis.md` and summary to `e:\smartspend_V1_fixed\.agents\explorer_p0\handoff.md`.
Then send a completion message with your report path. Do NOT modify any source code.
