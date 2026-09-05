# Handoff Report: Survey of Auth Multi-Tab Sync, Session Lifecycle, Async Resources, and Verification Architecture

**Milestone**: `survey_ai_docs_r6_r7`  
**Working Directory**: `e:/smartspend_V1_fixed/.agents/survey_ai_docs_r6_r7/`  
**Timestamp**: 2026-08-28T14:44:00Z  
**Author**: Explorer Subagent  

---

## 1. Observation

Direct investigation of the codebase revealed concrete structural mechanisms, exact code paths, and logical vulnerabilities:

### 1.1 Auth Architecture & Multi-Tab Synchronization
1. **Per-Component Isolated State**:
   - In `src/hooks/useAuth.ts` (lines 22–170), `useAuth()` defines local React state:
     ```ts
     const [user, setUser] = useState<AuthUser | null>(null);
     const [isLoading, setIsLoading] = useState(true);
     ```
   - There is no top-level React context (`AuthProvider`) distributing a single source of truth. Every consumer of `useAuth()` (e.g. `App.tsx:74`, `App.tsx:94`, `App.tsx:102`, `App.tsx:109`, `App.tsx:130`, `App.tsx:535`, `BiometricLockProvider.tsx:48`, `useSessionTracker.ts:6`) instantiates its own `useState`.
2. **Missing Cross-Tab Synchronization**:
   - In `src/hooks/useAuth.ts`, queries are configured with `refetchOnWindowFocus: false` (lines 33, 40).
   - There is **no** `BroadcastChannel` instance (e.g., `new BroadcastChannel("smartspend_auth")`) and **no** `window.addEventListener("storage", ...)` listening for changes to `local_auth_token` or offline identities.
   - When User logs out or logs into a different account in Tab A, Tab B receives no event, retains stale user state in memory, and continues issuing mutations with expired/mismatched credentials.
3. **Dual-Auth Priority & Cookie Shadowing Vulnerability**:
   - `api/context.ts` (lines 56–121) resolves authentication with strict top-down ordering:
     ```ts
     // 1. Try Google OAuth (cookie) — validates against sessions DB
     const googleToken = parseCookie(req, "google_session");
     if (googleToken) {
       const activeSession = await validateActiveSessionToken(googleToken, "oauth");
       if (activeSession) { ... user = oauthUser; }
     }
     // 2. Try Local/WebAuthn Auth (Bearer token)
     if (!user) {
       const authHeader = getAuthHeader(req);
       ...
     }
     ```
   - In `src/providers/trpc.ts` (lines 26–34, 58–61), `fetch` is executed with `credentials: "include"`, while `getTrpcHeaders()` supplies `Authorization: Bearer <local_auth_token>`.
   - In `src/hooks/useAuth.ts` (lines 136–137), client logout executes:
     ```ts
     document.cookie = "google_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
     ```
     Because `google_session` is set by `api/boot.ts:291` as an **`HttpOnly`** cookie, JavaScript running in the browser cannot delete it. If the server logout mutation fails or is skipped, the cookie persists.
   - When a user logs in via Phone/Password (`localAuth`), the browser sends both the lingering `google_session` cookie and the `Bearer <local_token>` header. `api/context.ts` parses the cookie first and binds `ctx.user` to the old OAuth user, completely ignoring the Bearer header.
4. **In-Flight Token Expiration & Unprotected Form State**:
   - In `src/providers/trpc.ts` (lines 36–95), when the backend returns HTTP 401 (or TRPC `UNAUTHORIZED`), the client throws a `TRPCClientError` or `Error("انتهت الجلسة...")`.
   - There is no tRPC client link or global React Query cache listener that traps 401 errors, saves dirty form inputs to `sessionStorage`, or broadcasts an `"AUTH_EXPIRED"` event.
   - In `src/components/expenses/ExpenseForm.tsx` (lines 549–560, 581–587), an in-flight mutation error only triggers `toast.error()`. If the user refreshes or navigates to `/login`, all input text, audio recordings, and multi-person clarification drafts are lost.

---

### 1.2 Async Lifecycle & Resource Cleanups
1. **Audio & WebSockets in Live Voice**:
   - `src/hooks/useVoiceCall.ts` (lines 129–147, 214–283) manages an `AudioContext`, `AudioWorkletNode`, `MediaStream`, `WebSocket`, `AnalyserNode`, and `GainNode`.
   - `cleanupResources()` (lines 214–283) explicitly stops buffer sources, clears `timerIntervalRef`, disconnects the AudioWorklet node, disconnects analysers, disables and stops media stream tracks, closes the AudioContext, revokes the blob URL (`URL.revokeObjectURL`), and closes the WebSocket connection.
   - In `startCall()` (lines 286–386), `activeCallIdRef.current` guards against race conditions if `startCall()` is interrupted or unmounted before asynchronous `getUserMedia()` or `audioWorklet.addModule()` resolves.
