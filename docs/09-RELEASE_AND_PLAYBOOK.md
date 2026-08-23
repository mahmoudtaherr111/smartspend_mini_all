# 🚀 SmartSpend AI — Release Checklist & Incident Playbook

This document is the authoritative Single Source of Truth (SSoS) for deploying SmartSpend AI to production and resolving runtime incidents.

---

## 📋 1. Pre-Release Checklist (Deploy Gate)

Before deploying any changes to production, the engineer must execute and verify the following gates:

### Step 1: Type Validation & Core Compilation
Ensure there are no compilation errors in shared types, frontend components, or Hono procedures:
```bash
npm run check
```
*   **Gate:** Must output `tsc -b` success with zero compile errors.

### Step 2: Complete Test Suite Run
Execute the full Vitest suite to verify classification waterfalls, capability routing, and memory scopes:
```bash
npm test
```
*   **Gate:** All 424 tests across 68 test suites must pass. Zero regressions allowed.

### Step 3: Environment Variable Audit
Verify that production environment variables are configured correctly in the deployment environment:
*   `DATABASE_URL`: Must target production MySQL (port 3306 or cluster endpoint).
*   `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: Configured for oauth callback.
*   `JWT_SECRET`: High-entropy production key.
*   `GEMINI_API_KEY`: Active Google Generative AI key.
*   `BILLING_SIMULATE`: Must be set to `"false"` in production.
*   `REDIS_URL`: Target Redis cache for production speedups.

---

## 🚀 2. Production Deployment Steps

Follow this order during release windows (prefer low-traffic hours: 2:00 AM - 4:00 AM EET):

1.  **Backup Database:** Run a production database dump before running migrations:
    ```bash
    mysqldump -h <host> -u <user> -p smartspend > backup_before_release.sql
    ```
2.  **Apply Migrations:** Run Drizzle push to update MySQL schema:
    ```bash
    npm run db:push
    ```
3.  **Deploy Backend:** Rebuild and deploy Hono standalone production bundle:
    ```bash
    npm run backend:build
    npm run backend:start
    ```
4.  **Deploy Frontend:** Build and bundle Vite PWA static assets:
    ```bash
    npm run frontend:build
    ```
5.  **Audit Service Worker:** Verify the generated `/sw.js` matches the Workbox configuration and does not cache API routes.

---

## 🚨 3. Incident Response Playbook

### Incident A: LLM Provider Outage or Rate Limit (Gemini/Fireworks 429/500)
*   **Symptoms:** User sends chat message, gets a long delay followed by a generic fallback reply, or logs show `API_OUTAGE` or `RATE_LIMIT` errors.
*   **Mitigation Actions:**
    1.  **Validate local fallback:** The system automatically falls back to deterministic rule engines (`rule-engine.ts`) and lexical local memory search if the LLM fails. Verify user queries still classify correctly.
    2.  **Adjust Coercion:** If Fireworks is down, change the model provider mappings in `api/lib/model-mapper.ts` to route requests through Google Gemini API.
    3.  **Rate-limit tuning:** Lower the maximum daily tokens allowed for free users under `chatbot_daily_limit_free` in the `systemSettings` table.

### Incident B: Cost Runaway (Sudden spike in LLM token charges)
*   **Symptoms:** Dashboard shows abnormal token usage or extreme cost units on specific routes.
*   **Mitigation Actions:**
    1.  Go to the **Admin Cost & Quality Dashboard** in `/admin` (AI tab).
    2.  Locate the offending route or user ID from the "AI Cost & Quality Observability" panel.
    3.  If a single user is spamming, block their sessions or downgrade their plan.
    4.  Enable stricter token caps in `api/services/ai-cost-policy.ts` by lowering `ExpenseInputLimits` thresholds.

### Incident C: Database Connection Loss / High Latency
*   **Symptoms:** tRPC errors outputting `ER_ACCESS_DENIED` or `pool connection timeout`.
*   **Mitigation Actions:**
    1.  Verify the connection port. SmartSpend local Docker uses `3308`, while production server must bind to `3306`.
    2.  Check the thread pool usage of the MySQL instance. Restart connection pools if threads are hanging due to unclosed statements.
    3.  Ensure Redis cache is active (`REDIS_URL` is parsed). If Redis is down, the system falls back to RAM cache, which is safe but increases database read latency for summaries.

### Incident D: Failed Schema Migration (Drizzle mismatch)
*   **Symptoms:** Server crashes on boot with `DrizzleQueryError` or queries fail due to missing columns.
*   **Mitigation Actions:**
    1.  Immediately stop the backend server.
    2.  Restore the database backup dump:
        ```bash
        mysql -h <host> -u <user> -p smartspend < backup_before_release.sql
        ```
    3.  Roll back frontend assets to the previous git tag.
    4.  Investigate the schema drift using `npx drizzle-kit drop` and re-generate migrations.
