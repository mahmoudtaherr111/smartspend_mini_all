# SmartSpend AI — Deep Codebase Survey & Edge-Case Discovery
## Domain: Financial Mutations & Forms, PWA / Mobile-First UX, and Auth / Multi-Tab Synchronization

- **Author**: Explorer 3 (`explorer_mutations_pwa_auth`)
- **Date**: 2026-08-29
- **Working Directory**: `e:/smartspend_V1_fixed/.agents/explorer_mutations_pwa_auth`
- **Scope**: `api/expense-router.ts`, `api/wallet-router.ts`, `api/budget-router.ts`, `api/goals-router.ts`, `api/context.ts`, `api/auth-router.ts`, `api/local-auth-router.ts`, `contracts/`, `src/components/`, `src/hooks/`, `src/providers/`, `src/pwa/`, `src/sw.js`.

---

## Executive Summary

This investigation covers an exhaustive architectural audit and edge-case discovery across three critical pillars of the SmartSpend AI platform:
1. **Financial Mutations & Forms**: Idempotency, duplicate-tap prevention, numeric boundary and decimal validation, React Query optimistic updates and error rollbacks.
2. **PWA & Mobile-First UX**: Dynamic viewport management, virtual keyboard layout shift prevention, pull-to-refresh container scroll conflicts, tactile haptic feedback fallbacks, service worker caching, and offline-outbox synchronization.
3. **Auth & Multi-Tab Synchronization**: Dual-user consistency (`users` OAuth vs `localUsers` JWT/password/WebAuthn), cross-tab session synchronization (`BroadcastChannel` / `storage` events), graceful session expiry, and in-progress form draft preservation.
4. **TypeScript 5.9 & Zod Runtime Contracts**: Contract centralization, schema boundary enforcement, and compile-time type safety.

---

## 1. Financial Mutations & Forms Deep Dive

### 1.1 Current Architecture & Code Mapping

| Component / Router | File Path | Key Mutations & Procedures |
| :--- | :--- | :--- |
| **Expense Router** | `api/expense-router.ts` | `create`, `batchCreate`, `list`, `searchTransactions`, `getById`, `update`, `delete`, `getMonthSummary`, `getMonthlyStats` |
| **Wallet Router** | `api/wallet-router.ts` | `getWallets`, `getWalletTransactions`, `createWallet`, `updateWallet`, `deleteWallet` |
| **Budget Router** | `api/budget-router.ts` | `list`, `create`, `update`, `delete` |
| **Goals Router** | `api/goals-router.ts` | `list`, `create`, `analyze`, `setStatus`, `delete` |
| **Expense Input Form** | `src/components/expenses/ExpenseForm.tsx` | Voice recording, AI text parsing (`parseExpense`, `parseVoiceExpense`), `createMutation`, `batchCreateMutation`, `ManualForm` |
| **Recent Expenses List** | `src/components/expenses/RecentExpenses.tsx` | Virtualized transaction list, `deleteMutation` with optimistic update and rollback |
| **Digital Banking Suite** | `src/components/bank-sync/DigitalBankingSuite.tsx` | Wallet / card management, `createWalletMutation`, `deleteWalletMutation` |
| **Financial Goals Panel** | `src/components/goals/FinancialGoalsPanel.tsx` | Goal creation (`createMutation`), AI plan generation (`analyzeMutation`) |

---

### 1.2 Discovered Vulnerabilities, Edge Cases & Gaps

#### Edge Case 1.1: Missing Idempotency & Rapid Double-Tap in Wallets and Budgets
- **Location**: `api/wallet-router.ts` (lines 47-66), `api/budget-router.ts` (lines 107-134), `src/components/bank-sync/DigitalBankingSuite.tsx` (lines 180-205).
- **Observation**:
  - `api/expense-router.ts` properly implements `clientRequestId` deduplication (checking existing records by `clientRequestId` and catching DB `1062 ER_DUP_ENTRY` errors).
  - In contrast, `api/wallet-router.ts` and `api/budget-router.ts` have **zero** `clientRequestId` support.
  - In `src/components/bank-sync/DigitalBankingSuite.tsx`, `isSubmitting` is only updated via React state (`setIsSubmitting(true)`). A quick double-tap on a mobile touch screen before the React re-render cycle dispatches two distinct `createWallet` mutations, creating duplicate cards/wallets in MySQL with identical names and providers.
