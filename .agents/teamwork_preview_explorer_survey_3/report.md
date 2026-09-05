# Technical Investigation Report: Financial Mutations, PWA UX, Auth Sync & Test Infra

**Date**: 2026-08-30  
**Investigator**: Explorer 3 (Financial Mutations, PWA UX, Auth Sync & Test Infra Specialist)  
**Target Repository**: SmartSpend AI Monorepo (`api/`, `contracts/`, `db/`, `src/`, `tests/`, `docs/`)

---

## Executive Summary

This comprehensive audit investigates four mission-critical subsystems in SmartSpend AI:
1. **Financial Mutation Idempotency & Lifecycle**: Transactional safety, `clientRequestId` mechanics, optimistic rollback, and double-tap prevention across expense, wallet, budget, goal, and subscription mutations.
2. **PWA & Mobile-First UX Invariants**: Virtual keyboard viewport handling (`visualViewport`), pull-to-refresh overscroll isolation in nested bottom sheets, haptic feedback triggers, and service worker Workbox caching.
3. **Multi-Tab Auth Synchronization & Dual Identity**: `BroadcastChannel` / `storage` event token sync, 401 session expiration handling with form draft preservation, and dual `users` (OAuth) vs `localUsers` (Local/OTP) cache isolation.
4. **Monorepo Build & Test Infrastructure**: Complete health assessment of `npm run check` (`tsc -b`) and Vitest test suites.
5. **Authoritative Blueprint for `docs/LOGICAL_EDGE_CASES_AUDIT.md`**: Structured catalog of logical edge cases, failure modes, and remediation blueprints.

---

## 1. Financial Mutation Idempotency & Offline Reconciliation

### 1.1 In-Depth Architecture Analysis

#### A. Expense Mutations & Idempotency Key Pipeline
- **Backend Schema (`db/schema.ts` lines 102, 120-124)**:
  - The `expenses` table defines `clientRequestId: varchar("client_request_id", { length: 64 })`.
  - Enforces a unique composite database constraint:
    ```ts
    uniqueIndex("expenses_user_client_request_unique").on(
      t.userId,
      t.userType,
      t.clientRequestId,
    )
    ```
- **Backend Router Implementation (`api/expense-router.ts` lines 423-620)**:
  - `expenseRouter.create` and `expenseRouter.batchCreate` accept `clientRequestId: z.string().min(1).max(64).optional()`.
  - **Two-Tier Idempotency Defense**:
    1. *Pre-Execution Check*: Queries `expenses` by `(userId, userType, clientRequestId)` before initiating database transactions. If found, immediately returns `{ success: true, id: existing[0].id, duplicate: true, expense: existing[0] }`.
    2. *Race-Condition Fallback*: When concurrent requests pass the pre-check simultaneously, the ACID transaction throws a duplicate entry error (`ER_DUP_ENTRY` / SQLState `23000`). The `catch` block invokes `isDuplicateEntryError(err)` (lines 37-52, 524-547) to intercept the error and return the already committed record gracefully without failing the client request.
  - **ACID Transaction Boundary**:
    - Lines 492-522: Inside `db.transaction`, the system inserts the expense, increments `userContacts.transactionCount`, and updates user gamification streak (`updateStreak`).
    - Lines 550-558: Side effects (`invalidateUserMemory`, `invalidateExpenseCache`, `checkUserBudgetExceeded`) execute outside the transaction to prevent holding database locks during cache invalidations or async notification checks.

#### B. Other Financial Routers: Idempotency Gap Analysis
While `expenseRouter` and `proRouter` implement full idempotency, several financial mutation endpoints lack `clientRequestId` support:
1. **Wallet Router (`api/wallet-router.ts` lines 47-66)**:
   - `walletRouter.createWallet` does NOT accept `clientRequestId`. Rapid network retries or double clicks can create duplicate wallets.
2. **Budget Router (`api/budget-router.ts` lines 107-133)**:
   - `budgetRouter.create` does NOT accept `clientRequestId`. Double submissions create duplicate budget limits for the same category.
