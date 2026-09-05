# Exhaustive Security Audit Report: Authorization, RBAC & API Routers

**Target System**: SmartSpend AI Financial Platform (`api/`)  
**Auditor**: Authorization, RBAC & API Router Security Explorer  
**Date**: August 28, 2026  
**Scope**: All 22 tRPC Sub-Routers, Procedure Factories (`api/middleware.ts`), Context & Identity Resolution (`api/context.ts`), Dual-User Isolation Model, and API Webhooks/SSE.

---

## Executive Summary

An exhaustive, line-by-line security audit was performed on the entire SmartSpend backend API layer, covering all **22 tRPC sub-routers**, procedure factories, context resolution, rate limiting, and database authorization predicates.

### Key Takeaways:
1. **Critical BOLA / IDOR Vulnerabilities Identified in `business-router.ts`**:
   - `business.updateCategory`: Arbitrary category modification without tenant ownership verification.
   - `business.removeCategory`: Arbitrary category deactivation without tenant ownership verification.
   - `business.linkContact`: Arbitrary contact hijacking/reassignment across tenants.
2. **Missing Foreign Key Validation Identified in `expense-router.ts`**:
   - `expense.create` and `expense.batchCreate` validate `contactId` and `classificationLogId`, but omit ownership validation for `walletId` and `businessId`.
3. **Dual-User Model & Multi-Tenant Isolation Posture**:
   - The dual-user model (`users` for Google OAuth and `localUsers` for Phone/Password/WebAuthn) utilizes independent autoincrement integer IDs, creating potential ID collisions between OAuth and Local accounts.
   - 21 of 22 routers properly guard against ID collision by enforcing composite predicates (`and(eq(table.userId, ctx.user.id), eq(table.userType, ctx.user.type))`).
4. **RBAC vs. Plan Separation**:
   - The separation between administrative roles (`user`, `moderator`, `admin`) and subscription plans (`free`, `pro`, `ultra`) is strictly maintained. Admins safely bypass subscription gates where intended, and no privilege escalation vectors from plan to role were found.

---

## 1. Procedure Factories & Access Control (`api/middleware.ts` & `api/context.ts`)

### 1.1 Procedure Factory Matrix

| Procedure Factory | Access Level | Rate Limit Policy | Implementation Security Status |
| :--- | :--- | :--- | :--- |
| `publicProcedure` | Anonymous / All | 400 req/min per IP | ✅ **Secure** — General public endpoints (ads, SEO, bot status). |
| `strictPublicProcedure` | Anonymous Auth | 25 req/15min per IP | ✅ **Secure** — Anti brute-force protection on Login, Register, OTP, WebAuthn. |
| `authedProcedure` | Authenticated Users | 100 req/min per user (`type:id`) | ✅ **Secure** — Verifies `ctx.user` presence, keyed rate limiter. |
| `aiProcedure` | Authenticated Users | 100 req/min per user (`type:id`) | ✅ **Secure** — Stricter separate AI rate limit window with automatic map cleanup. |
| `moderatorProcedure` | `role: admin \| moderator` | Inherits `authedProcedure` | ✅ **Secure** — Enforces role check (`role === "admin" \|\| role === "moderator"`). |
| `adminProcedure` | `role: admin` | Inherits `authedProcedure` | ✅ **Secure** — Strict admin-only barrier (`role === "admin"`). |
| `proProcedure` | `plan: pro \| ultra` OR `role: admin` | Inherits `authedProcedure` | ✅ **Secure** — Gates premium features; allows admin override for testing. |
| `proAiProcedure` | `plan: pro \| ultra` OR `role: admin` | 100 req/min per user | ✅ **Secure** — Gates premium AI features. |
| `ultraProcedure` | `plan: ultra` OR `role: admin` | Inherits `authedProcedure` | ✅ **Secure** — Gates top-tier Ultra features. |

### 1.2 Dual-User Identity Resolution (`api/context.ts`)
- **Mechanism**:
  1. Checks `google_session` cookie → queries `validateActiveSessionToken(googleToken, "oauth")` → loads from `users`.
  2. Checks `Authorization: Bearer <token>` → queries `validateActiveSessionToken(token)` → loads from `users` (if `userType === "oauth"`) or `localUsers` (if `userType === "local"`).
