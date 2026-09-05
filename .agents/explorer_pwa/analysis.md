# Architectural Analysis: PWA Deconstruction & Unified Navigation Hooks

**Explorer**: Explorer 3 (PWA & Navigation Explorer)  
**Date**: 2026-08-26  
**Scope**: `src/components/pwa/PwaEnhancements.tsx`, `src/pages/Home.tsx`, `src/components/layout/MobileBottomNav.tsx`, `src/App.tsx`, and shared navigation hooks.

---

## 1. Executive Summary

This investigation analyzed the monolithic PWA coordinator `src/components/pwa/PwaEnhancements.tsx` (587 lines) and the fragmented gesture/keyboard listeners scattered across `Home.tsx`, `MobileBottomNav.tsx`, and `App.tsx`. 

We have established an architectural design to:
1. **Deconstruct `PwaEnhancements.tsx`** into 4 single-responsibility subcomponents (`PwaInstallPrompt.tsx`, `IosInstallGuide.tsx`, `OfflineSyncManager.tsx`, `NetworkStatusIndicator.tsx`) and a compact coordinator index (`PwaEnhancements.tsx` < 120 lines).
2. **Extract unified, RTL-aware navigation hooks** (`useSwipeNavigation.ts` and `useKeyboardNav.ts`) in `src/hooks/` with direction locking, velocity calculation, input element exclusion, and touch-action protection.
3. **Preserve 100% backward compatibility**, type safety, and zero external dependency additions.

---

## 2. Monolith Decomposition: `PwaEnhancements.tsx` (587 lines)

### Current Architecture & Responsibilities

`src/components/pwa/PwaEnhancements.tsx` currently combines 6 disparate concerns:
1. **PWA Installation Banner**: Listens for Chrome/Edge/Android `beforeinstallprompt` via `pwa-install-available` window event and prompts installation.
2. **iOS Safari Instruction Hint**: Detects iOS Safari user agents and renders an instructional card with a bouncing indicator pointing to Safari's Share button.
3. **Offline Outbox & Background Sync**: Reads/writes pending offline text drafts and manual expenses from `localStorage`, listens to custom `smartspend-offline-queue-changed` events, and renders the pending review modal.
4. **Network Online/Offline Status Indicator**: Monitors `navigator.onLine` and `online`/`offline` events, rendering persistent offline warning bars and animated transition toasts.
5. **Visual Viewport Keyboard Avoidance Engine**: Tracks `window.visualViewport` resize/scroll to dynamically calculate `--keyboard-height` and set `.keyboard-active` classes.
6. **Theme & Badge Meta Sync**: Dynamically updates `meta[name="theme-color"]`, `meta[name="apple-mobile-web-app-status-bar-style"]`, and calls `navigator.clearAppBadge()`.

---

### Target 4-Unit Architecture

```
src/components/pwa/
├── PwaEnhancements.tsx            # Orchestrator & Global Runtime (<= 120 lines)
├── PwaInstallPrompt.tsx           # Android/Desktop Install Banner (<= 95 lines)
├── IosInstallGuide.tsx            # iOS Safari "Add to Home Screen" Card (<= 95 lines)
├── OfflineSyncManager.tsx         # Outbox Sync Banner & Review Modal (<= 170 lines)
├── NetworkStatusIndicator.tsx     # Network Status Toasts & Offline Bar (<= 110 lines)
├── PullToRefreshWrapper.tsx       # Existing iOS rubber-band PTR
└── PullToRefreshWrapper.test.ts   # Existing PTR unit tests
```

#### Unit 1: `PwaInstallPrompt.tsx` (~90 lines)
- **Target File**: `src/components/pwa/PwaInstallPrompt.tsx`
- **Responsibility**: Detects `pwa-install-available` event, checks `getDeferredInstallPrompt()`, verifies non-standalone mode, delays prompt by 5 seconds, and provides the install trigger banner with dismiss caching.
- **Dependencies**: `lucide-react` (Download, X), `@/components/ui/button`, `@/pwa/register-sw` (`getDeferredInstallPrompt`, `isStandalonePwa`, `triggerInstallPrompt`), `@/lib/utils` (`cn`).
- **State & Storage**:
  - `canInstall`: boolean
  - `isReadyToShow`: boolean
  - `dismissed`: boolean (`localStorage.getItem("smartspend_pwa_install_dismissed_v2") === "1"`)
