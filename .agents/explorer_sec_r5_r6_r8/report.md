# Comprehensive Security Survey Report: R5, R6, R8
**Project:** SmartSpend AI — Enterprise-Grade Security Remediation  
**Date:** 2026-09-08  
**Surveyor:** Survey Explorer 3 (explorer_sec_r5_r6_r8)  
**Status:** Completed Investigation (Read-Only)  
**Classification:** Enterprise Security Audit & Implementation Blueprint  

---

## Executive Summary

This survey report provides an authoritative, evidence-backed security audit of the SmartSpend AI codebase focusing on three critical security pillars:
1. **R5 (P1): Plaintext Session Elimination & Sensitive Data Encryption**
2. **R6 (P1): Broken Object Level Authorization (BOLA/IDOR) Prevention**
3. **R8 (P2): Secure Cookie Migration, Schema Boundaries & File Upload Validation**

Every finding in this report includes verified file paths, exact line numbers, code snippets, risk assessments, and concrete architectural blueprints for the implementer subagents.

---

# SECTION 1: R5 — Plaintext Session Elimination & Sensitive Data Encryption

### 1.1 Plaintext Session Token Storage Audit

#### Observations & Call-Graph Tracing
- **Database Schema (`db/schema.ts:308-327`)**:
  ```typescript
  // ─── Sessions ───
  export const sessions = mysqlTable(
    "sessions",
    {
      id: int("id").primaryKey().autoincrement(),
      userId: int("user_id").notNull(),
      userType: varchar("user_type", { length: 50 }).notNull(),
      token: varchar("token", { length: 500 }),              // <── VULNERABILITY: Plaintext JWT stored
      tokenHash: binary32("token_hash"),
      ipAddress: varchar("ip_address", { length: 100 }),
      userAgent: text("user_agent"),
      expiresAt: datetime("expires_at").notNull(),
      createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => [
      index("sessions_user_idx").on(t.userId, t.userType),
      index("sessions_token_idx").on(t.token),               // <── Plaintext index
      uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
      index("sessions_expires_idx").on(t.expiresAt),
    ],
  );
  ```
  While `tokenHash` (`binary32`) was introduced in migration 0021, the column `token` remains populated with the raw, plaintext signed JWT on every session creation!

- **Session Creation (`api/local-auth-utils.ts:56-76`)**:
  ```typescript
  export async function createSession(
    userId: number,
    userType: "oauth" | "local",
    token: string,
    metadata: SessionMetadata = {},
  ) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { hex: tokenHash } = hashSessionToken(token);

    await db.insert(sessions).values({
      userId,
      userType,
      token,         // <── VULNERABILITY: Plaintext token written to database on EVERY login/register
      tokenHash,
      expiresAt,
      ipAddress: metadata.ipAddress || null,
      userAgent: metadata.userAgent || null,
    });
  }
  ```
  `createSession` is invoked by:
  - `api/local-auth-router.ts:163` (local user registration)
  - `api/local-auth-router.ts:312` (local user password login)
  - `api/auth-router.ts:206` (Google OAuth callback)
  - `api/webauthn-router.ts:322` (WebAuthn biometric login)

- **Session Token Verification (`api/lib/session-validation.ts:176-187`)**:
  ```typescript
  // Primary: lookup by tokenHash; Fallback: lookup by token
  const session = await db.query.sessions.findFirst({
    where: and(
      or(
        eq(sessions.tokenHash, tokenHashHex),
        eq(sessions.token, token),                       // <── VULNERABILITY: Fallback to plaintext query
      ),
      eq(sessions.userId, userId),
      eq(sessions.userType, userType),
      gt(sessions.expiresAt, new Date()),
    ),
  });
  ```
  The database query continues to evaluate `eq(sessions.token, token)`.

- **Session Logout (`api/local-auth-router.ts:356-360`)**:
  ```typescript
  const authHeader = getIncomingHeader(ctx.req, "Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await db.delete(sessions).where(eq(sessions.token, token));  // <── Directly deletes by plaintext token!
  }
  ```
  `logout` in `localAuthRouter` does not delete by `tokenHash` and ignores `invalidateSession(token)`!

- **Test Suite Dependency (`api/admin-authentication.security.test.ts:64-80`)**:
  ```typescript
  mocks.session.mockImplementation(({ where }: { where: SQL }) => {
    const query = new MySqlDialect().sqlToQuery(where);
    expect(query.sql).toContain("`sessions`.`token` = ?");       // <── Test explicitly expects plaintext query!
    expect(query.sql).toContain("`sessions`.`user_id` = ?");
  ...
  ```
  The mock in `admin-authentication.security.test.ts` will fail if `sessions.token` is removed without updating this test.

#### Vulnerability Assessment & Threat Model
If an attacker obtains read access to the database (e.g. database dump leak, read replica compromise, or blind SQL injection in any reporting query), the attacker extracts all active plaintext JWTs from `sessions.token`. Because these JWTs are signed with `JWT_SECRET`, the attacker can directly use them in the `Authorization: Bearer <token>` header to hijack any user's session without cracking passwords.

