# AGENTS.md — SmartSpend AI

Behavioral financial platform for Arabic-speaking users (Egyptian market: EGP, local
e-wallets, Egyptian-dialect NLP). Full-stack TypeScript monorepo — the frontend and
backend share types via `contracts/` and run through tRPC v11 for end-to-end type safety.

This file is the **entry point** for any AI coding agent. It tells you how to run the
project, where code lives, and the invariants that will cause bugs if you violate them.
Deep domain detail lives in `docs/` — read only the file you actually need.

---

## 1. Tech stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React 18, Vite 7, TypeScript 5.9, Tailwind CSS 3.4, shadcn/ui (`src/components/ui/`), tRPC React Query (`src/providers/`) |
| Backend | Hono v4, tRPC v11 (`api/router.ts`), Drizzle ORM (`db/schema.ts`), MySQL 8 |
| AI / ML | Google Gemini (`@google/generative-ai`) + optional Groq / Fireworks / NVIDIA / Deepseek, 5-layer hybrid classification + NLP (`api/lib/`, `api/services/`) |
| Auth | Dual: Google OAuth (`users` + `google_session` cookie) and local/OTP (`localUsers` + Bearer JWT), plus WebAuthn passkeys (`userCredentials`) |
| Infra | Redis (rate limits, cache), Firebase (push), WebSockets, Pino logging, Sentry |
| Mobile | Capacitor (`ios/`, `android/`, `android-app/`) |

---

## 2. Commands (canonical — from `package.json`)

```bash
# ── Core dev ──
npm run dev              # Vite dev server (frontend + Hono backend via vite plugin)
npm run backend:dev      # standalone backend dev server (tsx watch api/server.ts)
npm run frontend:dev     # Vite frontend-only (--mode frontend)
npm run check            # TypeScript type-check across the monorepo (tsc -b)
npm run lint             # ESLint
npm run format           # Prettier (prettier --write .)

# ── Testing ──
npm run test             # Vitest unit/integration suite
npm run test:redis       # Redis integration tests (needs RUN_REDIS_INTEGRATION=1)
npm run test:e2e         # Playwright e2e
npm run test:e2e:ui      # Playwright e2e with UI
npm run test:all         # check + test + e2e (full pipeline)

# ── Build & deploy ──
npm run build            # build frontend + bundle backend (esbuild → dist/)
npm run start            # production server (cross-env NODE_ENV=production node dist/boot.js)
npm run backend:build    # esbuild standalone backend bundle
npm run backend:start    # production standalone backend
npm run frontend:build   # Vite frontend-only build
npm run preview          # Vite preview of built frontend

# ── Database ──
npm run db:generate      # generate Drizzle migrations
npm run db:push          # push schema directly to MySQL (dev)
npm run db:migrate       # apply migrations

# ── QA ──
npm run qa:seed          # seed AI-center QA dataset
npm run qa:ai-center     # run AI classification QA suite

# ── Mobile ──
npm run cap:sync         # sync Capacitor assets (tsx scripts/sync-capacitor-assets.ts)
```

> **ngrok tunnel** (not an npm script):
> `ngrok http --domain=nutty-husband-customary.ngrok-free.dev 3000`

- **Before committing**, always run `npm run check`.
- Run tests for the specific area you touched (co-located `*.test.ts` files) rather than
  the whole suite when iterating.

---

## 3. Repository layout

```
api/                 Backend (Hono + tRPC)
  router.ts            root appRouter (22 sub-routers)
  middleware.ts        tRPC procedure factories + RBAC + rate limits
  context.ts           createContext() + UnifiedUser
  boot.ts              Vite dev plugin + SSE + webhook routes
  server.ts            standalone production server
  *-router.ts          one file per domain (expense, ai, chat, auth, …)
  lib/                 AI engines, clients, model mapping, rate limits, utils
  services/            domain services (ai-kernel, ai-memory, voice, whatsapp, finance)
  jobs/                cron jobs (monthly-report-job.ts)
  queries/             MySQL pool + drizzle instance (connection.ts)
  qa/                  QA seed + runner
  scripts/             backend helper scripts
  types/               backend-specific types
db/                  Drizzle schema (schema.ts = 52 tables), relations.ts, seed.ts
contracts/           Shared FE/BE types + constants (types.ts, plans.ts, errors.ts, constants.ts)
src/                 React frontend
  components/          feature components + ui/ (shadcn)
  pages/               route views (Home, AICenter, Settings, Admin, …)
  providers/           trpc.ts, react-query … (App topology)
  hooks/ lib/ types/   utilities and shared types
  pwa/                 PWA service worker + manifest logic
tests/               additional Vitest suites
docs/                authoritative domain docs (see §5)
scripts/             build helper scripts (Capacitor asset sync)
public/              static assets / PWA
android/ ios/ android-app/   Capacitor mobile shells
drizzle.config.ts    Drizzle kit config
vite.config.ts vitest.config.ts playwright.config.ts tsconfig*  tooling config
```

