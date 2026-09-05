## 2026-08-28T14:20:54Z

Conduct an exhaustive, code-level security audit of the Access Control, RBAC, and all 22 tRPC sub-routers in `api/`.

Key Areas to Inspect:
1. Procedure Factories in `api/middleware.ts`:
   - `publicProcedure`, `strictPublicProcedure`, `authedProcedure`, `aiProcedure`, `moderatorProcedure`, `adminProcedure`, `proProcedure`, `proAiProcedure`, `ultraProcedure`
   - Logic of role checks (`ctx.user.role === 'admin' | 'moderator'`) vs plan checks (`ctx.user.plan === 'pro' | 'ultra'`)
   - Any role vs plan confusion, privilege escalation risks
2. Exhaustive Audit of ALL 22 tRPC Routers in `api/`:
   - `api/account-router.ts`
   - `api/admin-router.ts`
   - `api/ai-router.ts`
   - `api/analytics-router.ts`
   - `api/audit-router.ts`
   - `api/auth-router.ts`
   - `api/badge-router.ts`
   - `api/billing-router.ts`
   - `api/budget-router.ts`
   - `api/category-router.ts`
   - `api/chat-router.ts`
   - `api/debt-router.ts`
   - `api/expense-router.ts`
   - `api/family-router.ts`
   - `api/feedback-router.ts`
   - `api/goal-router.ts`
   - `api/income-router.ts`
   - `api/investment-router.ts`
   - `api/notification-router.ts`
   - `api/push-router.ts`
   - `api/recurring-router.ts`
   - `api/system-router.ts`
3. Broken Object-Level Authorization (BOLA / IDOR):
   - For every query/mutation accepting an `id` or resource identifier (e.g. expense ID, budget ID, goal ID, account ID, family ID, chat session ID):
   - Does it verify ownership (`where: and(eq(table.id, input.id), eq(table.userId, ctx.user.id))` or dual user type check)?
   - Can User A view, modify, or delete User B's financial transactions, budgets, debts, accounts, or chats?
4. Multi-Tenant / Dual-User Isolation:
   - Does Drizzle filtering account for both `userId` and `userType` (oauth vs local) if IDs can overlap?
