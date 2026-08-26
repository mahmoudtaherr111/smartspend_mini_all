# SmartSpend AI — Dual-Auth & Session Isolation Comprehensive Security Audit Report

> **Milestone:** Milestone 1 (Dual-Auth & Session Isolation Audit)  
> **Auditor:** Explorer 2 (`explorer_m1_2`)  
> **Target Scope:** Dual-Auth Architecture (`users` vs `localUsers`), Context Resolution (`createContext`), WebAuthn Passkeys, WhatsApp OTP & SSE (`/api/sse/otp`), Session Revocation Lifecycle, Role vs. Plan RBAC, and Cross-User Data Isolation.  
> **Integrity Mode:** Read-Only Audit (Zero Source Modifications)  
> **Date:** August 23, 2026  

---

## 1. 🎯 Executive Summary & Architectural Overview

SmartSpend AI implements a dual-identity authentication system designed to accommodate two primary Egyptian customer segments:
1. **Google OAuth 2.0 Users:** Backed by the `users` table, authenticated through Google OAuth token exchange, and persisted in clients via HTTP-only `google_session` cookies and backend `sessions` records (`userType: "oauth"`).
2. **Local Phone & Password / WhatsApp OTP Users:** Backed by the `localUsers` table, authenticated via Egyptian phone number (`010/011/012/015`), bcrypt-hashed passwords, and zero-polling WhatsApp OTP verification, persisted in clients via `Authorization: Bearer <token>` and backend `sessions` records (`userType: "local"`).
3. **Biometric WebAuthn Passkeys:** Integrated across both user types using SimpleWebAuthn, persisted in `userCredentials` and verified against ephemeral `authChallenges`.

```
                                  ┌──────────────────────────────────────────────────────────┐
                                  │                     CLIENT REQUEST                       │
                                  │   (Cookie: google_session  OR  Header: Bearer <token>)   │
                                  └─────────────────────────────┬────────────────────────────┘
                                                                │
                                                                ▼
                                  ┌──────────────────────────────────────────────────────────┐
                                  │            Context Resolver (api/context.ts)             │
                                  └─────────────────────────────┬────────────────────────────┘
                                                                │
                                ┌───────────────────────────────┴───────────────────────────────┐
                                ▼                                                               ▼
             [Branch 1: google_session Cookie]                               [Branch 2: Bearer <token> Header]
                                │                                                               │
        ┌───────────────────────┴───────────────────────┐                                       ▼
        ▼                                               ▼                               JWT verify(token)
JWT verify(cookie)                             Verify Session in DB                             │
        │                                  (sessions.userType == "oauth")                       ▼
        ▼                                               │                             Verify Session in DB
  Lookup in `users`                                     ▼                         (sessions.userType == payload.type)
        │                                       Map to UnifiedUser                              │
        ▼                                    (avatar: dbUser.avatar)             ┌──────────────┴──────────────┐
  UnifiedUser (type: "oauth")                                                    ▼                             ▼
                                                                        [tokenUserType == "oauth"]    [tokenUserType == "local"]
                                                                                 │                             │
                                                                                 ▼                             ▼
                                                                         Lookup in `users`          Lookup in `localUsers`
                                                                                 │                             │
                                                                                 ▼                             ▼
                                                                        UnifiedUser (oauth)           UnifiedUser (local)
                                                                        (avatar included)          ⚠️ (avatar OMITTED!)
```