- **UI Element**: Fixed mobile banner at `bottom-[calc(5.5rem+env(safe-area-inset-bottom))]` with emerald gradient accent.

#### Unit 2: `IosInstallGuide.tsx` (~90 lines)
- **Target File**: `src/components/pwa/IosInstallGuide.tsx`
- **Responsibility**: Detects iOS Safari non-standalone devices, shows delayed (5s) instructional card directing users to tap the Safari Share icon and select "Add to Home Screen".
- **Dependencies**: `lucide-react` (Share, X, ChevronDown), `@/pwa/register-sw` (`isIosSafari`, `isStandalonePwa`), `@/lib/utils` (`cn`).
- **State & Storage**:
  - `showIosHint`: boolean
  - `isReadyToShow`: boolean
  - `dismissed`: boolean (`localStorage.getItem("smartspend_pwa_install_dismissed_v2") === "1"`)
- **UI Element**: Fixed card with bouncing bottom chevron pointing at Safari navigation bar.

#### Unit 3: `OfflineSyncManager.tsx` (~160 lines)
- **Target File**: `src/components/pwa/OfflineSyncManager.tsx`
- **Responsibility**: Listens for outbox updates, manages `smartspend_offline_texts` and `smartspend_offline_manual` queues in localStorage, renders the top indigo pending sync banner when online, and provides the complete review/delete/sync modal dialog.
- **Dependencies**: `lucide-react` (Database, RefreshCw, Trash2, X), `@/components/ui/button`, `react-router-dom` (`useNavigate`), `sonner` (`toast`), `@/lib/utils` (`cn`).
- **State & Storage**:
  - `pendingTexts`: `Array<{ text: string; timestamp: number }>`
  - `pendingManual`: `Array<{ amount: number | string; category: string; description?: string; timestamp?: number }>`
  - `showSyncDialog`: boolean
  - `isRetrying`: boolean
- **Events Bound**:
  - `storage` (sync across browser tabs)
  - `online` (auto-refresh queues on network reconnect)
  - `smartspend-offline-queue-changed` (local queue mutation)
  - Dispatches `smartspend-offline-sync` when user triggers manual sync.

#### Unit 4: `NetworkStatusIndicator.tsx` (~100 lines)
- **Target File**: `src/components/pwa/NetworkStatusIndicator.tsx`
- **Responsibility**: Tracks browser online/offline status, renders top persistent amber warning banner when disconnected, and renders transient status toast (auto-dismissed after 3.5s upon reconnection).
- **Dependencies**: `@/lib/utils` (`cn`).
- **State & Events**:
  - `isOnline`: boolean (initialized with `navigator.onLine`)
  - `showNetworkStatus`: boolean
  - Listens to `window.online` and `window.offline`.

#### Unit 5: Coordinating Index `PwaEnhancements.tsx` (~115 lines)
- **Target File**: `src/components/pwa/PwaEnhancements.tsx`
- **Responsibility**: Mounts the 4 subcomponents while managing global document/viewport lifecycles:
  1. Visual Viewport Keyboard Avoidance Engine (`--keyboard-height`, `.keyboard-active`)
  2. Theme metadata synchronization with `next-themes`
  3. App badging (`navigator.clearAppBadge()`)
  4. Service worker push notification route dispatch (`NAVIGATE_TO`)
- **Export Contract**: `export function PwaEnhancements()` (100% drop-in replacement for `App.tsx`).

---

## 3. Dependency & Protocol Mapping

