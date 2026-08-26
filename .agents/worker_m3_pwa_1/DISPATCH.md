## 2026-08-25T03:18:00Z
You are worker_m3_pwa_1.
Your working directory is E:\smartspend_V1_fixed\.agents\worker_m3_pwa_1\ (metadata only, no source files).
The workspace root is E:\smartspend_V1_fixed.
The constitution is E:\smartspend_V1_fixed\AGENTS.md.
The user request is E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md.
The project plan is E:\smartspend_V1_fixed\PROJECT.md.
The frontend survey report is E:\smartspend_V1_fixed\.agents\survey_frontend_r1_r2\handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission: Implement Milestone 3 (PWA-to-Native Parity & Shell Layout Hardening).

File Boundaries & Exclusive Ownership:
You own and edit ONLY:
- `src/App.tsx`
- `src/index.css`
- `src/hooks/use-mobile.ts`
- `src/pages/Home.tsx`

Tasks:
1. `src/App.tsx`:
   - Fix main container safe padding condition. Ensure `pb-nav-safe` is applied whenever `MobileBottomNav` is visible across all `visibleRoutes = ["/dashboard", "/settings", "/support", "/pro", "/bank-sync", "/ai"]` (not just on `/dashboard` when `!isKeyboardOpen`).
   - Clean up duplicate keyboard listeners if redundant.
2. `src/index.css`:
   - Deduplicate `.pb-safe` and `.pt-safe` rules.
   - Add `.pl-safe`, `.pr-safe`, `.px-safe` horizontal safe area utilities:
     `.pl-safe { padding-left: max(1rem, env(safe-area-inset-left)); }`
     `.pr-safe { padding-right: max(1rem, env(safe-area-inset-right)); }`
     `.px-safe { padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right)); }`
   - Define iOS 26 Liquid Glass utility classes and specular rim gradients (`.liquid-glass-sheet`, `.liquid-glass-card`, `.specular-rim`).
3. `src/hooks/use-mobile.ts`:
   - Update `MOBILE_BREAKPOINT` to `1024` (`lg`) to synchronize with the application shell responsive layout.
4. `src/pages/Home.tsx`:
   - Correct RTL swipe gesture directionality: in RTL mode, `deltaX < 0` (leftward swipe) advances tabs (`currentIndex + 1`), and `deltaX > 0` (rightward swipe) recedes tabs (`currentIndex - 1`).

Verification:
- Run `npm run check` (TypeScript typecheck).
- Run `npm test` or relevant test suites to ensure 0 regressions.

Output:
Write a comprehensive handoff report to E:\smartspend_V1_fixed\.agents\worker_m3_pwa_1\handoff.md detailing all modifications and verification results.
Send a completion message back to parent when finished.