### Core Audit Findings Summary:
- **System Architecture Strengths:** Complete relational isolation across 48 tables using `(userId, userType)` pairs; in-memory anti-abuse protections for WhatsApp OTP; strict separation of subscription tiers (`plan`) from admin privileges (`role`) in `api/middleware.ts`; robust IP rate limiters on public endpoints.
- **Critical Vulnerabilities Discovered:**
  1. **Local User Avatar Loss (`api/context.ts:138-147`):** Local user avatars are dropped during `createContext` normalization, returning `undefined` for all authenticated procedures.
  2. **Phone Number Sanitization Desynchronization (`api/local-auth-router.ts:128`):** Registration stores uncleaned raw phone strings while duplicate checks and login queries use normalized `cleanPhone`, resulting in permanent account lockouts for numbers formatted with country codes or Arabic digits.
  3. **Revoked Token Bypasses in Sub-Systems (`api/sms-router.ts:133-166` & `api/services/voice-call-service.ts:44-51`):** Subsystem authentication helpers verify JWT cryptographic signatures without validating active session presence in the database, allowing revoked tokens to continue ingesting SMS and initiating voice calls.
  4. **OAuth Token Exposure in URL Query Parameters (`api/boot.ts:201` & `src/pages/AuthCallback.tsx:20-23`):** The server-side OAuth callback redirects the browser with the raw JWT token in the URL query string, leaking the token into browser history, access logs, and referrer headers.
  5. **Missing CSRF State in OAuth Flow (`api/auth-router.ts:44-59` & `api/boot.ts:188-204`):** The Google OAuth initiation and callback routes lack a state parameter, exposing users to Login CSRF attacks.
  6. **Empty Session Device Telemetry (`api/local-auth-utils.ts:38-43`):** `createSession` ignores `ipAddress` and `userAgent`, rendering session management tools and suspicious login monitoring blind.
  7. **Divergent and Incomplete Cascade User Deletions (`api/local-auth-router.ts:348-372` vs `api/admin-router.ts:360-384`):** Deleting a user leaves orphaned data across 14+ tables due to missing and mismatched table purges.

---

## 2. 🔑 Dual-Auth Identity Architecture & Context Resolution Audit

### A. Context Normalization (`api/context.ts`)

The `createContext` function (lines 52–158) is the central security gateway for all tRPC procedures. It accepts either Hono's `HonoRequest` or Fetch API's `Request` and resolves the identity into `UnifiedUser`:

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

#### Detailed Flow & Verification:
1. **Google OAuth Evaluation (lines 58–93):**
   - Parses `google_session` cookie via regex `(?:^|;\s*)google_session=([^;]*)`.
   - Cryptographically verifies token against `env.JWT_SECRET` with algorithm `HS256`.
   - Validates session in database:
     ```typescript
     const session = await db.query.sessions.findFirst({
       where: and(
         eq(sessions.token, googleToken),
         eq(sessions.userId, Number(payload.userId)),
         eq(sessions.userType, "oauth"),
         gt(sessions.expiresAt, new Date()),
       ),
     });
     ```
   - Fetches user from `users` table and populates `avatar: dbUser.avatar`.
2. **Bearer Token Evaluation (lines 96–155):**
   - If `user` is not already resolved from cookie, parses `Authorization: Bearer <token>`.
   - Decodes JWT payload and extracts `tokenUserType = payload.userType || "local"`.
   - Validates session in database matching `sessions.token`, `sessions.userId`, `sessions.userType == tokenUserType`, and `sessions.expiresAt > new Date()`.
   - If `tokenUserType === "oauth"`, fetches from `users` table and maps all fields including `avatar`.
   - If `tokenUserType === "local"`, fetches from `localUsers` table:
     ```typescript
     // Lines 138-147
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

#### 🚨 Critical Discrepancies in `createContext`:
- **Discrepancy 1: Local User Avatar Omission (`api/context.ts:138-147`):**  
  `localUsers` schema defines `avatar: varchar("avatar", { length: 500 })` (`db/schema.ts:56`). However, line 138–147 omits `avatar: dbUser.avatar`. As a result, `ctx.user.avatar` is always `undefined` for all local users across the entire application, breaking avatar displays in the navigation bar, profile drawer, and receipt uploads.
- **Discrepancy 2: Cookie vs Header Precedence Conflict:**  
  If a client has both an active `google_session` cookie for User A and an `Authorization: Bearer` header for User B, `createContext` unconditionally selects User A. In webviews or shared browsers where a session was not cleared, API requests with explicit Bearer tokens will execute under the wrong identity.

---

## 3. 📱 WhatsApp OTP Verification & Zero-Polling SSE Engine Audit

SmartSpend replaces battery-draining client polling with a real-time Server-Sent Events (SSE) notification bridge for WhatsApp OTP verification.

```
[User on Web / Mobile]                [SmartSpend Backend]                [WhatsApp / Baileys]
        │                                      │                                    │
        │── 1. Generate OTP Code ─────────────►│                                    │
        │   (localAuth.generateVerification)   │── Store in-memory (otpCache)       │
        │                                      │   code: SS-XXXXXX, exp: +10m       │
        │                                      │                                    │
        │── 2. Connect SSE Stream ────────────►│                                    │
        │   (GET /api/sse/otp?phone=X)         │── Register listener on             │
        │                                      │   otpEvents ("otp:010xxxxxxx")     │
        │                                      │   (Ping every 15s, Max 5m)         │
        │                                      │                                    │
        │── 3. Send WhatsApp text ("SS-XXXXXX")────────────────────────────────────►│
        │                                      │                                    │
        │                                      │◄── 4. Ingest incoming message ─────│
        │                                      │   (messages.upsert)                │
        │                                      │── Verify phone match & LID         │
        │                                      │── Mark verified = true in cache    │
        │                                      │── otpEvents.emit("otp:X")          │
        │                                      │                                    │
        │◄── 5. Push SSE { status: "verified" }│                                    │
        │                                      │                                    │
        │── 6. Execute Registration ──────────►│                                    │
        │   (localAuth.register)               │── Verify otpCache.verified         │
        │                                      │── Delete from cache                │
        │                                      │── Create local user + session      │