- **Normalized Type**: `UnifiedUser { id, name, email, avatar, role, plan, type, phone }`.
- **Security Finding**: Because `users.id` and `localUsers.id` are separate integer sequences, `id=1` exists for both OAuth and Local users. Authorization queries must always check both `userId` AND `userType`.

---

## 2. Exhaustive Audit Matrix of All 22 Routers

| # | Router Name | File Path | Guard Level | BOLA / IDOR Status | Multi-Tenant Isolation | Notes / Findings |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `expense` | `api/expense-router.ts` | `authedProcedure` | ⚠️ Low (Missing FK checks) | ✅ Complete | Validates `contactId`/`logId`; lacks ownership check on `walletId` and `businessId`. |
| 2 | `wallet` | `api/wallet-router.ts` | `authedProcedure` | ✅ Protected | ✅ Complete | All CRUD operations filter on `userWallets.userId` & `userType`. |
| 3 | `business` | `api/business-router.ts` | `proProcedure`, `proAiProcedure` | 🚨 **CRITICAL VULNERABILITIES** | 🚨 **BROKEN** | IDOR in `updateCategory`, `removeCategory`, and `linkContact`. |
| 4 | `budget` | `api/budget-router.ts` | `authedProcedure` | ✅ Protected | ✅ Complete | Complete user and tenant isolation on `userBudgets`. |
| 5 | `goals` | `api/goals-router.ts` | `authedProcedure`, `proProcedure` | ✅ Protected | ✅ Complete | Complete user and tenant isolation on `financialGoals`. |
| 6 | `chat` | `api/chat-router.ts` | `authedProcedure`, `aiProcedure` | ✅ Protected | ✅ Complete | Enforces `requireOwnedConversation` and `loadPendingAction` ownership. |
| 7 | `ai` | `api/ai-router.ts` | `authedProcedure`, `aiProcedure` | ✅ Protected | ✅ Complete | All user dictionaries, summaries, and monthly reports filter by `userId` and `userType`. |
| 8 | `analytics` | `api/analytics-router.ts` | `authedProcedure`, `moderatorProcedure` | ✅ Protected | ✅ Complete | Moderator stats cleanly group by `userId` and `userType`. |
| 9 | `admin` | `api/admin-router.ts` | `adminProcedure`, `moderatorProcedure` | ✅ Protected | ✅ Complete | Strict RBAC guards on settings, providers, users, and audit data. |
| 10 | `adminWhatsapp` | `api/admin-whatsapp-router.ts`| `adminProcedure` | ✅ Protected | ✅ Complete | Admin-only controls for WhatsApp daemon, broadcast, and settings. |
| 11 | `support` | `api/support-router.ts` | `authedProcedure`, `moderatorProcedure` | ✅ Protected | ✅ Complete | `getById` and `close` verify ticket ownership (`userId` + `userType`) or staff role. |
| 12 | `export` | `api/export-router.ts` | `authedProcedure`, `proProcedure`, `moderatorProcedure` | ✅ Protected | ✅ Complete | Exports scoped strictly to authenticated user's records. |
| 13 | `session` | `api/session-router.ts` | `authedProcedure`, `moderatorProcedure` | ✅ Protected | ✅ Complete | `revokeMine` enforces `eq(sessions.userId, ctx.user.id)` and `userType`. |
| 14 | `pro` | `api/pro-router.ts` | `authedProcedure`, `adminProcedure` | ✅ Protected | ✅ Complete | Upgrade simulations blocked in production; cancelation scopes to user. |
| 15 | `ads` | `api/ads-router.ts` | `publicProcedure`, `authedProcedure`, `adminProcedure` | ✅ Protected | ✅ Complete | Ad management restricted to admin; impression/click properly tracked. |
| 16 | `referral` | `api/referral-router.ts` | `authedProcedure`, `adminProcedure` | ✅ Protected | ✅ Complete | Self-referral blocked; concurrency safe via DB unique index. |
| 17 | `seo` | `api/seo-router.ts` | `publicProcedure`, `adminProcedure` | ✅ Protected | ✅ Complete | Public reads for sitemaps/pages; admin-only mutations. |
| 18 | `profile` | `api/profile-router.ts` | `authedProcedure` | ✅ Protected | ✅ Complete | Full contact CRUD, onboarding answers, and webhook tokens properly scoped. |
| 19 | `image` | `api/image-router.ts` | `proProcedure` | ✅ Protected | ✅ Complete | Size caps enforced; expense created with `userId` and `userType`. |
| 20 | `auth` | `api/auth-router.ts` | `publicProcedure`, `strictPublicProcedure`, `authedProcedure` | ✅ Protected | ✅ Complete | Constant-time OAuth state comparison; session invalidation on logout. |
| 21 | `localAuth` | `api/local-auth-router.ts` | `publicProcedure`, `strictPublicProcedure`, `adminProcedure` | ✅ Protected | ✅ Complete | Phone validation, password hashing, memory rate-limited OTP. |
| 22 | `webauthn` | `api/webauthn-router.ts` | `strictPublicProcedure`, `authedProcedure` | ✅ Protected | ✅ Complete | Passkey cryptographic verification with challenge expiry & session binding. |