#### Cryptographic Remediation Architecture for Sessions
1. **Schema Refactoring (`db/schema.ts`)**:
   - Deprecate `token` column in `sessions`. Set it nullable in the Drizzle schema:
     `token: varchar("token", { length: 500 })` -> make optional/deprecated, remove `sessions_token_idx`.
   - Ensure `tokenHash` (`binary32("token_hash")`) is the sole lookup column with `uniqueIndex("sessions_token_hash_idx").on(t.tokenHash)`.
2. **Eliminate Plaintext Writes (`api/local-auth-utils.ts`)**:
   - In `createSession`:
     ```typescript
     await db.insert(sessions).values({
       userId,
       userType,
       token: null, // Zero plaintext token persistence!
       tokenHash,
       expiresAt,
       ipAddress: metadata.ipAddress || null,
       userAgent: metadata.userAgent || null,
     });
     ```
3. **Strict Hash-Only Lookup (`api/lib/session-validation.ts`)**:
   - In `validateActiveSessionToken`:
     ```typescript
     const { hex: tokenHashHex } = hashSessionToken(token);
     const session = await db.query.sessions.findFirst({
       where: and(
         eq(sessions.tokenHash, tokenHashHex), // Hash-only lookup
         eq(sessions.userId, userId),
         eq(sessions.userType, userType),
         gt(sessions.expiresAt, new Date()),
       ),
     });
     ```
4. **Fix Logout Endpoint (`api/local-auth-router.ts`)**:
   - Replace raw `db.delete(sessions).where(eq(sessions.token, token))` with:
     ```typescript
     const authHeader = getIncomingHeader(ctx.req, "Authorization");
     if (authHeader?.startsWith("Bearer ")) {
       const token = authHeader.slice(7).trim();
       await invalidateSession(token); // Invalidates Redis cache, bumps authVer, and deletes DB session by tokenHash!
     }
     ```
5. **Update Test Expectations (`api/admin-authentication.security.test.ts`)**:
   - Update line 66 from `expect(query.sql).toContain("`sessions`.`token` = ?")` to `expect(query.sql).toContain("`sessions`.`token_hash` = ?")`.

---

### 1.2 Webhook Tokens & Ingestion Credentials Security Audit

#### Observations
- **Database Schema (`db/schema.ts:684-697`)**:
  ```typescript
  export const webhookTokens = mysqlTable(
    "webhook_tokens",
    {
      id: int("id").primaryKey().autoincrement(),
      userId: int("user_id").notNull(),
      userType: varchar("user_type", { length: 50 }).notNull(),
      token: varchar("token", { length: 255 }).notNull().unique(), // <── VULNERABILITY: Stored in plaintext!
      name: varchar("name", { length: 100 }).default("Default Token"),
      createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => [
      index("webhook_tokens_user_idx").on(t.userId, t.userType),
    ],
  );
  ```
- **Webhook Ingestion (`api/sms-router.ts:179-187`)**:
  ```typescript
  const [tokenRecord] = await db
    .select()
    .from(webhookTokens)
    .where(eq(webhookTokens.token, token)) // Plaintext token lookup
    .limit(1);
  ```
- **Android Companion Status (`api/sms-router.ts:773-778`)**:
  ```typescript
  const [tokenRecord] = await db
    .select()
    .from(webhookTokens)
    .where(eq(webhookTokens.token, token)) // Plaintext token lookup
    .limit(1);
  ```
- **Token Generation & Retrieval (`api/profile-router.ts:368-404`, `api/sms-router.ts:532-590`)**:
  - `generateWebhookToken` generates `newToken = sms_${randomBytes(32).toString("hex")}` and inserts it into `webhookTokens.token`.
  - `getWebhookToken` queries `record.token` from the database and returns it to the client so that the iOS Shortcut or Android app can be configured.

#### Threat Model
Webhook tokens grant write access to inject financial expenses via `/api/sms/ingest`. If an attacker dumps `webhook_tokens`, they acquire the keys to forge financial transactions for every user in the platform without needing user passwords.

#### Cryptographic Remediation Architecture for Webhook Tokens
Because webhook tokens need to be displayed to the user in settings (`getWebhookToken`) or exported into an iOS Shortcut link (`deepLink`), but also need fast authentication lookup upon SMS receipt:
1. **Schema Update (`db/schema.ts`)**:
   Add `tokenHash: varchar("token_hash", { length: 64 }).notNull().unique()` (or `binary32`) and replace `token` with `encryptedToken: text("encrypted_token")`.