```

### A. Component Verification & Security Architecture

1. **In-Memory Cache Architecture (`api/services/otp-cache.ts`):**
   - `otpCache` (`Map<string, OtpSession>`): Stores pending OTP challenges keyed by cleaned phone number with a 10-minute expiration. Zero database writes during generation and verification.
   - `rateLimitCache` (`Map<string, { count, resetTime }>`): Enforces max 1 code request per 60s per phone number, and max 5 code requests per 10 minutes per client IP.
   - `blocklist` (`Map<string, { attempts, blockUntil }>`): Enforces anti-brute force: 3 failed verification attempts block the sender for 15 minutes.
2. **Reverse Phone & LID Disambiguation (`api/services/whatsapp-service.ts:20-72`):**
   - Matches incoming WhatsApp JID (phone number) against expected phone using `matchPhoneNumber()`.
   - Supports Egyptian international prefix translation (`01xxxxxxxxx` $\leftrightarrow$ `201xxxxxxxxx`).
   - Automatically reads and matches WhatsApp Linked Device IDs (`lid-mapping-${phone}.json` and reverse LID mapping).
3. **SSE Connection Lifecycle (`api/boot.ts:219-263`):**
   - Rate limited at 5 concurrent SSE connections per 5 minutes per client IP.
   - Attaches event listener to `otpEvents.on("otp:${phone}", listener)`.
   - Sends periodic keep-alive pings every 15 seconds (`{ event: "ping", data: "ping" }`).
   - Enforces strict 5-minute maximum connection duration (`MAX_SSE_DURATION = 5 * 60 * 1000`) and removes event listener on abort or timeout to eliminate memory leaks.
4. **Fraud Detection Event (`api/services/whatsapp-service.ts:265-276`):**
   - If a code is submitted from a WhatsApp number different from the registration phone, the server logs a fraud attempt, increments blocklist counter for the attacker, and emits a structured fraud alert to the client:
     ```json
     { "status": "fraud", "expected": "01012345678", "actual": "01198765432" }
     ```

### 🚨 Critical Vulnerability in Local Registration Flow:

#### Phone Number Sanitization Desynchronization (`api/local-auth-router.ts:72, 128`):
In `localAuthRouter.register`:
```typescript
// Line 72: Sanitized phone for validation and duplicate checking
const cleanPhone = cleanPhoneNumber(input.phone);

// Line 75: Duplicate check queries with cleanPhone
const existingUser = await db.query.localUsers.findFirst({
  where: eq(localUsers.phone, cleanPhone),
});

