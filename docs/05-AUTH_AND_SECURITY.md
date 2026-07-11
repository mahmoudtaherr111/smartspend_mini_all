# SmartSpend AI — Dual Authentication, Passkeys & Security Architecture

> **AI AGENT SSOT:** This document defines the authentication flows, role-based access controls, and session validation parameters.

---

## 1. 🔑 Triple-Tier Authentication Resolvers

| Auth Type | Trigger/Target | Session Cookie / Token | User Table |
| :--- | :--- | :--- | :--- |
| **Google OAuth 2.0** | Web Onboarding | `google_session` (Cookie) | `users` (`type: oauth`) |
| **Local Password/OTP**| WhatsApp bot pairing / registration | `Authorization: Bearer <token>` | `localUsers` (`type: local`) |
| **WebAuthn Passkeys** | TouchID / FaceID / biometric keys | `Authorization: Bearer <token>` | `users` / `localUsers` |

---

## 2. 🛡️ Role-Based Access Control procedures (`api/middleware.ts`)

| tRPC Procedure | Checks Enforced | Rate Limit | Target Usage Scope |
| :--- | :--- | :--- | :--- |
| `publicProcedure` | None (Anonymous) | 400 req/min (IP) | SEO pages, public ads, assets, configs. |
| `strictPublicProcedure` | None (Anonymous) | 25 req/15min (IP) | Authentication endpoints, register, logins. |
| `authedProcedure` | `ctx.user != null` | 100 req/min (User) | Core ledger endpoints, wallets, analytics. |
| `aiProcedure` | `ctx.user != null` | 100 req/min (AI-specific) | Heavy NLP decomposes and Gemini chat. |
| `proProcedure` | `plan === "pro" \|\| plan === "ultra" \|\| role === "admin"` | 100 req/min (User) | Business mode ledger, export tools. |
| `ultraProcedure` | `plan === "ultra" \|\| role === "admin"` | 100 req/min (User) | Premium analytics, voice call access. |
| `moderatorProcedure`| `role === "admin" \|\| role === "moderator"` | 100 req/min (User) | Support tickets audit, moderation feeds. |
| `adminProcedure` | `role === "admin"` | 100 req/min (User) | Global settings write, WhatsApp connection. |

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Context Resolver Logic (`api/context.ts`)
* **Gotcha:** Do not check `kimi_sid` cookie for Google OAuth.
* **Rule:** `createContext` reads `google_session` HTTP-only cookie first against `users`. If missing, it checks `Authorization: Bearer <token>` in headers against `sessions` table (where `userType == 'local'`), resolving to `localUsers`. Both are normalized to `UnifiedUser` under `ctx.user`.

### B. `user.role` vs `user.plan` Distinction
* **Gotcha:** Checking `user.role === "pro"` will cause features to lock out standard users.
* **Rule:** Administrative access uses `user.role` (`"user" | "moderator" | "admin"`). Feature subscription levels use `user.plan` (`"free" | "pro" | "ultra"`). Never mix these up.

### C. WebAuthn Ephemeral Challenges (`authChallenges`)
* **Gotcha:** In-flight biometric logins fail if challenge entries are cleared too fast.
* **Rule:** WebAuthn requires active challenge strings stored in `authChallenges`. Ensure background cleanup crons allow a minimum 5-minute TTL to prevent "Challenge mismatch" errors on user devices.