2. **Encryption & Hashing Scheme**:
   - When a token is generated (`sms_${randomBytes(32).toString("hex")}`):
     - Compute `tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex")`.
     - Encrypt `encryptedToken = encryptSecret(rawToken, env.JWT_SECRET)` using AES-256-GCM with a random IV.
     - Store `{ userId, userType, tokenHash, encryptedToken, name }`.
   - On Ingestion (`/api/sms/ingest`, `/api/sms/android-status`):
     - Compute `incomingHash = crypto.createHash("sha256").update(incomingToken).digest("hex")`.
     - Query `where(eq(webhookTokens.tokenHash, incomingHash))`.
     - Zero decryption needed on the ingestion fast-path!
   - On Display (`profileRouter.getWebhookToken`):
     - Fetch `encryptedToken` for the authenticated user (`where(userId = ctx.user.id)`).
     - Decrypt using `decryptSecret(record.encryptedToken, env.JWT_SECRET)` and return to the user.

---

### 1.3 Static Fallback Secret Keys Audit

#### Observations
A search for fallback secrets revealed critical hardcoded credentials:

1. **Hardcoded VAPID Keys (`api/notification-engine.ts:265-269`)**:
   ```typescript
   webpush.setVapidDetails(
     "mailto:contact@smartspend.com",
     process.env.VAPID_PUBLIC_KEY || "BBtKP6w97Av5YT6NvKCh3EostLvYiXIHQqM-QGSMlMYRk8fJPalWo3dvXEcghrnlizV1selpCWTOjU4qTjIBb3o",
     process.env.VAPID_PRIVATE_KEY || "-31rwR0LxanvleE02FotUVGGx3mVno1YJtR7hTaNHrA"
   );
   ```
   **Vulnerability Severity: Critical**.
   The VAPID private key is committed in plaintext. An attacker can use this key to push unauthorized, malicious notifications to users' browsers.

2. **Hardcoded Encryption Vault Secret (`api/lib/ai-gateway.ts:111-114`)**:
   ```typescript
   function getEncryptionKey(): Buffer {
     const secret = process.env.JWT_SECRET || process.env.DATABASE_URL || "smartspend-ai-gateway-secure-vault-key-32";
     return createHash("sha256").update(secret).digest();
   }
   ```
   **Vulnerability Severity: High**.
   If environment variables are unset or misconfigured, it falls back to a predictable static string `"smartspend-ai-gateway-secure-vault-key-32"`, rendering AES-256-GCM encryption trivial to decrypt.

3. **Bot Phone Number Fallback (`api/local-auth-router.ts:251`)**:
   ```typescript
   return status.phoneNumber || "201000000000"; // Fallback if not connected yet
   ```

#### Remediation Architecture for Secrets
- **In `api/lib/env.ts`**:
  Add `VAPID_PUBLIC_KEY: z.string().optional()` and `VAPID_PRIVATE_KEY: z.string().optional()`.
- **In `api/notification-engine.ts`**:
  Eliminate the hardcoded fallback strings. If `env.VAPID_PUBLIC_KEY` or `env.VAPID_PRIVATE_KEY` is missing:
  ```typescript
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails("mailto:contact@smartspend.com", env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  } else {
    console.warn("⚠️ VAPID keys not configured. Web Push notifications are disabled.");
  }
  ```
- **In `api/lib/ai-gateway.ts`**:
  Eliminate `process.env.DATABASE_URL` and the static string fallback. Use `env.JWT_SECRET` directly (guaranteed by boot-time validation) or a dedicated `AI_GATEWAY_SECRET`:
  ```typescript
  function getEncryptionKey(): Buffer {
    if (!env.JWT_SECRET) throw new Error("JWT_SECRET must be configured for AI gateway encryption");
    return createHash("sha256").update(env.JWT_SECRET).digest();
  }
  ```

---

# SECTION 2: R6 — Broken Object Level Authorization (BOLA/IDOR) Prevention

### 2.1 Complete Router Audit Matrix

We conducted an exhaustive audit of all 21 tRPC sub-routers. Below is the comprehensive matrix of all foreign-key and object reference parameters accepted in input payloads:

| Router | Procedure | Input Parameter | Database Target | User Ownership Verified? | Vulnerability Type | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `expenseRouter` | `create` | `walletId` | `user_wallets.id` | ❌ **NO** | BOLA / IDOR | **P1 (High)** |
| `expenseRouter` | `create` | `businessId` | `user_businesses.id` | ❌ **NO** | BOLA / IDOR | **P1 (High)** |
| `expenseRouter` | `create` | `contactId` | `user_contacts.id` | ✅ Yes (`resolveBatchExpenseReferences`) | None | - |
| `expenseRouter` | `create` | `classificationLogId` | `classification_logs.id` | ✅ Yes (`resolveBatchExpenseReferences`) | None | - |
| `expenseRouter` | `batchCreate` | `items[].walletId` | `user_wallets.id` | ❌ **NO** | BOLA / IDOR | **P1 (High)** |
| `expenseRouter` | `batchCreate` | `items[].businessId` | `user_businesses.id` | ❌ **NO** | BOLA / IDOR | **P1 (High)** |
| `expenseRouter` | `update` | `id` | `expenses.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `expenseRouter` | `delete` | `id` | `expenses.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `budgetRouter` | `create` | `linkedGoalId` | `financial_goals.id` | ❌ **NO** | BOLA / IDOR | **P1 (High)** |
| `budgetRouter` | `update` | `budgetId` | `user_budgets.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `budgetRouter` | `delete` | `budgetId` | `user_budgets.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `profileRouter` | `addContact` | `businessId` | `user_businesses.id` | ❌ **NO** | BOLA / IDOR | **P1 (High)** |
| `profileRouter` | `updateContact` | `businessId` | `user_businesses.id` | ❌ **NO** | BOLA / IDOR | **P1 (High)** |
| `profileRouter` | `updateContact` | `id` | `user_contacts.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `profileRouter` | `deleteContact` | `id` | `user_contacts.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `profileRouter` | `mergeContacts` | `primaryId`, `secondaryId` | `user_contacts.id` | ✅ Yes (filtered by `userId`) | None | - |
| `walletRouter` | `getWalletTransactions` | `walletId` | `user_wallets.id` | ⚠️ Partially (filters expenses by user, but doesn't verify wallet) | Information Leak / IDOR | Low |
| `walletRouter` | `updateWallet` | `id` | `user_wallets.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `walletRouter` | `deleteWallet` | `id` | `user_wallets.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `goalsRouter` | `analyze` | `goalId` | `financial_goals.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `goalsRouter` | `setStatus` | `goalId` | `financial_goals.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `goalsRouter` | `delete` | `goalId` | `financial_goals.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `businessRouter` | `updateCategory` | `id` | `business_categories.id` | ✅ Yes (checks parent business ownership) | None | - |
| `businessRouter` | `removeCategory` | `id` | `business_categories.id` | ✅ Yes (checks parent business ownership) | None | - |
| `businessRouter` | `linkContact` | `contactId` | `user_contacts.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `chatRouter` | `getConversation` | `conversationId` | `chat_conversations.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `chatRouter` | `clearConversation` | `conversationId` | `chat_conversations.id` | ✅ Yes (`userId` & `userType` in WHERE) | None | - |
| `chatRouter` | `sendMessage` | `conversationId` | `chat_conversations.id` | ✅ Yes (`requireOwnedConversation`) | None | - |

---

### 2.2 Deep Dive: The Four Identified BOLA / IDOR Flaws

#### Flaw 1: Unverified `walletId` in `expenseRouter.create` and `expenseRouter.batchCreate`
- **Location**: `api/expense-router.ts:468, 536, 627, 692`
- **Mechanism**:
  In `expense.create`:
  ```typescript
  const [result] = await tx.insert(expenses).values({
    userId,
    userType: requestUserType,
    ...
    businessId: input.businessId || null,
    walletId: input.walletId || null, // <── Injected without ownership check!
  });
  ```
  In `resolveBatchExpenseReferences` (`api/expense-router.ts:155-230`), `contactId` and `classificationLogId` are verified:
  ```typescript
  // Contact validation:
  const foundContacts = await database.select().from(userContacts).where(
    and(inArray(userContacts.id, explicitContactIds), eq(userContacts.userId, userId), eq(userContacts.userType, userType))
  );
  // Logs validation:
  const foundLogs = await database.select().from(classificationLogs).where(
    and(inArray(classificationLogs.id, explicitLogIds), eq(classificationLogs.userId, userId), eq(classificationLogs.userType, userType))
  );
  ```
  However, `walletId` is **completely ignored** by `resolveBatchExpenseReferences`!
- **Exploit Scenario**:
  User A creates an expense with `walletId: 42` (which belongs to User B). The transaction is written to the database with `walletId = 42`.
  When User B deletes their wallet, line 108 of `walletRouter.deleteWallet` executes:
  ```typescript
  await tx.update(expenses).set({ walletId: null }).where(
    and(eq(expenses.walletId, input.id), eq(expenses.userId, ctx.user.id), eq(expenses.userType, ctx.user.type))
  );
  ```
  User A's expense is **not** nullified because `expenses.userId` does not match User B! This leaves orphaned references, foreign-key integrity corruption, and cross-tenant pollution.

#### Flaw 2: Unverified `businessId` in `expenseRouter.create` and `expenseRouter.batchCreate`
- **Location**: `api/expense-router.ts:467, 535, 626, 691`
- **Mechanism**:
  Just like `walletId`, `businessId` is inserted directly without validating that the business belongs to `ctx.user.id` and `ctx.user.type`.
- **Exploit Scenario**:
  User A creates an expense and assigns `businessId: 10` (User B's commercial project). User A's expense will be linked to User B's business ID, polluting business rollups, reports, and AI classification memories.

#### Flaw 3: Unverified `linkedGoalId` in `budgetRouter.create`
- **Location**: `api/budget-router.ts:114, 126`
- **Mechanism**:
  ```typescript
  create: authedProcedure
    .input(z.object({
      ...
      linkedGoalId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [result] = await db.insert(userBudgets).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        ...
        linkedGoalId: input.linkedGoalId || null, // <── No check against financialGoals!
      });
  ```
- **Exploit Scenario**:
  User A attaches their budget to User B's private `financialGoal` (e.g. `linkedGoalId: 5`). When User B deletes goal 5, line 305 of `goalsRouter.delete` only nullifies `userBudgets` where `userId = ctx.user.id`, leaving User A's budget pointing to User B's deleted goal. Furthermore, future joins or features displaying goal progress on budgets will leak goal progress across accounts.

#### Flaw 4: Unverified `businessId` in `profileRouter.addContact` and `profileRouter.updateContact`
- **Location**: `api/profile-router.ts:630, 653, 668, 695`
- **Mechanism**:
  In `addContact`:
  ```typescript
  const [result] = await db.insert(userContacts).values({
    userId: ctx.user.id as number,
    userType: ctx.user.type,
    name: input.name,
    relation: input.relation || null,
    contactType: input.contactType,
    businessId: input.businessId || null, // <── No check against userBusinesses!
    isSilenced: false,
  });
  ```
  In `updateContact`:
  ```typescript
  if (input.businessId !== undefined) {
    // updates.businessId directly applied to userContacts!
  }
  ```
- **Exploit Scenario**:
  User A can link their private supplier or personal contact to User B's `businessId`. In `businessRouter.get` (line 70), contact count is calculated:
  `select count(*) from userContacts where businessId = business.id and contactType = 'business_supplier'`.
  User A's injected contacts artificially distort User B's business supplier count and metrics.

---

### 2.3 Concrete BOLA / IDOR Remediation Architecture

#### Component A: Ownership Guard Helper Module (`api/lib/ownership-guard.ts`)
Create a dedicated, reusable ownership validation helper:
```typescript
import { db } from "../queries/connection";
import { userWallets, userBusinesses, financialGoals, userContacts } from "../../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export async function validateWalletOwnership(
  walletId: number | null | undefined,
  userId: number,
  userType: string,
): Promise<void> {
  if (!walletId) return;
  const [wallet] = await db
    .select({ id: userWallets.id })
    .from(userWallets)
    .where(and(eq(userWallets.id, walletId), eq(userWallets.userId, userId), eq(userWallets.userType, userType)))
    .limit(1);

  if (!wallet) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "المحفظة المحددة غير موجودة أو لا تملك صلاحية الوصول إليها",
    });
  }
}

