## 2026-08-25T03:01:56Z
Mission: Comprehensive survey of R3 (Performance Optimization), R4 (Database Architecture & Schema Review), and R5 (Code Logic, Security & Quality Hardening).

Objectives:
1. R4 Database Architecture & Schema:
   - Inspect all 48 tables in `db/schema.ts` and `db/relations.ts`. Identify missing relation exports (`discountCodes`, `referrals`, `apiKeyErrors`), missing inverse relations, redundant left-prefix duplicate indexes in `db/schema.ts`, and index coverage for high-frequency queries.
2. R3 Performance & R5 Backend Hardening:
   - Audit the 21+ tRPC sub-routers in `api/`, `api/middleware.ts`, `api/context.ts`, `api/lib/settings-cache.ts`, `api/services/scheduler-lock.ts`, and `api/expense-router.ts`.
   - Identify batch expense creation N+1 query optimization (`inArray` queries), advisory locks TS2344 type fix, TRPCError standardization, active session database checks in `sessions` table, local user avatar context resolution, phone number sanitization lockout, and Cairo timezone standardization in `app-time.ts`.
3. Formulate concrete implementation diffs, file boundaries, and verification commands (`npm run check`, `npm test`).
