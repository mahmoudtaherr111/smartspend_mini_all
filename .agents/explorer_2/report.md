# Investigation Report: User-Aware Cache Isolation, Multi-Account Safety & Cache Lifecycle Management

**Author**: Explorer 2  
**Date**: 2026-08-26  
**Project**: SmartSpend AI  
**Scope**: PWA Offline Persistence, React Query / tRPC Caching, Multi-User Isolation, Session Transitions, Storage Security  

---

## Executive Summary

SmartSpend AI utilizes a dual-authentication system (Google OAuth via HttpOnly cookies and Local/Passkey/OTP auth via Bearer tokens). Currently, client-side caching and offline storage have **critical multi-account isolation vulnerabilities** that previously forced developers to disable query cache persistence on startup (`clearPersistedQueryCache()` in `App.tsx:478`).

This report provides an in-depth investigation of:
1. **Frontend User Identity & Dual-Auth Session Mechanics**: Analysis of `src/hooks/useAuth.ts`, `api/context.ts`, token storage, and the subtle **numeric ID collision risk** between `users` and `localUsers` tables.
2. **Multi-Account Cache Leakage & Isolation Breakdown**: Why a single static `QueryClient` and un-scoped `idbPersister` (`src/lib/queryPersister.ts`) leaks private financial transactions, bank data, and AI chats across user accounts on shared devices or offline PWA restarts.
3. **End-to-End Cache Lifecycle Architecture**: Prescriptive state machine for Login, Logout, Account Switch, Session Expiry (401 Unauthorized), and User Data Purge.
4. **User-Scoped Storage & Persister Engineering**: Design of compound user keys (`${userType}:${userId}`), user-scoped IndexedDB object stores / database keys, and query dehydrate filters for `@tanstack/react-query-persist-client`.
5. **Offline Mutation Safety & Optimistic Outbox**: Analysis of `ExpenseForm.tsx` outbox, `PwaEnhancements.tsx` sync manager, idempotency protection (`clientRequestId`), and prevention of cross-user outbox sync.

---

## 1. User Identity & Session State Management in the Frontend

### 1.1 Dual-Auth Architecture

The backend supports two distinct user tables (`db/schema.ts`):
- `users`: Google OAuth accounts.
- `localUsers`: Password, WhatsApp OTP, and WebAuthn Passkey accounts.

In `api/context.ts` (lines 8-17, 51-124), the backend normalizes the authenticated user into a `UnifiedUser`:

```typescript
// api/context.ts:8-17
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

### 1.2 Session Resolution & Token Storage

| Auth Method | Transport / Storage | Backend Session Table Entry | Context Resolution Logic |
| :--- | :--- | :--- | :--- |
| **Google OAuth** | `google_session` HttpOnly Cookie (`Max-Age=604800` ~7 days) | `sessions` table (`userType: "oauth"`, `token`, `userId`) | `api/context.ts:57-75`: reads cookie, validates active token in `sessions`, queries `db.query.users.findFirst`. |
| **Local / Phone / Password** | `localStorage.setItem("local_auth_token", token)` | `sessions` table (`userType: "local"`, `token`, `userId`) | `api/context.ts:78-120`: reads `Authorization: Bearer <token>`, validates active token in `sessions`, queries `db.query.localUsers.findFirst`. |
| **WebAuthn Passkey** | `localStorage.setItem("local_auth_token", token)` | `sessions` table (`userType: "local"` or `"oauth"`, `token`, `userId`) | Same Bearer token flow via `api/context.ts`. |

### 1.3 The Frontend Auth Hook (`src/hooks/useAuth.ts`)

In `src/hooks/useAuth.ts` (lines 21-72):
- The hook triggers two parallel tRPC queries:
  ```typescript
  const { data: oauthUser, isFetched: oauthFetched } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: localUser, isFetched: localFetched } = trpc.localAuth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  ```
- Once both queries resolve, `useAuth` sets local React state `user: AuthUser | null`.

### 1.4 Critical Gotcha: Numeric ID Overlap Risk
Because `users` and `localUsers` are separate auto-incrementing MySQL tables:
- An OAuth user can have `id = 1` (`type: "oauth"`).
- A Local user can also have `id = 1` (`type: "local"`).
- **Architecture Rule**: A user MUST NEVER be identified solely by `user.id`. The unique compound identity key is strictly:
  $$\text{UserKey} = `${user.type}:${user.id}` \quad \text{e.g., } \texttt{"oauth:1"} \ne \texttt{"local:1"}$$

---

## 2. Multi-Account Cache Leakage & Isolation Breakdown

### 2.1 The Vulnerability in Existing `src/lib/queryPersister.ts`

Inspecting `src/lib/queryPersister.ts` (lines 3-58):

```typescript
// src/lib/queryPersister.ts:3-5
const DB_NAME = "smartspend_query_cache";
const STORE_NAME = "queries";
const KEY = "cache"; // STATIC GLOBAL KEY!
```

Every query (expenses, financial summaries, bank sync status, AI chat history, notification logs) is saved under the global key `"cache"`.

### 2.2 The Workaround in `src/App.tsx`

Because `idbPersister` lacked user isolation, previous developers noticed cross-account data leaks and implemented a temporary bypass in `src/App.tsx` (lines 476-479):

```typescript
// src/App.tsx:476-479
// Older releases persisted every financial tRPC response under one device
// key. Purge that legacy cache rather than hydrating another user's data.
void clearPersistedQueryCache();
```

Furthermore, `src/App.tsx` initializes a single static `QueryClient` (lines 53-60) without using `PersistQueryClientProvider`. As a result:
1. **Offline Persistence is broken/disabled**: Offline PWA users cannot read their previously loaded expenses or monthly analytics when offline.
2. **In-Memory Cache Leakage on Account Switch**: If User A logs out and User B logs in during the same browser session without a hard reload, React Query's in-memory cache still holds User A's data until queries refetch from the network.

### 2.3 Other Unscoped `localStorage` Keys

| File Location | Key Name | Current Scope | Risk / Consequence |
| :--- | :--- | :--- | :--- |
| `src/components/pwa/PwaEnhancements.tsx:45` | `smartspend_offline_texts` | Global stringified JSON array | User A's offline voice/text notes will be uploaded to User B's account if account is switched before reconnecting. |
| `src/components/pwa/PwaEnhancements.tsx:46` | `smartspend_offline_manual` | Global stringified JSON array | User A's offline manual transactions will sync into User B's ledger upon reconnection. |
| `src/components/OnboardingCard.tsx:177` | `onboarding_answers_${name}` | Scoped by user name | If two users share the same name (e.g., "أحمد"), answers and financial profile data collide. |
| `src/pages/Home.tsx:405` | `smartspend_business_mode` | Global boolean | Personal vs Business mode toggle leaks across different users on the same phone. |
| `src/components/goals/FinancialGoalsPanel.tsx:54` | `smartspend_hide_goals_panel` | Global boolean | UI preference leaks across users. |
| `src/components/bank-sync/AndroidSetupFlow.tsx:54` | `auth_token` | Misnamed key | Checks `auth_token` instead of standard `local_auth_token`. |

---

## 3. End-to-End Cache Lifecycle Architecture

To achieve 100% data isolation and zero leakage across all session states, the cache lifecycle must strictly enforce the following state transitions:

```
                  ┌────────────────┐
                  │  Logged Out /  │
                  │   Anonymous    │
                  └───────┬────────┘
                          │ Login Success (OAuth / Local / Passkey)
                          ▼
                  ┌────────────────┐
  ┌───────────────┤ Active Session ├────────────────┐
  │               │ User: oauth:42 │                │
  │               └───────┬────────┘                │
  │ User Switch           │                         │ Session Expired
  │ or Manual Logout      │ Explicit Data Purge     │ (401 / Token Invalid)
  ▼                       ▼                         ▼
