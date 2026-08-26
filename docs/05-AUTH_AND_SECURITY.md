# SmartSpend AI — Dual Authentication, Passkeys & Security Architecture

> **AI AGENT SSOT:** This document defines the dual identity system, WebAuthn Level 3 passkeys, role-based access controls, active session verification, and account purge cascades.

---

## 1. 🔑 Triple-Tier Authentication Resolvers

The architecture supports three distinct authentication mechanisms normalized into a single `UnifiedUser` context:

| Auth Type | Trigger / Source | Session Transport | Identity Table |
| :--- | :--- | :--- | :--- |
| **Google OAuth 2.0** | Web Onboarding | `google_session` (HTTP-Only Cookie) | `users` (`type: "oauth"`) |
| **Local Password / OTP**| WhatsApp OTP / Email Registration | `Authorization: Bearer <token>` | `localUsers` (`type: "local"`) |
| **WebAuthn Passkeys** | TouchID / FaceID / Biometric Hardware | `Authorization: Bearer <token>` | `users` / `localUsers` via `userCredentials` |

### Unified User Context (`api/context.ts`)
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

---

## 2. 🛡️ Role-Based Access Control Procedures (`api/middleware.ts`)

| tRPC Procedure | Checks Enforced | Rate Limit | Target Usage Scope |
| :--- | :--- | :--- | :--- |
| `publicProcedure` | None (Anonymous) | 400 req/min (IP) | SEO pages, public ads, assets, healthcheck. |
| `strictPublicProcedure` | None (Anonymous) | 25 req/15min (IP) | Auth endpoints, registration, login attempts. |
| `authedProcedure` | `ctx.user != null` | 100 req/min (User) | Core ledger endpoints, wallets, analytics. |
| `aiProcedure` | `ctx.user != null` | 100 req/min (AI Budget) | Heavy NLP decomposes, monthly insights, and Gemini chat. |
| `proProcedure` | `plan === "pro" \|\| plan === "ultra" \|\| role === "admin"` | 100 req/min (User) | Business mode ledger, advanced export tools. |
| `ultraProcedure` | `plan === "ultra" \|\| role === "admin"` | 100 req/min (User) | Premium analytics, live voice call access. |
| `moderatorProcedure`| `role === "admin" \|\| role === "moderator"` | 100 req/min (User) | Support tickets audit, community moderation. |
| `adminProcedure` | `role === "admin"` | 100 req/min (User) | System settings updates, WhatsApp broadcast. |

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. `user.role` vs `user.plan` Distinction
* **Gotcha:** Checking `user.role === "pro"` will cause subscription features to lock out valid paying users.
* **Rule:** Administrative privileges use `user.role` (`"user" | "moderator" | "admin"`). Subscription tiers use `user.plan` (`"free" | "pro" | "ultra"`). Never mix these properties.

### B. Active Database Session Token Validation (`api/lib/session-validation.ts`)
* **Gotcha:** Checking JWT signature alone without verifying database session state allows revoked or expired tokens to access APIs.
* **Rule:** All authentication endpoints (`createContext` in `context.ts`, `sms-router.ts`, `voice-call-service.ts`) execute `validateActiveSessionToken(token, expectedUserType)`. This verifies that the JWT is signed with `JWT_SECRET` **AND** exists in the `sessions` table with `expiresAt > NOW()`.

### C. WebAuthn Dynamic Relying Party ID (`webauthn-router.ts`)
* **Gotcha:** Hardcoding the WebAuthn RP ID causes biometric sign-ins to fail in development tunnels, staging, and multi-domain environments.
* **Rule:** `webauthnRouter` dynamically resolves `rpID` and `expectedOrigin` from the incoming request `Host` header, supporting `localhost`, local network IPs, development tunnels (`.loca.lt`), and production domains.

### D. Universal 35-Table User Purge Cascade (`api/services/user-purge-service.ts`)
* **Rule:** Account deletion requests (from user profile or admin dashboard) must call `purgeUserData(tx, userId, userType)`.
* **Execution:** Wraps all 35 user-scoped tables, chat message hierarchies, business categories, and identity records in a single atomic database transaction, ensuring GDPR compliance and eliminating orphaned ledger records.

### E. Phone Number Normalization (`cleanPhone`)
* **Rule:** Registration and WhatsApp pairing normalize phone numbers using `cleanPhone()` (stripping leading zeros, whitespace, and international `+20` prefixes) before database insertion, preventing duplicate account fragmentation.