3. **Goals Router (`api/goals-router.ts` lines 112-150)**:
   - `goalsRouter.create` does NOT accept `clientRequestId`.
4. **Subscription Service (`api/lib/subscription-service.ts` lines 14-124)**:
   - `grantProSubscription` implements strict idempotency via `transactionId` with unique checking and transactional extension logic.

### 1.2 Frontend Double-Tap Prevention & Optimistic Rollbacks
- **Form Submission Lock (`src/components/expenses/ExpenseForm.tsx` lines 2027-2044)**:
  - Uses `submissionRef.current` with fingerprinting:
    ```ts
    const fingerprint = [parsedAmount, type, category, subCategory, description, businessId ?? ""].join("|");
    const clientRequestId = submissionRef.current?.fingerprint === fingerprint
      ? submissionRef.current.id
      : createOfflineItemId();
    submissionRef.current = { fingerprint, id: clientRequestId };
    ```
  - Double taps reuse the same `clientRequestId`, ensuring backend deduplication.
- **Optimistic Update Rollback (`src/components/expenses/ExpenseForm.tsx` lines 536-588)**:
  - `onMutate`: Cancels ongoing queries via `utilsTrpc.expense.list.cancel()`, captures `previousExpenses` snapshot, and injects a temporary optimistic item.
  - `onError`: Reverts cache to `previousExpenses` via `utilsTrpc.expense.list.setData({ limit: 10, offset: 0 }, context.previousExpenses)`.
  - `onSettled`: Re-invalidates list and summary queries.

### 1.3 Offline Queue Reconciliation & Head-of-Line Blocking Vulnerability
- **Current Mechanism (`src/components/expenses/ExpenseForm.tsx` lines 1140-1195)**:
  - Offline items are queued in `localStorage` keys `smartspend_offline_texts` and `smartspend_offline_manual`.
  - When connection is restored (`online` event or `smartspend-offline-sync`), `syncOfflineData` loops through the queue and calls `createMutation.mutateAsync(item)`.
- **Root Cause Vulnerability (Head-of-Line Blocking)**:
  - Lines 1155-1160 & 1179-1184: If an offline item fails due to a permanent unrecoverable validation error (e.g. invalid date format or corrupt schema), `syncOfflineData` catches the error, toasts an error, and executes `return; // Halt queue processing`.
  - Because `offlineManual.shift()` is only called *after* successful mutation, the corrupt item remains permanently at index 0, blocking all subsequent valid offline transactions from ever syncing!
- **Remediation Blueprint**:
  - Implement a retry counter (`retryCount: number`) per item and a Dead-Letter Queue (`smartspend_offline_deadletter`).
  - Items failing with 4xx client validation errors must be removed from the active queue and moved to the dead-letter queue with an explanatory error flag.

---

## 2. PWA & Mobile-First UX Invariants

### 2.1 Virtual Keyboard `visualViewport` Handling
- **Implementation (`src/hooks/useVirtualKeyboard.ts` lines 5-64)**:
  - Web: Listens to `window.visualViewport.addEventListener("resize", ...)` (lines 36-60). Computes `heightDiff = window.innerHeight - viewport.height`.
  - Native Capacitor: Hooks `Keyboard.addListener("keyboardWillShow"/"keyboardWillHide")` (lines 17-34).
  - Sets CSS variables `--keyboard-height` and `--visual-viewport-height` on `document.documentElement` and toggles `.keyboard-active`.
- **Bottom Navigation Avoidance (`src/components/layout/MobileBottomNav.tsx` lines 128-137)**:
  - Uses `AnimatePresence` and hides `<motion.nav>` when `isKeyboardOpen` is true to prevent layout occlusion.
