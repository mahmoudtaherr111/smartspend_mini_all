# AGENTS.md

Brief for AI coding agents in this repository. It stays short on purpose: facts are generated from the
code, and every rule names the check that enforces it (`unenforced` means nothing does yet).

## The product
SmartSpend AI is an Arabic-first money app for Egypt. People record spending by typing or speaking
Egyptian Arabic, by forwarding bank and wallet notifications from their phone, or from receipts; the API
turns each sentence into categorized transactions, and an AI Center answers questions about the ledger.

`src/` React + Vite PWA (Capacitor shells in `android/` and `ios/`) · `api/` Hono + tRPC on Node ·
`db/` Drizzle schema for MySQL · `contracts/` code shared by both · `android-app/` native companion that
forwards bank and wallet notifications.

## Trust order
1. The code.
2. Generated facts: `docs/atlas/` and `docs/architecture/generated/`, rebuilt from the code by `npm run atlas`.
3. The rules in this file and in the nearest folder `AGENTS.md`, each backed by the check it names.
4. System explanations in `docs/systems/`: hand-written, but each one is recorded as checked against the code
   it describes, and `npm run agent:finish` asks for a new check as soon as that code changes.
5. Other hand-written descriptions: flows in `docs/architecture/flows/` (their steps are held to the code by
   `tests/knowledge/flows.test.ts`), module descriptions in `docs/architecture/clusters.json`, `docs/guides/`
   and `docs/decisions/`. They were checked against the code when written; confirm a detail in the code
   before you rely on it.
6. `docs/reports/`: output of past runs. History, never current truth.

Never quote a count from memory or from an old document; read it from `docs/atlas/README.md`.

## Where to look
| Question | Look at |
| --- | --- |
| What a part of the app does end to end, how to change it, and its known issues | `docs/systems/README.md`, then that system's page |
| What is waiting to be fixed, and how fresh each explanation is | `docs/atlas/systems/state.md` |
| Who else is changing this repository right now, and whether they touch your files | `npm run who` |
| Which systems a file belongs to (shared files are split by procedure, route and job) | `docs/atlas/systems/files.md` |
| Which procedures exist, who may call them, which tables they touch, which screens call them | `docs/atlas/api.md` |
| Tables, storage classes, relations, who reads and writes each table | `docs/atlas/database.md` |
| HTTP routes, webhooks, SSE, WebSocket, scheduled jobs, middleware order | `docs/atlas/entrypoints.md` |
| Browser routes, route guards, procedures per page | `docs/atlas/frontend.md` |
| Code modules, what each one does, their dependencies, external systems | `docs/atlas/modules.md` |
| Environment variables | `docs/atlas/env.md` |
| Impact questions ("who writes expenses?") or one journey as a diagram | the `likec4` MCP server, or `npm run arch`; see `docs/architecture/README.md` |
| What changed recently, and which tool changed it | `npm run changes` |
| Rules for a folder | `api/AGENTS.md`, `api/lib/AGENTS.md`, `src/AGENTS.md`, `db/AGENTS.md` |
| Why something is built the way it is | `docs/decisions/` |
| How agents work here and what the hooks do | `docs/guides/agent-workflow.md` |
| Which tests exist, what they need, where CI runs them | `docs/guides/testing.md` |
| Deployment, Docker, production environment | `docs/guides/deploy.md` |

The generated files are large: search them for a name instead of reading them whole.

## Working protocol
Several agents change this repository at the same time. These steps keep everyone on the same code:
1. Start: `npm run sync` merges `origin/main` into your branch. Claude Code and Codex are told their sync
   status when a session starts; other tools run it at the start of every task.
2. Before editing, read the explanation of the system you are touching — find it through
   `docs/atlas/systems/files.md` — and the `AGENTS.md` of the folder (`api/`, `api/lib/`, `src/`, `db/`).
   Codex and some other tools do not load nested instruction files on their own.
3. Finish: `npm run agent:finish` regenerates the atlas and checks every rule below. Fix what it reports and
   commit the code together with the regenerated files.
4. Ship: `npm run ship` merges `origin/main` again and pushes your branch to `main`; when `main` moved
   meanwhile, it merges and pushes again. Ship each finished step the same day: a branch that lives for days
   collects conflicts.

Git hooks back this up for every tool, and `npm install` or `npm run hooks:install` installs them: commits
get the regenerated atlas and an `Agent:` trailer naming the tool, merges regenerate the atlas instead of
conflicting, and pre-push refuses a push while a rule is broken. Claude Code and Codex also run
`agent:finish` when a turn ends, and CI regenerates a stale atlas on main. Details and per-tool setup:
`docs/guides/agent-workflow.md`.