| Category | Identifier | Read By | Written / Dispatched By | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **LocalStorage** | `smartspend_pwa_install_dismissed_v2` | `PwaInstallPrompt`, `IosInstallGuide` | `PwaInstallPrompt`, `IosInstallGuide` | Persistent banner dismissal flag |
| **LocalStorage** | `smartspend_offline_texts` | `OfflineSyncManager`, `ExpenseForm` | `ExpenseForm`, `OfflineSyncManager`, `useAuth` | Offline voice/text transcription queue |
| **LocalStorage** | `smartspend_offline_manual` | `OfflineSyncManager`, `ExpenseForm` | `ExpenseForm`, `OfflineSyncManager`, `useAuth` | Offline manual transaction draft queue |
| **LocalStorage** | `smartspend_push_prompt_dismissed` | `Home.tsx` | `Home.tsx` | 7-day push notification cooldown |
| **Window Event** | `pwa-install-available` | `PwaInstallPrompt` | `registerAppServiceWorker` (`register-sw.ts`) | Browser install prompt readiness |
| **Window Event** | `smartspend-offline-queue-changed` | `OfflineSyncManager`, `ExpenseForm` | `OfflineSyncManager`, `ExpenseForm` | Cross-component outbox reactivity |
| **Window Event** | `smartspend-offline-sync` | `ExpenseForm` | `OfflineSyncManager` | Triggers outbox replay in active form |
| **SW Message** | `NAVIGATE_TO` | `PwaEnhancements` | `sw.js` (Push notification click) | In-app push notification deep-linking |

---

## 4. Gesture & Keyboard Navigation Hooks Design

### Problem in Existing Implementation
- `Home.tsx` implements ~110 lines of raw touch event handlers (`touchstart`, `touchmove`, `touchend`) with manual delta math, direction locking, and RTL branching.
- `App.tsx` implements manual sidebar swipe math on `onTouchStart` / `onTouchMove` / `onTouchEnd`.
- `MobileBottomNav.tsx` calculates drag coordinates across bottom navigation items.
- Keyboard navigation is missing or inconsistent across dashboard tabs and modals.

---

### Hook Specification: `src/hooks/useSwipeNavigation.ts`

```typescript
import { useEffect, useRef, useCallback } from "react";

export interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  isSwiping: boolean;
  directionLocked: boolean;
}

export interface UseSwipeNavigationOptions {
  /** Target container ref to attach touch listeners to */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Callback fired on physical swipe left */
  onSwipeLeft?: () => void;
  /** Callback fired on physical swipe right */
  onSwipeRight?: () => void;
  /** Logical next tab/step navigation (swiping right in RTL, swiping left in LTR) */
  onSwipeNext?: () => void;
  /** Logical previous tab/step navigation (swiping left in RTL, swiping right in LTR) */
  onSwipePrev?: () => void;
  /** Minimum pixel displacement required to trigger swipe (default: 75) */
  threshold?: number;
  /** Minimum movement in pixels before locking direction (default: 10) */
  lockThreshold?: number;
  /** Whether the swipe navigation is enabled (default: true) */
  enabled?: boolean;
  /** Additional CSS classes on ancestor/descendant elements to exclude from swipe */
  excludedClasses?: string[];
  /** Explicit RTL override (default: detects document.dir === 'rtl' or document.documentElement.dir === 'rtl') */
  isRtl?: boolean;
}
```

#### Key Mechanics in `useSwipeNavigation`:
1. **Target Exclusion**: Automatically ignores touches on `INPUT`, `TEXTAREA`, `SELECT`, `[contenteditable]`, `.no-swipe`, `.recharts-wrapper`, and user-provided classes.
2. **Directional Locking**:
   - Compares `abs(deltaX)` vs `abs(deltaY)` when delta > `lockThreshold` (10px).
   - If vertical is dominant, aborts gesture to allow native document scroll.
   - If horizontal is dominant, locks horizontal gesture and calls `e.preventDefault()` on `touchmove` (using `{ passive: false }`) to avoid diagonal page bounce.
