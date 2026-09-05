# Explorer 1 Analysis: Deconstruction of `Home.tsx` & Unified Layout/Navigation Hooks

## Executive Summary
This document provides the complete architectural deconstruction and modularization specification for:
1. `src/pages/Home.tsx` (monolith of 1,150 lines) $\rightarrow$ decomposed into a clean orchestrator (<200 lines) supported by 6 focused, single-responsibility submodules and 1 specialized dashboard state hook, each under 300 lines.
2. `MobileBottomNav.tsx`, `App.tsx`, and layout wrappers $\rightarrow$ consolidated swipe and keyboard navigation logic into reusable hooks (`useSwipeNavigation` and `useKeyboardNav`).
3. Complete preservation of RTL Arabic semantics, dual-auth context (`UnifiedUser`), tRPC v11 query prefetching, keep-alive tab caching, and PWA integration.

---

## 1. Deconstructive Anatomy of `Home.tsx` Monolith

### 1.1 Overview & Metrics
- **Current Total Lines:** 1,150 lines
- **Total Components Defined in File:**
  1. `Home` (main default export, lines 152–852)
  2. `HealthBadge` (memoized badge, lines 86–92)
  3. `SummaryChip` (memoized card, lines 94–129)
  4. `StatsView` (memoized stats renderer, lines 854–1149)
- **Dead/Unused Imports Identified:**
  - `ReceiptCapture` (line 50) — imported but never rendered in `Home.tsx`.
  - `AIInsights` (line 48) — imported but never rendered in `Home.tsx`.
  - `PlanUsageStrip` (line 62) — imported but never rendered in `Home.tsx` (rendered in App shell/header).
  - `Brain`, `ReceiptText` (lines 38, 22) — unused lucide icons.
  - `motion`, `AnimatePresence` (line 13) — imported but not used in `Home.tsx` JSX (used in other components).

---

### 1.2 State & Hooks Inventory

| State / Hook | Type / Signature | Purpose / Domain Responsibility |
| :--- | :--- | :--- |
| `useAuth()` | `{ user: UnifiedUser \| null }` | User identity, name greeting, account creation age calculation for goal toast |
| `trpc.useUtils()` | `TRPCUtils` | Prefetching and query invalidation on mutation/refresh |
| `useLocation()`, `useSearchParams()` | `Location`, `URLSearchParams` | Tab state (`tab`), financial month filter (`month`), and Web Share Target parameters |
| `activeTab` | `HomeTab` (`"record" \| "stats" \| "calendar"`) | Active dashboard view mode (synchronized with `?tab=` URL query) |
| `month` | `string` (`"YYYY-MM"`) | Selected financial month (synchronized with `?month=` URL query) |
| `sharedText` | `string` | Text received via Web Share Target API (`share_text`, `share_title`, `share_url`) |
| `businessMode` | `boolean` | Flag switching between personal and business ledger |
| `activeBusinessId` | `number \| undefined` | ID of active business when `businessMode` is true |
| `showPushPrompt` | `boolean` | Controls visibility of the double-prompt web push notification modal |
| `containerRef` | `RefObject<HTMLDivElement>` | Target container for content swipe gesture engine |
| `swipeState` | `RefObject<{ startX, startY, isSwiping, directionLocked }>` | Directional locking state for horizontal swipe vs vertical scroll |
| `trpc.expense.getMonthSummary` | Query `{ month, salaryDay }` | Monthly income, expense, and netFlow totals |
| `trpc.expense.getMonthlyStats` | Query `{ month, salaryDay, businessId }` | Full analytics breakdown (categories, trends, behavioral insights) |
| `trpc.expense.getMonthlyStats` (calendar) | Query `{ month, salaryDay: null, businessId }` | Calendar daily spend aggregation |
| `trpc.goals.list` | Query `undefined` | User financial goals list for welcome toast check |
| `trpc.profile.getSmartProfile` | Query `undefined` | User profile, fixed salary day, gamification streak |
| `trpc.profile.refreshInferences` | Mutation `{ month }` | Re-computes AI financial inferences for month |

---

