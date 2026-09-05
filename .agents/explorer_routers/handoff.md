# Handoff Report: Authorization, RBAC & API Router Security Audit

**Working Directory**: `e:/smartspend_V1_fixed/.agents/explorer_routers`  
**Date**: 2026-08-28T14:41:00Z  
**Type**: Hard Handoff (Task Complete)

---

## 1. Observation

### Observation 1: Critical BOLA / IDOR in `api/business-router.ts` (`updateCategory`, `removeCategory`, `linkContact`)
- **File**: `api/business-router.ts`
- **Lines 354–380 (`updateCategory`)**:
  ```typescript
  updateCategory: proProcedure
    .input(z.object({
      id: z.number(),
      ...
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      ...
      if (Object.keys(cleanUpdates).length > 0) {
        await db
          .update(businessCategories)
          .set(cleanUpdates)
          .where(eq(businessCategories.id, id));
      }
  ```
  `businessCategories` is updated directly by `id` without verifying that `businessCategories.businessId` belongs to the requesting user (`userBusinesses.userId === ctx.user.id && userBusinesses.userType === ctx.user.type`).
- **Lines 382–392 (`removeCategory`)**:
  ```typescript
  removeCategory: proProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(businessCategories)
        .set({ isActive: false })
        .where(eq(businessCategories.id, input.id));
  ```
  `businessCategories` is deactivated directly by `id` without checking business ownership.
- **Lines 394–421 (`linkContact`)**:
  ```typescript
  linkContact: proProcedure
    .input(z.object({
      contactId: z.number(),
      contactType: z.enum(["business_supplier", "business_customer", "business_employee"]),
    }))
    .mutation(async ({ ctx, input }) => {
      ...
      await db
        .update(userContacts)
        .set({ businessId: business[0].id, contactType: input.contactType })
        .where(eq(userContacts.id, input.contactId));
  ```
  `userContacts` is updated by `input.contactId` without checking `and(eq(userContacts.userId, ctx.user.id), eq(userContacts.userType, ctx.user.type))`.

### Observation 2: Unvalidated Foreign Keys in `api/expense-router.ts` (`walletId`, `businessId`)
- **File**: `api/expense-router.ts`
- **Lines 427–465 & 505–536**:
  `create` and `batchCreate` accept `walletId` and `businessId` as optional integers and insert them directly into `expenses.walletId` and `expenses.businessId`. While `contactId` and `classificationLogId` are verified via `resolveExpenseReferences`, `walletId` and `businessId` are not verified against `userWallets` and `userBusinesses` for `ctx.user.id` + `ctx.user.type`.

### Observation 3: Procedure Factories and Separation of Duties (`api/middleware.ts`)
- **File**: `api/middleware.ts`
- **Lines 14–135**:
  - `publicProcedure`: 400 req/min per IP.
  - `strictPublicProcedure`: 25 req/15min per IP.
  - `authedProcedure`: Verifies `ctx.user` presence and applies 100 req/min per user rate limit (`key: ${ctx.user.type}:${ctx.user.id}`).
  - `aiProcedure`: AI rate limit (100 req/min).
  - `moderatorProcedure`: `ctx.user.role === "admin" || ctx.user.role === "moderator"`.
  - `adminProcedure`: `ctx.user.role === "admin"`.
  - `proProcedure` / `proAiProcedure`: `ctx.user.plan === "pro" || ctx.user.plan === "ultra" || ctx.user.role === "admin"`.
  - `ultraProcedure`: `ctx.user.plan === "ultra" || ctx.user.role === "admin"`.
  - Administrative roles (`role`) and subscription tiers (`plan`) are strictly separated.

### Observation 4: Dual-User Tenant Isolation across 22 Routers
- **Files**: All 22 sub-routers mounted in `api/router.ts`.
- `users` (OAuth) and `localUsers` (Local) maintain independent integer auto-increment IDs (`1, 2, ...`).
- In 21 of 22 routers (`wallet-router`, `budget-router`, `goals-router`, `chat-router`, `ai-router`, `profile-router`, `support-router`, `export-router`, `session-router`, `pro-router`, etc.), queries consistently enforce compound filters (`and(eq(table.userId, ctx.user.id), eq(table.userType, ctx.user.type))`).

---

## 2. Logic Chain

1. **Premise**: In a multi-tenant application with a dual-user authentication model (`users` vs `localUsers`), numeric user IDs can overlap across user types (e.g. OAuth user #1 and Local user #1).
2. **Observation Reference (Observation 4)**: All core financial tables (`expenses`, `user_wallets`, `user_budgets`, `financial_goals`, `user_contacts`, `chat_conversations`, etc.) include both `user_id` and `user_type` columns.
3. **Inference**: Any database query or mutation that filters only on `user_id` or an entity `id` without verifying the user's active session (`userId` AND `userType`) creates a cross-tenant data leakage or tampering vulnerability (IDOR/BOLA).
4. **Observation Reference (Observation 1)**: In `api/business-router.ts`, `updateCategory` and `removeCategory` execute updates against `businessCategories` filtered solely on `id`. Additionally, `linkContact` reassigns `userContacts.businessId` filtered solely on `contactId`.
5. **Deduction**: An authenticated user with Pro tier can modify or deactivate business categories belonging to another user, or hijack another user's contact into their own business.
6. **Observation Reference (Observation 2)**: In `api/expense-router.ts`, `create` and `batchCreate` insert user-supplied `walletId` and `businessId` into transactions without validating that the target wallet or business is owned by `ctx.user`.
7. **Deduction**: While transactions remain isolated under `expenses.userId` and `expenses.userType`, referencing foreign `walletId` or `businessId` integers can lead to data integrity anomalies or improper association during cross-table aggregations.

---

## 3. Caveats

- **No Caveats**: All 22 routers in `api/` and supporting middleware/services were thoroughly inspected.
- **Assumptions**: The system settings cache (`getSystemSettings()`) and Redis rate limiters function under standard Node.js server lifecycle as documented.

---

## 4. Conclusion

The SmartSpend backend demonstrates robust architecture in its RBAC vs. Subscription plan separation, rate limiting, and dual-user composite predicate enforcement across 21 of 22 routers. 

However, two critical BOLA/IDOR vulnerabilities exist in `api/business-router.ts` (`updateCategory`, `removeCategory`, and `linkContact`), and a data integrity / foreign-key ownership omission exists in `api/expense-router.ts`. 

Both issues have clear, localized remediations detailed in `e:/smartspend_V1_fixed/.agents/explorer_routers/analysis.md`.

---

## 5. Verification Method

To independently verify the observations and findings:

1. **Verify IDOR in `api/business-router.ts`**:
   - Inspect `api/business-router.ts` lines 354–421 using `view_file`.
   - Observe lines 376, 389, and 418 where `where(eq(businessCategories.id, id))` and `where(eq(userContacts.id, input.contactId))` lack user/business ownership predicates.
2. **Verify Missing FK Validation in `api/expense-router.ts`**:
   - Inspect `api/expense-router.ts` lines 448–465 and 520–536.
   - Observe `walletId: input.walletId || null` and `businessId: input.businessId || null` being inserted without checking `userWallets` or `userBusinesses`.
3. **Execute Project Test & Typecheck Commands**:
   - Run type-check: `npm run check`
   - Run unit tests: `npm run test`
