# BRIEFING — 2026-08-26T10:40:00Z

## Mission
Deconstruct and analyze `src/pages/Home.tsx` and layout/navigation components (`MobileBottomNav.tsx`, layout wrappers), mapping subcomponents, hooks, state, gestures, and keyboard navigation for modular refactoring.

## 🔒 My Identity
- Archetype: explorer
- Roles: frontend layout & home explorer
- Working directory: E:\smartspend_V1_fixed\.agents\explorer_home
- Original parent: 0a6300b2-d03b-4f1f-b776-8519d769f0ee
- Milestone: M1 / R1 & R4 Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Ensure RTL (Arabic) compatibility is preserved
- Dual-auth support (OAuth + local OTP) preserved
- Styling (Tailwind/shadcn) preserved without breaking changes
- Home.tsx target < 250 lines, subcomponents <= 350 lines
- Exact interfaces for useSwipeNavigation and useKeyboardNav

## Current Parent
- Conversation ID: 0a6300b2-d03b-4f1f-b776-8519d769f0ee
- Updated: 2026-08-26T10:40:00Z

## Investigation State
- **Explored paths**: `src/pages/Home.tsx`, `src/components/layout/MobileBottomNav.tsx`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/pwa/PullToRefreshWrapper.tsx`, `src/hooks/`
- **Key findings**:
  - `Home.tsx` (1,150 lines) contains 4 inlined components, 5 queries, 1 mutation, 7 effects, and dead imports (`ReceiptCapture`, `AIInsights`, `PlanUsageStrip`, `Brain`, `ReceiptText`).
  - Modular target: 6 domain subcomponents + 1 custom state hook (`useHomeDashboard.ts`), resulting in `Home.tsx` orchestrator of ~120 lines (<250 lines threshold).
  - Navigation/Gestures: Designed `useSwipeNavigation` (RTL delta math, direction locking, exclusion selectors) and `useKeyboardNav`.
- **Unexplored areas**: None. Exploration complete.

## Key Decisions Made
- Deconstruction blueprint completed and documented in `analysis.md` and `handoff.md`.

## Artifact Index
- E:\smartspend_V1_fixed\.agents\explorer_home\analysis.md — Detailed analysis of Home.tsx and navigation architecture
- E:\smartspend_V1_fixed\.agents\explorer_home\handoff.md — 5-component handoff report