### 1.3 Effects & Business Logic Workflows

1. **Web Share Target API Handler (lines 171–188):**
   - Detects `share_text`, `share_title`, or `share_url` from search params.
   - Populates `sharedText` to pre-fill the NLP input in `ExpenseForm`.
   - Cleans up URL search params with `{ replace: true }` and triggers sonner toast.

2. **Session Restoration & Default Active Financial Month (lines 422–458):**
   - Inspects `salaryDay` from `getSmartProfile`.
   - If current day of month is prior to `salaryDay`, defaults active month to the previous calendar month.
   - Sets `sessionStorage.getItem("dashboard_session_initialized")` to avoid overwriting deliberate user selections.

3. **Adjacent Months Prefetching (lines 460–477):**
   - Automatically prefetches `getMonthSummary` for `prevMonth` and `nextMonth`.
   - If `activeTab === "stats"` or `activeTab === "calendar"`, prefetches `getMonthlyStats` for adjacent months.

4. **Goals Engagement Toast (lines 352–381):**
   - Evaluates if user has 0 goals and account is $\ge 24$ hours old.
   - Sets a 4-second delayed toast encouraging the user to set a financial goal with smooth scroll to `#goals-panel-widget`.

5. **Double-Prompt Push Notification Trigger (lines 316–330):**
   - If `Notification.permission === "default"` and 7-day cooldown has passed, opens push permission modal after 8 seconds.

---

### 1.4 Rendered Subsections & Component Tree Breakdown

```
Home (Orchestrator)
├── OnboardingFlow (Existing component)
├── OnboardingCard (Existing component)
├── HomeHeader (NEW Submodule 1)
│   ├── Title (Personal vs Business mode)
│   ├── HealthBadge (Expense-to-income ratio indicator)
│   ├── BusinessModeToggle (Store vs User badge button)
│   ├── MonthNavigationPicker (Chevron buttons + type="month" input)
│   ├── StreakCounter (Gamification streak)
│   ├── Subtitle (Greeting with user name)
│   └── DesktopTabsList (Tabs list: "تسجيل", "إحصائيات", "تقويم")
├── HomeSummarySection (NEW Submodule 2)
│   ├── SummaryChip ("دخل الشهر" with tone="income")
│   └── SummaryChip ("مصروف الشهر" with tone="expense")
├── KeepAliveContainer
│   ├── RecordTabView (NEW Submodule 3)
│   │   ├── ExpenseForm (Existing component with sharedText & businessMode)
│   │   ├── RecentExpenses (Existing component)
│   │   ├── FinancialGoalsPanel (Lazy Suspense component, #goals-panel-widget)
│   │   └── ViewStatsQuickButton ("عرض الإحصائيات الكاملة")
│   ├── StatsTabView (NEW Submodule 4)
│   │   ├── StatsErrorFallback (Retry card)
│   │   └── StatsView (Subcomponent)
│   │       ├── KpiCardsRow (Daily average, % change vs prev month, top category, behavior tag)
│   │       ├── MainGrid
│   │       │   ├── LeftColumn
│   │       │   │   ├── ExpenseChart (Lazy Suspense component)
│   │       │   │   └── BehaviorInsights (Existing component)
│   │       │   └── RightSidebar
│   │       │       ├── GlobalSearch (Existing component)
│   │       │       ├── AutomatedBankTrackingCard (Auto SMS / sync spend)
│   │       │       └── TopCategoriesCard (Top 5 categories with progress bars)
│   └── CalendarTabView (NEW Submodule 5)
│       └── MonthlyCalendar (Lazy Suspense component)
└── PushNotificationPrompt (NEW Submodule 6)
    └── ReactPortal Modal (Benefits, enable push, dismiss with cooldown)
```

---

## 2. Interaction with Navigation, Swipe Gestures & Keyboard Shortcuts

### 2.1 Current Gesture Implementations