- **Identified Edge Case (Threshold Mismatch & Duplicate Listeners)**:
  - `src/hooks/usePwaLifecycle.ts` (lines 40-112) ALSO attaches `visualViewport` resize/scroll listeners and toggles `.keyboard-active` with a **60px** threshold, while `useVirtualKeyboard.ts` uses an **80px** threshold.
  - When both run concurrently, slight viewport jitter near 60-80px causes rapid class addition/removal oscillations.
  - **Remediation**: Consolidate keyboard state management entirely inside `useVirtualKeyboard.ts` and remove duplicate viewport listeners from `usePwaLifecycle.ts`.

### 2.2 Pull-to-Refresh Overscroll Isolation
- **Implementation (`src/components/pwa/PullToRefreshWrapper.tsx` lines 1-150)**:
  - Features mathematical iOS rubber-banding: `(distance * dimension * constant) / (dimension + constant * distance)`.
  - Detects scrolled sub-containers via `hasScrollableAncestor(target, root, event)` (lines 12-46) using `event.composedPath()`.
  - If touch originated inside a nested modal, bottom sheet, or scrollable table where `scrollTop > 0`, PTR tracking is cancelled (`state.current.isTracking = false`), preventing accidental full-page reloads.

### 2.3 Haptic Feedback Architecture
- **Implementation (`src/hooks/useHaptics.ts` lines 26-161)**:
  - Dual-engine: Native `@capacitor/haptics` (`Haptics.impact`, `Haptics.notification`, `Haptics.selectionChanged`) and Web `navigator.vibrate`.
  - Calibrated haptic triggers:
    - Light tap (`10ms` web / `ImpactStyle.Light` native): Tab switching, button presses.
    - Medium tap (`30ms` web / `ImpactStyle.Medium` native): PTR threshold crossed, modal open.
    - Heavy tap (`50ms` web / `ImpactStyle.Heavy` native): Critical actions, destructive buttons.
    - Success / Warning / Error notification vibration patterns.
  - Silently degrades to no-op on platforms without vibration support (e.g. iOS Safari Web).

### 2.4 Service Worker & Offline Caching
- **VitePWA Configuration (`vite.config.ts` lines 38-112)**:
  - InjectManifest strategy compiling `src/sw.js`.
- **Workbox Implementation (`src/sw.js` lines 1-150)**:
  - Precaches all compiled scripts, styles, and font chunks (`self.__WB_MANIFEST`).
  - Navigation requests use `NetworkFirst` (5s timeout) falling back to cached `/index.html` via `setCatchHandler`.
  - Static images use `StaleWhileRevalidate` with LRU expiration (max 64 entries, 30-day TTL).
  - **Security Invariant**: Strictly bypasses caching for all `/api` and `/trpc` endpoints (lines 28-32, 48-50) to prevent caching authenticated responses across users.

---

## 3. Auth Synchronization & Multi-Tab Lifecycle

### 3.1 Multi-Tab Token Synchronization
- **BroadcastChannel & Storage Events (`src/hooks/useAuth.ts` lines 114-217)**:
  - Listens on `BroadcastChannel("smartspend_auth")` for `AUTH_LOGIN`, `AUTH_LOGOUT`, `SESSION_EXPIRED`, `TOKEN_REFRESH`.
  - Storage event fallback: `window.addEventListener("storage", (e) => { if (e.key === "local_auth_token") ... })`.
  - When user logs in or out in Tab A, Tab B updates its internal user state, invalidates React Query caches (`utils.auth.me.invalidate()`, `utils.localAuth.me.invalidate()`), and refetches session metadata automatically.

### 3.2 401 Session Expiration & Form Draft Preservation
- **tRPC Interceptor (`src/providers/trpc.ts` lines 189-246, 300-323)**:
  - Detects HTTP 401 or JSON `{ code: "UNAUTHORIZED" }` in single and batched responses.
  - Invokes `preserveActiveFormDrafts()` (lines 147-172): collects active input values from registered form collectors and saves them to `sessionStorage` with a 24-hour expiration window.
  - Dispatches `smartspend_session_expired` custom event and broadcasts `SESSION_EXPIRED` to all tabs.
  - Displays a non-intrusive Sonner toast (throttled to 4000ms) informing the user that their draft was preserved.

