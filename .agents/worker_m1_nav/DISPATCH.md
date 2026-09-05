## 2026-08-26T10:49:42Z
You are Worker 1 (Navigation Hooks Worker) implementing Milestone 1 of the SmartSpend AI frontend refactoring.
Your working directory for metadata is: E:\smartspend_V1_fixed\.agents\worker_m1_nav\
Path to user request: E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md
Path to project specifications: E:\smartspend_V1_fixed\PROJECT.md

You MUST read E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md, E:\smartspend_V1_fixed\PROJECT.md, and AGENTS.md before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Mission:
Implement the unified gesture and keyboard navigation hooks in `src/hooks/`:
1. `src/hooks/useSwipeNavigation.ts` (< 170 lines):
   - Support `targetRef` (attached to DOM element) or global window fallback.
   - Robust touch listeners (`touchstart`, `touchmove`, `touchend`, `touchcancel`).
   - Non-passive `touchmove` binding to permit `e.preventDefault()` when directional horizontal lock is engaged (`absX > absY && absX > 10`).
   - Release swipe and allow vertical scroll when `absY > absX && absY > 10`.
   - Exclusion selectors check (`.no-swipe`, `.recharts-wrapper`, `input`, `textarea`, `select`, `[contenteditable='true']`).
   - Swipe threshold (default 50px/75px).
   - Support `onSwipeLeft`, `onSwipeRight`, `onSwipeUp`, `onSwipeDown`.
   - Support RTL-aware `onSwipeNext` and `onSwipePrev`:
     - In RTL (`document.dir === 'rtl'` or `isRtl: true`): Swipe Right ($\Delta X > 0$) triggers `onSwipeNext`, Swipe Left ($\Delta X < 0$) triggers `onSwipePrev`.
     - In LTR: Swipe Left ($\Delta X < 0$) triggers `onSwipeNext`, Swipe Right ($\Delta X > 0$) triggers `onSwipePrev`.
   - Clean event listener unmounting and cleanup on re-renders / unmount.

2. `src/hooks/useKeyboardNav.ts` (< 120 lines):
   - Keydown listener on `window` (or target).
   - Options: `onEscape`, `onArrowLeft`, `onArrowRight`, `onNext`, `onPrev`, `shortcuts`.
   - RTL awareness: In RTL, ArrowRight triggers `onPrev` / leftward action, ArrowLeft triggers `onNext` / rightward action.
   - Input suppression: ignore key events when `event.target` is an `INPUT`, `TEXTAREA`, `SELECT`, or `isContentEditable`.
   - Clean listener cleanup on unmount.

3. Unit Tests:
   - Create comprehensive Vitest tests in `src/hooks/useSwipeNavigation.test.ts` and `src/hooks/useKeyboardNav.test.ts` to test RTL/LTR handling, touch-lock mechanics, cleanup, and keyboard shortcuts.
   - Run `npm run check` and `npm run test` to verify zero TS errors and all tests passing.

Write your report to `E:\smartspend_V1_fixed\.agents\worker_m1_nav\handoff.md` and report back when finished.