> **Note:** `sms-router.ts` is **not** a tRPC router, so it is absent from `appRouter`.
> It is a live Hono sub-app mounted at `/api/sms` (`api/boot.ts`) serving the Android
> bank-SMS companion (`/ingest`, `/token/generate`, `/exchange`, `/android-connect`,
> `/metrics`, …); `profile-router.ts` also imports `storeMagicCode` from it. Not dead code.

**Ignore / do not edit** (housekeeping leftovers at repo root): `*.png`, `*.jsonl`,
`*_REPORT.md`, `*.md` reports like `FINAL_ENGINEERING_REPORT.md`, `.playwright-mcp/`,
`whatsapp_auth_info/`, `dist/`, `dev-dist/`, `.audit-*` folders, `scratch/`,
`.agents/`, `.opencode/`, `photos/`.

---

## 4. Invariants (read this before touching code)

### 4.1 User identity — never assume a single user table
There are **two** user tables: `users` (Google OAuth) and `localUsers` (password/OTP
+ WebAuthn). `api/context.ts` resolves auth in order:
1. `google_session` HTTP-only cookie → `users` (via `sessions` table, `userType='oauth'`).
2. `Authorization: Bearer <token>` → `sessions` table → `users` **or** `localUsers`
   depending on `userType`.

**Always use `ctx.user`** inside procedures. It's normalized to `UnifiedUser`
(`api/context.ts`):

```ts
type UnifiedUser = {
  id: number;
  name: string;
  email?: string | null;
  avatar?: string | null;
  role: "user" | "moderator" | "admin";
  plan: "free" | "pro" | "ultra";
  type: "oauth" | "local";
  phone?: string | null;
};
```

### 4.2 RBAC — `role` vs `plan`, and the procedure factories
`role` controls **admin** access only (`"user" | "moderator" | "admin"`). Subscription
tier lives in `plan` (`"free" | "pro" | "ultra"`). **Never** check `role === "pro"`.

Use the exported factories from `api/middleware.ts` instead of hand-rolled guards:

| Factory | Access | Rate limit |
| :--- | :--- | :--- |
| `publicProcedure` | unauthenticated | 400 req/min/IP |
| `strictPublicProcedure` | login/register/OAuth token | 25 req/15min/IP |
| `authedProcedure` | any logged-in user | 100 req/min/user |
| `aiProcedure` | any logged-in user (AI gen) | 100 req/min/user |
| `moderatorProcedure` | admin **or** moderator | — |
| `adminProcedure` | admin only | — |
| `proProcedure` | `pro` / `ultra` / `admin` | — |
| `proAiProcedure` | `pro` / `ultra` / `admin` + AI rate limit | 100 req/min/user |
| `ultraProcedure` | `ultra` / `admin` | — |