- **Remediation**:
  1. Add `clientRequestId: z.string().min(1).max(64).optional()` to `walletRouter.createWallet` and `budgetRouter.create`.
  2. Implement an in-flight `useRef<boolean>` guard or disable buttons immediately upon touch in `DigitalBankingSuite.tsx` and `FinancialGoalsPanel.tsx`.

#### Edge Case 1.2: Boundary Validation Deficiencies in `walletRouter` Balance
- **Location**: `api/wallet-router.ts` (lines 53, 74).
- **Observation**:
  - In `walletRouter.createWallet`: `balance: z.string().optional()`.
  - In `walletRouter.updateWallet`: `balance: z.string().optional()`.
  - Neither router validates string format, numeric bounds, negative values, decimals, or `NaN`.
  - If a client or attacker passes `balance: "-9999999999999999999"`, `"NaN"`, `"undefined"`, or arbitrary string payloads, MySQL throws an unhandled database exception or stores invalid balance data.
- **Remediation**:
  - Replace `z.string().optional()` with a strict Zod regex / numeric validator:
    ```ts
    const balanceSchema = z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "المبلغ يجب أن يكون رقماً عشرياً موجباً حتى خانتين")
      .max(15)
      .default("0.00");
    ```

#### Edge Case 1.3: Silent Fallback in Goal Creation
- **Location**: `src/components/goals/FinancialGoalsPanel.tsx` (line 73).
- **Observation**:
  - `const targetAmount = Number(cost) || 50000;`
  - If the user leaves the cost field empty or enters invalid characters, the form silently assigns a default goal target of 50,000 EGP without informing the user.
  - Furthermore, `setTitle("")`, `setCost("")`, `setDescription("")` are called immediately when `handleCreate()` executes (lines 81-83) *before* the mutation succeeds. If network fails or the server throws an error, the user's input is irrevocably wiped.
- **Remediation**:
  - Require explicit positive numeric validation for `cost`. Show validation error toast if empty or `<= 0`.
  - Clear state only inside `createMutation.onSuccess`.

#### Edge Case 1.4: Cross-Router Query Cache Invalidation Gaps
- **Location**: `src/components/expenses/ExpenseForm.tsx` (lines 583-587), `src/components/expenses/RecentExpenses.tsx` (lines 345-347).
- **Observation**:
  - When a transaction is added or deleted with a linked `walletId` or category matching a budget, `ExpenseForm` invalidates `utilsTrpc.expense.list`, `getMonthlyStats`, `getMonthSummary`.
  - However, `trpc.wallet.getWallets`, `trpc.wallet.getWalletTransactions`, and `trpc.budget.list` are **not** invalidated on expense mutation. As a result, switching to the Wallets tab or Budgets view displays stale balance and spending percentage data until a hard reload.
- **Remediation**:
  - In `ExpenseForm.tsx` and `RecentExpenses.tsx` `onSettled`:
    ```ts
    utilsTrpc.wallet.getWallets.invalidate();
    utilsTrpc.budget.list.invalidate();
    ```

#### Edge Case 1.5: Missing UI Exposure for `expense.update`
- **Location**: `src/components/expenses/RecentExpenses.tsx`.
- **Observation**:
  - Backend `api/expense-router.ts` exposes a complete `update` procedure with dynamic contact auto-learning and muscle memory invalidation.
  - However, `RecentExpenses.tsx` only offers `deleteMutation` (with swipe-to-delete and dialog). There is no inline or modal edit flow calling `trpc.expense.update`, forcing users to delete and re-enter entire transactions to fix minor typos.

---

## 2. PWA & Mobile-First UX Deep Dive

### 2.1 Current Architecture & Code Mapping

