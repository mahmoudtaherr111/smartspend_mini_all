# Dispatch — Worker M1 Replacement: Shell, Lifecycle & Typography Foundations

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Context & References
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/capacitor.config.ts` (already created)
- `e:/smartspend_V1_fixed/src/lib/back-button-manager.ts` (already created)
- `e:/smartspend_V1_fixed/src/hooks/useNativeThemeSync.ts` (already created)
- `e:/smartspend_V1_fixed/src/hooks/useVirtualKeyboard.ts` (already created)

## Your Tasks to Complete Milestone 1:
1. **Wire hooks and lifecycle in `src/App.tsx`**:
   - Call `useNativeThemeSync()`
   - Call `useVirtualKeyboard()`
   - Call `initBackButtonListener()` inside an initial `useEffect`
   - In `src/pwa/register-sw.ts` and/or `src/App.tsx`, coordinate `SplashScreen.hide()` with `document.fonts.ready` to eliminate FOUT.
2. **Update `index.html`**:
   - Update viewport meta tag to `width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual`
   - Add inline script or event listeners for `gesturestart`, `gesturechange`, `gestureend` to prevent pinch-to-zoom on iOS Safari.
3. **Fix Cairo Arabic font glyph bounding-box clipping**:
   - In `src/index.css` and UI primitives (`src/components/ui/dialog.tsx`, `src/components/ui/card.tsx`, `src/components/ui/label.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/tabs.tsx`), ensure font `line-height` uses `leading-normal` or `leading-snug` instead of `leading-none` and remove tight `overflow-hidden` on inline badge/title text containers that clip Arabic ascenders/descenders.
4. **Verification**:
   - Run `npm run check` (TypeScript type check) to verify 0 errors.
   - Run `npm run test` (Vitest test suite) to verify all tests pass.
5. **Report**:
   - Write your handoff to `e:/smartspend_V1_fixed/.agents/worker_m1_replacement/handoff.md` and send a message back with the full verification results and command outputs.
