# Project: SmartSpend AI — Mobile Fidelity Implementation (iOS Swift & Flutter Grade)

## Architecture
- **Monorepo Topology**: Full-stack TypeScript monorepo with React 18 frontend (`src/`), Hono v4 + tRPC v11 backend (`api/`), Drizzle ORM (`db/`), and shared contracts (`contracts/`).
- **Mobile-First UX Engine**:
  - **Polymorphic Adaptive Dialogs**: Seamless breakpoint switching between Vaul bottom sheets on mobile (<768px) and Radix centered dialogs on desktop (>=768px) with LIFO hardware back button management.
  - **Native Touch Physics**: 1:1 finger tracking, momentum scrolling, and spring settling via `embla-carousel-react` configured with strict RTL alignment and nested gesture isolation (`.no-swipe`).
  - **Spatial Hierarchy**: Direction-aware, hardware-accelerated RTL slide transitions with persistent per-route scroll offset restoration and offscreen tab keep-alive memory.
  - **GPU Compositing Pipeline**: Hardware compositing (`transform-gpu`, `contain-paint`), zero live backdrop-filter blur on scroll items (60–120fps locked), FOUT-free typography, and Cairo font bounding-box preservation.
  - **Micro-Haptics Subsystem**: Multi-tier tactile feedback (`selection`, `lightTap`, `mediumTap`, `heavyTap`, `warning`, `success`, `error`) wired across all interactive touchpoints.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Polymorphic `AdaptiveDialog` Primitive | Universal adaptive wrapper (`src/components/ui/adaptive-dialog.tsx`) that renders `vaul` Drawer with grabber handle, snap detents, and input repositioning on `<768px` and Radix Dialog on desktop. | M1 | Survey 2 |
| 2 | LIFO `BackButtonManager` & Sheet Stack | Centralized hardware back button manager (`src/lib/backButtonManager.ts` & `src/hooks/useSheetManager.ts`) for Android Capacitor shell and web popstate coordination. | M1 | Survey 2 & 3 |
| 3 | High-Frequency Expense & Calendar Sheet Migration | Migrate transaction details, delete confirmations, receipt scan tips, pro upgrade, day calendar dialogs, and chart modal breakdowns to `AdaptiveDialog`. | M1 | Survey 2 |
| 4 | Settings, Auth & Profile Sheet Migration | Migrate goal creation, business settings, contact editor, passkey PIN setup, biometric onboarding, and feedback modals to `AdaptiveDialog`. | M1 | Survey 2 |
| 5 | Continuous 1:1 Interactive Tab Pager | Implement `src/components/dashboard/InteractiveTabPager.tsx` using `embla-carousel-react` with RTL calibration, momentum physics, and spring settling. | M2 | Survey 1 |
| 6 | Home Dashboard Pager Integration | Replace discrete `opacity-0/100` and `hidden/block` classes in `src/pages/Home.tsx` with `InteractiveTabPager` synchronized with `HomeHeader` and `MobileBottomNav`. | M2 | Survey 1 |
| 7 | Pointer & Gesture Isolation (`.no-swipe`) | Configure Embla `watchDrag` filter to isolate nested interactive elements (charts, sliders, calendars, swipe-to-delete cards, inputs). | M2 | Survey 1 |
| 8 | Directional Spatial Route Transitions | Implement RTL-aware hardware-accelerated slide transitions in `src/components/layout/PageTransition.tsx` using `useNavigationDirection.ts`. | M3 | Survey 2 |
| 9 | Per-Route Scroll Offset Restoration | Implement `useScrollRestoration.ts` caching `<main>` container scroll positions across tab navigation. | M3 | Survey 2 |
| 10 | AICenter & Settings Offscreen Keep-Alive | Implement offscreen tab state preservation in `AICenter.tsx` (Chat, Voice, Report) and `Settings.tsx` to prevent component unmounting and data loss. | M3 | Survey 2 |
| 11 | GPU Compositing Optimization in Cards & Lists | Eliminate `backdrop-blur-xl` from `src/components/ui/card.tsx` and scrollable items; apply `contain-paint` and solid/translucent styling for 60–120fps scrolling. | M4 | Survey 3 |
| 12 | Instant Button Active Press Physics | Asymmetric CSS active press (0–40ms press, spring recovery) and scroll cancellation (`touch-action: pan-y`) in `src/index.css` and `3d-effects.css`. | M4 | Survey 1 |
| 13 | Multi-Tier Micro-Haptics Engine | Expand `useHaptics.ts` with `selection`, `heavyTap`, `warning`; wire into `Switch`, `TabsTrigger`, `Slider`, `ToggleGroup`, `Drawer` snap detents, and swipe-to-delete live threshold crossing. | M4 | Survey 1 |
| 14 | Viewport Hardening & Pinch-to-Zoom Prevention | Update `index.html` viewport meta tag (`user-scalable=no, maximum-scale=1.0`) and suppress Safari multi-touch gestures in `src/main.tsx`. | M4 | Survey 1 & 3 |
| 15 | FOUT Elimination & Splash Lifecycle | Coordinate `dismissAppLoader()` in `src/pwa/register-sw.ts` with `document.fonts.ready` and `@capacitor/splash-screen`. | M4 | Survey 3 |
| 16 | Arabic Cairo Font Bounding-Box Preservation | Fix `leading-none`, `overflow-hidden`, and tight vertical padding in `DialogTitle`, `CardTitle`, `Label`, `Badge`, and `TabsTrigger`. | M4 | Survey 3 |
| 17 | Capacitor Shell & Native Lifecycle Plugins | Add root `capacitor.config.ts`, `useNativeThemeSync.ts`, and unified `useVirtualKeyboard.ts` using `@capacitor/keyboard`, `@capacitor/status-bar`, and `@capacitor/app`. | M4 | Survey 3 |
| 18 | Monorepo Type Check & Lint Integrity | Run `npm run check` across the monorepo ensuring 0 type errors. | M5 | Synthesis |
| 19 | Vitest Unit & Component Verification Suite | Unit tests for `useHaptics`, `adaptive-dialog`, `useNavigationDirection`, `InteractiveTabPager`, `useScrollRestoration`, and `backButtonManager`. | M5 | Synthesis |
| 20 | Mobile E2E & Touch Interaction Verification | Comprehensive Playwright mobile test suite verifying sheets, drag paging, scroll restoration, and gesture isolation. | M5 | Synthesis |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Universal Polymorphic AdaptiveDialog & Bottom Sheet Architecture | Features 1, 2, 3, 4 | none | PLANNED |
| M2 | Continuous 1:1 Interactive Tab Pager with Gesture Isolation | Features 5, 6, 7 | none | PLANNED |
| M3 | Directional Spatial Transitions & Tab State Keep-Alive | Features 8, 9, 10 | none | PLANNED |
| M4 | GPU Compositing Optimization, Haptics & Performance Hardening | Features 11, 12, 13, 14, 15, 16, 17 | none | PLANNED |
| M5 | Comprehensive Zero-Regression Test Suite & Final Verification | Features 18, 19, 20 | M1, M2, M3, M4 | PLANNED |