| Feature | Implementation File | Key Mechanisms |
| :--- | :--- | :--- |
| **Virtual Keyboard Hook** | `src/hooks/useVirtualKeyboard.ts` | `@capacitor/keyboard` listener on native, `window.visualViewport` resize listener on web, sets `--keyboard-height` and `--visual-viewport-height` |
| **Keyboard Nav Hook** | `src/hooks/useKeyboardNav.ts` | `focusin` / `focusout` event listener on document |
| **Bottom Navigation Bar** | `src/components/layout/MobileBottomNav.tsx` | Floating glass capsule navigation island, drag/swipe tab selection, safe-area-inset padding |
| **Pull to Refresh** | `src/components/pwa/PullToRefreshWrapper.tsx` | Mathematical iOS rubber-banding (`rubberband(dy, dimension, 0.55)`), rAF DOM updates, haptic trigger at threshold |
| **Haptic Feedback** | `src/hooks/useHaptics.ts` | `@capacitor/haptics` on native, `navigator.vibrate` on web fallback |
| **Service Worker** | `src/sw.js` | Workbox `InjectManifest`, `NetworkFirst` navigation fallback, `StaleWhileRevalidate` for images and static assets |
| **Offline Cache Persistence** | `src/lib/queryPersister.ts` | IndexedDB `smartspend_query_cache`, user-namespaced storage key `v2:${user.type}:${user.id}` |
| **Offline Outbox & Sync** | `src/components/pwa/PwaOfflineSyncDialog.tsx`, `src/components/expenses/ExpenseForm.tsx` | LocalStorage queues (`smartspend_offline_texts`, `smartspend_offline_manual`), sequential drain with 5s cooldown |

---

### 2.2 Discovered Vulnerabilities, Edge Cases & Gaps

#### Edge Case 2.1: Virtual Keyboard Hook Fragmentation & Desynchronization
- **Location**: `src/hooks/useVirtualKeyboard.ts` vs `src/hooks/useKeyboardNav.ts`, used in `src/components/layout/MobileBottomNav.tsx` (line 13).
- **Observation**:
  - Two divergent hooks exist to track keyboard state:
    1. `useVirtualKeyboard.ts` (robust: utilizes Capacitor Native Keyboard API + `visualViewport` height deltas, sets CSS root properties `--keyboard-height` and `.keyboard-active`).
    2. `useKeyboardNav.ts` (fragile: detects simple `focusin` / `focusout` on `INPUT`/`TEXTAREA` with a 50ms timeout).
  - `MobileBottomNav.tsx` imports `useKeyboardNav` instead of `useVirtualKeyboard`.
  - When a user taps between multiple input fields or dismisses the software keyboard via an Android system back gesture while keeping an input element focused, `useKeyboardNav` reports `isKeyboardOpen: true`, keeping the navigation bar hidden even though the keyboard is gone.
- **Remediation**:
  - Deprecate `useKeyboardNav.ts` and standardize all components on `useVirtualKeyboard.ts`.

#### Edge Case 2.2: Pull-To-Refresh Conflict in Nested Scrollable Sub-Containers
- **Location**: `src/components/pwa/PullToRefreshWrapper.tsx` (lines 157-161).
- **Observation**:
  - `onTouchStart` only checks `el.scrollTop > 0` on the root wrapper container `scrollRef.current`.
  - When the page contains an inner scrollable sub-container (e.g. horizontally scrollable category chips, a virtualized table, or an open modal with internal scroll), touch events bubble up to `el`.
  - If the inner element has internal scroll offset or horizontal gesture intent, but the outer wrapper has `scrollTop === 0`, `PullToRefreshWrapper` locks direction to pull-down and intercepts the touch gesture, calling `e.preventDefault()`, breaking inner scroll interactions.
- **Remediation**:
  - Inspect `event.composedPath()` or event target ancestors during `onTouchStart` and `onTouchMove`. If any scrollable ancestor between the event target and `el` has `scrollTop > 0`, cancel PTR tracking immediately:
    ```ts
    const hasScrollableAncestor = (target: HTMLElement, root: HTMLElement): boolean => {
      let curr: HTMLElement | null = target;
      while (curr && curr !== root) {
        if (curr.scrollTop > 0) return true;
        curr = curr.parentElement;
      }
      return false;
    };
    ```

#### Edge Case 2.3: Offline Queue Index Deletion Race Condition
- **Location**: `src/components/pwa/PwaOfflineSyncDialog.tsx` (lines 61-85).
- **Observation**:
  - When a user deletes a pending offline transaction from the sync dialog, the handler runs:
    `texts.splice(index, 1);` and `manual.splice(index, 1);`
  - In a multi-tab environment or when `ExpenseForm` auto-syncs in the background, array indices shift asynchronously. Deleting by array index can remove the wrong transaction, resulting in unintended permanent data loss.
