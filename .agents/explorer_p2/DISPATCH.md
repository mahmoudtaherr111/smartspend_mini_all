# DISPATCH for Explorer P2 (Phase 3 Survey & Test Infra)

## 2026-08-29T10:05:00Z
Task: Investigate all Phase 3 P2 defense-in-depth targets and test infrastructure, mapping out exact vulnerabilities, line numbers, current behavior vs required secure behavior, affected types/contracts, and test harness details:
1. Expense Foreign Key & Ownership Checks: `api/expense-router.ts` — check `walletId` and `businessId` validation to ensure user ownership before inserting/updating expenses.
2. Zod Bounds & Schemas: `api/profile-router.ts`, `api/wallet-router.ts`, `api/ai-router.ts` — check input validations, missing string length limits, numerical bounds, and JSON schemas.
3. Execution Timeout Guards on AI SDK: `api/lib/ai-gateway.ts` and `api/lib/smart-pipeline.ts` — check timeout handling (30s guards) on external AI calls to prevent hung requests.
4. WebSocket Security on `/api/voice/live`: check WebSocket upgrade handling, origin validation, and session/auth checks.
5. tRPC Production ErrorFormatter: `api/middleware.ts` / `api/router.ts` — check errorFormatter behavior in production vs dev, ensuring no internal stack traces or database errors leak.
6. Test Infrastructure: Check test runner setup (`vitest.config.ts`, `package.json`, existing tests in `api/` and `tests/`) and how regression test suites can be structured.
