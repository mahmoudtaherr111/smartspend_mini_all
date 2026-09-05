# Scope: Milestone 4 — GPU Compositing Optimization, Haptics & Performance Hardening

## Objective
Optimize rendering pipeline for 60–120fps locked fluidity:
1. Eliminate heavy `backdrop-filter: blur(24px)` from scrolling list items in `src/components/ui/card.tsx` (apply `contain-paint` and GPU-friendly translucent/solid background styling) and `3d-effects.css`.
2. Implement instant button active press physics (0–40ms press, spring release) and scroll cancellation (`touch-action: pan-y`) in `src/index.css` and `src/3d-effects.css`.
3. Expand `useHaptics.ts` multi-tier micro-haptics engine (`selection`, `heavyTap`, `warning`) and wire into `Switch`, `TabsTrigger`, `Slider`, `ToggleGroup`, `Drawer` snap detents, and swipe-to-delete live threshold crossing in `RecentExpenses.tsx`.
4. Fix viewport stability and pinch-to-zoom prevention in `index.html` (`user-scalable=no, maximum-scale=1.0`) and suppress Safari multi-touch gestures in `src/main.tsx`.
5. Eliminate FOUT by coordinating `dismissAppLoader()` with `document.fonts.ready` in `src/pwa/register-sw.ts`.
6. Fix Arabic Cairo font bounding-box clipping (`leading-none`, `overflow-hidden`, tight padding) across `DialogTitle`, `CardTitle`, `Label`, `Badge`, and `TabsTrigger`.
7. Configure Capacitor native plugins & lifecycle: Add root `capacitor.config.ts`, `src/hooks/useNativeThemeSync.ts`, and unified `src/hooks/useVirtualKeyboard.ts`.

## Working Directory
`e:/smartspend_V1_fixed/.agents/sub_orch_m4`

## Inputs & Context
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`
- Survey reports:
  - `e:/smartspend_V1_fixed/.agents/explorer_survey_1/report.md` (Sections 3.2, 3.3, 4, 5)
  - `e:/smartspend_V1_fixed/.agents/explorer_survey_3/report.md` (Sections 1, 2, 3)

## Owned Files & Scope
- `src/components/ui/card.tsx`, `src/components/ui/button.tsx`, `src/components/ui/switch.tsx`, `src/components/ui/tabs.tsx`, `src/components/ui/slider.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/label.tsx`.
- `src/hooks/useHaptics.ts` & `src/hooks/useHaptics.test.ts`.
- `src/hooks/useNativeThemeSync.ts` & `src/hooks/useVirtualKeyboard.ts`.
- `src/pwa/register-sw.ts`, `src/main.tsx`, `index.html`.
- `src/3d-effects.css`, `src/index.css`.
- `capacitor.config.ts` (root config).

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification Requirements
1. Run `npm run check` to verify 0 type errors.
2. Run `npm run test` and update/add unit tests for `useHaptics`, `useVirtualKeyboard`, and UI components.
3. Produce handoff report at `e:/smartspend_V1_fixed/.agents/sub_orch_m4/handoff.md`.