1. **`Home.tsx` Content Swipe Engine (lines 199–310):**
   - Listens to `touchstart`, `touchmove`, `touchend` on `containerRef.current`.
   - Excludes child interactive elements: `.no-swipe`, `.recharts-wrapper`, `INPUT`, `TEXTAREA`, `SELECT`, `[contenteditable]`.
   - Direction lock logic:
     - If $|dy| > |dx|$ and $|dy| > 10px$: cancels swipe, permits native vertical scroll.
     - If $|dx| > |dy|$ and $|dx| > 10px$: locks direction (`directionLocked = true`), cancels native vertical scroll via `e.preventDefault()`.
   - Swipe threshold: 75px.
   - RTL Tab Order: `["record", "stats", "calendar"]`.
     - In RTL (`document.dir === 'rtl'`):
       - Swipe Left ($\Delta X < 0$): Moves to Previous Tab (`currentIndex - 1`).
       - Swipe Right ($\Delta X > 0$): Moves to Next Tab (`currentIndex + 1`).
     - In LTR:
       - Swipe Left ($\Delta X < 0$): Moves to Next Tab (`currentIndex + 1`).
       - Swipe Right ($\Delta X > 0$): Moves to Previous Tab (`currentIndex - 1`).

2. **`MobileBottomNav.tsx` Drag/Touch Selection (lines 118–150):**
   - Horizontal drag across bottom nav bar to select tabs on the fly.
   - Computes target tab index from touch `clientX` relative to bounding rect and triggers haptic `lightTap()`.
   - RTL inversion: `tabIndex = isRtl ? (navTabs.length - 1 - slot) : slot`.
   - Keyboard avoidance: listens to document `focusin` / `focusout` to hide bottom nav when typing in form fields.

3. **`App.tsx` Edge Swipe Drawer (lines 157–190):**
   - RTL Edge swipe from right boundary (`touchStart.current > window.innerWidth - 44`) with `distance > 50px` opens sidebar.
   - Swipe right (`distance < -50px`) closes sidebar.

---

### 2.2 Unified Hook Specifications

#### 1. `useSwipeNavigation` (`src/hooks/useSwipeNavigation.ts`)

```typescript
export interface SwipeNavigationOptions {
  /** Target ref to attach touch listeners to (defaults to window if null) */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** Minimum distance in px required to register a swipe (default: 50) */
  threshold?: number;
  /** Callback fired on left swipe gesture */
  onSwipeLeft?: () => void;
  /** Callback fired on right swipe gesture */
  onSwipeRight?: () => void;
  /** Callback fired on up swipe gesture */
  onSwipeUp?: () => void;
  /** Callback fired on down swipe gesture */
  onSwipeDown?: () => void;
  /** RTL-aware callback fired when swiping forward (Next tab/item) */
  onSwipeNext?: () => void;
  /** RTL-aware callback fired when swiping backward (Previous tab/item) */
  onSwipePrev?: () => void;
  /** Whether document direction is RTL (defaults to auto-detecting document.dir === 'rtl') */
  isRtl?: boolean;
  /** Selectors or class names to ignore (e.g. '.no-swipe', 'input', '.recharts-wrapper') */
  excludeSelectors?: string[];
  /** Lock vertical scroll when horizontal swipe is active (default: true) */
  lockDirection?: boolean;
  /** If set, only triggers if touch starts within N px of the screen/container edge */
  edgeThreshold?: number;
  /** Edge position constraint: 'start' | 'end' | 'both' | 'none' */
  edgeSide?: 'start' | 'end' | 'both' | 'none';
  /** Enable/disable gesture listener */
  enabled?: boolean;
}
```

**Key Capabilities:**
- Handles both element-attached ref listeners and global container gestures.
- Clean non-passive touchmove event binding to enable `e.preventDefault()` only when horizontal direction is confirmed.
- Automatic element hierarchy traversal for exclusion tags (`.no-swipe`, charts, inputs, sliders).
- First-class support for RTL Arabic vs LTR next/prev semantic triggers.

---

#### 2. `useKeyboardNav` (`src/hooks/useKeyboardNav.ts`)

