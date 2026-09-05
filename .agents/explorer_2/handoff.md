# Handoff Report: User-Aware Cache Isolation & Multi-Account Offline Safety

**Agent**: Explorer 2  
**Date**: 2026-08-26  
**Working Directory**: `e:/smartspend_V1_fixed/.agents/explorer_2`  
**Report Reference**: `e:/smartspend_V1_fixed/.agents/explorer_2/report.md`  

---

## 1. Observation

1. **Dual Auth Separation & Numeric ID Collision**:
   - In `api/context.ts` lines 8–17 and 51–124, `UnifiedUser` normalizes user identity from two separate MySQL tables: `users` (Google OAuth) and `localUsers` (phone, password, passkeys).
   - In `src/hooks/useAuth.ts` lines 21–34, `useAuth` runs parallel queries `trpc.auth.me.useQuery()` and `trpc.localAuth.me.useQuery()`.
   - Numeric `id` is an auto-increment integer in both tables (`db/schema.ts`), meaning User A (OAuth `id: 1`) and User B (Local `id: 1`) share the exact same numeric ID.
2. **Global Static Query Client & Single-Key IndexedDB Persister**:
   - In `src/lib/queryPersister.ts` lines 3–5:
     ```typescript
     const DB_NAME = "smartspend_query_cache";
     const STORE_NAME = "queries";
     const KEY = "cache";
     ```
   - In `src/App.tsx` lines 53–60 and 476–479:
     ```typescript
     const queryClient = new QueryClient({
       defaultOptions: {
         queries: {
           staleTime: 10_000,
           gcTime: 24 * 60 * 60_000,
         },
       },
     });
     ...
     // Older releases persisted every financial tRPC response under one device
     // key. Purge that legacy cache rather than hydrating another user's data.
     void clearPersistedQueryCache();
     ```
     Because the cache lacked user isolation, the legacy cache is cleared on every app mount, disabling offline data hydration for legitimate users to avoid multi-user data leakage.
3. **Un-Scoped LocalStorage Outbox & State Keys**:
   - In `src/components/expenses/ExpenseForm.tsx` lines 838, 860, 879, 1799, 1820 and `src/components/pwa/PwaEnhancements.tsx` lines 45, 87, 98:
     - `smartspend_offline_texts`
     - `smartspend_offline_manual`
     Both are stored globally in `localStorage` without a user identifier.
   - In `src/components/OnboardingCard.tsx` line 177: `onboarding_answers_${profile.data.basicInfo?.name || "user"}` scopes answers by user display name, which collides across users.
   - In `src/pages/Home.tsx` line 405: `smartspend_business_mode` is a global flag.
   - In `src/components/bank-sync/AndroidSetupFlow.tsx` line 54: uses `auth_token` instead of standard `local_auth_token`.
4. **Idempotency & Safe Mutation Patterns**:
   - In `src/components/expenses/ExpenseForm.tsx` lines 514–573, `createMutation` uses `clientRequestId` and optimistic updates on `utilsTrpc.expense.list` with rollback in `onError`.
   - In `src/sw.js` lines 38–41: Service Worker explicitly avoids replaying mutations automatically, delegating sync control to the authenticated user-visible outbox.

---

## 2. Logic Chain

1. **Step 1 (Identity Scoping)**: From Observation 1, because `users` (OAuth) and `localUsers` (Local) are distinct tables with independent auto-increment sequences, identifying an account solely by `id` leads to catastrophic collisions between OAuth and Local users with matching numeric IDs. Therefore, all cache scopes, storage keys, and outbox partitions must use the composite key `${user.type}:${user.id}` (e.g. `oauth:1` vs `local:1`).
2. **Step 2 (Cache Isolation)**: From Observation 2, storing all queries under a single IndexedDB key `"cache"` without user validation means any user opening the app offline or switching accounts restores the previous user's sensitive financial data. The existing startup purge (`void clearPersistedQueryCache()`) was a stopgap that destroyed offline PWA capabilities. Implementing a user-scoped persister (`smartspend_cache_${userType}_${userId}`) with strict envelope validation enables safe offline data persistence while guaranteeing zero cross-account leakage.
3. **Step 3 (Lifecycle Transitions)**: From Observations 2 and 3, when a user logs out, switches accounts, or experiences session expiration (401), the in-memory React Query cache (`queryClient.clear()`) must be purged immediately, and the persister must be disconnected or switched to prevent stale DOM hydration.
4. **Step 4 (Outbox Safety)**: From Observation 3, un-scoped offline transaction queues (`smartspend_offline_texts` and `smartspend_offline_manual`) pose a severe privacy risk: if User A records an expense offline and logs out, logging in as User B will cause the background sync manager to commit User A's expenses to User B's account. Scoping outbox queues by `${userKey}` and adding an active user verification check before syncing eliminates this vulnerability.

---

## 3. Caveats

- **Anonymous Browsing Mode**: Landing page (`/`), Login page (`/login`), Privacy policy (`/privacy`), and Terms (`/terms`) do not have an authenticated user. For these routes, query persistence must remain disabled (no-op) so unauthenticated browsing leaves no persisted cache.
- **Biometric Passkey Auto-Login**: `localStorage.getItem("smartspend_has_passkey")` indicates device-level biometric registration. This is device-specific and does not store user financial data.
- **Multi-Tab Synchronization**: If a user switches accounts in Tab 1 while Tab 2 is open, Tab 2's `window.addEventListener("storage")` should detect auth token removal and trigger `queryClient.clear()` / navigation to `/login`.

---

## 4. Conclusion

1. **Root Cause of Disabled Offline Persistence**: The existing persister stored all queries under a single un-scoped key `cache`, forcing developers to purge it on boot.
2. **Architectural Remedy**:
   - Implement `createUserScopedPersister(getUserKey)` in `src/lib/queryPersister.ts` targeting `smartspend_cache_${userType}_${userId}` with envelope validation and dehydrate filtering.
   - Wire `PersistQueryClientProvider` in `src/App.tsx` and eliminate the indiscriminate `clearPersistedQueryCache()` boot purge.
   - Enforce explicit `queryClient.clear()` on logout, user switch, and 401 interceptors.
   - Scope offline outboxes (`smartspend_offline_texts_${userKey}`) and UI preferences by composite user key.

---

## 5. Verification Method

1. **Independent Inspection**:
   - Inspect `src/lib/queryPersister.ts` and `src/App.tsx:476-479` to verify existing static key and boot purge.
   - Inspect `src/components/expenses/ExpenseForm.tsx:838,879` and `src/components/pwa/PwaEnhancements.tsx:45` to verify un-scoped outbox arrays.
   - Inspect `api/context.ts:8-17` to verify dual-auth user structure.
2. **Automated Monorepo Validation**:
   - Run `npm run check` to verify TypeScript type conformity across the monorepo.
   - Run `npm run test` to verify Vitest test suites.
3. **Manual Simulation / E2E Verification Scenario**:
   - Login as User 1 (`local:1`). Record expense "غداء 150 جنيه". Turn network offline.
   - Confirm expense is visible in offline cache.
   - Clear session/switch to User 2 (`oauth:2`).
   - Confirm User 2 cannot access or see User 1's "غداء 150 جنيه" transaction in cache or outbox.
