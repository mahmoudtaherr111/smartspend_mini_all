# 🚀 SmartSpend AI — Release Checklist & Incident Playbook

> **AI AGENT SSOT:** This document is the authoritative Single Source of Truth for deploying SmartSpend AI to production and resolving runtime incidents.

---

## 📋 1. Pre-Release Checklist (Deploy Gate)

Before deploying any changes to production, the engineering team must execute and verify the following release gates:

### Step 1: Type Safety & Monorepo Compilation
Ensure there are zero TypeScript compilation errors in frontend components, Hono backend procedures, or shared contracts:
```bash
npm run check
```
*   **Gate Requirement:** `tsc -b` must exit with code 0 and zero type errors.

### Step 2: Comprehensive Test Suite Execution
Execute the Vitest test suite to verify classification waterfalls, capability routing, memory scopes, and router procedures:
```bash
npm test
```
*   **Gate Requirement:** All unit, integration, and semantic test suites must pass cleanly with zero regressions.

### Step 3: Production Environment Variable Audit
Verify that production environment variables are configured correctly in the hosting container / environment:
*   `DATABASE_URL`: Must target production MySQL 8 instance (default port `3306`).
*   `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: Configured for live OAuth redirect URLs.
*   `JWT_SECRET`: High-entropy production key (minimum 32 characters).
*   `GEMINI_API_KEY`: Active Google Generative AI API key.
*   `BILLING_SIMULATE`: Must be set to `"false"` in production.
*   `REDIS_URL`: Target production Redis cache instance (`redis://...`).
*   `APP_TIMEZONE`: Production business timezone (must be `Africa/Cairo`).
*   `ENABLE_CRONS`: Set to `"true"` on scheduler-enabled replicas (MySQL advisory locks via `scheduler-lock.ts` prevent duplicate executions).
*   `ENABLE_WHATSAPP`: Set to `"true"` on the replica hosting the WhatsApp web client instance.
*   `PAYMOB_HMAC_SECRET`: Required for live Paymob webhook signature validation.

### Local Dependency Stack (Docker Compose)
For local development and integration testing, reproducible MySQL 8 and Redis 7 services are defined in `docker-compose.yml`:
```bash
docker compose up -d mysql redis
npm run db:push
npm run dev
```
*Local ports:* MySQL runs on `3308` (to avoid conflicting with default MySQL on 3306), Redis on `6379`.

---

## 🚀 2. Production Deployment Sequence

Follow this order during scheduled release windows (prefer low-traffic hours: 2:00 AM – 4:00 AM EET):

1.  **Backup Database:** Run a production database dump before executing schema migrations:
    ```bash
    mysqldump -h <host> -u <user> -p smartspend > backup_before_release.sql
    ```
2.  **Generate & Apply Drizzle Schema Migrations:**
    ```bash
    npm run db:generate
    npm run db:migrate
    ```
    *(Note: `npm run db:push` is restricted to disposable local development databases).*
3.  **Build & Launch Backend Service:**
    ```bash
    npm run backend:build
    npm run backend:start
    ```
4.  **Build & Bundle Frontend PWA Static Assets:**
    ```bash
    npm run frontend:build
    ```
5.  **Audit Service Worker & Caching:** Verify the generated `/sw.js` matches the Workbox configuration and excludes all dynamic `/api/` routes.

---

## 🚨 3. Incident Response Playbooks

### Incident A: LLM Provider Outage or Rate Limit (Gemini/Fireworks 429/500)
*   **Symptoms:** Chat requests experience high latency followed by generic fallback responses, or logs record `API_OUTAGE` / `RATE_LIMIT` errors.
*   **Mitigation Actions:**
    1.  **Validate Local Fallback:** The system automatically falls back to Layer 1 (Muscle Memory), Layer 2 (Deterministic Rule Engine), and Layer 3 (Local TF-IDF Vector Search). Verify that standard transaction logging continues uninterrupted.
    2.  **Model Coercion / Provider Switch:** Update provider mappings in `api/lib/model-mapper.ts` or set dynamic model overrides in the `systemSettings` table.
    3.  **Circuit Breaker Recovery:** Suspended Fireworks accounts trigger a local 15-minute circuit breaker; once provider billing is restored, restart affected backend replicas or allow the circuit breaker to close.

### Incident B: Cost Runaway (Spike in LLM Token Consumption)
*   **Symptoms:** Dashboard alerts show abnormal external token consumption rates.
*   **Mitigation Actions:**
    1.  Open the **AI Cost & Quality Observability Dashboard** in `/admin`.
    2.  Identify the offending route, procedure, or user account.
    3.  If an individual user is abusing endpoints, revoke active sessions via `api/session-router.ts` or downgrade their tier.
    4.  Tighten input constraints in `contracts/constants.ts` by lowering `ExpenseInputLimits` thresholds.

### Incident C: Database Connection Loss / High Latency
*   **Symptoms:** tRPC procedures return `ER_ACCESS_DENIED` or connection pool timeouts.
*   **Mitigation Actions:**
    1.  Verify the connection port: local Docker binds to `3308`, whereas production binds to `3306`.
    2.  Inspect MySQL thread pool utilization; restart stale connection pools if connections are leaked by unclosed statements.
    3.  Verify Redis connectivity (`REDIS_URL`). If Redis is unavailable, the in-process LRU cache provides safe fallback.

### Incident D: Failed Schema Migration
*   **Symptoms:** Server crashes on startup with `DrizzleQueryError` due to mismatched column definitions.
*   **Mitigation Actions:**
    1.  Immediately stop the backend server process.
    2.  Restore the database from the pre-release backup:
        ```bash
        mysql -h <host> -u <user> -p smartspend < backup_before_release.sql
        ```
    3.  Roll back frontend assets to the previous release tag.
    4.  Investigate schema diffs using `npx drizzle-kit drop` and re-generate migrations.
