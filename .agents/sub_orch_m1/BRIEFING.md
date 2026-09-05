# BRIEFING — 2026-08-30T12:45:00Z

## Mission
Implement Milestone 1: Universal Polymorphic AdaptiveDialog & Bottom Sheet Architecture across SmartSpend AI.

## 🔒 My Identity
- Archetype: sub_orch_m1
- Roles: implementer, qa, specialist
- Working directory: e:/smartspend_V1_fixed/.agents/sub_orch_m1
- Original parent: 5f220bda-b3dc-47c4-887a-d98b85bfbaae
- Milestone: Milestone 1 — Universal Polymorphic AdaptiveDialog & Bottom Sheet Architecture

## 🔒 Key Constraints
- Pure genuine logic — DO NOT cheat, fake, or fabricate any implementation or test.
- Polymorphic AdaptiveDialog toggling between vaul Drawer (<768px) and Radix Dialog (>=768px).
- LIFO BackButtonManager integration with Capacitor backButton and web popstate.
- Zero regressions across existing features; all tests must pass; `npm run check` must pass with 0 errors.

## Current Parent
- Conversation ID: 5f220bda-b3dc-47c4-887a-d98b85bfbaae
- Updated: 2026-08-30T12:45:00Z

## Task Summary
- **What to build**:
  1. `src/hooks/useMediaQuery.ts`
  2. `src/lib/backButtonManager.ts` (and link with `src/lib/back-button-manager.ts`)
  3. `src/hooks/useSheetManager.ts`
  4. `src/components/ui/adaptive-dialog.tsx`
  5. Migrate high-frequency & settings dialogs:
     - `RecentExpenses.tsx` (Transaction Details & Delete Confirmation)
     - `ExpenseForm.tsx` (Camera Tip & Pro Upgrade)
     - `MonthlyCalendar.tsx` (Day Transactions with snap points [0.5, 0.9])
     - `ExpenseChart.tsx` (Category Details & Wallet Modals)
     - `SmartProfileView.tsx` (Goal Creation Modal)
     - `BusinessSettingsView.tsx` (Edit Business & Add Category)
     - `PeopleSettingsView.tsx` (Clean up manual Drawer/Dialog duplication)
     - `PasskeySettings.tsx` (PIN setup)
     - `BiometricOnboardingModal.tsx` & `PushNotificationPrompt.tsx` & `FeedbackButton.tsx`
  6. Unit tests for `AdaptiveDialog`, `useMediaQuery`, `useSheetManager`, and `BackButtonManager`.
  7. Verification (`npm run check`, `npm run test`).
  8. Handoff report at `.agents/sub_orch_m1/handoff.md`.

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: Pending
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pending verification
- **Lint status**: Clean
- **Tests added/modified**: Pending
