# Dispatch — E2E Testing Track

## Mission
Design and create the comprehensive 4-Tier opaque-box E2E test suite for SmartSpend AI Native Mobile Transformation per `PROJECT.md` and `ORIGINAL_REQUEST.md`.

## Scope & Deliverables
1. Create `TEST_INFRA.md` at project root documenting:
   - Test philosophy (opaque-box, requirement-driven)
   - 4-Tier test methodology (Tier 1: Feature Coverage >=5 per feature, Tier 2: Boundary & Corner >=5 per feature, Tier 3: Cross-Feature Interactions, Tier 4: Real-World Application Workloads)
   - Feature inventory test matrix.
2. Implement automated E2E test specifications under `tests/e2e/` (e.g. `tests/e2e/native-mobile-ux.spec.ts` and related unit tests in Vitest).
   - Test cases must cover:
     - Touch Physics & Tab Pager 1:1 finger tracking & momentum
     - Instant 0ms button active states & scroll cancellation
     - Pinch-to-zoom prevention & viewport stability
     - Spatial directional navigation transitions & backdrop parallax
     - Tab keep-alive & scroll restoration across routes
     - AdaptiveDialog / Vaul bottom sheets (grabber, snap detents, flick-to-dismiss)
     - Capacitor shell plugins, BackButtonManager, status bar sync, Safari accessory bar suppression
     - Multi-tier haptics engine (all 7 tiers + silent fallbacks)
     - GPU compositing & Cairo Arabic font metrics without clipping
3. Publish `TEST_READY.md` at project root with runner command, tier breakdown, and test matrix checklist.
4. Report back when `TEST_READY.md` is complete.