```typescript
export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  action: (e: KeyboardEvent) => void;
  description?: string;
}

export interface KeyboardNavOptions {
  /** Triggered on Escape key press */
  onEscape?: () => void;
  /** Triggered on ArrowLeft key press */
  onArrowLeft?: () => void;
  /** Triggered on ArrowRight key press */
  onArrowRight?: () => void;
  /** RTL-aware Next item on arrow key */
  onNext?: () => void;
  /** RTL-aware Previous item on arrow key */
  onPrev?: () => void;
  /** Additional custom shortcut mappings */
  shortcuts?: KeyboardShortcut[];
  /** Whether to ignore key events when target is an input/textarea/editable */
  ignoreInputs?: boolean;
  /** Enable/disable listener */
  enabled?: boolean;
  /** RTL orientation (defaults to auto-detecting document.dir === 'rtl') */
  isRtl?: boolean;
}
```

---

## 3. Detailed Submodule Decomposition Plan

### Submodule 1: `src/components/home/HomeHeader.tsx` (~130 lines)
- **Role:** Renders the responsive dashboard header, dynamic title, HealthBadge, business switch toggle, month stepper (for stats/calendar tabs), streak counter, and desktop tab bar.
- **Props Interface:**
  ```typescript
  export interface HomeHeaderProps {
    activeTab: HomeTab;
    month: string;
    pageTitle: string;
    hasBusiness: boolean;
    businessMode: boolean;
    businessName?: string;
    summaryRatio: number | null;
    streakCount: number;
    userName?: string;
    onToggleBusinessMode: () => void;
    onMonthChange: (month: string) => void;
    onTabChange: (tab: HomeTab) => void;
  }
  ```

---

### Submodule 2: `src/components/home/HomeSummarySection.tsx` (~65 lines)
- **Role:** Renders the high-level monthly income and expense SummaryChips with clean formatting and tone styling.
- **Props Interface:**
  ```typescript
  export interface HomeSummarySectionProps {
    totalIncome: number;
    totalExpense: number;
  }
  ```

---

### Submodule 3: `src/components/home/RecordTabView.tsx` (~90 lines)
- **Role:** Handles the primary transaction recording view (ExpenseForm + RecentExpenses + FinancialGoalsPanel widget + "عرض الإحصائيات الكاملة" jump button).
- **Props Interface:**
  ```typescript
  export interface RecordTabViewProps {
    isActive: boolean;
    sharedText: string;
    businessMode: boolean;
    businessId?: number;
    month: string;
    salaryDay?: number;
    onFormSuccess: () => void;
    onViewStats: () => void;
  }
  ```

---

### Submodule 4: `src/components/home/StatsTabView.tsx` (~290 lines)
- **Role:** Renders the comprehensive financial statistics view, KPI cards row, category breakdown chart (`ExpenseChart`), behavior insights, global search bar, automated bank sync totals, and top 5 categories progress list.
- **Props Interface:**
  ```typescript
  export interface StatsTabViewProps {
    isActive: boolean;
    month: string;
    stats: any;
    isLoading: boolean;
    isError: boolean;
    errorMessage?: string;
    onRetry: () => void;
    onRefreshInferences: () => void;
    isRefreshingInferences: boolean;
  }
  ```

---

### Submodule 5: `src/components/home/CalendarTabView.tsx` (~55 lines)
- **Role:** Renders the monthly spending calendar view with Suspense fallback and no-swipe container.
- **Props Interface:**
  ```typescript
  export interface CalendarTabViewProps {
    isActive: boolean;
    month: string;
    dayTrend: Array<{ date: string; amount: number; count: number }>;
    salaryDay?: number;
    isLoading: boolean;
  }
  ```

---

### Submodule 6: `src/components/home/PushNotificationPrompt.tsx` (~95 lines)
- **Role:** Renders the double-prompt push notification modal via React Portal with benefits explanation and enable/dismiss handlers.
- **Props Interface:**
  ```typescript
  export interface PushNotificationPromptProps {
    isOpen: boolean;
    onEnable: () => Promise<void>;
    onDismiss: () => void;
  }
  ```

---

