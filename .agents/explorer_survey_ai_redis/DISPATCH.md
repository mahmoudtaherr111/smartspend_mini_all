## 2026-08-29T11:24:04Z

Investigate the SmartSpend codebase regarding AI pipelines, external latency, Redis caching, real-time connections, and background workers:
1. Analyze the AI classification engine and AI chat service in `api/lib/`, `api/services/` (Gemini API clients, model mapping `api/lib/model-mapper.ts`, hybrid 5-layer classification, prompt tokens, response times 500ms-2500ms).
2. Analyze Redis usage across the codebase (`api/lib/redis.ts`, rate limiters in `api/middleware.ts`, system settings cache `api/lib/settings-cache.ts`, session storage, locking/queues).
3. Analyze real-time and long-lived connection overhead:
   - SSE for WhatsApp OTP (`/api/sse/otp`) in `api/boot.ts`
   - WebSockets / push notifications
   - WhatsApp Baileys integration (`ENABLE_WHATSAPP`) memory and event loop impact
   - Cron jobs (e.g. `api/jobs/monthly-report-job.ts`) resource spikes
4. Profile how external AI latency blocks or does not block the Node.js event loop, connection concurrency limits, and memory per active streaming / pending request.
