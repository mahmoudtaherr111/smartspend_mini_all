# DISPATCH RECORD

## 2026-08-23T18:03:15Z
You are the Project Orchestrator for SmartSpend AI remediation and forensic verification.

Your working directory is: `E:/smartspend_V1_fixed/.agents/orchestrator`
The authoritative user request is in: `E:/smartspend_V1_fixed/ORIGINAL_REQUEST.md`
The root cause catalog is in: `E:/smartspend_V1_fixed/MASTER_ROOT_CAUSE_CATALOG.md`
SSoT rules: `E:/smartspend_V1_fixed/AGENTS.md` and `E:/smartspend_V1_fixed/docs/`

Execute all requirements (R1 through R6) thoroughly:
1. Canonical Billing & Subscription Architecture (contracts/plans.ts, Paymob webhook exact amount verification, pro-router, frontend Pro.tsx)
2. Security, Authentication & Session Revocation (sessions table validation in SMS/Voice WS endpoints, dynamic WebAuthn RP ID/origin, transactional user purge service api/services/user-purge-service.ts across all 35+ user-scoped tables, local user avatar & phone sanitization)
3. Relational Database Integrity & Schema Optimization (db/relations.ts covering all 48 tables, discountCodes/referrals/apiKeyErrors relations, inverse relations on users/localUsers, missing indexes, drop redundant left-prefix duplicate indexes, atomic referral code application in db.transaction)
4. Timezone & Egyptian Business-Day Consistency (Africa/Cairo timezone for day boundaries, daily message counters, streaks, periodStartDay salary cycles, deterministic midnight transitions)
5. Server Performance, Advisory Locks & Provider Resilience (batchCreate batched IN queries in expense-router.ts, MySQL advisory locks in api/services/scheduler-lock.ts, ENABLE_CRONS/ENABLE_WHATSAPP flags defaulting to false in dev, circuit breakers for AI providers)
6. Error Standardization & UI Resilience (replace generic Error with TRPCError across sub-routers, fix Radix Dialog/Alert-Dialog warnings, reliable document title synchronization, clean repository hygiene)

Acceptance Criteria:
- `npm run check` passes with 0 TypeScript compiler errors.
- `npm test` passes with 100% passing tests (all 72+ suites, 430+ tests) with zero regressions.
- All verification test files pass (`api/lib/billing-plans.test.ts`, `api/lib/app-time.test.ts`, `api/lib/fireworks-embedding-client.test.ts`, etc.).
- Maintain detailed `progress.md`, `plan.md`, and `BRIEFING.md` in your working directory.
- When finished with complete verification and all tests passing, provide a full handoff and notify the Sentinel.
