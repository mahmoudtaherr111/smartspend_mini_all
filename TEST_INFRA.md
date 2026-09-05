# E2E Test Infra: SmartSpend AI Mobile Fidelity

## Test Philosophy
- Opaque-box, requirement-driven mobile fidelity verification.
- Testing across 4 tiers: Feature Coverage (Tier 1), Boundary & Corner Cases (Tier 2), Cross-Feature Interactions (Tier 3), Real-World Application Workloads (Tier 4).

## Feature Inventory & Target Coverage
| # | Feature Area | Requirement Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|--------------|--------------------|:------:|:------:|:------:|:------:|
| 1 | Polymorphic AdaptiveDialog | ORIGINAL_REQUEST §1, Survey 2 | ≥5 | ≥5 | ✓ | ✓ |
| 2 | LIFO BackButtonManager | ORIGINAL_REQUEST §1, Survey 3 | ≥5 | ≥5 | ✓ | ✓ |
| 3 | Continuous 1:1 InteractiveTabPager | ORIGINAL_REQUEST §2, Survey 1 | ≥5 | ≥5 | ✓ | ✓ |
| 4 | Pointer Capture & Gesture Isolation (.no-swipe) | ORIGINAL_REQUEST §2, Survey 1 | ≥5 | ≥5 | ✓ | ✓ |
| 5 | Directional Spatial Route Transitions | ORIGINAL_REQUEST §3, Survey 2 | ≥5 | ≥5 | ✓ | ✓ |
| 6 | Scroll Offset Restoration & Keep-Alive | ORIGINAL_REQUEST §3, Survey 2 | ≥5 | ≥5 | ✓ | ✓ |
| 7 | GPU Compositing & 60fps Scrolling | ORIGINAL_REQUEST §4, Survey 3 | ≥5 | ≥5 | ✓ | ✓ |
| 8 | Multi-Tier Micro-Haptics Engine | ORIGINAL_REQUEST §4, Survey 1 | ≥5 | ≥5 | ✓ | ✓ |
| 9 | Arabic Cairo Typography & Viewport | ORIGINAL_REQUEST §4, Survey 3 | ≥5 | ≥5 | ✓ | ✓ |

## Test Architecture
- Vitest unit/component tests (`tests/unit/*.test.ts`, `src/**/*.test.tsx`)
- Playwright mobile emulation tests (`tests/e2e/mobile-fidelity.spec.ts`)
- Verification Runner: `npm run check && npm run test`
