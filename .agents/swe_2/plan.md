# Orchestration Plan: iOS Haptic Feedback Cleanup (SWE Light)

## Objective
Eliminate intrusive full-screen visual flash overlays on iOS Web/PWA in `useHaptics.ts`, ensuring silent degradation when native vibration APIs are unavailable while preserving Capacitor native Taptic Engine haptics and Android web vibrations.

## Phases
1. **Implementation Phase**:
   - Dispatch `teamwork_preview_implementer` with verbatim user request.
   - Implementer removes `triggerVisualFallback` and DOM overlay injection logic in `useHaptics.ts`.
   - Implementer preserves Capacitor native platform calls and Android `navigator.vibrate`.
   - Implementer audits localized micro-interactions (`HapticButton`, `MobileBottomNav`, etc.).
   - Implementer writes tests / updates unit tests and verifies `npm run check` and `npm run test`.
2. **Review Round 1 (Adversarial)**:
   - Dispatch `teamwork_preview_reviewer` (Round 1) with verbatim task and implementer report.
   - Reviewer attempts to break diff, checks for edge cases, verifies silent degradation, tests.
3. **Review Round 2 (Adversarial)**:
   - Dispatch `teamwork_preview_reviewer` (Round 2) with verbatim task and Reviewer 1 report.
   - Reviewer verifies zero regressions, complete cleanup of unused styles/keyframes, tests.
4. **Review Round 3 (Adversarial)**:
   - Dispatch `teamwork_preview_reviewer` (Round 3) with verbatim task and Reviewer 2 report.
   - Final adversarial review pass, stress-testing all ACs.
5. **Victory Audit**:
   - Dispatch `teamwork_preview_victory_auditor` for blocking verification.
6. **Handoff & Reporting**:
   - Write `handoff.md` and report completion to parent.