### 3.3 Dual User Identity Consistency (`users` vs `localUsers`)
- **Backend Context (`api/context.ts`)**: Resolves `google_session` cookie first (`users`), then `Bearer` JWT (`localUsers` or `users` via `sessions.userType`).
- **Frontend Identity Isolation (`src/lib/queryPersister.ts` lines 49-55)**:
  - IndexedDB cache keys are scoped by `${user.type}:${user.id}`.
  - Sensitive queries (`auth.*`, `localauth.*`, `admin.*`) are explicitly excluded from persistence (`shouldPersistQueryKey`, lines 157-168).
  - Logging out purges all persisted caches for that specific account and clears offline identity.

---

## 4. Monorepo Build and Test Suite Health Assessment

### 4.1 Type-Check Health (`npm run check` / `tsc -b`)
- **Execution Result**: Passed with **0 errors** (exit code 0).
- Monorepo references (`tsconfig.app.json`, `tsconfig.server.json`, `tsconfig.node.json`) are completely type-safe.

### 4.2 Test Suite Status (`npm run test`)
- **Overall Statistics**: 96 test suites passed, 769 tests passed.
- **Key Regression Suites Verified**:
  - `tests/financial-mutations-idempotency.test.ts`: Passed.
  - `tests/multi-tab-auth-sync.test.ts`: Passed.
  - `tests/pwa-mobile-ux.test.ts`: Passed.
  - `api/business-router.security.test.ts`: Passed (9/9 tests).

---

## 5. Authoritative Blueprint for `docs/LOGICAL_EDGE_CASES_AUDIT.md`

Below is the comprehensive blueprint and structure for `docs/LOGICAL_EDGE_CASES_AUDIT.md`:

```markdown
# LOGICAL EDGE CASES AUDIT — SmartSpend AI

Authoritative catalog of logical edge cases, boundary conditions, concurrency hazards, and architectural invariants across full-stack SmartSpend AI.

## Table of Contents
1. Taxonomy & Severity Classification
2. Financial Mutations & Transactional Invariants
3. PWA, Mobile Viewport & Gesture State Machines
4. Auth Synchronization, Session Expiry & Dual Identity
5. Offline Outbox Reconciliation & Dead-Letter Handling
6. Concurrency, Race Conditions & TOCTOU Defenses
7. System Limits & Boundary Constraints

---

### 1. Taxonomy & Severity Classification
- **C1: Critical (Financial / Data Corruption Hazard)**: Double debits, duplicate transactions, cross-account cache bleed, lost offline records.
- **C2: High (Authentication / Access Desync)**: Token expiration mid-flow, cross-tab session drift, role vs plan privilege confusion.
- **C3: Medium (UX / Gestural Glitches)**: Virtual keyboard layout shift, pull-to-refresh collisions in drawers, haptic storming.
- **C4: Low (Telemetry / Hygiene)**: Duplicate analytics events, non-critical cache invalidation delays.

---

### 2. Financial Mutations & Transactional Invariants
- **Case 2.1: Double-Tap & Rapid Network Retries**
  - *Mechanism*: User taps "Save" multiple times in poor network conditions.
  - *Defense*: Frontend client-request-id fingerprinting + DB unique index `(userId, userType, clientRequestId)` + ACID pre-check & `ER_DUP_ENTRY` rescue.
- **Case 2.2: Fractional Millime Balance Exploits**
  - *Mechanism*: Submitting floating-point values with >2 decimal places (e.g. `10.1235` EGP).
  - *Defense*: Zod regex `BalanceSchema` enforcing max 2 decimals + Decimal.js arbitrary-precision math on backend.
- **Case 2.3: Cross-Tenant Wallet / Business FK Hijacking**
  - *Mechanism*: User A submits an expense referencing `walletId` or `businessId` owned by User B.
  - *Defense*: Explicit ownership validation in `expenseRouter.create` verifying `wallet.userId === ctx.user.id && wallet.userType === ctx.user.type`.

---

### 3. PWA, Mobile Viewport & Gesture State Machines
- **Case 3.1: Virtual Keyboard Layout Shift & Bottom Nav Occlusion**
  - *Mechanism*: Focusing input opens virtual keyboard, shifting fixed bottom navigation bar over input fields.
  - *Defense*: `useVirtualKeyboard` hooks `visualViewport` resize + sets `--keyboard-height` + hides bottom nav via `AnimatePresence`.
- **Case 3.2: Pull-to-Refresh Conflict in Nested Bottom Sheets**
  - *Mechanism*: Swiping down inside an open modal drawer accidentally triggers full-page pull-to-refresh.
  - *Defense*: `hasScrollableAncestor` walks `composedPath()` and cancels PTR if any child element has `scrollTop > 0`.

---

### 4. Auth Synchronization & Dual Identity
- **Case 4.1: Mid-Session Token Expiry During Multi-Step Form**
  - *Mechanism*: JWT expires while user is typing a detailed expense or split invoice.
  - *Defense*: tRPC 401 interceptor preserves current form values to `sessionStorage` (`smartspend_form_draft_*`), broadcasts `SESSION_EXPIRED` to other tabs, and prompts for re-authentication.
- **Case 4.2: Shared Device Account Switch Cache Bleed**
  - *Mechanism*: User A logs out and User B logs in on the same browser; IndexedDB might serve User A's cached finances.
  - *Defense*: IndexedDB keys partitioned by `${user.type}:${user.id}` + `clearPersistedQueryCache` on logout.

---

### 5. Offline Outbox Reconciliation & Dead-Letter Handling
- **Case 5.1: Head-of-Line Blocking from Corrupt Offline Item**
  - *Mechanism*: Corrupt item at index 0 of `smartspend_offline_manual` causes `createMutation` to fail with 400 Bad Request, stopping the sync loop.
  - *Defense*: Dead-letter queue transition: items failing with 4xx errors are moved to `smartspend_offline_failed` with error reason, allowing remaining valid items to sync.
```

