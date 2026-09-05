# Scope: E2E Testing Track — Opaque-Box Mobile Fidelity Verification

## Objective
Design, implement, and verify comprehensive automated tests covering all 4 tiers of mobile fidelity requirements without coupling to internal implementation trivia:
- Tier 1: Feature Coverage (AdaptiveDialog, InteractiveTabPager, useNavigationDirection, useScrollRestoration, useHaptics, backButtonManager).
- Tier 2: Boundary & Corner Cases (zero displacement drag, rapid multi-tab clicks, nested sheet stacks, missing Capacitor native bridge fallback, empty routes, viewport resizing).
- Tier 3: Cross-Feature Combinations (opening sheet while dragging pager, back button dismissing sheet without triggering route slide, haptics firing on detent snap).
- Tier 4: Real-World Workload Scenarios (navigating Home tabs -> tapping expense to open sheet -> editing -> closing -> navigating to AICenter -> switching tabs -> returning to Home with scroll offset retained).

## Working Directory
`e:/smartspend_V1_fixed/.agents/e2e_test_writer`

## Inputs & Context
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/TEST_INFRA.md`
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`

## Owned Files & Scope
- `tests/unit/mobile-adaptive-dialog.test.tsx`
- `tests/unit/mobile-tab-pager.test.tsx`
- `tests/unit/mobile-spatial-transitions.test.tsx`
- `tests/unit/mobile-haptics-engine.test.ts`
- `tests/unit/mobile-back-button.test.ts`
- `tests/e2e/mobile-fidelity.spec.ts` (Playwright mobile suite)
- Publishes `TEST_READY.md` upon completion.

## Verification Requirements
1. Run `npm run check` to verify 0 type errors.
2. Run `npm run test` on all mobile test suites.
3. Write `e:/smartspend_V1_fixed/TEST_READY.md` with full coverage summary table.
4. Produce handoff report at `e:/smartspend_V1_fixed/.agents/e2e_test_writer/handoff.md`.