---

## 3. Deep Vulnerability Breakdown

---

### [CRITICAL-01] Broken Object-Level Authorization (BOLA/IDOR) in `business.updateCategory` and `business.removeCategory`

- **Affected File**: `api/business-router.ts`
- **Affected Lines**: Lines 354–392
- **CWE**: CWE-639 (Authorization Bypass Through User-Controlled Key / IDOR)

#### Vulnerability Description:
In `businessRouter`, both `updateCategory` and `removeCategory` accept a category `id` directly from user input and execute SQL mutations against `businessCategories` filtered solely on `eq(businessCategories.id, input.id)`. The router fails to verify that the target category belongs to the authenticated user's business (`userBusinesses.userId === ctx.user.id && userBusinesses.userType === ctx.user.type`).

#### Vulnerable Code Snippet (`api/business-router.ts`):
```typescript
// Lines 354-380
updateCategory: proProcedure
  .input(z.object({
    id: z.number(),
    name: z.string().min(1).max(100).optional(),
    nameAr: z.string().min(1).max(100).optional(),
    type: z.enum(["expense", "income", "both"]).optional(),
    icon: z.string().max(50).optional(),
    color: z.string().max(50).optional(),
    keywords: z.array(z.string()).optional(),
    matchExamples: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(cleanUpdates).length > 0) {
      await db
        .update(businessCategories)
        .set(cleanUpdates)
        .where(eq(businessCategories.id, id)); // ❌ NO OWNERSHIP CHECK!
    }

    invalidateUserClassificationCache(ctx.user.id);
    return { success: true };
  }),

// Lines 382-392
removeCategory: proProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    await db
      .update(businessCategories)
      .set({ isActive: false })
      .where(eq(businessCategories.id, input.id)); // ❌ NO OWNERSHIP CHECK!

    invalidateUserClassificationCache(ctx.user.id);
    return { success: true };
  }),
```

#### Exploit Scenario:
1. Attacker (User A with Pro plan) registers a business.
2. Attacker calls `trpc.business.updateCategory.mutate({ id: 105, name: "Malicious Category", isActive: false })`.
3. Category `105` belongs to Victim User B. The category name is altered and deactivated in User B's account.

#### Remediation:
Verify that the category belongs to an active business owned by `ctx.user.id` and `ctx.user.type` before updating or deleting:

```typescript
// Proposed Fix for updateCategory:
const userBusiness = await db
  .select({ id: userBusinesses.id })
  .from(userBusinesses)
  .where(and(
    eq(userBusinesses.userId, ctx.user.id),
    eq(userBusinesses.userType, ctx.user.type),
    eq(userBusinesses.isActive, true),
  ))
  .limit(1);

if (userBusiness.length === 0) {
  throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد مشروع نشط" });
}

const [targetCat] = await db
  .select({ id: businessCategories.id })
  .from(businessCategories)
  .where(and(
    eq(businessCategories.id, id),
    eq(businessCategories.businessId, userBusiness[0].id),
  ))
  .limit(1);

if (!targetCat) {
  throw new TRPCError({ code: "NOT_FOUND", message: "الفئة غير موجودة" });
}

await db
  .update(businessCategories)
  .set(cleanUpdates)
  .where(eq(businessCategories.id, id));
```

---

### [CRITICAL-02] Broken Object-Level Authorization (IDOR) in `business.linkContact` (Contact Hijacking)

- **Affected File**: `api/business-router.ts`
- **Affected Lines**: Lines 394–421
- **CWE**: CWE-639 / CWE-284