## Commands
| Task | Command |
| --- | --- |
| Install (also installs the git hooks) | `npm ci`; architecture tools: `npm run arch:install` |
| Start a task / check it / publish it to `main` | `npm run sync` / `npm run agent:finish` / `npm run ship` |
| App in development (Vite on port 3000 with the API from `api/boot.ts`) | `npm run dev` |
| API alone (`api/server.ts`) | `npm run backend:dev` |
| Types and generated facts | `npm run check` |
| One test file / tests of the files you changed | `npx vitest run <path>` / `npx vitest related --run <files>` |
| Database, Redis and build-output tests (`docs/guides/testing.md`) | `npm run test:db`, `npm run test:redis`, `npm run test:build` |
| Regenerate the atlas and the architecture model | `npm run atlas` |
| Record a system explanation as checked against the code | `npm run docs:verify -- <id>`, and `-- <id> --ar` for the Arabic page |
| Who else is working, and on which files | `npm run who` |
| Architecture map / validation | `npm run arch` / `npm run arch:validate` |
| Schema change | `npm run db:generate`, review, `npm run db:migrate` (`db:push` only on a throwaway local database) |
| Production build and start (the Docker image runs `dist/boot.js`) | `npm run build`, `npm start` |

Lint errors that predate the lint rules are frozen in `eslint-suppressions.json`: a new violation fails
`npm run lint`, and after fixing old ones run `npm run lint:prune`. If a check fails on files you did not
touch, say so in your report and do not change unrelated code to make it pass.

## Golden rules
1. Identity is a pair. Google users live in `users`, phone/password users in `local_users`; every
   user-owned row carries `user_id` and `user_type`, and every query filters on both. Take the caller
   from `ctx.user`. (the user index and account deletion are checked by `tests/knowledge/architecture.test.ts`;
   query filters are unenforced)
2. `role` is admin/moderator access; `plan` (`free`, `pro`, `ultra`) is the subscription. Never compare
   `role` with a plan name. (`tests/knowledge/architecture.test.ts`)
3. Every tRPC procedure uses a builder exported by `api/middleware.ts` and is mounted through
   `api/router.ts`. (`tests/knowledge/architecture.test.ts`)
4. There are no foreign keys. Integrity lives in application code, relations in `db/relations.ts`, and
   every table has a storage class in `db/table-classes.ts`; see `docs/decisions/`.
   (`tests/table-classes.test.ts`, `tests/knowledge/architecture.test.ts`)
5. Read `system_settings` through `getSystemSettings()` in `api/lib/settings-cache.ts` and call
   `invalidateSettingsCache()` after writing it. The cache is per process. (writers are checked by
   `tests/knowledge/architecture.test.ts`; reads are unenforced)
6. Ledger days and months are Cairo business time: use `api/lib/app-time.ts`, not server-local `Date`
   arithmetic or `toISOString()` slices. (unenforced)
7. Background work is registered with `scheduleProtectedJob` in `api/boot.ts`; it takes a MySQL advisory
   lock and runs only where `ENABLE_CRONS=true`. (`tests/knowledge/architecture.test.ts`)
8. Server configuration is validated in `api/lib/env.ts`; add a variable there instead of reading
   `process.env`. (`tests/knowledge/architecture.test.ts` rejects new direct reads)
9. Model ids go through `mapModelName()` in `api/lib/model-mapper.ts`. (unenforced)
10. Never log message text, OTP codes, tokens, phone numbers or voice transcripts. (unenforced)
11. Generated files are never edited or merged by hand. The merge driver and the hooks regenerate them; if a
    conflict still appears, take either side and run `npm run atlas`. (`npm run agent:finish`, CI)

## Definition of done
1. `npm run agent:finish` reports no broken rule, and the tests of the files you touched pass (it prints the
   `npx vitest related` command for them).
2. The regenerated files in `docs/atlas/` and `docs/architecture/generated/` are in the same commit as the
   code. The pre-commit hook adds them when every changed code file is staged.
3. `agent:finish` names a system explanation your change made stale: read it, correct whatever no longer
   matches the code — including the known issues — then `npm run docs:verify -- <id>`. An edited English page
   asks for the Arabic page in `docs/ar/systems/` to be brought in line and re-checked with `--ar`. The
   pre-push hook refuses the push while a page your branch made stale is unchecked.
4. A new runtime file that no module rule matches: add it to `docs/architecture/clusters.json`, with a
   description of what the module does that you checked in the code, and give the file a system in
   `docs/architecture/systems.json`. A new SDK or host of an outside service: add it to
   `docs/architecture/externals.json`.
5. You changed a journey drawn in `docs/architecture/flows/`: update its steps and its description.
6. A decision that changes how the system is built: add a record to `docs/decisions/`.
7. Plans, prompts, hand-offs and session notes stay out of `docs/`: put them in `.agents/`, which git ignores
   except for `.agents/rules/`.
