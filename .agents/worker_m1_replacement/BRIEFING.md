# BRIEFING — 2026-08-29T10:26:00Z

## Mission
Complete Milestone 1 tasks for SmartSpend AI mobile/PWA shell, lifecycle integration, viewport locking, and Cairo Arabic font typography clipping fixes.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: e:\smartspend_V1_fixed\.agents\worker_m1_replacement
- Original parent: 48fa826e-9a96-4e89-be77-3c45db8b459e
- Milestone: M1 Replacement - Shell, Lifecycle & Typography Foundations

## 🔒 Key Constraints
- Genuine implementation without cheating or hardcoded workarounds.
- Minimal change principle.
- Full typecheck (`npm run check`) and test suite (`npm run test`) passing with 0 regressions.
- No editing outside permitted workspace or .agents ownership violations.

## Current Parent
- Conversation ID: 48fa826e-9a96-4e89-be77-3c45db8b459e
- Updated: not yet

## Task Summary
- **What to build**:
  1. Wire `useNativeThemeSync()`, `useVirtualKeyboard()`, and `initBackButtonListener()` into `src/App.tsx`.
  2. Coordinate `SplashScreen.hide()` with `document.fonts.ready` in `src/pwa/register-sw.ts` / `src/App.tsx` for FOUT elimination.
  3. Update `index.html` to lock viewport (`user-scalable=no, maximum-scale=1.0`) and prevent pinch-to-zoom gestures.
  4. Fix Cairo Arabic font glyph clipping across UI primitives (`src/components/ui/dialog.tsx`, `card.tsx`, `label.tsx`, `badge.tsx`, `tabs.tsx`, `src/index.css`) by replacing `leading-none` with `leading-normal` / `leading-snug`.
  5. Run `npm run check` and `npm run test` to verify 0 errors and regressions.
- **Success criteria**: All 4 features correctly integrated, zero type errors, 100% tests passing, no Cairo font clipping, handoff report generated.
- **Interface contracts**: `PROJECT.md` & `DISPATCH.md`
- **Code layout**: `src/` (frontend components, hooks, styles, html)

## Key Decisions Made
- Investigating codebase and planned modifications.

## Change Tracker
- **Files modified**: none yet
- **Build status**: TBD
- **Pending issues**: none

## Quality Status
- **Build/test result**: TBD
- **Lint status**: TBD
- **Tests added/modified**: TBD

## Loaded Skills
- None

## Artifact Index
- `e:/smartspend_V1_fixed/.agents/worker_m1_replacement/BRIEFING.md`
- `e:/smartspend_V1_fixed/.agents/worker_m1_replacement/progress.md`
- `e:/smartspend_V1_fixed/.agents/worker_m1_replacement/handoff.md`
