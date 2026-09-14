# AGENTS.md

Brief for AI coding agents in this repository. It stays short on purpose: facts are generated from the
code, and every rule names the check that enforces it (`unenforced` means nothing does yet).

## The product
SmartSpend AI is an Arabic-first money app for Egypt. People record spending by typing or speaking
Egyptian Arabic, by forwarding bank SMS, or from receipts; the API turns each sentence into categorized
transactions, and an AI Center answers questions about the ledger.

`src/` React + Vite PWA (Capacitor shells in `android/` and `ios/`) · `api/` Hono + tRPC on Node ·
`db/` Drizzle schema for MySQL · `contracts/` code shared by both · `android-app/` native SMS forwarder.

## Trust order
1. The code.
2. Generated facts: `docs/atlas/` and `docs/architecture/generated/`. `npm run atlas:check` fails when they drift.
3. The rules in this file and in the nearest folder `AGENTS.md`.
4. `docs/architecture/flows/`: hand-drawn flows, held to the code by `tests/knowledge/flows.test.ts`.
5. `docs/reports/`: output of past runs. History, never current truth.

Never quote a count from memory or from an old document; read it from `docs/atlas/README.md`.

## Where to look
| Question | Look at |
| --- | --- |
| Which procedures exist, who may call them, which tables they touch, which screens call them | `docs/atlas/api.md` |
| Tables, storage classes, relations, who reads and writes each table | `docs/atlas/database.md` |
| HTTP routes, webhooks, SSE, WebSocket, scheduled jobs, middleware order | `docs/atlas/entrypoints.md` |
| Browser routes, route guards, procedures per page | `docs/atlas/frontend.md` |
| Code modules, their dependencies, external systems | `docs/atlas/modules.md` |
| Environment variables | `docs/atlas/env.md` |
| The system or one journey as a diagram | `npm run arch`, see `docs/architecture/README.md` |
| Rules for a folder | `api/AGENTS.md`, `api/lib/AGENTS.md`, `src/AGENTS.md`, `db/AGENTS.md` |
| Why something is built the way it is | `docs/decisions/` |
| Deployment, Docker, production environment | `docs/guides/deploy.md` |

## Commands
| Task | Command |
| --- | --- |
| Install | `npm ci`; architecture tools: `npm run arch:install` |
| App in development (Vite on port 3000 with the API from `api/boot.ts`) | `npm run dev` |
| API alone (`api/server.ts`) | `npm run backend:dev` |
| Types and generated facts | `npm run check` |
| One test file | `npx vitest run <path>` |
| Regenerate the atlas and the architecture model | `npm run atlas` |
| Architecture map / validation | `npm run arch` / `npm run arch:validate` |
| Schema change | `npm run db:generate`, review, `npm run db:migrate` (`db:push` only on a throwaway local database) |
| Production build and start (the Docker image runs `dist/boot.js`) | `npm run build`, `npm start` |

Known state (2026-09-14): `npm run check` fails on type errors in `src/components/profile/SmartProfileSettings.tsx`,
`src/pages/Admin.tsx` and `api/profile-router.ts`, and the full test run has failures that need a live MySQL.
Do not run the whole suite with uncommitted work: `tests/unlock.test.ts` runs `git add -A && git commit`.

## Golden rules
1. Identity is a pair. Google users live in `users`, phone/password users in `local_users`; every
   user-owned row carries `user_id` and `user_type`, and every query filters on both. Take the caller
   from `ctx.user`. (unenforced)
2. `role` is admin/moderator access; `plan` (`free`, `pro`, `ultra`) is the subscription. Never compare
   `role` with a plan name. (unenforced)
3. Every tRPC procedure uses a builder exported by `api/middleware.ts` and is mounted through
   `api/router.ts`. (`npm run atlas` warns about builders it cannot resolve)
4. There are no foreign keys. Integrity lives in application code, relations in `db/relations.ts`, and
   every table has a storage class in `db/table-classes.ts`. (`tests/table-classes.test.ts`)
5. Read `system_settings` through `getSystemSettings()` in `api/lib/settings-cache.ts` and call
   `invalidateSettingsCache()` after writing it. The cache is per process. (unenforced)
6. Ledger days and months are Cairo business time: use `api/lib/app-time.ts`, not server-local `Date`
   arithmetic or `toISOString()` slices. (unenforced)
7. Background work is registered with `scheduleProtectedJob` in `api/boot.ts`; it takes a MySQL advisory
   lock and runs only where `ENABLE_CRONS=true`. (listed in `docs/atlas/entrypoints.md`)
8. Server configuration is validated in `api/lib/env.ts`; add a variable there instead of reading
   `process.env`. (`docs/atlas/env.md` lists direct reads)
9. Model ids go through `mapModelName()` in `api/lib/model-mapper.ts`. (unenforced)
10. Never log message text, OTP codes, tokens, phone numbers or voice transcripts. (unenforced)
11. Generated files are never edited or merged by hand. On a conflict in `docs/atlas/` or
    `docs/architecture/generated/`, take either side and run `npm run atlas`. (`npm run atlas:check`)

## Definition of done
1. `npm run check` passes (see known state), and the tests covering the files you touched pass.
2. You changed a router, procedure, table, route, job, page, environment variable or module: run
   `npm run atlas` and commit the regenerated files in the same commit.
3. A new runtime file that no module rule matches: add it to `docs/architecture/clusters.json`. A new
   SDK or host of an outside service: add it to `docs/architecture/externals.json`.
4. You changed a journey drawn in `docs/architecture/flows/`: update the flow so
   `tests/knowledge/flows.test.ts` still passes.
5. Plans, prompts, hand-offs and session notes stay out of `docs/` (use `.agents/`, which git ignores).
