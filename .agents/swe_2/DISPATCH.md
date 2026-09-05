## 2026-08-26T09:47:14Z

You are the SWE Light Orchestrator (`teamwork_preview_swe`).

Your working directory is: `E:\smartspend_V1_fixed\.agents\swe_2`
Project workspace directory: `E:\smartspend_V1_fixed`
Original user request file: `E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md`

## Mission
Eliminate intrusive full-screen visual flash overlays on iOS Web/PWA in `useHaptics.ts`, ensuring silent degradation when native vibration APIs are unavailable while preserving Capacitor native Taptic Engine haptics and Android web vibrations.

## Requirements
### R1. Remove Full-Screen Visual Flash Fallbacks in useHaptics
Eliminate `triggerVisualFallback` and all DOM overlay injection logic (`useHaptics.ts:25-59`). On platforms where vibration is not supported (such as iOS Safari and iOS PWA without Capacitor wrapper), haptic calls must silently degrade as no-ops without modifying the DOM, triggering reflows, or flashing the screen.

### R2. Preserve Native & Supported Platform Feedback
Ensure native Capacitor haptic feedback (`@capacitor/haptics`) continues to trigger native Taptic Engine vibrations on native iOS/Android builds, and `navigator.vibrate` continues to trigger hardware vibration on supported Android Web browsers.

### R3. Audit and Standardize Localized Micro-Interactions
Verify that interactive elements (`HapticButton`, `MobileBottomNav`, bottom sheet controls, expense actions) rely on localized CSS/Tailwind active states (`active:scale-[0.98]`, subtle opacity/color shifts) for visual responsiveness rather than global window overlays.

## Acceptance Criteria
### iOS PWA / Web Interaction Stability
- [ ] No DOM overlay elements (`position: fixed`, `100vw/100vh`, `zIndex: 9999`) are created, appended, or animated during any `lightTap`, `mediumTap`, `success`, or `error` call.
- [ ] No synchronous layout reflows (`void element.offsetWidth`) occur on user tap or bottom nav swipe gestures.
- [ ] Tapping buttons, dragging bottom nav tabs, or pulling to refresh on iOS Web/PWA produces smooth 60/120fps UI responses with zero viewport flickering.

### Native & Android Integrity
- [ ] Capacitor native platform calls (`Capacitor.isNativePlatform()`) correctly dispatch to `@capacitor/haptics`.
- [ ] Android Web browsers with `"vibrate" in navigator` execute hardware vibration smoothly without errors.
- [ ] Type check `npm run check` passes with zero TypeScript errors.
- [ ] All unit tests pass cleanly via `npm run test`.

## Operational Rules & Protocol
- Read `AGENTS.md` before executing any edits.
- Maintain `plan.md`, `progress.md`, and `BRIEFING.md` in `E:\smartspend_V1_fixed\.agents\swe_2`.
- Run the SWE Light loop: dispatch the implementer, conduct adversarial review rounds, verify with tests & builds.
- When done, write `handoff.md` in your working directory and notify the sentinel with your completion report.