## E2E Testing Track
- Parallel E2E Testing Track Orchestrator derives opaque-box test suites from requirements (Tiers 1–4: Feature Coverage, Boundary/Corner, Cross-Feature, Real-World Workload). Publishes `TEST_READY.md`.
- Implementation Track Final Milestone executes Tier 1–4 verification followed by Phase 2 Adversarial Coverage Hardening (Tier 5).

## Code Layout
- `src/components/ui/`: UI primitives (`adaptive-dialog.tsx`, `dialog.tsx`, `drawer.tsx`, `card.tsx`, `button.tsx`, `switch.tsx`, `tabs.tsx`, `slider.tsx`, `badge.tsx`, `label.tsx`).
- `src/components/dashboard/`: Dashboard components (`InteractiveTabPager.tsx`, `HomeHeader.tsx`, `MonthlyCalendar.tsx`, `ExpenseChart.tsx`).
- `src/components/layout/`: Layout components (`PageTransition.tsx`, `MobileBottomNav.tsx`).
- `src/components/expenses/`: (`RecentExpenses.tsx`, `ExpenseForm.tsx`).
- `src/components/settings/`: (`PeopleSettingsView.tsx`, `BusinessSettingsView.tsx`).
- `src/components/auth/`: (`PasskeySettings.tsx`, `BiometricOnboardingModal.tsx`).
- `src/hooks/`: (`useHaptics.ts`, `useNavigationDirection.ts`, `useScrollRestoration.ts`, `useSheetManager.ts`, `useVirtualKeyboard.ts`, `useNativeThemeSync.ts`, `useMediaQuery.ts`).
- `src/lib/`: (`backButtonManager.ts`, `utils.ts`).
- `src/pages/`: (`Home.tsx`, `AICenter.tsx`, `Settings.tsx`).
- `tests/`: Automated Vitest & Playwright test suites.

## Interface Contracts
### AdaptiveDialog Contract
- Props: Extends `DialogProps` + `snapPoints?: (number|string)[]`, `activeSnapPoint?: number|string|null`, `setActiveSnapPoint?: (snapPoint: number|string|null) => void`, `showGrabber?: boolean`.
- Behavior: Renders Vaul `Drawer` when viewport < 768px; Radix `Dialog` when >= 768px.
- Back Button: Automatically registers with `BackButtonManager` when `open === true`.

### InteractiveTabPager Contract
- Props: `activeTab: HomeTab`, `onTabChange: (tab: HomeTab) => void`, `tabOrder?: HomeTab[]`, `children: Record<HomeTab, React.ReactNode>`.
- Touch Physics: Embla Carousel with `direction: "rtl"`, `loop: false`, `duration: 25`, `inViewThreshold: 0.7`.
- Gesture Isolation: Ignores drag events originating from `.no-swipe, .recharts-wrapper, input, textarea, select, [data-no-swipe]`.

### Spatial Navigation Contract
- RTL Forward navigation: enters from LEFT (`x: "-100%"` -> `0%`), pops back to LEFT (`0%` -> `"-100%"`).
- Background screen receives 20% parallax shift and subtle opacity dimming.
