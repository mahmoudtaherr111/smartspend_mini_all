# Handoff Report: Dual-Auth & Session Isolation Audit (Milestone 1)

> **Agent:** Explorer 2 (`explorer_m1_2`)  
> **Milestone:** Milestone 1 — Dual-Auth & Session Isolation Audit  
> **Report Target:** `E:/smartspend_V1_fixed/.agents/explorer_m1_2/audit_dual_auth.md`  
> **Handoff Type:** Hard Handoff (Investigation Complete)  

---

## 1. Observation

Direct code inspections and searches across the authentication, session, and middleware infrastructure revealed:

1. **`api/context.ts:138-147`:**
   ```typescript
   user = {
     id: dbUser.id,
     name: dbUser.name,
     email: dbUser.email,
     role: dbUser.role as "user" | "moderator" | "admin",
     plan: dbUser.plan as "free" | "pro" | "ultra",
     type: "local",
     phone: dbUser.phone,
   };
   ```
   When constructing `UnifiedUser` for local users, `avatar: dbUser.avatar` is omitted, while `users.avatar` is included for OAuth users on lines 82 and 126.
2. **`api/local-auth-router.ts:72, 128`:**
   Line 72 generates `cleanPhone = cleanPhoneNumber(input.phone)` and verifies uniqueness on line 76 against `localUsers.phone`. Line 128 inserts `phone: input.phone` (the uncleaned raw string). Line 225 cleans the phone on login and searches `where: eq(localUsers.phone, cleanPhone)`.
3. **`api/sms-router.ts:133-166`:**
   `getUserFromSession` verifies JWT signatures using `verify(token, env.JWT_SECRET)` but fails to query the `sessions` table in the database to verify active, unexpired session status.
4. **`api/services/voice-call-service.ts:44-51`:**
   WebSocket authentication for `cookieToken` verifies JWT signature and queries `users` table directly without verifying against `sessions` table (`userType: "oauth"`).
5. **`api/boot.ts:201` & `src/pages/AuthCallback.tsx:20-23`:**
   OAuth callback sets an `HttpOnly` cookie and then redirects to `${env.APP_URL}/auth/callback?token=${result.token}`, appending the raw token in the URL query string.
6. **`api/auth-router.ts:44-59` & `api/boot.ts:188-204`:**
   Google OAuth initiation (`googleUrl`) and callback (`googleCallback` and `/api/auth/google/callback`) lack `state` parameter generation and validation.
7. **`api/local-auth-utils.ts:38-43`:**
   `createSession` inserts `userId`, `userType`, `token`, and `expiresAt`, leaving `ipAddress` and `userAgent` columns `NULL`.
8. **`api/analytics-router.ts:165-168`:**
   `adminCount`, `moderatorCount`, and `proCount` query exclusively from `localUsers`, omitting OAuth users from administrative and subscription dashboard metrics.
9. **`api/local-auth-router.ts:348-372` vs `api/admin-router.ts:360-384`:**
   User deletion routines have conflicting table lists: `localAuthRouter` cleans 21 tables but misses WebAuthn, AI memory, chat, push subscriptions, and notifications; `adminRouter` cleans 19 tables and misses businesses, contacts, budgets, goals, WebAuthn, and AI memory.
10. **`api/middleware.ts:1-127`:**
    RBAC procedure gates cleanly separate `user.role` (`"user" | "moderator" | "admin"`) from `user.plan` (`"free" | "pro" | "ultra"`). `proProcedure` and `ultraProcedure` grant automatic access to admins. Rate limiting operates on IP for public routes (400/min general, 25/15min strict auth) and per-user for authenticated routes (100/min).

---

## 2. Logic Chain

1. **Local Avatar Loss Logic:**
   - `localUsers` table contains column `avatar` (`db/schema.ts:56`).
   - `createContext` omits `avatar` on line 144.
   - All tRPC procedures consuming `ctx.user.avatar` receive `undefined` for local users.
   - Conclusion: Local user profile pictures are lost during request context creation.
2. **Registration Lockout Logic:**
   - Registration normalizes `input.phone` to `cleanPhone` for validation and conflict check.
   - Registration inserts `input.phone` (e.g. `+201012345678`).
   - Login normalizes `input.phone` to `cleanPhone` (e.g. `01012345678`) and queries by exact string equality.
   - Conclusion: Users registering with non-standard formatting are permanently locked out of login.
3. **Session Revocation Bypass Logic:**
   - `authRouter.logout`, `localAuthRouter.logout`, and `sessionRouter.revokeMine` delete tokens from `sessions` table.
   - `api/sms-router.ts` and `api/services/voice-call-service.ts` only check JWT cryptographic validity with `verify()`.
   - Revoked JWTs remain mathematically valid until expiration (up to 7 days).
   - Conclusion: Revoked sessions can still ingest bank SMS and connect to live voice WebSockets.
4. **Token Leakage Logic:**
   - The purpose of `HttpOnly` cookies is to prevent client-side JavaScript and browser telemetry from accessing the raw token.
   - Appending `?token=...` in the redirect URL exposes the token to URL logging, browser history, and HTTP referrer headers.
   - Conclusion: OAuth token confidentiality is degraded.

---

## 3. Caveats

- **No Live DB Mutations:** Investigation was strictly read-only; no database rows were modified or deleted.
- **Third-Party Providers:** Google OAuth endpoints (`oauth2.googleapis.com`) and Baileys WhatsApp sockets were analyzed statically from code contracts without initiating external live socket handshakes during this run.
- **Scope Limit:** Audit focused on Milestone 1 (Dual-Auth, Sessions, RBAC, Data Isolation). Detailed AI classification algorithms and financial math will be audited in Milestones 2 and 3.

---

## 4. Conclusion

The Dual-Auth and Session Isolation system is structurally sound with robust polymorphic tables and clear RBAC boundaries, but contains 12 specific vulnerabilities that require targeted remediation:
- **Immediate Fix 1:** Add `avatar: dbUser.avatar` to `api/context.ts:144`.
- **Immediate Fix 2:** Change `phone: input.phone` to `phone: cleanPhone` in `api/local-auth-router.ts:128`.
- **Immediate Fix 3:** Add `sessions` table database checks in `api/sms-router.ts:133-166` and `api/services/voice-call-service.ts:44-51`.
- **Immediate Fix 4:** Remove `?token=...` from OAuth redirect in `api/boot.ts:201`.
- **Immediate Fix 5:** Unify user cascade deletion into a single atomic helper `purgeUserData` across all 35 user-owned tables.

Full audit documentation is available at `E:/smartspend_V1_fixed/.agents/explorer_m1_2/audit_dual_auth.md`.

---

## 5. Verification Method

Independent verification of findings:

1. **Type & Compilation Check:**
   ```bash
   npm run check
   ```
2. **Auth & Security Test Suites:**
   ```bash
   npm test -- api/middleware.test.ts api/dev-qa-paths.test.ts
   ```
3. **Full Vitest Suite:**
   ```bash
   npm test
   ```
4. **File Inspection:**
   - Inspect `api/context.ts` lines 138–147 for missing `avatar`.
   - Inspect `api/local-auth-router.ts` lines 72 and 128 for phone string mismatch.
   - Inspect `api/sms-router.ts` lines 133–166 for lack of `sessions` query.
   - Inspect `api/services/voice-call-service.ts` lines 44–51 for missing OAuth session verification.
