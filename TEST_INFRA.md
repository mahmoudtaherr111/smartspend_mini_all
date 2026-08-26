# E2E Test Infra: SmartSpend AI Mobile Dashboard & AI Recording Input Re-architecture

## Test Philosophy
- Opaque-box, requirement-driven, and multi-viewport autonomous mobile auditing.
- Targets iPhone 14 Pro (`390x844`) and Android Pixel 7 (`412x915`).
- Validates 0 layout shifts (Cumulative Layout Shift < 0.05), 0 console errors, 0 element clipping, and above-the-fold visibility.

## Feature Inventory & Test Mapping
| # | Feature | Source | Tier 1 (Coverage) | Tier 2 (Boundary/Edge) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
|---|---------|--------|:-----------------:|:----------------------:|:----------------------:|:--------------------:|
| F1 | Fluid Morphing AI Discovery Banner | Request §1 | 5 cases | 5 cases | ✓ | ✓ |
| F2 | Contextual Dynamic Recording State | Request §2 | 5 cases | 5 cases | ✓ | ✓ |
| F3 | Top Financial Metrics & Streak Header Compaction | Request §3 | 5 cases | 5 cases | ✓ | ✓ |
| F4 | Thumb-Zone Action Bar & Above-Fold Elevation | Request §4 | 5 cases | 5 cases | ✓ | ✓ |
| F5 | Multi-Viewport Mobile Auditing (CLS/Errors) | Request §5 | 5 cases | 5 cases | ✓ | ✓ |

## Test Architecture
- **Runner**: Playwright (`npx playwright test tests/e2e/mobile-dashboard-ai-recording.spec.ts`)
- **Projects**: `"iPhone 14"` (390x844), `"Android Chrome Pixel 7"` (412x915)
- **Fixtures**: `tests/fixtures/mobile-fixtures.ts` with authenticated mock environment, Cairo timezone, RTL locale (`ar-EG`), dark mode.
- **Auditing Assertions**:
  1. PerformanceObserver CLS measurement (< 0.05).
  2. Window console error / pageerror listeners (0 errors allowed).
  3. Bounding box coordinates math (`y` position of Recent Expenses relative to viewport fold).
  4. Framer-motion layout animation height verification (`scrollHeight` -> 0 on collapse).
  5. Dynamic recording waveform rendering during recording states.