2. **Zero-Polling SSE in WhatsApp OTP**:
   - `api/boot.ts` (lines 320–365) creates an SSE endpoint `GET /api/sse/otp?phone=...` with client rate-limiting, a 5-minute timeout guard, and event listener cleanup upon `c.req.raw.signal.addEventListener("abort", ...)`.
   - `src/pages/Login.tsx` (lines 143–190) creates `new EventSource("/api/sse/otp?phone=...")`. The `useEffect` cleanup explicitly calls `eventSource.close()`.
3. **History Navigation Binding**:
   - `src/hooks/useHistoryBound.ts` (lines 15–39) pushes a state to `window.history` when a modal opens and removes the `popstate` event listener on unmount.
   - **Caveat**: On line 35, `if (window.history.state && window.history.state.modalOpenId === stateId) window.history.back()`. If the modal unmounts as part of a route transition (e.g., user clicked a navigation link), triggering `window.history.back()` can unintentionally revert the route change.
4. **Pull-to-Refresh & Gesture Animations**:
   - `src/components/pwa/PullToRefreshWrapper.tsx` (lines 62–319) attaches `touchstart`, `touchmove`, `touchend`, and `touchcancel` listeners to the scroll container.
   - Direct DOM updates are executed inside `requestAnimationFrame` (`scheduleDomUpdate`). Cleanup removes all 4 event listeners and calls `cancelAnimationFrame(state.current.rafId)`.
5. **Visual Viewport Keyboard Avoidance**:
   - `src/hooks/usePwaLifecycle.ts` (lines 39–112) binds `resize` and `scroll` on `window.visualViewport` and `focusin`/`focusout` on `document`.
   - All listeners are removed in the `useEffect` cleanup, and `root.classList.remove("keyboard-active")` is executed.

---

### 1.3 Verification & Documentation Architecture
1. **Existing Test Infrastructure**:
   - `vitest.config.ts` (lines 15–47): 92 test files configured with `jsdom` for `src/**` and `node` for `api/**` and `tests/**`.
   - `playwright.config.ts` (lines 29–78): Emulates iPhone 16 Pro, iPhone 14, Android Chrome Pixel 7, and iPad Air Tablet with dark mode, Arabic locale (`ar-EG`), and Cairo timezone (`Africa/Cairo`).
   - `tests/`: Contains stress tests (`mobile-dashboard-adversarial.stress.test.ts`), PWA sync (`capacitor-manifest-sync.test.ts`), query persister (`query-persister.test.ts`), and font self-hosting (`fonts-self-hosted.test.ts`).
2. **Documentation Index**:
   - `docs/` currently contains 10 documents (`01-ARCHITECTURE.md` through `09-RELEASE_AND_PLAYBOOK.md`).
   - `docs/LOGICAL_EDGE_CASES_AUDIT.md` needs to be created as the definitive authoritative audit record.

---

## 2. Logic Chain

```
[Observation 1.1.1, 1.1.2]
Independent useState in useAuth + refetchOnWindowFocus:false + no BroadcastChannel/storage listener
       │
       ▼
[Deduction 1] Multi-Tab Session Desynchronization
When Tab A logs out, changes password, or switches users:
Tab B remains in a false "authenticated" state, shows old cached private financial data, and fails unexpectedly on subsequent mutations.

[Observation 1.1.3]
api/context.ts checks google_session cookie BEFORE Authorization: Bearer
+ document.cookie cannot delete HttpOnly cookie
       │
       ▼
[Deduction 2] Dual-Auth Identity Shadowing & Type Confusion
If a user switches from Google OAuth to Local Phone/Password login, the persistent HttpOnly cookie overrides the Bearer token, causing all API calls to execute under the previous OAuth user's identity.

[Observation 1.1.4]
trpc.ts throws on 401 without error interceptor + ExpenseForm has no session draft storage
       │
       ▼
[Deduction 3] In-Flight Expiration Data Loss
When a user's session expires mid-operation, the form state (text input, voice recording, clarification answers) is destroyed upon navigation or failure.

[Observation 1.2.1 – 1.2.5]
Resource cleanup is robust in useVoiceCall, PullToRefreshWrapper, and usePwaLifecycle, but useHistoryBound contains a route-reversion race condition.
       │
       ▼
[Deduction 4] History Stack Integrity Risk
Closing an open sheet or modal during programmatic page transition can trigger a double-back in browser history.

[Observation 1.3.1 – 1.3.2]
Comprehensive test runners (Vitest + Playwright) exist, but lack dedicated suites for multi-tab sync, cookie/bearer priority, and in-flight token expiry.
       │
       ▼
[Deduction 5] Verification Blueprint Required
Need automated test coverage in tests/ and a structured audit report in docs/LOGICAL_EDGE_CASES_AUDIT.md.
```

---

## 3. Caveats

1. **Native Capacitor Mobile vs. Web**: On native Android/iOS shells running Capacitor, cookies and `localStorage` are isolated to the app webview instance. Multi-tab synchronization is primarily a web/PWA concern, whereas session recovery and in-flight token preservation apply equally to mobile and web.
2. **Third-Party Passkeys (WebAuthn)**: WebAuthn challenges expire in 5 minutes (`api/webauthn-router.ts:133, 236`). If a user cancels or backgrounds the browser during biometric prompt, the challenge is pruned, requiring a clean retry.
3. **No Direct Code Modifications**: As a read-only investigation, no production source files were modified during this audit.

