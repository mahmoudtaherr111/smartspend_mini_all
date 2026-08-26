## 2026-08-25T09:11:33Z

Objective: Implement Milestone 1 (Requirement R1: True Edge-to-Edge Standalone PWA on iOS & Android).

Your Exclusive File Ownership:
- `index.html`
- `vite.config.ts` (manifest background/theme colors)
- `src/index.css` (safe-area utilities, layout rules, color variables)
- `src/components/layout/PullToRefreshWrapper.tsx`
- `src/pages/Landing.tsx`
- `src/pages/Login.tsx`
- `src/pages/Privacy.tsx`
- `src/pages/Terms.tsx`
- `src/pages/Admin.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/App.tsx` (route-aware `pb-nav-safe` application & ambient mesh flow)

Concrete Requirements to Implement:
1. Viewport & Manifest:
   - Ensure `index.html` has `viewport-fit=cover`, `100dvh`, and `apple-mobile-web-app-status-bar-style: black-translucent`.
   - Synchronize cold-boot darkness: manifest `background_color`, `index.html` theme-color, and CSS background to `#090d16`.
2. CSS Utilities in `src/index.css`:
   - Consolidate and deduplicate `.pt-safe`, `.pb-safe`, `.pb-nav-safe` with standardized calculations (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).
3. Safe Area Inset Hardening:
   - In `src/App.tsx`, apply `pb-nav-safe` to all 6 active bottom-nav routes (`/dashboard`, `/ai`, `/settings`, `/support`, `/pro`, `/bank-sync`) so `/ai` chat composer and bottom views are never occluded.
   - Add `pt-safe` and `pb-safe` to headers and containers in `Landing.tsx`, `Login.tsx`, `Privacy.tsx`, `Terms.tsx`, `Admin.tsx`, and `Sidebar.tsx`.
4. Mesh Background Transparency:
   - Remove solid `bg-background` fills in `PullToRefreshWrapper.tsx` (use `bg-transparent`) and sub-views to let the root `.ambient-glow` mesh flow continuously behind Dynamic Island / Notch and Home Indicator.

Verification:
- Run `npm run check` (`tsc -b`) to verify 0 TypeScript errors.
- Run `npm run test` (`vitest run`) to verify all existing tests pass.
- Write your detailed implementation report and test results to: `E:\smartspend_V1_fixed\.agents\teamwork_preview_worker_m1\handoff.md`
- Send a message to parent when complete.
