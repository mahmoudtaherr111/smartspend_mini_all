## 2026-08-26T10:18:08Z

You are Explorer 1 (Home & Layout Explorer) investigating the SmartSpend AI frontend codebase.
Your working directory for metadata is: E:\smartspend_V1_fixed\.agents\explorer_home\
Path to user request: E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md

You MUST read E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md and AGENTS.md before starting work.

Your Mission:
Thoroughly explore and analyze `src/pages/Home.tsx` (~1150 lines), its imports, state variables, effects, handlers, modals, widgets, sub-tabs, and all rendered sections.
Also explore `src/components/layout/MobileBottomNav.tsx` and any relevant layout wrappers to map out how navigation, swipe gestures, and keyboard shortcuts currently work with Home.tsx.

Requirements to Analyze:
1. Deconstruction of `Home.tsx`:
   - Identify every logical domain subcomponent (e.g. HomeHeader, QuickActions, SummaryCards, ExpenseCharts/Widgets, OnboardingModal, RecentActivityTab, BudgetOverviewTab, etc.).
   - Identify all state hooks, queries (tRPC queries), and mutations in `Home.tsx` and how state should be passed or shared cleanly (via props, custom hooks, or context).
   - Ensure the refactored `Home.tsx` will act as a lean orchestrator (<250 lines) and all subcomponents are <= 350 lines.
2. Interaction with Navigation & Gestures:
   - Identify all touch/swipe and keyboard event handlers currently inside `Home.tsx` or `MobileBottomNav.tsx`.
   - Specify the exact interfaces for `useSwipeNavigation` and `useKeyboardNav`.
3. Strict Preservation:
   - Ensure RTL (Arabic) compatibility, dual-auth support (OAuth + local OTP), and styling (Tailwind/shadcn) are preserved without breaking changes.

Produce your findings in `E:\smartspend_V1_fixed\.agents\explorer_home\analysis.md` and write a complete self-contained handoff in `E:\smartspend_V1_fixed\.agents\explorer_home\handoff.md`.
Report back when completed with a summary and the path to your handoff file.