// Line 128: RAW UNCLEANED string inserted into the database!
const [newUser] = await db.insert(localUsers).values({
  name: input.name,
  phone: input.phone, // ⚠️ BUG: Should be cleanPhone!
  email: input.email || null,
  password: hashedPassword,
  referralCode: referral,
  referredBy: referredBy,
}).$returningId();
```
**Impact:** If a user registers with phone `"+201012345678"` or with spaces/Arabic digits, `validatePhone` validates it and `cleanPhoneNumber` converts it to `"01012345678"`. However, the raw string `"+201012345678"` is inserted into `localUsers.phone`. Later, when the user attempts to log in (`api/local-auth-router.ts:225-228`), `login` sanitizes the input to `"01012345678"` and queries `where: eq(localUsers.phone, cleanPhone)`. The query fails with `NOT_FOUND` ("رقم التليفون أو الباسورد غلط"), permanently locking the user out of their account.

---

## 4. 🔄 Session Lifecycle, Revocation & Storage Isolation Audit

### A. Session Table Schema & Indexing (`db/schema.ts:282-298`)

| Column | Type | Nullable | Purpose |
| :--- | :--- | :--- | :--- |
| `id` | `int` | No | Auto-increment primary key |
| `userId` | `int` | No | Foreign identifier linking to `users.id` or `localUsers.id` |
| `userType` | `varchar(50)` | No | Discriminator `"oauth"` or `"local"` |
| `token` | `varchar(500)` | No | Signed JWT session token |
| `ipAddress` | `varchar(100)` | Yes | Client IP address at session creation |
| `userAgent` | `text` | Yes | Client browser/device User-Agent |
| `expiresAt` | `datetime` | No | Session expiration timestamp (7-day TTL) |
| `createdAt` | `datetime` | No | Creation timestamp |

**Indexes:** Composite index `sessions_user_idx` on `(userId, userType)` and index `sessions_token_idx` on `token`.

### B. Session Creation and Revocation Handlers

1. **Session Creation (`api/local-auth-utils.ts:30-44`):**
   ```typescript
   export async function createSession(userId: number, userType: "oauth" | "local", token: string) {
     const expiresAt = new Date();
     expiresAt.setDate(expiresAt.getDate() + 7);
     await db.insert(sessions).values({ userId, userType, token, expiresAt });
   }
   ```
   **Finding:** `ipAddress` and `userAgent` are never passed or stored, leaving them permanently `NULL`.
2. **Automated Midnight Expiration Cleanup (`api/boot.ts:38-45`):**
   - Daily cron `0 0 * * *` removes expired sessions:
     `await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));`
3. **Session Revocation Endpoints:**
   - User self-revocation: `sessionRouter.revokeMine` (`api/session-router.ts:31-44`) correctly scopes deletion to `and(eq(sessions.id, id), eq(sessions.userId, ctx.user.id), eq(sessions.userType, ctx.user.type))`.
   - Admin revocation: `adminRouter.revokeSession` (`api/admin-router.ts:411-416`) deletes by `sessionId`.
   - Logout handlers: `authRouter.logout` (`api/auth-router.ts:134-170`) and `localAuthRouter.logout` (`api/local-auth-router.ts:278-285`) delete the active session token from `sessions`.

---

## 5. 🚨 Master Security Vulnerabilities & Problem Catalog

The table below catalogs every discovered vulnerability, architectural mismatch, and security flaw with exact file and line citations.

| Vulnerability ID | Category | Severity | Title & Root Cause | Exact Line Citations | Exploitation Risk & Impact | Remediation Specification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **VULN-AUTH-01** | Context / Normalization | **HIGH** | Local User `avatar` dropped in `createContext` | `api/context.ts:138-147` | Local users cannot display or use profile avatars; returns `undefined` across all authed procedures. | Include `avatar: dbUser.avatar` in `context.ts` line 144 when constructing `UnifiedUser`. |
| **VULN-AUTH-02** | Data Integrity / Auth | **HIGH** | Registration saves raw phone string instead of `cleanPhone` | `api/local-auth-router.ts:128` | Users registering with `+20...` or Arabic digits are permanently locked out of login. | Change `phone: input.phone` to `phone: cleanPhone` on line 128 of `local-auth-router.ts`. |
| **VULN-AUTH-03** | Auth Bypass / Revocation | **HIGH** | SMS router session helper bypasses DB session check | `api/sms-router.ts:133-166` | Revoked or logged-out JWT tokens remain valid for ingesting SMS, generating tokens, and viewing logs. | Update `getUserFromSession` to query `sessions` table verifying `expiresAt > new Date()`. |
| **VULN-AUTH-04** | Auth Bypass / Revocation | **HIGH** | Voice WebSocket authentication skips OAuth DB session check | `api/services/voice-call-service.ts:44-51` | Logged-out OAuth users can still initiate live voice calls using cached cookies. | Validate `cookieToken` against `sessions` table (`userType: "oauth"`) before granting WebSocket access. |
| **VULN-AUTH-05** | Token Leakage / Confidentiality | **HIGH** | Raw JWT token leaked in OAuth redirect URL query string | `api/boot.ts:201`, `src/pages/AuthCallback.tsx:20-23` | JWT leaked in browser history, proxy access logs, and referrer headers. | Remove `?token=${result.token}` from redirect URL; rely solely on `google_session` HttpOnly cookie. |
| **VULN-AUTH-06** | CSRF / OAuth Security | **MEDIUM** | Missing `state` parameter and verification in Google OAuth | `api/auth-router.ts:44-59`, `api/boot.ts:188-204` | Attackers can execute Login CSRF, binding a victim's session to an attacker's OAuth account. | Generate signed cryptographically random `state` in cookie and verify upon callback. |
| **VULN-AUTH-07** | Session Auditing | **MEDIUM** | `createSession` fails to capture `ipAddress` and `userAgent` | `api/local-auth-utils.ts:38-43` | Session manager displays empty device/location info; anomaly detection disabled. | Accept `(userId, userType, token, ipAddress?, userAgent?)` and insert metadata. |
| **VULN-AUTH-08** | Metrics / Reporting | **MEDIUM** | Dashboard user counts omit Google OAuth users | `api/analytics-router.ts:165-168`, `api/local-auth-router.ts:328-332` | Admin/Moderator/Pro counts on analytics dashboard completely exclude all OAuth users. | Aggregate counts across both `localUsers` and `users` tables using `SUM` or `UNION ALL`. |
| **VULN-AUTH-09** | Error Standardization | **MEDIUM** | Generic JavaScript `new Error` thrown in `supportRouter` & `expenseRouter` | `api/support-router.ts:83, 201`, `api/expense-router.ts:1729, 1904` | Client receives unformatted 500 responses without localized error tags. | Replace with `new TRPCError({ code: "FORBIDDEN" | "BAD_REQUEST", message: "..." })`. |
| **VULN-AUTH-10** | Cascade Deletion / Integrity | **HIGH** | Incomplete and mismatched user deletion routines | `api/local-auth-router.ts:348-372`, `api/admin-router.ts:360-384` | User deletion leaves orphaned rows in WebAuthn, AI memory, chats, budgets, goals, and contacts. | Create centralized `purgeUserData(userId, userType, tx)` cleaning all 35 user-owned tables. |
| **VULN-AUTH-11** | Polymorphic FK Ambiguity | **MEDIUM** | `users.referredBy` and `localUsers.referredBy` lack type discriminator | `db/schema.ts:28, 60`, `api/referral-router.ts:163-167` | Ambiguous referrer ID when same ID exists in both `users` and `localUsers`. | Add `referredByType: varchar("referred_by_type", { length: 50 })` column to both tables. |
| **VULN-AUTH-12** | Passkey Security | **LOW** | WebAuthn dev origin hardcoded to localhost | `api/webauthn-router.ts:33-36` | Passkeys fail on mobile physical devices accessing dev server via LAN IP or tunnel. | Dynamically resolve origin from `env.APP_URL` or incoming request host. |

---

## 6. 🛡️ RBAC Middleware & Procedure Security Audit

### Procedure Gate Analysis (`api/middleware.ts`):

1. **`publicProcedure`:** Enforces IP rate limit of **400 requests / minute** (`pub:${ctx.ip}`).
2. **`strictPublicProcedure`:** Enforces strict IP rate limit of **25 requests / 15 minutes** (`strict:${ctx.ip}`). Correctly used for registration, login, and WebAuthn challenge generation.
3. **`authedProcedure`:** Enforces authentication (`ctx.user !== null`) and per-user rate limit of **100 requests / minute** (`${ctx.user.type}:${ctx.user.id}`).
4. **`aiProcedure`:** Enforces `authedProcedure` plus strict AI-specific rate limit of **100 requests / minute** to prevent LLM budget drain.
5. **`moderatorProcedure`:** Enforces `ctx.user.role === "admin" || ctx.user.role === "moderator"`.
6. **`adminProcedure`:** Enforces `ctx.user.role === "admin"`.
7. **`proProcedure`:** Enforces `ctx.user.plan === "pro" || ctx.user.plan === "ultra" || ctx.user.role === "admin"`.
8. **`ultraProcedure`:** Enforces `ctx.user.plan === "ultra" || ctx.user.role === "admin"`.

### RBAC Separation Verification:
- **Verified:** Role and Plan are strictly decoupled throughout `api/middleware.ts`. Subscriptions live exclusively in `user.plan` (`free`, `pro`, `ultra`), while administrative privileges live in `user.role` (`user`, `moderator`, `admin`).
- **Verified:** Admin users automatically bypass Pro and Ultra paywalls across `proProcedure` and `ultraProcedure`.

---

## 7. 🛠️ Step-by-Step Remediation & Hardening Plan

### 1. Fix `createContext` Avatar Resolution (`api/context.ts:144`)
```typescript
// Proposed edit in api/context.ts:
user = {
  id: dbUser.id,
  name: dbUser.name,
  email: dbUser.email,
  avatar: dbUser.avatar, // <-- Added
  role: dbUser.role as "user" | "moderator" | "admin",
  plan: dbUser.plan as "free" | "pro" | "ultra",
  type: "local",
  phone: dbUser.phone,
};
```

### 2. Fix Phone Number Insertion in Registration (`api/local-auth-router.ts:128`)
```typescript
// Proposed edit in api/local-auth-router.ts:
const [newUser] = await db
  .insert(localUsers)
  .values({
    name: input.name,
    phone: cleanPhone, // <-- Fixed from input.phone
    email: input.email || null,
    password: hashedPassword,
    referralCode: referral,
    referredBy: referredBy,
  })
  .$returningId();