---

## 4. Conclusion & Concrete Remediation Specifications

To achieve production-grade resilience and zero state desynchronization across the platform, the following architectural fixes are specified:

### 4.1 Specification: Auth Multi-Tab Sync & React Context Provider
- **Create `src/providers/AuthProvider.tsx`**:
  - Encapsulate `useAuth` into a single root React Context.
  - Implement a `BroadcastChannel("smartspend_auth")` that broadcasts `"LOGIN"`, `"LOGOUT"`, and `"SESSION_EXPIRED"` events across tabs.
  - Add a `window.addEventListener("storage", ...)` listener to automatically react when `local_auth_token` is modified or removed in another tab.
  - When a logout or account switch occurs, automatically reset React Query cache (`queryClient.clear()`) and synchronize user state.

### 4.2 Specification: Dual-Auth Consistency & Server Cookie Management
- **Update `api/context.ts`**:
  - If `Authorization: Bearer <token>` is explicitly passed and valid, give it priority over ambient `google_session` cookies.
  - Alternatively, validate that if both exist, they belong to the same expected session; if `Bearer` is provided, evaluate `Bearer` first so local user tokens are never shadowed by stale OAuth cookies.
- **Server-Side Cookie Clearing**:
  - In `api/auth-router.ts` (`auth.logout`) and `api/local-auth-router.ts` (`localAuth.logout`), return a `Set-Cookie` header with `Max-Age=0` and `Path=/` to guarantee server-side deletion of `HttpOnly` `google_session` cookies.

### 4.3 Specification: Global In-Flight Expiration & Form Draft Recovery
- **Global Error Interceptor in `src/providers/trpc.ts`**:
  - Add a response link / interceptor that detects HTTP 401 (`UNAUTHORIZED`).
  - Automatically persist active draft inputs (`smartspend_form_draft`) to `sessionStorage`.
  - Dispatch an auth event to notify the UI to show a clean re-auth modal or redirect with `?redirect=...&draft=1`.
- **Form Auto-Restore in `ExpenseForm.tsx` & `AIChatbot.tsx`**:
  - Check for `sessionStorage.getItem("smartspend_form_draft")` on mount and restore unfinished input after session re-authentication.

### 4.4 Specification: `useHistoryBound` Fix
- In `src/hooks/useHistoryBound.ts`, track whether unmounting was caused by a popstate event vs. a programmatic close to avoid accidental `window.history.back()` triggers during route changes.

---

## 5. Verification Method

### 5.1 Automated Test Suite Design (`tests/auth-multi-tab-lifecycle.test.ts`)
```ts
// Blueprint for Vitest multi-tab and dual-auth suite:
describe("Auth Multi-Tab & Dual-Auth Lifecycle", () => {
  it("synchronizes logout across tabs via BroadcastChannel & storage event", async () => { ... });
  it("prioritizes Bearer token over lingering Google OAuth HttpOnly cookie", async () => { ... });
  it("preserves dirty form state in sessionStorage on 401 UNAUTHORIZED response", async () => { ... });
  it("cleans up all AudioWorklet, MediaStream, and WebSocket resources on unmount", async () => { ... });
});
```

### 5.2 Verification Commands
1. **Type-Check**: `npm run check` (Runs `tsc -b` across monorepo).
2. **Unit & Integration Suite**: `npm run test` (Runs all Vitest suites in `src/**`, `api/**`, and `tests/**`).
3. **Targeted Test Execution**:
   - `npx vitest run src/providers/trpc.test.ts`
   - `npx vitest run src/hooks/useHaptics.test.ts`
   - `npx vitest run tests/query-persister.test.ts`
4. **E2E Playwright Suite**: `npm run test:e2e`

---

## 6. Structure Specification for `docs/LOGICAL_EDGE_CASES_AUDIT.md`

The authoritative document `docs/LOGICAL_EDGE_CASES_AUDIT.md` should be organized into the following 7 core sections:

1. **Executive Summary & System Invariants**
2. **Domain 1: Auth, Multi-Tab Sync & Dual-Identity Consistency**
   - Cross-tab BroadcastChannel and storage events
   - Bearer token vs. HttpOnly cookie precedence
   - In-flight 401 token expiration and form draft preservation
3. **Domain 2: Audio, Voice Recording & Real-Time WebSockets**
   - Zero-length audio, permission denial, AudioWorklet lifecycle, PCM streaming
4. **Domain 3: AI Streaming, Chatbot & Parser Resilience**
   - Abort controllers, timeout recovery, clarification state-machine
5. **Domain 4: Financial Forms, Calculations & Mutation Idempotency**
   - Double-tap prevention, clientRequestId UUIDs, optimistic updates
6. **Domain 5: PWA, Mobile Touch Physics & Visual Viewport**
   - Virtual keyboard avoidance, pull-to-refresh iOS rubberbanding, swipe navigation
7. **Domain 6: Offline Resilience, Queue Sync & Background Workers**
   - LocalStorage outbox queues, IndexedDB cache isolation, SSE auto-reconnect
8. **Verification Matrix & Test Coverage Index**