- **Remediation**:
  - Store and delete items strictly by unique `id` (`item.id !== targetId`).

#### Edge Case 2.4: Tactile Haptic Graceful Degradation
- **Location**: `src/hooks/useHaptics.ts` (lines 11-14).
- **Observation**:
  - Correctly verifies `"vibrate" in navigator` and `Capacitor.isNativePlatform()`.
  - On iOS Web / Safari PWA, Apple intentionally omits `navigator.vibrate`. The hook safely evaluates `isSupportedWeb: false` and degrades to a no-op without throwing unhandled exceptions.

---

## 3. Auth & Multi-Tab Synchronization Deep Dive

### 3.1 Current Architecture & Code Mapping

| Layer / Component | File Path | Key Responsibilities |
| :--- | :--- | :--- |
| **Context Resolution** | `api/context.ts` | `createContext()`: Validates `Authorization: Bearer <jwt>` against `sessions` table (precedence), fallbacks to `google_session` cookie; resolves `UnifiedUser` (`oauth` vs `local`), syncs subscription expiry |
| **OAuth Router** | `api/auth-router.ts` | `googleUrl`, `googleCallback` (session generation), `me`, `logout` |
| **Local Auth Router** | `api/local-auth-router.ts` | `register`, `login`, `generateVerificationCode` (WhatsApp OTP), `me`, `logout` |
| **Frontend Auth Hook** | `src/hooks/useAuth.ts` | Dispatches `trpc.auth.me` and `trpc.localAuth.me`, hydrates `saveOfflineIdentity`, handles `logout()` |
| **Login View** | `src/pages/Login.tsx` | Password login, phone registration, WebAuthn passkey login (`verifyAuthentication`) |
| **OAuth Callback View** | `src/pages/AuthCallback.tsx` | Handles Google OAuth redirect and route transitions |

---

### 3.2 Discovered Vulnerabilities, Edge Cases & Gaps

#### Edge Case 3.1: Complete Lack of Multi-Tab Auth Synchronization
- **Location**: `src/hooks/useAuth.ts` (lines 29-41, 130-154), `src/providers/trpc.ts` (lines 26-34).
- **Observation**:
  - There is **no** `BroadcastChannel` instance (e.g. `new BroadcastChannel("smartspend_auth")`) and **no** `window.addEventListener("storage", ...)` listening for changes to `local_auth_token`.
  - **Scenario A (Cross-Tab Logout)**:
    1. User opens Tab 1 (Dashboard) and Tab 2 (Dashboard).
    2. User clicks "Logout" in Tab 1. Tab 1 removes `local_auth_token` and redirects to `/login`.
    3. Tab 2 receives no event or signal. Tab 2 remains on Dashboard displaying stale financial figures.
    4. User in Tab 2 attempts to record an expense. `getTrpcHeaders()` finds no token; request fails with 401.
  - **Scenario B (Cross-Tab Account Switching / Login)**:
    1. User is on `/login` in Tab 1 and Tab 2.
    2. User logs in on Tab 1.
    3. Tab 2 does not know about the new session and remains stuck on `/login`.
- **Remediation**:
  - Implement a centralized `AuthProvider.tsx` context utilizing `BroadcastChannel("smartspend_auth")` and `window.addEventListener("storage")` to broadcast:
    - `type: "LOGIN"` -> Triggers `utils.invalidate()` and re-fetches user session across all open tabs.
    - `type: "LOGOUT"` -> Wipes React Query cache, resets state, and redirects to `/login` across all open tabs.
    - `type: "SESSION_EXPIRED"` -> Triggers in-place re-auth modal without page reload.

#### Edge Case 3.2: Destructive Session Expiry During Form Input
- **Location**: `src/components/expenses/ExpenseForm.tsx`, `src/providers/trpc.ts` (lines 7-15).
- **Observation**:
  - When a JWT session or Google OAuth cookie expires, any mutation submission (e.g., submitting an expense, creating a budget, updating profile) returns HTTP 401.
  - Currently, `trpcClient` converts 401 into a toast error: `"انتهت الجلسة. سجل الدخول مرة أخرى."`.
  - The user has no way to re-authenticate in-place. If they click to navigate to `/login`, all unsubmitted text, categorized items, voice recordings, and form states are lost forever.