#### Vulnerability Description:
In `business.linkContact`, the procedure checks that the calling user has an active business, but updates `userContacts` matching only `eq(userContacts.id, input.contactId)`. It fails to verify that the contact being updated belongs to `ctx.user.id` and `ctx.user.type`.

#### Vulnerable Code Snippet (`api/business-router.ts`):
```typescript
// Lines 394-421
linkContact: proProcedure
  .input(z.object({
    contactId: z.number(),
    contactType: z.enum(["business_supplier", "business_customer", "business_employee"]),
  }))
  .mutation(async ({ ctx, input }) => {
    const business = await db
      .select({ id: userBusinesses.id })
      .from(userBusinesses)
      .where(and(
        eq(userBusinesses.userId, ctx.user.id),
        eq(userBusinesses.userType, ctx.user.type),
        eq(userBusinesses.isActive, true),
      ))
      .limit(1);

    if (business.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد مشروع نشط" });
    }

    await db
      .update(userContacts)
      .set({ businessId: business[0].id, contactType: input.contactType })
      .where(eq(userContacts.id, input.contactId)); // ❌ NO USER OWNERSHIP CHECK!

    invalidateUserClassificationCache(ctx.user.id);
    return { success: true };
  }),
```

#### Exploit Scenario:
1. Attacker User A creates a business.
2. Attacker invokes `trpc.business.linkContact.mutate({ contactId: 450, contactType: "business_supplier" })`.
3. Contact `450` belongs to Victim User B. The contact's `businessId` is overwritten with User A's `business.id`.
4. User A can now see contact `450` in their business contact count, and the contact is stolen from User B's personal classification scope.

#### Remediation:
Add ownership condition to the `userContacts` update:

```typescript
const result = await db
  .update(userContacts)
  .set({ businessId: business[0].id, contactType: input.contactType })
  .where(and(
    eq(userContacts.id, input.contactId),
    eq(userContacts.userId, ctx.user.id),
    eq(userContacts.userType, ctx.user.type),
  ));

if (!result || (result as any).affectedRows === 0) {
  throw new TRPCError({ code: "NOT_FOUND", message: "جهة الاتصال غير موجودة" });
}
```

---

### [MEDIUM-01] Missing Ownership Validation on `walletId` and `businessId` in `expense.create` / `batchCreate`

- **Affected File**: `api/expense-router.ts`
- **Affected Lines**: Lines 427–428, 448–465, 505–506, 520–536
- **CWE**: CWE-284 (Improper Access Control)

#### Vulnerability Description:
While `resolveExpenseReferences` in `api/expense-router.ts` rigorously validates that `contactId` and `classificationLogId` belong to `ctx.user.id` and `ctx.user.type`, it does not validate `walletId` (against `userWallets`) or `businessId` (against `userBusinesses`). An authenticated user can submit transactions with arbitrary `walletId` or `businessId` values belonging to other users.

#### Remediation:
Extend `resolveBatchExpenseReferences` in `api/expense-router.ts` to validate requested `walletId` and `businessId` values against `userWallets` and `userBusinesses` for `userId` + `userType`.

---

## 4. Multi-Tenant Dual-User Isolation Review

### Schema & Query Cross-Check
Every single database table storing tenant data was reviewed against Drizzle queries in all routers:

| Table | Scoped By `userId` + `userType` in Schema? | All Queries Enforce `userType`? | Isolation Status |
| :--- | :--- | :--- | :--- |
| `expenses` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `user_wallets` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `financial_goals` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `user_budgets` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `user_businesses` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `business_categories` | Scoped via `business_id` | ⚠️ Broken in 2 mutations (CRITICAL-01) | ⚠️ Remediated via CRITICAL-01 fix |
| `user_contacts` | Yes (`user_id`, `user_type`) | ⚠️ Broken in `linkContact` (CRITICAL-02) | ⚠️ Remediated via CRITICAL-02 fix |
| `chat_conversations` | Yes (`user_id`, `user_type`) | Yes (`requireOwnedConversation`) | ✅ Secure |
| `chat_messages` | Scoped via `conversation_id` | Yes (scoped via verified conversation) | ✅ Secure |
| `ai_memory_items` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `ai_pending_actions` | Yes (`user_id`, `user_type`) | Yes (`loadPendingAction`) | ✅ Secure |
| `user_profiles` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `user_dictionaries` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `monthly_reports` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `ai_summaries` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `support_tickets` | Yes (`user_id`, `user_type`) | Yes (`getById`/`close` check owner or staff) | ✅ Secure |
| `webhook_tokens` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `raw_sms_events` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `in_app_notifications`| Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `push_subscriptions` | Yes (`user_id`, `user_type`) | Yes (`eq(userId), eq(userType)`) | ✅ Secure |
| `user_credentials` | Yes (`user_id`, `user_type`) | Yes (scoped on registration & auth) | ✅ Secure |
| `auth_challenges` | Yes (`user_id`, `user_type`) | Yes (session/reg keys scoped) | ✅ Secure |