---

## 6. Detailed Remediation Blueprints

| Ref ID | Subsystem | Issue / Edge Case | Concrete Remediation Blueprint |
| :--- | :--- | :--- | :--- |
| **R-MUT-01** | `api/wallet-router.ts` | Missing `clientRequestId` on `createWallet` | Add `clientRequestId: z.string().min(1).max(64).optional()` to input schema; add unique index in `db/schema.ts` on `(userId, userType, clientRequestId)` and pre-check in mutation handler. |
| **R-MUT-02** | `api/budget-router.ts` | Missing `clientRequestId` on `create` | Add `clientRequestId` to `userBudgets` table and `budgetRouter.create` input schema with idempotency check. |
| **R-MUT-03** | `src/components/expenses/ExpenseForm.tsx` | Offline sync head-of-line blocking on 4xx error | Wrap single-item sync in a try/catch: if error is unrecoverable 4xx, shift item from queue and push to `smartspend_offline_deadletter` instead of halting the entire sync loop. |
| **R-PWA-01** | `src/hooks/usePwaLifecycle.ts` | Conflicting viewport threshold (60px vs 80px) | Consolidate visual viewport resizing logic into `useVirtualKeyboard.ts` and delegate lifecycle hook to consume `useVirtualKeyboard`. |
| **R-DOC-01** | `docs/LOGICAL_EDGE_CASES_AUDIT.md` | Formal audit documentation | Author comprehensive document following the 7-section blueprint above. |

---

## Conclusion

The core financial mutation pipelines (`expenseRouter`, `proRouter`) and authentication synchronization layers (`useAuth`, `queryPersister`, `trpc.ts`) demonstrate robust architectural design with strong database-level constraints and multi-tab broadcast primitives. The identified areas for enhancement (wallet/budget idempotency completeness, offline dead-letter queue resilience, and viewport hook consolidation) have clear, non-breaking remediation blueprints.