- **Remediation**:
  1. Auto-save in-progress form drafts to `sessionStorage` (`smartspend_form_draft_expense`).
  2. Implement an in-app `SessionExpiryModal` that opens automatically on 401 errors, allowing the user to enter their password or use WebAuthn passkey to refresh the token, and then immediately retry the pending mutation without reloading the page.

#### Edge Case 3.3: Dual-User Consistency & Precedence in Context
- **Location**: `api/context.ts` (lines 128-179).
- **Observation**:
  - Context correctly checks `Authorization: Bearer <token>` before checking the `google_session` cookie.
  - This guarantees that if a user has a stale Google OAuth cookie in their browser, but signs into a local account via password/passkey, the local account session takes precedence.
  - However, in `api/local-auth-router.ts` `logout` (lines 283-298), clearing `google_session` is attempted via `ctx.resHeaders.append("Set-Cookie", "google_session=; ...")`. If `resHeaders` is undefined (such as during certain tRPC adapter contexts), the cookie is not cleared on the server side.

---

## 4. TypeScript 5.9 & Zod Runtime Validations Across Contracts

### 4.1 Invariants & Observations
1. **Contract Centralization**:
   - `contracts/constants.ts` defines `ExpenseInputLimits` (`rawTextMax: 5000`, `categoryMax: 100`, `subCategoryMax: 100`, `descriptionMax: 2000`, `amountMax: 999_999_999`).
   - However, `WalletInputLimits` and `BudgetInputLimits` are missing from `contracts/constants.ts` and inlined as raw magic numbers across routers.
2. **Schema Inconsistencies**:
   - `contracts/plans.ts` accurately models commercial plan contracts (`BILLING_PLANS`, `hasExactPlanAmount`), matching Paymob cents precision.
3. **Current Monorepo Typecheck Status**:
   - Running `npm run check` revealed syntax errors in `api/goals-router.ts` (lines 68-70 unclosed function call) and `api/sms-router.ts` (line 321), which are under active remediation by parallel implementers.

---

## 5. Architectural Recommendations & Remediation Plan

### 5.1 Architecture Roadmap Matrix

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       REMEDIATION ARCHITECTURE                             │
├───────────────────────────────┬────────────────────────────────────────────┤
│ Area                          │ Concrete Implementation Plan               │
├───────────────────────────────┼────────────────────────────────────────────┤
│ 1. Mutation Idempotency &     │ • Add clientRequestId to wallet & budget   │
│    Double-Tap Prevention      │   routers.                                 │
│                               │ • Add strict Zod balance validator regex   │
│                               │   (/^\d+(\.\d{1,2})?$/).                   │
│                               │ • Enforce useRef submission locks in       │
│                               │   DigitalBankingSuite & GoalsPanel.        │
├───────────────────────────────┼────────────────────────────────────────────┤
│ 2. PWA Mobile Viewport & PTR  │ • Standardize all UI on useVirtualKeyboard.│
│                               │ • Add ancestor scroll checking in          │
│                               │   PullToRefreshWrapper (composedPath).     │
│                               │ • Delete offline items by ID, not index.   │
├───────────────────────────────┼────────────────────────────────────────────┤
│ 3. Multi-Tab Auth & Session   │ • Create AuthProvider with BroadcastChannel│
│    Lifecycle                  │   ("smartspend_auth") & storage listener.  │
│                               │ • Add SessionExpiryModal with inline       │
│                               │   re-auth and sessionStorage draft saving. │
└───────────────────────────────┴────────────────────────────────────────────┘
```

---

## 6. Conclusion

The SmartSpend AI platform demonstrates strong foundational design (ACID transactions in expense creation, user-partitioned IndexedDB query caching, and Workbox PWA service worker). Implementing the targeted remediations outlined above will eliminate silent data corruption risks, prevent cross-tab session desynchronization, and provide a seamless, resilient mobile-first user experience.
