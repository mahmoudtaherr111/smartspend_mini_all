# Orchestration Plan: SmartSpend AI Frontend Refactoring

## Objectives
Deconstruct monolithic frontend components into modular, highly-maintainable subcomponents and unified hooks with:
1. Exact zero regressions
2. Max 350 lines per refactored file
3. Full RTL (Arabic) & LTR gesture and keyboard navigation support
4. Unbroken tRPC cache invalidations & form states
5. 0 TypeScript compiler errors (`npm run check`) & 100% test pass rate (`npm run test`)

## Phases
1. **Phase 0: Survey & Codebase Exploration**
   - Explorer 1: Analyze `src/pages/Home.tsx` (~1150 lines), sub-views, actions, states, and navigation interactions.
   - Explorer 2: Analyze `src/components/admin/AdminSettingsTab.tsx` (~1774 lines), form state management, tRPC mutations, settings cache invalidation.
   - Explorer 3: Analyze `src/components/pwa/PwaEnhancements.tsx` (~587 lines) and navigation touch/swipe hooks in `MobileBottomNav.tsx` / layout wrappers.
2. **Phase 1: Project Plan & Architectural SSoT (`PROJECT.md`)**
   - Synthesize explorer reports.
   - Enumerate feature inventory, interface contracts, directory structure, and line count boundaries.
3. **Phase 2: Milestone 1 — Unified Navigation Hooks (R4)**
   - Extract `useSwipeNavigation` and `useKeyboardNav` in `src/hooks/`.
   - Support RTL/LTR, touch lock mechanics, touch cleanup, event listeners.
   - Run Worker -> Reviewers -> Challengers -> Auditor -> Gate check.
4. **Phase 3: Milestone 2 — PWA Enhancements Decomposition (R3)**
   - Split `PwaEnhancements.tsx` into 4 dedicated units:
     1. PWA Install Prompt Banner & Trigger
     2. iOS Safari Installation Instruction Card
     3. Offline Outbox Queue & Background Sync Manager
     4. Network Online/Offline Status Toast/Indicator
   - Coordinate via clean wrapper/exports under 350 lines.
   - Run Worker -> Reviewers -> Challengers -> Auditor -> Gate check.
5. **Phase 4: Milestone 3 — AdminSettingsTab Modularization (R2)**
   - Decompose `AdminSettingsTab.tsx` into distinct sub-panels:
     - General Config Panel
     - AI & LLM Model Settings Panel
     - Security/Auth Flags Panel
     - Rate Limits, Storage & Backups Panel
   - Coordinate with compact parent tab (<350 lines) preserving cache invalidation.
   - Run Worker -> Reviewers -> Challengers -> Auditor -> Gate check.
6. **Phase 5: Milestone 4 — Home.tsx Monolith Deconstruction (R1)**
   - Break down `src/pages/Home.tsx` into subcomponents:
     - Tab View Orchestrator
     - Quick Action Triggers
     - Onboarding Modal Flow
     - Summary Widgets
     - Sub-tab views
   - Retain `Home.tsx` as clean orchestrator (<250 lines).
   - Wire `useSwipeNavigation` and `useKeyboardNav`.
   - Run Worker -> Reviewers -> Challengers -> Auditor -> Gate check.
7. **Phase 6: Milestone 5 — Full Verification & Monorepo Audit (R5)**
   - Full TypeScript validation (`npm run check`).
   - Vitest test suite (`npm run test`).
   - Line count audit (all files <= 350 lines).
   - Final review and forensic audit.