export async function validateBusinessOwnership(
  businessId: number | null | undefined,
  userId: number,
  userType: string,
): Promise<void> {
  if (!businessId) return;
  const [business] = await db
    .select({ id: userBusinesses.id })
    .from(userBusinesses)
    .where(and(eq(userBusinesses.id, businessId), eq(userBusinesses.userId, userId), eq(userBusinesses.userType, userType)))
    .limit(1);

  if (!business) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "المشروع المحدد غير موجود أو لا تملك صلاحية الوصول إليه",
    });
  }
}

export async function validateGoalOwnership(
  goalId: number | null | undefined,
  userId: number,
  userType: string,
): Promise<void> {
  if (!goalId) return;
  const [goal] = await db
    .select({ id: financialGoals.id })
    .from(financialGoals)
    .where(and(eq(financialGoals.id, goalId), eq(financialGoals.userId, userId), eq(financialGoals.userType, userType)))
    .limit(1);

  if (!goal) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "الهدف المالي المحدد غير موجود أو لا تملك صلاحية الوصول إليه",
    });
  }
}
```

#### Component B: Extend Batch Reference Resolution in `expenseRouter`
In `api/expense-router.ts`, expand `resolveBatchExpenseReferences` to validate `walletId` and `businessId` in a single batched query:
```typescript
// 3. Batched Wallet Validation
const explicitWalletIds = [
  ...new Set(items.map((i) => i.walletId).filter((id): id is number => typeof id === "number" && id > 0)),
];
if (explicitWalletIds.length > 0) {
  const foundWallets = await database
    .select({ id: userWallets.id })
    .from(userWallets)
    .where(and(inArray(userWallets.id, explicitWalletIds), eq(userWallets.userId, userId), eq(userWallets.userType, userType)));
  const validWalletIds = new Set(foundWallets.map((w) => w.id));
  for (const requestedId of explicitWalletIds) {
    if (!validWalletIds.has(requestedId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "المحفظة المختارة غير موجودة" });
    }
  }
}