---

## 5. Summary of Recommended Remediation Patches

### Patch 1: Fix BOLA / IDOR in `api/business-router.ts`

```diff
--- a/api/business-router.ts
+++ b/api/business-router.ts
@@ -366,11 +366,27 @@ export const businessRouter = router({
     .mutation(async ({ ctx, input }) => {
       const { id, ...updates } = input;
       const cleanUpdates = Object.fromEntries(
         Object.entries(updates).filter(([, v]) => v !== undefined),
       );
 
+      const business = await db
+        .select({ id: userBusinesses.id })
+        .from(userBusinesses)
+        .where(and(
+          eq(userBusinesses.userId, ctx.user.id),
+          eq(userBusinesses.userType, ctx.user.type),
+          eq(userBusinesses.isActive, true),
+        ))
+        .limit(1);
+
+      if (business.length === 0) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد مشروع نشط" });
+      }
+
       if (Object.keys(cleanUpdates).length > 0) {
-        await db
+        const result = await db
           .update(businessCategories)
           .set(cleanUpdates)
-          .where(eq(businessCategories.id, id));
+          .where(and(
+            eq(businessCategories.id, id),
+            eq(businessCategories.businessId, business[0].id),
+          ));
+        if (!result || (result as any).affectedRows === 0) {
+          throw new TRPCError({ code: "NOT_FOUND", message: "الفئة غير موجودة" });
+        }
       }
 
       invalidateUserClassificationCache(ctx.user.id);
       return { success: true };
     }),
 
   removeCategory: proProcedure
     .input(z.object({ id: z.number() }))
     .mutation(async ({ ctx, input }) => {
+      const business = await db
+        .select({ id: userBusinesses.id })
+        .from(userBusinesses)
+        .where(and(
+          eq(userBusinesses.userId, ctx.user.id),
+          eq(userBusinesses.userType, ctx.user.type),
+          eq(userBusinesses.isActive, true),
+        ))
+        .limit(1);
+
+      if (business.length === 0) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد مشروع نشط" });
+      }
+
-      await db
+      const result = await db
         .update(businessCategories)
         .set({ isActive: false })
-        .where(eq(businessCategories.id, input.id));
+        .where(and(
+          eq(businessCategories.id, input.id),
+          eq(businessCategories.businessId, business[0].id),
+        ));
+      if (!result || (result as any).affectedRows === 0) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "الفئة غير موجودة" });
+      }
 
       invalidateUserClassificationCache(ctx.user.id);
       return { success: true };
     }),
 
   linkContact: proProcedure
     .input(z.object({
       contactId: z.number(),
       contactType: z.enum(["business_supplier", "business_customer", "business_employee"]),
     }))
     .mutation(async ({ ctx, input }) => {
       const business = await db
         .select({ id: userBusinesses.id })
         .from(userBusinesses)
         .where(and(
           eq(userBusinesses.userId, ctx.user.id),
           eq(userBusinesses.userType, ctx.user.type),
           eq(userBusinesses.isActive, true),
         ))
         .limit(1);
 
       if (business.length === 0) {
         throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد مشروع نشط" });
       }
 
-      await db
+      const result = await db
         .update(userContacts)
         .set({ businessId: business[0].id, contactType: input.contactType })
-        .where(eq(userContacts.id, input.contactId));
+        .where(and(
+          eq(userContacts.id, input.contactId),
+          eq(userContacts.userId, ctx.user.id),
+          eq(userContacts.userType, ctx.user.type),
+        ));
+      if (!result || (result as any).affectedRows === 0) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "جهة الاتصال غير موجودة" });
+      }
 
       invalidateUserClassificationCache(ctx.user.id);
       return { success: true };
     }),
```
