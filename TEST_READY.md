# TEST_READY.md — SmartSpend AI Mobile Dashboard & AI Recording Input Re-architecture

## Overview
Comprehensive autonomous multi-viewport E2E mobile audit suite implemented in `tests/e2e/mobile-dashboard-ai-recording.spec.ts`.

---

## 1. Test Runner Commands

### Run Full Mobile E2E Test Suite
```bash
# Run all mobile dashboard & AI recording tests across all mobile viewports
npx playwright test tests/e2e/mobile-dashboard-ai-recording.spec.ts

# Run specifically for iPhone 14 (390x844)
npx playwright test tests/e2e/mobile-dashboard-ai-recording.spec.ts --project="iPhone 14"

# Run specifically for Android Chrome Pixel 7 (412x915)
npx playwright test tests/e2e/mobile-dashboard-ai-recording.spec.ts --project="Android Chrome Pixel 7"

# Run in UI / interactive mode
npx playwright test tests/e2e/mobile-dashboard-ai-recording.spec.ts --ui
```

### Full Monorepo Typecheck & Vitest Verification
```bash
# Monorepo type check
npm run check

# Full Vitest test suite (74 test suites, 458+ tests)
npm run test
```

---

## 2. Multi-Viewport Matrix

| Project Name | Viewport Dimensions | Device Scale Factor | Touch / Mobile | User Agent |
| :--- | :--- | :--- | :--- | :--- |
| **iPhone 14** | `390 × 844` | `3.0` | Enabled | `iPhone OS 16_0 (Safari)` |
| **Android Chrome Pixel 7** | `412 × 915` | `2.6` | Enabled | `Android 14 (Chrome Mobile)` |
| **iPhone 16 Pro** | `393 × 852` | `3.0` | Enabled | `iPhone OS 18_0 (Safari)` |

---

## 3. Four-Tier Test Inventory

| Tier | Test ID | Description | Primary Invariants Verified |
| :--- | :--- | :--- | :--- |
| **Tier 1: Feature Coverage** | `T1.1` | Fluid Morphing AI Discovery Banner | Smooth expand/collapse, `✨ تسجيل ذكي` inline badge, zero dead whitespace. |
| **Tier 1: Feature Coverage** | `T1.2` | Contextual Dynamic Recording State | Elimination of static "الحالة: جاهز", dynamic waveform pill rendered during active recording. |
| **Tier 1: Feature Coverage** | `T1.3` | Top Financial Metrics & Streak Compaction | `StreakCounter` in header title bar, compact summary chips (`py-2 px-3`), streamlined subtitle. |
| **Tier 1: Feature Coverage** | `T1.4` | Thumb-Zone Action Bar Elevation | Elevated action buttons (mic, camera, submit) within thumb reach. |
| **Tier 2: Boundary & Corner Cases** | `T2.1` | Long Arabic Business Titles | Zero clipping or title bar layout breaking with extended Arabic business names. |
| **Tier 2: Boundary & Corner Cases** | `T2.2` | Rapid Collapse/Expand Toggling | Rapid consecutive toggle clicks (4x in <300ms) without layout jitter or broken layout. |
| **Tier 2: Boundary & Corner Cases** | `T2.3` | Immediate Recording Cancellation | Sub-100ms record/cancel cycle resets state cleanly to idle. |
| **Tier 2: Boundary & Corner Cases** | `T2.4` | Multi-line Textarea Input | Textarea expansion handles multi-line verbose Arabic input while preserving action bar access. |
| **Tier 3: Cross-Feature Combinations** | `T3.1` | Collapsed Banner + Active Recording | Waveform pill expansion occurs smoothly even when discovery banner is collapsed. |
| **Tier 3: Cross-Feature Combinations** | `T3.2` | Theme Toggle Preservation | Dark and Light theme toggle maintains component contrast and visual geometry. |
| **Tier 3: Cross-Feature Combinations** | `T3.3` | Dynamic Viewport Resizing | Seamless responsiveness between 390x844 (iPhone 14) and 412x915 (Pixel 7). |
| **Tier 4: Real-World Scenarios** | `T4.1` | Cumulative Layout Shift (CLS) Audit | `PerformanceObserver` verifies CLS score remains strictly $\le 0.05$ across interaction lifecycles. |
| **Tier 4: Real-World Scenarios** | `T4.2` | Above-the-Fold Visibility | `RecentExpenses` transaction list starts within usable viewport height without initial scrolling. |
| **Tier 4: Real-World Scenarios** | `T4.3` | Zero Horizontal Clipping | Evaluates `scrollWidth <= innerWidth` and asserts zero DOM elements extend beyond right edge. |
| **Tier 4: Real-World Scenarios** | `T4.4` | Zero Console Errors & PageErrors | 100% zero runtime unhandled exceptions or error logs captured during mobile session. |

---

## 4. Test Infrastructure Integration
- Uses `tests/fixtures/mobile-fixtures.ts` for authenticated context, RTL Arabic Egyptian locale (`ar-EG`), Cairo timezone (`Africa/Cairo`), and console error trapping.
- Injects mock `getUserMedia` and `AudioContext` media streams for headless browser audio testing.
- Tracks `PerformanceObserver` layout shifts continuously across lifecycle events.
