# Scope: Milestone 1 — Universal Polymorphic AdaptiveDialog & Bottom Sheet Architecture

## Objective
Implement a universal polymorphic AdaptiveDialog primitive that seamlessly toggles between `vaul` Bottom Sheet (<768px) with grabber handle, snap detents, and input repositioning, and `@radix-ui/react-dialog` on desktop (>=768px), integrated with a LIFO `BackButtonManager` for Capacitor Android hardware back button and web popstate handling. Migrate high-frequency and settings dialogs across the application.

## Working Directory
`e:/smartspend_V1_fixed/.agents/sub_orch_m1`

## Inputs & Context
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`
- Survey report: `e:/smartspend_V1_fixed/.agents/explorer_survey_2/report.md` (Sections 4.2 & 6)
- Existing primitives: `src/components/ui/dialog.tsx`, `src/components/ui/drawer.tsx` (`vaul`)

## Owned Files & Scope
- Create `src/components/ui/adaptive-dialog.tsx` (exporting `AdaptiveDialog`, `AdaptiveDialogTrigger`, `AdaptiveDialogContent`, `AdaptiveDialogHeader`, `AdaptiveDialogFooter`, `AdaptiveDialogTitle`, `AdaptiveDialogDescription`, `AdaptiveDialogClose`).
- Create `src/hooks/useSheetManager.ts` and/or `src/lib/backButtonManager.ts` (LIFO stack for modal dismissal before route change).
- Create `src/hooks/useMediaQuery.ts` (if missing or enhance existing).
- Migrate high-frequency dialogs to `AdaptiveDialog`:
  - `src/components/expenses/RecentExpenses.tsx` (Transaction Details & Delete Confirmation).
  - `src/components/expenses/ExpenseForm.tsx` (Receipt Camera Tips & Pro Upgrade modals).
  - `src/components/dashboard/MonthlyCalendar.tsx` (Day Transactions dialog with snap points `[0.5, 0.9]`).
  - `src/components/dashboard/ExpenseChart.tsx` (Category Details & Wallet Modals).
  - `src/components/profile/SmartProfileView.tsx` (Financial Goals dialog).
  - `src/components/settings/BusinessSettingsView.tsx` (Edit Business & Add Category).
  - `src/components/settings/PeopleSettingsView.tsx` (Clean up redundant manual Drawer/Dialog duplication).
  - `src/components/auth/PasskeySettings.tsx` (PIN setup).
  - `src/components/auth/BiometricOnboardingModal.tsx` & `src/components/notifications/PushNotificationPrompt.tsx` & `src/components/FeedbackButton.tsx`.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification Requirements
1. Run `npm run check` to verify 0 type errors.
2. Run `npm run test` for all affected components and write unit tests for `AdaptiveDialog` and `BackButtonManager` (`src/components/ui/adaptive-dialog.test.tsx`, `src/lib/backButtonManager.test.ts`).
3. Produce handoff report at `e:/smartspend_V1_fixed/.agents/sub_orch_m1/handoff.md`.
