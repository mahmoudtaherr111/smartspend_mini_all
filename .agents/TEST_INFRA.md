# E2E Test Infra: SmartSpend AI Edge-Case & State-Machine Verification

## Test Philosophy
- Multi-tier opaque-box and state-machine validation derived directly from `ORIGINAL_REQUEST.md`.
- Methodologies: State-machine edge cases, concurrency stress testing, offline cache reconciliation, viewport geometry invariant checks.

## Feature Inventory & Test Matrix
| # | Feature Area | Target Spec | Tier 1 (Isolated) | Tier 2 (Boundary/Edge) | Tier 3 (Cross-Domain) | Tier 4 (Workload) |
|---|--------------|-------------|:-----------------:|:----------------------:|:---------------------:|:------------------:|
| 1 | Voice & Audio Recording | Zero-byte, permission rejection, tab switch, Whisper MIME | 5 | 5 | 3 | 2 |
| 2 | AI Streaming & Agent Interactivity | Abort signal race, 429 countdown backoff, RTL `<bdi>`, action CAS | 5 | 5 | 3 | 2 |
| 3 | Financial Mutations & Idempotency | `clientRequestId`, ACID pre-checks, double-tap lock, offline DLQ | 5 | 5 | 3 | 2 |
| 4 | PWA Viewport & Gestures | Keyboard shifts, PTR ancestor checks, haptic triggers, SW bypass | 5 | 5 | 3 | 2 |
| 5 | Auth & Multi-Tab Sync | BroadcastChannel events, 401 draft preservation, dual-user cache keys | 5 | 5 | 3 | 2 |

## Test Architecture
- Vitest suite runners in `tests/` and co-located `*.test.ts`.
- Mock-free state assertions for pure logic, deterministic mocks for WebRTC/MediaRecorder in headless environments.
