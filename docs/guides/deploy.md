# Deploying SmartSpend

Written from `Dockerfile`, `docker-compose.yml`, `package.json`, `api/boot.ts`, `api/server.ts` and `api/lib/env.ts`.
Update this page in the same change when any of them changes.

## What runs in production
`npm run build` builds the web app into `dist/public` and bundles `api/boot.ts` into `dist/boot.js`. `npm start` runs
`node dist/boot.js` with `NODE_ENV=production`: one Node process on `PORT` (default 3000) that serves

- the API: tRPC, the SMS ingestion sub-app, Google OAuth, the WhatsApp OTP event stream and the Paymob webhook;
- the live voice WebSocket at /api/voice/live, after an origin check;
- the built web app from `dist/public`, answering any other path outside /api/ with index.html;
- GET /health, which returns `{ status, timestamp }`.

Every route and scheduled job is listed in [entrypoints](../atlas/entrypoints.md).

## Docker
The image starts from node:20-alpine, runs `npm run build`, and starts with `npm start` on port 3000. It contains `dist`,
`node_modules` and `package.json` only, so it cannot run migrations (see Database).

`docker-compose.yml` defines:

| Service | Image | Host port | Notes |
| --- | --- | --- | --- |
| mysql | MySQL 8.4 | `MYSQL_PORT`, default 3308 | needs `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` in `.env` |
| redis | Redis 7.4 | `REDIS_PORT`, default 6379 | |
| app | built from the Dockerfile | `APP_PORT`, default 3000 | profile `app`; reads `.env`, and compose points `DATABASE_URL` and `REDIS_URL` at the two services |

Local services for development: `docker compose up -d mysql redis`. The whole stack:
`docker compose --profile app up -d --build`. The app service mounts no volume.

## Database
The schema is `db/schema.ts`. `npm run db:generate` writes SQL migrations to `db/migrations` (configured in
`drizzle.config.ts`); review them, then `npm run db:migrate` applies them to `DATABASE_URL`. Run migrations from a checkout
or a CI job before starting a new version. `npm run db:push` is only for a throwaway local database.

## Environment
The server validates its environment at boot in `api/lib/env.ts` and exits when a required variable is missing. The
current list, with defaults and the files that read each variable, is in [env](../atlas/env.md); `.env.example` is the
template. Decide these explicitly in production:

| Variable | What it controls |
| --- | --- |
| `APP_URL` | The public origin: allowed origins, links in notifications, WebAuthn. The default is http://localhost:5173. |
| `FRONTEND_URL`, `ALLOWED_ORIGINS` | Further exact origins allowed to call the API and open the voice WebSocket. |
| `TRUST_PROXY`, `TRUSTED_PROXY_IPS`, `TRUSTED_PROXY_HEADER` | Client IPs behind a reverse proxy. Without them per-IP limits see the proxy's address; the server logs a warning. |
| `REDIS_URL` | Shared rate limits and caches. Without Redis in production, the cache helpers in `api/lib/redis-client.ts` fall back to memory only when `AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION` is true, and rate limits fall back to per-process memory with a warning. |
| `ENABLE_CRONS` | Scheduled jobs run only where it is true. `.env.example` sets false and compose does not override it; without it nothing expires subscriptions, builds monthly reports, applies retention, reconciles rollups or deletes expired sessions. Each job takes a MySQL advisory lock, so enabling it on several instances is safe. |
| `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET` | Payments. In production the webhook answers 503 when `PAYMOB_HMAC_SECRET` is empty; outside production it skips the signature check instead. |
| `BILLING_SIMULATE` | Accepts demo transaction ids in upgrades. Never true in production. |
| `ENABLE_WHATSAPP` | Connects the WhatsApp client for OTP login. Its session lives in the whatsapp_auth_info folder under the working directory: give that folder a volume and run the client in one instance only. |
| `JWT_SECRET` | Signs sessions and is the fallback key for stored provider credentials. Any non-empty value passes validation, so generate a long random one. |
| `SENTRY_DSN` | Optional error reporting. |

## More than one instance
State kept in process memory does not cross processes: the classification result cache, muscle memory, the settings
cache, OTP codes and the OTP event stream (`api/AGENTS.md`, rule 6). WhatsApp OTP login completes only when the
browser's event stream reaches the same process as the WhatsApp client.

## API and web app deployed separately
- API: `npm run backend:build` bundles `api/server.ts` into `dist/server/server.js`, and `npm run backend:start` runs it
  (the script uses POSIX shell syntax for `NODE_ENV`). It loads `.env`, registers the same routes and jobs, serves the voice
  WebSocket, and does not serve the web app. Add the web app's origin to `FRONTEND_URL` or `ALLOWED_ORIGINS`.
- Web app: copy `.env.frontend.example` to `.env.local`, set `VITE_API_URL` to the API origin, and run
  `npm run frontend:build`; upload `dist/public` to any static host. `npm run frontend:dev` runs Vite on port 5173 and proxies
  /api to `VITE_API_URL`.

## Mobile
- `android/` and `ios/` are Capacitor apps around the built web app.
- `android-app/` is the native companion that forwards bank notifications; see [its README](../../android-app/README.md).
