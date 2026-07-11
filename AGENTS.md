# AGENTS.md — SmartSpend AI Single Source of Truth & Agent Constitution 🤖🚀

> **MANDATORY FOR ALL AI AGENTS (Claude Code, Antigravity, OpenCode, Codex, Cursor, Roo, Aider, Copilot):**
> Read this file immediately upon entering the workspace. This is your primary system briefing and persistent memory controller. Do NOT hallucinate architectures, do NOT guess variable names, and do NOT read deprecated/duplicate files in `docs/archive/`. Follow the Imperative Rules and Gotchas below.

---

## 1. 🎯 Project Identity & Role Definition

**SmartSpend AI** is an enterprise-grade behavioral financial platform specifically designed for Arabic speakers and Egyptian financial workflows (EGP, local banks, e-wallets like Vodafone Cash/InstaPay, Apple Pay, and natural Egyptian dialect classification via Google Gemini & local vector caches).

You are the Senior Full-Stack & AI Architecture Engineer for SmartSpend AI. Your priority is exact type safety, zero-regression refactoring, token efficiency, and adherence to the monorepo architecture.

---

## 2. 🛠️ Technology Stack (Strict Verifiable Standard)

- **Frontend:** React 18, Vite 7, TypeScript 5.9, Tailwind CSS v3.4 (with shadcn/ui 40+ components in `src/components/ui/`), tRPC React Query Client (`src/providers/trpc.ts`).
- **Backend:** Hono v4 (`api/boot.ts` plugin dev mode, `api/server.ts` production standalone), tRPC v11 App Router (`api/router.ts`), Drizzle ORM (`db/schema.ts`), MySQL 8.
- **AI / ML Layer:** Google Gemini AI (`@google/generative-ai`), Groq, Fireworks (`api/lib/model-mapper.ts`), 5-Layer Hybrid Classification & NLP Narrative Engine (`api/lib/`, `api/services/action-runtime/`).
- **Auth & Security:** Dual Auth — Google OAuth (`users` table, `google_session` cookie) + Local Auth/OTP (`localUsers` table, Bearer JWT), WebAuthn Passkeys (`userCredentials`), JWT Sessions (`sessions` table).

---

## 3. 🚨 WHAT AI AGENTS GET WRONG (CRITICAL GOTCHAS & TRICKS)

### Gotcha #1: User Identity & Session Cookie vs Bearer Token
- **Do NOT assume one user table or `kimi_sid` cookie checks:** The application has **TWO distinct user tables** (`users` for Google OAuth and `localUsers` for password/WhatsApp OTP users).
- **How it works:** `api/context.ts` (`createContext`) checks `google_session` HTTP-only cookie first against `users`. If missing, it checks `Authorization: Bearer <token>` against the `sessions` table (`userType == 'local'`) and returns `localUsers`.
- **The Solution:** Always rely on `ctx.user` inside tRPC procedures. `ctx.user` is normalized into type `UnifiedUser`:
  ```typescript
  export type UnifiedUser = {
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

### Gotcha #2: `user.role` vs `user.plan` & Procedure RBAC (`api/middleware.ts`)
- **NEVER check `user.role === "pro"`!** `role` only dictates admin access (`"user" | "moderator" | "admin"`). Subscription tiers live in `user.plan` (`"free" | "pro" | "ultra"`).
- **Always use the exported tRPC middleware procedures from `api/middleware.ts`:**
  - `publicProcedure` & `strictPublicProcedure`: For unauthenticated/auth routes (capped at 400 and 25 req/IP).
  - `authedProcedure`: For any logged-in user (`ctx.user != null`, capped at 100 req/min).
  - `aiProcedure`: For heavy AI generation endpoints (enforces AI budget and rate limits).
  - `proProcedure`: Checks `plan === "pro" || plan === "ultra" || role === "admin"`.
  - `ultraProcedure`: Checks `plan === "ultra" || role === "admin"`.
  - `adminProcedure`: Checks `role === "admin"`.

### Gotcha #3: Boot-Time Zod Environment Crash (`api/lib/env.ts`)
- If the server crashes immediately with `ZodError`, check `.env`. The exact required variables parsed on boot are:
  - `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `GEMINI_API_KEY`.
- **Pro Testing Trick:** Set `BILLING_SIMULATE="true"` in `.env` to test `pro.upgrade` and checkout workflows without calling real Paymob servers.

### Gotcha #4: Model Shorthand Interception (`api/lib/model-mapper.ts`)
- Do NOT hardcode deprecated model names like `gemini-1.5-flash` or `gemini-2.0-flash`.
- `mapModelName(modelName)` automatically intercepts and routes:
  - `flash` / `1.5-flash` / `2.0-flash` $\rightarrow$ `gemini-3.1-flash-lite`
  - `pro` / `ultra` / `1.5-pro` $\rightarrow$ `gemini-3.5-pro`
  - External models starting with `llama-`, `deepseek-`, `mixtral` $\rightarrow$ automatically routed via `Groq` or `Fireworks` APIs (`callFireworksAPI`).

