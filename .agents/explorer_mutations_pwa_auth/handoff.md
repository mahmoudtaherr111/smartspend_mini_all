# Handoff Report — Explorer 3 (Financial Mutations, PWA/Mobile UX & Auth Multi-Tab Synchronization)

## 1. Observation

Direct observations from codebase inspection across backend routers, frontend components, hooks, and contracts:

1. **Financial Mutations & Idempotency**:
   - `api/expense-router.ts` (lines 454-478, 507, 524-546) implements `clientRequestId` idempotency checks with database uniqueness checks (`isDuplicateEntryError`).
   - `api/wallet-router.ts` (`createWallet` lines 47-66, `updateWallet` lines 68-95) and `api/budget-router.ts` (`create` lines 107-134) lack `clientRequestId` validation.
   - In `api/wallet-router.ts` lines 53 and 74, `balance` is defined as `z.string().optional()` without numerical bounds, regex formatting, or decimal validation.
   - In `src/components/goals/FinancialGoalsPanel.tsx` (line 73), `const targetAmount = Number(cost) || 50000;` silently sets an unvalidated 50,000 EGP fallback, and form state is wiped prior to mutation success (lines 81-83).
   - In `src/components/bank-sync/DigitalBankingSuite.tsx` (lines 180-205), double-tap on "Add Card" is not guarded with a ref lock, risking duplicate wallet insertions.

2. **PWA & Mobile-First UX**:
   - `src/hooks/useVirtualKeyboard.ts` uses `@capacitor/keyboard` and `window.visualViewport` to manage `--keyboard-height` and `--visual-viewport-height`.
   - `src/components/layout/MobileBottomNav.tsx` (line 13) imports `useKeyboardNav.ts` (focusin/focusout listener) rather than `useVirtualKeyboard.ts`, causing desynchronization during keyboard dismiss gestures.
   - `src/components/pwa/PullToRefreshWrapper.tsx` (lines 157-161) checks `el.scrollTop > 0` on the root container, but does not check if an inner sub-container (table, chips, modal) is scrolled down.
   - `src/components/pwa/PwaOfflineSyncDialog.tsx` (lines 61-85) deletes offline pending items via array index (`texts.splice(index, 1)`), introducing race conditions during background sync.
   - `src/hooks/useHaptics.ts` (lines 11-14) correctly checks `Capacitor.isNativePlatform()` and `"vibrate" in navigator`, degrading to a no-op on iOS Safari/Web.

3. **Auth & Multi-Tab Synchronization**:
   - `api/context.ts` (lines 128-179) enforces Bearer token precedence over `google_session` cookie for dual-user consistency.
   - In `src/hooks/useAuth.ts` (lines 29-41, 130-154), there is **no** `BroadcastChannel` and **no** `storage` event listener for `local_auth_token`. Multi-tab login, logout, or account switching does not propagate across tabs until a page reload.
   - When a session expires (HTTP 401), `trpc.ts` converts the response to a generic error string without preserving form drafts or providing an inline re-authentication modal.

4. **Contracts & Type Safety**:
   - `contracts/constants.ts` defines `ExpenseInputLimits`, but lacks unified constants for wallets and budgets.

---

## 2. Logic Chain

1. **Premise**: In financial applications, mutations must be strictly idempotent to prevent duplicate debits, transactions, or wallet creations upon network retry or user double-tap.
   - **Step**: `api/expense-router.ts` achieves this via `clientRequestId` and unique constraints.
   - **Step**: `api/wallet-router.ts` and `api/budget-router.ts` omit `clientRequestId`, and frontend components lack ref-based submission locks.
   - **Inference**: High risk of duplicate wallets and budget categories during mobile network latency or rapid clicks.

2. **Premise**: Input schemas must reject invalid numbers, overflow, NaN, and negative balances before DB queries execute.
   - **Step**: `api/wallet-router.ts` accepts `balance: z.string().optional()`.
   - **Inference**: Passing non-numeric or malformed strings causes database-level crashes or invalid data persistence.

3. **Premise**: In modern PWAs, multi-tab state must stay synchronized to prevent authorization mismatch and stale financial queries.
   - **Step**: `useAuth.ts` maintains tab-isolated state with `refetchOnWindowFocus: false` and no cross-tab communication channels.
   - **Inference**: Logging out in Tab 1 leaves Tab 2 displaying stale user data; subsequent mutations from Tab 2 fail unexpectedly with 401 errors.

---

## 3. Caveats

- Investigation is strictly read-only per agent constraints; code changes have not been directly applied to source files.
- `npm run check` currently fails on pre-existing syntax errors in `api/goals-router.ts` (unclosed `recordAiUsageEvent`) and `api/sms-router.ts` being addressed by parallel implementers.
- WebAuthn passkey registration requires HTTPS or `localhost` with valid RP credentials.

---

## 4. Conclusion

The platform possesses well-architected core systems (ACID transactions in expenses, scoped IndexedDB query caching, and Workbox PWA configuration). The critical path forward requires:
1. Adding `clientRequestId` and strict Zod balance regex validation to `walletRouter` and `budgetRouter`.
2. Standardizing mobile bottom navigation on `useVirtualKeyboard` and fixing inner-container scroll detection in `PullToRefreshWrapper`.
3. Implementing `AuthProvider` with `BroadcastChannel("smartspend_auth")` and `storage` event listeners for instantaneous multi-tab sync, coupled with inline re-auth and form draft preservation.

---

## 5. Verification Method

To independently verify these findings:
1. **Idempotency & Double-Tap**:
   - Inspect `api/wallet-router.ts` (lines 47-66) and `api/budget-router.ts` (lines 107-134) to confirm absence of `clientRequestId`.
   - Inspect `src/components/bank-sync/DigitalBankingSuite.tsx` (lines 180-205) to verify absence of `useRef` submission locks.
2. **Virtual Keyboard & PTR**:
   - Inspect `src/components/layout/MobileBottomNav.tsx` (line 13) to confirm import of `useKeyboardNav` instead of `useVirtualKeyboard`.
   - Inspect `src/components/pwa/PullToRefreshWrapper.tsx` (lines 157-161) to confirm root `scrollTop` check without `composedPath` traversal.
3. **Multi-Tab Sync**:
   - Inspect `src/hooks/useAuth.ts` (lines 1-171) to confirm absence of `BroadcastChannel` or `window.addEventListener("storage", ...)`.
4. **Automated Test Run**:
   - Run `npm run test -- tests/query-persister.test.ts src/hooks/useHaptics.test.ts src/hooks/useVirtualKeyboard.test.ts`