// 4. Batched Business Validation
const explicitBusinessIds = [
  ...new Set(items.map((i) => i.businessId).filter((id): id is number => typeof id === "number" && id > 0)),
];
if (explicitBusinessIds.length > 0) {
  const foundBusinesses = await database
    .select({ id: userBusinesses.id })
    .from(userBusinesses)
    .where(and(inArray(userBusinesses.id, explicitBusinessIds), eq(userBusinesses.userId, userId), eq(userBusinesses.userType, userType)));
  const validBusinessIds = new Set(foundBusinesses.map((b) => b.id));
  for (const requestedId of explicitBusinessIds) {
    if (!validBusinessIds.has(requestedId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "المشروع المختار غير موجود" });
    }
  }
}
```

---

# SECTION 3: R8 — Secure Cookie Migration, Schema Boundaries & File Upload Validation

### 3.1 Local Auth Token Transmission (Dual-Mode Cookie + Header)

#### Current State & Problem Statement
- Google OAuth session cookie is set as `google_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (`api/boot.ts:354`).
- In contrast, Local Auth (`localAuthRouter.login`, `register`, `webauthn`) sends JWT tokens exclusively in the JSON response body (`token: string`).
- Web clients store this token in browser `localStorage`, which is readable by any JavaScript execution, exposing users to credential theft if any XSS vulnerability exists.
- At the same time, mobile companion clients (the Android companion app and iOS Shortcuts) need `Authorization: Bearer <token>` because web cookies do not naturally attach to background automation requests.

#### Dual-Mode Solution Blueprint
1. **Response Side (`api/local-auth-router.ts` & `api/webauthn-router.ts`)**:
   In `register`, `login`, and `webauthn.authenticate`:
   ```typescript
   if (ctx.resHeaders) {
     const isProd = process.env.NODE_ENV === "production";
     const cookieVal = `smartspend_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${isProd ? "; Secure" : ""}`;
     ctx.resHeaders.append("Set-Cookie", cookieVal);
   }
   // Return JSON with token to maintain 100% backward compatibility with companion apps
   return { success: true, token, user: ... };
   ```
2. **Context Resolution (`api/context.ts`)**:
   Update `createContext` to check:
   - **Step 1:** `Authorization: Bearer <token>` in incoming headers. (Highest priority: ensures mobile, CLI, test suites, and companion apps work unchanged).
   - **Step 2:** `smartspend_token` cookie via `parseCookie(req, "smartspend_token")`. (Secure web browser sessions without localStorage).
   - **Step 3:** `google_session` cookie via `parseCookie(req, "google_session")`. (Google OAuth fallback).
3. **Logout Cleanup (`api/local-auth-router.ts:348-355`)**:
   Ensure `ctx.resHeaders` clears both cookies:
   ```typescript
   ctx.resHeaders.append("Set-Cookie", "smartspend_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
   ctx.resHeaders.append("Set-Cookie", "google_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
   ```

---

### 3.2 Tightening User Profile Schemas (Eliminating `z.any()`)

#### Current State & Problem Statement
In `api/profile-router.ts:37-46`:
```typescript
const smartProfilePatchSchema = z.object({
  basicInfo: z.record(z.string(), z.any()).optional(),
  financialInfo: z.record(z.string(), z.any()).optional(),
  lifestyleInfo: z.record(z.string(), z.any()).optional(),
  onboardingAnswers: z.record(z.string(), z.any()).optional(),
  aiInferredAttributes: z.record(z.string(), z.any()).optional(),
  preferences: z.record(z.string(), z.any()).optional(),
  avatarId: z.string().nullable().optional(),
  profileCompleted: z.boolean().optional(),
});
```
And in `submitOnboardingAnswer` (`api/profile-router.ts:267, 271`):
```typescript
value: z.any().optional(),
accumulatedAnswers: z.record(z.string(), z.any()).optional(),
```
Permissive `z.any()` allows arbitrary nested objects, deeply nested recursion, strings of unlimited length, and prototype pollution keys (`__proto__`, `constructor`) to be stored in MySQL JSON columns (`user_profiles`).

#### Tightened Schema Design
1. **Safe Value & Section Schemas**:
   ```typescript
   const safePrimitiveSchema = z.union([
     z.string().max(500),
     z.number().finite(),
     z.boolean(),
   ]);

   const safeArraySchema = z.array(z.string().max(200)).max(50);

   const safeProfileValueSchema = z.union([
     safePrimitiveSchema,
     safeArraySchema,
   ]);

   const safeProfileSectionSchema = z
     .record(
       z.string().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/, "مفتاح غير صالح"),
       safeProfileValueSchema,
     )
     .max(60);
   ```
2. **Explicit Onboarding Answer Schema**:
   ```typescript
   const onboardingAnswerSchema = z.object({
     value: safeProfileValueSchema.optional(),
     skipped: z.boolean().optional(),
     answeredAt: z.string().datetime().optional(),
     updatedAt: z.string().datetime().optional(),
   });
   ```
3. **Applied to `smartProfilePatchSchema`**:
   ```typescript
   const smartProfilePatchSchema = z.object({
     basicInfo: safeProfileSectionSchema.optional(),
     financialInfo: safeProfileSectionSchema.optional(),
     lifestyleInfo: safeProfileSectionSchema.optional(),
     onboardingAnswers: z.record(z.string().max(80), onboardingAnswerSchema).max(100).optional(),
     aiInferredAttributes: safeProfileSectionSchema.optional(),
     preferences: safeProfileSectionSchema.optional(),
     avatarId: z.string().max(100).nullable().optional(),
     profileCompleted: z.boolean().optional(),
   });
   ```

