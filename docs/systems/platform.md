# Server platform and data

The floor everything else stands on: the Hono server and its middleware, the request context that turns a
token into a user, the tRPC builders that carry the rate limits and role checks, environment validation, the
MySQL pool and schema, the Redis cache, the settings cache, Cairo business time, the scheduled-job lock, file
storage, the contracts shared with the web app, and the retention job that prunes old rows.

- Facts generated from the code, with diagrams: [docs/atlas/systems/platform.md](../atlas/systems/platform.md)
- The same story for readers who do not read code: [docs/ar/systems/platform.md](../ar/systems/platform.md)
- Folder rules while editing: `api/AGENTS.md`, `api/lib/AGENTS.md`, `db/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Server | `api/boot.ts` | The Hono app: middleware, Google OAuth start and callback, the OTP stream, the Paymob webhook, the `/api/sms` sub-app, `/api/trpc/*`, `/health`, the static files and the voice WebSocket in production, and the cron registrations |
| Standalone entry | `api/server.ts` | The same app served on its own, for deploying the API apart from the web app |
| Request context | `api/context.ts` | Resolves `ctx.user` from the Bearer header, the `smartspend_token`/`local_session` cookie or the `google_session` cookie, and the client IP |
| Builders | `api/middleware.ts` | The nine procedure builders, their rate limits and their role and plan checks |
| Root router | `api/router.ts` | Mounts every `*-router.ts` under its name |
| Environment | `api/lib/env.ts` | One Zod schema parsed at import: the server refuses to start without the required values |
| Database | `api/queries/connection.ts`, `db/schema.ts`, `db/relations.ts`, `db/table-classes.ts` | The MySQL pool with slow-query logging, the Drizzle schema, the relations that stand in for foreign keys, and every table's storage class |
| Cache | `api/lib/redis-client.ts`, `api/lib/cache-keys.ts` | Redis with an in-process fallback, the key shapes, counters and the sliding-window rate limiter |
| Settings | `api/lib/settings-cache.ts`, `api/lib/system-settings-registry.ts` | `system_settings` behind one cached read, and the registry of keys, defaults and secrets |
| Business time | `api/lib/app-time.ts` | The day and month boundaries of the ledger, in `APP_TIMEZONE` (Cairo) rather than the server's clock |
| Job lock | `api/services/scheduler-lock.ts` | A MySQL advisory lock so a job registered on every replica runs on one |
| Retention | `api/jobs/data-retention-job.ts` | Rolls up and prunes telemetry, conversation and ephemeral tables |
| File storage | `api/services/storage/` | One driver interface over local disk or S3-compatible storage, plus the avatar service |
| Shared contracts | `contracts/` | Input limits, plan prices and shared types the web app imports |
| Error log | `api/lib/error-logger.ts` | Classifies provider errors and records them in `api_key_errors` for the admin console |

## A request, end to end
1. HTTPS redirect (production), request log, compression, security headers, the forwarded-IP warning when
   `TRUST_PROXY` is off, then the origin policy: CORS and WebSocket origins come from `APP_URL`,
   `FRONTEND_URL` and `ALLOWED_ORIGINS`, never a wildcard.
2. `/api/trpc/*` builds the context. A Bearer header wins over cookies; the token's SHA-256 hash is looked up
   in the Redis principal cache first and only then in `sessions` plus the user table
   ([accounts](accounts.md)).
3. The procedure's builder applies its limit and checks: anonymous traffic 400 requests a minute per IP,
   sign-in and registration 25 per quarter hour, a signed-in user 100 a minute, and an AI call another 100 a
   minute on top. `proProcedure`, `proAiProcedure` and `ultraProcedure` check the plan (an admin passes), and
   `moderatorProcedure` and `adminProcedure` check the role.
4. Errors leave as `TRPCError`; in production an internal error is replaced by one Arabic sentence and the
   stack is dropped.

## Data
- MySQL through one pool: thirty connections in production, ten elsewhere, `utf8mb4`, keep-alive, and every
  query timed — anything over `SLOW_QUERY_THRESHOLD_MS` is logged.
- There are no foreign keys (golden rule 4). `db/relations.ts` describes the relations for Drizzle's query
  API, and integrity lives in application code. Every table has a storage class in `db/table-classes.ts`,
  from A (identity and configuration) to G (conversations), and `tests/table-classes.test.ts` fails when a new
  table has none.
- The retention job runs daily at 05:00 and walks the declared policies: user analytics after thirty days,
  classification logs, token ledgers, notification logs, ad clicks and voice usage after ninety, the action
  audit trail after a year, chat messages after ninety days once the conversation has a summary, and expired
  challenges and pending actions in between. Token ledgers and ad clicks are rolled up into `ai_cost_monthly`
  and `ad_stats_daily` before the rows go, and deletes run in chunks with a pause between them.

## Cache
- `getRedisClient` connects once with a two-second timeout and backs off after failures. Without Redis the
  cache falls back to an in-process map — but only outside production, unless
  `AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION` is set, because one replica's memory is not a shared cache.
- Keys are versioned: `sess:<hash>` for a resolved session, `authver:<type>:<id>` to invalidate them all at
  once, `cachegen:<type>:<id>` to invalidate a user's derived statistics, and `rl:` for the rate limiter.
- `system_settings` is read through `getSystemSettings()`, cached in the process for five minutes and cleared
  by `invalidateSettingsCache()` (golden rule 5).

## Jobs
Registered in `api/boot.ts` and only where `ENABLE_CRONS=true`; each takes a MySQL advisory lock named after
the job, so every replica may register it and one runs it (golden rule 7): expired sessions and challenges
(daily), classification logs older than 180 days (Sundays), scheduled notifications (every minute), the smart
activity check (20:00), the monthly report (1st at 02:00), the monthly behaviour snapshot (1st at 01:00), the
rollup reconciliation (04:00), data retention (05:00) and subscription expiry (06:00).

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| A configuration value | `api/lib/env.ts` (golden rule 8) | `tests/knowledge/architecture.test.ts` |
| Who may call a procedure, or its rate limit | `api/middleware.ts` | `tests/knowledge/architecture.test.ts` |
| A new router | the file plus `api/router.ts` | `tests/knowledge/architecture.test.ts` |
| A table | `db/schema.ts`, `db/relations.ts`, `db/table-classes.ts`, then `npm run db:generate` | `tests/table-classes.test.ts` |
| A scheduled job | `api/boot.ts` with `scheduleProtectedJob` | `tests/knowledge/architecture.test.ts` |
| How long telemetry is kept | `RETENTION_POLICIES` in `api/jobs/data-retention-job.ts` | `tests/data-retention-job.test.ts` |
| Where files are stored | `api/services/storage/` | `tests/storage-driver.test.ts` |
| Day and month boundaries | `api/lib/app-time.ts` (golden rule 6) | |

## Rules for changes here
1. Read configuration through `api/lib/env.ts`, never `process.env` (golden rule 8).
2. Ledger days and months come from `api/lib/app-time.ts`, not from server-local `Date` arithmetic
   (golden rule 6).
3. Background work is registered with `scheduleProtectedJob` (golden rule 7).
4. Anything that must hold across replicas belongs in Redis or MySQL; in-process caches are per replica
   (`api/AGENTS.md`, rule 6).
5. Never log message text, codes, tokens, phone numbers or transcripts (golden rule 10).

## Tests
`tests/table-classes.test.ts`, `tests/data-retention-job.test.ts`, `tests/storage-driver.test.ts`,
`tests/auth-hot-path.test.ts`, `tests/auth-session-verification.test.ts`, the suites in `tests/security/` and
the rule checks in `tests/knowledge/`.

## Known issues
Checked against the code; each one names where it lives.
1. Configuration read straight from `process.env` instead of `api/lib/env.ts` (golden rule 8):
   `api/services/storage/index.ts` and the S3 driver read the storage driver, bucket, endpoint, keys and
   public URL; `api/lib/ai-gateway.ts` reads the key that encrypts provider keys; the embedding warm-up in
   `api/boot.ts` reads the Fireworks key.
2. The Paymob webhook logs the whole payload it receives before verifying it (golden rule 10), so card
   metadata and the payer's details reach the server log ([billing](billing.md)).
3. In production every 404 that is not an API path reads `dist/public/index.html` from disk again, with no
   cache.
4. The OTP stream keeps its per-IP counters in a plain map that nothing prunes, so the map grows with the
   number of distinct addresses until the process restarts.
5. Sentry, when configured, is initialised with full tracing and profiling (`tracesSampleRate: 1.0`), which
   samples every request in production.
6. `ai_cost_monthly` is written by the retention rollup and read by nothing but account deletion, so the
   history the admin screens show ends where the ninety-day pruning starts.
7. `user_analytics` is pruned after thirty days, which also drops the upgrade events the founder metrics count
   and the AI cost events the cost overview reads ([admin](admin.md)).
8. `db/seed.ts` is an empty stub, so `npm run db:seed` prints two lines and exits.
9. `getPoolMetrics` reads private fields of the mysql2 pool (`_allConnections` and friends), which a library
   update can silently turn into zeroes.
10. The static files, the voice WebSocket and the production server only start when `api/boot.ts` is the
    entry and `NODE_ENV=production`; `api/server.ts` repeats the WebSocket wiring for the standalone
    deployment, and the two copies have to be kept in step by hand.

## Related systems
- [Accounts, sign-in and security](accounts.md): sessions, the principal cache and the auth version.
- [Admin console, support and growth tools](admin.md): the settings screen and the error log.
- [AI providers and usage limits](ai-platform.md): the settings and environment keys the providers use.
- [Notifications and WhatsApp](notifications.md), [Reports, insights and the smart
  profile](insights.md), [Plans and payments](billing.md): the scheduled jobs registered here.
- [Money: expenses, wallets, budgets, goals and businesses](money.md): the rollups the reconciliation job
  repairs.