### 4.3 Boot-time env crash = Zod validation (`api/lib/env.ts`)
If the server exits on a `ZodError` at startup, `.env` is missing/empty values. Required
(min length 1): `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`JWT_SECRET`, `GEMINI_API_KEY`. Everything else is optional or has defaults.

- `BILLING_SIMULATE="true"` → test `pro.upgrade`/checkout without hitting Paymob.
- `ENABLE_CRONS`, `ENABLE_WHATSAPP` gate background jobs / Baileys (opt-in).

### 4.4 Model names go through mapping — don't hardcode old names
Resolve model strings via `api/lib/model-mapper.ts` + `api/lib/ai-provider-registry.ts`.

- `mapModelName()` (in `model-mapper.ts`): empty → `gemini-3.1-flash-lite`;
  `"flash"` → `gemini-3.1-flash-lite`; `"pro"`/`"ultra"` → `gemini-3.1-pro`;
  deprecated names normalize via `DEPRECATED_MODEL_MAP` (from `ai-provider-registry.ts`).
- Provider detection (all in `model-mapper.ts`): `isGeminiModel` / `isGroqModel` /
  `isFireworksModel` / `isNvidiaModel` decide which client handles a model.
- Per-plan defaults (in `model-mapper.ts`): `defaultGeminiModelForPlan()` /
  `defaultGroqModelForPlan()` / `defaultFireworksModelForPlan()` /
  `defaultNvidiaModelForPlan()`.
- Provider-agnostic default: `defaultModelForProvider()` (in `ai-provider-registry.ts`).
- AI clients live in `api/lib/`: `groq-client.ts`, `fireworks-client.ts`,
  `nvidia-client.ts`, `deepseek-client.ts`. Gemini uses `@google/generative-ai` directly.

Do **not** write old/guessed model strings like `gemini-1.5-flash` directly — route
through the mapper or use the per-plan defaults.

### 4.5 System settings — always use the cache (`api/lib/settings-cache.ts`)
Never `db.select().from(systemSettings)` directly. Use `getSystemSettings()` (in-process
cache, 5-min TTL). After an admin write to `system_settings`, call
`invalidateSettingsCache()`.

### 4.6 Drizzle relations — nearly exhaustive (`db/relations.ts`)
48 of 52 tables have relations defined in `db/relations.ts`. The 4 standalone/lookup
tables without relations are: `whatsappOtpCodes`, `onboardingQuestions`, `seoPages`,
`systemSettings`. Dual-user tables expose both `localUser` and `oauthUser` relations.
Prefer relational queries (`db.query.X.findMany({ with: { … } })`) over manual joins
for type safety.

### 4.7 SSE, Webhooks & Google OAuth live in `api/boot.ts`
- WhatsApp OTP is zero-polling SSE: `GET /api/sse/otp?phone=…`. Don't invent polling.
- Paymob webhook: `POST /api/webhooks/paymob` (HMAC validation).
- Google OAuth is dynamic: `GET /api/auth/google/start` and `/callback` dynamically compute and persist `oauth_redirect_uri` in cookies, allowing seamless multi-origin OAuth across `localhost:3000` and the permanent ngrok static tunnel (`https://nutty-husband-customary.ngrok-free.dev`).

---

## 5. Deeper documentation (`docs/`)

Read only the module for your task — they are long:

| Topic | File |
| :--- | :--- |
| Architecture & data flow | `docs/01-ARCHITECTURE.md` |
| Database schema (52 tables) | `docs/02-DATABASE_SCHEMA.md` |
| AI classification engine | `docs/03-AI_CLASSIFICATION_ENGINE.md` |
| tRPC routers & contracts | `docs/04-API_AND_TRPC_ROUTERS.md` |
| Auth, passkeys & RBAC | `docs/05-AUTH_AND_SECURITY.md` |
| SMS / Apple Pay / WhatsApp | `docs/06-SMS_AND_APPLE_PAY.md` |
| AI Center chatbot & RAG | `docs/07-AI_CENTER_AGENT.md` |
| AI product & rebuild plan | `docs/08-AI_AGENT_PRODUCT_AND_REBUILD_PLAN.md` |
| Release & incident playbook | `docs/09-RELEASE_AND_PLAYBOOK.md` |
| AI Center QA results | `docs/AI_CENTER_QA_RUNNER_LAST_RESULT.md` |
| Infrastructure capacity | `docs/INFRASTRUCTURE_CAPACITY_STUDY.md` |
| Logical edge cases | `docs/LOGICAL_EDGE_CASES_AUDIT.md` |

---

## 6. Conventions

- **Type safety is non-negotiable.** Shared schemas/types go in `contracts/`; validate
  runtime input with Zod (`zod` v4) in every tRPC procedure. Never widen a type to
  silence the compiler.
- **Expense input limits** are centralized in `contracts/constants.ts`
  (`ExpenseInputLimits`) — reference them rather than inlining magic numbers.
- **i18n / RTL.** The product is Arabic-first (RTL). UI copy is Arabic; keep new
  user-facing strings bilingual-aware (Arabic primary). Technical identifiers, code, and
  comments stay in English.
- **Error handling.** Throw `TRPCError` with a user-facing Arabic message (English codes)
  and a stable `code`. Don't leak stack traces or internals to the client.
- **Testing.** Tests colocate with source as `*.test.ts` (Vitest). E2E is Playwright
  (`tests/`, `playwright.config.ts`). Add a test when fixing a bug or adding a route.
- **Formatting.** ESLint + Prettier (`npm run lint` / `npm run format`). Follow the
  existing style in the file you're editing.