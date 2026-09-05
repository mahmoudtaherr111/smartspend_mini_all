# SmartSpend AI — Dual Authentication, Passkeys & Security Architecture

> **AI AGENT SSOT:** This document defines the dual identity system, WebAuthn Level 3 passkeys, role-based access controls, active session verification, and account purge cascades.

---

## 1. 🔑 Triple-Tier Authentication Resolvers

The architecture supports three distinct authentication mechanisms normalized into a single `UnifiedUser` context:

| Auth Type                | Trigger / Source                      | Session Transport                   | Identity Table                               |
| :----------------------- | :------------------------------------ | :---------------------------------- | :------------------------------------------- |
| **Google OAuth 2.0**     | Web Onboarding                        | `google_session` (HTTP-Only Cookie) | `users` (`type: "oauth"`)                    |
| **Local Password / OTP** | WhatsApp OTP / Email Registration     | `Authorization: Bearer <token>`     | `localUsers` (`type: "local"`)               |
| **WebAuthn Passkeys**    | TouchID / FaceID / Biometric Hardware | `Authorization: Bearer <token>`     | `users` / `localUsers` via `userCredentials` |

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

| tRPC Procedure          | Checks Enforced                                              | Rate Limit              | Target Usage Scope                                                                                                    |
| :---------------------- | :----------------------------------------------------------- | :---------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `publicProcedure`       | None (Anonymous)                                             | 400 req/min (IP)        | SEO pages, public ads, assets, healthcheck.                                                                           |
| `strictPublicProcedure` | None (Anonymous)                                             | 25 req/15min (IP)       | Auth endpoints, registration, login attempts.                                                                         |
| `authedProcedure`       | `ctx.user != null`                                           | 100 req/min (User)      | Core ledger endpoints, wallets, analytics.                                                                            |
| `aiProcedure`           | `ctx.user != null`                                           | 100 req/min (AI Budget) | Heavy NLP decomposes, monthly insights, and Gemini chat.                                                              |
| `proProcedure`          | `plan === "pro" \|\| plan === "ultra" \|\| role === "admin"` | 100 req/min (User)      | Business mode ledger, advanced export tools.                                                                          |
| `ultraProcedure`        | `plan === "ultra" \|\| role === "admin"`                     | 100 req/min (User)      | Premium analytics, live voice call access.                                                                            |
| `moderatorProcedure`    | `role === "admin" \|\| role === "moderator"`                 | 100 req/min (User)      | Reserved for explicitly designed moderation features; not administrative access.                                      |
| `adminProcedure`        | `role === "admin"`                                           | 100 req/min (User)      | All admin/WhatsApp procedures, cross-user analytics, user exports, session administration and support administration. |

### Administrative response boundaries

- Dashboard visibility is not authorization. Every administrative server operation must use `adminProcedure`; users and moderators cannot call it directly, regardless of subscription plan.
- `api/lib/admin-safe-fields.ts` defines explicit SQL projections. User listings exclude password hashes and private OAuth identifiers. Session listings expose metadata and the session row ID for revocation, never the reusable session token, including to admins.
- Users and moderators retain access to their **own** sessions and support tickets. Ownership always checks both `userId` and `userType`; only admins can override ticket ownership.
- Regression tests invoke the actual administrative routers (`api/admin-router.security.test.ts`), plus the real signed-token/context boundary (`api/admin-authentication.security.test.ts`). They use synthetic data, not live accounts.

### Local password login protection

`localAuth.login` has a dedicated failure-only protection layer in
`api/lib/login-protection.ts`; it does not share the stricter registration,
OAuth, OTP, or WebAuthn bucket.

- Redis Lua scripts atomically enforce a 15-minute sliding window across replicas.
  The default sustained IP limit is 50 failed attempts, plus a 10-failure/minute
  burst limit, so mobile carrier NAT is not treated like a single household.
- Each normalized phone account and each account/IP pair has a five-failure
  threshold. Account backoff begins at 30 seconds, doubles for subsequent
  distributed failures, and is capped at 15 minutes. Passkey and recovery flows
  remain independent to avoid permanent account-lockout denial of service.
- Redis keys and structured security logs contain keyed HMAC fingerprints, never
  raw phone numbers, IPs, passwords, cookies, or tokens. Set a dedicated
  `RATE_LIMIT_KEY_SECRET` in production; `JWT_SECRET` is only a compatibility
  fallback.
- Preflight checks and short-lived distributed in-flight counters execute before
  MySQL and bcrypt. Failed credentials consume points; successful logins clear the
  account and account/IP state but deliberately do not clear the shared IP state.
- Unknown accounts execute one comparison against a fixed cost-12 bcrypt hash and
  return the same `UNAUTHORIZED` code/message as incorrect passwords. Requests
  already over a limit return `429` before MySQL/bcrypt and include `Retry-After`,
  `RateLimit-*`, and legacy `X-RateLimit-*` headers.
- If Redis is unavailable, the request uses a bounded in-process insurance limiter.
  Connection attempts use exponential cooldown, and a structured degraded-mode
  security event is emitted without blocking authentication on Redis recovery.

Forwarded IP headers are accepted only when `TRUST_PROXY=true`, the immediate
socket peer is loopback or appears exactly in `TRUSTED_PROXY_IPS`, and the header
matches `TRUSTED_PROXY_HEADER`. The local ngrok agent normally reaches the server
through loopback. A publicly reachable origin must never trust arbitrary forwarded
headers.

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. `user.role` vs `user.plan` Distinction

