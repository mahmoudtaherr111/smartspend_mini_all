# Scope: Milestone 2 — Continuous 1:1 Interactive Tab Pager with Gesture Isolation

## Objective
Implement `InteractiveTabPager` with `embla-carousel-react` delivering authentic 1:1 finger tracking, momentum scrolling, boundary rubber-band resistance, and spring physics. Configure strict RTL alignment (`direction: "rtl"`), bidirectional synchronization with `HomeHeader` and `MobileBottomNav`, and robust pointer capture / gesture isolation (`watchDrag` filter for `.no-swipe`, `.recharts-wrapper`, `input`, `textarea`, `select`, `[data-no-swipe]`, and swipe-to-delete cards).

## Working Directory
`e:/smartspend_V1_fixed/.agents/sub_orch_m2`

## Inputs & Context
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`
- Survey report: `e:/smartspend_V1_fixed/.agents/explorer_survey_1/report.md` (Sections 3.1 & 5.2)
- Existing tab setup in `src/pages/Home.tsx` and `src/hooks/useSwipeNavigation.ts`

## Owned Files & Scope
- Create `src/components/dashboard/InteractiveTabPager.tsx` with Embla Carousel (RTL, 1:1 drag, spring duration, momentum, `watchDrag` nested isolation).
- Update `src/pages/Home.tsx` to replace discrete `hidden/block` opacity containers with `<InteractiveTabPager>`.
- Ensure bidirectional sync between URL query param (`?tab=record|stats|calendar`), `HomeHeader.tsx`, and `MobileBottomNav.tsx`.
- Add `.no-swipe` and `data-no-swipe` tags to nested interactive elements in `ExpenseChart.tsx`, `MonthlyCalendar.tsx`, sliders, and expense swipe-to-delete cards so horizontal gestures inside them do not accidentally trigger tab switching.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification Requirements
1. Run `npm run check` to verify 0 type errors.
2. Run `npm run test` and write component tests for `InteractiveTabPager` (`src/components/dashboard/InteractiveTabPager.test.tsx`).
3. Produce handoff report at `e:/smartspend_V1_fixed/.agents/sub_orch_m2/handoff.md`.
