## 2026-08-25T09:11:33Z
You are teamwork_preview_test_writer_e2e.
Your working directory is: E:\smartspend_V1_fixed\.agents\teamwork_preview_test_writer_e2e

MANDATORY: Read E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md before starting your work.
Read E:\smartspend_V1_fixed\PROJECT.md and E:\smartspend_V1_fixed\TEST_INFRA.md for architecture and test tier methodology.
Read the survey report: E:\smartspend_V1_fixed\.agents\teamwork_preview_explorer_survey_3\survey_tabs_testing.md
Read AGENTS.md in the workspace root.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Objective: Implement the E2E Mobile Testing Infrastructure and Test Suites (Requirement R4).

Your Exclusive File Ownership:
- `playwright.config.ts`
- `tests/e2e/**` (and any new E2E test files)
- `tests/fixtures/**`
- `vitest.config.ts`
- `TEST_READY.md` (at project root)

Concrete Tasks to Implement:
1. Playwright Setup:
   - Create `playwright.config.ts` supporting 4 mobile/tablet device viewports:
     - `iPhone 16 Pro` (393 × 852, touch=true, DPR=3, iOS Safari userAgent)
     - `iPhone 14` (390 × 844, touch=true, DPR=3, iOS Safari userAgent)
     - `Android Chrome Pixel 7` (412 × 915, touch=true, DPR=2.6, Android Chrome userAgent)
     - `iPad Air Tablet` (820 × 1180, touch=true, DPR=2, iPad Safari userAgent)
   - Configure local webServer if needed or headless execution parameters against the local dev environment with `color-scheme: dark` and `locale: 'ar-EG'`.
2. Author Comprehensive Tier 1 - Tier 4 E2E Test Suites in `tests/e2e/`:
   - `tests/e2e/pwa-shell-viewport.spec.ts`: Edge-to-edge full-bleed, viewport-fit=cover, safe area insets, no clipping, mesh background.
   - `tests/e2e/liquid-glass-navigation.spec.ts`: Floating capsule presence, backdrop blur/rim styling, 5-tab touch-drag gestures, bounding rect tracking, haptic pulse firing.
   - `tests/e2e/instant-tab-switching.spec.ts`: 0ms warm view pre-rendering, no skeleton reload flickers, persistent form/scroll state, React Query caching.
   - `tests/e2e/mobile-customer-journeys.spec.ts`: Multi-viewport end-to-end flows, AICenter voice trigger & chat input accessibility, monthly calendar ledger, 0 console error trapping.
3. Vitest Config Integration:
   - Update `vitest.config.ts` to include `tests/**/*.test.ts` so `tests/adversarial-challenger-2.test.ts` and all unit test suites run seamlessly.
4. Author `TEST_READY.md` at project root `E:\smartspend_V1_fixed\TEST_READY.md` with the complete coverage matrix and test runner commands.
5. Verification:
   - Run `npm run check` (`tsc -b`).
   - Run `npm run test` (`vitest run`).
   - Write your handoff report to: `E:\smartspend_V1_fixed\.agents\teamwork_preview_test_writer_e2e\handoff.md`.
   - Send a message to parent when complete.
