# Handoff Report: Explorer 1 (Home & Layout Explorer)

## 1. Observation

### Codebase Inspections
1. **`src/pages/Home.tsx`:**
   - Exact line count: **1,150 lines** (`file:///E:/smartspend_V1_fixed/src/pages/Home.tsx`).
   - Contains:
     - 4 inlined React components: `Home` (lines 152–852), `HealthBadge` (lines 86–92), `SummaryChip` (lines 94–129), `StatsView` (lines 854–1149).
     - 5 query subscriptions: `trpc.goals.list` (line 348), `trpc.profile.getSmartProfile` (line 393), `trpc.business.get` (line 400), `trpc.expense.getMonthSummary` (line 479), `trpc.expense.getMonthlyStats` (lines 484 & 494).
     - 1 mutation: `trpc.profile.refreshInferences` (line 499).
     - 7 distinct `useEffect` blocks handling Web Share Target API (line 171), raw container touch/swipe event bindings (line 199), push notification prompt timer (line 316), goals engagement toast (line 352), URL search params sync (line 383), business mode localStorage restoration (line 404), session salaryDay initialization (line 422), and adjacent month prefetching (line 461).
     - Dead/Unused imports: `ReceiptCapture` (line 50), `AIInsights` (line 48), `PlanUsageStrip` (line 62), `Brain` (line 38), `ReceiptText` (line 22).

2. **`src/components/layout/MobileBottomNav.tsx`:**
   - Exact line count: **250 lines** (`file:///E:/smartspend_V1_fixed/src/components/layout/MobileBottomNav.tsx`).
   - Implements horizontal drag touch selection with haptics (`lightTap`) and RTL-inversion calculation (lines 87–102).
   - Implements document `focusin` / `focusout` keyboard avoidance listeners (lines 48–72).

3. **`src/App.tsx`:**
   - Lines 157–190: Implements edge-swipe drawer listener on `.app-shell` with RTL logic (`touchStart.current > window.innerWidth - 44`) opening sidebar on left swipe.
   - Lines 131–155: Implements duplicate `focusin` / `focusout` keyboard avoidance listeners.

4. **Baseline Health Verification:**
   - `npm run check` (TypeScript compiler) passed cleanly with **0 errors** (`task-55`).
   - `npm run test` ran 82 test files (76 passing, 5 backend integration tests requiring live MySQL).

---

## 2. Logic Chain

1. **Monolith Deconstruction:**
   - Observation: `Home.tsx` is 1,150 lines, blending layout, navigation, data fetching, push notifications, onboarding, and stats analytics.
   - Deduction: Extracting the 6 domain subcomponents (`HomeHeader`, `HomeSummarySection`, `RecordTabView`, `StatsTabView`, `CalendarTabView`, `PushNotificationPrompt`) and 1 custom state hook (`useHomeDashboard`) isolates state management and ensures no single file exceeds 300 lines, reducing `Home.tsx` to <150 lines.

2. **Gesture & Navigation Extraction:**
   - Observation: `Home.tsx` manually attaches touch event listeners to `containerRef` with directional locking and RTL-aware branch conditions.
   - Observation: `MobileBottomNav.tsx` and `App.tsx` implement independent touch and keyboard avoidance listeners.
   - Deduction: Building `src/hooks/useSwipeNavigation.ts` and `src/hooks/useKeyboardNav.ts` consolidates touch locking, exclusion traversal (`.no-swipe`, `INPUT`, `.recharts-wrapper`), and RTL delta arithmetic into single-source-of-truth hooks.

3. **Keep-Alive Tab Preservation:**
   - Observation: `Home.tsx` uses `hidden opacity-0` vs `block opacity-100` rather than unmounting non-active tabs.
   - Deduction: Keeping this exact pattern in `RecordTabView`, `StatsTabView`, and `CalendarTabView` ensures zero state loss in input fields and prevents unnecessary chart re-renders.

---

## 3. Caveats

1. **No Backend or Database Alterations Required:** All changes for R1 and R4 are strictly localized to frontend components (`src/pages/Home.tsx`, `src/components/home/`, `src/hooks/`).
2. **Push Notification Portal:** `PushNotificationPrompt` uses `createPortal(..., document.body)`. The portal destination must be verified when mounted in test environments.
3. **Touch Exclusion Elements:** Ensure all third-party interactive elements (Recharts tooltips, sliders, date pickers) continue to receive the `.no-swipe` class or match exclusion selectors to avoid accidental tab navigation while dragging charts.

---

## 4. Conclusion

- `src/pages/Home.tsx` can be cleanly decomposed into:
  - `src/pages/Home.tsx` (Orchestrator: ~120 lines)
  - `src/components/home/useHomeDashboard.ts` (State hook: ~160 lines)
  - `src/components/home/HomeHeader.tsx` (Header submodule: ~130 lines)
  - `src/components/home/HomeSummarySection.tsx` (Summary chips submodule: ~65 lines)
  - `src/components/home/RecordTabView.tsx` (Transaction entry tab: ~90 lines)
  - `src/components/home/StatsTabView.tsx` (Analytics & KPI tab: ~290 lines)
  - `src/components/home/CalendarTabView.tsx` (Calendar view tab: ~55 lines)
  - `src/components/home/PushNotificationPrompt.tsx` (Push prompt modal: ~95 lines)
- Shared hooks to extract:
  - `src/hooks/useSwipeNavigation.ts` (~120 lines)
  - `src/hooks/useKeyboardNav.ts` (~80 lines)
- All target subcomponents strictly conform to the $<350$ lines constraint, with `Home.tsx` $<250$ lines.

---

## 5. Verification Method

To verify the implementation once executed:
1. **Type Safety:**
   ```bash
   npm run check
   ```
   Must pass with 0 TypeScript compiler errors.

2. **File Size & Modular Architecture Verification:**
   Inspect line counts of `src/pages/Home.tsx` and all files under `src/components/home/` and `src/hooks/`:
   ```bash
   Get-Content src/pages/Home.tsx | Measure-Object -Line
   Get-ChildItem src/components/home/*.tsx, src/components/home/*.ts | ForEach-Object { "$($_.Name): $((Get-Content $_.FullName | Measure-Object -Line).Lines) lines" }
   ```
   Ensure `Home.tsx` has $<250$ lines and each submodule has $\le 350$ lines.

3. **Behavioral & RTL Swipe Tests:**
   - Navigate to `/dashboard?tab=record`.
   - Swiping left in RTL moves to `/dashboard?tab=stats` $\rightarrow$ `/dashboard?tab=calendar`.
   - Swiping right in RTL moves backwards towards `record`.
   - Touch gestures inside `Recharts` and `FinancialGoalsPanel` are ignored by swipe engine.
