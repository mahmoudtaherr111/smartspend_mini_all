## 2026-08-29T10:11:45Z

Your Assigned Scope: M4 (PWA & Mobile-First UX)
Exclusively Owned Files:
- `src/App.tsx`
- `src/index.css`
- `src/pages/Home.tsx`
- `src/hooks/use-mobile.ts`
- `src/components/layout/MobileBottomNav.tsx`

Step-by-Step Instructions:
1. In `src/App.tsx`:
   - Ensure pb-nav-safe applies to all routes rendering MobileBottomNav (/ai, /settings, /pro, /bank-sync, /support, /dashboard) so bottom inputs/buttons are never hidden.
2. In `src/index.css`:
   - Consolidate .pb-safe, .pt-safe, and add horizontal safe utilities (.pl-safe, .pr-safe, .px-safe).
3. In `src/pages/Home.tsx`:
   - Fix RTL swipe navigation so swipe-left advances record -> stats -> calendar and swipe-right recedes.
4. In `src/hooks/use-mobile.ts`:
   - Synchronize useIsMobile() breakpoint with layout shell (1024px / lg).
5. Validate your changes with `npm run check` and vitest tests.
6. Write your comprehensive completion report to `e:/smartspend_V1_fixed/.agents/worker_m4_pwa_layout/handoff.md` and notify orchestrator via send_message.
