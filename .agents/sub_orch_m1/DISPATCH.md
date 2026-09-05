## 2026-08-30T12:40:23Z
You are the implementation worker for Milestone 1: Universal Polymorphic AdaptiveDialog & Bottom Sheet Architecture.
Your working directory is: e:/smartspend_V1_fixed/.agents/sub_orch_m1
Please read:
- e:/smartspend_V1_fixed/.agents/sub_orch_m1/SCOPE.md
- e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md
- e:/smartspend_V1_fixed/PROJECT.md
- e:/smartspend_V1_fixed/.agents/explorer_survey_2/report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement all Milestone 1 components:
1. Create src/components/ui/adaptive-dialog.tsx (polymorphic between vaul Drawer on <768px with grabber, snapPoints, repositionInputs and Radix Dialog on desktop).
2. Create src/lib/backButtonManager.ts and src/hooks/useSheetManager.ts (LIFO hardware back button stack).
3. Create src/hooks/useMediaQuery.ts (if missing).
4. Migrate all dialogs specified in SCOPE.md to AdaptiveDialog (RecentExpenses, ExpenseForm, MonthlyCalendar, ExpenseChart, SmartProfileView, BusinessSettingsView, PeopleSettingsView, PasskeySettings, BiometricOnboardingModal, PushNotificationPrompt, FeedbackButton).
5. Run `npm run check` and `npm run test`.
6. Write handoff report to e:/smartspend_V1_fixed/.agents/sub_orch_m1/handoff.md. Update progress.md regularly. Report back via send_message when finished.
