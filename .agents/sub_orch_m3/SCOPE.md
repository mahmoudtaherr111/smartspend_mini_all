# Scope: Milestone 3 — Directional Spatial Transitions & Tab State Keep-Alive

## Objective
Implement direction-aware hardware-accelerated spatial route transitions in `PageTransition.tsx` (RTL slide-in from left on forward navigation, slide-out on back, with backdrop parallax), per-route scroll offset restoration across bottom nav switches in `<main ref={scrollRef}>`, and offscreen keep-alive memory for intensive views (AICenter Chat, Voice, Report tabs and Settings sub-views) to prevent component unmounting, chat scroll loss, and voice connection destruction.

## Working Directory
`e:/smartspend_V1_fixed/.agents/sub_orch_m3`

## Inputs & Context
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`
- Survey report: `e:/smartspend_V1_fixed/.agents/explorer_survey_2/report.md` (Sections 4.1 & 6)
- Existing components: `src/components/layout/PageTransition.tsx`, `src/App.tsx`, `src/pages/AICenter.tsx`, `src/pages/Settings.tsx`

## Owned Files & Scope
- Create `src/hooks/useNavigationDirection.ts` (determines hierarchy depth and PUSH/POP direction in RTL).
- Create `src/hooks/useScrollRestoration.ts` (caches and restores scrollTop keyed by route pathname/search).
- Update `src/components/layout/PageTransition.tsx` to apply hardware-accelerated RTL slide variants with Framer Motion (`popLayout`, GPU `translate3d`, `will-change: transform`, spring dynamics).
- Wire `useScrollRestoration` to `<main ref={scrollRef}>` in `src/App.tsx`.
- Refactor `src/pages/AICenter.tsx` to preserve offscreen tab views (`AIChatbot`, `AIVoiceCall`, `AIMonthlyReport`) so switching tabs does not destroy in-progress sessions, chat message history, voice streams, or scroll position.
- Refactor sub-views in `src/pages/Settings.tsx` to support spatial slide transitions and state retention.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification Requirements
1. Run `npm run check` to verify 0 type errors.
2. Run `npm run test` and write unit tests for `useNavigationDirection` and `useScrollRestoration` (`src/hooks/useNavigationDirection.test.ts`, `src/hooks/useScrollRestoration.test.ts`).
3. Produce handoff report at `e:/smartspend_V1_fixed/.agents/sub_orch_m3/handoff.md`.
