# Orchestrator Execution Plan: Mobile Dashboard & AI Recording Input Re-architecture

## Objective
Re-architect the SmartSpend AI mobile dashboard visual hierarchy and AI recording input card to maximize above-the-fold information density, streamline thumb-zone interactions, ensure fluid framer-motion morphing discovery banners, and contextually reflect dynamic recording states.

## Phased Approach
1. **Survey Phase**:
   - Dispatch 3 parallel Explorers:
     - Explorer 1: Deep dive into `src/components/expenses/ExpenseForm.tsx` (framer-motion banner, recording states, waveform pill, textarea layout, responsive classes).
     - Explorer 2: Deep dive into `src/pages/Home.tsx` and related components (`StreakCounter`, `SummaryChip`, financial pills, mobile padding, header layout).
     - Explorer 3: Deep dive into testing infra, Playwright setup, mobile viewports (390x844 iPhone 14 Pro, 412x915 Pixel 7), Vitest test suite (`npm run test`), and TypeScript type checking (`npm run check`).
2. **Decomposition & Setup**:
   - Synthesize explorer reports into `PROJECT.md`.
   - Setup E2E Testing Track for Playwright Multi-Viewport Mobile Audits.
3. **Implementation Track**:
   - Implement Header & Financial Metric Compaction (`Home.tsx`).
   - Implement Fluid Morphing AI Discovery Banner & Dynamic Waveform Recording State (`ExpenseForm.tsx`).
   - Elevate Thumb-Zone Action Bar and optimize viewport space.
4. **Verification & Audit**:
   - Run Playwright E2E mobile tests on 390x844 & 412x915.
   - Reviewer, Challenger, and Forensic Auditor verification loop.
5. **Reporting**:
   - Synthesize results and report victory to parent.