┌─────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ queryClient.    │ │ db.purgeUserData()│ │ queryClient.      │
│   clear()       │ │ IDB.delete(user)  │ │   clear()         │
│ IDB.isolate()   │ │ localStorage.     │ │ localStorage.     │
│ localStorage.   │ │   removeUser(key) │ │   removeItem(tok) │
│   remove(token) │ │ queryClient.      │ │ Redirect /login   │
│                 │ │   clear()         │ │                   │
└─────────────────┘ └───────────────────┘ └───────────────────┘
```

### 3.1 Lifecycle Events Specification

#### 1. On Login (`/login`, Google OAuth Callback, WebAuthn Passkey)
1. Store session credentials (`local_auth_token` or `google_session`).
2. Construct active `userKey = "${user.type}:${user.id}"`.
3. Invalidate/clear any prior in-memory React Query cache: `queryClient.clear()`.
4. Initialize user-scoped IDB persister targeting `smartspend_cache_${userKey}`.
5. Restore cached queries strictly belonging to `userKey`.
6. Load user-scoped offline outbox queue `smartspend_offline_queue_${userKey}`.

#### 2. On Logout (`src/hooks/useAuth.ts:74-93`)
1. Remove auth credentials:
   - `localStorage.removeItem("local_auth_token")`
   - Expire `google_session` cookie: `document.cookie = "google_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"`
2. In-Memory Eviction: `queryClient.clear()` immediately clears all in-memory query caches and cancel active fetches.
3. Server-Side Invalidation: Mutate `trpc.auth.logout` and `trpc.localAuth.logout` to invalidate the session token in the MySQL `sessions` table.
4. Persistent Storage Policy:
   - If device is shared / full logout: Delete user's IndexedDB store (`idbPersister.removeClient()`).
   - If offline multi-account persistence is retained: Leave encrypted/isolated user store intact for when this specific user logs back in, but ensure it is inaccessible to any other user.
5. Outbox Protection: Disconnect outbox sync listeners so previous user's pending outbox cannot be synced by a subsequent user.

#### 3. On User Switch
1. Compare incoming `currentUserKey` with previous `activeUserKey`.
2. If `currentUserKey !== activeUserKey`:
   - Execute `queryClient.clear()`.
   - Cancel all in-flight queries.
   - Switch active IDB persister scope.
   - Hydrate exclusively the new user's persisted store.

#### 4. On Session Expiry (401 / Unauthorized Response)
1. Intercept 401 HTTP response in `trpcClient` fetch link (`src/providers/trpc.ts:30-79`).
2. Remove expired `local_auth_token`.
3. Execute `queryClient.clear()` to prevent rendering stale financial balances.
4. Notify user via toast and redirect to `/login?reason=expired`.

#### 5. On Manual Data Purge / Account Deletion (`src/pages/Settings.tsx` & `api/local-auth-router.ts:345`)
1. Server executes `purgeUserData()` across all 48 database tables.
2. Frontend deletes IndexedDB object store: `indexedDB.deleteDatabase("smartspend_cache_" + userKey)`.
3. Frontend purges all user-scoped `localStorage` keys matching `*_${userKey}`.
4. Frontend executes `queryClient.clear()` and triggers hard redirect to `/login`.

---

## 4. User-Scoped Query Keys & IndexedDB Storage Architecture

### 4.1 Storage Isolation: Scoped Persister vs Manual Query Keys

#### Why Procedure-Level `queryKey` Prefixing is Inappropriate:
In tRPC v11 (`@trpc/react-query`), query keys are generated deterministically by procedure paths (e.g. `[['expense', 'list'], { type: 'query', input: {...} }]`). Requiring manual `userId` injection into every query key across 40+ UI components:
- Violates DRY and is prone to human error.
- Bloats API contracts with redundant parameters (the server securely infers user ID from session context).

#### Recommended Architectural Solution: User-Scoped Persister
Scope the **Persister Storage Layer** and **Hydration Gate** per user. All standard tRPC queries flow naturally through the standard React Query client, while the persister isolates the physical storage by `userKey`.

### 4.2 Proposed Implementation: `src/lib/userScopedPersister.ts`

```typescript
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const DB_BASE_NAME = "smartspend_query_cache_v2";
const STORE_NAME = "queries";

interface UserPersistedEnvelope {
  userKey: string; // e.g. "oauth:12" or "local:45"
  timestamp: number;
  client: PersistedClient;
}

/**
 * Creates an IndexedDB persister strictly scoped to the active user key.
 * If userKey is null (unauthenticated/logged out), persistence is a no-op.
 */
