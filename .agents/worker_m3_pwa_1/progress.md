# Progress — M4 (PWA & Mobile-First UX)

Last visited: 2026-08-28T14:55:04Z
Status: Investigating owned files and existing implementations.

## Steps
- [ ] 1. Inspect existing implementations in `src/App.tsx`, `src/index.css`, `src/pages/Home.tsx`, `src/hooks/use-mobile.ts`, and `src/components/layout/MobileBottomNav.tsx`.
- [ ] 2. Consolidate safe-area utilities in `src/index.css` (`.pb-safe`, `.pt-safe`, `.pl-safe`, `.pr-safe`, `.px-safe`, `.pb-nav-safe`).
- [ ] 3. Audit and update route wrappers / `src/App.tsx` and layout to ensure `pb-nav-safe` is applied to all routes rendering `MobileBottomNav`.
- [ ] 4. Unify virtual keyboard avoidance event listeners & viewport shift prevention in `src/App.tsx` or styling/hooks.
- [ ] 5. Fix RTL swipe navigation and pull-to-refresh conflicts in `src/pages/Home.tsx`.
- [ ] 6. Synchronize `useIsMobile()` breakpoint in `src/hooks/use-mobile.ts` (and any related usage) to `1024px` (`lg`).
- [ ] 7. Update `src/components/layout/MobileBottomNav.tsx` if needed for safe-area / keyboard avoidance.
- [ ] 8. Verify with `npm run check` and vitest tests.
- [ ] 9. Write `handoff.md` and notify parent.
