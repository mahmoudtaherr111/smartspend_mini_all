# Master Orchestration Plan: Native Mobile Grade Transformation (R1-R6)

## 1. Objectives & Scope
Transform SmartSpend AI into an uncompromising 100% native-grade mobile application matching iOS Swift / Flutter fidelity with zero regressions across Web, PWA, and Capacitor:
- **R1: Native Touch Physics & Interactive Tab Pager** (1:1 finger tracking, continuous carousel, spring physics, instant 0ms button active state without scroll stickiness, disable pinch-to-zoom).
- **R2: Spatial Navigation Transitions & Tab State Preservation** (hardware-accelerated slide transitions, scroll offset & sub-component state retention).
- **R3: Universal Native Bottom Sheet Architecture** (Vaul/native sheets for mobile modals/dialogs, grabber handle, snap detents, flick-to-dismiss).
- **R4: Capacitor Shell, Hardware Plugins & Native Lifecycle** (@capacitor/status-bar, @capacitor/splash-screen, @capacitor/keyboard, @capacitor/app, Android back button handler, theme sync, Safari accessory bar suppression).
- **R5: Multi-Tier Micro-Haptics Engine** (tactile feedback across switches, segmented controls, tab selections, bottom sheet detents, pull-to-refresh, swipe-to-delete with silent fallbacks).
- **R6: Rendering Optimization, Viewport Stability & Arabic Typography** (GPU compositing optimization, viewport stability during virtual keyboard changes, eliminate FOUT, fix Cairo font bounding-box clipping for Arabic glyphs).

## 2. Orchestration Phases
### Phase 0: Survey & Codebase Investigation
- Spawn 3 parallel Explorers to survey:
  1. Explorer 1: Touch physics, tab pager carousel, button active states, pinch-to-zoom, and haptics engine (R1, R5).
  2. Explorer 2: Navigation architecture, page transitions, tab state preservation, and modal/bottom sheet architecture (R2, R3).
  3. Explorer 3: Capacitor configuration & plugins, native lifecycle (back button/status bar/keyboard), rendering/CSS compositing, viewport stability, and typography/Cairo font clipping (R4, R6).
- Synthesize reports into `PROJECT.md` Feature Inventory & Architecture.

### Phase 1: Dual Track Initialization
- Track A: E2E Test Suite Creation via `teamwork_preview_test_writer` / `teamwork_preview_challenger` (`TEST_INFRA.md` & `TEST_READY.md`).
- Track B: Milestone Implementation Track.

### Phase 2: Milestone Iteration Loops (Direct / Sub-orchestrator)
Each milestone follows:
1. 3 Explorers analyze specific milestone scope & previous failures (if any).
2. 1 Worker implements isolated code changes + runs tests.
3. 2 Reviewers independently review code, test results, and contract adherence.
4. 2 Challengers adversarially stress-test edge cases & gesture performance.
5. 1 Forensic Auditor verifies zero cheating / genuine implementation.
6. Gate evaluation & pass/fail resolution.

### Phase 3: Final E2E Suite Pass, Adversarial Coverage Hardening & Victory Report
- Run 100% E2E tests across Tiers 1-4.
- Tier 5 Adversarial Coverage Hardening.
- Comprehensive report and victory claim to user.