export function createUserScopedPersister(getUserKey: () => string | null): Persister {
  let activeDbPromise: Promise<IDBDatabase> | null = null;
  let activeDbKey: string | null = null;

  function getDb(userKey: string): Promise<IDBDatabase> {
    const dbName = `${DB_BASE_NAME}_${userKey.replace(":", "_")}`;
    if (activeDbKey === userKey && activeDbPromise) {
      return activeDbPromise;
    }
    activeDbKey = userKey;
    activeDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = window.indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return activeDbPromise;
  }

  return {
    persistClient: async (client: PersistedClient) => {
      const userKey = getUserKey();
      if (!userKey || typeof window === "undefined" || !window.indexedDB) return;

      try {
        const db = await getDb(userKey);
        const envelope: UserPersistedEnvelope = {
          userKey,
          timestamp: Date.now(),
          client,
        };

        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(envelope, "active_cache");
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.error("[Persister] Failed to persist client for", userKey, err);
      }
    },

    restoreClient: async () => {
      const userKey = getUserKey();
      if (!userKey || typeof window === "undefined" || !window.indexedDB) {
        return undefined;
      }

      try {
        const db = await getDb(userKey);
        const envelope = await new Promise<UserPersistedEnvelope | undefined>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const req = store.get("active_cache");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        // Strict validation: Reject cache if userKey does not match active session
        if (!envelope || envelope.userKey !== userKey) {
          return undefined;
        }

        // Cache TTL check (7 days max)
        const maxAge = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - envelope.timestamp > maxAge) {
          return undefined;
        }

        return envelope.client;
      } catch (err) {
        console.error("[Persister] Failed to restore client for", userKey, err);
        return undefined;
      }
    },

    removeClient: async () => {
      const userKey = getUserKey();
      if (!userKey || typeof window === "undefined" || !window.indexedDB) return;

      try {
        const db = await getDb(userKey);
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete("active_cache");
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.error("[Persister] Failed to remove client for", userKey, err);
      }
    },
  };
}
```

### 4.3 Query Dehydration Filters (Sensitive Ephemeral Data Exclusion)

Not all queries should be stored in IndexedDB. Ephemeral queries like live OTP checks, SSE ping states, and rate limit counters must be excluded from persistence:

```typescript
export const persistOptions = {
  persister: userScopedPersister,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  buster: "smartspend_v2_isolated",
  dehydrateOptions: {
    shouldDehydrateQuery: (query: any) => {
      const queryKey = query.queryKey;
      // Do not persist ephemeral or sensitive auth queries
      const firstSegment = Array.isArray(queryKey?.[0]) ? queryKey[0][0] : queryKey?.[0];
      const secondSegment = Array.isArray(queryKey?.[0]) ? queryKey[0][1] : queryKey?.[1];

      if (firstSegment === "localAuth" && secondSegment === "checkVerificationStatus") return false;
      if (firstSegment === "webauthn") return false;
      
      // Default: persist successful queries
      return query.state.status === "success";
    },
  },
};
```

---

## 5. Offline Mutation Safety & Optimistic Updates

### 5.1 Analysis of Existing Offline Outbox

In `src/components/expenses/ExpenseForm.tsx` (lines 830-864 and 1797-1829):
1. **Offline Queuing**:
   - `smartspend_offline_texts`: Enqueues `{ id: createOfflineItemId(), text, timestamp, status: "pending" }`.
   - `smartspend_offline_manual`: Enqueues manual expense payloads with `clientRequestId`.
2. **Idempotency**:
   - `clientRequestId` (UUID) is sent with mutations (`api/expense-router.ts`).
   - The backend checks `clientRequestId` in ACID transactions to prevent duplicate writes during retries or network blips.
3. **Synchronization**:
   - When network comes online, `syncOfflineData` (lines 874-980) iterates through the queues and executes `parseMutation` / `createMutation`.

### 5.2 Required Hardening for Multi-Account Outbox Safety

1. **User-Scoped Outbox Keys**:
   Instead of static keys `smartspend_offline_texts` and `smartspend_offline_manual`, storage keys MUST be prefixed by user key:
   - `smartspend_offline_texts_${userKey}`
   - `smartspend_offline_manual_${userKey}`
2. **Outbox Synchronization User Guard**:
   Before executing `syncOfflineData()`, verify:
   ```typescript
   if (!user || userKey !== currentOutboxUserKey) {
     console.warn("Aborting offline sync: active user does not match outbox owner");
     return;
   }
   ```
3. **Optimistic UI Rollbacks**:
   - `ExpenseForm.tsx:514-573` correctly uses `onMutate` with `utilsTrpc.expense.list.setData` and rolls back using `context.previousExpenses` on `onError`.
   - `RecentExpenses.tsx:318-348` correctly handles optimistic deletion rollbacks.

---

## 6. Actionable Implementation Checklist

| Task # | Area | File(s) | Description |
| :--- | :--- | :--- | :--- |
| **T1** | IDB Persister | `src/lib/queryPersister.ts` | Replace static single-key persister with `createUserScopedPersister` using `${userType}:${userId}`. |
| **T2** | Query Client Setup | `src/App.tsx` | Wrap App with `PersistQueryClientProvider` configured with `persistOptions` and remove the legacy `void clearPersistedQueryCache()` blanket purge. |
| **T3** | Auth Hook & Logout | `src/hooks/useAuth.ts` | On logout and account switch, trigger `queryClient.clear()`, user-scoped persister cleanup, and clear user-scoped storage keys. |
| **T4** | Offline Outbox Scoping | `src/components/expenses/ExpenseForm.tsx` | Scope `smartspend_offline_texts` and `smartspend_offline_manual` by `${userKey}` and verify user identity in `syncOfflineData`. |
| **T5** | PWA Enhancements Sync | `src/components/pwa/PwaEnhancements.tsx` | Scope pending count badge and dialog queue loader to active `${userKey}`. |
| **T6** | UI Preference Scoping | `src/pages/Home.tsx`, `src/components/OnboardingCard.tsx`, `src/components/goals/FinancialGoalsPanel.tsx` | Scope `business_mode`, `hide_goals_panel`, and `onboarding_answers` by `${userKey}`. |

---

## 7. Verification Method

1. **Multi-Account Offline Isolation Test**:
   - Log in as User A (Google OAuth `id: 1`). Record 2 expenses and view monthly stats.
   - Disconnect network (Offline mode in DevTools). Verify expenses render from isolated cache.
   - Log out and log in as User B (Local Auth `id: 1`).
   - Verify User B cannot see User A's cached expenses, budgets, or outbox items.
2. **TypeScript & Regression Checks**:
   - Run `npm run check` (ensure 0 TypeScript compiler errors).
   - Run `npm run test` (ensure all 424 unit/integration tests pass).