### Custom State Hook: `src/components/home/useHomeDashboard.ts` (~160 lines)
- **Role:** Encapsulates all query bindings, URL search params synchronization, share text detection, business mode persistence, session restoration, adjacent month prefetching, and mutation handlers.
- **Return Interface:**
  ```typescript
  export interface UseHomeDashboardReturn {
    user: UnifiedUser | null;
    activeTab: HomeTab;
    month: string;
    sharedText: string;
    setSharedText: (val: string) => void;
    pageTitle: string;
    businessMode: boolean;
    hasBusiness: boolean;
    activeBusinessId?: number;
    businessName?: string;
    summary: any;
    summaryFetching: boolean;
    stats: any;
    statsFetching: boolean;
    statsError: boolean;
    statsQueryError: any;
    calendarStats: any;
    calendarFetching: boolean;
    goalsData: any;
    profile: any;
    salaryDay?: number;
    showPushPrompt: boolean;
    refreshingInferences: boolean;
    updateView: (tab: HomeTab, nextMonth?: string) => void;
    handleMonthChange: (value: string) => void;
    toggleBusinessMode: () => void;
    handleRefreshInferences: () => void;
    handleEnablePush: () => Promise<void>;
    handleDismissPush: () => void;
    handleFormSuccess: () => void;
    refetchStats: () => void;
  }
  ```

---

### Lean Orchestrator: `src/pages/Home.tsx` (~110 lines)
With the state hook and submodules extracted, `src/pages/Home.tsx` becomes a concise, ultra-readable orchestrator:

```tsx
export default function Home() {
  const dashboard = useHomeDashboard();
  const containerRef = useRef<HTMLDivElement>(null);

  const tabOrder: HomeTab[] = ["record", "stats", "calendar"];
  const currentTabIdx = tabOrder.indexOf(dashboard.activeTab);

  useSwipeNavigation({
    targetRef: containerRef,
    threshold: 75,
    lockDirection: true,
    excludeSelectors: [".no-swipe", ".recharts-wrapper", "input", "textarea", "select", "[contenteditable='true']"],
    onSwipeNext: () => {
      if (currentTabIdx < tabOrder.length - 1) {
        dashboard.updateView(tabOrder[currentTabIdx + 1]);
      }
    },
    onSwipePrev: () => {
      if (currentTabIdx > 0) {
        dashboard.updateView(tabOrder[currentTabIdx - 1]);
      }
    },
  });

  return (
    <div ref={containerRef} className="min-h-full bg-slate-50/70 dark:bg-slate-950/40">
      <OnboardingFlow />
      <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-3 sm:space-y-4">
        <OnboardingCard />
        <HomeHeader {...dashboard.headerProps} />
        <HomeSummarySection totalIncome={dashboard.summary?.totalIncome ?? 0} totalExpense={dashboard.summary?.totalExpense ?? 0} />
        <div className="relative">
          <RecordTabView {...dashboard.recordTabProps} />
          <StatsTabView {...dashboard.statsTabProps} />
          <CalendarTabView {...dashboard.calendarTabProps} />
        </div>
      </div>
      <PushNotificationPrompt {...dashboard.pushPromptProps} />
    </div>
  );
}
```

---

## 4. Preservation & Non-Regression Analysis

1. **RTL Semantics & Directional Math:**
   - Swipe gestures in RTL flip horizontal delta mapping: swiping left ($\Delta X < 0$) in Arabic corresponds to moving backwards (previous tab), and swiping right ($\Delta X > 0$) moves forward (next tab).
   - Month navigation buttons: `ChevronRight` corresponds to Previous Month in RTL, and `ChevronLeft` corresponds to Next Month.

2. **Dual Authentication (`UnifiedUser`):**
   - Works seamlessly for both Google OAuth and Local OTP sessions without assumptions about table types.
   - User creation date check for goal toast uses `user?.createdAt`.

3. **Performance & Caching:**
   - Tab switching uses the **Keep-Alive** pattern (`hidden opacity-0` vs `block opacity-100`) rather than unmounting views, preserving input states and chart animations.
   - Adjacent month prefetching (`prevMonth` & `nextMonth`) remains intact in `useHomeDashboard`.
   - Direct rAF rendering and touch exclusion guards eliminate scroll jank on low-end mobile devices.
