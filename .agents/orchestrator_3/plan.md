# Plan — SmartSpend AI System-Wide Audit, Edge-Case Discovery & Resilient Implementation

## Goal
Orchestrate the end-to-end edge-case discovery, state-machine hardening, and production-grade resilient implementation across SmartSpend AI platform (Web & PWA) as requested in `ORIGINAL_REQUEST.md`.

## Structure & Phases

### Phase 0: Survey & Current State Mapping (3 Explorers in Parallel)
- **Explorer 1 (Voice & Audio)**: Audit voice recorder hooks, MediaRecorder lifecycle, zero-length audio detection, permission handling, audio codec fallbacks, tab visibility change cleanup, and backend whisper/audio endpoints.
- **Explorer 2 (AI Streaming & Agent Interaction)**: Audit AI streaming hooks, AbortController lifecycle, rate limit backoff, RTL stream markdown chunking, token estimation, timeout recovery, and pending action cards.
- **Explorer 3 (Mutations, PWA, Auth & Testing)**: Audit financial mutations idempotency, double-tap prevention, offline cache sync, virtual keyboard stability, auth multi-tab sync, existing unit/e2e test suites, and audit doc requirements.

### Phase 1: Synthesis & Decomposition (`PROJECT.md` & `TEST_INFRA.md`)
- Merge feature inventory from Survey phase.
- Establish clean architectural milestones with strict file boundaries and interface contracts.
- Formulate test design (Tiers 1-4).

### Phase 2: Implementation & E2E Testing Track (Parallel Workers)
- **Milestone 1 (Voice & Audio State Machine)**: Remediate all audio recorder edge cases, tab backgrounding listeners, rapid toggling, upload timeouts, and zero-byte audio guards.
- **Milestone 2 (AI Streaming & Agent Interaction)**: Remediate abort controllers, network drop recovery, exponential rate limit backoff with Arabic error toasts, smooth markdown RTL rendering.
- **Milestone 3 (Financial Ledger & Mutations)**: Remediate idempotency keys (`clientRequestId`), double-tap button disablement, optimistic cache rollbacks, offline queue sync.
- **Milestone 4 (PWA & Mobile-First UX)**: Remediate visual viewport resize listeners, keyboard layout shifts, pull-to-refresh overscroll isolation, haptic feedback triggers.
- **Milestone 5 (Auth & Multi-Tab Synchronization)**: Remediate BroadcastChannel / storage event session sync, proactive refresh before expiry, dual user consistency.
- **E2E Testing Track**: Build comprehensive automated unit & integration test suites covering edge cases and regression scenarios.

### Phase 3: Multi-Agent Verification Gate & Audit
- Reviewers (2) objectively review code quality, edge cases, and backward compatibility.
- Challengers (2) empirically verify stress handling, race conditions, and error recovery.
- Forensic Auditor (1) checks for genuine logic, zero hardcoded mocks, zero dummy shortcuts.

### Phase 4: Monorepo Validation & Exhaustive Documentation
- Ensure `npm run check` passes with 0 errors.
- Ensure all Vitest unit and integration tests pass with 100% success rate.
- Author exhaustive, publication-grade technical audit document in `docs/LOGICAL_EDGE_CASES_AUDIT.md`.