### Gotcha #5: Zero-Polling SSE & Paymob HMAC Webhooks (`api/boot.ts`)
- **WhatsApp OTP:** Verification uses zero-polling Server-Sent Events mounted at `GET /api/sse/otp?phone=X`. Do not invent polling loops in the frontend.
- **Paymob Webhooks:** Mounted at `POST /api/webhooks/paymob`. Requires exact HMAC string concatenation validation (`hmacParam` vs `PAYMOB_HMAC_SECRET`).

---

## 4. ⚡ Quick-Start Terminal Commands

```bash
# Start full-stack local development (Vite frontend + Hono backend plugin mode)
npm run dev

# Start backend standalone dev server with tsx watch
npm run backend:dev

# Run TypeScript type validation across the entire monorepo (MANDATORY BEFORE EVERY COMMIT)
npm run check

# Run Drizzle schema generation & push changes to MySQL 8
npm run db:generate && npm run db:push
```

---

## 5. 🗺️ Living Documentation Treasure Map (`docs/`)

To conserve tokens and eliminate context confusion, all authoritative domain specifications and engineering tricks are modularized inside `docs/`. **Read only the specific file needed for your current task:**

| Task / Domain Area | Authoritative SSoT File | Key Tricky Topics & Gotchas Documented |
| :--- | :--- | :--- |
| **System Architecture & Data Flow** | [`docs/01-ARCHITECTURE.md`](file:///e:/smartspend_V1_fixed/docs/01-ARCHITECTURE.md) | Monorepo folder tree, Vite Hono plugin setup (`boot.ts` vs `server.ts`), CORS/CSRF dev tunnel origins (`.loca.lt`, `.serveousercontent`), and SPA fallback. |
| **Database Schema (All 48 Tables)** | [`docs/02-DATABASE_SCHEMA.md`](file:///e:/smartspend_V1_fixed/docs/02-DATABASE_SCHEMA.md) | Drizzle ORM exports, 6 logical table groups, relationships (`db/relations.ts`), `isSilenced` bypass flags, and vector column indices. |
| **Hybrid AI Classification Engine** | [`docs/03-AI_CLASSIFICATION_ENGINE.md`](file:///e:/smartspend_V1_fixed/docs/03-AI_CLASSIFICATION_ENGINE.md) | 5-Layer waterfall (`Zero-Token Cache` $\rightarrow$ `Rules` $\rightarrow$ `Vector` $\rightarrow$ `Gemini` $\rightarrow$ `Dispute Resolver`), `egyptian-dictionary.ts` slang safeguards, and `ai-usage-policy.ts` token capping. |
| **tRPC Routers & Shared Contracts** | [`docs/04-API_AND_TRPC_ROUTERS.md`](file:///e:/smartspend_V1_fixed/docs/04-API_AND_TRPC_ROUTERS.md) | Master `appRouter` map (21 sub-routers), `contracts/constants.ts` input limits (`ExpenseInputLimits`), and standardized error throwing (`contracts/errors.ts`). |
| **Dual Auth, Passkeys & RBAC** | [`docs/05-AUTH_AND_SECURITY.md`](file:///e:/smartspend_V1_fixed/docs/05-AUTH_AND_SECURITY.md) | Google OAuth cookie flow, WebAuthn Passkeys (`userCredentials` + `authChallenges`), local OTP login, and `middleware.ts` procedure rules. |
| **SMS Ingestion, Apple Pay & WhatsApp** | [`docs/06-SMS_AND_APPLE_PAY.md`](file:///e:/smartspend_V1_fixed/docs/06-SMS_AND_APPLE_PAY.md) | Android companion app (`webhookTokens` auth), Apple Pay iOS capture, WhatsApp bot (`otpEvents` SSE), and Firebase Cloud Messaging (`pushSubscriptions`). |
| **AI Chatbot Agent & RAG System** | [`docs/07-AI_CENTER_AGENT.md`](file:///e:/smartspend_V1_fixed/docs/07-AI_CENTER_AGENT.md) | Chatbot intent routing, short-term RAG conversation summaries, persistent semantic memory signals, vector scoring formula, and capabilities vs constraints. |
| **AI Product & Rebuild Contract** | [`docs/08-AI_AGENT_PRODUCT_AND_REBUILD_PLAN.md`](file:///e:/smartspend_V1_fixed/docs/08-AI_AGENT_PRODUCT_AND_REBUILD_PLAN.md) | Production goals, user jobs, cost policy, data migrations for contacts/classification traces, and PWA safety gates. |

> ⚠️ **ARCHIVE NOTICE:** Any documentation or plan inside `docs/archive/` (`old-architecture-plans/` and `reports-2026/`) is **deprecated historical reference**. Do not use archived reports to guide architectural decisions or code syntax.
