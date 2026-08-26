# SmartSpend AI — tRPC v11 API Routers & Shared Contracts

> **AI AGENT SSOT:** This document maps the 22 sub-routers, shared contract validations, error throwing rules, and rate-limiting procedures.

---

## 1. 🔀 Master Router Registry (`api/router.ts`)

The backend exports **22 modular sub-routers** mapped under `appRouter`:

| Sub-Router Key | File Path | Scope of APIs | Procedure Access | Key Improvements & Features |
| :--- | :--- | :--- | :--- | :--- |
| `auth` | `api/auth-router.ts` | Google OAuth token callbacks, cookie management. | `publicProcedure` | HTTP-only `google_session` cookie flow. |
| `localAuth` | `api/local-auth-router.ts` | Local user signup, logins, OTP pairing, password resets. | `strictPublicProcedure` | In-memory settings cache, clean phone sanitization. |
| `expense` | `api/expense-router.ts` | Transaction CRUD, bulk category updates, trace logs. | `authedProcedure` | **ACID `db.transaction()`** on `create`, `batchCreate`, `delete` (auto-decrements contact counter). |
| `ai` | `api/ai-router.ts` | 5-layer classification, voice STT, insight generation. | `aiProcedure` | **`aiProcedure` rate-limiting** on `generateMonthlyInsights`, `compareMonths`, `generateYearlyInsights`. |
| `analytics` | `api/analytics-router.ts` | Spending charts, monthly aggregation, dashboard stats. | `authedProcedure` | **Dual-user metrics aggregation** (OAuth `users` + `localUsers` for admin/moderator/pro stats). |
| `admin` | `api/admin-router.ts` | System user audits, model overrides, AI cost monitoring. | `adminProcedure` | In-memory settings cache invalidation on updates. |
| `adminWhatsapp`| `api/admin-whatsapp-router.ts` | WhatsApp bot state, direct message sending, broadcast. | `adminProcedure` | **Standardized `TRPCError`** (`INTERNAL_SERVER_ERROR`, `NOT_FOUND`). |
| `support` | `api/support-router.ts` | User support tickets, status updates, ticket closing. | `authedProcedure` | **Standardized `TRPCError`** (`FORBIDDEN` on unauthorized ticket access). |
| `export` | `api/export-router.ts` | File exports (CSV, PDF, Excel) for financial audits. | `authedProcedure` | Streamed data generation with Cairo time formatting. |
| `session` | `api/session-router.ts` | Session validation, active device list, session revoke. | `authedProcedure` | Midnight TTL cleanup, active database token verification. |
| `pro` | `api/pro-router.ts` | Subscription status, checkout init, Paymob billing. | `authedProcedure` | Paymob HMAC SHA-512 verification, simulated checkout. |
| `ads` | `api/ads-router.ts` | Native non-intrusive sponsor cards and click logs. | `publicProcedure` | Impression and click telemetry. |
| `referral` | `api/referral-router.ts` | Referral link generation, reward tracking, claim status. | `authedProcedure` | Reverse index lookup on `referral_referred_unique_idx`. |
| `seo` | `api/seo-router.ts` | Dynamic programmatic landing pages & metadata. | `publicProcedure` | Unique `path` index lookup. |
| `profile` | `api/profile-router.ts` | People Hub, contact aliases, quick magic link codes. | `authedProcedure` | **Standardized `TRPCError`** (`PRECONDITION_FAILED` on missing token). |
| `wallet` | `api/wallet-router.ts` | Wallet management, balances, inter-wallet transfers. | `authedProcedure` | **Direct `eq(expenses.walletId, ...)` index query** replacing slow `LIKE` scans. |
| `image` | `api/image-router.ts` | Receipt upload, Gemini OCR vision parsing, avatars. | `authedProcedure` | Gemini 3.1 Flash-Lite vision integration. |
| `goals` | `api/goals-router.ts` | Financial savings goals, milestones, timeline tracking. | `authedProcedure` | AI-assisted goal feasibility calculation. |
| `budget` | `api/budget-router.ts` | Monthly budget limits, category threshold alerts. | `authedProcedure` | **Cairo App-Time engine integration**, custom salary day (`periodStartDay`), linked goals. |
| `webauthn` | `api/webauthn-router.ts` | Passkey biometric registration and authentication. | `public` / `authed` | Dynamic RP ID matching, ephemeral challenge store. |
| `chat` | `api/chat-router.ts` | Conversational financial copilot, tool calls, RAG memory. | `aiProcedure` | Hybrid RAG memory + SQL aggregation fast path (<15ms). |
| `business` | `api/business-router.ts` | Freelancer mode setups, separate ledgers, deductions. | `proProcedure` | Multi-business tax categorization. |

---

## 2. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Strict Input Length Validations (`contracts/constants.ts`)
* **Gotcha:** Do not use arbitrary hardcoded numbers for string/number bounds in Zod input schemas.
* **Rule:** Always import and bind boundaries from `ExpenseInputLimits`:
  ```typescript
  import { ExpenseInputLimits } from "@/contracts/constants";
  // Bound constants: rawTextMax (5000), descriptionMax (2000), amountMax (999_999_999)
  ```

### B. Standardized `TRPCError` Exceptions (`contracts/errors.ts`)
* **Gotcha:** Never throw raw JavaScript `new Error("message")`. Raw errors are caught by tRPC as generic internal server errors (500), losing HTTP semantics for client UI handling.
* **Rule:** Throw typed `TRPCError` with standardized codes paired with `ErrorMessages` tags:
  ```typescript
  import { TRPCError } from "@trpc/server";
  import { ErrorMessages } from "@/contracts/constants";
  
  throw new TRPCError({
    code: "FORBIDDEN", // Maps to HTTP 403
    message: "غير مصرح لك بالوصول لهذه التذكرة",
  });
  ```

### C. Master Router Registration (`api/router.ts`)
* **Gotcha:** Creating a new sub-router file without registering it in `api/router.ts` prevents frontend type resolution.
* **Rule:** All sub-routers must be registered under `appRouter` in `api/router.ts`. Run `npm run check` to verify type propagation across the client.

### D. Financial Mutation Atomicity (`api/expense-router.ts`)
* **Rule:** Ledger mutations (`create`, `batchCreate`, `delete`) must execute inside `db.transaction()`. Deleting an expense must decrement `userContacts.transactionCount` atomically and clear associated caches.
