# api/ — server

Facts: `docs/atlas/api.md`, `docs/atlas/entrypoints.md`, `docs/atlas/modules.md`. Diagram: `npm run arch`,
views `api`, `server_modules` and one `router_*` view per router.

What the code here does end to end, with its known issues: the system pages in `docs/systems/`. Find the
system of the file you are about to change in `docs/atlas/systems/files.md` and read it before editing.

## Layout
- `boot.ts`: the Hono app (middleware, Google OAuth start and callback, WhatsApp OTP SSE, Paymob webhook,
  the `/api/sms` sub-app, `/api/trpc`), cron registration, and the HTTP server that `npm start` runs.
  `npm run dev` mounts the same app inside Vite.
- `server.ts`: standalone entry for deploying the API on its own (`npm run backend:*`).
- `context.ts`: builds `ctx.user` from the `google_session` cookie (Google users) or a local session
  token; resolved sessions are cached (`lib/session-validation.ts`).
- `middleware.ts`: procedure builders with their rate limits and role/plan checks. `router.ts`: mounts
  every `*-router.ts`.
- `lib/`: shared logic, mostly the classification pipeline; see `lib/AGENTS.md`. `services/`: larger
  subsystems (AI kernel, action runtime, AI memory, finance semantic layer, voice, storage).
  `jobs/`: scheduled job bodies. `queries/connection.ts`: the MySQL pool.

## Rules
1. Pick the narrowest builder: `authedProcedure` for a user's own data, `aiProcedure` or
   `proAiProcedure` when a model is called, `adminProcedure` for anything that reads or changes other
   users. Validate input with zod; shared limits live in `contracts/constants.ts`.
2. Filter every read and write by `userId` and `userType`. Before storing a referenced id (wallet,
   business, contact), check it with `lib/ownership-guard.ts`.
3. Drizzle's `and()` does not parenthesize its arguments. A raw `sql` fragment containing `OR` inside
   `and(...)` must be wrapped in `or(...)` or parentheses, or the query escapes the user filter.
   (`tests/knowledge/architecture.test.ts`)
4. Money-moving writes run in `db.transaction()`, apply the daily rollup delta from
   `services/expense-rollups.ts`, and invalidate the user's expense cache after commit.
5. Before paying for a model call, check the budget (`assertAiBudget` in `lib/ai-usage-policy.ts`); record
   the tokens afterwards. Route models through `resolveRoutingConfig` and `lib/model-mapper.ts`.
6. In-process caches (classification results, muscle memory, settings, OTP state) are per process.
   Anything that must hold across replicas belongs in Redis or MySQL.
7. Throw `TRPCError` with a meaningful code; messages shown to users are Egyptian Arabic.
8. Settings, business time, environment variables, logging and jobs follow the golden rules in the root
   `AGENTS.md`.