---

### 3.3 Verified Phone Number Change Flow

#### Current State & Problem Statement
In `api/profile-router.ts:336-365`:
```typescript
updateUserInfo: authedProcedure
  .input(
    z.object({
      name: z.string().min(2).optional(),
      phone: z.string().optional(),
      avatar: z.string().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    ...
    if (input.phone) updates.phone = input.phone; // <── Unverified direct update!
    await db.update(localUsers).set(updates).where(eq(localUsers.id, ctx.user.id));
```
**Vulnerabilities**:
- Zero OTP verification: an authenticated user can change their phone number to any number without proving possession.
- Collision / Account Takeover: If User A changes their phone to User B's number, subsequent logins via phone OTP will target User A instead of User B.
- Lack of format validation: No check via `cleanPhoneNumber` or Egyptian phone regex.

#### Two-Step Verified Workflow Implementation Blueprint
1. **Remove `phone` from `updateUserInfo` input schema**:
   `updateUserInfo` must only modify non-credential profile fields (`name`, `avatar`).
2. **Implement `requestPhoneChange` (`api/profile-router.ts`)**:
   ```typescript
   requestPhoneChange: authedProcedure
     .input(z.object({ newPhone: z.string().min(10).max(15) }))
     .mutation(async ({ ctx, input }) => {
       if (ctx.user.type !== "local") {
         throw new TRPCError({ code: "BAD_REQUEST", message: "تغيير رقم الهاتف متاح فقط للحسابات المحلية" });
       }
       const clean = cleanPhoneNumber(input.newPhone);
       const validation = validatePhone(clean);
       if (!validation.valid) {
         throw new TRPCError({ code: "BAD_REQUEST", message: validation.message });
       }

       // Ensure phone is not already in use by another user
       const existing = await db.query.localUsers.findFirst({
         where: eq(localUsers.phone, clean),
       });
       if (existing && existing.id !== ctx.user.id) {
         throw new TRPCError({ code: "CONFLICT", message: "رقم الهاتف مسجل بالفعل لحساب آخر" });
       }

       // Generate 6-digit verification code and store in otpCache
       const code = "SS-" + randomInt(100000, 1000000).toString();
       otpCache.set(`phone-change:${ctx.user.id}:${clean}`, {
         phone: clean,
         code,
         expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
         verified: false,
       });

       // Trigger OTP via whatsappService if enabled
       const settings = await getSystemSettings();
       if (settings["whatsapp_otp_enabled"] === "true") {
         await whatsappService.sendMessage(clean, `رمز تأكيد تغيير رقم الهاتف في SmartSpend هو: ${code}`);
       }

       return { success: true, message: "تم إرسال رمز التأكيد إلى رقم هاتفك الجديد" };
     }),
   ```
3. **Implement `confirmPhoneChange` (`api/profile-router.ts`)**:
   ```typescript
   confirmPhoneChange: authedProcedure
     .input(z.object({
       newPhone: z.string().min(10).max(15),
       code: z.string().min(4).max(12),
     }))
     .mutation(async ({ ctx, input }) => {
       if (ctx.user.type !== "local") {
         throw new TRPCError({ code: "BAD_REQUEST", message: "غير متاح" });
       }
       const clean = cleanPhoneNumber(input.newPhone);
       const cacheKey = `phone-change:${ctx.user.id}:${clean}`;
       const record = otpCache.get(cacheKey);

       if (!record || record.expiresAt < Date.now() || record.code !== input.code.trim()) {
         throw new TRPCError({ code: "BAD_REQUEST", message: "رمز التأكيد غير صحيح أو منتهي الصلاحية" });
       }

       otpCache.delete(cacheKey);

       // Update phone number
       await db.update(localUsers).set({ phone: clean }).where(eq(localUsers.id, ctx.user.id));
       // Invalidate cached principal and bump auth version
       await bumpAuthVersion("local", ctx.user.id);

       return { success: true };
     }),
   ```

---

### 3.4 File Upload & Receipt Image Magic Bytes Verification

#### Current State & Problem Statement
- `imageRouter.parseReceipt` (`api/image-router.ts:55-71`):
  Receives `imageBase64: z.string().min(100)` and `mimeType: z.string().default("image/jpeg")`.
  It only checks character length (`length > 5_500_000`).
- `receipt-image-parser.ts:47-59`:
  Strips the data URI scheme, truncates base64 string, and passes it directly to Gemini Vision API as `inlineData`.
- `avatar-service.ts:16-35`:
  Checks byte length ≤ 2MB, but performs zero format or header validation.

**Vulnerability**: An attacker can send non-image files (e.g., shell scripts, HTML/SVG with embedded XSS payloads, or polyglot binaries) under `mimeType: "image/jpeg"`.

