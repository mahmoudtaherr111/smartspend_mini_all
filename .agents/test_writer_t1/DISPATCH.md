## 2026-08-26T02:06:30Z
You are the E2E Test Writer for the SmartSpend AI Mobile Dashboard & AI Recording Input Re-architecture project.
Your working directory is: E:\smartspend_V1_fixed\.agents\test_writer_t1

## Scope & Instructions:
1. Read E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md, E:\smartspend_V1_fixed\PROJECT.md, E:\smartspend_V1_fixed\TEST_INFRA.md, and E:\smartspend_V1_fixed\AGENTS.md.
2. Review the findings in E:\smartspend_V1_fixed\.agents\explorer_survey_3\report.md and `tests/fixtures/mobile-fixtures.ts`.
3. Create `tests/e2e/mobile-dashboard-ai-recording.spec.ts` implementing multi-viewport autonomous mobile audit tests for both `"iPhone 14"` (390x844) and `"Android Chrome Pixel 7"` (412x915):
   - Tier 1: Feature Coverage (Banner collapse/expand with `✨ تسجيل ذكي` badge, dynamic recording waveform pill, title bar streak counter, compact summary chips, elevated textarea & action buttons).
   - Tier 2: Boundary & Corner Cases (Very long Arabic business titles, quick toggle collapse/expand without layout jitter, zero recording duration vs active duration, empty textarea vs rich placeholder).
   - Tier 3: Cross-Feature Combinations (Recording active while banner is collapsed, theme toggle dark/light mode preservation, viewport resize / orientation robustness).
   - Tier 4: Real-World Scenarios (Audit for 0 layout shifts via PerformanceObserver CLS < 0.05, 0 console errors/pageerrors, 0 horizontal clipping, and `RecentExpenses` cards visible above the fold on both 390x844 and 412x915).
4. Run/verify your test file or type-check via `npm run check` to ensure zero compilation or syntax errors.
5. Create `E:\smartspend_V1_fixed\TEST_READY.md` summarizing the test runner command and coverage.
6. Write a complete handoff report to `E:\smartspend_V1_fixed\.agents\test_writer_t1\handoff.md` and send a message to the orchestrator.
