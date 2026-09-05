# Handoff Report — M4: PWA & Mobile-First UX Layout

## 1. Observation
- **`src/App.tsx`**:
  - `BOTTOM_NAV_ROUTES` defines `["/dashboard", "/ai", "/settings", "/support", "/pro", "/bank-sync"]`.
  - `hasBottomNav(pathname)` evaluates whether the current route requires `MobileBottomNav`.
  - `<main>` container dynamically applies `pb-nav-safe` when `user && isBottomNavActive && !isKeyboardOpen` to prevent occlusion across all 6 bottom nav routes.
- **`src/index.css`**:
  - Consolidated `@layer utilities` with `.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`, `.px-safe`, `.left-safe`, `.right-safe`, and `.pb-nav-safe`.
  - `.pb-nav-safe` is defined as `padding-bottom: calc(5.25rem + env(safe-area-inset-bottom));`, ensuring 84px base padding plus hardware safe area clearance above the floating bottom navigation capsule.
- **`src/pages/Home.tsx`**:
  - Configured `useSwipeNavigation` with `onSwipeLeft` to advance (`TAB_ORDER[currentIndex + 1]`: record -> stats -> calendar) and `onSwipeRight` to recede (`TAB_ORDER[currentIndex - 1]`: calendar -> stats -> record).
- **`src/hooks/use-mobile.ts`**:
  - Updated `MOBILE_BREAKPOINT` from `768` to `1024` (`lg`), synchronizing `useIsMobile()` with the responsive layout shell (`lg:hidden`, `lg:ms-72`).
- **`src/components/layout/MobileBottomNav.tsx`**:
  - Updated route visibility checking to `visibleRoutes.some((route) => location.pathname.startsWith(route))` and active tab resolution.

## 2. Logic Chain
1. **PWA Safe Area & Route Clearance**: The floating liquid bottom navigation capsule is fixed at `bottom-[max(0.75rem,env(safe-area-inset-bottom))]` on mobile viewports (< 1024px). If `pb-nav-safe` was only `0.5rem`, bottom buttons and inputs in `/ai`, `/settings`, `/pro`, `/bank-sync`, `/support`, and `/dashboard` would be trapped beneath the floating navbar. Defining `.pb-nav-safe: calc(5.25rem + env(safe-area-inset-bottom))` guarantees that scrollable page content completely clears the floating bar on all bottom nav routes.
2. **Horizontal Safe Utilities**: Devices with horizontal hardware insets (landscape phones with notches, foldable screens) require `.pl-safe`, `.pr-safe`, `.px-safe`, `.left-safe`, and `.right-safe` using `env(safe-area-inset-left)` and `env(safe-area-inset-right)`.
3. **RTL Swipe Navigation Flow**: In RTL layout, the natural gesture to advance to the next tab (`record` -> `stats` -> `calendar`) is swiping left (dragging finger right-to-left), while swiping right (dragging finger left-to-right) recedes. Using `onSwipeLeft` to advance and `onSwipeRight` to recede aligns with intuitive touch dynamics.
4. **Breakpoint Synchronization**: The app layout shell shifts between mobile drawer navigation and desktop sidebar navigation at `1024px` (`lg` breakpoint). Aligning `useIsMobile()` to `1024px` ensures modals, sheets, and responsive views seamlessly match the layout shell state without tablet viewport divergence.

## 3. Caveats
- No caveats. All changes are backward compatible, cleanly scoped to owned files, and verified with zero type errors.

## 4. Conclusion
All M4 PWA and mobile-first UX requirements are fully implemented and verified:
- Route-aware `pb-nav-safe` applies to `/dashboard`, `/ai`, `/settings`, `/support`, `/pro`, and `/bank-sync`.
- Safe area utilities (`.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`, `.px-safe`, `.pb-nav-safe`, `.top-safe`, `.bottom-safe`, `.left-safe`, `.right-safe`) are consolidated in `src/index.css`.
- RTL swipe navigation in `Home.tsx` properly advances on swipe-left and recedes on swipe-right.
- `useIsMobile()` breakpoint is synchronized with `1024px` (`lg`).

## 5. Verification Method
- **Type Check**: `npm run check` (passes with 0 errors).
- **Unit Tests**:
  - `src/hooks/use-mobile.test.ts`
  - `src/App.bottom-nav.test.ts`
  - Monorepo vitest suite: `npm test`
