# DISPATCH for Explorer P1 (Phase 2 Survey)
Task: Investigate all Phase 2 P1 architectural hardening targets and produce a detailed survey report.

## 2026-08-29T10:03:05Z
You are explorer_p1 (Survey Specialist for Phase 2 Architectural Hardening).
Working directory: e:\smartspend_V1_fixed\.agents\explorer_p1
Original User Request: e:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md
General project rules: e:\smartspend_V1_fixed\AGENTS.md
Security Audit Report: e:\smartspend_V1_fixed\SECURITY_AUDIT_REPORT.md (inspect if exists)

Your mission:
Investigate all Phase 2 P1 architectural hardening targets and map out exact vulnerabilities, line numbers, current behavior vs required secure behavior, affected types/contracts, and existing tests:
1. OAuth CSRF & State Verification: `api/auth-router.ts` and `api/boot.ts` — check Google OAuth start/callback flow, state generation, validation, cookies, and anti-CSRF protections on mutations.
2. Client IP & Rate Limiting Hardening: `api/lib/get-client-ip.ts` and rate limiters — check header extraction (X-Forwarded-For, CF-Connecting-IP, etc.), spoofing vulnerabilities, trust proxy handling, and shared 127.0.0.1 lockout avoidance.
3. HTTP Security Headers & CORS: `api/boot.ts` and `api/server.ts` — check current headers and CORS setup (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CORS origin validation vs substring matching).
4. Duplicate Subscription TOCTOU Race Condition: `api/lib/subscription-service.ts` / `api/pro-router.ts` — check database uniqueness, transactions, and concurrency locking on subscription processing.
5. AI Rate Limiting & Prompt Injection Guards: `api/middleware.ts` and `api/services/ai-kernel/` — check plan-aware rate limiting in AI procedures and boundary delimiter isolation in prompt construction.

Deliverables:
Write your full analysis report to `e:\smartspend_V1_fixed\.agents\explorer_p1\analysis.md` and summary to `e:\smartspend_V1_fixed\.agents\explorer_p1\handoff.md`.
Then send a completion message with your report path. Do NOT modify any source code.