```

### 3. Enforce Active Session Check in SMS Router (`api/sms-router.ts:133-166`)
```typescript
// Proposed edit in api/sms-router.ts:
async function getUserFromSession(c: any): Promise<{ id: number; type: "local" | "oauth" } | null> {
  const db = getDb();
  let token: string | undefined;
  let userType: "local" | "oauth" = "local";

  const googleToken = getCookie(c, "google_session");
  if (googleToken) {
    token = googleToken;
    userType = "oauth";
  } else {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
      const payload = (await verify(token, env.JWT_SECRET, "HS256").catch(() => null)) as any;
      if (payload?.userType) userType = payload.userType;
    }
  }

  if (!token) return null;

  try {
    const payload = (await verify(token, env.JWT_SECRET, "HS256")) as any;
    if (!payload?.userId) return null;

    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.token, token),
        eq(sessions.userId, Number(payload.userId)),
        eq(sessions.userType, userType),
        gt(sessions.expiresAt, new Date()),
      ),
    });

    if (!session) return null;
    return { id: Number(payload.userId), type: userType };
  } catch {
    return null;
  }
}
```

### 4. Eliminate Token Leakage in OAuth Callback (`api/boot.ts:201`)
```typescript
// Proposed edit in api/boot.ts:
c.header(
  "Set-Cookie",
  `google_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${env.NODE_ENV === "production" ? "; Secure" : ""}`,
);
// Redirect to dashboard directly without leaking token in query params
return c.redirect(`${env.APP_URL}/dashboard`);
```

### 5. Consolidate Universal Cascade Deletion Service
Create `api/services/user-purge-service.ts` to execute a single atomic transaction purging all 35 user-scoped tables:
```typescript
export async function purgeUserData(userId: number, userType: "oauth" | "local", tx: any) {
  const tables = [
    expenses, sessions, userAnalytics, supportTickets, userWallets,
    proSubscriptions, monthlyReports, aiSummaries, userProfiles,
    profileLearningEvents, monthlyBehaviorSnapshots, userDictionaries,
    classificationLogs, voiceUsage, webhookTokens, rawSmsEvents,
    expenseCategories, pushSubscriptions, pendingClarifications,
    userCredentials, authChallenges, inAppNotifications, notificationLogs,
    chatConversations, chatMessages, aiConversationSummaries,
    aiMemoryItems, aiMemoryEmbeddings, aiActionMemory, aiPendingActions,
    aiActionAuditLogs, userBusinesses, userContacts, financialGoals,
    userBudgets, adClicks
  ];
  for (const table of tables) {
    await tx.delete(table).where(and(eq(table.userId, userId), eq(table.userType, userType)));
  }
  const userTable = userType === "oauth" ? users : localUsers;
  await tx.delete(userTable).where(eq(userTable.id, userId));
}
```

---

## 8. 🏁 Conclusion & Verification Method

The Dual-Auth and Session Isolation system in SmartSpend AI is fundamentally well-architected around dual tables and strict RBAC middleware. The 12 identified vulnerabilities (notably local avatar dropping, raw phone string registration, SMS/voice session revocation bypasses, and OAuth token URL leakage) represent actionable, targeted fixes with zero architectural disruption.

### Independent Verification Commands:
```bash
# 1. Monorepo TypeScript Type Checking
npm run check

# 2. Vitest Auth & Middleware Test Suites
npm test -- api/middleware.test.ts api/dev-qa-paths.test.ts

# 3. Full Monorepo Vitest Suite (424 tests across 68 suites)
npm test
```
