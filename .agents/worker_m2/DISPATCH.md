# Dispatch — Worker Milestone 2: Micro-Haptics Engine & Touch Physics

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Context & References
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/.agents/explorer_survey_1/report.md`
- `e:/smartspend_V1_fixed/src/hooks/useHaptics.ts`

## Your Exclusive File Ownership for Milestone 2:
- `src/hooks/useHaptics.ts` & `src/hooks/useHaptics.test.ts`
- `src/index.css` & `src/3d-effects.css` (button active physics, 0-40ms down, 250ms spring up, scroll cancellation)
- `src/components/ui/button.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/slider.tsx`
- `src/components/ui/toggle.tsx` & `src/components/ui/toggle-group.tsx`
- `src/components/pwa/PullToRefreshWrapper.tsx`
- `src/components/expenses/RecentExpenses.tsx` (real-time 60px swipe threshold crossing haptic tick)

## Tasks:
1. **Expand `useHaptics.ts`**:
   - Implement all 7 tiers: `selection()`, `lightTap()`, `mediumTap()`, `heavyTap()`, `success()`, `warning()`, `error()`.
   - Implement selection session methods: `selectionStart()`, `selectionChanged()`, `selectionEnd()`.
   - Support Capacitor native Haptics (`ImpactStyle.Light/Medium/Heavy`, `NotificationType.Success/Warning/Error`, `selectionStart/Changed/End`), `navigator.vibrate` web fallback, and silent fallback on unsupported environments without throwing errors.
   - Author comprehensive unit tests in `src/hooks/useHaptics.test.ts`.
2. **Instant 0ms Button Active Physics**:
   - In `src/index.css` and `src/3d-effects.css`, refine `.active-press` and `.btn-press` with asymmetric transitions (instant active scale `0.96` with `0.04s ease-out` and release recovery `0.25s cubic-bezier(0.34, 1.56, 0.64, 1)`).
   - In `src/components/ui/button.tsx`, ensure active state responds immediately and cancels cleanly upon scroll without sticky delay.
3. **Pervasive Haptic Tactile Wiring**:
   - Wire `selection()` into `Switch` component on toggle change.
   - Wire `selection()` into `TabsTrigger` component on click.
   - Wire `selection()` into `Slider` component on value changes.
   - Wire `selection()` into `Toggle` and `ToggleGroup` items.
   - Wire `mediumTap()` into `PullToRefreshWrapper.tsx` when trigger threshold is reached.
   - Wire real-time `lightTap()` into `RecentExpenses.tsx` when the finger crosses the swipe-to-delete threshold (60px) during dragging, and `heavyTap()` on delete confirmation.
4. **Verification**:
   - Run `npm run check` (0 errors).
   - Run `npm run test` (all test suites pass).
   - Write `handoff.md` in `e:/smartspend_V1_fixed/.agents/worker_m2/handoff.md`.
