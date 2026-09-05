## 2026-08-29T12:07:09Z
You are a teamwork_preview_worker assigned to implement Phase 1 & Phase 2 Security Remediations for SmartSpend.
Your working directory is: e:/smartspend_V1_fixed/.agents/worker_p1
The authoritative user request is: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md
The security audit report is: e:/smartspend_V1_fixed/SECURITY_AUDIT_REPORT.md
Survey analysis reference: e:/smartspend_V1_fixed/.agents/explorer_survey_1/survey_phase1.md and e:/smartspend_V1_fixed/.agents/explorer_survey_2/survey_phase2.md

Exclusively Owned Files:
- api/boot.ts
- api/server.ts
- api/auth-router.ts
- api/lib/get-client-ip.ts
- db/schema.ts
- api/lib/subscription-service.ts
- api/middleware.ts
- api/services/ai-kernel/index.ts
- api/lib/smart-pipeline.ts

Tasks to Implement:
1. Paymob Webhook Verification (api/boot.ts): Ensure fail-closed HMAC signature verification on /api/webhooks/paymob across all environments (remove any NODE_ENV === 'production' bypass if secret is missing).
2. Google OAuth CSRF & State Verification (api/auth-router.ts & api/boot.ts): Add state parameter to googleCallback input schema in api/auth-router.ts, validate state against oauth_state cookie using timingSafeEqual, and validate Host/X-Forwarded-Host headers against allowed hosts in api/boot.ts.
3. Client IP & Rate Limiting (api/lib/get-client-ip.ts): Prevent IP spoofing via X-Forwarded-For headers (prioritize cf-connecting-ip / x-real-ip / rightmost trusted hop), avoid shared global 127.0.0.1 lockout by generating unique per-connection or non-global fallback identifiers.
4. HTTP Security Headers & CORS (api/boot.ts & api/server.ts): Apply secure HTTP headers (CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff), and replace loose substring origin matching in CORS with strict regex/whitelist origin checks.
5. Subscription TOCTOU & Idempotency (db/schema.ts & api/lib/subscription-service.ts): Add uniqueIndex on transactionId in proSubscriptions schema, wrap grantProSubscription in db.transaction(), and preserve active remaining subscription duration on early renewals.
6. AI Rate Limiting & Prompt Delimiters (api/middleware.ts, api/services/ai-kernel/index.ts, api/lib/smart-pipeline.ts): Apply plan-aware rate limits in middleware (e.g., free: 15, pro: 60, ultra: 120 req/min) and wrap user input/facts in XML boundary delimiters (<user_query>, <verified_facts>) to prevent prompt injection role confusion.
