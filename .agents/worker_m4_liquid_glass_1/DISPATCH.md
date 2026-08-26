## 2026-08-25T03:36:36Z
You are worker_m4_liquid_glass_1.
Your working directory is E:\smartspend_V1_fixed\.agents\worker_m4_liquid_glass_1\ (metadata only, no source files).
The workspace root is E:\smartspend_V1_fixed.
The constitution is E:\smartspend_V1_fixed\AGENTS.md.
The user request is E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md.
The project plan is E:\smartspend_V1_fixed\PROJECT.md.
The frontend survey report is E:\smartspend_V1_fixed\.agents\survey_frontend_r1_r2\handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission: Implement Milestone 4 (iOS 26 "Liquid Glass" Bottom Sheet, Sidebar & Glass Primitives).

File Boundaries & Exclusive Ownership:
You own and edit ONLY:
- `src/components/ui/liquid-bottom-sheet.tsx` (NEW)
- `src/components/ui/liquid-sidebar.tsx` (NEW)
- `src/components/ui/liquid-glass.tsx` (NEW)
- `src/components/Sidebar.tsx`
- `src/components/expenses/RecentExpenses.tsx`
- `src/components/dashboard/MonthlyCalendar.tsx`
- `src/components/goals/FinancialGoalsPanel.tsx`
- `src/components/pwa/PwaEnhancements.tsx`

Tasks:
1. Create `src/components/ui/liquid-bottom-sheet.tsx`:
   - An iOS 26 "Liquid Glass" Bottom Sheet component built on `vaul` Drawer with spring physics (`stiffness: 320`, `damping: 30`, `mass: 0.85`), visual drag handle, `.liquid-glass-sheet` styling, specular rim gradient highlights, adaptive backdrop blur/saturation, and responsive desktop fallback to `Dialog` when viewport is desktop (`useIsMobile` returns false).
2. Create `src/components/ui/liquid-sidebar.tsx`:
   - A draggable iOS 26 Liquid Glass Sidebar drawer with spring momentum, specular glass backdrop, dark/light theme support, and responsive desktop rendering.
3. Create `src/components/ui/liquid-glass.tsx`:
   - Reusable `LiquidGlassCard`, `LiquidGlassPanel`, and `LiquidGlassBadge` container primitives with high-refraction glass tokens and dark/light mode responsiveness.
4. Refactor `src/components/Sidebar.tsx`:
   - Utilize Liquid Glass styling, light/dark responsiveness, and safe-area padding (`pt-safe`, `pb-safe`).
5. Refactor mobile dialogs to utilize `LiquidBottomSheet` for native mobile immersion:
   - `src/components/expenses/RecentExpenses.tsx`: Mobile transaction detail inspection.
   - `src/components/dashboard/MonthlyCalendar.tsx`: Mobile calendar day transaction details.
   - `src/components/goals/FinancialGoalsPanel.tsx`: Mobile add/edit goal workflow.
   - `src/components/pwa/PwaEnhancements.tsx`: Mobile offline sync outbox modal.

Verification:
- Run `npm run check` (TypeScript typecheck).
- Run `npm test` to verify zero regressions.
