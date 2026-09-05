## 2026-08-26T10:18:08Z

You are Explorer 3 (PWA & Nav Explorer) investigating the SmartSpend AI frontend codebase.
Your working directory for metadata is: E:\smartspend_V1_fixed\.agents\explorer_pwa\
Path to user request: E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md

You MUST read E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md and AGENTS.md before starting work.

Your Mission:
Thoroughly explore and analyze `src/components/pwa/PwaEnhancements.tsx` (~587 lines) as well as touch/gesture and keyboard navigation implementations across the frontend.

Requirements to Analyze:
1. Splitting `PwaEnhancements.tsx` into 4 dedicated units:
   - (1) PWA Install Prompt Banner & Trigger (`PwaInstallPrompt.tsx`)
   - (2) iOS Safari Installation Instruction Card (`IosInstallGuide.tsx`)
   - (3) Offline Outbox Queue & Background Sync Manager (`OfflineSyncManager.tsx`)
   - (4) Network Online/Offline Status Toast/Indicator (`NetworkStatusIndicator.tsx`)
   - Design the coordinating wrapper or index export (`PwaEnhancements.tsx`) under 350 lines.
   - Map all dependencies (localStorage keys, window events, service worker interactions, IndexedDB/outbox queues, tRPC offline mutations).
2. Extracting Unified Gesture & Keyboard Navigation Hooks:
   - Investigate all touch/swipe implementations in `Home.tsx`, `MobileBottomNav.tsx`, and layout wrappers.
   - Design `useSwipeNavigation.ts`: touchstart/touchmove/touchend listeners, deltaX/deltaY thresholds, velocity, RTL (Arabic - `document.dir === 'rtl'` or `dir="rtl"`) direction inversion, touch-action locks, and cleanup.
   - Design `useKeyboardNav.ts`: ArrowLeft/ArrowRight/Tab/Escape navigation, RTL awareness, keydown cleanup, input/textarea focus exclusion.
3. Verification & Metrics:
   - Ensure zero regressions, no new external packages, max 350 lines per file, 100% type safety.

Produce your findings in `E:\smartspend_V1_fixed\.agents\explorer_pwa\analysis.md` and write a complete self-contained handoff in `E:\smartspend_V1_fixed\.agents\explorer_pwa\handoff.md`.
Report back when completed with a summary and the path to your handoff file.
