# BRIEFING — 2026-08-30T12:45:00Z

## Mission
Implement Milestone 3: Directional Spatial Transitions & Tab State Keep-Alive with native iOS/Flutter-grade fidelity, zero regressions, and full test coverage.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: e:/smartspend_V1_fixed/.agents/sub_orch_m3
- Original parent: 5f220bda-b3dc-47c4-887a-d98b85bfbaae
- Milestone: M3 (Directional Spatial Transitions & Tab State Keep-Alive)

## 🔒 Key Constraints
- RTL-aware forward/backward transitions (in RTL, forward enters from LEFT, backward pops to LEFT, background 20% parallax/scale).
- Hardware-accelerated transforms (GPU translate3d, will-change, spring physics).
- Per-route scroll restoration across bottom nav tabs in `<main ref={scrollRef}>`.
- Offscreen keep-alive for AICenter tabs (Chat, Voice, Report) to retain active chat messages, voice connections, and scroll positions.
- Settings sub-views spatial slide transitions and state retention.
- Zero type errors (`npm run check`) and passing unit tests (`npm run test`).

## Current Parent
- Conversation ID: 5f220bda-b3dc-47c4-887a-d98b85bfbaae
- Updated: 2026-08-30T12:45:00Z

## Task Summary
- **What to build**:
  1. `src/hooks/useNavigationDirection.ts`
  2. `src/hooks/useScrollRestoration.ts`
  3. `src/components/layout/PageTransition.tsx`
  4. Integration in `src/App.tsx` `<main ref={scrollRef}>`
  5. Offscreen tab keep-alive in `src/pages/AICenter.tsx`
  6. Sub-view spatial slide transitions in `src/pages/Settings.tsx`
  7. Tests in `src/hooks/useNavigationDirection.test.ts` and `src/hooks/useScrollRestoration.test.ts`
- **Success criteria**: All transitions smooth, GPU accelerated, RTL calibrated, no unmounting of persistent views, scroll positions preserved, `npm run check` and `npm run test` green.
- **Interface contracts**: PROJECT.md § Spatial Navigation Contract.
- **Code layout**: src/hooks, src/components/layout, src/pages.

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: [TBD]
- **Pending issues**: none

## Quality Status
- **Build/test result**: [TBD]
- **Lint status**: clean
- **Tests added/modified**: [TBD]

## Loaded Skills
None
