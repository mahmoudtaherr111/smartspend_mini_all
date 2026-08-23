# SmartSpend AI — tRPC v11 API Routers & Shared Contracts

> **AI AGENT SSOT:** This document maps the 21 sub-routers, shared contract validations, and error throwing rules.

---

## 1. 🔀 Master Router Registry (`api/router.ts`)

| Sub-Router Key | File Path | Scope of APIs | Procedure Access | Key Improvements |
| :--- | :--- | :--- | :--- | :--- |
| `auth` | `api/auth-router.ts` | Google OAuth token callbacks and cookie management. | `publicProcedure` | HTTP-only session cookies. |
| `localAuth` | `api/local-auth-router.ts` | Local user signup, logins, and OTP pairing. | `strictPublicProcedure` | In-memory settings cache integration. |
| `expense` | `api/expense-router.ts` | Transaction CRUD, bulk category updates, trace logs. | `authedProcedure` | **ACID `db.transaction()`** on `create`, `batchCreate`, `delete` (auto-decrements contact count). |
| `ai` | `api/ai-router.ts` | Ingestion pipeline triggers, audio/voice processing. | `aiProcedure` | 5-layer classification, multi-intent decomposition. |
| `analytics` | `api/analytics-router.ts` | Spending trends, charts aggregation, report caching. | `authedProcedure` | **Paginated `getAllUserStats`** (`limit`, `offset`, `{ total, users }`). |
| `admin` | `api/admin-router.ts` | User dashboard audits, model fallback overrides. | `adminProcedure` | Settings cache invalidation on updates. |
| `adminWhatsapp`| `api/admin-whatsapp-router.ts` | WhatsApp bot instance state changes, token resets. | `adminProcedure` | Live QR SSE bridge. |
| `support` | `api/support-router.ts` | User support ticket logging and bug reports. | `authedProcedure` | Ticket resolution auditing. |
| `export` | `api/export-router.ts` | Exports (CSV, PDF, Excel) for financial audits. | `authedProcedure` | Streamed file generation. |
| `session` | `api/session-router.ts` | Session token validation, active logins list. | `authedProcedure` | Midnight TTL cleanup. |
| `pro` | `api/pro-router.ts` | Subscription status, billing checker, promo codes. | `authedProcedure` | Paymob HMAC verification. |
| `ads` | `api/ads-router.ts` | Dynamic non-intrusive sponsor cards and click logs. | `publicProcedure` | Impression and click indexing. |
| `referral` | `api/referral-router.ts` | User referrals links, click metrics. | `authedProcedure` | Settings cache integration. |
| `seo` | `api/seo-router.ts` | Programmatic landing page schema metadata. | `publicProcedure` | Slug uniqueness indexing. |
| `profile` | `api/profile-router.ts` | Contacts hub, onboarding questions updates. | `authedProcedure` | Canonical contact ID resolution. |
| `wallet` | `api/wallet-router.ts` | Wallet management, transfers between wallets. | `authedProcedure` | **Direct `eq(expenses.walletId, ...)` index query** replacing slow `LIKE` scans. |
| `image` | `api/image-router.ts` | Upload receipts, OCR processing, profile avatars. | `authedProcedure` | Gemini 3.1 Flash vision parser. |
| `goals` | `api/goals-router.ts` | Savings target CRUD and timeline tracking. | `authedProcedure` | AI-assisted savings plans. |
| `webauthn` | `api/webauthn-router.ts` | Passkey biometric registration/login validations. | `public` / `authed` | Ephemeral challenge validation. |
| `chat` | `api/chat-router.ts` | Conversational financial chat threads and tools. | `aiProcedure` | Hybrid RAG memory + SQL aggregation fast path. |
| `business` | `api/business-router.ts` | Freelancer mode setups, separate ledgers. | `proProcedure` | Multi-business accounting support. |

---

## 2. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Strict Input Length Validations (`contracts/constants.ts`)
* **Gotcha:** Do not use arbitrary numbers for string/number bounds in Zod input validators.
* **Rule:** You must import and map boundaries from `ExpenseInputLimits` to prevent validation mismatches:
  ```typescript
  import { ExpenseInputLimits } from "@/contracts/constants";
  // Max inputs: rawTextMax (5000), descriptionMax (2000), amountMax (999_999_999)
  ```

### B. Standardized tRPC Error Throwing (`contracts/errors.ts`)
* **Gotcha:** Do not throw generic JS `new Error("error_message")` or random strings.
* **Rule:** Throw `TRPCError` with standardized codes paired with `ErrorMessages` tags:
  ```typescript
  import { TRPCError } from "@trpc/server";
  import { ErrorMessages } from "@/contracts/constants";
  
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: ErrorMessages.unauthenticated, // "Authentication required"
  });
  ```

### C. Master Router Synchronization (`api/router.ts`)
* **Gotcha:** Adding a new router file (e.g. `api/my-router.ts`) won't expose endpoints to the frontend client.
* **Rule:** You must register the sub-router in `appRouter` inside `api/router.ts`. If omitted, frontend tRPC hooks will fail type check (`npm run check` will fail).

### D. Financial Mutation Atomicity (`api/expense-router.ts`)
* **Rule:** `create`, `batchCreate`, and `delete` must always execute within `db.transaction()`. Deleting an expense must decrement `userContacts.transactionCount` atomically and invalidate caches.