3. **RTL Logic Inversion**:
   - In RTL (Arabic layout): Swiping finger left (`deltaX < 0`) moves to PREVIOUS item; swiping finger right (`deltaX > 0`) moves to NEXT item.
   - In LTR: Swiping finger left moves to NEXT; swiping finger right moves to PREVIOUS.
4. **Touch Cancellation**: Handles `touchcancel` safely to prevent dangling swipe states when OS gestures occur.

---

### Hook Specification: `src/hooks/useKeyboardNav.ts`

```typescript
import { useEffect, useCallback } from "react";

export interface UseKeyboardNavOptions {
  /** Target element to bind keyboard events to. If omitted, binds to window. */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** Callback fired on ArrowLeft press */
  onArrowLeft?: (e: KeyboardEvent) => void;
  /** Callback fired on ArrowRight press */
  onArrowRight?: (e: KeyboardEvent) => void;
  /** Callback fired on ArrowUp press */
  onArrowUp?: (e: KeyboardEvent) => void;
  /** Callback fired on ArrowDown press */
  onArrowDown?: (e: KeyboardEvent) => void;
  /** Callback for logical "next" navigation (ArrowRight in RTL, ArrowLeft in LTR) */
  onNext?: (e: KeyboardEvent) => void;
  /** Callback for logical "previous" navigation (ArrowLeft in RTL, ArrowRight in LTR) */
  onPrev?: (e: KeyboardEvent) => void;
  /** Callback fired on Escape key */
  onEscape?: (e: KeyboardEvent) => void;
  /** Callback fired on Home key */
  onHome?: (e: KeyboardEvent) => void;
  /** Callback fired on End key */
  onEnd?: (e: KeyboardEvent) => void;
  /** Callback fired on Enter key */
  onEnter?: (e: KeyboardEvent) => void;
  /** Whether the keyboard listener is enabled (default: true) */
  enabled?: boolean;
  /** Ignore keydown events originating from form inputs/editable elements (default: true) */
  ignoreInputs?: boolean;
  /** Explicit RTL flag (default: detects document.dir === 'rtl') */
  isRtl?: boolean;
}
```

#### Key Mechanics in `useKeyboardNav`:
1. **Focus Isolation**: Automatically checks `document.activeElement` and `e.target` against `INPUT`, `TEXTAREA`, `SELECT`, and `contentEditable` to ensure keyboard shortcuts never intercept normal user typing in forms.
2. **RTL Awareness**:
   - In RTL: `ArrowRight` triggers `onNext`, `ArrowLeft` triggers `onPrev`.
   - In LTR: `ArrowLeft` triggers `onNext`, `ArrowRight` triggers `onPrev`.
3. **Lifecycle Cleanup**: Ensures all `keydown` listeners are unbound on unmount.

---

## 5. Verification Plan & Guardrails

1. **Type Checking**: Run `npm run check` (`tsc -b`) to verify 0 errors.
2. **Line Count Budget**:
   - `src/components/pwa/PwaEnhancements.tsx`: ~115 lines (Budget: 350 lines)
   - `src/components/pwa/PwaInstallPrompt.tsx`: ~90 lines (Budget: 350 lines)
   - `src/components/pwa/IosInstallGuide.tsx`: ~90 lines (Budget: 350 lines)
   - `src/components/pwa/OfflineSyncManager.tsx`: ~160 lines (Budget: 350 lines)
   - `src/components/pwa/NetworkStatusIndicator.tsx`: ~100 lines (Budget: 350 lines)
   - `src/hooks/useSwipeNavigation.ts`: ~150 lines (Budget: 350 lines)
   - `src/hooks/useKeyboardNav.ts`: ~110 lines (Budget: 350 lines)
3. **Behavioral Integrity**:
   - PWA installation prompt still displays after 5s when available.
   - iOS hint displays on iOS Safari.
   - Offline transactions display in banner and sync dialog.
   - Network reconnect toast displays and auto-dismisses after 3.5s.
   - Tab swiping in `Home.tsx` operates identically with smooth transitions and zero chart-drag interference.
   - Zero new npm packages added.