- **Gotcha:** Checking `user.role === "pro"` will cause subscription features to lock out valid paying users.
- **Rule:** Administrative privileges use `user.role` (`"user" | "moderator" | "admin"`). Subscription tiers use `user.plan` (`"free" | "pro" | "ultra"`). Never mix these properties.

### B. Active Database Session Token Validation (`api/lib/session-validation.ts`)

- **Gotcha:** Checking JWT signature alone without verifying database session state allows revoked or expired tokens to access APIs.
- **Rule:** All authentication endpoints (`createContext` in `context.ts`, `sms-router.ts`, `voice-call-service.ts`) execute `validateActiveSessionToken(token, expectedUserType)`. This verifies that the JWT is signed with `JWT_SECRET` **AND** exists in the `sessions` table with `expiresAt > NOW()`.

### C. WebAuthn Dynamic Relying Party ID (`webauthn-router.ts`)

- **Gotcha:** Hardcoding the WebAuthn RP ID causes biometric sign-ins to fail in development tunnels, staging, and multi-domain environments.
- **Rule:** `webauthnRouter` resolves `rpID` and `expectedOrigin` only from exact trusted browser origins. Extra LAN or tunnel origins must be configured explicitly; arbitrary tunnel domains and untrusted Host headers are not trusted.

### D. Universal 35-Table User Purge Cascade (`api/services/user-purge-service.ts`)

- **Rule:** Account deletion requests (from user profile or admin dashboard) must call `purgeUserData(tx, userId, userType)`.
- **Execution:** Wraps all 35 user-scoped tables, chat message hierarchies, business categories, and identity records in a single atomic database transaction, ensuring GDPR compliance and eliminating orphaned ledger records.

### E. Phone Number Normalization (`cleanPhone`)

- **Rule:** Registration and WhatsApp pairing normalize phone numbers using `cleanPhone()` (stripping leading zeros, whitespace, and international `+20` prefixes) before database insertion, preventing duplicate account fragmentation.

---

## 4. 🌐 Google OAuth 2.0 & Dynamic Multi-Origin Architecture

### A. Data Stored from Google Profile

Google OAuth uses standard scopes (`openid email profile`). Upon successful callback:

- `unionId`: Permanent Google User ID (immutable primary external identifier).
- `email`: Verified Google email address.
- `name`: Full user display name.
- `avatar`: Google profile photo URL.
- `referralCode`: Auto-generated unique SmartSpend referral code (`SSXXXXXX`).
- Auto-assigned default values: `role: "user"`, `plan: "free"`.

> **Note on Extended User Attributes (Phone Numbers, Salary Day, Budgets):**
> Following industry best practices, additional user metadata (such as Egyptian phone numbers for e-wallets, salary days, and monthly budgets) is collected inside the application via **In-App Onboarding** stored in `userProfiles` (`db/schema.ts`), keeping Google OAuth fast, frictionless, and 1-click.

### B. Dynamic Redirect URI Resolution

To support concurrent access across `localhost:3000` and explicitly configured public origins:

- `GET /api/auth/google/start` (`api/boot.ts`): Computes an origin from `X-Forwarded-Host` / `Host` and `X-Forwarded-Proto`, then requires an exact match in the trusted web-origin list before issuing the matching `redirect_uri`.
- Persists `oauth_redirect_uri` in an HttpOnly cookie alongside `oauth_state`.
- `GET /api/auth/google/callback`: Reads the cookie and passes the matching `redirectUri` **and validated state** to `caller.auth.googleCallback()`. OAuth cookies issued through the HTTPS tunnel use `Secure` even during development.

---

## 5. 🚀 Permanent Public Tunneling (ngrok & Cloudflare)

For live multi-device and mobile testing without public cloud deployment:

### Static ngrok Ingress (Preferred)

- Permanent Static Domain: `https://nutty-husband-customary.ngrok-free.dev`
- Launching tunnel command:
  ```bash
  ngrok http --domain=nutty-husband-customary.ngrok-free.dev 3000
  ```
- Origins and redirect URIs registered in Google Cloud Console:
  - **JavaScript Origins:** `http://localhost:3000`, `https://nutty-husband-customary.ngrok-free.dev`
  - **Redirect URIs:** `http://localhost:3000/api/auth/google/callback`, `https://nutty-husband-customary.ngrok-free.dev/api/auth/google/callback`
- Origin policy: `api/lib/origin-policy.ts` is shared by HTTP CORS/CSRF, WebSockets, WebAuthn and Vite's host allowlist. Configure `APP_URL`, optional `FRONTEND_URL`, and optional comma-separated `ALLOWED_ORIGINS` as exact HTTP(S) origins, without paths or wildcards. The permanent tunnel must appear in this configuration.
- Development additionally allows HTTP loopback origins on ports 3000, 5173 and `PORT`. Production does not add these ports automatically. LAN access requires an explicit origin in `ALLOWED_ORIGINS`.
- Only the exact native origins `capacitor://localhost`, `ionic://localhost`, `http://localhost` and `https://localhost` are recognized. Missing Origin remains supported for non-browser WebSocket clients, which still require a valid session.
- Requests with an untrusted Origin are rejected with 403 before API handlers, including JSON mutations. A substring such as `localhost` and membership of another ngrok/Cloudflare tunnel domain grant no trust.
- A public tunnel to Vite is still a **development deployment**. For public production use, build with `npm run build` and serve with `npm run start`; review trusted-proxy configuration for the actual ingress. Host/CORS restrictions are not a replacement for production deployment or authentication.
- These fixes do not invalidate credentials already disclosed before deployment. Review historical access and obtain explicit approval for any session revocation or credential rotation; do not silently log out all users.