#### Magic Bytes Header Verification Design
A file's true MIME type is governed by its initial binary signature (magic bytes), not the HTTP `Content-Type` header or base64 data URI prefix.

```
Format      Magic Bytes (Hex)                       Offset / Signature
-------------------------------------------------------------------------
JPEG        FF D8 FF                                Offset 0..2
PNG         89 50 4E 47 0D 0A 1A 0A                 Offset 0..7
WebP        52 49 46 46 ... 57 45 42 50             Offset 0..3 ('RIFF') and 8..11 ('WEBP')
```

#### Reusable Verification Module (`api/lib/image-magic-bytes.ts`)
```typescript
import { TRPCError } from "@trpc/server";

export type ImageFormat = "jpeg" | "png" | "webp";

export interface MagicBytesResult {
  valid: boolean;
  format?: ImageFormat;
  mimeType?: string;
  error?: string;
}

export function detectImageMagicBytes(buffer: Buffer): MagicBytesResult {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: "الملف صغير جداً ولا يحتوي على ترويسة صورة صالحة" };
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: "jpeg", mimeType: "image/jpeg" };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, format: "png", mimeType: "image/png" };
  }

  // 3. WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, format: "webp", mimeType: "image/webp" };
  }

  return {
    valid: false,
    error: "نوع الملف المرفوع غير مدعوم. الأنواع المسموحة هي فقط JPEG و PNG و WebP",
  };
}

export function assertImageMagicBytes(buffer: Buffer): { format: ImageFormat; mimeType: string } {
  const result = detectImageMagicBytes(buffer);
  if (!result.valid || !result.format || !result.mimeType) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: result.error || "الملف المرفوع ليس صورة صالحة",
    });
  }
  return { format: result.format, mimeType: result.mimeType };
}
```

#### Integration into `imageRouter.parseReceipt`
```typescript
// Decode base64 to check magic bytes
const rawBase64 = stripDataUri(input.imageBase64);
const imageBuffer = Buffer.from(rawBase64, "base64");
const { mimeType: verifiedMimeType } = assertImageMagicBytes(imageBuffer);

// Pass verifiedMimeType to parseReceiptImage instead of untrusted input.mimeType
const parsed = await parseReceiptImage({
  imageBase64: rawBase64,
  mimeType: verifiedMimeType,
  ...
});
```

---

# SECTION 4: File Impact Analysis & Verification Strategy

### 4.1 Affected Source Files
| Target File | Changes Required | Risk Level |
| :--- | :--- | :--- |
| `db/schema.ts` | Nullify/deprecate `sessions.token`, add `webhookTokens.tokenHash` and `webhookTokens.encryptedToken`. | Medium |
| `api/local-auth-utils.ts` | Stop inserting plaintext token into `sessions`. | Low |
| `api/lib/session-validation.ts` | Remove `or(eq(tokenHash), eq(token))` fallback; query strictly by `tokenHash`. | Low |
| `api/local-auth-router.ts` | Fix `logout` to delete by `tokenHash`. Append `smartspend_token` Set-Cookie in `login` and `register`. | Low |
| `api/auth-router.ts` | Ensure cookie clearing on logout handles `smartspend_token`. | Low |
| `api/context.ts` | Support `smartspend_token` cookie alongside Bearer token. | Low |
| `api/notification-engine.ts` | Remove hardcoded static VAPID strings. | Low |
| `api/lib/ai-gateway.ts` | Remove static string fallback from vault key. | Low |
| `api/sms-router.ts` | Query webhook tokens by `tokenHash`. | Low |
| `api/lib/ownership-guard.ts` (NEW) | Ownership assertion functions for wallets, businesses, goals, and contacts. | Low |
| `api/expense-router.ts` | Verify `walletId` and `businessId` ownership in `resolveBatchExpenseReferences`. | Low |
| `api/budget-router.ts` | Verify `linkedGoalId` ownership on `create` and `update`. | Low |
| `api/profile-router.ts` | Verify `businessId` on `addContact` & `updateContact`. Tighten `smartProfilePatchSchema`. Add 2-step OTP phone change. | Medium |
| `api/lib/image-magic-bytes.ts` (NEW) | Binary magic bytes detector for JPEG, PNG, and WebP. | Low |
| `api/image-router.ts` | Enforce magic bytes validation on `parseReceipt`. | Low |
| `api/admin-authentication.security.test.ts` | Update mock expectation from `sessions.token = ?` to `sessions.token_hash = ?`. | Low |

### 4.2 Verification Commands
- Monorepo TypeScript check:
  `npm run check` (Must pass with 0 errors)
- Vitest Security and Router suites:
  `npx vitest run api/admin-authentication.security.test.ts`
  `npx vitest run api/business-router.security.test.ts`
  `npx vitest run api/local-auth-router.security.test.ts`
  `npx vitest run tests/auth-hot-path.test.ts`
  `npm run test` (All 424 tests must pass)

---
*Report compiled and certified by Survey Explorer 3 (explorer_sec_r5_r6_r8)*
