## 2026-08-28T14:55:04Z
Read e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md and e:/smartspend_V1_fixed/AGENTS.md before starting.
Your working directory is e:/smartspend_V1_fixed/.agents/worker_m3_pwa_1/. Maintain progress.md and BRIEFING.md there.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Assigned Milestone: M4 (PWA & Mobile-First UX)
Exclusively Owned Files:
- `src/App.tsx`
- `src/index.css`
- `src/pages/Home.tsx`
- `src/hooks/use-mobile.ts`
- `src/components/layout/MobileBottomNav.tsx`

Tasks:
1. Safe-Area & Viewport Stability:
   - Fix bottom content clipping: ensure `pb-nav-safe` is applied to all routes rendering `MobileBottomNav` (`/ai`, `/settings`, `/pro`, `/bank-sync`, `/support`, `/dashboard`), so bottom inputs/buttons are never hidden.
   - Consolidate `.pb-safe`, `.pt-safe`, and add horizontal safe utilities (`.pl-safe`, `.pr-safe`, `.px-safe`).
   - Unify virtual keyboard avoidance event listeners and prevent layout shifting when the keyboard opens/closes.
2. Gestures & Breakpoints:
   - Fix RTL swipe navigation in `src/pages/Home.tsx` so swipe-left advances `record` -> `stats` -> `calendar` and swipe-right recedes.
   - Synchronize `useIsMobile()` breakpoint with layout shell (`1024px` / `lg`) to prevent iPad/tablet modal/sheet mismatches.
   - Prevent pull-to-refresh conflicts with internal scrollable lists.

Verify by running `npm run check` and relevant vitest tests. Deliver your complete report to `e:/smartspend_V1_fixed/.agents/worker_m3_pwa_1/handoff.md` and notify orchestrator via send_message.
